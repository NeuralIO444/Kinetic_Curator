// #1463 — build the kc-mind helper (Apple Intelligence, on-device) into the sidecar slot before tauri-build looks for
// it. helpers/kc-mind/build.sh never fails: without the macOS 26 SDK it builds a variant (or a shell stub) that reports
// "unavailable", and the app runs on the rules backend.
fn build_kc_mind() {
    let target = std::env::var("TARGET").unwrap_or_default();
    let out = format!("binaries/kc-mind-{}", target);
    println!("cargo:rerun-if-changed=helpers/kc-mind/main.swift");
    println!("cargo:rerun-if-changed=helpers/kc-mind/build.sh");
    if std::path::Path::new(&out).exists() {
        let src_newer = std::fs::metadata("helpers/kc-mind/main.swift").and_then(|m| m.modified()).ok();
        let out_time = std::fs::metadata(&out).and_then(|m| m.modified()).ok();
        if let (Some(s), Some(o)) = (src_newer, out_time) {
            if o >= s { return; }
        }
    }
    // build.sh says which helper it made (Foundation Models, unavailable variant, or shell stub): surface that line
    match std::process::Command::new("sh").arg("helpers/kc-mind/build.sh").arg(&out).output() {
        Ok(o) => {
            for line in String::from_utf8_lossy(&o.stdout).lines() {
                println!("cargo:warning={}", line);
            }
        }
        Err(e) => println!("cargo:warning=kc-mind helper did not build ({}); the app will run on the rules backend", e),
    }
}

fn main() {
    build_kc_mind();
    println!("cargo:rustc-link-lib=framework=CoreML");
    println!("cargo:rustc-link-lib=framework=CoreVideo");
    println!("cargo:rustc-link-lib=framework=CoreMedia");
    println!("cargo:rustc-link-lib=framework=AVFoundation");
    println!("cargo:rustc-link-lib=framework=ImageIO");
    println!("cargo:rustc-link-lib=framework=CoreGraphics");
    println!("cargo:rustc-link-lib=framework=Accelerate");
    tauri_build::build();
}
