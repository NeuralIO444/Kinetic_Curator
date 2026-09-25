# GitHub Issue Drafts

These issues are ready to file on GitHub for the next development sprints following the Always Alive Protocol.

---

## Issue 1: [Feature] Mob Vibe: Asset-Kinship & Sub-Flock Clustering for Living Swarms

**Labels:** `physics`, `feel`, `always-alive`, `enhancement`

### Context & Motivation
Currently, particles in `swarm`, `hype`, and `murmuration` modes share global boid forces (`swarmCohesion`, `damping`, `wind`, `gravityWells`). This causes the population to behave either as one monolithic single-cloud blob or a uniform diffuse scatter.

To achieve a true **"MOB" aesthetic** (organic murmurations where distinct groups of assets move together in coherent sub-packs), particles need asset-kinship affinity: particles of the same asset or cluster group should attract and align with each other while maintaining standard separation from other groups.

### Proposed Architecture & Engine Changes
1. **Asset-Kinship Weighting in Boid Accumulator (`app/src/engine/particles.js` & `behave.js`):**
   - Each particle already carries `cgroup = (i % activeAssets.length) % 32` and `assetIndex` (0–3 under the 4-asset discipline).
   - In the spatial hash neighbour loop (`_updateBoidsSoA`), add a kinship coefficient $K_{\text{kin}} \approx 1.5 - 2.0$:
     - When neighbour $j$ shares the same `cgroup` / `assetIndex` as particle $i$, apply $K_{\text{kin}} \times \text{cohesion}$ and alignment.
     - When neighbour $j$ belongs to a different group, apply standard or slightly heightened separation force.
2. **Group Motion Deltas:**
   - Inject slight group-level phase offsets and speed variance per `cgroup` so sub-packs bank, turn, and surge at different moments.
3. **Always Alive Invariant:**
   - Sub-groups never freeze into rigid static clusters; continuous curl wind and noise field keep groups undulating.

### Acceptance Criteria
- [ ] Swarms with 4 active assets visibly bifurcate into 2–4 distinct flowing sub-groups/mobs.
- [ ] Each group moves with internal cohesion while organically passing through or around other groups without clipping or merging into a single blob.
- [ ] Golden placement and stills baking remain deterministic and unaffected.
- [ ] Zero frame-rate drop on balanced quality tier.

---

## Issue 2: [Architecture & Feel] 4-Track Layer Orchestration (KC-1 – KC-4): Non-Overlapping Planes & Cross-Layer PATCH Dynamics

**Labels:** `layers`, `patch`, `architecture`, `ui`

### Context & Motivation
With 4 content tracks available (**KC-1**, **KC-2**, **KC-3**, **KC-4**), scenes often suffer visual clutter when multiple tracks simply stack random elements in the same coordinate space, causing chaotic overlapping. 

Instead, the 4 tracks should function as a curated hierarchy of distinct visual planes that **interact with each other** via the PATCH matrix (`FIELD`, `FEED`, `MOD`) rather than fighting for the same pixel space.

### Proposed Architecture & Interaction Model
1. **Default Track Roles & Spatial Segregation:**
   - **KC-1 (Architecture / Ground):** Rigid, low-density geometric scaffold (`rails` or `grid`, $\le 0.15$ drift, $\le 0.2$ flow, 2–4 bold structural assets).
   - **KC-2 (Flow / The Mob):** Fluid motion layer (`flow` or `swarm`, $\ge 0.35$ flow, 4 organic/flourish assets).
   - **KC-3 (Accents / Orbitals):** Micro-particles / pings (`orbit` or `radial`, high speed, small scale).
   - **KC-4 (Atmosphere / Weather):** Ambient dust / noise warp.
2. **Non-Overlapping Collision & Exclusion:**
   - Enable layer-aware spatial bounding: KC-2 particles treat KC-1 geometric anchors as soft repulsors or boundary guides, preventing visual occlusion.
   - Distinct z-plane depth distribution so layers retain a clear foreground/midground/background hierarchy.
3. **Cross-Layer PATCH Matrix Workflows:**
   - **`FIELD` (Spatial Pull/Push):** KC-2 flow lines physically curve around or anchor to KC-1 nodes (`patch: { mode: 'field', from: 'KC-1', to: 'KC-2', strength: 0.35 }`).
   - **`FEED` (Kinetic Delay):** KC-3 accent particles trace the velocity wakes of KC-2 with 1-frame latency (`patch: { mode: 'feed', from: 'KC-2', to: 'KC-3', strength: 0.25 }`).
   - **`MOD` (Dynamic Steering):** KC-1 motion metrics dynamically steer the boid cohesion and alignment multipliers of KC-2 (`patch: { mode: 'mod', from: 'KC-1', to: 'KC-2' }`).

### Acceptance Criteria
- [ ] Multi-track scenes maintain visual clarity without muddy overlapping.
- [ ] PATCH matrix routings (`FIELD`, `FEED`, `MOD`) across KC-1 – KC-4 provide tactile physical interaction between layers.
- [ ] Presets showcase pre-configured 4-track symphonies.

---

## Issue 3: [Sprint] Focused Morph Transition & Fluid State Interpolation Engine

**Labels:** `transitions`, `morph`, `physics`, `feel`, `always-alive`

### Context & Motivation
PR #540 eliminated the optical cross-fade dissolve by introducing cross-asset spatial pairing, allowing nodes to fly directly to their target slots. However, the travel path is currently a linear coordinate interpolation ($f.x \to to.x$, $f.y \to to.y$), and the asset costume cut occurs at the target state. 

This sprint focuses on advancing the state-morph system into a truly liquid, choreographed physical transition that feels alive at every millisecond.

### Key Focus Areas & Exploration Tracks
1. **Curved Flight Paths & Vector-Field Advection:**
   - Instead of straight Euclidean lines between source and destination, nodes should follow curl-noise arcs or bezier deflection influenced by the active flow field during transit.
   - Elements arc gracefully across the screen rather than cutting straight through other nodes.
2. **Costume Transition Choreography:**
   - When a node pairs across different assets (e.g., square $\to$ tendril):
     - *Option A (Elastic scale pulse):* Node slightly compresses into an energy bead mid-flight and blooms into its new asset form upon arrival.
     - *Option B (Atlas pixel dissolve during flight):* Fast per-quad shader dissolve between source and destination textures during transit.
3. **Momentum & Velocity Preservation:**
   - When transitioning out of high-speed fluid modes (`swarm`, `flow`, `noise`), carry residual particle velocity into the morph rather than zeroing it, letting nodes slingshot into their destination slots with critical damping.
4. **Adaptive Stagger & Radial Propagation:**
   - Nodes closer to the attractor or center initiate transit slightly earlier than outer nodes ($10-30\text{ms}$ wave propagation), creating a ripple/domino effect across the canvas rather than an all-at-once departure.

### Acceptance Criteria
- [ ] Mode changes exhibit organic, arced flight paths with zero linear robotic stiffness.
- [ ] Asset costume changes feel tactile and physically justified (pulse, bloom, or liquid morph).
- [ ] In-flight transitions feel buttery smooth on 60fps WebGL canvas with zero performance drops.
- [ ] Full coverage in `itemMorph.selfcheck.mjs`.
