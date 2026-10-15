//! #1479 — the loot folder, native half. Three root-bound commands and nothing else:
//!
//!   loot_scan(root)        list the files under images/ audio/ palettes/ looks/ (path, size, mtime), sorted
//!   loot_hash(root, rel)   the SHA-256 of one file, streamed, never loaded whole
//!   loot_read(root, rel)   one file's bytes as base64 (a string, not a JSON array of numbers), capped
//!
//! Every path the webview names is resolved against the canonical root and refused if it leaves it: `..`, an absolute
//! path, a symlink that points elsewhere, a name outside the four subfolders. Nothing is written, moved or deleted: KC-1
//! references the artist's files in place. Nothing here panics on a bad folder; every failure is a returned message the
//! ingest log can show. The classification of what a file *is* lives in JS (src/loot/lootClassify.mjs); this side only
//! lists, hashes and reads.
use base64::Engine as _;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

/// The only subfolders KC-1 looks in (the folder contract). Anything else under the root is not ours.
pub const SUBFOLDERS: [&str; 4] = ["images", "audio", "palettes", "looks"];
/// The most a single read or hash will take. A bigger file is reported, not loaded.
pub const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
/// A scan stops here and says so, rather than listing a whole disk someone pointed it at.
pub const MAX_ENTRIES: usize = 20_000;
/// Folders nest at most this deep under a subfolder.
pub const MAX_DEPTH: usize = 12;

#[derive(Serialize, Debug, PartialEq)]
pub struct LootEntry {
    pub rel: String,
    pub size: u64,
    #[serde(rename = "mtimeMs")]
    pub mtime_ms: f64,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct LootSkip {
    pub rel: String,
    pub reason: String,
}

#[derive(Serialize, Debug)]
pub struct LootScan {
    /// false when the root itself could not be listed (an unmounted volume, a deleted folder): nothing is missing then
    pub reachable: bool,
    pub entries: Vec<LootEntry>,
    pub skipped: Vec<LootSkip>,
    /// true when MAX_ENTRIES was hit
    pub truncated: bool,
}

fn canonical_root(root: &str) -> Result<PathBuf, String> {
    if root.is_empty() || root.len() > 4096 || root.contains('\0') {
        return Err("not a folder path".into());
    }
    let p = fs::canonicalize(root).map_err(|e| format!("folder not reachable: {e}"))?;
    if !p.is_dir() {
        return Err("not a folder".into());
    }
    Ok(p)
}

/// Resolve `rel` under the canonical `root`, refusing anything that leaves it. The result is canonical (symlinks
/// resolved), so a link inside the folder that points outside is refused too.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() || rel.len() > 512 || rel.contains('\0') {
        return Err("unsafe name".into());
    }
    let rp = Path::new(rel);
    let mut first: Option<String> = None;
    for c in rp.components() {
        match c {
            Component::Normal(s) => {
                if first.is_none() {
                    first = Some(s.to_string_lossy().to_lowercase());
                }
            }
            _ => return Err("unsafe name".into()), // `..`, `.`, a root, a drive prefix
        }
    }
    match first {
        Some(f) if SUBFOLDERS.contains(&f.as_str()) => {}
        _ => return Err("outside the loot subfolders".into()),
    }
    let full = fs::canonicalize(root.join(rp)).map_err(|e| format!("unreadable: {e}"))?;
    if !full.starts_with(root) {
        return Err("outside folder".into());
    }
    if !full.is_file() {
        return Err("not a file".into());
    }
    Ok(full)
}

fn mtime_ms(md: &fs::Metadata) -> f64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn walk(
    dir: &Path,
    rel: &str,
    depth: usize,
    out: &mut LootScan,
) {
    if depth > MAX_DEPTH {
        out.skipped.push(LootSkip { rel: rel.to_string(), reason: "folder nested too deep".into() });
        return;
    }
    let rd = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(e) => {
            out.skipped.push(LootSkip { rel: rel.to_string(), reason: format!("unreadable folder: {e}") });
            return;
        }
    };
    let mut kids: Vec<fs::DirEntry> = rd.filter_map(|e| e.ok()).collect();
    kids.sort_by_key(|k| k.file_name());
    for k in kids {
        if out.entries.len() >= MAX_ENTRIES {
            out.truncated = true;
            return;
        }
        let name = k.file_name().to_string_lossy().to_string();
        let child_rel = format!("{rel}/{name}");
        // symlink_metadata: do not follow. A link is reported, never read through.
        let md = match fs::symlink_metadata(k.path()) {
            Ok(m) => m,
            Err(e) => {
                out.skipped.push(LootSkip { rel: child_rel, reason: format!("unreadable: {e}") });
                continue;
            }
        };
        let ft = md.file_type();
        if ft.is_symlink() {
            out.skipped.push(LootSkip { rel: child_rel, reason: "symlink (not followed)".into() });
        } else if ft.is_dir() {
            walk(&k.path(), &child_rel, depth + 1, out);
        } else if ft.is_file() {
            out.entries.push(LootEntry { rel: child_rel, size: md.len(), mtime_ms: mtime_ms(&md) });
        }
    }
}

/// The scan itself: pure of Tauri, so it can be tested on a temp folder.
pub fn scan(root: &str) -> LootScan {
    let mut out = LootScan { reachable: false, entries: vec![], skipped: vec![], truncated: false };
    let root = match canonical_root(root) {
        Ok(r) => r,
        Err(_) => return out,
    };
    out.reachable = true;
    // case-insensitive subfolder names (a Mac volume is usually case-insensitive): list the root once and match
    let top = match fs::read_dir(&root) {
        Ok(r) => r,
        Err(e) => {
            out.reachable = false;
            out.skipped.push(LootSkip { rel: String::new(), reason: format!("unreadable folder: {e}") });
            return out;
        }
    };
    let mut tops: Vec<fs::DirEntry> = top.filter_map(|e| e.ok()).collect();
    tops.sort_by_key(|k| k.file_name());
    for t in tops {
        let name = t.file_name().to_string_lossy().to_string();
        if !SUBFOLDERS.contains(&name.to_lowercase().as_str()) {
            continue;
        }
        match fs::symlink_metadata(t.path()) {
            Ok(m) if m.file_type().is_dir() => walk(&t.path(), &name, 1, &mut out),
            Ok(m) if m.file_type().is_symlink() => {
                out.skipped.push(LootSkip { rel: name, reason: "symlink (not followed)".into() })
            }
            _ => {}
        }
    }
    out.entries.sort_by(|a, b| a.rel.cmp(&b.rel));
    out
}

/// SHA-256 of a file, streamed in 64 KB chunks, refusing a file over `cap` bytes.
pub fn hash_path(path: &Path, cap: u64) -> Result<String, String> {
    let md = fs::metadata(path).map_err(|e| format!("unreadable: {e}"))?;
    if md.len() > cap {
        return Err(format!("file too large ({} MB)", md.len() / (1024 * 1024)));
    }
    let mut f = fs::File::open(path).map_err(|e| format!("unreadable: {e}"))?;
    let mut h = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    let mut total: u64 = 0;
    loop {
        let n = f.read(&mut buf).map_err(|e| format!("unreadable: {e}"))?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > cap {
            return Err("file too large".into()); // it grew while we read it
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// A file's bytes as base64, refusing one over `cap`.
pub fn read_b64(path: &Path, cap: u64) -> Result<String, String> {
    let md = fs::metadata(path).map_err(|e| format!("unreadable: {e}"))?;
    if md.len() > cap {
        return Err(format!("file too large ({} MB)", md.len() / (1024 * 1024)));
    }
    let bytes = fs::read(path).map_err(|e| format!("unreadable: {e}"))?;
    if bytes.len() as u64 > cap {
        return Err("file too large".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub async fn loot_scan(root: String) -> Result<LootScan, String> {
    tauri::async_runtime::spawn_blocking(move || scan(&root))
        .await
        .map_err(|e| format!("scan failed: {e}"))
}

#[tauri::command]
pub async fn loot_hash(root: String, rel: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = canonical_root(&root)?;
        let p = resolve(&root, &rel)?;
        hash_path(&p, MAX_FILE_BYTES)
    })
    .await
    .map_err(|e| format!("hash failed: {e}"))?
}

#[tauri::command]
pub async fn loot_read(root: String, rel: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = canonical_root(&root)?;
        let p = resolve(&root, &rel)?;
        read_b64(&p, MAX_FILE_BYTES)
    })
    .await
    .map_err(|e| format!("read failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// A fresh temp folder, removed on drop.
    struct Tmp(PathBuf);
    impl Tmp {
        fn new(tag: &str) -> Tmp {
            let p = std::env::temp_dir().join(format!("kc-loot-{}-{}-{}", tag, std::process::id(), UNIQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst)));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Tmp(fs::canonicalize(&p).unwrap())
        }
        fn file(&self, rel: &str, bytes: &[u8]) {
            let p = self.0.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::File::create(p).unwrap().write_all(bytes).unwrap();
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    static UNIQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

    #[test]
    fn sha256_known_vector() {
        let t = Tmp::new("hash");
        t.file("images/abc.svg", b"abc");
        let h = hash_path(&t.0.join("images/abc.svg"), MAX_FILE_BYTES).unwrap();
        assert_eq!(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        t.file("images/empty.svg", b"");
        assert_eq!(
            hash_path(&t.0.join("images/empty.svg"), MAX_FILE_BYTES).unwrap(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn scan_lists_only_the_four_subfolders_sorted_with_sizes() {
        let t = Tmp::new("scan");
        t.file("images/b.svg", b"12345");
        t.file("images/sub/a.svg", b"1");
        t.file("audio/loop.wav", b"RIFF");
        t.file("palettes/p.json", b"{}");
        t.file("notes/readme.txt", b"not ours");
        t.file("readme.txt", b"not ours");
        let s = scan(t.0.to_str().unwrap());
        assert!(s.reachable && !s.truncated);
        let rels: Vec<&str> = s.entries.iter().map(|e| e.rel.as_str()).collect();
        assert_eq!(rels, vec!["audio/loop.wav", "images/b.svg", "images/sub/a.svg", "palettes/p.json"]);
        assert_eq!(s.entries[1].size, 5);
        assert!(s.entries[1].mtime_ms > 0.0);
    }

    #[test]
    fn scan_of_a_missing_root_is_unreachable_not_a_panic() {
        let s = scan("/definitely/not/a/folder/kc-loot");
        assert!(!s.reachable && s.entries.is_empty());
        assert!(!scan("").reachable);
        assert!(!scan("bad\0path").reachable);
        let t = Tmp::new("file-root");
        t.file("a.txt", b"x");
        assert!(!scan(t.0.join("a.txt").to_str().unwrap()).reachable, "a file is not a folder");
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_reported_never_followed_and_cannot_escape() {
        use std::os::unix::fs::symlink;
        let outside = Tmp::new("outside");
        outside.file("secret.svg", b"<svg/>");
        let t = Tmp::new("link");
        t.file("images/real.svg", b"<svg/>");
        symlink(outside.0.join("secret.svg"), t.0.join("images/link.svg")).unwrap();
        symlink(&outside.0, t.0.join("images/dir")).unwrap();
        let s = scan(t.0.to_str().unwrap());
        let rels: Vec<&str> = s.entries.iter().map(|e| e.rel.as_str()).collect();
        assert_eq!(rels, vec!["images/real.svg"], "the links are not listed as files");
        assert!(s.skipped.iter().any(|k| k.rel == "images/link.svg" && k.reason.contains("symlink")));
        assert!(s.skipped.iter().any(|k| k.rel == "images/dir" && k.reason.contains("symlink")));
        // and a direct hash/read of the link is refused: it resolves outside the root
        assert_eq!(resolve(&t.0, "images/link.svg").unwrap_err(), "outside folder");
        assert!(resolve(&t.0, "images/real.svg").is_ok());
    }

    #[test]
    fn paths_that_leave_the_root_or_the_subfolders_are_refused() {
        let t = Tmp::new("resolve");
        t.file("images/a.svg", b"x");
        t.file("secret.txt", b"x");
        for bad in ["../x", "images/../../x", "/etc/passwd", "images/../secret.txt", "secret.txt", "", "images\0/a.svg", "./images/a.svg"] {
            assert!(resolve(&t.0, bad).is_err(), "{bad:?} must be refused");
        }
        assert!(resolve(&t.0, "IMAGES/a.svg").is_ok() || cfg!(not(target_os = "macos")), "case-insensitive on a case-insensitive volume");
        assert!(resolve(&t.0, "images/a.svg").is_ok());
        assert_eq!(resolve(&t.0, "images/nope.svg").unwrap_err().starts_with("unreadable"), true);
        assert_eq!(resolve(&t.0, "images").unwrap_err(), "not a file");
        assert!(resolve(&t.0, &"a/".repeat(300)).is_err(), "over-long");
    }

    #[test]
    fn a_file_over_the_cap_is_reported_not_loaded() {
        let t = Tmp::new("cap");
        t.file("audio/big.wav", &vec![7u8; 4096]);
        let p = t.0.join("audio/big.wav");
        assert!(hash_path(&p, 1024).unwrap_err().starts_with("file too large"));
        assert!(read_b64(&p, 1024).unwrap_err().starts_with("file too large"));
        assert!(hash_path(&p, 4096).is_ok());
        // 4096 bytes: ceil(4096 / 3) * 4 = 5464 base64 characters
        assert_eq!(read_b64(&p, 4096).unwrap().len(), 5464);
    }

    #[test]
    fn read_round_trips_bytes_as_base64() {
        let t = Tmp::new("b64");
        t.file("palettes/p.json", b"{\"a\":1}");
        let s = read_b64(&t.0.join("palettes/p.json"), MAX_FILE_BYTES).unwrap();
        let back = base64::engine::general_purpose::STANDARD.decode(s).unwrap();
        assert_eq!(back, b"{\"a\":1}");
    }

    #[test]
    fn the_entry_cap_is_honest_and_deep_folders_are_bounded() {
        let t = Tmp::new("deep");
        let mut rel = String::from("images");
        for i in 0..(MAX_DEPTH + 3) {
            rel.push_str(&format!("/d{i}"));
        }
        t.file(&format!("{rel}/deep.svg"), b"x");
        t.file("images/shallow.svg", b"x");
        let s = scan(t.0.to_str().unwrap());
        assert!(s.entries.iter().any(|e| e.rel == "images/shallow.svg"));
        assert!(!s.entries.iter().any(|e| e.rel.ends_with("deep.svg")), "beyond MAX_DEPTH is not listed");
        assert!(s.skipped.iter().any(|k| k.reason.contains("nested too deep")));
    }
}
