// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;

#[tauri::command]
fn write_batch_frame(data: Vec<u8>, path: String) -> Result<usize, String> {
    let target_path = Path::new(&path);
    if let Some(parent) = target_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories for {}: {}", path, e))?;
        }
    }
    fs::write(target_path, &data).map_err(|e| format!("Failed to write {}: {}", path, e))?;
    Ok(data.len())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![write_batch_frame])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_batch_frame() {
        let test_path = "/tmp/kc_native_unit_test.png".to_string();
        let test_data = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        let res = write_batch_frame(test_data.clone(), test_path.clone());
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), test_data.len());

        let read_back = fs::read(&test_path).expect("failed to read test file");
        assert_eq!(read_back, test_data);

        let _ = fs::remove_file(&test_path);
    }
}
