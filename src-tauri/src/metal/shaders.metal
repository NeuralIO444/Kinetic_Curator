#include <metal_stdlib>
using namespace metal;

// ── Structs ──────────────────────────────────────────────────────────

struct AccumParams {
    uint width;
    uint height;
    float fade;
    float pad;
    float4 bg_color;
};

struct Particle {
    float2 pos;
    float2 vel;
    float4 color;
    float size;
    float mass;
    float2 pad;
};

struct BoidsParams {
    uint count;
    float delta_time;
    float max_speed;
    float margin;
    float bounce;
    float attractor_strength;
    float2 bounds;
    float2 attractor;
};

// ── Accumulation Compute Kernel ──────────────────────────────────────
// Zero-copy accumulation pass over unified memory float4 buffer.
// Fades light toward palette background and performs source-over composite.
kernel void accum_compute(
    device const float4* in_buffer   [[buffer(0)]],
    device float4* accum_buffer       [[buffer(1)]],
    constant AccumParams& params     [[buffer(2)]],
    uint2 gid                        [[thread_position_in_grid]]
) {
    if (gid.x >= params.width || gid.y >= params.height) {
        return;
    }

    uint idx = gid.y * params.width + gid.x;
    float4 prev = accum_buffer[idx];

    // Lerp prior accumulation light toward background color
    float3 faded = mix(params.bg_color.rgb, prev.rgb, params.fade);

    // Premultiplied source-over composition
    float4 src = in_buffer[idx];
    float3 out_rgb = src.rgb + faded * (1.0f - src.a);
    float out_a = src.a + prev.a * (1.0f - src.a);

    accum_buffer[idx] = float4(out_rgb, clamp(out_a, 0.0f, 1.0f));
}

// ── Boids / Particle Physics Compute Kernel ──────────────────────────
// Parallel integration of position, velocity, attractor pull, and wall dampening
// executing directly on Apple Silicon GPU execution units.
kernel void boids_compute(
    device Particle* particles       [[buffer(0)]],
    constant BoidsParams& params     [[buffer(1)]],
    uint gid                         [[thread_position_in_grid]]
) {
    if (gid >= params.count) {
        return;
    }

    Particle p = particles[gid];

    // Attractor vector
    float2 to_attractor = params.attractor - p.pos;
    float dist = max(length(to_attractor), 1.0f);
    float2 pull = (to_attractor / dist) * params.attractor_strength;

    // Apply acceleration
    p.vel += pull * params.delta_time;

    // Speed clamping
    float speed = length(p.vel);
    if (speed > params.max_speed && speed > 0.0001f) {
        p.vel = (p.vel / speed) * params.max_speed;
    }

    // Position integration
    p.pos += p.vel * params.delta_time;

    // Margin containment & bounce
    if (p.pos.x < params.margin) {
        p.pos.x = params.margin;
        p.vel.x = -p.vel.x * params.bounce;
    } else if (p.pos.x > params.bounds.x - params.margin) {
        p.pos.x = params.bounds.x - params.margin;
        p.vel.x = -p.vel.x * params.bounce;
    }

    if (p.pos.y < params.margin) {
        p.pos.y = params.margin;
        p.vel.y = -p.vel.y * params.bounce;
    } else if (p.pos.y > params.bounds.y - params.margin) {
        p.pos.y = params.bounds.y - params.margin;
        p.vel.y = -p.vel.y * params.bounce;
    }

    particles[gid] = p;
}
