use metal::*;
use serde::Serialize;
use std::mem;

const SHADERS_SRC: &str = include_str!("shaders.metal");

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct AccumParams {
    pub width: u32,
    pub height: u32,
    pub fade: f32,
    pub pad: f32,
    pub bg_color: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct Particle {
    pub pos: [f32; 2],
    pub vel: [f32; 2],
    pub color: [f32; 4],
    pub size: f32,
    pub mass: f32,
    pub pad: [f32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct BoidsParams {
    pub count: u32,
    pub delta_time: f32,
    pub max_speed: f32,
    pub margin: f32,
    pub bounce: f32,
    pub attractor_strength: f32,
    pub bounds: [f32; 2],
    pub attractor: [f32; 2],
}

#[derive(Serialize, Clone, Debug)]
pub struct MetalStats {
    pub device_name: String,
    pub has_unified_memory: bool,
    pub accum_buffer_ptr: String,
    pub boids_buffer_ptr: String,
    pub accum_buffer_bytes: usize,
    pub boids_buffer_bytes: usize,
    pub width: u32,
    pub height: u32,
    pub particle_count: u32,
    pub frame_counter: u64,
}

pub struct MetalContext {
    pub device: Device,
    pub queue: CommandQueue,
    pub accum_pipeline: ComputePipelineState,
    pub boids_pipeline: ComputePipelineState,
    pub shared_accum_buffer: Buffer,
    pub shared_in_buffer: Buffer,
    pub shared_boids_buffer: Buffer,
    pub width: u32,
    pub height: u32,
    pub particle_count: u32,
    pub frame_counter: u64,
}

impl MetalContext {
    pub fn new(width: u32, height: u32, particle_count: u32) -> Result<Self, String> {
        let device = Device::system_default().ok_or_else(|| "No default Metal device found".to_string())?;
        let queue = device.new_command_queue();

        let compile_options = CompileOptions::new();
        let library = device
            .new_library_with_source(SHADERS_SRC, &compile_options)
            .map_err(|e| format!("Failed to compile Metal library: {}", e))?;

        let accum_fn = library
            .get_function("accum_compute", None)
            .map_err(|e| format!("Failed to load accum_compute function: {}", e))?;
        let accum_pipeline = device
            .new_compute_pipeline_state_with_function(&accum_fn)
            .map_err(|e| format!("Failed to create accum pipeline state: {}", e))?;

        let boids_fn = library
            .get_function("boids_compute", None)
            .map_err(|e| format!("Failed to load boids_compute function: {}", e))?;
        let boids_pipeline = device
            .new_compute_pipeline_state_with_function(&boids_fn)
            .map_err(|e| format!("Failed to create boids pipeline state: {}", e))?;

        // Allocate primary accumulation buffers with MTLResourceStorageModeShared
        // 4 components (RGBA) * 4 bytes (f32) = 16 bytes per pixel
        let pixel_count = (width * height) as usize;
        let accum_bytes = pixel_count * 16;
        let shared_accum_buffer = device.new_buffer(
            accum_bytes as u64,
            MTLResourceOptions::StorageModeShared,
        );
        let shared_in_buffer = device.new_buffer(
            accum_bytes as u64,
            MTLResourceOptions::StorageModeShared,
        );

        // Allocate shared boid particles buffer
        let particle_bytes = (particle_count as usize) * mem::size_of::<Particle>();
        let shared_boids_buffer = device.new_buffer(
            particle_bytes as u64,
            MTLResourceOptions::StorageModeShared,
        );

        // Initialize particles with starting positions and colors in shared memory
        unsafe {
            let particles_ptr = shared_boids_buffer.contents() as *mut Particle;
            for i in 0..particle_count {
                let fi = i as f32;
                let angle = (fi / particle_count as f32) * std::f32::consts::TAU;
                let radius = 100.0 + (fi % 50.0) * 2.0;
                let cx = (width as f32) / 2.0;
                let cy = (height as f32) / 2.0;

                *particles_ptr.add(i as usize) = Particle {
                    pos: [cx + angle.cos() * radius, cy + angle.sin() * radius],
                    vel: [-angle.sin() * 20.0, angle.cos() * 20.0],
                    color: [0.0, 1.0, 0.53, 1.0], // Neon green signature
                    size: 2.0,
                    mass: 1.0,
                    pad: [0.0, 0.0],
                };
            }
        }

        Ok(Self {
            device,
            queue,
            accum_pipeline,
            boids_pipeline,
            shared_accum_buffer,
            shared_in_buffer,
            shared_boids_buffer,
            width,
            height,
            particle_count,
            frame_counter: 0,
        })
    }

    pub fn step_accum(&mut self, fade: f32, bg_color: [f32; 4]) -> Result<(), String> {
        let params = AccumParams {
            width: self.width,
            height: self.height,
            fade,
            pad: 0.0,
            bg_color,
        };

        let cmd_buffer = self.queue.new_command_buffer();
        let encoder = cmd_buffer.new_compute_command_encoder();

        encoder.set_compute_pipeline_state(&self.accum_pipeline);
        encoder.set_buffer(0, Some(&self.shared_in_buffer), 0);
        encoder.set_buffer(1, Some(&self.shared_accum_buffer), 0);
        encoder.set_bytes(
            2,
            mem::size_of::<AccumParams>() as u64,
            &params as *const _ as *const _,
        );

        let thread_width = 16u64;
        let thread_height = 16u64;
        let threads_per_threadgroup = MTLSize::new(thread_width, thread_height, 1);
        let threadgroups = MTLSize::new(
            ((self.width as u64) + thread_width - 1) / thread_width,
            ((self.height as u64) + thread_height - 1) / thread_height,
            1,
        );

        encoder.dispatch_thread_groups(threadgroups, threads_per_threadgroup);
        encoder.end_encoding();

        cmd_buffer.commit();
        cmd_buffer.wait_until_completed();

        self.frame_counter += 1;
        Ok(())
    }

    pub fn step_boids(&mut self, delta_time: f32, max_speed: f32, attractor: [f32; 2], strength: f32) -> Result<(), String> {
        let params = BoidsParams {
            count: self.particle_count,
            delta_time,
            max_speed,
            margin: 20.0,
            bounce: 0.8,
            attractor_strength: strength,
            bounds: [self.width as f32, self.height as f32],
            attractor,
        };

        let cmd_buffer = self.queue.new_command_buffer();
        let encoder = cmd_buffer.new_compute_command_encoder();

        encoder.set_compute_pipeline_state(&self.boids_pipeline);
        encoder.set_buffer(0, Some(&self.shared_boids_buffer), 0);
        encoder.set_bytes(
            1,
            mem::size_of::<BoidsParams>() as u64,
            &params as *const _ as *const _,
        );

        let thread_count = 64u64;
        let threads_per_threadgroup = MTLSize::new(thread_count, 1, 1);
        let threadgroups = MTLSize::new(
            ((self.particle_count as u64) + thread_count - 1) / thread_count,
            1,
            1,
        );

        encoder.dispatch_thread_groups(threadgroups, threads_per_threadgroup);
        encoder.end_encoding();

        cmd_buffer.commit();
        cmd_buffer.wait_until_completed();

        Ok(())
    }

    pub fn get_stats(&self) -> MetalStats {
        let accum_ptr = self.shared_accum_buffer.contents();
        let boids_ptr = self.shared_boids_buffer.contents();

        MetalStats {
            device_name: self.device.name().to_string(),
            has_unified_memory: self.device.has_unified_memory(),
            accum_buffer_ptr: format!("{:p}", accum_ptr),
            boids_buffer_ptr: format!("{:p}", boids_ptr),
            accum_buffer_bytes: self.shared_accum_buffer.length() as usize,
            boids_buffer_bytes: self.shared_boids_buffer.length() as usize,
            width: self.width,
            height: self.height,
            particle_count: self.particle_count,
            frame_counter: self.frame_counter,
        }
    }
}
