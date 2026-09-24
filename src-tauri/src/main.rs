// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod metal;

use std::fs;
use std::path::Path;
use std::sync::Mutex;

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
        .manage(metal::MetalAppState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            write_batch_frame,
            metal::metal_init,
            metal::metal_step_boids,
            metal::metal_step_accum,
            metal::metal_get_stats,
            metal::metal_read_particles,
        ])
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

    #[test]
    fn test_metal_context_shared_memory() {
        use crate::metal::state::MetalContext;

        let width = 320u32;
        let height = 240u32;
        let particle_count = 128u32;

        let mut ctx = MetalContext::new(width, height, particle_count)
            .expect("Failed to create MetalContext on Apple Silicon");

        let stats = ctx.get_stats();
        assert!(!stats.device_name.is_empty(), "Device name must not be empty");
        assert!(stats.accum_buffer_bytes >= (width * height * 16) as usize);
        assert!(stats.boids_buffer_bytes > 0);

        // Verify shared memory pointers are accessible from CPU
        let accum_ptr = ctx.shared_accum_buffer.contents() as *mut f32;
        assert!(!accum_ptr.is_null(), "Accumulation buffer pointer must be non-null");

        let boids_ptr = ctx.shared_boids_buffer.contents() as *mut crate::metal::state::Particle;
        assert!(!boids_ptr.is_null(), "Boids buffer pointer must be non-null");

        // Verify initial particle state in shared memory
        unsafe {
            let p0 = *boids_ptr;
            assert!(p0.size > 0.0, "Particle 0 size must be non-zero");
        }

        // Test boids compute pass execution
        let boid_res = ctx.step_boids(0.016, 50.0, [160.0, 120.0], 500.0);
        assert!(boid_res.is_ok(), "Boids compute pass failed: {:?}", boid_res);

        // Test accum compute pass execution
        let accum_res = ctx.step_accum(0.95, [0.0, 0.0, 0.0, 1.0]);
        assert!(accum_res.is_ok(), "Accum compute pass failed: {:?}", accum_res);

        // Verify frame counter advanced
        let updated_stats = ctx.get_stats();
        assert_eq!(updated_stats.frame_counter, 1);
    }
}
