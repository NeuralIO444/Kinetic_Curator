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
