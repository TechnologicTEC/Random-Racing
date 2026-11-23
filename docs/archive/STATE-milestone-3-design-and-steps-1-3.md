# Milestone 3: the design and steps 1 to 3

Moved here from `docs/STATE.md` on 2026-11-16, unchanged, so that file can be read in one go. The design was approved by Tane on 2026-11-15 and still stands; what is still to build is in `docs/PLAN.md` and `docs/plan/M3-driving.md`, and the decisions are in STATE.md's "Decisions".

## Milestone 3 design (approved 2026-11-15)

**Done when:** drift-boost works through every corner type, and the handling passes Tane's playtest.

**Not in this milestone:** countdown and start boost, laps and timing, menus, ghosts, sound, full effects (smoke, motion lines), bridges, flattening the start area. No change to layouts, islands or scoring.

### Tane's choices (2026-11-15)

| Question | Choice |
| --- | --- |
| Rapier build | **Deterministic**: `@dimforge/rapier3d-deterministic-compat` pinned at `0.21.0` (the newest on 2026-11-15; the standard build is the same version). Same inputs give the same lap on every computer |
| Barriers | **Open the walls in places.** Walls stay only where needed; elsewhere open grass |
| Page opens on | **Driving**, with the chase camera |
| Controller | **In this milestone** |

### What was found while planning

- **Walls line the whole lap today** (`src/gen/road/barriers.ts`: 0.8 m high, 1.8 m outside both edges). Opening them changes every seed's world fingerprint (allowed while the generator is v0) and means trees and rocks need collisions (they were "scenery only"; trees stand at least 8 m from the road edge, rocks 6 m).
- **The road is its own surface**, 0.25 m above the sunken ground, banked, with 9 cm kerbs. The ground grid has 3 m cells, too coarse to drive on. So the wheels must feel the road triangles (`WorldResult.road.mesh`, `road.kerbs.mesh`), and the ground grid only off the road.
- **Our own driving sums must be exact too.** `Math.sin` and friends differ between browsers; generation already avoids them (`src/core/dmath.ts`, enforced by `src/testing/architectureRules.ts`). The deterministic Rapier build only covers Rapier's side.
- **Space and the arrow keys** were taken by the flying camera (`src/app/worldPage.ts`).

### How the car is simulated (Claude's call)

Rapier moves one rigid body (the car), handles its collisions with ground, walls, trees and rocks, and casts the four wheel rays. **Our own code** does the springs, engine, steering, grip, drift and boost, as plain sums on top.

Rapier's ready-made vehicle controller is not used. It models tyre friction, and Mario Kart handling is rules, not tyre physics ("steering changes how tight the slide is", fixed boost times). With our own layer every number sits in `src/config.ts` and every sum is exact. If step 4 shows our springs are unstable, the fallback is Rapier's controller for the springs only.

The simulation runs on the page's main thread at a fixed 60 steps a second (step 1 measures what a step costs). Drawing blends between the last two steps.

### New folders and rules

| Folder | Holds | Rules |
| --- | --- | --- |
| `src/sim` (new) | Input record, car handling, drift rules, progress and respawn, the simulation itself | Pure like `src/gen`: no Three.js, no page, no clock, no `Math.random`, exact maths only. Added to `architectureRules.ts` and `tsconfig.pure.json` |
| `src/sim/physics` (new) | The only code that imports Rapier: loading it, building colliders, the car body | Rapier allowed here only (rule added) |
| `src/input` (new) | Keyboard and controller, turned into the same input record | Page code; the mapping functions are pure and unit tested |
| `src/camera/chase.ts` | Chase camera as plain numbers, like `flyAlong.ts` | |
| `src/render/carView.ts` | The car, drift sparks and boost flame in Three.js | |
| `src/app/drive.ts` | Fixed-step loop; joins input, simulation, camera and view | `worldPage.ts` stays the page wiring |

### Main pieces

- **Input record** (`src/sim/input.ts`): throttle, brake, steer, drift, reset, stored as small whole numbers so a keyboard and a controller give exactly the same kind of record. This is what ghosts will save in Milestone 5.
- **Simulation** (`src/sim/sim.ts`): `createSim(world, config)` gives `step(input)`, `state()` (plain numbers for drawing), `hash()`, `snapshot()` and `restore()`. The snapshot is Rapier's whole-world snapshot plus our own state, so a restored run carries on exactly.
- **Colliders** (`src/sim/physics/colliders.ts`), all from the `WorldResult`, in a fixed order:
  - ground: a Rapier heightfield from `world.ground` (off-road and steep banks);
  - road and kerbs: triangle meshes from `road.mesh` and `road.kerbs.mesh`;
  - walls: one solid box per wall piece, from the new wall spans (solid boxes, with continuous collision on the car, so a fast car cannot pass through a thin wall);
  - gate posts, tree trunks (cylinders) and rocks (balls). If step 1 shows that 20,000 tree colliders cost too much, only those within reach of the road get one.
- **Handling** (`src/sim/car/`): `suspension.ts`, `drive.ts` (engine, brake, reverse, slope help so a 15% climb costs little speed, hold on a sloped start line), `steer.ts`, `drift.ts` (the rules as a pure state machine: start above 40% of top speed, direction locked, tiers at 1, 2 and 3 s, boosts of 0.5, 1.0 and 1.6 s, cancelled by a wall or hard braking), `stability.ts` (keeps it on its wheels), `surface.ts` (road, kerb, grass, sand, rock, snow from what the wheel ray hit and the cover map; off-road cuts top speed by 40%).
- **Progress and respawn** (`src/sim/track/progress.ts`): where the car is on the lap (searching near its last place, so sections 40 m apart are not confused), checkpoints every 100 m, respawn at the last one after 1 s when in the water, off the map, upside down or stuck; R resets at once. Milestone 4 reuses the checkpoints for laps. Driving off across the island is allowed.
- **Open walls** (`src/gen/road/walls.ts`, new): each side of each sample keeps its wall if it is the outside of a real corner (with a lead in and out), another section of the lap is close on that side, or the ground beside the road is steep or drops (cuttings, embankments, cliffs, gorges). **Beaches stay open** (Claude's call, for Tane to judge at check-in 1: gentle sand down to the water is where "falling in the water" can happen). Short gaps are closed, short walls lengthened, wall ends taper to the ground. `Road.walls` holds the spans; `buildBarriers` draws them; the lab draws them on its map.
- **Chase camera**: behind the car, swings out in drifts, widens its view in boosts, never goes under the ground (matters in gorges and rock cuttings).
- **Page**: opens with the car on the start line. C switches chase, flying and circling. Space and arrows drive in the car and keep their old use when flying. `cam=fly`, `cam=orbit`, `look=`, `at=` and `lap=` still open their old views, so screenshot addresses keep working. A small readout shows speed, surface, drift tier and boost.
- **Tuning panel** (T key): sliders for the main handling numbers, live, with a button that copies them as text for `src/config.ts`. For the playtests.
- **Config**: new `car`, `sim`, `input`, `camera.chase`, `render.car` and `road.walls` sections in `src/config.ts`. Starting values: top speed 30 m/s, boost 1.3 times that, 0 to top in about 4 s.

**Reused as they are:** `sampleField` / `sampleGrid` (`src/gen/world/heightfield.ts`), `dsin` / `dcos` (`src/core/dmath.ts`), `createHasher` (`src/core/hash.ts`), `MeshBuilder` and `ROAD_MATERIAL` (`src/gen/road/`), the nearest-road and edge-distance maps (`src/gen/world/nearest.ts`), the ground-clearance idea in `src/camera/flyAlong.ts`, `src/testing/checkSeeds.ts` and `trackFixtures.ts`, the pattern of `e2e/determinism.spec.ts`.

### Risks

- **Browsers disagree even with the deterministic build.** Step 1 finds out before anything is built on it.
- **Our own springs jitter** on triangle edges. Fallback: Rapier's controller for springs only.
- **Tree colliders cost too much** (up to 22,000 trees). Fallback: only near the road.
- **Rapier's download** (a few MB) against "racing within 10 seconds". Loaded alongside world generation; measured in step 1.
- **Open walls invite shortcuts** across a corner's inside. Grass slowdown now; Milestone 4's checkpoints make a cut lap not count.
- **Driving tests in headless browsers are slow** (software drawing). Browser tests step the simulation directly instead of waiting in real time.
- **Every seed's world fingerprint changes** in step 2 (barriers only; layouts and islands do not).

### How to check it

- `npm test` (use `npx vitest run --maxWorkers=6` if the laptop is hot), `npm run typecheck`, `npm run e2e` before each commit.
- By hand: `npm run dev`, open `http://127.0.0.1:5173/?seed=7` (hilly), `?seed=1` and `?seed=3` (mountain, 15%), `?seed=42` (sloped start), `?seed=28496` (gorge). W/S/A/D or arrows, Space to drift, R to reset, C for cameras, T for tuning.
- Screenshots after each visual step: `$env:SEEDS = "1,3,7,42"; npm run e2e`, looked at before reporting.
- Step 9's table is the evidence for "drift-boost works through every corner type"; Tane's playtest is the sign-off.

The plan as approved is also in Tane's plan file: `C:\Users\tanee\.claude\plans\pasted-content-id-9e39-random-racing-playful-peach.md`.

## Step 1: the Rapier proof (2026-11-15)

`@dimforge/rapier3d-deterministic-compat` 0.21.0 installed (exact pin). New: `src/sim/physics/rapier.ts` (`loadRapier`), `colliders.ts` (`groundCollider`, `meshCollider`), `proof.ts` (the drop proof), their tests, and `window.seedCircuit.physicsHashFor(seed)` for the browser test.

**The answer the step was for:** a car-sized box thrown spinning down the start straight of seeds 1 and 7, tumbling over road and ground for ten seconds, gives **the same fingerprint in Node, Chromium and Firefox** (`e2e/determinism.spec.ts`), twice in a row, and after carrying on from a snapshot. So the car can be built on it.

Measured in Node on seeds 1, 3, 7 and 8 (throwaway code, deleted):

| What | Measured |
| --- | --- |
| Engine load | 43 ms in Node; 23 ms in Chromium and 33 ms in Firefox once the file has arrived |
| Download | 4.36 MB, **1.68 MB gzipped** (the engine's 3.1 MB of WebAssembly, carried as text inside the script). Its own file, fetched only when the physics is asked for. The 3D page's own script is 0.60 MB, 0.16 MB gzipped |
| Ground heightfield (901 by 901) | 2 to 6 ms to build |
| Road and kerbs as triangle meshes (14,000 to 20,000 triangles) | 6 to 12 ms |
| A collider for every tree and rock (2,300 to 10,000 a seed) | 4 to 12 ms |
| One step with a tumbling box | 0.18 to 0.24 ms; 0.67 ms on seed 8, the most wooded (10,000 trees and rocks). A frame has 16.7 ms |
| One ray cast with its surface normal; one cast of a 5 cm ball | 2 to 3 millionths of a second each |
| Whole-world snapshot | 6.7 to 8.7 MB; 3 to 11 ms to take, 4 to 23 ms to restore |

**Rays can miss the ground.** A ray dropped exactly on a grid point of the heightfield slips between the triangles that meet there about half the time (47,900 of 90,000 points), and at arbitrary points 3 to 8 times in 200,000. On the road mesh no ray slipped through (0 of about 3,000 a seed, on and between the mesh's own cross-sections). A ball 5 cm in radius cast the same way never missed, on the same 200,000 points, at the same cost.

**Decisions from the numbers:**
- **Every tree and rock gets a collider** (they cost almost nothing); the fallback of only those near the road is not needed.
- **The wheels will be cast as small balls, not bare rays** (step 4), so a wheel can never fall through the ground for a step.
- **Snapshots are for saving and restoring a moment** (debugging, a later rewind), not for every step: 7 to 9 MB each. Ghosts replay from inputs.
- The 1.68 MB download is fetched alongside world generation in step 5; whether it fits "racing within 10 seconds" on a slow connection is for Milestone 6's performance pass. The non-inlined build of the same engine would save about a quarter of it.

Found on the way: a first measurement seemed to show rays slipping through the road one time in six. It was the measurement: the rays were too short to reach the low side of a banked road.

## Step 2: open walls (2026-11-15 and 16)

`gen/road/walls.ts` decides where the walls stand (`Road.walls`, settings in `road.walls`), `buildBarriers` builds them with sloping ends, and the lab draws them. A wall is kept on the outside of every real corner (15 m before to 30 m after), where another part of the lap is within 80 m on that side, where the ground within 16 m of the verge rises or falls by more than **40%** on average, and for 14 m each way from the gate. Openings under 40 m are closed and walls under 24 m lengthened.

**Share of the roadside left open, seeds 1 to 200** (both sides counted; throwaway code, deleted):

| Seeds | How many | Least | 1 in 10 under | Middle | 1 in 10 over | Most |
| --- | --- | --- | --- | --- | --- | --- |
| All | 200 | 19% | 36% | 50% | 60% | 72% |
| Flat | 44 | 35% | 42% | 51% | 61% | 71% |
| Rolling | 68 | 19% | 35% | 51% | 61% | 72% |
| Hilly | 50 | 31% | 37% | 52% | 61% | 69% |
| Mountain | 38 | 22% | 29% | 41% | 56% | 63% |
| Mountain, climbing | 14 | 22% | 32% | 46% | 60% | 63% |
| Mountain, circling | 24 | 23% | 30% | 38% | 46% | 55% |
| Inland | 56 | 32% | 44% | 55% | 63% | 72% |
| Touches the sea | 80 | 23% | 39% | 51% | 60% | 71% |
| Coastal | 64 | 19% | 32% | 41% | 53% | 62% |

A lap has about 11 walls and as many openings. No seed is walled all the way round and none has no wall.

**What was tuned: the slope at which a wall is kept, 25% to 40%** (`road.walls.maxSlope`). With 25%, mountain seeds were walled nearly all the way round: 20% open in the middle, 9% at the least, and 20 of the 200 seeds under 20% open. The pictures showed why: walls beside ordinary grass hillsides. On mountain seeds 28% of the roadside (away from corners and close sections) has ground rising at more than 25% but only 12% at more than 35% and 2% at more than 50%; ground that falls is either under about 50% or a cliff of 100% and more. So 40% opens the hillsides and keeps every cutting and cliff walled. It sits just under the 45% bank the car is tested on in step 4. Flat, rolling and hilly seeds barely change (their middle was 46% to 50%).

Measured with the 25% rule, what each reason adds: without the corner rule the average lap would be 62% open instead of 42%, without the close-sections rule 49%, without the steep-ground rule 58% (mountain seeds 64% instead of 21%). Corners are the main reason for a wall everywhere but on mountains. Openings ran from 40 m to 1,271 m (middle 102 m), walls from 24 m to a whole side (middle 144 m).

**The sea is mostly behind a wall, and that is the ground, not the rule.** Where the sea is within 40 m of the road edge, the road is 10 m above it in the middle case (4 m at the low end), so most of it is a cliff or a steep bank, and nearly half of it is the outside of a corner. Of that roadside 13% is open (8% with the 25% rule); within 20 m of the sea, 5% (was 0.3%). 68 of the 137 seeds with sea beside the road have an opening of 40 m or more facing it (was 51): 30 of 36 flat seeds, 29 of 48 rolling, 9 of 30 hilly, none of 23 mountain. So "falling in the water" will happen on some flat and rolling seeds and rarely elsewhere. For Tane at check-in 1.

**Pictures looked at:** seeds 1 to 20 in two batches of ten (lab picture and 13 3D pictures a seed; all 286 screenshot tests passed), the four road-level views of each seed joined into one sheet; six mountain seeds again with the 40% rule; and close views of two wall ends on each of the 20 seeds (`at=x,z`, zoomed to about 38 m). Walls stand on the outside of corners, above cliffs, along cuttings and at the gate; straights across open ground have grass on both sides; low coast roads run down to grass and sand with no wall (seeds 7 and 9). Every wall end looked at slopes down to the ground with no gap under it.

**Left for later:**
- A wall's end is a ramp, 0.8 m up over 6 m. A car that meets it head on could ride up it. Step 3 gives each wall piece a box; step 7 (bumps) must check what a sloping end does to the car, and may want the end's boxes blunt.
- A hillside of up to 40% beside a mountain road is now open. Whether the car can drive back up one, and whether a long slide down needs a respawn, is for steps 4 and 8.
- In the lab the wall lines are thin when the whole island is in view.

## Step 3: the simulation skeleton (2026-11-16)

New in `src/sim`: `input.ts` (the input record), `quat.ts` (turns as plain numbers: `quatFromAxes`, `rotate`), `start.ts` (`startPose`), `sim.ts` (`createSim`), `script.ts` (a made-up driver's inputs and the run's fingerprint), and in `src/sim/physics`: `colliders.ts` (everything the car can hit) and `carBody.ts` (the physics world and the car's body; the rest of the simulation never sees Rapier). Settings: `sim` (60 steps a second, gravity, the start, collider shapes) and `car` (body size, mass, grip, bounce).

- **The car's body** is one solid box, 1.4 m wide, 0.6 m high and 2.2 m long, 300 kg, always awake, with continuous collision detection. Its front is its -z side, its right its +x side, its roof its +y side (as Three.js has it).
- **It starts** 4 m behind the start line in the middle of the road, facing along the lap and tipped with the road, its underside 5 cm above it.
- **`step(input)`** moves the physics on by one sixtieth of a second and remembers the input. **Inputs do not move the car yet** (step 4).
- **`hash()`** covers the step count, the last input and the body's position, turn, speed and spin, bit for bit.
- **`snapshot()` and `restore()`**: Rapier's whole world plus the step count and the last input. A restored run carries on exactly, in the same simulation or a new one, and a snapshot can be restored more than once.
- **Same in Node, Chromium and Firefox**: the scripted run (ten seconds on seeds 42 and 7, fingerprint mixed twice a second) gives one fingerprint everywhere (`e2e/determinism.spec.ts`, `window.seedCircuit.simHashFor`).

Measured in Node on seeds 42, 7, 1, 8 and 3 (throwaway code, deleted):

| What | Measured |
| --- | --- |
| Building a simulation (every collider and the car) | 16 to 33 ms |
| One step with the car at rest | 0.26 to 0.32 ms; 0.73 ms on seed 8 (10,000 trees and rocks) |
| Snapshot | 6.8 to 8.9 MB; 3 to 9 ms to take, 4 to 26 ms to restore |
| The car at rest for 10 s on a sloped start | Does not move on seeds 42 (6.5%), 7 (7.9%) and 8 (4.6%); creeps 0.2 mm on seed 3 (9.2%) and 6 mm on seed 1 (12.8%) |

**For step 4:** the body rests on the road on its own underside for now, held by its grip of 1 (`car.grip`). On the steepest starts it creeps a few millimetres in ten seconds. Once the wheels carry the car, the hold on a slope belongs to `drive.ts`, as planned, and the body's grip should come down so that it slides along what it scrapes.
