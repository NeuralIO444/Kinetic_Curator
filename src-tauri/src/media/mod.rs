use objc::runtime::{Class, Object};
use objc::{class, msg_send, sel, sel_impl};
use serde::Serialize;
use std::ffi::c_void;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use tauri::{AppHandle, Manager};

use crate::curator::{CVPixelBufferRef, CVPixelBufferRelease, CoreMLCurator};
use crate::metal::MetalAppState;

// ── macOS Thread QoS (Darwin Scheduler) ──────────────────────────────
// QOS_CLASS_BACKGROUND = 0x09 pins thread to Apple Silicon Efficiency Cores (E-cores)
pub const QOS_CLASS_BACKGROUND: u32 = 0x09;

extern "C" {
    pub fn pthread_set_qos_class_self_np(qos_class: u32, relative_priority: i32) -> i32;
    pub fn pthread_get_qos_class_np(thread: *mut c_void, qos_class: *mut u32, relative_priority: *mut i32) -> i32;
    pub fn pthread_self() -> *mut c_void;
}

// ── Payloads ─────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct MediaExportProgress {
    pub completed: u32,
    pub total: u32,
    pub current_file: String,
    pub fps: f32,
    pub qos_core: String,
    pub codec: String,
    pub finished: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct MediaEngineStatus {
    pub hardware_encoder_ready: bool,
    pub supported_codecs: Vec<String>,
    pub e_core_qos_enabled: bool,
    pub active_export: bool,
}

// ── Helper: NSString from Rust str ───────────────────────────────────

pub(crate) unsafe fn ns_string(s: &str) -> *mut Object {
    let cls = class!(NSString);
    let bytes = s.as_ptr();
    let len = s.len();
    msg_send![cls, stringWithBytes:bytes length:len encoding:4usize] // NSUTF8StringEncoding = 4
}

// ── Helper: NSNumber from i32 ────────────────────────────────────────

unsafe fn ns_number_i32(val: i32) -> *mut Object {
    let cls = class!(NSNumber);
    msg_send![cls, numberWithInt:val]
}

// ── CMTime Struct ────────────────────────────────────────────────────

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct CMTime {
    pub value: i64,
    pub timescale: i32,
    pub flags: u32,
    pub epoch: i64,
}

pub const K_CMTIME_FLAGS_VALID: u32 = 1;

impl CMTime {
    pub fn new(value: i64, timescale: i32) -> Self {
        Self {
            value,
            timescale,
            flags: K_CMTIME_FLAGS_VALID,
            epoch: 0,
        }
    }
}

// ── AVAssetWriter Native Wrapper ─────────────────────────────────────

#[allow(dead_code)]
pub struct MediaEngineWriter {
    pub writer: *mut Object,
    pub input: *mut Object,
    pub adaptor: *mut Object,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub codec: String,
}

impl MediaEngineWriter {
    pub fn new(output_path: &str, width: u32, height: u32, fps: u32, codec: &str) -> Result<Self, String> {
        // Ensure parent directory exists
        if let Some(parent) = Path::new(output_path).parent() {
            let _ = fs::create_dir_all(parent);
        }
        // Remove existing file if present
        let _ = fs::remove_file(output_path);

        unsafe {
            let url_cls = class!(NSURL);
            let ns_path = ns_string(output_path);
            let url: *mut Object = msg_send![url_cls, fileURLWithPath: ns_path];

            // AVFileTypeQuickTimeMovie
            let file_type = ns_string("com.apple.quicktime-movie");

            let writer_cls = class!(AVAssetWriter);
            let mut error: *mut Object = std::ptr::null_mut();
            let writer: *mut Object = msg_send![writer_cls, assetWriterWithURL:url fileType:file_type error:&mut error];

            if writer.is_null() {
                return Err("Failed to create AVAssetWriter".to_string());
            }

            // Output settings dictionary: Codec, Width, Height
            let dict_cls = class!(NSMutableDictionary);
            let settings: *mut Object = msg_send![dict_cls, dictionary];

            // Select on-chip hardware codec: HEVC ("hvc1") or ProRes 4444 ("ap4h")
            let codec_str = if codec.eq_ignore_ascii_case("prores") || codec.eq_ignore_ascii_case("prores4444") {
                "ap4h" // AVVideoCodecTypeAppleProRes4444
            } else {
                "hvc1" // AVVideoCodecTypeHEVC
            };

            let ns_codec = ns_string(codec_str);
            let key_codec = ns_string("AVVideoCodecKey");
            let key_width = ns_string("AVVideoWidthKey");
            let key_height = ns_string("AVVideoHeightKey");

            let _: () = msg_send![settings, setObject:ns_codec forKey:key_codec];
            let _: () = msg_send![settings, setObject:ns_number_i32(width as i32) forKey:key_width];
            let _: () = msg_send![settings, setObject:ns_number_i32(height as i32) forKey:key_height];

            // AVMediaTypeVideo
            let media_type_video = ns_string("vide");
            let input_cls = class!(AVAssetWriterInput);
            let input: *mut Object = msg_send![input_cls, assetWriterInputWithMediaType:media_type_video outputSettings:settings];

            if input.is_null() {
                return Err("Failed to create AVAssetWriterInput".to_string());
            }

            let expects_media_in_real_time: bool = false;
            let _: () = msg_send![input, setExpectsMediaDataInRealTime: expects_media_in_real_time];

            // Pixel buffer adaptor to accept zero-copy CVPixelBuffer directly
            let adaptor_cls = class!(AVAssetWriterInputPixelBufferAdaptor);
            let adaptor: *mut Object = msg_send![
                adaptor_cls,
                assetWriterInputPixelBufferAdaptorWithAssetWriterInput: input
                sourcePixelBufferAttributes: std::ptr::null::<c_void>()
            ];

            if adaptor.is_null() {
                return Err("Failed to create AVAssetWriterInputPixelBufferAdaptor".to_string());
            }

            // Add input and start writing session
            let _: () = msg_send![writer, addInput: input];
            let start_success: bool = msg_send![writer, startWriting];
            if !start_success {
                return Err("AVAssetWriter startWriting returned false".to_string());
            }

            let start_time = CMTime::new(0, fps as i32);
            let _: () = msg_send![writer, startSessionAtSourceTime: start_time];

            Ok(Self {
                writer,
                input,
                adaptor,
                width,
                height,
                fps,
                codec: codec_str.to_string(),
            })
        }
    }

    pub fn append_frame(&self, pixel_buffer: CVPixelBufferRef, frame_idx: i64) -> Result<(), String> {
        unsafe {
            // Spin-wait briefly until encoder input is ready for more frames
            let mut attempts = 0;
            while attempts < 100 {
                let ready: bool = msg_send![self.input, isReadyForMoreMediaData];
                if ready {
                    break;
                }
                thread::sleep(std::time::Duration::from_millis(1));
                attempts += 1;
            }

            let pts = CMTime::new(frame_idx, self.fps as i32);
            let success: bool = msg_send![
                self.adaptor,
                appendPixelBuffer: pixel_buffer
                withPresentationTime: pts
            ];

            if !success {
                return Err(format!("Failed to append CVPixelBuffer at frame {}", frame_idx));
            }
        }
        Ok(())
    }

    pub fn finish(self) -> Result<(), String> {
        unsafe {
            let _: () = msg_send![self.input, markAsFinished];

            // Wait synchronously for writer to finish writing
            let _: () = msg_send![self.writer, finishWriting];

            // Check final status
            let status: i64 = msg_send![self.writer, status];
            if status == 3 { // AVAssetWriterStatusFailed
                return Err("AVAssetWriter finish failed".to_string());
            }
        }
        Ok(())
    }
}

// ── State Container ──────────────────────────────────────────────────

pub struct MediaAppState {
    pub is_exporting: Arc<AtomicBool>,
}

impl MediaAppState {
    pub fn new() -> Self {
        Self {
            is_exporting: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// #1743: clears `is_exporting` however the export ends — an early return, an error, or a panic — so a failed
/// export can never leave every later one refused with "Another export is already in progress".
struct ExportFlag(Arc<AtomicBool>);

impl Drop for ExportFlag {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

// ── Tauri Commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn start_media_engine_export(
    app: AppHandle,
    path: String,
    frame_count: u32,
    fps: u32,
    codec: String,
) -> Result<String, String> {
    if fps == 0 || fps > 240 {
        return Err(format!("fps must be 1–240 (got {fps})"));
    }
    // #1742: the export file lands under the temp folder only, like write_batch_frame.
    let out_path = crate::batch_frame::resolve_under(&path, &crate::batch_frame::allowed_roots())?;
    let out_path = out_path.to_string_lossy().to_string();

    let media_state = app.state::<MediaAppState>();
    if media_state.is_exporting.swap(true, Ordering::SeqCst) {
        return Err("Another export is already in progress".to_string());
    }
    let flag = ExportFlag(media_state.is_exporting.clone());
    let app_handle = app.clone();

    // Spawn export on background OS thread
    tauri::async_runtime::spawn_blocking(move || {
        let _flag = flag; // released when this closure ends, whatever the path out
        let t_start = Instant::now();
        let metal_state = app_handle.state::<MetalAppState>();

        // 1. Read the frame size. The buffer pointer is NOT kept: #1743 — a pointer copied out of the lock dangled
        //    as soon as metal_init replaced the context mid-export.
        let (width, height) = {
            let lock = metal_state.0.lock().map_err(|e| format!("Metal state poisoned: {e}"))?;
            match lock.as_ref() {
                Some(c) => (c.width, c.height),
                None => return Err("Metal engine not initialized".to_string()),
            }
        };

        let writer = MediaEngineWriter::new(&out_path, width, height, fps, &codec)
            .map_err(|e| format!("MediaEngineWriter init failed: {}", e))?;

        let curator = CoreMLCurator::new();
        let mut written: u32 = 0;
        let mut failure: Option<String> = None;

        // 2. Each frame steps, wraps and appends with the Metal lock HELD, re-reading the buffer pointer from the
        //    live context, so a re-init waits for the frame instead of freeing the memory under it.
        for i in 0..frame_count {
            if !_flag.0.load(Ordering::Relaxed) {
                break;
            }
            let frame_result: Result<(), String> = (|| {
                let mut lock = metal_state.0.lock().map_err(|e| format!("Metal state poisoned: {e}"))?;
                let ctx = lock.as_mut().ok_or("Metal engine was torn down during the export")?;
                if ctx.width != width || ctx.height != height {
                    return Err("Metal engine was re-initialised at a different size during the export".into());
                }
                ctx.step_boids(1.0 / (fps as f32), 60.0, [width as f32 / 2.0, height as f32 / 2.0], 600.0)?;
                ctx.step_accum(0.96, [0.0, 0.0, 0.0, 1.0])?;
                let pixel_buf = curator.wrap_metal_buffer_zero_copy(
                    ctx.shared_accum_buffer.contents(),
                    width as usize,
                    height as usize,
                )?;
                let appended = writer.append_frame(pixel_buf, written as i64);
                unsafe {
                    CVPixelBufferRelease(pixel_buf);
                }
                appended
            })();
            if let Err(e) = frame_result {
                failure = Some(format!("frame {}: {}", i, e));
                break;
            }
            written += 1;

            // Emit live progress
            let current_fps = written as f32 / t_start.elapsed().as_secs_f32().max(0.001);
            let _ = app_handle.emit_all("media-export-progress", MediaExportProgress {
                completed: written,
                total: frame_count,
                current_file: out_path.clone(),
                fps: current_fps,
                qos_core: "Apple Media Engine (Hardware)".to_string(),
                codec: codec.clone(),
                finished: false,
            });
        }

        // #1744: the encoder's verdict is the export's verdict — never "completed" over a failed append or finish.
        let finished = writer.finish();
        let final_fps = written as f32 / t_start.elapsed().as_secs_f32().max(0.001);
        let _ = app_handle.emit_all("media-export-progress", MediaExportProgress {
            completed: written,
            total: frame_count,
            current_file: out_path.clone(),
            fps: final_fps,
            qos_core: "Apple Media Engine (Hardware)".to_string(),
            codec: codec.clone(),
            finished: true,
        });
        if let Some(e) = failure {
            return Err(format!("Export stopped after {} of {} frames — {}", written, frame_count, e));
        }
        finished.map_err(|e| format!("Export wrote {} frames but the file did not finish: {}", written, e))?;
        Ok(format!(
            "Export completed: {} frames in {:.2}s (~{:.1} fps)",
            written,
            t_start.elapsed().as_secs_f32(),
            final_fps
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// #1744: the dump writes the accumulation buffer as it is — little-endian RGBA f32, the whole frame — under an
/// honest `.rgba32f` name. It used to write the first 256 KB of that buffer into files named `.png` / `.tiff`,
/// which no image tool opens. `format` is kept for the IPC shape; only raw is written.
#[tauri::command]
pub async fn dump_image_batch(
    app: AppHandle,
    target_dir: String,
    count: u32,
    format: String,
) -> Result<String, String> {
    // #1742: under the temp folder only. Resolving a probe file inside the folder checks (and creates) the folder.
    let probe = std::path::Path::new(&target_dir).join(".kc-dump");
    let dir = crate::batch_frame::resolve_under(&probe.to_string_lossy(), &crate::batch_frame::allowed_roots())?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or("no target folder")?;

    let media_state = app.state::<MediaAppState>();
    if media_state.is_exporting.swap(true, Ordering::SeqCst) {
        return Err("Another export is already in progress".to_string());
    }
    let flag = ExportFlag(media_state.is_exporting.clone());
    let app_handle = app.clone();
    let requested = format.to_lowercase();

    tauri::async_runtime::spawn_blocking(move || {
        let _flag = flag;
        // Pin this worker thread strictly to macOS Efficiency Cores (E-Cores)
        unsafe {
            pthread_set_qos_class_self_np(QOS_CLASS_BACKGROUND, 0);
        }

        let t_start = Instant::now();
        let metal_state = app_handle.state::<MetalAppState>();
        let codec_label = if requested == "raw" || requested == "rgba32f" {
            "RAW RGBA32F".to_string()
        } else {
            format!("RAW RGBA32F ({} not encoded)", requested.to_uppercase())
        };
        let mut written: u32 = 0;

        for i in 0..count {
            if !_flag.0.load(Ordering::Relaxed) {
                break;
            }
            let file_name = format!("kc_frame_{:04}.rgba32f", i);
            let file_path = dir.join(&file_name);

            // Step and copy the frame with the lock held (#1743), then write outside it.
            let bytes: Vec<u8> = {
                let mut lock = metal_state.0.lock().map_err(|e| format!("Metal state poisoned: {e}"))?;
                let ctx = lock
                    .as_mut()
                    .ok_or_else(|| if i == 0 { "Metal engine not initialized".to_string() } else { "Metal engine was torn down during the dump".to_string() })?;
                ctx.step_boids(0.016, 60.0, [ctx.width as f32 / 2.0, ctx.height as f32 / 2.0], 500.0)?;
                ctx.step_accum(0.96, [0.0, 0.0, 0.0, 1.0])?;
                let len = (ctx.width as usize) * (ctx.height as usize) * 16;
                let len = len.min(ctx.shared_accum_buffer.length() as usize);
                unsafe { std::slice::from_raw_parts(ctx.shared_accum_buffer.contents() as *const u8, len).to_vec() }
            };
            fs::write(&file_path, &bytes).map_err(|e| format!("Failed to write {}: {}", file_path.display(), e))?;
            written += 1;

            let current_fps = written as f32 / t_start.elapsed().as_secs_f32().max(0.001);
            let _ = app_handle.emit_all("media-export-progress", MediaExportProgress {
                completed: written,
                total: count,
                current_file: file_name,
                fps: current_fps,
                qos_core: "E-Cores (QOS_CLASS_BACKGROUND)".to_string(),
                codec: codec_label.clone(),
                finished: false,
            });
        }

        let final_fps = written as f32 / t_start.elapsed().as_secs_f32().max(0.001);
        let _ = app_handle.emit_all("media-export-progress", MediaExportProgress {
            completed: written,
            total: count,
            current_file: format!("Batch finished in {}", dir.display()),
            fps: final_fps,
            qos_core: "E-Cores (QOS_CLASS_BACKGROUND)".to_string(),
            codec: codec_label.clone(),
            finished: true,
        });

        Ok(format!(
            "Batch dump completed: {} raw RGBA32F frames in {:.2}s (~{:.1} fps)",
            written,
            t_start.elapsed().as_secs_f32(),
            final_fps
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// #1744: reports what is true — whether AVAssetWriter is present, and whether an export is running — instead of
/// a fixed "ready, idle".
#[tauri::command]
pub fn media_engine_get_status(state: tauri::State<'_, MediaAppState>) -> Result<MediaEngineStatus, String> {
    Ok(MediaEngineStatus {
        hardware_encoder_ready: Class::get("AVAssetWriter").is_some(),
        supported_codecs: vec!["HEVC (H.265)".to_string(), "ProRes 4444".to_string(), "RAW RGBA32F dump (E-Core)".to_string()],
        e_core_qos_enabled: true,
        active_export: state.is_exporting.load(Ordering::SeqCst),
    })
}
