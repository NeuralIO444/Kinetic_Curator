pub mod state;

use state::{MetalContext, MetalStats, Particle};
use std::sync::Mutex;
use tauri::State;

pub struct MetalAppState(pub Mutex<Option<MetalContext>>);

#[tauri::command]
pub fn metal_init(
    width: u32,
    height: u32,
    particle_count: u32,
    state: State<'_, MetalAppState>,
) -> Result<MetalStats, String> {
    let ctx = MetalContext::new(width, height, particle_count)?;
    let stats = ctx.get_stats();
    let mut lock = state.0.lock().map_err(|e| e.to_string())?;
    *lock = Some(ctx);
    Ok(stats)
}

#[tauri::command]
pub fn metal_step_boids(
    delta_time: f32,
    max_speed: f32,
    attractor_x: f32,
    attractor_y: f32,
    strength: f32,
    state: State<'_, MetalAppState>,
) -> Result<(), String> {
    let mut lock = state.0.lock().map_err(|e| e.to_string())?;
    let ctx = lock.as_mut().ok_or_else(|| "Metal context not initialized".to_string())?;
    ctx.step_boids(delta_time, max_speed, [attractor_x, attractor_y], strength)
}

#[tauri::command]
pub fn metal_step_accum(
    fade: f32,
    bg_r: f32,
    bg_g: f32,
    bg_b: f32,
    bg_a: f32,
    state: State<'_, MetalAppState>,
) -> Result<MetalStats, String> {
    let mut lock = state.0.lock().map_err(|e| e.to_string())?;
    let ctx = lock.as_mut().ok_or_else(|| "Metal context not initialized".to_string())?;
    ctx.step_accum(fade, [bg_r, bg_g, bg_b, bg_a])?;
    Ok(ctx.get_stats())
}

#[tauri::command]
pub fn metal_get_stats(
    state: State<'_, MetalAppState>,
) -> Result<MetalStats, String> {
    let lock = state.0.lock().map_err(|e| e.to_string())?;
    let ctx = lock.as_ref().ok_or_else(|| "Metal context not initialized".to_string())?;
    Ok(ctx.get_stats())
}

#[derive(serde::Serialize)]
pub struct ParticleSnapshot {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
}

#[tauri::command]
pub fn metal_read_particles(
    limit: usize,
    state: State<'_, MetalAppState>,
) -> Result<Vec<ParticleSnapshot>, String> {
    let lock = state.0.lock().map_err(|e| e.to_string())?;
    let ctx = lock.as_ref().ok_or_else(|| "Metal context not initialized".to_string())?;

    let take = limit.min(ctx.particle_count as usize);
    let mut out = Vec::with_capacity(take);

    // Read directly from CPU pointer of shared memory buffer (zero-copy)
    unsafe {
        let ptr = ctx.shared_boids_buffer.contents() as *const Particle;
        for i in 0..take {
            let p = *ptr.add(i);
            out.push(ParticleSnapshot {
                x: p.pos[0],
                y: p.pos[1],
                vx: p.vel[0],
                vy: p.vel[1],
            });
        }
    }

    Ok(out)
}
