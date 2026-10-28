//! #1709 — a project folder, native half. The webview's projectFs (app/src/state/projectTauri.mjs) reaches the disk only
//! through these commands:
//!
//!   project_list_names(dir)                 one level of a folder the performer picked (for name collisions)
//!   project_make_folder(parent, name)       make KC1_Loot_<name>/ — refuses when anything by that name exists
//!   project_reachable(root)                 is the project folder there right now?
//!   project_list(root, rel)                 one level of a folder inside the project
//!   project_read(root, rel)                 one text file inside the project, capped
//!   project_write(root, rel, text, create)  atomic: temp sibling, fsync, then rename (or, with `create`, a link that
//!                                           fails if the target exists — never over another file)
//!   project_make_subfolder(root, rel)       a folder inside the project (idempotent)
//!   project_rename_folder(root, new_name)   rename the project folder within its parent — refuses an existing name
//!
//! Every `rel` is resolved inside the canonical root and refused if it leaves it (`..`, an absolute path, a symlink that
//! points elsewhere). Every failure is a returned message; one that means "the folder is not there" starts with
//! `unreachable:` so the JS side can pause and protect (Matt, #1567) instead of reporting a plain failure. Nothing here
//! deletes a file, and nothing writes outside the root it was handed.
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

/// A session file is a JSON composition; this is generous headroom, not a target.
pub const MAX_TEXT_BYTES: u64 = 32 * 1024 * 1024;
/// A listing stops here.
pub const MAX_NAMES: usize = 10_000;

#[derive(Serialize, Debug, PartialEq)]
pub struct Name {
    pub name: String,
    pub dir: bool,
}

const UNREACHABLE: &str = "unreachable:";

fn bad_path(p: &str) -> bool {
    p.is_empty() || p.len() > 4096 || p.contains('\0')
}

/// The canonical project (or parent) folder, or an `unreachable:` error.
fn folder(path: &str) -> Result<PathBuf, String> {
    if bad_path(path) {
        return Err("not a folder path".into());
    }
    let p = fs::canonicalize(path).map_err(|e| format!("{UNREACHABLE} {e}"))?;
    if !p.is_dir() {
        return Err(format!("{UNREACHABLE} not a folder"));
    }
    Ok(p)
}

/// One plain name (no separators, not `.` or `..`).
fn plain_name(name: &str) -> Result<(), String> {
    let mut comps = Path::new(name).components();
    match (comps.next(), comps.next()) {
        (Some(Component::Normal(_)), None)
            if !name.contains('/') && !name.contains('\0') && name.len() <= 255 =>
        {
            Ok(())
        }
        _ => Err("not a folder name".into()),
    }
}

/// `rel` as plain segments inside the project, or an error.
fn segments(rel: &str) -> Result<Vec<String>, String> {
    if rel.is_empty() || rel.len() > 512 || rel.contains('\0') {
        return Err("not a path inside the project".into());
    }
    let mut out = Vec::new();
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(s) => out.push(s.to_string_lossy().to_string()),
            _ => return Err("not a path inside the project".into()),
        }
    }
    if out.is_empty() {
        return Err("not a path inside the project".into());
    }
    Ok(out)
}

/// The parent folder of `rel` (canonical, inside `root`, a real directory) and the file name, for a write or a mkdir.
fn inside(root: &Path, rel: &str) -> Result<(PathBuf, String), String> {
    let segs = segments(rel)?;
    let (last, dirs) = segs.split_last().unwrap();
    let mut parent = root.to_path_buf();
    for d in dirs {
        parent.push(d);
    }
    let canon = fs::canonicalize(&parent).map_err(|_| "no such folder".to_string())?;
    if !canon.starts_with(root) || !canon.is_dir() {
        return Err("outside the project".into());
    }
    Ok((canon, last.clone()))
}

fn names_of(dir: &Path) -> Result<Vec<Name>, String> {
    let rd = fs::read_dir(dir).map_err(|e| format!("{UNREACHABLE} {e}"))?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        if out.len() >= MAX_NAMES {
            break;
        }
        let name = e.file_name().to_string_lossy().to_string();
        // a symlink is listed as what it is not: neither a folder we enter nor a file we read
        let dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(Name { name, dir });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn list_names(dir: &str) -> Result<Vec<Name>, String> {
    names_of(&folder(dir)?)
}

pub fn make_folder(parent: &str, name: &str) -> Result<String, String> {
    let parent = folder(parent)?;
    plain_name(name)?;
    let p = parent.join(name);
    // create_dir (not _all) fails when anything exists there: never merges into an existing folder
    fs::create_dir(&p).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            format!("{name} already exists")
        } else {
            format!("could not make the folder: {e}")
        }
    })?;
    Ok(p.to_string_lossy().to_string())
}

pub fn reachable(root: &str) -> bool {
    folder(root).is_ok()
}

pub fn list(root: &str, rel: &str) -> Result<Vec<Name>, String> {
    let root = folder(root)?;
    let (parent, last) = inside(&root, rel)?;
    let p = parent.join(last);
    match fs::symlink_metadata(&p) {
        Ok(m) if m.file_type().is_dir() => names_of(&p),
        _ => Err("no such folder".into()),
    }
}

pub fn read(root: &str, rel: &str) -> Result<String, String> {
    let root = folder(root)?;
    let (parent, last) = inside(&root, rel)?;
    let p = parent.join(last);
    let m = fs::symlink_metadata(&p).map_err(|_| "no such file".to_string())?;
    if !m.file_type().is_file() {
        return Err("not a file".into());
    }
    if m.len() > MAX_TEXT_BYTES {
        return Err(format!(
            "file too large ({} MB)",
            MAX_TEXT_BYTES / (1024 * 1024)
        ));
    }
    fs::read_to_string(&p).map_err(|e| format!("unreadable: {e}"))
}

/// Atomic write: the whole new text or the old file, never a torn one. `create` refuses an existing target.
pub fn write(root: &str, rel: &str, text: &str, create: bool) -> Result<(), String> {
    if text.len() as u64 > MAX_TEXT_BYTES {
        return Err(format!(
            "file too large ({} MB)",
            MAX_TEXT_BYTES / (1024 * 1024)
        ));
    }
    let root = folder(root)?;
    let (parent, last) = inside(&root, rel)?;
    let target = parent.join(&last);
    if let Ok(m) = fs::symlink_metadata(&target) {
        if !m.file_type().is_file() {
            return Err("not a file".into()); // a link or a folder in the way is never written through
        }
        if create {
            return Err(format!("{last} already exists"));
        }
    }
    let tmp = parent.join(format!(".{last}.kc-tmp-{}", std::process::id()));
    let res = (|| -> Result<(), String> {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("unwritable: {e}"))?;
        f.write_all(text.as_bytes())
            .map_err(|e| format!("unwritable: {e}"))?;
        f.sync_all().map_err(|e| format!("unwritable: {e}"))?;
        if create {
            // a hard link fails if the target appeared meanwhile: create never lands over another file
            fs::hard_link(&tmp, &target).map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    format!("{last} already exists")
                } else {
                    format!("unwritable: {e}")
                }
            })
        } else {
            fs::rename(&tmp, &target).map_err(|e| format!("unwritable: {e}"))
        }
    })();
    let _ = fs::remove_file(&tmp); // after a rename it is already gone; after a link it is the spare name
    if res.is_ok() {
        if let Ok(d) = fs::File::open(&parent) {
            let _ = d.sync_all(); // the rename itself, durable
        }
    } else if !root.is_dir() {
        return Err(format!("{UNREACHABLE} the project folder went away"));
    }
    res
}

pub fn make_subfolder(root: &str, rel: &str) -> Result<(), String> {
    let root = folder(root)?;
    let (parent, last) = inside(&root, rel)?;
    let p = parent.join(last);
    match fs::symlink_metadata(&p) {
        Ok(m) if m.file_type().is_dir() => Ok(()),
        Ok(_) => Err("something else is in the way".into()),
        Err(_) => fs::create_dir(&p).map_err(|e| format!("could not make the folder: {e}")),
    }
}

pub fn rename_folder(root: &str, new_name: &str) -> Result<String, String> {
    let root = folder(root)?;
    plain_name(new_name)?;
    let parent = root
        .parent()
        .ok_or_else(|| "the project folder has no parent".to_string())?;
    let to = parent.join(new_name);
    if fs::symlink_metadata(&to).is_ok() {
        return Err(format!("{new_name} already exists"));
    }
    fs::rename(&root, &to).map_err(|e| format!("could not rename: {e}"))?;
    Ok(to.to_string_lossy().to_string())
}

// ── commands: each runs off the main thread ──

macro_rules! blocking {
    ($what:expr, $body:expr) => {
        tauri::async_runtime::spawn_blocking(move || $body)
            .await
            .map_err(|e| format!("{} failed: {e}", $what))?
    };
}

#[tauri::command]
pub async fn project_list_names(dir: String) -> Result<Vec<Name>, String> {
    blocking!("list", list_names(&dir))
}
#[tauri::command]
pub async fn project_make_folder(parent: String, name: String) -> Result<String, String> {
    blocking!("make folder", make_folder(&parent, &name))
}
#[tauri::command]
pub async fn project_reachable(root: String) -> Result<bool, String> {
    blocking!("reachable", Ok::<bool, String>(reachable(&root)))
}
#[tauri::command]
pub async fn project_list(root: String, rel: String) -> Result<Vec<Name>, String> {
    blocking!("list", list(&root, &rel))
}
#[tauri::command]
pub async fn project_read(root: String, rel: String) -> Result<String, String> {
    blocking!("read", read(&root, &rel))
}
#[tauri::command]
pub async fn project_write(
    root: String,
    rel: String,
    text: String,
    create: bool,
) -> Result<(), String> {
    blocking!("write", write(&root, &rel, &text, create))
}
#[tauri::command]
pub async fn project_make_subfolder(root: String, rel: String) -> Result<(), String> {
    blocking!("make folder", make_subfolder(&root, &rel))
}
#[tauri::command]
pub async fn project_rename_folder(root: String, new_name: String) -> Result<String, String> {
    blocking!("rename", rename_folder(&root, &new_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Tmp(PathBuf);
    static UNIQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    impl Tmp {
        fn new(tag: &str) -> Tmp {
            let p = std::env::temp_dir().join(format!(
                "kc-project-{}-{}-{}",
                tag,
                std::process::id(),
                UNIQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
            ));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Tmp(fs::canonicalize(&p).unwrap())
        }
        fn s(&self) -> String {
            self.0.to_string_lossy().to_string()
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn make_folder_refuses_an_existing_name_and_never_merges() {
        let t = Tmp::new("mk");
        let p = make_folder(&t.s(), "KC1_Loot_A").unwrap();
        assert!(Path::new(&p).is_dir());
        assert!(make_folder(&t.s(), "KC1_Loot_A")
            .unwrap_err()
            .contains("already exists"));
        for bad in ["", "a/b", "..", ".", "/abs"] {
            assert!(make_folder(&t.s(), bad).is_err(), "{bad}");
        }
        let names = list_names(&t.s()).unwrap();
        assert_eq!(
            names,
            vec![Name {
                name: "KC1_Loot_A".into(),
                dir: true
            }]
        );
    }

    #[test]
    fn write_is_atomic_create_refuses_and_read_round_trips() {
        let t = Tmp::new("rw");
        let root = make_folder(&t.s(), "KC1_Loot_P").unwrap();
        make_subfolder(&root, "sessions").unwrap();
        make_subfolder(&root, "sessions").unwrap(); // idempotent
        write(&root, "sessions/P_01.kcproject", "one\n", true).unwrap();
        assert!(write(&root, "sessions/P_01.kcproject", "two\n", true)
            .unwrap_err()
            .contains("already exists"));
        assert_eq!(
            read(&root, "sessions/P_01.kcproject").unwrap(),
            "one\n",
            "create never lands over a file"
        );
        write(&root, "sessions/P_01.kcproject", "two\n", false).unwrap();
        assert_eq!(read(&root, "sessions/P_01.kcproject").unwrap(), "two\n");
        // no temp file is left behind
        let names: Vec<String> = list(&root, "sessions")
            .unwrap()
            .into_iter()
            .map(|n| n.name)
            .collect();
        assert_eq!(names, vec!["P_01.kcproject".to_string()]);
        assert!(read(&root, "sessions/nope").is_err());
        assert!(
            write(&root, "nofolder/x", "x", false).is_err(),
            "a missing folder is not made by a write"
        );
    }

    #[test]
    fn nothing_leaves_the_root() {
        let t = Tmp::new("esc");
        let root = make_folder(&t.s(), "KC1_Loot_R").unwrap();
        fs::write(t.0.join("outside.txt"), "keep").unwrap();
        for bad in [
            "../outside.txt",
            "/etc/passwd",
            "sessions/../../outside.txt",
            "./x",
            "",
        ] {
            assert!(write(&root, bad, "x", false).is_err(), "{bad}");
            assert!(read(&root, bad).is_err(), "{bad}");
        }
        assert_eq!(fs::read_to_string(t.0.join("outside.txt")).unwrap(), "keep");
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_is_never_followed_out_or_written_through() {
        let t = Tmp::new("link");
        let root = make_folder(&t.s(), "KC1_Loot_L").unwrap();
        let out = Tmp::new("link-out");
        fs::write(out.0.join("victim"), "keep").unwrap();
        std::os::unix::fs::symlink(&out.0, Path::new(&root).join("sessions")).unwrap();
        assert!(write(&root, "sessions/victim", "x", false).is_err());
        assert!(read(&root, "sessions/victim").is_err());
        std::os::unix::fs::symlink(out.0.join("victim"), Path::new(&root).join("file")).unwrap();
        assert!(write(&root, "file", "x", false).is_err());
        assert_eq!(fs::read_to_string(out.0.join("victim")).unwrap(), "keep");
    }

    #[test]
    fn a_missing_folder_is_unreachable_not_a_plain_failure() {
        let t = Tmp::new("gone");
        let root = make_folder(&t.s(), "KC1_Loot_G").unwrap();
        make_subfolder(&root, "sessions").unwrap();
        assert!(reachable(&root));
        fs::rename(&root, t.0.join("moved")).unwrap();
        assert!(!reachable(&root));
        for e in [
            write(&root, "sessions/G_01.kcproject", "x", false).unwrap_err(),
            read(&root, "sessions/G_01.kcproject").unwrap_err(),
            list(&root, "sessions").unwrap_err(),
            list_names(&root).unwrap_err(),
        ] {
            assert!(e.starts_with(UNREACHABLE), "{e}");
        }
        assert!(
            !Path::new(&root).exists(),
            "nothing was recreated at the old place"
        );
    }

    #[test]
    fn rename_refuses_an_existing_name() {
        let t = Tmp::new("ren");
        let a = make_folder(&t.s(), "KC1_Loot_A").unwrap();
        make_folder(&t.s(), "KC1_Loot_B").unwrap();
        assert!(rename_folder(&a, "KC1_Loot_B")
            .unwrap_err()
            .contains("already exists"));
        let c = rename_folder(&a, "KC1_Loot_C").unwrap();
        assert!(Path::new(&c).is_dir() && !Path::new(&a).exists());
        assert!(rename_folder(&c, "../x").is_err());
    }
}
