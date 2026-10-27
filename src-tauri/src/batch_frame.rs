//! #1742 — `write_batch_frame` used to write any absolute path the webview named. It now writes only under the
//! system temp folder (the one place its only caller, the DEV Native Lab, writes), with the same discipline as the
//! loot folder (`loot.rs`): no `..`/`.` components, the parent resolved with symlinks followed and checked against
//! the canonical root, and an existing target that is not a plain file refused.
use std::fs;
use std::path::{Component, Path, PathBuf};

/// The roots a batch frame may land under: the process temp dir and /tmp (on macOS these differ — $TMPDIR is a
/// per-user /var/folders path — and the Native Lab writes /tmp). Canonical, so /tmp → /private/tmp is handled.
pub fn allowed_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for r in [std::env::temp_dir(), PathBuf::from("/tmp")] {
        if let Ok(c) = fs::canonicalize(&r) {
            if !out.contains(&c) {
                out.push(c);
            }
        }
    }
    out
}

/// Resolve `path` for a write under one of `roots` (canonical). Creates missing parent folders only once the path
/// is known to sit under a root. Returns the target path (parent canonical + file name).
pub fn resolve_under(path: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    if path.is_empty() || path.len() > 4096 || path.contains('\0') {
        return Err("unsafe path".into());
    }
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err("path must be absolute".into());
    }
    if p.components().any(|c| matches!(c, Component::ParentDir | Component::CurDir)) {
        return Err("unsafe path".into());
    }
    let name = p.file_name().ok_or_else(|| "no file name".to_string())?;
    let parent = p.parent().ok_or_else(|| "no parent folder".to_string())?;
    // Lexical check first, against each root's canonical and as-given forms, so nothing is created outside a root.
    let lexical_ok = roots.iter().any(|r| parent.starts_with(r))
        || [std::env::temp_dir(), PathBuf::from("/tmp")].iter().any(|r| parent.starts_with(r));
    if !lexical_ok {
        return Err("batch frames are written under the temp folder only".into());
    }
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories for {}: {}", path, e))?;
    // Then the real check: symlinks resolved.
    let canon_parent = fs::canonicalize(parent).map_err(|e| format!("unwritable: {e}"))?;
    if !roots.iter().any(|r| canon_parent.starts_with(r)) {
        return Err("batch frames are written under the temp folder only".into());
    }
    let target = canon_parent.join(name);
    if let Ok(m) = fs::symlink_metadata(&target) {
        if !m.file_type().is_file() {
            return Err("target exists and is not a file".into());
        }
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("kc-batch-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        fs::canonicalize(&p).unwrap()
    }

    #[test]
    fn writes_under_temp_are_allowed_and_create_parents() {
        let d = tmp("ok");
        let target = d.join("a/b/frame.png");
        let r = resolve_under(target.to_str().unwrap(), &allowed_roots()).unwrap();
        assert!(r.ends_with("a/b/frame.png"));
        assert!(d.join("a/b").is_dir());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn paths_outside_temp_or_with_dots_are_refused() {
        let roots = allowed_roots();
        let home = std::env::var("HOME").unwrap_or_else(|_| "/home".into());
        for bad in [
            format!("{home}/.ssh/authorized_keys"),
            "/etc/kc.png".to_string(),
            "relative/frame.png".to_string(),
            format!("{}/../etc/x.png", std::env::temp_dir().display()),
            String::new(),
            "/tmp/a\0b.png".to_string(),
        ] {
            assert!(resolve_under(&bad, &roots).is_err(), "{bad:?} must be refused");
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_folder_under_temp_cannot_escape() {
        use std::os::unix::fs::symlink;
        let d = tmp("link");
        let outside = std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/"));
        symlink(&outside, d.join("out")).unwrap();
        let r = resolve_under(d.join("out/frame.png").to_str().unwrap(), &allowed_roots());
        assert!(r.is_err(), "a link pointing out of temp is refused");
        // and a symlink as the target itself is refused
        fs::write(d.join("real.png"), b"x").unwrap();
        symlink(d.join("real.png"), d.join("link.png")).unwrap();
        assert!(resolve_under(d.join("link.png").to_str().unwrap(), &allowed_roots()).is_err());
        let _ = fs::remove_dir_all(&d);
    }
}
