# Project state

Updated at the end of every work session. This file is the record: where the project is, what was built and found, the decisions, the working agreements and the known issues. **What to do next is in `docs/PLAN.md`**: start at its "The build order" and take the first line without a tick. Then `docs/GAME_BRIEF.md` for the design, and `docs/VISUAL_BAR.md` before drawing anything.

The step-by-step record of Milestones 1 and 2 (plans, measurements, check-ins and the session log) is in `docs/archive/STATE-milestone-1-2.md`, and their decisions are in `docs/archive/DECISIONS-milestone-1-2.md`. Known issues and working agreements from those milestones are still here.

## Where we are

- **Current milestone:** 3, Driving ([issue #3](https://github.com/TechnologicTEC/Random-Racing/issues/3)). Milestones 1 and 2 are merged and signed off (PR #7, PR #9)
- **Branch:** `milestone-3-driving`. `main` is protected by a GitHub ruleset (no force pushes, no deletion, pull request required); one pull request per milestone, merged after Tane signs off
- **Last finished part:** 4d, steering and cornering (see "Step 4"). Steps 0 to 3 and parts 4a to 4c are done before it. The car stands on four sprung wheels, stays put on any slope, drives, brakes and reverses, and steers: a 6 m circle at walking pace, 60 m at top speed. Nothing is drawn of the car yet
- **Next:** `docs/PLAN.md`, "The build order": **4e** (stability and the whole car)
- **Hand-over, 2026-11-16.** Fable 5.2 built Milestones 1 and 2 and Milestone 3 up to 4c, then planned the rest: `docs/PLAN.md` (every part to release, in order, with its rules, starting values and "done when" tests) and `docs/VISUAL_BAR.md`. Opus 5.5 finished the plan's later sections the same day and builds from here

## Milestone 3 steps

Tests first, watched failing. Unit and browser suites pass before each commit; commit and push after each step; short report after each step.

**Steps 4d to 10 are split into parts, with the tests and numbers that prove each, in `docs/PLAN.md`.** The table here is the overview.

| # | Step | Ends with | Status |
| --- | --- | --- | --- |
| 0 | Create `milestone-3-driving` from `main`. Record the plan and the choices here; move the Milestone 1 and 2 step-by-step detail to `docs/archive/STATE-milestone-1-2.md`. Note the Rapier choice on issue #3 | Pushed | Done |
| 1 | **Rapier proof.** Install the pinned package. Throwaway measurements, then kept tests: it loads in Node and both browsers; a ray dropped on the heightfield meets the ground's own height at grid points (seeds 1 and 7); a box dropped and stepped 600 times gives the same fingerprint twice, after a restore, and in Node, Chromium and Firefox | Numbers here: load time, download size, collider build time (with every tree), step time, snapshot size. **If the browsers disagree, stop and report to Tane** | Done (see the archive) |
| 2 | **Open walls** (generation only). `gen/road/walls.ts`, `Road.walls`, barriers drawn from spans with tapered ends, world fingerprint, lab drawing, barrier and 20-seed tests updated | Share of each lap left open over seeds 1 to 200; screenshots of seeds 1 to 20 checked by eye | Done (see the archive) |
| 3 | **Simulation skeleton.** Rules for `src/sim`; input record; colliders; the car body placed on the start line; `step`, `state`, `hash`, `snapshot`, `restore` | Tests: the car settles and stays put for 10 s on a sloped start (seed 42); same inputs, same fingerprint; restore carries on exactly | Done (see the archive) |
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

### Step 4 parts

Planned 2026-11-16 (plan file: `C:\Users\tanee\.claude\plans\random-racing-milestone-3-rippling-corbato.md`). How the car works is in "Step 4" once the parts are done; the short version is under the table. **4d and 4e are set out in full, with their numbers, in `docs/PLAN.md`.**

| Part | What | Status |
| --- | --- | --- |
| 4a | **Groundwork**, no change to how the car behaves. Test grounds as plain triangles with a start pose (`src/testing/testGrounds.ts`: flat, 15% ramp, banked bend, 200 m crest, kerb, 45% bank); `createSimOn(rapier, course, cfg, start)` in `sim.ts` (a course is an island or plain meshes); `carBody.ts` gains the wheel cast and the pushes; the wheels feel only ground, road and kerbs; `src/sim/vec.ts`; `car/surface.ts` (road, kerb, grass, sand, rock or snow under a wheel). Tests: each ground is what it claims; a wheel cast finds the road before the first step and after a restore and ignores walls, trees and the gate; surfaces named on seed 7 | Done |
| 4b | **Springs and standing grip.** `car/suspension.ts`, the side grip and the hold, `car/car.ts` joining them, called from `sim.step`; `CarState` gains wheel readings and forward speed; the body's own grip comes down. Tests: dropped on the flat it settles at ride height, level, and stays still; stays put for 10 s on seed 42's sloped start and parked on the 45% bank; fingerprints and restore as before | Done |
| 4c | **Engine, brake, reverse.** `car/drive.ts`. Tests: top speed 30 m/s, 95% of it in 3.5 to 4.5 s, braking in a straight line, reverse, coasting to a stop and holding, at most 10% slower up 15% | Done |
| 4d | **Steering and cornering.** `car/steer.ts`. Tests: steady circles of the radius the settings say at three speeds, left and right alike; reverse steering; the banked bend at top speed; the kerb at an angle | Done |
| 4e | **Stability and the whole car.** `car/stability.ts`, tuning. Tests: wheels stay down over the 200 m crest; never tips on the 45% bank; lands on its wheels off a 1 m drop; the scripted run on seeds 42 and 7 stays upright with one fingerprint in Node, Chromium and Firefox. The measured table here | |

**How the car will work (Claude's calls):** four 5 cm balls cast down from the body's corners each step; a spring and damper at each; sideways speed cancelled up to a grip limit; speed chases top speed with an acceleration that tapers off near the top, with slope help; the brake reverses from a standstill; the stick sets how fast the car turns at once, with a tightest circle at low speed and a sideways-force limit at high speed; drive, brake and grip forces act at the height of the car's middle so they cannot roll it; in the air a gentle turning force brings the roof back up. Every sum uses only the body's motion and the wheel casts, so there is nothing new to save in a snapshot.

## The plan and the visual bar have their own files

- **`docs/PLAN.md`: everything still to build, in order.** The build order, the routine for one part, what to do when stuck, the questions for Tane, and where each known issue is dealt with. Each milestone's parts, with their tests and numbers, are in `docs/plan/` (`M3-driving.md` has steps 4d to 10, step 6's drift and boost rules among them).
- **`docs/VISUAL_BAR.md`: what the game looks like**, with reference pictures in `docs/visual-bar/`. Read it before drawing anything.

## Milestone 3's design, and steps 1 to 3

The design approved on 2026-11-15 (Tane's choices, how the car is simulated, the folders and their rules, the main pieces, the risks) and the records of steps 1 (the Rapier proof), 2 (open walls) and 3 (the simulation skeleton), with their measurements, are in `docs/archive/STATE-milestone-3-design-and-steps-1-3.md`, unchanged.

## Step 4: springs, engine, steering and grip (2026-11-16, under way)

### 4a: groundwork

Nothing about how the car behaves changed. New:

- **Test grounds** (`src/testing/testGrounds.ts`): plain sheets of triangles where the ground is exactly known, each with a start pose and a `height(x, z)`. The car starts at the origin facing -z. `flatGround` (800 m ahead, 300 m each side), `rampGround` (100 m level, then 15% for 600 m, eased in over a 200 m radius dip), `crestGround` (8% up, a crest of 200 m radius, 8% down), `bankedBend` (a ring of 70 m radius banked 8 degrees, the car lapping it to the left), `kerbGround` (a 9 cm kerb 400 m long on the car's right, with its upright outer face), `hillsideGround` (level road with a 45% grass slope rising on the right) and `stepGround` (a 1 m drop 150 m ahead). `poseOn` stands a car anywhere on one, tipped with the ground.
- **A course** (`src/sim/course.ts`) is an island or a plain ground. `createSimOn(rapier, course, cfg, start)` starts a simulation on either; `createSim(rapier, world, cfg)` is that with an island and its start pose.
- **The wheel cast** (`castWheel` in `src/sim/physics/carBody.ts`): a ball of `car.wheels.radius` (5 cm) moved from a point in a direction; it gives the distance, the surface's slope there and the collider it met. **It meets only the ground, the road and the kerbs.** Walls, the gate, trees and rocks belong to a group the wheels do not feel (`setCollisionGroups` in `colliders.ts`), and the car's own body is left out. Whether wheels should ride over low rocks is for step 7.
- **Pushes** (`push`, `twist`): an impulse through the body's middle or at a point, and a turning impulse. Step 4's own sums act on the car only through these.
- **Surfaces** (`src/sim/car/surface.ts`): `surfaceFinder` names what a wheel met: road and kerb by their colliders, the ground by its cover (snow where it lies, else the thickest of grass, sand and rock; bare ground and the verge count as grass).
- `src/sim/vec.ts`: add, sub, scale, dot, cross, length, unit.

**Found: a cast finds nothing until the physics world has stepped once.** The engine learns where colliders are only when it steps. So `createCarPhysics` now steps the world once while it holds only the course (nothing in it can move), then adds the car. Straight after a restore a cast works without a step: the snapshot carries what the engine knew. Both are tested (`carBody.test.ts`).

### 4b: springs and standing grip

The car stands on its wheels. New in `src/sim/car`: `suspension.ts` (where the wheels are, the spring worked out from the settings, `springPush`), `grip.ts` (`sideGrip`, `turnGrip`), `drive.ts` (`restChange`: with no pedal pressed, coast when rolling and hold when all but still) and `car.ts` (`createCar`, which joins them: `step` gives the body one step's pushes, `read` gives the wheels and the speed). `sim.step` calls the car's step, then the physics. `CarState` gained `wheels` (touching, squash, surface, where it is; front left, front right, rear left, rear right) and `speed` (along the car, negative backwards).

- **Each step:** four wheel casts straight down in the car's own directions; each wheel on the ground pushes the body along the ground's slope there (spring and damper, never a pull); then, through the body's middle, the tyres take off the sideways speed (up to `car.grip.side`), the hold or the coast acts along the car, and the car's turning is brought to what is wanted (nothing, until 4d). Along and across are measured on the average slope under the grounded wheels. With no wheel down, nothing is pushed.
- **The tyres act on the speed the car is about to have:** its speed now and what gravity adds in the step. So a parked car is held exactly, not a step late.
- **Settings** (`car` in `src/config.ts`): `body` now carries its own grip (0.2, was 1) and bounce; `wheels` (5 cm balls, 0.6 m either side, 0.8 m ahead of and behind the middle); `suspension` (ride height 0.18 m, sag 0.05 m, damping 0.8: the spring is worked out from these, about 2 bounces a second undamped); `grip` (side 22 m/s2, turn 30 rad/s2); `engine.coast` (3 m/s2); `brake` (strength 20 m/s2, hold below 0.5 m/s). `sim.start.lift` is gone: the car starts at its ride height.
- **Nothing new is saved.** Every sum starts from the body's motion and the casts, so `hash`, `snapshot` and `restore` are unchanged.

**Found: the engine spreads gravity through a step in four small moves.** A car held up by pushes given once a step then reads as falling at 6 cm/s at every step's end while standing still, rides 7 mm high, and a parked car crept down a slope (25 cm in 10 s on the 45% hillside). Now the world has no gravity of its own and `carBody.ts` gives the car its weight as one push at the start of each step, like every other push. The body's speed at a step's end is then simply its speed.

**Found: nothing held the car's turning.** Rounding in the pushes set a parked car turning very slowly. `turnGrip` now brings the turning to the rate wanted (none yet); 4d's steering will set that rate.

Measured (throwaway code, deleted):

| What | Measured |
| --- | --- |
| Dropped from 0.5 m on the flat | Underside comes no lower than 14 cm (it rides at 18); settled to 2 mm and 1 cm/s after 0.7 s |
| At rest for 10 s on a sloped start | Moves 0.15 mm on seed 42 (6.5%), 0.34 mm on seed 1 (12.8%), 0.06 mm on seed 7, nothing on seeds 3 and 8. Was up to 6 mm resting on its underside |
| Parked on the 45% hillside for 10 s, facing along, up, down and across it | Under 2 cm and still (test) |
| One step with the car at rest | 0.31 to 0.45 ms; 0.87 ms on seed 8 (was 0.26 to 0.73 before the wheels) |

### 4c: engine, brake, reverse

The pedals drive the car. `speedChange(speed, pull, pedals, share, car, dt)` in `src/sim/car/drive.ts` gives how much the car's speed along itself changes in one step; `car.ts` calls it in place of `restChange` and pushes the body by it through its middle. It is worked out from the speed and the pedals alone, so nothing new is saved and `hash`, `snapshot` and `restore` are unchanged.

- **No pedal:** as 4b. The car coasts (3 m/s2) and is held once it is slower than 0.5 m/s.
- **Throttle:** the engine makes for top speed (30 m/s) times how far the pedal is down. Its push is 9.3 m/s2 until the car is within 30% of top speed (9 m/s) of that target, then evenly less, nothing at the target. Above the target it holds the car back as gently, never harder than coasting. A car rolling backwards faster than 0.5 m/s is braked first.
- **Brake:** slows a car going forwards by 20 m/s2 times how far the pedal is down. Once the car is slower than 0.5 m/s the same pedal reverses it: 6 m/s2, easing off to nothing at 8 m/s backwards. **The brake wins over the throttle** when both are down.
- **Slope help** (`engine.slopeHelp`, 0.5): while a pedal drives the car, the engine makes up half of what the slope takes in the step, and holds half back downhill. So a climb costs little speed, and a descent does not run away.
- **Everything is scaled by the share of wheels on the ground**; in the air the pedals do nothing.
- **Settings** (`car` in `src/config.ts`): `engine` is now `{ topSpeed: 30, accel: 9.3, taper: 0.3, coast: 3, slopeHelp: 0.5 }`; new `reverse: { topSpeed: 8, accel: 6 }`; `brake` unchanged.

Measured on the test grounds (throwaway code, deleted):

| What | Measured |
| --- | --- |
| Flat, throttle down | Half of top speed in 1.62 s, 90% in 3.32 s, **95% in 3.98 s**, 99% in 5.53 s. Settles at 29.9996 m/s and never goes over 30 |
| Straightness | 4.7 mm sideways after 308 m |
| Brake from 30 m/s | Stops in 1.55 s over 22.3 m (the sum gives 22.5 m) |
| Coasting from 30 m/s | Stops in 9.9 s over 150 m, then holds |
| Reverse from a standstill | 95% of 8 m/s in 1.65 s; never faster than 8 m/s |
| The 15% climb | Steady at 29.3 m/s, **97.6% of top speed**. By the same sum an 8% road costs 1.3% (not measured) |
| One step while driving on the flat test ground | 0.023 ms (the islands' cost is their colliders, measured in 4b) |

The 4c tests were seen failing without the code (23 of 30) and pass with it. 1,949 unit tests pass.

**The browser suite did not give a clean run for 4c.** Two full runs, 24 and 27 minutes: 12 failures, then 28 different ones, every one a page that did not finish loading inside its time limit, none a wrong answer. The laptop went into Modern Standby from 18:08:58 to 18:11:21 during the first run (Windows' event log), which accounts for its three Chromium failures; the rest look like the hot, slow laptop of the working agreements, though that was not proved. Every test passed in one run or the other, the simulation's fingerprint in Chromium and Firefox among them (first run), except the two 3-second budget tests, which run last and only after a clean run, so they did not run. 4c changes nothing a page draws. Committed on that evidence so the work was safe; a clean run is still owed (see the session log for whether it has been done).

A third full run the same evening, two browsers at a time with the laptop kept awake (no standby in the event log): 252 passed and 22 failed, all in Chromium, all pages that did not load inside 45 s, in four runs of neighbouring tests. Eight of them had also failed in the second run. **Those tests, run again alone straight afterwards, all passed in 4 to 22 s each (16 of 16).** A fresh `npm run dev` then served sixteen 3D pages to headless Chromium in 2 to 4 s each. So the pages and the tests are sound, and it is the long full run on this laptop that slows down in spells; the same happened on 2026-11-15 (the archive, "Step 15 done"), when the suite passed once Tane ran it by hand. Still owed: one clean full run, best by hand with nothing else open.

**Line 0 done:** Tane ran `npm run e2e` by hand after 4c, and every test passed.

### 4d: steering and cornering

The stick turns the car. `turnWanted(steer, speed, car)` in `src/sim/car/steer.ts` gives the turn rate asked for. It is full stick times the smaller of speed / `minRadius` and `sideForce` / speed, and it changes sign when the car rolls backwards. `car.ts` gives it to `turnGrip` in place of 0. It is exactly 0 (never -0) with the stick centred or the car still, so runs without steering, and their fingerprints, are as before. Nothing new is remembered.

- **Settings:** `car.steer: { minRadius: 6, sideForce: 15 }` (`SteerConfig`). Full stick gives a 6 m circle up to 9.5 m/s, 15 m at 15 m/s and 60 m at 30 m/s. The fastest turning is 1.58 rad/s at 9.5 m/s. `sideForce` stays under `grip.side` (22), so ordinary steering never slides.
- **Test helpers:** `src/testing/simDriving.ts` (`hold`, moved out of `driving.test.ts`, and `driveWith`, which asks a function what to press each step) and `src/testing/lineDriver.ts` (`stickToward`, `pointOnRing`).
- **The test driver is pure pursuit, not the plan's first rule** (see decisions). The plan's `2.5 * sin(angle)` would have run the banked ring about 3.8 m wide.
- **Kerb finding:** the 9 cm kerb throws the body up about 6 cm and rolls it about 4 degrees. A wheel can hang only 5 cm (the sag) below its rest length, so each wheel that rolls off the upright outer face is in the air for up to 10 steps (0.17 s). The wheels leave it one after another, so at 15 degrees and 30 m/s all four are not down together for 18 steps (0.3 s). The test times each wheel against the plan's 0.2 s, and the plan's row now says so. Heading and speed are hardly touched. If 4e or the kerbs of step 7 want the car calmer here, the levers are more spring travel (`suspension.sag`) or the bump stop.

Measured (throwaway code, deleted):

| What | Measured |
| --- | --- |
| Full stick, throttle 0.25 | 6.00 m circle at 7.44 m/s, both ways (9.2 m/s² sideways) |
| Full stick, throttle 0.5 | 14.88 m at 14.94 m/s, both ways (15.0 m/s²) |
| Full stick, full throttle | 59.75 m at 29.94 m/s, both ways (15.0 m/s²) |
| Half stick (64 of 127), full throttle | 118.9 m at 29.98 m/s |
| Stick thrown from centre to full | 99% of the new turn rate in 1 step at 30 m/s, 2 steps at 15 m/s |
| Banked ring (70 m, 8 degrees) at top speed, two laps, pure-pursuit driver | Worst 4.3 cm off the middle line (3.7 cm outside on average), slowest 29.91 m/s, stick 0.85, four wheels down |
| Kerb at 5 degrees, 18 and 30 m/s | Heading changed by 0.05 and 0.02 degrees, speed lost 0.09% and 0.04%, longest wheel in the air 6 steps, most roll 4.5 degrees |
| Kerb at 15 degrees, 18 and 30 m/s | Heading changed by 0.08 and 0.11 degrees, speed lost 0.20% and 0.09%, longest wheel in the air 9 and 10 steps (all four not down: 9 and 18 steps), most roll 4 degrees |
| One step while steering on the flat test ground | 0.025 ms |

The 4d tests were seen failing without the code. 8 of the 11 car tests failed. The 15 degree, 30 m/s kerb crossing failed before any steering existed, on the air-time measure described above. The pure tests failed on the missing module. 1,973 unit tests pass, and all 276 browser tests passed in one run.

## Working agreements

- Branch + pull request per milestone. Commit and push after each step. Direct pushes to `main` are blocked, including docs updates.
- Models: Fable 5.2 built up to 4c and wrote the plan (2026-11-16); Opus 5.5 builds from here. Which model and effort for each milestone is Tane's call.
- Start each milestone in a fresh session: read `CLAUDE.md`, this file, `docs/PLAN.md` and the milestone's file in `docs/plan/`, and `docs/GAME_BRIEF.md`, then plan in plan mode.
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

The 170 decisions of Milestones 1 and 2 (2026-11-11 to 2026-11-15) are in `docs/archive/DECISIONS-milestone-1-2.md`, unchanged. They still stand. Search that file before changing how tracks, islands, the road or the drawing work.

| Date | Decision | Why |
| --- | --- | --- |
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
| 2026-11-16 | **The engine eases off over the last 30% of its speed, and makes up half of what a slope takes** (4c: `engine.taper`, `engine.slopeHelp`) | Claude's call. 95% of top speed in 3.98 s (the brief: about 4); 97.6% of top speed up the steepest road, 15% |
| 2026-11-16 | **The brake wins over the throttle, and reverses once the car is all but still** (4c) | Claude's call. One pedal for brake and reverse, as the brief's controls table has it; worked out from the speed and the pedals alone, so nothing is remembered |
| 2026-11-16 | **Steps 4d to 10 are planned in parts with their tests and numbers** (`docs/PLAN.md`), and Milestones 4 to 6 have design notes | Tane: a different model builds everything after today, so the planning is done first. Approved by Tane with the plan |
| 2026-11-16 | **The drift hop is drawn, not simulated**: the body stays on its springs | Claude's call, approved with the plan. A real hop takes the wheels off the ground, and all grip with them, for a quarter of a second at the start of every drift |
| 2026-11-16 | **In a drift the car really is turned 24 degrees into the corner**, and the tyres grip along the line it travels, not the line it points | Claude's call, approved with the plan. The slide is then real for collisions and for the camera, and one rule (how fast the path turns) gives the handling |
| 2026-11-16 | **Drift turning is a turn rate**: 0.25 rad/s with the stick away from the corner to 1.5 with it in, circles of 120 m to 20 m at top speed. **Ordinary steering holds 15 m/s2 at most**: a 60 m circle at top speed | Claude's call, approved with the plan. The generator's drift corners are 20 to 90 m; corners it banks fully (70 m and wider) are flat out on grip alone, tighter ones need a slide or a lift |
| 2026-11-16 | **Above its top speed the car sheds 9 m/s2** (`engine.shed`, from step 6): the end of a boost and running onto grass are one rule | Claude's call, approved with the plan. At the coasting rate a boost would fade for three more seconds and the tiers would hardly differ |
| 2026-11-16 | **Reference pictures for the look are committed** in `docs/visual-bar/` | Claude's call, approved with the plan. `test-results/` is emptied by every run |
| 2026-11-16 | The decisions of Milestones 1 and 2 moved from this file to `docs/archive/DECISIONS-milestone-1-2.md` | This file was 41,000 tokens, and a session reads 25,000 in one go. Approved with the plan |
| 2026-11-16 | **The plan has its own files**: `docs/PLAN.md` (the build order to tick from today to release, the routine for one part, what to do when stuck, the questions for Tane, where each known issue is dealt with) and one file per milestone in `docs/plan/`; the visual bar has `docs/VISUAL_BAR.md`. This file keeps the record; Milestone 3's design and steps 1 to 3 moved to `docs/archive/`. CLAUDE.md's "Read first" lists the files in order | Approved by Tane. One file answers "what do I do next", and every file can be read in one go (25,000 tokens): this one was 28,600 |
| 2026-11-16 | **In a drift the line of travel is worked out from the slide as it was before the step**, and the slide keeps its side until the nose is back; `drift.turnGrip` 240 rad/s² | Found while checking step 6's rules: as first written, the path swung 1.6 degrees wide for the whole swing-in, which broke the step's own test |
| 2026-11-16 | **The wall-bump settings are `car.bump`** (`BumpConfig`), not `car.wall` | `WallConfig` is already the generator's (`road.walls`) |
| 2026-11-16 | **The line-following test driver is pure pursuit** (`stickToward` in `src/testing/lineDriver.ts`): it asks for the circle through the car and the point ahead. 9a's bot uses it | Claude's call, for Tane to see (test code only). The plan's first rule, 2.5 times the sine of the angle to the point, gives 0.27 of the 0.857 stick the 70 m ring needs at top speed, so the car would settle about 3.8 m wide and the 1 m test could not pass. Pure pursuit holds it to 4 cm |
| 2026-11-16 | **"No wheel in the air for over 0.2 s" at the kerb is timed per wheel** | Claude's reading of the plan's words, for Tane to judge. The wheels leave the kerb's 9 cm face one after another, each for up to 0.17 s, so all four are not down together for 0.3 s at 15 degrees and 30 m/s. Heading and speed are unaffected (0.11 degrees, 0.09%) |

## Notes for later milestones

The design notes for Milestones 4, 5 and 6, and their steps, are in `docs/PLAN.md`.

### Earlier notes

- **M2 (from Tane):** track-first is fine. Shape the island so the track looks like it belongs: hills where it climbs, coastline near it where possible.
- **M3 (from Tane), done 2026-11-15:** checked and flagged; Tane chose the deterministic build (see decisions).
- **M2:** add the elevation score; move generation into a Web Worker.
- **M2:** folded tracks have parallel sections as close as 40 m (centre to centre). Terrain fitting must keep neighbouring sections at similar heights or separate them with a wall or bank, since the brief's cut-and-fill blends over 10 to 25 m.
- **M2:** corner entries have no easing (the curvature steps from zero to 1/radius). Banking handles this by averaging its tilt over 30 m (done in step 8); kerbs should allow for it too.

## Known issues and risks

- **Few roadsides open onto the sea** (step 2d): half the seeds with sea beside the road have an opening facing it, mostly flat and rolling ones, and no mountain seed has. Coast roads mostly run above a cliff or round the outside of a corner, and both keep their wall. Opening corner outsides above gentle beaches, or lower coast roads, would change it. For Tane at check-in 1.
- **Wall ends are ramps** (0.8 m up over 6 m), and hillsides of up to 40% beside mountain roads are open: both wait for the car (steps 4, 7 and 8; see "Step 2" in `docs/archive/STATE-milestone-3-design-and-steps-1-3.md`).

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
- **2026-11-16 (Milestone 3):** Step 2d done, which ends step 2. Measured on seeds 1 to 200: with the 25% slope rule the middle lap was 45% open but mountain laps only 20% (9% at the least), walled beside ordinary grass hillsides. `road.walls.maxSlope` raised to 40%: the middle lap is now 50% open, mountain laps 41%, none under 19% (table under "Step 2", now in the archive). The sea is mostly behind a wall because coast roads mostly run above cliffs or round the outside of corners; half the seeds with sea beside the road have an opening facing it. Screenshots of seeds 1 to 20 looked at in two batches, six mountain seeds again after the change, and close views of 40 wall ends: walls where expected, clean ends. Two tests added first and seen failing (a 30% hillside stays open; mountain seeds 1, 3 and 13 are more than a quarter open). Every seed's world fingerprint changes again (walls only). 1,674 unit tests and 274 browser tests pass. Next: step 3, the simulation skeleton.
- **2026-11-16 (Milestone 3):** Step 3a done. The architecture rules cover `src/sim`: it may import `core`, `gen` and itself, and the config's types only; the same bans on chance, the clock and inexact maths as generation; Rapier may be imported only under `src/sim/physics`, and a second test checks no other file in `src` imports it (`importsRapier`). `src/sim` is in the type check without browser types. The input record (`src/sim/input.ts`): throttle and brake as 0 to 255, steering as -127 (left) to 127 (right), drift and reset as 0 or 1; `makeInput` from a device's readings, `inputFractions` back to fractions, `packInput` and `unpackInput` for one whole number a record (for ghosts and fingerprints). Step 3 split into parts 3a to 3c. 1,795 unit tests and 274 browser tests pass. Next: 3b.
- **2026-11-16 (Milestone 3):** Step 3b done. Everything the car can hit has a collider, added in a fixed order by `addWorldColliders` (ground, road, kerbs, walls, gate, trees, rocks), which returns the handles so a later step can tell what a wheel or the body met. A wall is one solid box a piece, its top along the drawn wall's top (so the sloping ends are ramps here too), reaching 0.6 m into the ground, each box 3 cm longer at both ends so no slit opens where a wall bends. The gate is its two posts and its beam. A tree is an upright post where its trunk is (`sim.colliders.trunkRadius` by kind, times the tree's size; 2.5 m tall, 1 m into the ground); leaves are not hit. A rock is the ball that stands as high as the drawn rock and is as wide at the ground, so a flat rock is a shallow dome and a tall one a boulder. `wallPieces` and `gateBoxes` give the walls and the gate as numbers, and the drawn triangles are built from the same numbers; no world fingerprint changed (checked on seeds 1, 7, 42 and 100). `render.decor.rockSink` and `sim.colliders.rockSink` are one number. 12 new tests on seed 7. 1,817 unit tests and 274 browser tests pass. Next: 3c.
- **2026-11-16 (Milestone 3):** Step 3c done, which ends step 3. `createSim` builds the physics world of an island (3b's colliders) and stands the car's body behind the start line (`startPose`); `step`, `state`, `hash`, `snapshot` and `restore` work, and the car settles and stays put for ten seconds on seed 42's sloped start. Inputs are recorded but do not move the car until step 4. `sim/quat.ts` holds the turn sums (square roots only); `sim/physics/carBody.ts` is the only code besides the colliders that touches Rapier. `sim/script.ts` drives a made-up driver for ten seconds; its fingerprint is the same in Node, Chromium and Firefox on seeds 42 and 7 (`simHashFor`, a new test in `e2e/determinism.spec.ts`). Measurements under "Step 3". 1,841 unit tests and 276 browser tests pass. Next: step 4.
- **2026-11-16 (Milestone 3):** Steps 4a, 4b and 4c done (see "Step 4"). 4a: test grounds, `createSimOn`, the wheel cast, pushes, surfaces. 4b: the car stands on four sprung wheels and stays put on any slope; gravity became one push a step. 4c: the engine, the brake and reverse (`speedChange` in `sim/car/drive.ts`); 95% of top speed in 3.98 s, 22.3 m to stop from top speed, 97.6% of top speed up the 15% climb. 1,949 unit tests pass. The browser suite had no clean run (hot laptop, page-load timeouts only; see "4c"): **run `npm run e2e` once the laptop is cool and note the result here.** Next: 4d, steering and cornering.
- **2026-11-16 (Milestone 3, hand-over):** Last day of the model that built steps 0 to 4c. Planned in plan mode and approved by Tane: every step still to do is split into parts with the tests and numbers that prove each (`docs/PLAN.md`), with step 6's drift and boost rules, timings and starting config values set out exactly; design notes for Milestones 4, 5 and 6 ("Notes for later milestones"); and the visual bar (`docs/VISUAL_BAR.md`) with eleven reference pictures in `docs/visual-bar/`. The decisions of Milestones 1 and 2 moved to `docs/archive/DECISIONS-milestone-1-2.md`. No code changed after 4c. A third browser run failed 22 tests on page-load timeouts; the same tests passed when run alone (see "4c"), so **a clean full browser run is still owed**. **Tane asked that 4d and 4e wait until Tane has had another look.** Next, when Tane says: 4d.
- **2026-11-16 (Milestone 3, the plan finished):** Tane asked for the rest of the project to be planned so the next model knows exactly what to do and in what order. Approved in plan mode. `docs/PLAN.md` and one file per milestone in `docs/plan/` now hold everything still to build: the build order (a list to tick from line 0, the owed browser run, to the release of version 1), the routine for one part, what to do when something does not go to plan, whose call is whose, the questions for each check-in, steps 4d to 10 with their sums written out (step 6's car step line by line), Milestones 4, 5 and 6 as ordered steps with their tests, and where each known issue is dealt with. The visual bar moved to `docs/VISUAL_BAR.md`. Found while checking step 6: the line of travel must use the slide as it was before the step (decisions). Fable 5.2 started this; Opus 5.5 finished it. Docs only. Next: line 0 of the build order, then 4d once Tane has looked at the plan.
- **2026-11-16 (Milestone 3, Opus 5.5):** Line 0 done: Tane ran `npm run e2e` by hand after 4c and it all passed. 4d planned in plan mode, approved, and done (see "4d"). The stick turns the car: `turnWanted` in `src/sim/car/steer.ts`, `car.steer: { minRadius: 6, sideForce: 15 }`. Circles of 6.00, 14.88 and 59.75 m at the three speeds, both ways alike. Reverse steers as a real car does. The banked ring at top speed is held to 4 cm. Kerb crossings change the heading by at most 0.11 degrees. The ring's test driver is now pure pursuit, because the plan's first rule would have run 3.8 m wide (decisions). The kerb's air time is timed per wheel (decisions). 1,973 unit tests pass. The browser suite passed in one clean run: 276 tests in 16.7 minutes. That run includes the scripted run's fingerprint, now with steering, matching in Node, Chromium and Firefox. Next: 4e.
