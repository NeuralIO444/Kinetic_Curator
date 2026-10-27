// mind — #1463 Mind 2: the bridge to the kc-mind sidecar (Apple Intelligence, on-device).
//
// The helper is a child process speaking newline-delimited JSON on stdin/stdout (helpers/kc-mind/main.swift): no
// socket, no port, no network. One process for the app's lifetime, started on first use and restarted if it dies.
// Requests carry an id; a reader thread hands each reply to whoever is waiting for that id. A caller that stops
// waiting (timeout) simply forgets its id; a late reply is dropped.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// The hard cap on one persona's answer (Matt, 2026-10-13: 200-400 ms; 300 chosen). The app may ask for less.
pub const MAX_ASK_MS: u64 = 300;
const STATUS_MS: u64 = 3000;

type Pending = Arc<Mutex<HashMap<u64, Sender<Value>>>>;

struct Proc {
    child: Child,
    stdin: ChildStdin,
}

pub struct MindHelper {
    proc_: Mutex<Option<Proc>>,
    pending: Pending,
    next_id: AtomicU64,
}

pub struct MindAppState(pub Arc<MindHelper>);

impl MindHelper {
    pub fn new() -> Self {
        MindHelper { proc_: Mutex::new(None), pending: Arc::new(Mutex::new(HashMap::new())), next_id: AtomicU64::new(1) }
    }

    /// Where tauri puts the sidecar: next to the app's own executable (dev and bundle alike).
    fn helper_path() -> Option<PathBuf> {
        if let Ok(p) = std::env::var("KC_MIND_HELPER") {
            return Some(PathBuf::from(p));
        }
        let exe = std::env::current_exe().ok()?;
        let p = exe.parent()?.join("kc-mind");
        if p.exists() { Some(p) } else { None }
    }

    fn spawn(&self) -> Result<Proc, String> {
        let path = Self::helper_path().ok_or_else(|| "helper not found next to the app".to_string())?;
        let mut child = Command::new(&path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("helper did not start: {}", e))?;
        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let pending = self.pending.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
                let Some(id) = v.get("id").and_then(|x| x.as_u64()) else { continue };
                if let Some(tx) = pending.lock().ok().and_then(|mut m| m.remove(&id)) {
                    let _ = tx.send(v);
                }
            }
        });
        Ok(Proc { child, stdin })
    }

    /// Send one request and wait up to `timeout` for its reply. None on timeout or a dead helper.
    pub fn request(&self, mut msg: Value, timeout: Duration) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        msg["id"] = json!(id);
        let (tx, rx) = channel();
        self.pending.lock().map_err(|_| "poisoned")?.insert(id, tx);
        let wrote = {
            let mut guard = self.proc_.lock().map_err(|_| "poisoned")?;
            let alive = match guard.as_mut() {
                Some(p) => matches!(p.child.try_wait(), Ok(None)),
                None => false,
            };
            if !alive {
                if let Some(old) = guard.take() { reap(old); } // #1747: reap the dead helper, never leave a zombie
                match self.spawn() {
                    Ok(p) => *guard = Some(p),
                    Err(e) => {
                        self.forget(id);
                        return Err(e);
                    }
                }
            }
            let p = guard.as_mut().unwrap();
            let line = format!("{}\n", msg);
            p.stdin.write_all(line.as_bytes()).and_then(|_| p.stdin.flush())
        };
        if let Err(e) = wrote {
            self.forget(id);
            // #1747: kill + wait — dropping a Child neither stops nor reaps it, so a still-running helper whose pipe
            // failed was orphaned, and every restart left one behind.
            if let Ok(mut g) = self.proc_.lock() { if let Some(old) = g.take() { reap(old); } }
            return Err(format!("helper write failed: {}", e));
        }
        match rx.recv_timeout(timeout) {
            Ok(v) => Ok(v),
            Err(_) => {
                self.forget(id);
                Err("timeout".into())
            }
        }
    }

    fn forget(&self, id: u64) {
        if let Ok(mut m) = self.pending.lock() { m.remove(&id); }
    }
}

/// #1747: stop and reap a helper process. Dropping `Child` does neither (std docs), so without this a helper whose
/// stdin write failed kept running, and a dead one stayed a zombie until the app quit.
fn reap(mut p: Proc) {
    drop(p.stdin); // close stdin first: the helper exits on EOF by itself
    let _ = p.child.kill();
    let _ = p.child.wait();
}

impl Drop for MindHelper {
    fn drop(&mut self) {
        if let Ok(mut g) = self.proc_.lock() {
            if let Some(p) = g.take() { reap(p); }
        }
    }
}

/// { available, model?, os?, reason? } — the capability check (macOS version + Apple Intelligence availability).
#[tauri::command]
pub async fn mind_status(state: tauri::State<'_, MindAppState>) -> Result<Value, String> {
    let helper = state.0.clone();
    // the wait blocks a thread, so it runs on the blocking pool, never on the main thread
    let r = tauri::async_runtime::spawn_blocking(move || helper.request(json!({ "op": "status" }), Duration::from_millis(STATUS_MS)))
        .await
        .map_err(|e| e.to_string())?;
    Ok(match r {
        Ok(mut v) => {
            if let Some(o) = v.as_object_mut() { o.remove("id"); }
            v
        }
        Err(e) => json!({ "available": false, "reason": e }),
    })
}

/// { reply, ms, error? } — one persona's answer, or reply null (timeout, error, unavailable). Never longer than
/// MAX_ASK_MS; the app's rules answer any bar this does not.
#[tauri::command]
pub async fn mind_ask(state: tauri::State<'_, MindAppState>, persona: String, context: Value, seed: u64, bar: i64, timeout_ms: Option<u64>) -> Result<Value, String> {
    let t = timeout_ms.unwrap_or(MAX_ASK_MS).clamp(20, MAX_ASK_MS);
    let started = std::time::Instant::now();
    let helper = state.0.clone();
    let msg = json!({ "op": "ask", "persona": persona, "context": context, "seed": seed, "bar": bar });
    let r = tauri::async_runtime::spawn_blocking(move || helper.request(msg, Duration::from_millis(t)))
        .await
        .map_err(|e| e.to_string())?;
    let waited = started.elapsed().as_millis() as u64;
    Ok(match r {
        Ok(mut v) => {
            if let Some(o) = v.as_object_mut() { o.remove("id"); }
            v
        }
        Err(e) => json!({ "reply": Value::Null, "error": e, "ms": waited }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_helper_is_unavailable_not_a_crash() {
        std::env::set_var("KC_MIND_HELPER", "/nonexistent/kc-mind");
        let h = MindHelper::new();
        let r = h.request(json!({ "op": "status" }), Duration::from_millis(50));
        assert!(r.is_err());
        std::env::remove_var("KC_MIND_HELPER");
    }

    #[test]
    fn the_cap_is_inside_the_decided_range() {
        assert!((200..=400).contains(&MAX_ASK_MS));
    }
}
