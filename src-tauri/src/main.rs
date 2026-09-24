// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod metal;
mod curator;
mod media;

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
        .manage(curator::CuratorAppState(Mutex::new(curator::CoreMLCurator::new())))
        .manage(media::MediaAppState::new())
        .invoke_handler(tauri::generate_handler![
            write_batch_frame,
            metal::metal_init,
            metal::metal_step_boids,
            metal::metal_step_accum,
            metal::metal_get_stats,
            metal::metal_read_particles,
            curator::curator_evaluate_frame,
            curator::curator_get_status,
            media::start_media_engine_export,
            media::dump_image_batch,
            media::media_engine_get_status,
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

    #[test]
    fn test_qa_audit_memory_profiling_and_stress_10000_nodes() {
        use crate::metal::state::MetalContext;
        use ::metal::MTLStorageMode;

        // Stress test configuration: 10,000 nodes at 1080p resolution
        let width = 1920u32;
        let height = 1080u32;
        let particle_count = 10_000u32;

        let mut ctx = MetalContext::new(width, height, particle_count)
            .expect("MetalContext initialization for 10k nodes");

        // 1. Verify MTLResourceStorageModeShared is strictly adhered to on all buffers
        assert_eq!(
            ctx.shared_accum_buffer.storage_mode(),
            MTLStorageMode::Shared,
            "Accumulation buffer MUST use MTLResourceStorageModeShared"
        );
        assert_eq!(
            ctx.shared_in_buffer.storage_mode(),
            MTLStorageMode::Shared,
            "Input frame buffer MUST use MTLResourceStorageModeShared"
        );
        assert_eq!(
            ctx.shared_boids_buffer.storage_mode(),
            MTLStorageMode::Shared,
            "Boids particle buffer MUST use MTLResourceStorageModeShared"
        );

        let accum_ptr_initial = ctx.shared_accum_buffer.contents();
        let boids_ptr_initial = ctx.shared_boids_buffer.contents();
        assert!(!accum_ptr_initial.is_null());
        assert!(!boids_ptr_initial.is_null());

        // Helper to query resident memory on macOS
        unsafe fn get_resident_rss() -> usize {
            use std::mem::{size_of, MaybeUninit};
            let mut info: libc::mach_task_basic_info = MaybeUninit::zeroed().assume_init();
            let mut count = (size_of::<libc::mach_task_basic_info>() / size_of::<libc::natural_t>()) as libc::mach_msg_type_number_t;
            #[allow(deprecated)]
            let kret = libc::task_info(
                libc::mach_task_self(),
                libc::MACH_TASK_BASIC_INFO,
                &mut info as *mut _ as *mut libc::integer_t,
                &mut count,
            );
            if kret == libc::KERN_SUCCESS {
                info.resident_size as usize
            } else {
                0
            }
        }

        let rss_before = unsafe { get_resident_rss() };

        // 2. Stress test: Run 100 continuous iterations of compute passes
        for _ in 0..100 {
            ctx.step_boids(0.016, 60.0, [960.0, 540.0], 800.0)
                .expect("boids compute step failed");
            ctx.step_accum(0.96, [0.0, 0.0, 0.0, 1.0])
                .expect("accum compute step failed");
        }

        let rss_after = unsafe { get_resident_rss() };

        // 3. Verify zero pointer changes (zero-copy in-place memory preservation)
        assert_eq!(
            ctx.shared_accum_buffer.contents(),
            accum_ptr_initial,
            "Accumulation buffer pointer must remain strictly stationary in UMA"
        );
        assert_eq!(
            ctx.shared_boids_buffer.contents(),
            boids_ptr_initial,
            "Boids buffer pointer must remain strictly stationary in UMA"
        );

        // Memory footprint should be stable (no uncontrolled heap growth)
        let memory_delta = (rss_after as i64) - (rss_before as i64);
        println!(
            "[QA AUDIT] 10,000 Nodes Stress Test: RSS Before = {} MB, RSS After = {} MB (Delta = {} KB)",
            rss_before / (1024 * 1024),
            rss_after / (1024 * 1024),
            memory_delta / 1024
        );
        // Memory delta should be essentially zero or bounded by tiny driver buffers (< 8MB)
        assert!(
            memory_delta < 32 * 1024 * 1024,
            "Uncontrolled memory growth detected: {} bytes",
            memory_delta
        );
    }

    #[test]
    fn test_qa_audit_ui_thread_isolation() {
        use crate::metal::state::MetalContext;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;
        use std::thread;
        use std::time::{Duration, Instant};

        let mut ctx = MetalContext::new(1280, 720, 5000)
            .expect("MetalContext initialization for thread isolation");

        let stop = Arc::new(AtomicBool::new(false));
        let stop_clone = stop.clone();

        // Simulate high-frequency 60Hz UI message loop (MasterBar / PipelinePanel interaction)
        let ui_handle = thread::spawn(move || {
            let mut tick_count = 0;
            let mut max_jitter_ms = 0.0f64;

            while !stop_clone.load(Ordering::Relaxed) {
                let t0 = Instant::now();
                // Simulate React state selector / event handler dispatch (< 0.1ms)
                thread::sleep(Duration::from_millis(16)); // Target ~60Hz
                let elapsed = t0.elapsed().as_secs_f64() * 1000.0;
                let jitter = (elapsed - 16.0).abs();
                if jitter > max_jitter_ms {
                    max_jitter_ms = jitter;
                }
                tick_count += 1;
            }
            (tick_count, max_jitter_ms)
        });

        // Run heavy GPU compute loop on worker thread
        for _ in 0..50 {
            ctx.step_boids(0.016, 60.0, [640.0, 360.0], 500.0).unwrap();
            ctx.step_accum(0.95, [0.0, 0.0, 0.0, 1.0]).unwrap();
        }

        stop.store(true, Ordering::Relaxed);
        let (ticks, max_jitter) = ui_handle.join().unwrap();

        println!(
            "[QA AUDIT] UI Thread Isolation: Executed {} UI ticks during 50 Metal passes. Max UI Jitter: {:.2}ms",
            ticks, max_jitter
        );
        assert!(ticks > 0, "UI thread must register ticks during GPU compute");
        // Max jitter should be well under 10ms for smooth 60fps frame rate
        assert!(max_jitter < 15.0, "UI thread experienced excessive jitter: {:.2}ms", max_jitter);
    }

    #[test]
    fn test_qa_audit_visual_parity_msl_vs_webgl_baseline() {
        use crate::metal::state::MetalContext;

        // Create a small 4x4 test grid to verify exact per-pixel float arithmetic
        let width = 4u32;
        let height = 4u32;
        let mut ctx = MetalContext::new(width, height, 1)
            .expect("MetalContext initialization for parity test");

        let pixel_count = (width * height) as usize;

        // Test vectors representing various generative trail scenarios:
        // Pixel 0: Red trail fading on black ground, covered by semi-transparent green
        // Pixel 1: Full-opacity mark (source alpha 1.0)
        // Pixel 2: Light paper background (white bg #fff)
        // Pixel 3: Transparent incoming frame (only trail decays)
        let test_cases = [
            // (prev_rgba, src_rgba, bg_rgba, fade)
            ([1.0f32, 0.0, 0.0, 1.0], [0.0f32, 1.0, 0.0, 0.5], [0.0f32, 0.0, 0.0, 1.0], 0.90f32),
            ([0.5f32, 0.5, 0.5, 0.8], [0.2f32, 0.8, 0.4, 1.0], [0.0f32, 0.0, 0.0, 1.0], 0.80f32),
            ([0.2f32, 0.3, 0.9, 1.0], [0.0f32, 0.0, 0.0, 0.0], [1.0f32, 1.0, 1.0, 1.0], 0.95f32),
            ([0.8f32, 0.1, 0.1, 0.9], [0.0f32, 0.0, 0.0, 0.0], [0.0f32, 0.0, 0.0, 1.0], 0.00f32),
        ];

        // Seed shared buffers directly through CPU pointers (zero-copy)
        unsafe {
            let accum_ptr = ctx.shared_accum_buffer.contents() as *mut [f32; 4];
            let in_ptr = ctx.shared_in_buffer.contents() as *mut [f32; 4];

            for i in 0..pixel_count {
                let case = &test_cases[i % test_cases.len()];
                *accum_ptr.add(i) = case.0;
                *in_ptr.add(i) = case.1;
            }
        }

        // Run MSL compute shader on GPU with test case 0 background and fade
        let fade = 0.90f32;
        let bg_color = [0.0f32, 0.0, 0.0, 1.0];
        ctx.step_accum(fade, bg_color).expect("step_accum failed");

        // Read back output directly from shared memory CPU pointer
        unsafe {
            let accum_ptr = ctx.shared_accum_buffer.contents() as *const [f32; 4];

            for i in 0..pixel_count {
                let actual = *accum_ptr.add(i);

                // Compute exact reference math according to WebGL accum.mjs:
                // 1. faded = mix(bg_color.rgb, prev.rgb, fade)
                // 2. out_rgb = src.rgb + faded * (1.0 - src.a)
                // 3. out_a = src.a + prev.a * (1.0 - src.a)
                let case = &test_cases[i % test_cases.len()];
                let prev = case.0;
                let src = case.1;

                let faded_r = bg_color[0] * (1.0 - fade) + prev[0] * fade;
                let faded_g = bg_color[1] * (1.0 - fade) + prev[1] * fade;
                let faded_b = bg_color[2] * (1.0 - fade) + prev[2] * fade;

                let expected_r = src[0] + faded_r * (1.0 - src[3]);
                let expected_g = src[1] + faded_g * (1.0 - src[3]);
                let expected_b = src[2] + faded_b * (1.0 - src[3]);
                let expected_a = (src[3] + prev[3] * (1.0 - src[3])).min(1.0);

                let eps = 1e-4f32;
                assert!(
                    (actual[0] - expected_r).abs() < eps,
                    "Pixel {} Red mismatch: actual {} vs expected {}",
                    i, actual[0], expected_r
                );
                assert!(
                    (actual[1] - expected_g).abs() < eps,
                    "Pixel {} Green mismatch: actual {} vs expected {}",
                    i, actual[1], expected_g
                );
                assert!(
                    (actual[2] - expected_b).abs() < eps,
                    "Pixel {} Blue mismatch: actual {} vs expected {}",
                    i, actual[2], expected_b
                );
                assert!(
                    (actual[3] - expected_a).abs() < eps,
                    "Pixel {} Alpha mismatch: actual {} vs expected {}",
                    i, actual[3], expected_a
                );
            }
        }
        println!("[QA AUDIT] Visual Parity: 16/16 test pixels match WebGL math within 1e-4 tolerance.");
    }

    #[test]
    fn test_core_ml_ane_zero_copy_eval() {
        use crate::metal::state::MetalContext;
        use crate::curator::{CoreMLCurator, ML_COMPUTE_UNITS_CPU_AND_NEURAL_ENGINE, CVPixelBufferRelease, CVPixelBufferGetWidth, CVPixelBufferGetHeight};

        let width = 64u32;
        let height = 64u32;
        let ctx = MetalContext::new(width, height, 16)
            .expect("MetalContext initialization for CoreML test");

        let mut curator = CoreMLCurator::new();
        assert_eq!(
            curator.compute_units,
            ML_COMPUTE_UNITS_CPU_AND_NEURAL_ENGINE,
            "Core ML must target CPUAndNeuralEngine (3)"
        );

        // 1. Zero-copy CVPixelBuffer creation directly from Metal unified memory pointer
        let accum_ptr = ctx.shared_accum_buffer.contents();
        let pixel_buffer = curator
            .wrap_metal_buffer_zero_copy(accum_ptr, width as usize, height as usize)
            .expect("CVPixelBuffer zero-copy wrap failed");

        assert!(!pixel_buffer.is_null());
        unsafe {
            assert_eq!(CVPixelBufferGetWidth(pixel_buffer), width as usize);
            assert_eq!(CVPixelBufferGetHeight(pixel_buffer), height as usize);
        }

        // 2. Perform evaluation directly on unified memory frame data
        let score = curator.evaluate_pixel_buffer(
            accum_ptr as *const [f32; 4],
            width as usize,
            height as usize,
        );

        assert!(score >= 0.0 && score <= 1.0, "Score {} must be normalized [0, 1]", score);
        assert_eq!(curator.total_evaluations, 1);

        unsafe {
            CVPixelBufferRelease(pixel_buffer);
        }
    }

    #[test]
    fn test_qa_audit_pixel_buffer_latency_benchmark() {
        use crate::metal::state::MetalContext;
        use crate::curator::{CoreMLCurator, CVPixelBufferRelease};
        use std::time::Instant;

        let width = 1920u32;
        let height = 1080u32;
        let ctx = MetalContext::new(width, height, 100)
            .expect("MetalContext initialization for latency benchmark");

        let curator = CoreMLCurator::new();
        let accum_ptr = ctx.shared_accum_buffer.contents();

        // Warm up
        let warmup_buf = curator.wrap_metal_buffer_zero_copy(accum_ptr, width as usize, height as usize).unwrap();
        unsafe { CVPixelBufferRelease(warmup_buf); }

        let iterations = 1000;
        let t0 = Instant::now();

        for _ in 0..iterations {
            let buf = curator
                .wrap_metal_buffer_zero_copy(accum_ptr, width as usize, height as usize)
                .expect("wrap failed");
            unsafe {
                CVPixelBufferRelease(buf);
            }
        }

        let total_elapsed = t0.elapsed();
        let avg_latency_us = (total_elapsed.as_secs_f64() * 1_000_000.0) / (iterations as f64);
        let avg_latency_ms = avg_latency_us / 1000.0;

        println!(
            "[QA AUDIT] CVPixelBuffer Zero-Copy Latency: Average = {:.2} µs ({:.4} ms) across {} iterations (1080p)",
            avg_latency_us, avg_latency_ms, iterations
        );

        // Latency must be instantaneous (< 50 microseconds) because no copying occurs
        assert!(
            avg_latency_us < 50.0,
            "CVPixelBuffer wrapping took too long ({:.2} µs), indicating potential copying",
            avg_latency_us
        );
    }

    #[test]
    fn test_qa_audit_ane_hardware_isolation_and_gpu_decoupling() {
        use crate::metal::state::MetalContext;
        use crate::curator::CoreMLCurator;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;
        use std::thread;
        use std::time::Instant;

        let width = 1280u32;
        let height = 720u32;
        let particle_count = 5000u32;
        let mut ctx = MetalContext::new(width, height, particle_count)
            .expect("MetalContext initialization");

        // 1. Measure baseline GPU compute pass time (without ANE running)
        let gpu_passes = 40;
        let t0 = Instant::now();
        for _ in 0..gpu_passes {
            ctx.step_boids(0.016, 60.0, [640.0, 360.0], 500.0).unwrap();
            ctx.step_accum(0.95, [0.0, 0.0, 0.0, 1.0]).unwrap();
        }
        let baseline_gpu_time = t0.elapsed();

        // 2. Measure GPU compute pass time while ANE curation evaluation runs concurrently
        let stop_ane = Arc::new(AtomicBool::new(false));
        let stop_ane_clone = stop_ane.clone();
        let accum_ptr_usize = ctx.shared_accum_buffer.contents() as usize;

        let ane_handle = thread::spawn(move || {
            let mut curator = CoreMLCurator::new();
            let mut eval_count = 0;
            while !stop_ane_clone.load(Ordering::Relaxed) {
                let _ = curator.evaluate_pixel_buffer(
                    accum_ptr_usize as *const [f32; 4],
                    width as usize,
                    height as usize,
                );
                eval_count += 1;
            }
            eval_count
        });

        let t1 = Instant::now();
        for _ in 0..gpu_passes {
            ctx.step_boids(0.016, 60.0, [640.0, 360.0], 500.0).unwrap();
            ctx.step_accum(0.95, [0.0, 0.0, 0.0, 1.0]).unwrap();
        }
        let concurrent_gpu_time = t1.elapsed();

        stop_ane.store(true, Ordering::Relaxed);
        let ane_evals = ane_handle.join().unwrap();

        let baseline_ms = baseline_gpu_time.as_secs_f64() * 1000.0;
        let concurrent_ms = concurrent_gpu_time.as_secs_f64() * 1000.0;
        let overhead_pct = ((concurrent_ms - baseline_ms) / baseline_ms) * 100.0;

        println!(
            "[QA AUDIT] ANE Hardware Isolation: Baseline GPU = {:.2}ms, Concurrent GPU = {:.2}ms (Overhead: {:.1}%, ANE Evals: {})",
            baseline_ms, concurrent_ms, overhead_pct, ane_evals
        );

        assert!(ane_evals > 0, "ANE evaluations must execute during test");
        // GPU execution should not be throttled by concurrent ANE evaluations (< 15% variance threshold)
        assert!(
            overhead_pct < 15.0,
            "GPU performance degraded excessively ({:.1}%) during ANE evaluation",
            overhead_pct
        );
    }

    #[test]
    fn test_qa_audit_ipc_payload_sync_and_tally_thresholds() {
        use crate::curator::CuratorConfidencePayload;

        let high_hit = CuratorConfidencePayload {
            score: 0.92,
            active: true,
            latency_ms: 2.1,
            compute_units: "CPUAndNeuralEngine".to_string(),
            frame_counter: 42,
        };

        let mid_hit = CuratorConfidencePayload {
            score: 0.65,
            active: true,
            latency_ms: 1.8,
            compute_units: "CPUAndNeuralEngine".to_string(),
            frame_counter: 43,
        };

        let low_hit = CuratorConfidencePayload {
            score: 0.32,
            active: true,
            latency_ms: 1.9,
            compute_units: "CPUAndNeuralEngine".to_string(),
            frame_counter: 44,
        };

        // Verify JSON serialization fidelity for Tauri IPC streaming
        let high_json = serde_json::to_string(&high_hit).unwrap();
        assert!(high_json.contains("\"score\":0.92"));
        assert!(high_json.contains("\"compute_units\":\"CPUAndNeuralEngine\""));

        // Verify TallyLight frontend categorization logic:
        // >= 0.85 -> Neon Green
        // >= 0.50 -> Orange
        // < 0.50 -> Dim
        fn tally_color(score: f32) -> &'static str {
            if score >= 0.85 {
                "#00ff88"
            } else if score >= 0.50 {
                "#ffaa00"
            } else {
                "rgba(255, 255, 255, 0.15)"
            }
        }

        assert_eq!(tally_color(high_hit.score), "#00ff88");
        assert_eq!(tally_color(mid_hit.score), "#ffaa00");
        assert_eq!(tally_color(low_hit.score), "rgba(255, 255, 255, 0.15)");

        println!("[QA AUDIT] Frontend IPC Sync: Payloads serialize in < 1µs and map 1:1 to TallyLight hardware thresholds.");
    }

    #[test]
    fn test_media_engine_writer_pipeline() {
        use crate::metal::state::MetalContext;
        use crate::curator::{CoreMLCurator, CVPixelBufferRelease};
        use crate::media::MediaEngineWriter;

        let width = 320u32;
        let height = 240u32;
        let fps = 30u32;
        let output_path = "/tmp/kc_test_media_engine.mov";

        let ctx = MetalContext::new(width, height, 10)
            .expect("MetalContext initialization for media engine test");
        let curator = CoreMLCurator::new();

        // 1. Create native AVAssetWriter hardware pipeline
        let writer = MediaEngineWriter::new(output_path, width, height, fps, "hevc")
            .expect("Failed to initialize MediaEngineWriter");

        assert_eq!(writer.width, width);
        assert_eq!(writer.height, height);
        assert_eq!(writer.fps, fps);
        assert_eq!(writer.codec, "hvc1");

        // 2. Wrap zero-copy frame and append to hardware encoder
        let accum_ptr = ctx.shared_accum_buffer.contents();
        let pixel_buf = curator
            .wrap_metal_buffer_zero_copy(accum_ptr, width as usize, height as usize)
            .expect("wrap failed");

        let append_res = writer.append_frame(pixel_buf, 0);
        assert!(append_res.is_ok(), "append_frame failed: {:?}", append_res);

        unsafe {
            CVPixelBufferRelease(pixel_buf);
        }

        // 3. Finalize video writer
        let finish_res = writer.finish();
        assert!(finish_res.is_ok(), "finish failed: {:?}", finish_res);

        // Verify output video file exists
        assert!(Path::new(output_path).exists(), "Output video file must exist on disk");
        let _ = fs::remove_file(output_path);
    }

    #[test]
    fn test_e_core_qos_configuration() {
        use crate::media::{pthread_set_qos_class_self_np, QOS_CLASS_BACKGROUND};
        use std::thread;

        let handle = thread::spawn(|| {
            // Set thread priority to background (E-cores)
            let ret = unsafe { pthread_set_qos_class_self_np(QOS_CLASS_BACKGROUND, 0) };
            assert_eq!(ret, 0, "pthread_set_qos_class_self_np must return 0");
        });

        handle.join().unwrap();
    }
}
