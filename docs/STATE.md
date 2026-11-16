# Project state

Updated at the end of every work session. A new session should read this first, then `docs/GAME_BRIEF.md`.

The step-by-step record of Milestones 1 and 2 (plans, measurements, check-ins and the session log) is in `docs/archive/STATE-milestone-1-2.md`. Decisions, known issues and working agreements from those milestones are still here.

## Where we are

- **Current milestone:** 3, Driving ([issue #3](https://github.com/TechnologicTEC/Random-Racing/issues/3)). Milestones 1 and 2 are merged and signed off (PR #7, PR #9)
- **Branch:** `milestone-3-driving`. `main` is protected by a GitHub ruleset (no force pushes, no deletion, pull request required); one pull request per milestone, merged after Tane signs off
- **Last finished step:** 3, the simulation skeleton (parts 3a to 3c, see "Step 3"): `createSim(rapier, world, config)` in `src/sim/sim.ts` stands the car's body behind the start line and gives `step`, `state`, `hash`, `snapshot` and `restore`. The car does not drive yet: inputs are recorded but move nothing. Step 2 (open walls, see "Step 2") finished the same day
- **Next step:** 4, springs, engine, steering and grip (no drift yet). Split it into lettered parts before starting; the wheels are cast as 5 cm balls (step 1), and `car.grip` (the body's own grip, 1 for now) should come down once the wheels hold the car

## Milestone 3 steps

Tests first, watched failing. Unit and browser suites pass before each commit; commit and push after each step; short report after each step.

| # | Step | Ends with | Status |
| --- | --- | --- | --- |
| 0 | Create `milestone-3-driving` from `main`. Record the plan and the choices here; move the Milestone 1 and 2 step-by-step detail to `docs/archive/STATE-milestone-1-2.md`. Note the Rapier choice on issue #3 | Pushed | Done |
| 1 | **Rapier proof.** Install the pinned package. Throwaway measurements, then kept tests: it loads in Node and both browsers; a ray dropped on the heightfield meets the ground's own height at grid points (seeds 1 and 7); a box dropped and stepped 600 times gives the same fingerprint twice, after a restore, and in Node, Chromium and Firefox | Numbers here: load time, download size, collider build time (with every tree), step time, snapshot size. **If the browsers disagree, stop and report to Tane** | Done (see "Step 1") |
| 2 | **Open walls** (generation only). `gen/road/walls.ts`, `Road.walls`, barriers drawn from spans with tapered ends, world fingerprint, lab drawing, barrier and 20-seed tests updated | Share of each lap left open over seeds 1 to 200; screenshots of seeds 1 to 20 checked by eye | Done (see "Step 2") |
| 3 | **Simulation skeleton.** Rules for `src/sim`; input record; colliders; the car body placed on the start line; `step`, `state`, `hash`, `snapshot`, `restore` | Tests: the car settles and stays put for 10 s on a sloped start (seed 42); same inputs, same fingerprint; restore carries on exactly | Done (see "Step 3") |
| 4 | **Springs, engine, steering, grip** (no drift yet) | Tests on simple test grounds (flat, 15% ramp, banked bend, 200 m crest, kerb, 45% bank): top speed, time to top speed, braking, reverse, at most 10% slower up 15%, steady cornering, wheels stay down over the crest, never flips | |
| 5 | **Drive it.** Keyboard and controller, fixed-step loop, the car drawn (low-poly, built in code), chase camera, readout; the page opens driving | Browser tests: car on the start line, W moves it, C switches cameras, old addresses still work, no console errors. Screenshots of the car on several seeds checked by eye | |
| | **Check-in 1 with Tane:** drive a few seeds. Speed, steering, camera, where the walls are | Feedback | |
| 6 | **Drift and boost.** The drift rules, hop, slide, tiers, boost; sparks in the tier's colour and a simple boost flame; camera swing and wider view; tuning panel | Tests: every rule in the brief's drift list; boost raises top speed for exactly its time | |
| 7 | **Surfaces and bumps.** Off-road slowdown, gentle wall bounce (cancels a drift, keeps most speed along the wall), trees and rocks, kerbs | Tests: 40% slower on grass and sand; a 30° wall hit keeps the car moving and upright; a tree stops it without flipping | |
| 8 | **Progress and respawn.** Place on the lap, checkpoints, water, off the map, upside down, stuck, R | Tests on real seeds: drive into the sea and come back at the last checkpoint 1 s later, facing along the road | |
| 9 | **Bot driver and the corner proof** (`src/testing/botDriver.ts`: follows the centre line, drifts where told). It laps seeds 1 to 20 in Node, and drifts through a hairpin, a sweeper, a chicane and a plain corner on real seeds. A scripted lap gives the same fingerprint in Node, Chromium and Firefox | Table here: lap times, wall hits, respawns (must be 0), drift exit speed against no-drift per corner type, the 3 km 15% seeds included | |
| | **Check-in 2 with Tane:** drift feel, with the tuning panel | Feedback | |
| 10 | Tuning from feedback; `npm run perf` with the car; README, CLAUDE.md and this file; pull request | **Tane's playtest sign-off**, then merge | |

### Step 3 parts

| Part | What | Status |
| --- | --- | --- |
| 3a | Rules for `src/sim` in `testing/architectureRules.ts` (may import `core`, `gen` and itself, config types only; exact maths, no clock, no chance; Rapier only in `src/sim/physics`, and nowhere else in `src`), `src/sim` in `tsconfig.pure.json`; the input record (`src/sim/input.ts`) | Done |
| 3b | Colliders in `src/sim/physics/colliders.ts`: a solid box for each piece of each wall (the sloping ends included), three boxes for the gate, an upright post for each tree trunk, part of a ball for each rock; `addWorldColliders` adds them all, with the ground, road and kerbs, in a fixed order, and returns their handles. The walls and the gate come from the same numbers that are drawn (`wallPieces` in `gen/road/barriers.ts`, `gateBoxes` in `gen/road/startGate.ts`). `sim.colliders` in `src/config.ts`. Tests on seed 7 with rays (wall faces, tops and feet, openings, posts, beam, trunks, rocks) and a ball rolled at a wall and through an opening | Done |
| 3c | `car`, and the clock and start in `sim`, in `src/config.ts`; the car body placed on the start line (`src/sim/physics/carBody.ts`); `createSim` in `src/sim/sim.ts` with `step`, `state`, `hash`, `snapshot`, `restore`. Tests: the car settles and stays put for 10 s on seed 42's sloped start; same inputs, same fingerprint; a restored run carries on exactly; the same fingerprint in Node, Chromium and Firefox | Done |

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

## Working agreements

- Branch + pull request per milestone. Commit and push after each step. Direct pushes to `main` are blocked, including docs updates.
- Models: plan each milestone with Fable 5.2 at high effort; mechanical steps after plan approval can use medium effort or a cheaper model (Tane's call).
- Start each milestone in a fresh session: read `CLAUDE.md`, this file and `docs/GAME_BRIEF.md`, then plan in plan mode.
- Playwright runs three browsers at a time (15e; first thought to be load, but the failures then turned out to be the laptop going into standby).
- When the laptop is hot it runs at half speed and tests time out (2026-11-15 evening: 19 browser timeouts, unit tests over their 20 s limit). Run unit tests with `npx vitest run --maxWorkers=6`, or let it cool; Tane can run `npm run e2e` by hand.
- Keep the laptop awake while the test suites or `npm run perf` run: Modern Standby stalls the browsers, and tests fail with worlds that never load or `ERR_NETWORK_IO_SUSPENDED` (found 2026-11-15).
- Never let a failing test run be followed by a commit in the same command. On 2026-11-12 a Firefox failure was committed past because the test output was piped through a filter, which hid the exit code.
- Throwaway measurements go in a temporary `src/explore.tmp.test.ts` (deleted before committing). One-off screenshots: copy a script into `test-results/` (ignored by git) so it can import Playwright, with `npm run dev` running. Every Playwright run empties `test-results/`, so keep the script's master copy in the scratchpad and copy it in again.
- Run Vitest from PowerShell. From Git Bash every test file fails with "Vitest failed to find the current suite" (found 2026-11-14).
- On this machine, bash heredocs fail when their text has an odd number of apostrophes. Write multi-line scripts and test files with the Write tool, then run them.
- Windows and PowerShell: use `python -I` scripts in the scratchpad for multi-line file edits; avoid bash heredocs containing backticks or `${}`.
- Never edit a source file with PowerShell's `Get-Content` and `Set-Content`: Windows PowerShell 5.1 reads UTF-8 as ANSI and writes it back damaged (found 2026-11-16 on `lab.ts`). In a Python script fed through a bash heredoc, `\'` comes out as a bare apostrophe, so keep apostrophes out of test titles written that way.
- **No Claude attribution** on commits, pull requests or issues.
- Milestone 1 pace: short report after each step; one mid-point check (done) and a sign-off at the end.
- Milestone 2 pace: short report after each step; two check-ins (after step 6 and after step 11) and a sign-off at the end.
- Milestone 3 pace: short report after each step; two check-ins (after step 5 and after step 9) and a playtest sign-off at the end.
- **Stop at clean boundaries** (Tane, 2026-11-15): big steps are split into lettered parts that each end with passing tests, a commit, a push and this file saying what is next, so a usage-limit cut-off never lands in the middle of one. Do not start the next part's edits while a long test run for the last one is still going.
- No linter or formatter for now. The architecture rules are enforced by a DOM-free type check of `src/core` and `src/gen` and by `src/architecture.test.ts`.
- **Generator quality comes before viewer features.** If Milestone 1 runs long, trim the viewer, not the generator.
- Tests are written before the code they cover.

## How track generation works now

1. **Style.** Each seed gets one style: folded (50%), stretched (25%) or round (25%).
2. **Skeleton.** Each of the 30 candidates builds a closed polygon of 10 to 18 corners (the brief's control points): a base shape, then *folds* (inlets pushed in, fingers pushed out), *jogs* (sideways steps that become chicanes) and *bows* (long gentle curves). A narrow fold's sides become parallel straights and its end becomes a hairpin.
3. **Rounding.** Every corner is replaced by a circular arc of a chosen radius (never under 18 m); the rest of each edge stays an exact straight. Half the tracks are reversed.
4. **Validate, analyse.** Some reliefs have their own limits (`track.byRelief`): mountain seeds allow laps of 1.6 to 3 km in a 600 m area.
5. **Turn, lay over the ground, score, pick.** A valid layout is tried at several turns about the centre (8 on mountain seeds, 4 on hilly, 1 on the others). At each, the road's height is solved over the seed's relief and the earthworks rule applied; the best-scoring turn that keeps it is kept. The winner's lap starts 40% of the way along its longest straight.

Files: `src/gen/track/layout.ts` (builder), `fillet.ts` (corner rounding), `skeleton.ts` (polygon checks), `validate.ts`, `analysis.ts`, `rules.ts` (rules by relief), `earthworks.ts`, `score.ts`, `pipeline.ts`. All numbers are in `src/config.ts`.

## Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-11 | Package name `random-racing`; on-screen title "Seed Circuit" (working title) | Repo and brief use different names |
| 2026-11-11 | Seeds are whole numbers 0 to 4,294,967,295; "new track" picks 1 to 99999 | Short share codes like the brief's `v1-48213` |
| 2026-11-11 | Generator version is `v0` during development, `v1` at release | Seeds will change while tuning; the "old seeds rebuild exactly" promise starts at release |
| 2026-11-11 | Track first, island second: layouts only need to fit a buildable circle of 500 m radius | The brief says terrain fits the road |
| 2026-11-11 | Elevation part of the score waits for M2 (shown as pending, zero weight). Done in M2 step 4 | Needs terrain |
| 2026-11-11 | Generation runs on the main thread in M1; Web Worker in M2 (done in M2 step 2) | Takes about 45 ms per seed without terrain |
| 2026-11-11 | Extra hard rule: track must fit the buildable circle. Start line goes on the longest straight | Not in the brief's list but needed |
| 2026-11-11 | Pinned Vite 8.3.5, TypeScript 7.0.2, Vitest 5.0.5, Playwright 1.64.1 | Newest releases at least two weeks old |
| 2026-11-11 | Generation code may only use exact maths (`+ - * /`, `Math.sqrt`, and `core/dmath.ts` for sin/cos); enforced by the architecture test | Browsers may round `Math.sin` etc. differently, which would break "same seed, same track" |
| 2026-11-11 | Three.js (0.187.0) and Rapier (0.21.0) not installed until M2 and M3; re-check versions then. Three.js installed 2026-11-12 (still the newest) | Not needed for the 2D lab |
| 2026-11-12 | **Layouts are built from a folded corner skeleton, not a ring of noisy points** | Tane's mid-point feedback: tracks should fold back on themselves like real circuits, not imitate a circle; hairpins were being rejected as too tight |
| 2026-11-12 | **The centre line is exact straights and arcs, not a Catmull-Rom spline** (departs from the brief) | The spline wobbled where a straight met a corner and made corners about 10% tighter than asked. Exact arcs give exact radii and truly straight straights. `spline.ts` is kept for tests and later uses such as camera paths |
| 2026-11-12 | One style per seed (folded, stretched, round) | Otherwise the scorer picks the same kind of track for every seed |
| 2026-11-12 | The builder keeps its own margins (18 m radius, 40 m clearance), so nearly every candidate is valid | All 30 candidates then compete on fun. The validator stays as the final check |
| 2026-11-12 | Flow score wants 7 to 13 real corners | Tane: how technical the tracks are is about right |
| 2026-11-12 | Drift score needs most corners to suit drifting, not just five of them | The score was saturating near 100 |

| 2026-11-11 | **Milestone 2 plan approved.** Three.js pinned at 0.187.0 with `@types/three` 0.187.0 (dev only), added at step 7 | Still the newest on 2026-11-11; published 2026-10-30, two weeks old on 2026-11-13. Tane chose it over 0.186.1 |
| 2026-11-11 | Elevation counts for 12% of the fun score; the other four parts drop from 25% to 22% each | Tane's choice. Some Milestone 1 winners change; allowed while the generator is v0 |
| 2026-11-11 | Terrain where the road runs is "rolling": 15 to 30 m between a lap's lowest and highest point | Tane's choice over gentle or bold |
| 2026-11-11 | The relief depends on the seed only; the coast and scenery are shaped by the winning track | Lets all 30 candidates be scored on elevation cheaply, and puts hills where the track climbs |
| 2026-11-11 | Generation also produces the road, kerb and barrier triangle lists; rendering only colours them | Milestone 3 needs the same shapes for collisions, and they must be the same on every machine |
| 2026-11-11 | `generateTrack(seed, config)` now takes the whole generation config (track, road, world), not just the track part | It needs the relief and road rules to give every candidate a height profile |
| 2026-11-11 | Hills are 33 m tall over a 3 m lowland, 800 m per noise unit; ground height is squared so lowlands are wide | Tuned on 3,000 layouts to match the "rolling" choice: 79% of each lap is under a 6% grade |
| 2026-11-11 | Elevation score is 60% height range (full marks at 24 m) and 40% total climb (full marks at 40 m per lap) | Rewards laps that use the hills without demanding the steepest ones |
| 2026-11-11 | Flow penalty for each real corner outside 7 to 13 raised from 0.15 to 0.25 (`flowCornerPenalty`, now in config) | With elevation counting, seed 151's winner dropped to 6 corners. Tane's corner-count preference should outweigh a slightly hillier lap |
| 2026-11-12 | The coast margin is worked out from a smoothed map of nearby road height, not the single nearest road point | Where two sections of different height were equally near, the coast jumped and made cliffs |
| 2026-11-12 | Headlands are their own gentle landform, not extra margin | As extra margin they could change the coast by 9 m per metre and made 200% slopes behind beaches |
| 2026-11-12 | Every noise pattern is slid to a random place per seed (`shiftedNoise`) | All noise is exactly zero at the map origin, so every island had a crease at its centre |
| 2026-11-12 | Playwright runs at most 4 browsers at once, with a 60 s test timeout | Each page now generates whole islands; with 11 at once Firefox timed out |
| 2026-11-12 | Contact sheet islands use an 8 m grid (the lab and the game use 2 m) | Sixteen times quicker, and no different at thumbnail size |
| 2026-11-12 | The ground under the road is good to the grid: exact under the road itself, and up to about 5 cm low on the outer half metre of the verge | The verge (2.5 m) is only just wider than a grid cell (2 m), so the last cell before the bank is already sloping away |
| 2026-11-12 | **Tane's island feedback (check-in 1):** sea 15 to 35 m from the road in most places with a few spots at 10 m and never closer; beach 5 to 25 m; some cliff-like drops; 1 to 2 headlands reaching 30 to 60 m; 1 to 2 bays; one interior peak 40 to 70 m tall at least 60 m from the track; 15 to 25 m of height near the road; smooth coastline edge | Replaces the first island design, where the coast distance grew with road height (45 to 170 m) |
| 2026-11-12 | The coast no longer depends on road height; a high road beside the sea gets a cliff instead of a long slope | Needed to bring the sea within 15 to 35 m everywhere |
| 2026-11-12 | The road is fitted into the inland ground first; the coast is carved afterwards | With the sea this close, embankments were spilling into it and sea cliffs were being counted as road banks |
| 2026-11-12 | Headlands reach 40 to 60 m (the top of Tane's 30 to 60), so they stand out from the usual 15 to 35 m margin | A 30 m headland would not be visible against a 35 m coast |
| 2026-11-12 | Bays and headlands act along a line straight out to sea from a point on the road, and the wobble is switched off inside them | Measured from the road centre in all directions they had faded by the time they reached the shore |
| 2026-11-12 | The peak's sides may be up to 160% steep; the summit height comes first | With a gentler limit, small infields gave peaks under Tane's 40 m |
| 2026-11-12 | The sea bed shelves at one slope everywhere (18%) | Varying it with noise made dark blotches in the sea |
| 2026-11-12 | The distance-to-road map now measures to the centre line itself (exact to under 5 cm), not to its sample points | Errors of up to 1 m were being magnified by 250% cliffs into ragged edges |
| 2026-11-12 | The lab draws the island at two pixels per height sample (four on contact sheets), blending heights before colouring | One flat-coloured pixel per sample made the waterline stair-stepped |
| 2026-11-12 | Only `src/render` may import Three.js, enforced by `architecture.test.ts` for every other source file | Keeps drawing apart from everything else, as the brief asks |
| 2026-11-12 | Triangle data for the ground is built without Three.js (`render/terrainChunks.ts`, `render/palette.ts`); `worldView.ts` only wraps it | So it can be unit tested, and later built in the worker if the main thread needs the time |
| 2026-11-12 | The 3D page is loaded on demand (`import('./app/worldPage')`) | The lab then never downloads Three.js (about 500 kB) |
| 2026-11-12 | Colours are written as ordinary screen colours and converted to linear light for Three.js | Three.js 0.187 does its lighting in linear light; the demo's r128 did not |
| 2026-11-12 | Banking: full 8 degrees for corners of 70 m radius and wider, 35% of that for 20 m hairpins, fading to nothing between 180 and 400 m radius; eased over 30 m | The brief asks for up to about 8 degrees "in fast corners". Averaging the tilt along the lap gives the easing the centre line lacks |
| 2026-11-12 | The road mesh gives every flat-coloured strip its own vertices, and each vertex a material number | Colours stay crisp (paint does not smear into asphalt), and Milestone 3 can tell surfaces apart |
| 2026-11-12 | No separate "road frames" module yet | The ribbon only needs the centre line, the height and the tilt. Frames can come with the fly-along camera if it needs them |
| 2026-11-12 | Kerbs run the whole corner plus 4 m each end, at most 70 m (centred on a longer corner); 1 m wide, 9 cm high at the outer edge, tapering to nothing over 4 m at each end | The brief asks for "kerbs on the apexes". Low and tapered so the car can ride them in Milestone 3 |
| 2026-11-12 | Barriers stand 1.8 m outside the road edge (clear of the 1 m kerbs, inside the 2.5 m verge), 0.8 m high, with a footing 0.6 m into the ground | At the outer edge of the verge the ground already dips on a steep bank; a shallow footing left a 2 cm gap on seed 1 |
| 2026-11-12 | Barriers are red and white on the outside of real corners and plain elsewhere | Shows a driver where the corner goes, and breaks up a long grey wall |
| 2026-11-12 | The flying camera follows the centre line averaged over 16 m, 4 m above the road, looking 30 m ahead, at 28 m/s | Averaging makes it sweep through corners; 4 m clears the barriers and passes under the gate's 6 m beam |
| 2026-11-12 | The 3D page opens flying; `cam=orbit` opens circling, `still=1` opens paused, `lap=0.5` opens half way round | Flying is what the milestone asks for; the options make screenshots repeatable |
| 2026-11-12 | The page draws a frame only when something changed | A paused or circling camera then uses no power |
| 2026-11-12 | **Check-in 2: rework the islands** (see "Milestone 2 rework"). Mountains 200 to 250 m, 0 to 4 per island; island up to about 2.5 km across; land extends past the track except on coastal stretches | Tane: islands too flat and basic, mountains too small, track stuck to the coast |
| 2026-11-12 | Up to 15% gradient on mountain-relief tracks; 8% on all others (departs from the brief's 8%) | Tane's choice, so some laps really climb. Milestone 3 must tune the car on both |
| 2026-11-12 | Road width 12 m, widening to 22 m in places on some tracks (departs from the brief's 12 to 14 m) | Tane's choice |
| 2026-11-12 | Each seed gets a character of independent traits (relief, coast, mountains, width, plus the existing layout style) | Tane: not every criterion should apply to every track |
| 2026-11-12 | Tile 2700 m with 3 m cells and a 4 m verge (was 1400 m, 2 m, 2.5 m) | Room for mountains about 700 m across; keeps the height count near 800,000; a verge wider than a cell removes the verge dip |
| 2026-11-12 | The rework starts in a fresh session | This session was at about 670,000 tokens; STATE.md carries the handover |
| 2026-11-12 | The character is drawn from the `world` stream, one sub-stream per trait (`world/character/relief` and so on). The layout style stays where it was, on the `track` stream | Traits stay independent, changing one trait's weights never reshuffles another, and no layout changed when the character was added |
| 2026-11-12 | The number of mountains is an even draw within the relief's range (flat 0 to 1, rolling and hilly 0 to 4, mountain 1 to 4), set in `world.character.mountains` | The plan only fixed the ranges. Tane judges how many is right at check-in 3 |
| 2026-11-13 | **Hilly and mountain seeds get a highland to one side of the track, and the track sits on its flank** (`gen/world/relief.ts`, `placeHighland`). The flank is a cone around the highland's flat top: 8% for hilly, 15% for mountain, never steeper than the road may climb, so a road can run straight up it. It starts to rise 300 m on the low side of the centre, so big tracks also reach flat ground | This is the plan's "broad ramp". Measured in a spike first: an 18% flank (the plan's upper figure) pushed 15% of candidates to within 1 m of the cut and fill limits, and a 15% flank none |
| 2026-11-13 | Hills are lower on hilly and mountain seeds (14 m and 12 m, against 33 m on rolling ones) | The flank already uses the road's whole gradient; taller hills on top of it broke the cut and fill limits |
| 2026-11-13 | The highland's flat top is 200 m in radius and starts 60 m beyond the buildable area. `placeHighland` reports where it is | R7 stands the main mountain on it, so the track visibly climbs the mountain's flank |
| 2026-11-13 | Elevation score targets by relief (range, climb): flat 3 m and 5 m, rolling 24 m and 40 m (as before), hilly 55 m and 85 m, mountain 110 m and 160 m | Flat seeds are not marked down for being flat; hilly and mountain seeds favour the layouts that use the climb |
| 2026-11-13 | `road.maxGradient` is one value per relief; `solveProfile` is told the limit, `scoreLayout` the relief | The plan: 8% everywhere except 15% on mountain seeds |
| 2026-11-13 | Bare rock by height now starts at 130 m (was 34 m); the lab's map colours keep grass up to about 105 m, with rock and snow above 150 m | A mountain seed's road climbs to about 120 m, and the whole hillside was being drawn as rock |
| 2026-11-13 | The island tests on real seeds are pinned to rolling ground for now (`testing/characters.ts`, `withCharacter`) | They describe the island as it was before the rework. R6 and R7 rewrite them trait by trait |
| 2026-11-13 | The usual road width is 12 m (was 13 m), set in `track.roadWidth`. Layouts are still built and judged at that width | Tane's choice at check-in 2. A few winners changed, because the gap rule is 2.5 road widths |
| 2026-11-13 | **Only straights are widened** (`gen/road/width.ts`, rules in `road.width`): the start straight always; other straights of 150 m or more, and a straight of 100 m or more after a hairpin, with a 60% chance each. Each widened straight gets one width between 16 and 22 m | The plan's "start straight, long straights and hairpin exits". Corners keep the usual width, so kerbs, banking and corner radii are unchanged |
| 2026-11-13 | Each change of width takes about 40 m and is finished 20 m before the straight ends | The plan: eased like banking, by averaging twice. An edge moves sideways at 25% at most |
| 2026-11-13 | No widening where a separate part of the lap passes within 70 m, centre to centre (`road.width.clearance`) | The plan: the bank between close sections keeps its room. 70 m is beyond the 55 m at which sections share a bank, so the road-height solver can go on using the usual width |
| 2026-11-13 | If none of a varied seed's straights is picked, the one with the most room is widened | Otherwise a varied seed whose start straight has no room, and whose other straights all lose the draw, would look constant |
| 2026-11-13 | The width comes from the `track` stream's `width` fork, one sub-stream per straight, and is worked out in `generateWorld` after the winner is known. It is `WorldResult.road.width` and part of the world fingerprint | The plan: it must never change which layout wins |
| 2026-11-13 | The island keeps a map of each cell's distance to the road edge (`Island.edge`, from `edgeDistance`). The coast, the cover, the bumps and the peak all measure from it | One place knows the true edge; before, every module subtracted half of one fixed width |
| 2026-11-13 | A cell exactly at the outer edge of a verge takes that section's road height (`fit.ts`) | Found by R5's grid: its blend weight came out as infinity over infinity, and 143 cells of a test fixture became NaN. A test now checks every fitted height is a real number |
| 2026-11-13 | **The hinterland is a pattern of noise cut at a level** (`shapeHinterland` in `island.ts`, rules in `world.hinterland`). Above the cut the land runs on 120 to 600 m past the road, rising with the pattern; below it there is no hinterland; a short ramp joins them. The cut is chosen per seed so that the share of the road by the sea is what the coast trait asks: none for inland, 15 to 40% for touches, 70 to 95% for coastal | First tried lowering the whole pattern: that left long stretches with the sea 40 to 80 m out, neither by the sea nor with land running on. Measured on 8 seeds per trait before changing |
| 2026-11-13 | The hinterland's coast uses the same profile as the coast beside the road (`coastProfile`), climbing from its waterline to the nearby road height over the whole reach, never steeper than half a sea cliff; the island's limit is the higher of the two coasts, so the hinterland only ever adds land | A fixed gentle climb would have carved a cliff beside a 100 m mountain road. The plan's rule: its own landform with bounded slopes, never a multiplier on the margin |
| 2026-11-13 | Sea cut off from the open sea is filled in: the hinterland's coast is measured from the open sea instead (`fillCutOffSea`) | Pools appeared inside the land, and on high ground they were pits dug down to sea level |
| 2026-11-13 | Bays and headlands go only where the road is by the sea (`Island.seaside`); inland seeds have none | Elsewhere the hinterland would hide them |
| 2026-11-13 | The coast starts 7 m from the road edge (`coast.clear`, was 5 m): the verge plus a whole grid cell | On the 3 m grid a sea cliff starting at 5 m pulled down the ground read under the barrier (seed 42's barrier top stood 2.2 m clear). A bay beside a road at 12 m now comes in to about 12 m rather than 10 m |
| 2026-11-13 | Contact sheet thumbnails frame the whole island (buildable area plus 600 m) | The land now runs well past the track; the old frame cut it off. A test checks every thumbnail's edge is sea |
| 2026-11-13 | The near-coast island tests (`island.test.ts`) run with the hinterland off (`reach: [0, 0]`); `hinterland.test.ts` covers the traits | They test the coast beside the road, which is unchanged |
| 2026-11-13 | **Mountains replace the single peak** (`placeMountains` in `island.ts`, rules in `world.scenery.mountains`). As many as the character asks for (0 to 4); the main one 200 to 250 m above the sea, the others 80 to 200 m; each a round bell whose foot is as wide as its height needs for sides of 110%; no part of the foot within 60 m of the road; summits no closer than the larger mountain's radius | The plan |
| 2026-11-13 | On a mountain seed the main mountain stands on the highland's flat top, or as near it along the same line as there is room. Elsewhere mountains go where the land already is if they can, then as near the road as they fit, so they are seen from the track | The plan: "the track visibly climbs its flank" |
| 2026-11-13 | A mountain's foot is never cut down by the coast, and around it a skirt of land (60 m, or wider beside high ground) climbs from the sea to the land's height, with the sea bed shelving beyond it | The plan: land includes every mountain's foot; the hinterland "grows to hold them". Without the shelf, the sea bed dropped 22 m in one cell at the skirt's edge (500% slopes) |
| 2026-11-13 | The ridges on a mountain's sides are as wide as its foot's radius and a quarter of its height deep at most; its smooth shape uses 80% of the slope limit and leaves the rest for them | With the old peak's 60 m ridges, a 200 m mountain had sides of 250% to 450% |
| 2026-11-13 | A mountain must rise at least 40 m above the ground it stands on (`minRise`) | On the highland's plateau a second mountain came out 2 m wide |
| 2026-11-13 | Foothills are one smooth layer of noise, 5 to 25 m high and about 150 m across, fading in from 60 m beyond the road edge and fading out before a mountain's foot | Two layers made sides of up to about 117% and rock-coloured spots |
| 2026-11-13 | The hinterland's coast (and land filled in where sea was cut off) climbs to the height of the land there, not of the nearest road | The nearest road's height jumps where the nearest part of the track changes; on a mountain seed that carved straight creases across the land (seed 12) |
| 2026-11-13 | Snow is a fifth cover map (`Cover.snow`), from 180 m to full at 200 m, lying over rock and grass; white in 3D | The plan |
| 2026-11-13 | **Far ground at quarter detail**: a chunk none of whose square comes within 250 m of the road uses every second height each way (`render.detailDistance`, `render.farStride`). Where a full chunk meets a coarse one, the full chunk's edge heights are laid on the coarse chunk's edge, so no crack opens | Pulled forward from step 15, as the plan says. Fixed when the world loads, not by camera distance: the flying camera is always on the road. 400 m saved only 18% to 27% |
| 2026-11-15 | **A third level of ground detail**: a sixteenth of the triangles beyond 500 m from the road, and for sea bed 4 m or more under the sea (`render.detail`); no grass on ground drawn coarse | 74% to 88% of R8's ground triangles on eight seeds; on the Arc laptop triangles are cheap, so this is for weaker cards. Blades on coarse ground stood up to 1.7 m off it |
| 2026-11-13 | Haze from 1,500 m to 6,600 m (was 900 to 4,200), sea 16 km across (was 9 km), orbit camera out to 3,600 m (was 2,400) | The plan: scaled for the 2,700 m tile. A test checks the far side of the tile stays inside the haze from the furthest orbit |
| 2026-11-13 | The 3-second budget test runs in its own Playwright projects (`chromium-budget`, `firefox-budget`), after all the other tests, and takes the fastest of three builds | Headless browsers draw WebGL in software. With four of them drawing islands at once, a world took 3.1 to 4.8 s; alone it takes 0.7 to 1.2 s |
| 2026-11-13 | **Check-in 3 response approved.** Mountain-relief seeds may have laps up to 3 km (departs from the brief's 1.4 to 2.4 km); the gradient stays 15% | Tane's choice: a 15% road on a 2.4 km lap can rise only about 150 m, short of a 200 to 250 m mountain. 3 km allows about 180 m |
| 2026-11-13 | Every mountain-relief seed climbs onto its main mountain and goes round it; hilly seeds climb the lower slopes of one beyond the track | Tane's choice (check-in 3: tracks should include the mountains) |
| 2026-11-13 | Mountain shape is a per-seed trait: ridged range about 40%, rolling hill country about 35%, lone peak about 25% | Tane's choice (check-in 3: mountains are copies of one cone) |
| 2026-11-13 | **Mountain seeds are half climbing, half circling** (C1) | Tane's choice: in the spike a lap either climbed high (median 120 m) or went round the mountain (three in four fully round, median 77 m), never both |
| 2026-11-13 | Mountain seeds get a 600 m track area (others keep 500 m), 8 candidate turns and 25% weight on elevation | C1: a 500 m area capped the climbing median at 105 m; the wider area and weight lift it to 120 m with 5 of 200 laps under 90 m |
| 2026-11-13 | `Character.landform` (`range`, `hills`, `peak`; weights 40, 35, 25 in `world.character.landform`) and `Character.route` (`climb` or `circle`, half each in `world.character.route`; null on seeds that are not mountain seeds), each from its own sub-stream (`world/character/landform`, `world/character/route`). Both are part of the track fingerprint | The plan, and Tane's split after C1. The route is drawn for every seed and then dropped off mountain seeds, so a change to the relief weights never reshuffles it. A test checks relief, coast, width and mountain count are unchanged on seeds 1 to 2000 (fingerprint taken before) |
| 2026-11-13 | The Firefox budget test now runs after the Chromium one, not beside it (`playwright.config.ts`) | Found in C2: side by side, Chromium's world took 3.2 to 4.3 s (alone 1.1 to 2.2 s) and failed the 3 s budget. Measured on the code from before C2 too, with the same result, so it was not caused by C2 |
| 2026-11-13 | **Mountain shapes** (`gen/world/landforms.ts`, rules in `world.scenery.landforms`). A lone peak is one mountain with a wavy foot (one, two and three swings round), a profile from an even rounded hill to a long gentle foot below steep upper slopes, and rock ridges and gullies from noise. A ridged range is 3 to 6 spires along a gently bending line, each placed by search so the col to its neighbour is 60% to 78% of the lower one, blended where they meet. Hill country is 6 to 11 oval swells on a low dome with a wavy edge, the higher swell winning where they meet with the join rounded | Tane's check-in 3 references. Ranges were first built as one ridge line with sides measured from it; that looked faceted, so each peak became a mountain of its own |
| 2026-11-13 | Slope limits: lone peaks 120%, ranges 150%, hill country 60% (the plan said about 110% for mountains) | Sharp spires and rock gullies do not fit under 110%. Only bare rock is that steep and nothing drives there; the island already allows 250% away from the road. Measured worst: 115%, 122%, 58% |
| 2026-11-13 | Each shape is sized from its height: its smooth form uses a set share of the slope limit (measured over directions and distances when it is built) and the rest is left for the rock | So no shape can be steeper than its limit whatever its outline. Tests check the limit on the 3 m grid |
| 2026-11-13 | Spire tips are rounded over about 4 m | A 3 m grid triangle straddling a knife edge came out steeper than either side (118% against a 110% shape) |
| 2026-11-13 | **Massif in the relief** (`placeMassif` in `gen/world/relief.ts`, rules in `world.relief.massif`): mountain seeds have a 15% cone round the summit that eases in over 120 m and has its foot 600 m past the centre of the track area, a flat shoulder near the top (130 m radius climbing, 110 m circling), and the top in the seed's landform standing on it. Climbing: summit 550 m from the centre, top 70 to 95 m (25 to 40 m for hill country). Circling: summit 200 m out, top 50 to 70 m (25 to 40 m). A range on top is at most 450 m long. Mountain seeds no longer have a highland | C1's numbers. Circling tops are lower because a top's foot spreads with its height and the lap has to get round it; climbing tops are taller so their summits reach the plan's 200 to 250 m |
| 2026-11-13 | The island lists the massif as the main mountain of a mountain seed, even when the mountain count is 0; it is kept from the sea but not added to the ground again, and has no clearance from the road | It is part of the relief. Hinterland tests force no mountains, so they test mountain seeds as hilly ones |
| 2026-11-13 | **Track rules by relief** (`track.byRelief`, `trackRulesFor` in `gen/track/rules.ts`): mountain seeds have laps of 1.6 to 3 km, a 600 m track area and weights of 18.75% for each fun part and 25% for elevation; the others keep 1.4 to 2.4 km and 500 m. Elevation targets for mountain seeds: 160 m range, 240 m climb, for both routes | C1. One set of targets keeps the score simple; circling winners score about 0.5 on elevation, which does not change which candidate wins on a seed |
| 2026-11-13 | **Candidates are turned to fit the ground**: each valid layout is tried at 8 turns about the centre on mountain seeds, 4 on hilly seeds, 1 on the others, and the best-scoring turn that keeps the earthworks rule is kept (`Candidate.turn`, shown in the lab). The lap's shape never changes | C1 (mountain) and C4 (hilly). Close sections are found once per candidate, as turning does not change them |
| 2026-11-13 | **Earthworks rule** (`gen/track/earthworks.ts`): a turn is rejected if its road needs a cut deeper than 8 m or a fill higher than 6 m on the centre line, or a bank between close sections steeper than 45% plus the solver's 2% slack (`road.bankSlack`). The lab says which and marks where | The plan. The slack is the tolerance the tests already used, so flat and rolling winners are unchanged |
| 2026-11-13 | **Steep rock cuttings beside mountain roads are allowed** (Tane's choice): on mountain seeds the bank beside the road may reach about 220%; elsewhere it stays under 90% | Laps that climb onto the top run across ground 40 to 90% steep, and the blend beside the road is at most 25 m wide (brief: 10 to 25 m). Keeping roads off steep ground cost too many candidates and too much time (see C4 results) |
| 2026-11-13 | Climb tests check cut, fill and banks on valid candidates only, lap range bands by route (climbing 90 to 160 m, circling 55 to 100 m), that 9 in 10 mountain laps come within 150 m of the top, that a third of circling laps go round the summit, and that climbing laps reach higher | Rejected candidates break the earthworks limits by definition |
| 2026-11-13 | The contact sheet frames the whole tile; the lab draws each seed's own track area | A massif's land can reach beyond the hinterland's furthest |
| 2026-11-13 | **Every mountain in the seed's landform** (`placeMountains` in `gen/world/island.ts`): heights by shape in `world.scenery.mountains.heights` (ranges and lone peaks: main 200 to 250 m, others 80 to 200 m; hill country: main 120 to 170 m, others 50 to 120 m). The old round bell and its ridge settings are gone. `Island.mountains` gives each mountain's base and landform | The plan |
| 2026-11-13 | **A mountain is built lower where its whole foot does not fit**: its outline is measured in 32 directions at full height on the lowest ground, and each place is tried at 100%, 85%, 70%, 58%, 47% and 38% of that height (never under the 40 m minimum). The best place lets it stand tallest, then has most of its foot on the road's land, then is nearest the road; a hilly seed's main mountain prefers the highland. The mountain is then built at its place and its own outline checked | At full height the shapes are about twice as wide as the old round mountains (C5 results); without this, most would never fit |
| 2026-11-13 | **Every mountain is joined to the road's land**: its foot must reach the infield or the hinterland, or come within 20 m of the 60 m clearance (`join`), so the land round its foot meets the land beside the road. A test floods the land out from the road and finds every summit | The plan: no mountain on an island of its own across a channel (seed 4 at check-in 3) |
| 2026-11-13 | **The coast keeps each mountain's foot, not a circle round it**, and round the foot the land climbs from the sea as wide as the ground at the foot (straight in towards the summit) needs: 4 × its height ÷ 2.5 for other mountains, 3 × for a massif, whose lower slopes may meet the sea more steeply. The search margin round each foot is sized from the highest ground near it | Sized from the ground at the summit, a mountain beside the cone left the land round it too narrow (274%, seed 5). Sized per cell from the ground there, the shore narrowed as the cone fell away and steepened its last 10 m (264%). A massif at 4 × covered the road of coastal climbing seeds (sea along 8% of seed 2's lap) |
| 2026-11-13 | **Hill country stays green**: `buildCover` takes the island's landform; for hill country there is no snow and no rock for height alone, only where the ground is steep | The plan |
| 2026-11-13 | **The world lists its mountains' summits** (`WorldResult.mountains`: x, z and height, main one first; part of the world fingerprint) | The 3D page needs the summit to face it, and an island's `Mountain` holds functions that cannot be sent from the worker |
| 2026-11-13 | **Close views `look=summit` and `look=climb`** (`lookAtRoad` in `camera/spots.ts`, numbers in `camera.summit` and `camera.climb`). Summit: the camera stands behind the lap's highest point on the side away from the main summit, 15 m above the road, and steps back until the point and the summit are within 0.6 radians of each other, then looks between them; with no mountain it looks 300 m down the road. Climb: the steepest 40 m of road, seen from 80 m downhill along the road, 0.3 radians to one side, tipped up until 4 m clear of the ground | The plan. Tane chose "from below, looking up" over side-on for the climb |
| 2026-11-13 | The 3D title card shows the contact sheet's short description of the seed (for example "mountain, climbing · touches · 3 mountains, ridged range") | Tane's choice at C6, for check-in 4 |
| 2026-11-13 | **A close camera whose view is blocked turns**: it tries its usual direction, then an eighth of a circle each way and further, and takes the first whose line of sight clears the ground by 2 m (or the clearest) | Mountain seeds have ground far above the road beside it: at the usual direction seed 44's `bank` camera stood inside the snow |
| 2026-11-14 | **Each seed picks a time of day** from 07:00 to 19:30, evenly, in whole minutes, and the compass bearing of the sun's path, from its own stream (`world/sky`); `WorldResult.sky`, part of the world fingerprint, shown in the lab's Track panel | Tane's choices for step 12. The track fingerprint of seeds 1 to 40 is unchanged (a test) |
| 2026-11-14 | The sun's bearing is a compass bearing: 0 is north, which is -z, up on the lab's map; a quarter turn is east (+x). The sun sweeps half a circle from where it rises | One convention for the lab's words and the 3D sun |
| 2026-11-14 | **Sun path: rises 06:30, sets 20:00, 60 degrees at its highest** (`render.daylight`) | The demo's sun set at 18:00, so 19:30 would have been dark. A first guess (06:15 to 20:15) left 19:00 too high for evening light |
| 2026-11-14 | Light strengths at midday match the 3D page before the sky (sun 2.4, sky 1.5); a low sun has 55% of the sun's strength and 75% of the sky's | So midday pictures look as before; tests pin it |
| 2026-11-14 | **Nothing is drawn while a new world is being built**, and the budget test holds its page still (`still=1`) | Headless browsers draw in software; drawing took time from the worker (the budget test failed at 3.4 s twice on a busy machine). Players see the loading screen meanwhile |
| 2026-11-14 | Tests that count land, sea and road pixels open at `time=13:00` | They test the island, not the light; the time-of-day tests cover the light |
| 2026-11-14 | `look=sun`: from 60 m behind the start line, looking level towards the sun | For the sun-disc test and the time strip |
| 2026-11-14 | The water reads its depth from the fitted ground (which includes the sea bed) as a one-channel float texture of the 3 m grid; outside the tile it is open sea at `seaFloorDepth`. `depthAt` in `render/waterDepth.ts` does the shader's sums for tests | No new data from generation; works in Chromium and Firefox |
| 2026-11-14 | ~~Waves fade with distance: small ones between 60 and 220 m, large ones between 300 and 1500 m, glints to 25%~~ Replaced the same day by the waves of 12g | Seen from the circling camera the regular waves made a fish-scale pattern; fading them did not cure it |
| 2026-11-14 | **The sea's waves are our own, not the demo's** (`render/waves.ts`): eight trains down one wind, in groups, with bent, peaked crests; each dropped when too small on screen to draw; the water shaded by the waves' faces with lighter crests. The wind is a setting (`render.water.wind`), the same on every island | Tane: the water looked like a checker pattern, not waves |
| 2026-11-14 | The wave sums are written twice, in TypeScript (`waveField`, tested) and in the shader (`wavesGlsl`), from the same settings | The shader cannot be unit tested; the same pattern as `depthAt` |
| 2026-11-14 | `patch` and `sample` are reserved words in the shader language (WebGL 2); a shader that fails to compile draws nothing and only logs to the console | Cost a confusing screenshot of a sea with no water. The test "builds the island in 3D" fails on any console error |
| 2026-11-14 | The waves move every frame unless the page is held still (`still=1`) or the system asks for reduced motion; then they stand at `render.water.stillTime`, so screenshots repeat exactly | Tane's choice; replaces "draw only when something changed" for moving pictures |
| 2026-11-14 | `time=HH:MM` opens the first island at that time, held to 07:00 to 19:30; a new island goes back to its own time. The slider moves in 5-minute steps and keeps its own arrow keys | Tane's choice for the player's pick until Milestone 4's menus |
| 2026-11-14 | **Step 13, Tane's choices:** tree cover varies by seed (open, wooded, forest); broadleaf, pine and a palm by the beach; trees from about 8 m off the road edge, in patches; the seed picks the amount of cloud, and clouds stay above the highest summit | Asked in plan mode before the plan was written |
| 2026-11-14 | Trees and rocks are scenery only: nothing collides with them | Barriers line the whole lap, so the car cannot reach them |
| 2026-11-14 | The woods and cloud traits are on the world (`WorldResult.decor`, `WorldResult.clouds`), from the `decor` stream, not on `Character` | The character is part of the track fingerprint; decoration must not change it |
| 2026-11-14 | **Trees and rocks come from one pass over a grid of squares, one thing to a square** (`gen/world/decor.ts`): 9 m squares for trees, 12 m for rocks, each thing a little off the middle of its square; every square draws the same random numbers whether or not anything grows there | Trees can never overlap, the cost is the same on every island (10 to 19 ms), and changing one rule does not reshuffle what the others decide. The demo's trial and error would need hundreds of thousands of tries on this tile |
| 2026-11-14 | Palms do not follow the woods: every island with a beach has them, however open it is | They mark the shore; an open island would otherwise have bare beaches |
| 2026-11-14 | Three kinds of rock: boulders on rocky ground, shore rocks, and the odd boulder on grass | The demo's two, plus a few in the fields so open grassland is not empty |
| 2026-11-14 | Clouds are generated with every puff's underside at least 60 m over the island's highest ground (and 320 m up) | Tane's choice: clouds stay above the summits. Generation guarantees it, so drawing never has to check |
| 2026-11-14 | **Cloud counts 4 to 9, 14 to 24 and 34 to 52 over a 5.6 km square** (the plan said about 5 to 40 over 7 km) | At the planned density a cloudy sky showed four or five clouds from the road |
| 2026-11-14 | **Trees and rocks are drawn as one instanced draw for each kind in each 450 m square, with near shapes within 350 m of the camera and far shapes beyond** (`render/decorView.ts`); the near and far copies share their matrices and tints | Squares out of view cost nothing, and 11,000 trees seen from far off cost 11 to 14 triangles each instead of 28 to 46 |
| 2026-11-14 | Tree, rock and cloud shapes, the groups and the clouds' positions are worked out as plain numbers (`render/treeShapes.ts`, `scatter.ts`, `clouds.ts`) and only wrapped for Three.js | So they are unit tested; the pattern of `terrainChunks.ts` and `waves.ts` |
| 2026-11-14 | Trees are drawn from both sides and their cones and trunks are left open | Palm fronds are flat, and open cones save a third of a pine's triangles; flat shading works out each face's direction from the picture itself, so it does not matter which way a triangle is wound |
| 2026-11-14 | **Clouds drift on the wave clock, down the waves' wind, at 10 m/s**; they wrap round their square and shrink to nothing over the last 400 m before its edge | One wind for sea and sky; `still=1` holds both, so screenshots repeat. Shrinking hides the jump from one edge to the other |
| 2026-11-14 | **A cloud thins away as the camera comes within 360 m of it** and is gone at 120 m (`render.clouds.thin`) | The circling camera flies at the height of the clouds; on seeds 5 and 19 one filled a corner of the picture |
| 2026-11-14 | Clouds' shaded sides are lit by 70% of the sky's light for the time of day (`cloudGlow`), not the demo's fixed glow | The demo's glow left undersides nearly black under Three.js 0.187's lighting; this also dims and warms them in the evening |
| 2026-11-14 | `decor=off` in the 3D address leaves out trees, rocks and clouds; the foam test uses it | Clouds would be counted as foam. Also handy for comparing triangle counts |
| 2026-11-14 | The pixel counts report near-white pixels and a fingerprint of the top two fifths of the picture alone (`cloud`, `skyDigest`) | To test that clouds are drawn and that they move, apart from the waves |
| 2026-11-14 | **Step 14, Tane's choices:** grass varies in patches on every island (long meadow, short turf, following the lush-to-dry map); blades reach about 120 m, thinning with distance; a mown strip beside the road; wildflowers in some patches | Asked in plan mode before the plan was written |
| 2026-11-14 | Grass is drawing only: no generation code changes, so no fingerprint changes. `grass=off` leaves the blades out; `decor=off` does not touch them | Where grass grows is already world data (`cover.grass`). Approved with the plan |
| 2026-11-15 | **The grass is three square fields of blades that follow the camera** (`render/grass.ts`, `render.grass.tiers`): 20, 40 and 80 m to each side, each sitting half its half-width ahead of the camera, each fading at its edge and standing down where the field inside it stands | Tane chose blades to about 120 m, thinning. One even field that size would need several times the blades for the same look close by |
| 2026-11-15 | A blade stands at its fixed place plus a whole number of its field's widths, worked out so that it never depends on where the field's middle is | So blades stand exactly still as the camera moves; working it out from the middle each time would make them tremble by rounding |
| 2026-11-15 | **The grass is placed by the graphics card**, from the ground's heights (the water's texture, shared) and one four-byte grid (`grassGrid`); `bladeAt` does the same sums in TypeScript for the tests | Nothing is rebuilt from frame to frame. The pattern of `waves.ts`: the shader cannot be unit tested |
| 2026-11-15 | The distance from the road edge (for the mown strip) and the flower patches are worked out on the page when a world is shown (`render/grassMaps.ts`), not in generation | The plan: no generation code changes, so no fingerprint changes. It takes about 30 ms |
| 2026-11-15 | **Blades take the light of the ground triangle they stand on**, and their foot-to-tip shading averages about 1 | With the demo's lighting the grassed ground was darker than bare ground and the far field's round edge showed |
| 2026-11-15 | **No blade where the grass cover is a half or less**, every blade from 95% (`render.grass.thin`); none with its foot under 0.3 m above the sea (`dry`) | By the cover alone, green blades stood scattered over sand and rock, and a few in the water under steep shores |
| 2026-11-15 | **Mown strip: 16 cm within 9 m of the road edge, growing back over 6 m** (planned: 12 cm, 12 m, 10 m) | The wider, shorter strip looked like bare ground from the road |
| 2026-11-15 | A far field's flowering blade becomes all flower | Its blades are single triangles seen from 60 m and more; a coloured tip was under a pixel |
| 2026-11-15 | No blades are drawn when the camera is more than 150 m above the ground under it (`render.grass.ceiling`) | From there no blade can be told from the ground; the view from above costs nothing extra |
| 2026-11-15 | Tests of how long something takes get a loose limit that only catches a blunder; the real time is measured and written here | A 150 ms limit on a 30 ms job failed with every test file running at once. The same lesson as the 20 s test timeout |
| 2026-11-15 | **Gorges stay** (step 17): where a ridged range stands over the road, the road runs through it in a gorge deeper than the cut limit | Tane saw seeds 28496 and 39898 and chose to keep them; it is a kind of track Tane wanted |
| 2026-11-15 | The fit tests check only the 10 m minimum to the sea, no longer that a bay brings it in to 10 m beside low road (step 17) | Since the rework many seeds touch the sea along only a stretch or two; Tane chose to relax the check |
| 2026-11-15 | **The 3D view is the default page** (step 16). `?lab=1` or L opens the lab; `candidate=`, `minRadius=` and `gapWidths=` open it too, and `view=3d` still opens 3D; contact sheet cards open the lab. L reloads the page at the other address | As agreed on 2026-11-11. Old links keep working. A reload is simpler and safer than an overlay, since neither page can shut itself down |
| 2026-11-12 | Unit tests may take up to 20 s each (`vite.config.ts`) | A test that builds four real worlds brushed the default 5 s when every test file ran at once, which would block commits at random |
| 2026-11-11 | Defaults for Milestone 2: 3D becomes the default page at step 16 (lab on L and `?lab=1`); start line and gate now, checkpoints in Milestone 4; seeds pick a time of day from 07:00 to 19:30; only trees and rocks as decoration; road width fixed at 13 m; README converted from UTF-16 to UTF-8 | Listed in the plan; Tane approved without changes |
| 2026-11-15 | **Rapier's cross-platform deterministic build** (`@dimforge/rapier3d-deterministic-compat` 0.21.0), not the standard one the brief names | Tane's choice. Ghosts on one computer work with either; only this build promises the same lap on every computer and browser, which shared ghosts, leaderboards and multiplayer need. Same version, API and download size; a little slower per step, which does not matter for one car |
| 2026-11-15 | **The walls open in places** (Milestone 3, step 2): they stay on the outside of corners, beside close sections and beside steep or dropping ground; elsewhere the roadside is open grass. Trees and rocks get collisions | Tane's choice. With a wall round the whole lap the car could only leave the road onto a 1.8 m verge, so the brief's off-road slowdown and falling in the water would never happen |
| 2026-11-15 | Beaches stay open: no wall beside gentle sand down to the sea | Claude's call, for Tane to judge at check-in 1. It is where the car can fall in the water |
| 2026-11-16 | **A wall is kept beside ground steeper than 40%** on average over up to 16 m (`road.walls.maxSlope`, was 25%) | Claude's call from step 2d's numbers and pictures, for Tane to judge at check-in 1: at 25% mountain laps were about 20% open, with walls beside grass hillsides a car can drive on. 40% keeps every cutting and cliff walled and is just under the 45% bank the car is tested on |
| 2026-11-16 | **What the car hits** (step 3b): walls as solid boxes with the drawn wall's top; the gate's posts and beam; a tree only on its trunk, as a post; a rock as the ball with the drawn rock's height and width at the ground | Claude's call. Solid boxes push a fast car back out where a shell of triangles could let it through. Leaves would stop a car that only brushed a tree. A flat rock should be a bump and a tall one a stop |
| 2026-11-15 | The page opens driving, with the chase camera; C switches chase, flying and circling; old screenshot addresses keep their views | Tane's choice. Pillar 4, instant to play |
| 2026-11-15 | Controller support is built in Milestone 3 | Tane's choice, so the handling is tuned for analogue steering too |
| 2026-11-15 | The car is a Rapier rigid body with our own springs and arcade layer on top; Rapier's vehicle controller is not used | Claude's call. The brief's handling is rules, not tyre physics; our own sums are exact (`core/dmath.ts`) and every number is in the config |
| 2026-11-15 | Driving off across the island is allowed; only water, the map's edge, landing upside down, being stuck or R respawn the car | Claude's call. Every seed is a new place; nothing is gained by fencing it |
| 2026-11-15 | Wheels are cast as 5 cm balls, not bare rays; every tree and rock gets a collider (Milestone 3, step 1) | Measured: a bare ray misses the ground heightfield a few times in 200,000 and half the time on exact grid points, a ball never; 10,000 tree and rock colliders build in 12 ms |
| 2026-11-15 | The step-by-step record of Milestones 1 and 2 moved from this file to `docs/archive/STATE-milestone-1-2.md` | This file had grown to 1,144 lines, more than a new session can read in one go |

## Notes for later milestones

- **M2 (from Tane):** track-first is fine. Shape the island so the track looks like it belongs: hills where it climbs, coastline near it where possible.
- **M3 (from Tane), done 2026-11-15:** checked and flagged; Tane chose the deterministic build (see decisions).
- **M2:** add the elevation score; move generation into a Web Worker.
- **M2:** folded tracks have parallel sections as close as 40 m (centre to centre). Terrain fitting must keep neighbouring sections at similar heights or separate them with a wall or bank, since the brief's cut-and-fill blends over 10 to 25 m.
- **M2:** corner entries have no easing (the curvature steps from zero to 1/radius). Banking handles this by averaging its tilt over 30 m (done in step 8); kerbs should allow for it too.

## Known issues and risks

- **Few roadsides open onto the sea** (step 2d): half the seeds with sea beside the road have an opening facing it, mostly flat and rolling ones, and no mountain seed has. Coast roads mostly run above a cliff or round the outside of a corner, and both keep their wall. Opening corner outsides above gentle beaches, or lower coast roads, would change it. For Tane at check-in 1.
- **Wall ends are ramps** (0.8 m up over 6 m), and hillsides of up to 40% beside mountain roads are open: both wait for the car (steps 4, 7 and 8; see "Step 2").

- **The verge still dips a little at its outer edge on steep banks** (about 0.3 m at worst, seed 1; was about 0.45 m before R5's 4 m verge). The road is unaffected and the barrier footing hides it; the barrier test asks for a third of the footing in the ground and passes. Holding the road's height one cell beyond the verge in `fit.ts` would remove the rest.
- **Sea cliffs have a coarser saw-tooth edge on the 3 m grid** (visible in close views, for example seed 1 `look=bank` and seed 7 `look=water`). R6 left the coast beside the road unchanged. A finer grid near the coast, or smoothing the cliff's top edge, would help.
- **Coastal mountain seeds keep the sea further out** (seed 1: about half the outside within 35 m), because a cliff from a high road may be no steeper than 250% (check-in 1). Tests allow for it.
- **Flat seeds show large sandy patches** on the hinterland: their lowland is 3 m, right at the top of the sand band (1 to 2.6 m). Worth a look at check-in 3.
- **The coast cuts high ground into curved rock bands** (seed 12, a mountain seed; also seed 1 beside the road): the hinterland's coast drops 60 m and more to the sea as a cliff wherever its edge crosses the cone. C5 tried three softer joins without effect (see C5 results). The fix is a coastline that follows the terrain; for check-in 4.
- **Islands are big and blobby**: each mountain brings its own land, joined to the track's, so islands with three or four mountains fill much of the tile as lobes round each foot.
- **The contact sheet frame is generous** (it holds the whole 2.7 km tile since C4), so most islands look small in their thumbnails.
- **Hilly and mountain islands look like a tilted table with sea cliffs** until R6 (land beyond the road) and R7 (mountains). The road itself sits cleanly.
- **The cone under a massif is round**, up to 2 km across, so several mountain islands are one big round dome (seeds 3, 13 and 14 on the contact sheet). An uneven foot (kept no steeper than 15%) would help; C5 or C6.
- **Steep rock cuttings beside mountain roads** (allowed, see decisions): banks beside the road up to about 210% where a lap crosses the top's slopes, and the fit report's deepest cutting at a road edge up to 13 m (the earthworks rule checks the centre line). C6 screenshots show them as deep rock trenches with saw-tooth edges between parallel sections on climbing seeds (seeds 3 and 53); check-in 4 judges the look. A wider blend on steep ground is the lever, and a finer grid or smoothing the cut's top edge would soften the saw-tooth.
- **Fewer circling laps go right round the summit than in C1**: 32 to 49 of 60 by shape (ranges fewest), against three in four with C1's small top. Lower or shorter tops on circling seeds would raise it, at the cost of summit height.
- **Circling summits are lower than the plan's 200 to 250 m**: about 155 m above the lowland for peaks and ranges, 125 m for hill country.
- **Mountain worlds are the slowest to build**: 3.0 to 3.3 s on the 3D page in headless Chromium, where the island is drawn in software (1.0 to 1.2 s on the lab page; 1.8 to 2.0 s on the 3D page in Firefox). The budget test uses seed 7 (hilly) and passes. Pausing 3D drawing while a new world is built would help both, and players without a fast graphics card.
- **Coastal mountain seeds have less sea beside the road**: along 19 to 67% of the lap (seeds 1 to 6), least on climbing ranges, whose land covers the side the road climbs.

- **Most mountains are lower than asked** (C5): full-size shapes rarely fit, so they are built at a median 84 to 88% of the middle of their range. Steeper shapes for island mountains would let them stand taller.

- **Firefox builds worlds about 1.6 times more slowly than Chromium** (measured in R1: about 0.6 s against 0.37 s per world in the worker; 0.85 s at the new tile size). Both are well inside the 3-second budget. Playwright waits up to 15 s for a new seed to appear, which covers a busy machine.

- **Not every island gets a peak.** Narrow tracks have no infield point far enough from the road (4 of 24 seeds surveyed: 2, 1234, 77777, 43950). Tane asked for one interior peak at least 60 m from the track; those two wishes cannot both be met there.
- **A bay only reaches 10 m beside low road facing the open sea.** Where every seaward stretch of road is high, the nearest water is further out (seed 2: 13.4 m), because the drop may not be steeper than 250%. Since the rework many seeds touch the sea along only a stretch or two: on 12 of the 40 seeds checked in step 17 the sea comes no nearer than 13.8 m (up to 28.2 m, and 226 m on seed 39898). Tane chose to check only the 10 m minimum.
- **A ridged range can stand over the road, which then runs through it in a gorge** (seeds 28496 and 39898; about 1 seed in 40). Mountain placement checks a foot at 32 points round its outline. Tane chose to keep the gorges (step 17); the start gate can stand in one (seed 28496).
- **The circling camera frames only part of the lap on the biggest islands** (seed 10 from above).
- Enclosed water is possible where a fold in the track is closed off by land at its mouth. None seen yet; it would be a lagoon.
- In 3D the sea cliffs read well as rock faces. The peak is craggy and a bit lumpy from the ridge texture on its sides; worth a look once lighting and shadows are in.
- **The sun's glare on the sea, seen from the circling camera, is a wide pale patch with wave stripes in it** (seed 7 at 10:00). Softer than it was; `render.water.glint*` are the settings.
- **The water shader does more work per pixel than the demo's** (eight wave trains, each with a noise lookup). Measured in step 15: the sea surface costs about 0.5 ms a frame at 1080p on the Arc graphics; Low keeps the four longest of the eight trains.
- **From far above, open and wooded islands still look fairly bare**: a tree is 6 to 10 m tall on an island 1 to 2 km across, so woods read as patches of dark dots. `world.decor.trees.level` sets how much is wooded and `spacing` how close the trees stand. For Tane to judge.
- **Clouds are dark grey-brown at 07:00 and 19:30**, seen against the pink sky. `render.clouds.glow` is the setting.
- **The circling camera can look down through the clouds at the island**: one sometimes hides part of it (seed 3's summit). They thin away only within 360 m of the camera.
- **Nobody has watched the grass move yet.** The sway, and whether thin blades shimmer as the camera flies, were tested by numbers and judged from still pictures (headless browsers). For Tane to fly a lap: `render.grass.sway` sets the wind, and wider blades or fewer of them are the levers for shimmer.
- **From the flying camera the grass is a fine texture beside the road**, not bold blades: the camera is 4 m up and the nearest long grass is about 15 m away, past the verge and the mown strip. It reads best within 30 m. Blade widths and counts are in `render.grass.tiers`, lengths in `turf` and `meadow`. For Tane to judge; Milestone 3's chase camera will be lower and closer.
- **The grass costs 176,000 triangles in every view from the road**, and each blade corner reads the ground five times. Measured in step 15: the grass costs about 0.6 ms a frame at 1080p on the Arc graphics; Low keeps 35% of the blades. The summit view now reaches 653k triangles in 132 calls on the most wooded seed.
- **Far flower patches are small dabs of colour**, a few pixels each beyond 60 m. `render.grass.flowers` has the share, size and patch settings.
- **The mown strip is the same width everywhere**, and trees stand in long grass and flowers with nothing cleared round them.
- Tree shadows are small from the flying camera at midday. Shadow strength (`render.shadows.skyShare`, 0.6) was approved by Tane on 2026-11-15; `shadowSky=` in the address tries others.
- **Low gains least when circling from above** (about a fifth): that view has a fixed cost of about 8 ms on the Arc graphics that neither pixels nor draw calls explain. For Milestone 6's performance pass.
- **Timing on the laptop is unreliable for spells**: views run four to ten times slower for half a minute or so, then recover (see "Step 15").
- **A close camera (`look=`) only checks the ground, not trees.** None of the 160 close views of seeds 1 to 20 is hidden by one, but a tree crown can sit at the edge of the picture (seed 10 `cut`).
- **Near and far tree shapes swap a whole 450 m square at a time**, at 350 m. Not seen in still pictures; watch for popping when flying, and in step 15's frame-rate pass.
- **The most wooded islands draw up to 589k triangles in 169 calls from above** (seed 8, wooded, 9,480 trees). Measured in step 15: seed 8 from above is the slowest view on High at 1080p, 15.8 ms with every shadow on; trees cast with their far shapes.
- The wind blows the same way on every island. It could come from the seed.
- **07:00 and 19:30 are quite dark**, with pink skies (see the step 12 time strip). Sunrise, sunset and the blends are config values; for Tane to judge.
- **The page now draws every frame** while the waves move. Measured in step 15: 5 to 16 ms a frame on High at 1080p on the Arc graphics.
- 10:00 is called "midday light" on the title card (morning ends at 10:00 in `lightName`).
- A whole world (track, island, fit, cover, report) takes 430 to 640 ms in Node and about the same in a Chromium worker. Budget is 3 s.
- For two test files (`cover.test.ts`, `report.test.ts`) the tests were written first but only run once the code existed, so they were never seen failing for a reason other than the missing module.
- **The start line can sit on a steep slope** (seed 42 starts on an 8% descent). The solver does not yet know where the start is. Worth flattening the start area before Milestone 4 puts a grid there.
- Lap height range is 13 to 24 m for most layouts (median 19 m, up to 29 m), a little under the top of the 15 to 30 m target. `world.relief.hillHeight` raises it; cut and fill grow with it.
- **Almost every track has a hairpin** (about 98% of seeds). Tane asked for "most", not all. The scorer rewards a hairpin, a sweeper and a chicane, so the winner nearly always has one. Could be loosened with a hairpin-free style if wanted.
- **Folds are still modest.** Tracks fold back on themselves, but the very long double straights of a Sepang-style layout are rare, because the lap limit (2.4 km) caps how deep folds can go.
- **Some Milestone 1 winners changed** when elevation joined the score: 45 of seeds 1 to 200. Seed 48213 is one (now candidate 18, with a 610 m straight and no hairpin).
- **Winner scores cluster between 85 and 100.** The winner is the best of 30, so this is partly expected, but the scorer could discriminate more.
- The "rejected layouts" overlay is normally empty because candidates are valid by construction. What-if rules in the URL (`?minRadius=30`, `?gapWidths=4`) show which layouts a stricter rule would reject.
- The lab sidebar is taller than a 720-pixel-high window, so the candidates panel needs a scroll.
- Cross-browser determinism is tested (`e2e/determinism.spec.ts`): Chromium, Firefox and Node give identical fingerprints for 20 seeds. Edge is Chromium-based and is not tested separately.

## Session log

Entries up to the end of Milestone 2 are in `docs/archive/STATE-milestone-1-2.md`.

- **2026-11-15 (Milestone 3):** Planned in plan mode and approved. Tane chose Rapier's deterministic build, walls that open in places, a page that opens driving, and controller support now. Step 0 done: branch `milestone-3-driving`, the plan recorded here, Milestone 1 and 2 detail moved to the archive, the Rapier choice noted on issue #3. No code changed. Next: step 1, the Rapier proof.
- **2026-11-15 (Milestone 3):** Step 1 done, the Rapier proof. The deterministic build (0.21.0) is installed; a tumbling box on seeds 1 and 7 gives the same fingerprint in Node, Chromium and Firefox, twice, and after a snapshot. Loading, colliders, steps and ray casts all cost very little (table under "Step 1"); the download is 1.68 MB gzipped. Bare rays can miss the ground, so wheels will be cast as small balls. Found on the way: the wheel-zoom browser test failed about one run in six in Firefox, because Playwright's wheel call returns before the scroll arrives; it now waits for the zoom. 1,635 unit tests and 272 browser tests pass. Next: step 2, open walls, in parts 2a to 2d.
- **2026-11-15 (Milestone 3):** Step 2a done. `gen/road/walls.ts` (`findWalls`, `tidyWalls`, `walledPieces`), the `WallSpan` type, `road.walls` settings, `Road.walls`, and the walls in the world fingerprint (every seed's fingerprint changes). A wall is kept on the outside of real corners (15 m before to 30 m after), where another part of the lap is within 80 m on that side, where the ground within 16 m of the verge rises or falls by more than 25% on average (and more than 0.6 m), and for 14 m each way from the gate; openings under 40 m are closed and walls under 24 m lengthened. It costs about 1 ms a world. First look at five seeds: 14% to 40% of each side open on mountain seeds 1 and 3, up to 76% on hilly ones. The drawn barriers are unchanged until 2b. The snow test in `mountains.test.ts` was given 60 s: it sat on the 20 s limit and went over once more test files ran beside it. 1,659 unit tests and 272 browser tests pass. Next: 2b.
- **2026-11-16 (Milestone 3):** Step 2b done. `buildBarriers` builds a wall only where `Road.walls` has one; a wall that does not go round the whole lap rises from the road's level over `road.walls.taper` (6 m) at each end and has a face closing each end. Tests for whole-lap walls kept, new ones for walls that open (only where there is one, full height between the ends, sloping ends with no step, end faces looking along the lap, nothing for no walls); the footing check in `testing/fitChecks.ts` allows the sloping ends. Screenshots of seeds 1, 7, 42, 100, 2024 and 48213 looked at: walls on the outside of corners, beside cliffs and cuttings and at the gate, open grass elsewhere, no gaps under a wall. 1,664 unit tests and 272 browser tests pass. Next: 2c.
- **2026-11-16 (Milestone 3):** Step 2c done. The lab draws each wall as a pale line beside the winner's road (`debug/trackLab/wallPaths.ts`: `wallPath`; `drawWalls` in `draw.ts`) and its Track panel says, on seed 7, "10 walls; 35% of the roadside open (right 52%, left 19%)" (seed 1, a mountain seed: 7 walls, 17% open) (`describeWalls` in `format.ts`); `data-lab-walls` on the page for the browser test. Found on the way: editing a file with PowerShell's `Get-Content` and `Set-Content` damaged its accented characters and degree signs (restored from git; file edits go through Python or the editing tools). Lab pictures of seeds 1 and 7 looked at: the lines are right but thin when the whole island is in view, clearer zoomed in. 1,672 unit tests and 274 browser tests pass. Tane asked to stop after 2c. Next: 2d.
- **2026-11-16 (Milestone 3):** Step 2d done, which ends step 2. Measured on seeds 1 to 200: with the 25% slope rule the middle lap was 45% open but mountain laps only 20% (9% at the least), walled beside ordinary grass hillsides. `road.walls.maxSlope` raised to 40%: the middle lap is now 50% open, mountain laps 41%, none under 19% (table under "Step 2"). The sea is mostly behind a wall because coast roads mostly run above cliffs or round the outside of corners; half the seeds with sea beside the road have an opening facing it. Screenshots of seeds 1 to 20 looked at in two batches, six mountain seeds again after the change, and close views of 40 wall ends: walls where expected, clean ends. Two tests added first and seen failing (a 30% hillside stays open; mountain seeds 1, 3 and 13 are more than a quarter open). Every seed's world fingerprint changes again (walls only). 1,674 unit tests and 274 browser tests pass. Next: step 3, the simulation skeleton.
- **2026-11-16 (Milestone 3):** Step 3a done. The architecture rules cover `src/sim`: it may import `core`, `gen` and itself, and the config's types only; the same bans on chance, the clock and inexact maths as generation; Rapier may be imported only under `src/sim/physics`, and a second test checks no other file in `src` imports it (`importsRapier`). `src/sim` is in the type check without browser types. The input record (`src/sim/input.ts`): throttle and brake as 0 to 255, steering as -127 (left) to 127 (right), drift and reset as 0 or 1; `makeInput` from a device's readings, `inputFractions` back to fractions, `packInput` and `unpackInput` for one whole number a record (for ghosts and fingerprints). Step 3 split into parts 3a to 3c. 1,795 unit tests and 274 browser tests pass. Next: 3b.
- **2026-11-16 (Milestone 3):** Step 3b done. Everything the car can hit has a collider, added in a fixed order by `addWorldColliders` (ground, road, kerbs, walls, gate, trees, rocks), which returns the handles so a later step can tell what a wheel or the body met. A wall is one solid box a piece, its top along the drawn wall's top (so the sloping ends are ramps here too), reaching 0.6 m into the ground, each box 3 cm longer at both ends so no slit opens where a wall bends. The gate is its two posts and its beam. A tree is an upright post where its trunk is (`sim.colliders.trunkRadius` by kind, times the tree's size; 2.5 m tall, 1 m into the ground); leaves are not hit. A rock is the ball that stands as high as the drawn rock and is as wide at the ground, so a flat rock is a shallow dome and a tall one a boulder. `wallPieces` and `gateBoxes` give the walls and the gate as numbers, and the drawn triangles are built from the same numbers; no world fingerprint changed (checked on seeds 1, 7, 42 and 100). `render.decor.rockSink` and `sim.colliders.rockSink` are one number. 12 new tests on seed 7. 1,817 unit tests and 274 browser tests pass. Next: 3c.
- **2026-11-16 (Milestone 3):** Step 3c done, which ends step 3. `createSim` builds the physics world of an island (3b's colliders) and stands the car's body behind the start line (`startPose`); `step`, `state`, `hash`, `snapshot` and `restore` work, and the car settles and stays put for ten seconds on seed 42's sloped start. Inputs are recorded but do not move the car until step 4. `sim/quat.ts` holds the turn sums (square roots only); `sim/physics/carBody.ts` is the only code besides the colliders that touches Rapier. `sim/script.ts` drives a made-up driver for ten seconds; its fingerprint is the same in Node, Chromium and Firefox on seeds 42 and 7 (`simHashFor`, a new test in `e2e/determinism.spec.ts`). Measurements under "Step 3". 1,841 unit tests and 276 browser tests pass. Next: step 4.
