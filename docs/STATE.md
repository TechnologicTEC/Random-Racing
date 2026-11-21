# Project state

Updated at the end of every work session. This file is the record: where the project is, what was built and found, the decisions, the working agreements and the known issues. **What to do next is in `docs/PLAN.md`**: start at its "The build order" and take the first line without a tick. Then `docs/GAME_BRIEF.md` for the design, and `docs/VISUAL_BAR.md` before drawing anything.

The step-by-step record of Milestones 1 and 2 (plans, measurements, check-ins and the session log) is in `docs/archive/STATE-milestone-1-2.md`, and their decisions are in `docs/archive/DECISIONS-milestone-1-2.md`. Known issues and working agreements from those milestones are still here.

## Where we are

- **Current milestone:** 3, Driving ([issue #3](https://github.com/TechnologicTEC/Random-Racing/issues/3)). Milestones 1 and 2 are merged and signed off (PR #7, PR #9)
- **Branch:** `milestone-3-driving`. `main` is protected by a GitHub ruleset (no force pushes, no deletion, pull request required); one pull request per milestone, merged after Tane signs off
- **Last finished part:** 9c, the same lap in every browser (see "Step 9"). **This ends step 9**
- **Next:** `docs/PLAN.md`, "The build order": **check-in 2 with Tane** (the questions are in `docs/PLAN.md`; step 9's tables are under "Step 9"). `drive-slide.jpg` and `drive-boost.jpg` wait in `docs/visual-bar/` for Tane to accept at check-in 2
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
| 6 | **Drift and boost.** The drift rules, hop, slide, tiers, boost; sparks in the tier's colour and a simple boost flame; camera swing and wider view; tuning panel | Tests: every rule in the brief's drift list; boost raises top speed for exactly its time | Done |
| 7 | **Surfaces and bumps.** Off-road slowdown, gentle wall bounce (cancels a drift, keeps most speed along the wall), trees and rocks, kerbs | Tests: 40% slower on grass and sand; a 30° wall hit keeps the car moving and upright; a tree stops it without flipping | Done |
| 8 | **Progress and respawn.** Place on the lap, checkpoints, water, off the map, upside down, stuck, R | Tests on real seeds: drive into the sea and come back at the last checkpoint 1 s later, facing along the road | Done |
| 9 | **Bot driver and the corner proof** (`src/testing/botDriver.ts`: follows the centre line, drifts where told). It laps seeds 1 to 20 in Node, and drifts through a hairpin, a sweeper, a chicane and a plain corner on real seeds. A scripted lap gives the same fingerprint in Node, Chromium and Firefox | Table here: lap times, wall hits, respawns (must be 0), drift exit speed against no-drift per corner type, the 3 km 15% seeds included | Done |
| | **Check-in 2 with Tane:** drift feel, with the tuning panel | Feedback | |
| 10 | Tuning from feedback; `npm run perf` with the car; README, CLAUDE.md and this file; pull request | **Tane's playtest sign-off**, then merge | |

### Step 3 parts

| Part | What | Status |
| --- | --- | --- |
| 3a | Rules for `src/sim` in `testing/architectureRules.ts` (may import `core`, `gen` and itself, config types only; exact maths, no clock, no chance; Rapier only in `src/sim/physics`, and nowhere else in `src`), `src/sim` in `tsconfig.pure.json`; the input record (`src/sim/input.ts`) | Done |
| 3b | Colliders in `src/sim/physics/colliders.ts`: a solid box for each piece of each wall (the sloping ends included), three boxes for the gate, an upright post for each tree trunk, part of a ball for each rock; `addWorldColliders` adds them all, with the ground, road and kerbs, in a fixed order, and returns their handles. The walls and the gate come from the same numbers that are drawn (`wallPieces` in `gen/road/barriers.ts`, `gateBoxes` in `gen/road/startGate.ts`). `sim.colliders` in `src/config.ts`. Tests on seed 7 with rays (wall faces, tops and feet, openings, posts, beam, trunks, rocks) and a ball rolled at a wall and through an opening | Done |
| 3c | `car`, and the clock and start in `sim`, in `src/config.ts`; the car body placed on the start line (`src/sim/physics/carBody.ts`); `createSim` in `src/sim/sim.ts` with `step`, `state`, `hash`, `snapshot`, `restore`. Tests: the car settles and stays put for 10 s on seed 42's sloped start; same inputs, same fingerprint; a restored run carries on exactly; the same fingerprint in Node, Chromium and Firefox | Done |

### Step 4 parts

Planned 2026-11-16 (plan file: `C:\Users\tanee\.claude\plans\random-racing-milestone-3-rippling-corbato.md`). How the car works is in `docs/archive/STATE-milestone-3-step-4.md`; the short version is under the table. **4d and 4e are set out in full, with their numbers, in `docs/PLAN.md`.**

| Part | What | Status |
| --- | --- | --- |
| 4a | **Groundwork**, no change to how the car behaves. Test grounds as plain triangles with a start pose (`src/testing/testGrounds.ts`: flat, 15% ramp, banked bend, 200 m crest, kerb, 45% bank); `createSimOn(rapier, course, cfg, start)` in `sim.ts` (a course is an island or plain meshes); `carBody.ts` gains the wheel cast and the pushes; the wheels feel only ground, road and kerbs; `src/sim/vec.ts`; `car/surface.ts` (road, kerb, grass, sand, rock or snow under a wheel). Tests: each ground is what it claims; a wheel cast finds the road before the first step and after a restore and ignores walls, trees and the gate; surfaces named on seed 7 | Done |
| 4b | **Springs and standing grip.** `car/suspension.ts`, the side grip and the hold, `car/car.ts` joining them, called from `sim.step`; `CarState` gains wheel readings and forward speed; the body's own grip comes down. Tests: dropped on the flat it settles at ride height, level, and stays still; stays put for 10 s on seed 42's sloped start and parked on the 45% bank; fingerprints and restore as before | Done |
| 4c | **Engine, brake, reverse.** `car/drive.ts`. Tests: top speed 30 m/s, 95% of it in 3.5 to 4.5 s, braking in a straight line, reverse, coasting to a stop and holding, at most 10% slower up 15% | Done |
| 4d | **Steering and cornering.** `car/steer.ts`. Tests: steady circles of the radius the settings say at three speeds, left and right alike; reverse steering; the banked bend at top speed; the kerb at an angle | Done |
| 4e | **Stability and the whole car.** `car/stability.ts`, tuning. Tests: wheels stay down over the 200 m crest; never tips on the 45% bank; lands on its wheels off a 1 m drop; the scripted run on seeds 42 and 7 stays upright with one fingerprint in Node, Chromium and Firefox. The measured table here | Done |

**How the car will work (Claude's calls):** four 5 cm balls cast down from the body's corners each step; a spring and damper at each; sideways speed cancelled up to a grip limit; speed chases top speed with an acceleration that tapers off near the top, with slope help; the brake reverses from a standstill; the stick sets how fast the car turns at once, with a tightest circle at low speed and a sideways-force limit at high speed; drive, brake and grip forces act at the height of the car's middle so they cannot roll it; in the air a gentle turning force brings the roof back up. Every sum uses only the body's motion and the wheel casts, so there is nothing new to save in a snapshot.

## The plan and the visual bar have their own files

- **`docs/PLAN.md`: everything still to build, in order.** The build order, the routine for one part, what to do when stuck, the questions for Tane, and where each known issue is dealt with. Each milestone's parts, with their tests and numbers, are in `docs/plan/` (`M3-driving.md` has steps 4d to 10, step 6's drift and boost rules among them).
- **`docs/VISUAL_BAR.md`: what the game looks like**, with reference pictures in `docs/visual-bar/`. Read it before drawing anything.

## Milestone 3's design, and steps 1 to 3

The design approved on 2026-11-15 (Tane's choices, how the car is simulated, the folders and their rules, the main pieces, the risks) and the records of steps 1 (the Rapier proof), 2 (open walls) and 3 (the simulation skeleton), with their measurements, are in `docs/archive/STATE-milestone-3-design-and-steps-1-3.md`, unchanged.

## Step 4: springs, engine, steering and grip (done)

The records of 4a to 4e (how the car works, what was found, the measured tables) are in `docs/archive/STATE-milestone-3-step-4.md`, unchanged. In short: the car stands on four sprung wheels at 26 cm, drives (top speed 30 m/s, 95% of it in 3.98 s), brakes (22.3 m from top speed), reverses, steers (full stick: 6 m circles at low speed, 60 m at top speed) and lands on its wheels.

## Step 5: drive it (2026-11-17)

Planned in plan mode and approved 2026-11-17 (plan file: `C:\Users\tanee\.claude\plans\pasted-content-id-dee8-random-racing-compressed-pumpkin.md`). Nothing in `src/sim` changes in this step.

| Part | What | Status |
| --- | --- | --- |
| 5a | **Input.** `src/input/`: `keysToInput` (keyboard), `padToInput` and `padPresses` (controller, standard layout), `mergeInputs`; `input.deadZone` | Done |
| 5b | **The loop.** `src/app/drive.ts`: `advance`, `blendState`; `sim.maxStepsPerFrame`; Rapier loaded beside the world and the simulation built on the page (not stepped yet); `drive.state()` and `drive.hash()` | Done |
| 5c | **The car drawn.** `render/carShape.ts`, `render/carView.ts`, `WorldView.setCar`, `KART` colours, `render.car`; the `look=car` close view | Done |
| 5d | **Chase camera.** `camera/chase.ts`, `camera.chase` | Done |
| 5e | **The page opens driving**, in two commits: old tests get `cam=fly`, then the default changes. Keys, controller, readout, `drive.run` and `drive.reset` | Done |

### 5a: input

- **Keyboard** (`src/input/keyboard.ts`): `keysToInput(held)` takes the set of keys held, by `KeyboardEvent.code`: the key's place on the keyboard, not its letter, so W, A, S and D sit in the same place on any layout (Claude's call). W or Up: throttle. S or Down: brake and reverse. A or Left, D or Right: steer, and both together cancel. Space or either Shift: drift. R: reset. Each key is all or nothing.
- **Controller** (`src/input/gamepad.ts`): `padToInput(axes, buttons, cfg)` for the browser's standard layout only. Right trigger (button 7): throttle. Left trigger (6): brake. Left stick (axis 0): steering. Right bumper (5): drift. Back (8): reset. `padPresses(buttons)` gives Y (3, camera) and Start (9, pause), which are for the page and not in the input record. A stick within `input.deadZone` (0.15) of its middle reads 0, and the rest of its travel is stretched to reach 1: 0.575 gives a half.
- **Both at once** (`src/input/merge.ts`): `mergeInputs(a, b)` takes the harder press of each pedal, the steering further from the middle, and a button if either device presses it.
- Nothing is smoothed anywhere (brief). The page does not use any of it until 5e.

The three test files failed on their missing modules before the code existed. 2,009 unit tests pass.

### 5b: the loop, and the simulation on the page

- **`advance(carried, frameSeconds, cfg)`** (`src/app/drive.ts`) says how many steps a frame takes. The frame's time is added to the time carried over from the last frame, and each whole sixtieth of a second is one step. A frame takes at most `sim.maxStepsPerFrame` (5) steps; the rest of a longer frame is dropped and nothing is carried over, so after a hidden tab the car does not race to catch up. What is left over is carried to the next frame, and also given as the **blend**, from 0 up to (not including) 1: how far the moment shown lies between the last two steps.
- **`blendState(before, after, blend)`** gives the car as drawn between two steps. Places, speeds and wheels move in a straight line, and the turn takes the short way round (a normalised blend, with the second turn flipped if it points away from the first). Blends of 0 and 1 give the two states exactly.
- **On the page**, Rapier is fetched while the worker builds the first world. Once both are in, `createSim` builds the island's simulation. Asking for a new island frees the old simulation at once (`sim.free()`). The simulation is not stepped yet. `window.seedCircuit.drive` has `state()` and `hash()`, each null while the simulation is being built. The body's `data-drive-step` is set once it is built, and `data-drive-ms` gives how long the build took.
- New test file `e2e/drive.spec.ts`, for the driving tests.

Measured on the page (headless, throwaway test, deleted):

| What | Chromium | Firefox |
| --- | --- | --- |
| Loading Rapier on a page that has not loaded it | 101 ms | 253 ms |
| Building the simulation, seed 7 (median of 4) | 31 ms (90 the first time) | 53 ms |
| Building the simulation, seed 8, the most wooded (median of 4) | 47 ms | 104 ms |
| The world in the worker, seed 7, with and without Rapier fetched beside it (median of 4) | 1,110 and 1,080 ms | 1,460 and 1,440 ms |
| The same, seed 8 | 1,350 and 1,325 ms | 1,850 and 1,790 ms |

Fetching Rapier beside the world makes no difference beyond the noise. The world in the worker is slower here than in Node (430 to 640 ms) because the headless page draws in software at the same time.

Tests seen failing first: `drive.test.ts` on its missing module, and the two browser tests waiting for a simulation that the page did not build. 2,019 unit tests pass.

### 5c: the car drawn

- **The kart** (`src/render/carShape.ts`, plain numbers like `treeShapes.ts`, whose builder is now exported as `createShapeBuilder`) is built in the body's own directions, inside the simulated box (1.4 by 0.6 by 2.2 m). `kartBody()` has a floor, bumper, wedge nose, cowl, side pods, an engine block, a seat leaning back, the driver's body, a steering wheel, and a round helmet with a visor. `kartWheel(look)` is a 12-sided tyre with a pale hub on its outer face. With the car riding at 26 cm, the floor is 26 cm off the road and the top of the helmet 86 cm. 492 triangles in all: 212 for the body and 70 a wheel.
- **Where it is drawn:** `kartPose(state, cfg)` places the body where the simulation has it. Each wheel goes where the simulation's wheel is (`CarState.wheels[i].at`, the middle of the 5 cm ball it casts, so the springs show), lifted by the drawn radius less the ball's, so the tyre's bottom is where the ball's bottom is. The front wheels turn with the stick, by up to `render.car.steerAngle` (0.35 rad, drawn only).
- **Three.js** (`src/render/carView.ts`): one flat-shaded material with vertex colours, patched like the road to take the land's and the clouds' shadows. The kart casts and takes the near shadows (it is on the casters' layer). `WorldView` gains `setCar(pose | null)` and `setFieldOfView(degrees)` (for 5e).
- **Colours:** `KART` in `palette.ts`, the visual bar's proposal: body yellow-orange `[0.98, 0.72, 0.12]`, chassis and seat the gate's dark grey, helmet off-white, the driver in the page's teal `[0.1, 0.49, 0.47]`, tyres near black, hubs pale `[0.78, 0.78, 0.75]`. Sizes: `render.car: { wheelRadius: 0.28, wheelWidth: 0.24, steerAngle: 0.35 }` (`KartViewConfig`).
- **New close view `look=car`** (`lookAtCar` in `camera/spots.ts`, `camera.car: { distance: 7, tilt: 0.3, side: 0.7 }`): the car where it stands at the start, from behind and round to its right. It is in the screenshot `LOOKS` list (`world-<seed>-car.png`). **The car is drawn only in this view until 5e**, so every old address gives the same picture as before. The body's `data-drive-car` says `shown` or `hidden`.

Pictures looked at (`look=car` on seeds 1, 3, 7 and 42; seed 7 opens at 07:27, a low sun): the car stands on its four wheels with no gap and no sinking; it casts a soft shadow on the road and sits in the gate's shadow on seed 3; it is lit like the walls beside it; its yellow stands out from the road and grass; nothing is outlined or glows. `look=start` and `lap=0.02` on the same seeds show no car, and seed 42's start view matches `docs/visual-bar/start-gate.jpg`. The car's own reference pictures wait for Tane at check-in 1.

Tests seen failing first: `carShape.test.ts` and `lookAtCar` on their missing code; the two browser tests (the car in `look=car`, no car in old views) on the last commit's page. 2,031 unit tests pass.

### 5d: chase camera

`chaseStart(car, groundAt, cfg)` and `chaseNext(prev, car, frameSeconds, groundAt, cfg)` in `src/camera/chase.ts` are plain numbers, like `flyAlong.ts`. The page uses them from 5e.

- **Where it stands:** `back` (6.5 m) behind the car's middle, along the way the car travels on the map, and `height` (2.4 m) above it. It looks at a point `lookAhead` (5 m) in front and `lookHeight` (1 m) up. It is raised to stay `clearance` (0.8 m) above the ground under it (`groundAt`, which the page gives as `sampleField` on `world.ground`).
- **Which way:** the car's velocity on the map, once that is over `travelBelow` (2 m/s) and pointing forwards. Otherwise the car's nose. **So a reversing car keeps the camera behind its nose** (Claude's call): following the velocity, the camera would swing round in front of a car reversing faster than 2 m/s.
- **Easing:** the heading eases towards that direction with a time of `follow` (0.15 s), solved exactly for a direction that turns evenly through the frame. A car turning steadily is then followed identically at any frame rate. Angles are not wrapped, so passing a half turn never sends it the long way round.
- **Settings:** `camera.chase: { back: 6.5, height: 2.4, lookAhead: 5, lookHeight: 1, follow: 0.15, clearance: 0.8, fieldOfView: 60, travelBelow: 2 }` (`ChaseConfig`). The field of view is used from 5e.

Measured (throwaway code, deleted):

| What | Measured |
| --- | --- |
| The eye after 2 s on a 60 m circle at 30 m/s, at 30, 60 and 144 frames a second | The same to 1e-14 m. A plain `1 - exp(-dt / follow)` ease would differ by 4.1 cm |
| After the car turns a quarter circle at once (60 frames a second) | 18 degrees off behind it after 0.25 s, 3.4 after 0.5 s, 0.12 after 1 s |
| A steady turn of 0.5 rad/s | It lags the line of travel by 0.075 rad (4.3 degrees), the follow time times the turn rate (test) |
| Driven at 30 m/s through seed 28496's start gorge, 300 m either side of the line | Never under 0.8 m above the ground (test) |

`chase.test.ts` (10 tests) failed on its missing module first. 2,041 unit tests pass.

### 5e: the page opens driving

**First commit, with the page unchanged:** every browser test address that relied on the page opening flying now says so with `cam=fly` (43 in `e2e/world.spec.ts`, the screenshot loop's `lap=` views among them, and the flying view of `e2e/perf.spec.ts`). The page picks its opening camera with `openingCamera(params)` in `src/app/route.ts`: `cam=orbit` circles; `cam=fly`, a point of the lap and the plain address fly. 2,044 unit tests pass; all 290 browser tests passed in one run (19.2 minutes). The second commit makes driving the default.

**Second commit: the page opens driving.**

- **Views.** The plain address and `cam=chase` drive, with the chase camera (5d) at a 60 degree field of view. `cam=fly` and `lap=` fly the lap; `cam=orbit`, `look=` and `at=` circle, as before. C (the camera button, or the controller's Y) goes driving, flying, circling, driving (`nextCamera` in `route.ts`). In the flying and circling views the simulation is built but takes no step. Back in the driving view, the car carries on from where it was, and the camera starts straight behind it.
- **The car on the page** (`src/app/driving.ts`, `createDriving`): each frame takes the steps `advance` gives with the input read that frame, and draws the car blended between the last two states (5b). The chase camera follows the blended car. The camera starts straight behind the car for a new simulation, after `run` and after a reset. The car is drawn while driving, in `look=car`, and in the other views once it has been driven. In the old views it is never drawn, so their pictures are unchanged.
- **Keys and controller** (`src/input/devices.ts`, `createDevices`): the keys held, by `KeyboardEvent.code`, and the first controller with the standard layout, polled once a frame and merged (5a). Keys go to the car only in the driving view, and only when no text box, slider or button has the focus. A clicked button gives the focus back, so the keys work straight after "New island". Keys held when the window loses the focus or the page is hidden count as let go. In the flying view, Space and the arrows keep their old use. **R, or the controller's Back, puts the car back on the start line** as a new simulation (Claude's call) until 8b makes reset the simulation's own respawn. Start and Esc do nothing until Milestone 4's pause menu.
- **`still=1` holds the car** as well as the waves. The system's "reduce motion" setting still pauses the waves and the flight, but no longer the car.
- **The readout**, a card in the bottom right corner (`.world-dash`): the speed in large figures (`Math.round(|speed| * 3.6)` km/h) and the surface under most wheels (`mainSurface` in `drive.ts`; "in the air" with none down). Shown only while driving.
- **The hint** gives the keys of the view in use. The driving hint says a controller works once a button on it is pressed, because Firefox shows a controller only after that.
- **`window.seedCircuit.drive`** gains `run(steps, raw?)`, which takes the steps at once, draws one frame and returns the state, and `reset()`.
- **Tests changed with the behaviour, not loosened:** the plain-address test now expects driving, and "switches between flying the lap and circling the island" now goes flying, circling, driving. The old-address check is one browser test per address, because five non-still pages drawn in software ran past one test's 60 seconds.

Pictures looked at (`world-<seed>-drive-start.png` and `-drive-5s.png`, after `run(300, { throttle: 1 })`, on seeds 1, 3, 7 and 42; seed 7 opens at 07:27, a low sun): the car sits low in the middle at about an eighth of the picture's width. The road ahead is clear above it, and no card covers the road (the readout sits in the bottom right, beside the controls). The car stands on its wheels with its shadow under it, under the gate's shadow on seed 3, and darker in seed 1's evening light. After 5 s the readout shows 105 to 108 km/h on the road. **Seen from straight behind, the kart shows mostly its dark engine block and seat, with the yellow only at the side pods**: a question for check-in 1 (making the engine cover body-coloured is a one-line change in `carShape.ts`).

Tests seen failing first: `nextCamera`, `openingCamera`'s driving default, `mainSurface` and `driving.test.ts` on their missing code, and seven of the eight new browser tests on the old page (the eighth, `still=1` holding the car, passed because nothing stepped it yet). 2,056 unit tests pass.

## Step 6: drift and boost (2026-11-17)

Planned in plan mode and approved 2026-11-17 (plan file: `C:\Users\tanee\.claude\plans\pasted-content-id-dfe7-random-racing-structured-brooks.md`). The rules, starting values and tests are those of `docs/plan/M3-driving.md`, "Step 6".

| Part | What | Status |
| --- | --- | --- |
| 6a | **The drift rules, pure.** `src/sim/car/drift.ts`: `DriftState`, `NO_DRIFT`, `driftSteps`, `stepDrift`, `tierOf`, `pathTurn`; `car.drift`, `car.boost`, `car.engine.shed` | Done |
| 6b | **Drift and boost in the car.** `car.ts`, `drive.ts`, `grip.ts`, `sim.ts` | Done |
| 6c | **Hits cancel a drift.** `touching()` in `carBody.ts`; solid things on plain courses; `wallGround` | Done |
| 6d | **Sparks, flame and hop**, drawn (`render/driftEffects.ts`, `carShape.ts`, `carView.ts`); the readout | Done |
| 6e | **Camera swing and wider view** (`camera/chase.ts`) | Done |
| 6f | **Tuning panel** (`app/tuning.ts`, `app/tuningPanel.ts`) | Done |
| 6g | **Drift turning from Tane's first drive**: circles by size at any speed, 15 degrees; a keyboard corner driver on real seeds (`testing/cornerDriver.ts`, `car/corners.test.ts`) | Done |

### 6a: the drift rules

- **`stepDrift(state, asked, car, steps)`** gives the drift state one step on from what is asked (the button, the stick, the brake, the speed along the line of travel, the wheels down, what the body hit). In this order: a running boost and the hop count down a step; the drift starts, picks its side, charges or is let go; anything that cancels it does; then the nose swings in (while sliding) or back out. `slide` moves by a fifteenth (in) or a twelfth (out) a step and is snapped to exactly 0 or 1 within 1e-9, so a swing takes exactly its steps.
- **Times become whole steps once** (`driftSteps`): hop 9, swing 15, recover 12, tiers at 60, 120 and 180 steps, boosts of 30, 60 and 96. The step a slide starts on is its first step of charge, so tier 1 comes on the 60th step of sliding.
- **The boost on the release step**: the step the button comes up sets `boostLeft` to the tier's steps, so the top speed is raised on that step and the 29 (59, 95) after it: 30, 60 and 96 steps in all.
- **Config:** `car.drift` and `car.boost` as planned (`DriftConfig`, `BoostConfig`), `car.engine.shed: 9`. Nothing reads them in the car until 6b.
- **Claude's calls, for Tane to judge:**
  - *"The stick at 0.3" is read from the input record*: `steer / 127 >= 0.3`, so a stick of exactly 0.3 (38 of 127 steps, 0.299) does not start a slide and 39 does. A keyboard always gives full stick.
  - *Cancelling during the hop* ends the drift; the hop is still drawn to its end.
  - *A new slide to the other side waits until the nose has swung back* from the last one (at most 12 steps); to the same side it picks up from where the nose is.

`drift.test.ts` (25 tests: each rule on its exact step, plus no start with one wheel down, no cancel in the air, a boost counting down in the air and not ended by the brake) failed on its missing module first. 2,084 unit tests pass.

### 6b: drift and boost in the car

- **The car's step** (`car.ts`) is "The car's step, line by line" of `docs/plan/M3-driving.md`. The line of travel is the nose turned out of the corner by the slide's angle, worked out from the drift state as the last step left it. The tyres take off speed across that line (up to `drift.grip`, 60 m/s², while the nose is swung in at all), the engine and brake act along it, and the turn asked for is the path's (`pathTurn`) plus the nose swinging in or out, held with `drift.turnGrip` (240 rad/s²) until the nose is back. With no slide the sums are exactly step 4's: the line of travel is then `along` itself, not `along` turned by an angle of 0, since `dcos(0)` need not be exactly 1.
- **In the air** the drift carries on (rule 7); its speed along the line of travel is read with the car's own up in place of the ground's.
- **`speedChange`** (`drive.ts`) takes the step's top speed and whether a boost runs. Above top speed it sheds `engine.shed` (9 m/s²), or brakes if that is harder, whatever the pedals, and no further than to top speed (rule 9). While boosting the throttle counts as right down and the push is `boost.accel` (30 m/s²) with no easing. Below top speed nothing changed.
- **What the car remembers** is now its drift state: `Car.save()` and `load()` (`CarMemory`); `SimSnapshot` gains `car` and `touch` (what the body touched, which 6c fills); `hash()` adds the drift state's eight numbers and the touch.
- **`CarState.drift`** (`DriftView`) for drawing: phase, side, tier, slide angle, hop (1 down to 0), boost left in seconds and its tier.
- `sideGrip` and `turnGrip` (`grip.ts`) take their limit as an optional last argument.

Measured on the flat at top speed (throwaway code, deleted):

| What | Asked | Measured |
| --- | --- | --- |
| Slide circles, stick into the corner, middle, away | 20, 34.3, 120 m | 19.66, 34.08, 119.94 m |
| Speed in the slide, same order | 97% of 30 or more | 29.49, 29.82, 29.99 m/s |
| The nose inside the line of travel, stick in the middle | 24 degrees within 1 | within 1 (test); with the stick fully in, about 25.5, since the path then turns 1.5 degrees in a step |
| The path turning away from the corner as a slide starts | under 1 degree | 0 |
| After a 2.1 s slide (stick in the middle) and release | over 30 next step; 39 within 0.4 s; held to the end; under 30.1 within 1.2 s after | 30.33 m/s on the next step; 39 after 19 steps (0.32 s); held to the 60th step; 30.0 after 60 steps more (1.0 s) |
| Steps with the top speed raised, tiers 1 to 3 | 30, 60, 96 | 30, 60, 96 (test) |

**One test tolerance set by measurement:** "never over 39 m/s" is checked to 1e-5 m/s. The physics engine rounds the speed held at 39 by a few millionths either way (measured 38.9999853 to 39.0000027 m/s), so the first tolerance tried, 1e-6, failed on rounding, not on any overshoot.

**The 4c test of speed above top speed changed with rule 9**, as the plan says: "holds the car back above top speed, as gently as it eased off…" became "slows by `engine.shed` above top speed, whatever the pedals, and no further than to top speed", and a test that half throttle at 20 m/s still eases off gently was added. Four tests of the boost in `speedChange` were added.

Tests seen failing first: `drifting.test.ts` (20 tests: the car did not drift) and `drive.test.ts` (the old signature). 2,109 unit tests pass.

### 6c: hits cancel a drift

- **`CarPhysics.touching()`** (`carBody.ts`) names the solid thing the body is against after a step, from Rapier's contact pairs (`contactPairsWith`, then `contactPair`, a manifold with `numContacts()` above 0): `{ thing: 'wall' | 'gate' | 'tree' | 'rock', normal }`, or null. The ground, road and kerbs never count. Against several at once, the first of wall, gate, tree, rock is named. The normal is one long and points out of the thing towards the car (tested on a wall: -x within 0.01), ready for 7b's wall bounce.
- **`sim.step`** reads it straight after the physics step and keeps the thing (in `hash()` and the snapshot since 6b), and the car's next step gives it to `stepDrift`, which cancels a slide or hop on any hit (rule 7). Only the thing is kept for now; 7b keeps the normal too.
- **Plain test courses** (`PlainCourse`) can now have `walls` (upright boxes), `posts` (hit as trees) and `balls` (hit as rocks), added in the same fixed order as an island's. New **`wallGround()`** in `testGrounds.ts`: the flat ground with a wall 0.8 m high along its right-hand side, 30 m from the start.

Tests: `touching()` names nothing on the start line or while the body rests on the road; on seed 7 it names a wall piece, a gate post, a tree and the biggest rock the body is placed in, and the same after a restore; on `wallGround` it gives the wall's normal. On the car: a slide that meets the wall at 19 degrees (started 10 m from it, facing 3 degrees towards it, with the first tier charged) ends at the wall with no boost, then or when the button is let go; a slide off `stepGround`'s 1 m drop flies (all four wheels off the ground), lands and carries on. The new `touching()` and `wallGround` tests failed on their missing code first; the drop test passed from the start, since nothing on the ground ever cancelled a slide. 2,116 unit tests pass.

### 6d: sparks, flame and hop

- **The sums** are plain numbers in `src/render/driftEffects.ts`, drawn from the simulation's state and step count only, so `still=1` repeats (a browser test takes the same slide and boost twice and compares the pictures byte for byte):
  - `sparkTriangles`: while sliding from tier 1, each rear wheel throws 2 sparks a step, each living 15 steps (30 a wheel at once), out, up and back from where the tyre meets the road, at most 0.45 m, each a flat triangle 9 cm across that shrinks as it flies. Which way each flies comes from a small integer hash of its birth step and number. In the tier's colour (`SPARK` in `palette.ts`: the visual bar's blue, orange and purple).
  - `flameLength`: 0.6, 0.9 or 1.2 m for the boost's tier, flickering by a sixth of that either way from step to step; never longer than the car.
  - `hopLift`: an arc 8 cm high over the hop's 9 steps.
- **`kartPose`** now gives the sparks and the flame's length, and lifts the whole kart along its roof by the hop. **`carView`** draws the sparks as one mesh of loose triangles and the flame as two 8-sided cones pointing back from the engine block, all with `MeshBasicMaterial` (unlit, so bright by colour alone), casting no shadow.
- **The flame's shape (Claude's call, for Tane to judge):** a cone wholly inside another can never be seen, so the pale core runs the whole length and is 0.55 of the width, and the orange cone round it is 0.7 of the length: from behind, the pale tip shows past the orange (`render.car.flame.outer`).
- **Sizes and colours:** `render.car.sparks: { perStep: 2, life: 0.25, reach: 0.45, size: 0.09 }`, `render.car.flame: { lengths: [0.6, 0.9, 1.2], radius: 0.13, core: 0.55, outer: 0.7, flicker: 1/6 }`; `SPARK` and `FLAME` in `palette.ts`. The first pictures had 5 cm sparks thrown mostly backwards, which the rear tyres hid from the chase camera; they now fly more out and up, and are 9 cm.
- **The readout** gains a line: a dot in the colour of the tier the slide has charged (or of the boost running), and "boost 1.4 s" while a boost runs (`driftReadout` in `app/drive.ts`). The body's `data-drive-tier` gives the tier.
- **Browser helper** `e2e/drifting.ts`: `slideTo(page, tier)` brings the car into a slide that has charged a tier, and `letGo(page)` releases it. One held input runs a 3 s slide off the road, and on some islands into a wall or a tree; so it tries run-ups of 120 and 240 steps, the stick in the middle or away, and both sides, from the start line each time, until one reaches the tier (measured on eight seeds first: no single choice worked on all of them).
- **New screenshots** in the loop: `world-<seed>-drive-slide.png` (tier 3) and `-drive-boost.png`; `TIERS="1,2"` adds `-drive-slide-1.png` and `-2.png`. That test has 3 minutes, since a slide can take several tries, each drawing frames in software (seed 1 needs seven).

Pictures looked at: tiers 1, 2 and 3 and the boost on seeds 1, 7 (07:27, a low sun), 42 and 2024. The sparks are small and in the tier's colour beside both rear wheels, the flame is an orange cone with a pale tip shorter than the car, nothing glows or is outlined, the car casts no shadow, and nothing covers the road ahead. Not 6d's, seen on the way (known issues): on seed 1 the slide ran onto a steep hillside and the chase camera's view is cut by the slope beside it; in long meadow grass (seed 7) the flower dabs look large and busy from the low chase camera; the readout says "in the air" when the car flies off the road's edge at speed (seed 2024), which is true. `drive-slide.jpg` and `drive-boost.jpg` join `docs/visual-bar/` once Tane has seen them (check-in 2).

Tests seen failing first: `driftEffects.test.ts` (missing module), the new `kartPose` and `carView` tests, `driftReadout`. One `carView` test changed with the behaviour: "takes the shadows" now checks the five lit meshes, since the sparks and flame are unlit. 2,134 unit tests pass.

### 6e: camera swing and wider view

- **`chase.ts`**: `ChaseCar` gains the drift (`phase`, `dir`, `boostLeft`) and `ChaseView` gains `swing` and `fieldOfView`. While the car slides, the eye swings round it by `swing` (0.12 rad, about 7 degrees) to the outside of the corner: to the car's left in a slide to the right. It still looks ahead along the line of travel, so it sees across the corner. While a boost runs, the view widens to `boostFieldOfView` (70 degrees). Each eases with `exp(-frame / time)`, two thirds of the way in its time (`swingTime` 0.3 s; `boostIn` 0.25 s, `boostOut` 0.5 s), so a camera at 30, 60 or 144 frames a second agrees to 1e-9 (test). A camera started on a car already sliding or boosting (a new simulation, or after `drive.run`) starts swung and widened.
- **The page** sets the camera's field of view from the chase view each frame (the view changes its projection only when the angle changes); the body's `data-drive-field-of-view` gives it.
- **Settings:** `camera.chase.swing: 0.12, swingTime: 0.3, boostFieldOfView: 70, boostIn: 0.25, boostOut: 0.5`.

Pictures looked at again (`-drive-slide` and `-drive-boost` on seeds 1, 7, 42 and 2024): the sliding car is seen a little from the outside of its corner, and with a boost the view is wider and the car smaller, its flame clear of the road ahead.

`chase.test.ts` gained 8 tests (no change without a drift, the swing's side and size, its easing in and back, the boost's view in and out, the same at three frame rates, starting swung, clearance while swung); 7 failed on the missing code first. One was then given a looser decimal place, because three seconds is ten easing times and leaves the swing e^-10 short of its target: the precision was the test's mistake, not a number of the plan. 2,142 unit tests pass.

### 6f: the tuning panel

- **T** (while the page is open, in any view) shows and hides a card down the right-hand side with a slider for every number of `car.engine`, `car.steer`, `car.grip`, `car.drift`, `car.boost` and `camera.chase` (44 in all, each tier and each boost its own), grouped under the block's name, each with its value beside it. **"Copy for config.ts"** puts the blocks, as text to paste over the same lines of `src/config.ts`, on the clipboard and in a box under the button (the clipboard can be refused; the box always has the text).
- **The page works on its own copy of the config** (`tunedCopy`): the simulation, R, new islands, the chase camera and the car's drawing use it. The shared `config`, and every fingerprint made from it, never change (a browser test checks `simHashFor(7)` before and after). Tuned values last until the page is reloaded (Claude's call).
- **A car setting** builds the simulation again with the tuned values, carrying on from where the car is (`rebuildSim`: a snapshot of the old restored into the new), at most once a frame and before any `drive.run`; `driving.replaceSim` keeps the camera easing from where it was. It takes 30 ms on seed 7 and 43 ms on seed 8, the most wooded (median of 6, Node). **A camera setting** needs no rebuild: the chase camera reads its settings each frame. The body's `data-tuning-builds` counts rebuilds and `data-tuning-ms` gives the last one's time.
- **Sliders** run from 0 to three times the starting value, in steps of about a hundredth of the value's size (0.1 for 30, 0.001 for 0.4), which the starting value lies on (Claude's call). A slider gives the focus back when let go, so W, A, S and D drive at once; while it has the focus, its arrow keys move it.
- **The driving hint** now names the drift (Space or Shift held while steering) and T.

Tests: `tuning.test.ts` (7: the fields cover exactly the six blocks, the ranges and steps, the copy changes and the shared config does not, a path not on the panel is refused, which changes rebuild, the text reads back as the same values, a rebuild carries on with the new settings) failed on the missing module first; `replaceSim` in `driving.test.ts` failed on the missing function; two browser tests (the top-speed slider at 20 gives 19 to 20.05 m/s after 240 steps where 30 gives about 27, the copied text, the fingerprint untouched, the focus given back; a camera setting does not rebuild and a car setting rebuilds once) failed on the missing panel. Found on the way: the first browser test drove 600 steps, and on seed 42 ten seconds of full throttle reaches the end of the start straight and hits something whatever the top speed, so it now drives 240. The panel was looked at in a picture; its copy button was then given the page's button style. 2,150 unit tests pass.

**Step 6 is done.** What it gives Tane at check-in 2: hold Space or Shift with A or D at 43 km/h or more, let go after 1, 2 or 3 s for a boost of 0.5, 1.0 or 1.6 s; T to tune.

### 6g: the drift's turning, from Tane's first drive (2026-11-17)

**What Tane found:** "the angle at which it drifts is too much ... I can't even hold space/shift for a second, otherwise my car will turn into the barrier". The player should be able to drift through most of a corner, starting just after the road starts to curve and letting go about when it straightens.

**Why:** a keyboard key is always full stick, so holding D through a right-hand slide asked for the tightest slide: 1.5 rad/s, a 20 m circle at top speed, and tighter as the car slowed (13 m at 20 m/s), because the slide turned at a rate. The corners of seeds 1 to 40, by their tightest point, have median radii of 26 m (hairpins), 34 m (plain corners) and 101 m (sweepers): 9 in 10 are wider than 20 m.

**What changed (Tane's choices, from options with the numbers):**
- **A slide follows a circle of a set size at any speed** (`car.drift.radius`, `pathCurve` in `drift.ts`; was `drift.turn` and `pathTurn`): 22 m with the key into the corner, 45 m with no key, 160 m with the other key, and evenly between in how much it curves for a stick part way. The car turns at its speed along the line of travel times that curve. Tane first chose 30, 50 and 110 m; the corner driver below held slides through only 78% of corners with them (hairpins 58%, since a 30 m circle cannot follow a 23 m hairpin), and Tane then chose 22, 45 and 160 m.
- **The nose points 15 degrees into the corner** (`car.drift.angle` 0.2618, was 0.42, 24 degrees).

**The proof** (`src/testing/cornerDriver.ts`, `src/sim/car/corners.test.ts`, Claude's design, for Tane to judge): every corner of seeds 1 to 20 but the kinks (225 corners). The car is put on the middle of the road 100 m before the corner and driven there at full throttle on grip (the line driver). 4 m into the corner it presses drift with the key into the corner; each step it picks whichever of the three keys' circles is nearest the circle through a point 12 m ahead on the middle of the road, **keeping each key at least 0.15 s** (a person, not a machine); it lets go 4 m before the corner's end. A corner counts when the slide lasts all that way with the car's middle at least half the car's width inside the road's edge.

| Circles (key, none, other key) | All | Plain corners | Hairpins | Chicanes | Sweepers |
| --- | --- | --- | --- | --- | --- |
| 30, 50, 110 m | 78% | 83% | 58% | 98% | 48% |
| 25, 45, 160 m | 93% | 98% | 87% | 100% | 67% |
| **22, 45, 160 m (chosen)** | **95%** | **100%** | **100%** | **98%** | **63%** |

The sweepers that fail are wider than the widest slide follows well; they are taken flat out on grip (60 m at top speed) without a slide. Entry speeds were 28.5 to 29.9 m/s. The test asks for 90% of all corners, of hairpins, of plain corners and of chicanes; it takes about a minute.

**Tests changed with the behaviour, as Tane asked:** `pathCurve` (circles of 160, 45 and 22 m, evenly between) replaced the `pathTurn` test (0.25, 0.875, 1.5 rad/s); the slide circles on the flat are now 22, 45 and 160 m within 5% (were 20, 34 and 120 m), and a new test finds the same circles at 20 m/s; the nose 15 degrees within 1. Seen failing first: the new `drift.test.ts` and `drifting.test.ts` tests on the missing code; the corner test's measure failed at 78% with the first circles. Every other drift test (the boost, the wall at about 20 degrees, the 1 m drop, snapshots) passes unchanged. The drift pictures of seeds 7 and 42 looked at again: the kart now points only a little into the turn. Found on the way: the tuning panel's slider step for the new angle (0.001) did not hold 0.2618, so a slider's step is now also fine enough for its value's own decimals (the panel test caught it). 2,153 unit tests pass.

### Tane's second drive (2026-11-17, after 6g): the drift needs reworking

Tane drove 6g and found:

- "Something's still wrong with the drift."
- **The boost after a drift accelerates the car too much** after the button is let go, and sends it flying: several times into a crash or over the edge or a wall.
- **The drift and boost graphics can be greatly improved.**

Tane's four changes, to be planned as one step (6h) in a new session:

1. **Tone down the boost** after a drift (today 1.3 times top speed, 39 m/s, reached at 30 m/s2, for 0.5, 1.0 or 1.6 s).
2. **Make the track much wider**, as in kart racers like Mario Kart, whose tracks are much wider, so a drift has room and does not end in a wall. The road (today about 12 m, `road.width`) and possibly the island must change with it: walls, verges, earthworks, the fit to the ground, sections that run close together, and the Milestone 2 checks on seeds 1 to 20 and the 20 fresh seeds.
3. **Lower the drift's turning further**, so a slide does not hit the inner wall. With the wider road, completing a drift should be easier.
4. **Make the sparks and the boost look more realistic.** Tane offered to install something or download better sprites if that helps. The visual bar today forbids image files and glow; a change to that is Tane's call, made in the plan.

Tane: "the best way to think about building this is to look at how Mario Kart does it". Take its design lessons (wide roads, gentle drift arcs, short mild boosts, readable spark tiers); do not recreate its look, tracks or art.

Starting points for the plan: the keyboard corner driver (`src/testing/cornerDriver.ts`, `src/sim/car/corners.test.ts`) measures how many corners a slide can be held through, and can be run against wider roads and other circles; the tuning panel (T) changes the drift and boost live; `docs/plan/M3-driving.md` "Step 6" has the rules.

## Step 6h: the drift rework (2026-11-17)

Planned in plan mode and approved by Tane on 2026-11-17 (plan file: `C:\Users\tanee\.claude\plans\random-racing-branch-milestone-3-driving-shiny-hamster.md`; the parts in `docs/plan/M3-driving.md`, "Step 6h").

**Tane's choices:**
- a road 20 m wide at the corners (was 12);
- a short, mild boost: 1.15 times top speed at 12 m/s², the times unchanged;
- steering that keeps its top-speed circle (60 m) above top speed;
- sparks and boost with CC0 sprites (Kenney's Particle Pack) and bloom on the effects only;
- gentler slide circles: the gentlest that pass the bars.

**Found while planning:** steering is held to 15 m/s² sideways, so at the old boost speed (39 m/s) full stick turned only a 101 m circle, and a boosted car could not follow the road out of a hairpin.

| Part | What | Status |
| --- | --- | --- |
| 6h-1 | **Measure, then fix the numbers.** The corner driver's holder style and drive out of the corner; the grid of widths, circles and boosts | Done |
| 6h-2 | **The track at 20 m**: the layout's distances and smallest corners given against the road's width (`LayoutSettings`, `TrackRules`) | Done |
| 6h-3 | **The road and the island at 20 m**; the reference pictures taken again | Done |
| 6h-4 | **Drift and boost**: circles of 28, 57 and 203 m, the boost of 1.15 at 12 m/s², the steering cap | Done |
| 6h-5 | **The look**: sprites and bloom | Done |

### 6h-1: the measurements

**The corner driver** (`src/testing/cornerDriver.ts`, test code) gains:
- a second style, `holder`, which keeps the key into the corner from the drift button to letting go;
- `driveOut`: after letting go, 100 m more on the line driver with whatever boost the slide earned, **braking for what is coming within 80 m**, as step 9a's bot will (the speed 90% of the steering grip holds there, braking at 0.7 of the brake's strength);
- lanes to follow: `roadLane` on an island, `straightLane` on a test ground;
- new fields on `CornerRun`: `keyChanges`, `exitTier`, `exitClean`, `exitHit` and `exitTravelled`.

**Elsewhere:**
- **`CarState.touch`** gives what the body touched on the last physics step.
- **The line driver's full-stick circle** now comes from `turnWanted`, so it will follow the steering cap once 6h-4 adds it. It gives the same stick today.

**The grid** (throwaway code, seeds 1 to 20):
- Every run used Tane's boost and the steering cap, with the layout's distances scaled with the width as 6h-2 will set them.
- Each figure is the share of corners where the slide was held from 4 m in to 4 m before the end, on the road. The car arrived at 201 to 218 of 208 to 225 corners.
- "Careful" changes key as often as every 0.15 s; "holder" never changes key.
- Every width built every seed with no fallback.

| Road | Tight circle (no key, other key) | Careful: all | Hairpins | Plain | Chicanes | Sweepers | Holder: hairpins and plain |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 m | 22 (45, 160), today | 95% | 100% | 100% | 98% | 63% | 25% |
| 12 m | 30 (61, 218) | 86% | 55% | 88% | 100% | 89% | 30% |
| 16 m | 30 (61, 218) | 96% | 96% | 97% | 100% | 86% | 48% |
| 20 m | 22 (45, 160) | 94% | 100% | 98% | 95% | 75% | 40% |
| 20 m | 26 (53, 189) | 98% | 100% | 99% | 97% | 91% | 42% |
| **20 m** | **30 (61, 218), chosen** | **97%** | **100%** | **97%** | **95%** | **97%** | **45%** |
| 20 m | 34 (70, 247) | 97% | 100% | 96% | 95% | 97% | 54% |

**The drive out of the corner**, on the 20 m road with the careful driver. "Made unclean by the boost" counts exits that were clean with no boost but touched something, or left the road, with it.

| Tight circle | Slides held | Clean, no boost | Clean, old boost (1.3 at 30, no cap) | Clean, Tane's boost (1.15 at 12) with the cap | Made unclean by the old boost | By Tane's |
| --- | --- | --- | --- | --- | --- | --- |
| 22 | 189 | 184 | 183 | 185 | 2 | 0 |
| **30** | **195** | **187** | **180** | **188 (96%)** | **8** | **0** |
| 34 | 194 | 163 | 156 | 164 (85%) | 8 | 0 |

- **On the 12 m road** with today's circles, the old boost made 2 of 206 exits unclean and Tane's boost none.
- **On grip alone**, the same driver goes from 100 m before each corner to 100 m after it cleanly through 204 of 208 corners on the 20 m road (217 of 225 on 12 m).
- **At 34 m the slide does not turn enough**: the car comes out wide and the clean exits fall to 85%.

**How often a driver changes key** (20 m road, circles of 30, 61 and 218 m; the median changes a second while sliding):

| Keeps each key at least | Changes a second | Hairpins | Plain | Chicanes | Sweepers | Clean exits |
| --- | --- | --- | --- | --- | --- | --- |
| 0.15 s | 2.5 | 100% | 97% | 95% | 97% | 96% |
| 0.3 s | 1.6 | 100% | 95% | 92% | 69% | 95% |
| 0.5 s | 1.0 | 90% | 96% | 90% | 22% | 95% |

**What was chosen:**
- **Circles of 30, 61 and 218 m** (the key into the corner, no key, the other key), by the rule in the plan: the gentlest that meet 6h-4's bars on the 20 m road.
- **The holder bar changed (Tane, 2026-11-17).** The plan asked for a holder through 80% of hairpins and plain corners, and no circles can give it: the best is 54%, at 34 m. Holding one key asks for one circle, but corners run from 22 m to 100 m, so every corner wider than the circle is cut on the inside. That is what Tane met on the second drive. From three options, Tane chose to ask instead for **a driver who keeps each key at least 0.5 s (about one change a second) to get through 90% of hairpins, plain corners and chicanes**. The holder's rate is reported, not tested.

**Tests:** `cornerDriver.test.ts` has 5:
- a drive out along a clear lane is clean;
- one along a lane through the wall names the wall;
- one that strays off its lane is not clean;
- the speed a road lane allows is 90% of the grip at the lap's tightest point, and no more than braking allows 40 m before it;
- the holder changes no key.

The first three and the holder test failed first, on the missing functions and `keyChanges`. The road-lane limit test was written after its code, so it was not seen failing. 2,158 unit tests pass.

### 6h-2: the track rules against the road's width

**What changed:**
- **The config keeps the layout's road-dependent settings against the road's width** (`LayoutSettings` in `src/config.ts`, Claude's call, so a change of width carries through):
  - `layout.clearanceWidths` (40/12, 40 m on a 12 m road);
  - `base.stretchedHalfWidth.leastWidths` (2) and `most` (110 m);
  - `fold.hairpinWidths` (44/12 to 66/12);
  - `jog.offsetWidths` (13/12 to 22/12).
- **The smallest corners are given as the room inside them**, from the corner's centre to the road's inside edge:
  - `track.minInsideRadius` 9 (was `minCornerRadius` 15; the brief's 15 m radius on a 12 m road);
  - `layout.minInsideRadius` 12 (was 18);
  - `radius.hairpinInside` [12, 26] and `tipInside` [12, 24] (were radii of [18, 32] and [18, 30]).
- **`trackRulesFor` works them out in metres** for the road's width (`TrackRules`), and everything that builds and judges layouts reads those. The analysis and the score take `TrackCommon`, the rules that need no working out.
- **The lab's `?minRadius=` what-if** still takes a corner radius.

**Proof that nothing moved at 12 m:** the track fingerprints of seeds 1 to 60 are identical before and after (throwaway check). The conversion is exact: 40/12 times 12 is 40 in floating point, and so for each value.

**The track at 20 m** (throwaway, seeds 1 to 200, track only):

| | 12 m (today) | 20 m, settings as they are | **20 m, hairpin folds of 3 to 4.5 widths** |
| --- | --- | --- | --- |
| Seeds with no valid layout (fallback) | 0 | 0 | 0 |
| Valid candidates, middle seed (fewest) | 30 of 30 (1) | 30 of 30 (2) | 30 of 30 (2) |
| Seeds with a hairpin, chicane, sweeper | 100%, 96%, 98% | 90%, 92%, 98% | 99%, 93%, 99% |
| A lap: hairpins, chicanes, sweepers, plain corners | 1.61, 2.21, 1.43, 5.97 | 1.14, 2.08, 1.47, 6.33 | 1.32, 2.16, 1.42, 6.40 |
| Lap length, middle (range) | 2,046 m (1,526 to 2,964) | 2,030 m (1,494 to 2,841) | 2,054 m (1,467 to 2,842) |
| Time to build a track, middle (slowest) | 56 ms (266) | 52 ms (293) | 42 ms (140) |
| Tightest corner, middle (least) | 18.1 m (18.0) | 22.0 m (21.9) | 22.0 m (21.9) |

**Why fewer hairpins at first:** scaled with the road, a narrow fold is 73 to 110 m across, and its end turns on a radius of 37 to 55 m. The analysis calls a turn wider than 45 m a plain corner (`analysis.hairpinMaxRadius`). The 2.5-width gap only needs the fold to be about 57 m across (50 m after the layout is shrunk by up to 0.88). So **6h-3 sets `fold.hairpinWidths` to [3, 4.5]** (60 to 90 m on a 20 m road) with the width, which brings hairpins back on 99% of seeds. Claude's call, for Tane to judge.

**Tests:**
- `config.test.ts`: the skeleton keeps further apart than the section gap at any width; there is room inside the tightest corner for the apron, kerb, verge and 1.5 m more.
- `rules.test.ts`: the metres worked out at 12, 16, 20 and 24 m; exactly the old metres at 12 m.
- `validate.test.ts`: the corner and section-gap tests rewritten from the rules' limits and run on 12 and 20 m roads (for example "rejects separate sections 10 m closer than 2.5 widths", which was "20 m apart"). They keep their meaning.
- `pipeline.test.ts`, "on a 20 m road": seeds 1 to 20 with no fallback, every winning corner 19 m or wider, and at least 25 of 30 candidates valid on the middle seed.
- Tests that handed `config.track` to the builder now hand it `trackRulesFor(config.track, 'flat')`.

**Seen failing first:**
- the new config relations, `rules.test.ts`'s width test, and the 9 m inside test, on the missing settings;
- the 20 m corner test, which old code fails with 18 m hairpins.

The other 20 m pipeline tests and the validate tests at 20 m passed on the old code. They guard what must stay true, not a new behaviour. 2,175 unit tests pass.

### 6h-3: the road and the island at 20 m

**What changed (Tane's choices in this part marked):**
- **`track.roadWidth: 20`** (was 12). The brief's step 7 says 20 m now, and its corner limit is given as the room inside a corner (9 m, a 19 m radius on the 20 m road).
- **Distances between sections are measured between the road edges** of the usual width, so they hold at any width. Each gives exactly its old value on a 12 m road:
  - `road.coupleGap` 43 (was `coupleDistance` 55 centre to centre);
  - `road.walls.closeGap` 68 (was `closeDistance` 80);
  - `road.width.clearanceGap` 58 (was `clearance` 70);
  - the island's look-out for bays and headlands, 74 m beyond the edge (was 80 m from the middle, hard-coded in `chooseFeatures`).
- **Widened straights** are `road.width.extraMin` 4 to `extraMax` 10 m wider than the usual width: 24 to 30 m.
- **The layout's narrow folds** are 2.9 to 4 road widths across (58 to 80 m). 6h-2 found 3 to 4.5; once a layout is enlarged by up to 1.14 to fit the lap, 4.5 could turn on more than a hairpin's 45 m, and the layout tests found only 69 of 120 folded layouts with a hairpin. **Stretched bases** are at least 1.5 widths across, half each side (30 m), down from 2: at 40 m stretched tracks came out too round.
- **The earthworks rule is held at the road's banked edges** (`roadEdges`, `cutAndFill` in `road/profile.ts`; `checkEarthworks` and `measureProfile` take them), except on mountain seeds (`byRelief.mountain.earthworksOnCentre`, C4's rock cuttings). Found on fresh seed 32534: banked at 8 degrees, a 20 m road's outer edge stands 1.4 m above its middle (0.84 m on a 12 m road), and the edge needed 6.2 m of fill where the middle needed 4.6, past the 6 m limit, which the rule only checked in the middle. It costs about 30 ms a track.
- **Walls beside steep ground from 45%** (`road.walls.maxSlope`, was 40%; **Tane's choice**). The earthworks blend banks at 40%, and on a 20 m road taller cuttings left mountain laps 18 to 48% open (seed 13: 18%). At 45% mountain laps are 33 to 65% open, about what they were at 12 m (41% on the middle seed).
- **Sea beside the road on islands that only touch it: 15 to 30% of the lap** (`hinterland.seaside.touches`, was 15 to 40%; **Tane's choice**). Seed 4's coast ran beside 54% of its outside, against the test's "less than half".
- **Mountain placement near-misses are listed like the gorges** (**Tane's choice**). On test islands asking for three ranges and three peaks on rolling ground (seed 5), a range comes 50 m from the road and a peak's land overlaps the road's by about 2 m, which a 5 m grid sees as sea. Checking a foot at 64 points instead of 32 removed every gorge but not these. Every config change tried (the join distance, a wider skirt of land) moved the near-miss to another test island.
- **The shadow budget is 210,000 triangles** (was 200,000; **Tane's choice**). Seed 20's forest view from the start line adds 204,974: trees cast shadows a whole 450 m square at a time, and on the 20 m road this view takes in one more. A smaller shadow reach made no difference (204,118 at 340 m).

**Fixtures that changed with the worlds** (none loosened):
- **Gorge seeds:** 39898 and 42 (seed 42 gained a range over its road, 31.9 m deep; built with no mountains it cuts 1.6 m). 28496 lost its gorge.
- **The camera's gorge test** drives through seed 42's gorge (was seed 28496's start).
- **The sloped start:** seed 5 (8.0%), as seed 42 was; seed 42's start is now nearly level.
- **The grass-sways test** looks at seed 1's start: seed 7's start now has the sea in the bottom of the picture.
- **The summit view** counts the road with the land as ground.
- **The pin of seeds 1 to 40's tracks** in `sky.test.ts` was taken again.

**The world at 20 m, seeds 1 to 20** (throwaway):

| Relief (seeds) | Roadside open: middle seed (least) | Deepest cut | Tallest fill | Steepest bank |
| --- | --- | --- | --- | --- |
| Flat (4) | 47% (40%) | 1.5 m | 1.5 m | 0.36 |
| Rolling (6) | 43% (39%) | 2.9 m | 3.1 m | 0.61 |
| Hilly (4) | 38% (28%) | 4.2 m | 4.0 m | 0.61 |
| Mountain (6) | 45% (39%) | 12.9 m (edges; the centre holds 8) | 8.5 m (edges) | 1.63 |

- **The sea** comes 10.0 m from the road at the nearest (the limit is 10).
- **Widened straights** reach 24 to 30 m.
- **A world builds** in a median 0.97 s in Node (slowest 1.23 s). The same code at 12 m takes the same time: 1.02 to 1.11 s against 1.01 to 1.05 s, track 73 to 76 ms against 81 to 84 ms. The laptop is slower today than when Milestone 2 measured 0.43 to 0.64 s. The 3 s budget tests in the browsers pass.

**Pictures looked at:**
- In the browser suite's screenshots: seeds 1, 7, 42, 100, 2024 and 48213 from the start, flying, close views and from above.
- **All 13 reference pictures taken again** (`docs/visual-bar/`, 1280 by 720, headless Chromium, by a one-off script) and looked at: the road reads clearly, kerbs and walls sit at its edges with no gaps, the gate spans it, and the car stands on it.
- **Seed 42's drift pictures could not be taken in 6h-3.** Its start straight now runs into a walled corner, and the browser helper's slide, held on one input from the start line, could not reach tier 3 there, so the screenshot test skipped them for seed 42 only. With 6h-4's gentler circles it reaches tier 3 again (after many tries), and the skip is gone. The "same picture twice" drift test uses seed 7, which gets there at once.

**Tests:**
- New and seen failing first:
  - sections tie, wall and report closeness by the gap between their edges (profile, walls, report);
  - the config's width and widening;
  - the earthworks at the banked edges, and by relief;
  - most of seeds 1 to 20 have a hairpin at the config's width (which passed first, as a guard).
- Rewritten to the config's width, each keeping its meaning: the fit stadium (2.5 widths and 10 m apart), the wider road (base + 8), `width.test.ts` (in extras over the base), the fillet strip (the narrowest fold), the walls' stadium.
- A test's own rounding changed: a sampled ring's edge is 3.00002 m from the middle, so it is checked to three places.

2,186 unit tests pass. In the browser suite:
- The first run at 20 m failed 9 tests in 5 kinds, each fixed above.
- The second run failed 3:
  - two drift tests ran out of time, the slide helper now trying 30 slides before the old ones (reordered);
  - seed 42's close view of a cutting did not load within 45 s.

  All three passed run again alone, with the other drift tests.

### 6h-4: drift and boost

**What changed:**
- **`car.boost: { speed: 1.15, accel: 12 }`** (Tane; was 1.3 and 30). 34.5 m/s while a boost runs, reached in about 0.4 s, and shed back to top speed at 9 m/s² in 0.5 s.
- **Steering keeps its top-speed circle above top speed** (`turnWanted` in `sim/car/steer.ts`, Tane). Faster than 30 m/s full stick turns the 60 m circle it turns at 30, not a wider one (101 m at the old 39 m/s, 79 m at 34.5). The sums below top speed are exactly as before. At 34.5 m/s the sideways force is 19.8 m/s², under the tyres' 22.
- **Slide circles of 28, 57 and 203 m** (`car.drift.radius`; were 22, 45 and 160). 6h-1 chose 30, 61 and 218 m on the provisional 20 m worlds. On the final ones (after 6h-3's folds and walls) the once-a-second driver got through 84.8% of chicanes (39 of 46), and every circle tried missed the 90% bar. **Tane chose 85% for that driver on chicanes**, from options, but I had rounded 84.8% to 85% when asking. Under the plan's rule (the gentlest circles that meet the bars), 30 m misses by one chicane, so the circles are 28, 57 and 203 m.

**The corners of seeds 1 to 20 on the final 20 m worlds** (219 corners, the car arriving at all but a few):

| Tight circle (middle, wide) | Driver | All | Hairpins | Plain | Chicanes | Sweepers | Clean exits with the boost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 26 (53, 189) | careful (0.15 s) | 96% | 100% | 98% | 96% | 88% | 98% |
| 26 (53, 189) | once a second (0.5 s) | 84% | 100% | 95% | 87% | 0% | 97% |
| **28 (57, 203)** | **careful** | **97%** | **100%** | **98%** | **96%** | **92%** | **97%** |
| **28 (57, 203)** | **once a second** | **84%** | **100%** | **96%** | **87%** | **4%** | **98%** |
| 30 (61, 218) | careful | 96% | 100% | 98% | 93% | 92% | 95% |
| 30 (61, 218) | once a second | 86% | 100% | 96% | 85% (84.8) | 21% | 95% |

The sweepers the slower driver misses are the widest, taken flat out on grip.

**Tests:**
- New:
  - `steer.test.ts`: full stick at 30.001, 34.5 and 45 m/s turns the 60 m circle; mirrored, and backwards.
  - `drifting.test.ts`: a boosted car on the flat steers round the top-speed circle, within 5%.
  - `corners.test.ts`: careful driver 95% of all corners and 90% of hairpins, plain corners and chicanes; 95% of held slides drive out 100 m clean with their boost; the once-a-second driver 90% of hairpins and plain corners, 85% of chicanes.

  Each was seen failing on the old car: the circle widened; 106 m boosted; 94.5% careful; 85% slower.
- Changed with the behaviour:
  - `pathCurve`'s circles;
  - the boost's reach and fade (from the config: reach in `(boost.speed - 1) * top / accel` + 0.1 s, back in `(boost.speed - 1) * top / shed` + 0.2 s; were the literals 0.4 and 1.2 s);
  - `drive.test.ts`'s literal 38 and 35 m/s (now inside the boost's range);
  - the steering force test (holds `sideForce` up to top speed; at boost top speed under `grip.side`);
  - the wall slide's start (15 m from the wall, 6 degrees towards it; was 10 m and 3 degrees), so the gentler wide circle still meets the wall at 15 to 25 degrees.
- The corner tests now build seeds 1 to 20 once for both drivers (about 4 minutes in all).
- In the browser: seed 42's drift pictures are taken again (the skip of 6h-3 removed), searched for once; the repeat-picture drift test (seed 7) has 3 minutes, as the screenshot test has, because the gentler slides take more tries from the start line.

2,189 unit tests pass. The browser suite's run failed only seed 42's drift pictures (out of time), and they and the drift tests passed run again after the fixes above.

### 6h-5: the look of the drift (2026-11-18)

**What changed** (Tane's choice: sprites and bloom; sizes and counts in `render.car`, the bloom in `render.bloom`):
- **Sprites.** Five PNGs from Kenney's Particle Pack (CC0) in `public/effects/`: a trace, a star, a circle, a muzzle flash and a smoke puff. `public/effects/LICENSE.md` gives the source, the licence and each file's SHA-256. Loaded by `render/effectTextures.ts`; no package added. Until they load, or if they fail, the effects are drawn as soft dots.
- **What is drawn** (`render/driftEffects.ts`, from the simulation's state and step only, so `still=1` repeats):
  - sparks from both rear wheels from tier 1: 15 a wheel at tier 1 up to 45 at tier 3, reaching 0.6 to 1.1 m and fanning wider each tier, white-hot (`SPARK_HOT`) as they leave the tyre and in the tier's colour from a third of their flight;
  - a burst of 14 stars in the tier's colour on letting go, for 0.2 s;
  - tyre smoke (`SMOKE`), lit by the world's light, never a glow;
  - twin flame jets in the boost's tier colour, with a pale core and a flare at the exhaust, never longer than the car;
  - drawn only: the body leans 4 degrees out of a slide, the front wheels are counter-steered 14 degrees, the hop squashes the body 6% as it lands (`kartPose`);
  - speed lines near the picture's edges while a boost runs (`render/speedLinesView.ts`), never over its middle.
- **One `ShaderMaterial` mesh per kind of sprite** (`render/carView.ts`); nothing casts a shadow, and the smoke takes the light.
- **The bloom** (`render/bloom.ts`): the effects alone are drawn into a half-float picture at half the screen's size, with the kart in depth only so it hides what is behind it, spread by Three.js's `UnrealBloomPass` (strength 0.7, radius 0.5), and the spread light alone is added on top of the finished picture. With no effect on screen it draws nothing, so the island is byte for byte the same with `bloom=0`. `data-effects` and `data-bloom` on `<body>` say what the page has.
- **`docs/VISUAL_BAR.md`** rewritten for sprites and bloom; `drive-slide.jpg` and `drive-boost.jpg` (seed 7, tier 3, and 10 steps after letting go) added to `docs/visual-bar/` as proposed references.

**Found on the way:**
- **The sprites first drew nothing.** The side vector mirrored each quad, so its triangles faced away and were culled as back faces. Fixed with the right-hand perpendicular and `DoubleSide`.
- **Effects drawn brighter than the screen can show clipped to white.** They are now drawn in their own colour on screen, and at full brightness (`sparks.glow` 2) only in the bloom's own picture.
- **The view's triangle and draw counts read 0 whenever the bloom or the speed lines drew** (the `fps=1` readout, and the perf table's "0k, 1 call"): Three.js resets its counts on every draw, and the bloom's overlay was the last draw. The counts are now reset once at the start of each frame (`renderer.info.autoReset` off). Test first: the bloom browser test now checks that the bloomed frame counts at least the plain frame's triangles; it failed at 2 against 357,932 and passes since.
- **Tuned by eye** on seeds 7 and 42: `sparks.glow` 2, `perStep` [1, 2, 3], `width` 0.03, smaller heads near the wheel, the flare 0.12 in 70% tier colour, the burst in 90% tier colour, bloom strength 0.7.
- My own new spark-colour test was changed before any commit, to "the tier's colour from a third of the flight".
- **Two browser tests were written after their code**, not seen failing first: "loads the effect pictures with no errors" and "draws the island exactly the same with the bloom on or off...". The triangle-count check added to the second was seen failing.
- **One Firefox failure that would not come back.** A full browser run failed "gives the same picture of a slide and of a boost twice" in Firefox once (Chromium passed); its error message was lost to the next run. It then passed 31 times in Firefox: alone, six times over, 12 and 10 times at six and eight workers, and in a full run, with a copy that also compared each picture with one taken two frames later (always the same). Fonts (system only), the clock (nothing drawn depends on it), automatic quality (there is none) and a frame not yet shown at the screenshot were ruled out. Cause unknown; nothing in the code was changed for it. The test now says which check failed (the slide reaching tier 3, the slide's picture or the boost's), and attaches all four pictures to the report if they differ.

**The bloom's cost** (`npm run perf` with `SEEDS=7`, `PARTS=0`; Intel Arc, Direct3D 11, 1920 by 1080, seed 7, `time=13:00`). The perf run gains a held tier 3 slide with the bloom and without it (`still=1` holds the car; the clock is set each frame so each frame is drawn):

| View | Median ms | 95th ms | Worst ms | Over 16.7 ms |
| --- | --- | --- | --- | --- |
| A tier 3 slide, bloom | 9.6 | 10.8 | 13.1 | 0% |
| The same slide, `bloom=0` | 7.4 | 8.0 | 9.4 | 0% |
| Flying the lap (no effects) | 6.0 | 7.3 | 8.3 | 0% |
| Circling | 7.2 | 7.7 | 8.7 | 0% |
| Summit | 7.8 | 8.4 | 9.0 | 0% |

**The bloom costs about 2.2 ms a frame at 1080p** (2.8 ms at the 95th), only while an effect shows. No frame went over 16.7 ms. At 2116 by 1322 (the laptop's screen, capped by the pixel budget) the views without effects took 9.6 to 13.1 ms. The slide row's triangle and call counts in that run were the bug above; the frame times are unaffected.

**Pictures looked at:** tiers 1, 2 and 3 and the boost on seeds 1, 7, 42, 100 and 2024 (`TIERS=1,2`), seed 7 at its own 07:27 low sun. The island, road and trees stay crisp in every one; each tier reads by its colour, matching the readout's dot; the smoke sits in the light; the speed lines keep to the top corners. Nothing fails the bar. For Tane: tier 3's purple reads lilac at the spray's white-hot heads; from the side (seeds 1 and 2024, the car in the air) the flame is a bright pale jet about half the car's length; and `slideTo`'s long slides end on grass or sand on most seeds, so most pictures show the sparks off the road.

2,200 unit tests pass and the type check is clean. The browser suite's final run passed 335 and failed 1: [chromium] "opens flying the lap, and keeps moving". The flying camera moved 4.2 m of the 5 m asked within 15 s, because the flight moves by at most 0.05 s a frame and a frame took about 3.5 s in software with three browsers busy. 6h-5 adds nothing to that view (no car, so no effect, bloom or speed lines). It passed 4 of 4 run again alone. The two 3-second budget tests, which run only after the rest pass, were run on their own afterwards and passed. In both full runs today the Firefox drift picture test and the bloom test passed in both browsers.

## Step 7: surfaces and bumps (2026-11-20)

Planned in plan mode and approved by Tane on 2026-11-20 (plan file: `C:\Users\tanee\.claude\plans\pasted-content-id-f7a1-random-racing-bubbly-journal.md`). The rules and tests are those of `docs/plan/M3-driving.md`, "Step 7".

| Part | What | Status |
| --- | --- | --- |
| 7a | **Off the road**: `car.surfaces`, `surfaceShare`, `CarReading.top` | Done |
| 7b | **Walls**: the whole touch kept; the wall's turn (aimed a little away) and push (`car.bump`); blunt wall ends | Done |
| 7c | **Trees and rocks**: rocks as upright posts, a hit's spin capped (Tane's choices) | Done |
| 7d | **Kerbs**: tests; softer springs (Tane's choice) | Done |

### 7a: off the road

- **`car.surfaces: { road: 1, kerb: 1, grass: 0.6, sand: 0.6, rock: 0.6, snow: 0.6 }`** (`SurfaceConfig`): each surface's share of top speed.
- **`surfaceShare(wheels, car)`** (`sim/car/surface.ts`) averages the shares over the wheels on the ground (1 with none down). The car's step multiplies its top speed by it, a boost's included, and rule 9 brings a faster car down to it at `engine.shed` (9 m/s²). On the road the share is exactly 1, so the sums are exactly as before and no fingerprint changes.
- **`CarReading.top`** (so `CarState.top`): the top speed for the wheels as they are now, for tests and the readout.
- **Reversing is not slowed** off the road (Claude's call, for Tane to judge): 8 m/s anywhere, so a car can always back out.
- New test ground **`grassGround()`**: road on the left for its whole length; on the right, road for 300 m, then grass.

Measured (tests, and throwaway code for the hillside):

| What | Asked | Measured |
| --- | --- | --- |
| Top speed on grass | 18 m/s within 1% | 18 (test) |
| From 30 m/s on the road onto grass | under 19 m/s within 1.5 s of all four wheels on it | passes: shedding 12 m/s at 9 m/s² takes 1.33 s, and starts as the front wheels arrive |
| Two wheels on the road, two on grass | 24 m/s | 24 (test) |
| A tier 3 boost on grass | 20.7 m/s (0.6 × 30 × 1.15; the plan's 23.4 was for the old 1.3 boost) | 20.7 (test) |
| On a beach on seed 7 | reads sand, top speed 18 | yes (test) |
| Up the 45% grass hillside from rest, full throttle | under 18 m/s (known issue) | 16.8 m/s, was 26.2 |

The corner tests (`corners.test.ts`) pass unchanged: their slides and drives out are judged on the road.

Tests seen failing first: `surfaceShare` (missing function), and the five `offroad.test.ts` tests (no `top`; 30 m/s kept on grass). One check of my own was corrected before the commit: the speed "from 30 m/s" is now read when the first wheel reaches the grass, since the front wheels start the slowdown before the rear ones arrive. 2,209 unit tests pass (the commit message says 2,210: that run also counted a throwaway measurement file); all 338 browser tests passed in one run (25.4 minutes), the budget tests included.

Pictures looked at (the browser suite's drive pictures, seeds 1, 7, 42, 100, 2024 and 48213): `slideTo`'s long slides that run onto grass now read 60 to 95 km/h with "grass" on the readout, where they read about 105 before; the road views (`-drive-start`, `-drive-5s`) are unchanged. Nothing drawn changed, and nothing fails the visual bar.

### 7b: walls

- **The whole touch is kept** (`sim.ts`): the thing and the contact's slope from `touching()`, in `hash()` and `SimSnapshot.touch`, given to the car's next step. `CarState.touch` still names only the thing.
- **`CarMemory.sinceWall`**: steps since the body last touched a wall or the gate, up to `bump.again` (30 steps); at that, the next touch is a new hit. In the fingerprint and the snapshot.
- **`car.bump: { turn: 3, away: 0.05, push: 1.5, again: 0.5 }`** (`BumpConfig`), the sums in `sim/car/bump.ts`. They act on walls and the gate (`bounces`), not on trees or rocks:
  - **The wall's turn** (`wallTurn`), added to the turn asked for while touching: `bump.turn × (into + away) × along`. `into` is how far the nose points into the wall (a sine); `along` is how far it points along it (a cosine, signed by which way); `away` is new.
  - **The push** (`wallPush`): on a new hit the car is brought to 1.5 m/s off the wall, flat on the map.
- **The sloping ends of walls are blunt** (`wallBox` in `physics/colliders.ts`, used by the island and the test grounds; `WallPiece.rise` in `gen/road/barriers.ts`). Each sloping piece's box is level at its higher end, so a car meets an upright face. The lowest piece (0.21 m) is under the body's 26 cm clearance and is passed over. Only colliders changed: no world fingerprint moved. Where the drawn end rises, the box stands up to 0.38 m above it for one 2 m piece.
- **Rapier averages the body's grip with the wall's** (Rapier's default friction 0.5, looked up in 0.21's code), so the body scrapes walls at 0.35, not 0.2.
- New test ground **`wallEndGround()`**: a straight road with one wall, built by the island's own `wallPieces` and `wallBox`; plain courses' walls may now be turned.

**Two changes to the plan's rule, Claude's calls, for Tane to judge:**
- **`away`.** With the plan's rule, a 30-degree hit ended with the car pressed flat along the wall, scraping it with its side for as long as the throttle was held. Rapier itself turns the car parallel within 0.3 s. The push lasts a few hundredths of a second, because the tyres take sideways speed off at 22 m/s². With `away`, the nose is turned on to point about 3 degrees off the wall, and the car leaves it.
- **The turn's size is continuous.** The plan's `turn × into`, signed by which way along the wall the nose points, gave the full 3 rad/s, with a sign that depends on rounding, to a car hitting dead head on. Times `along`, it fades to nothing there.

**The blunt end is the plan's own fallback.** The ramp did not quite launch the car (0.46 m gained of the 0.5 allowed), but it stopped it from 29 m/s in 5 steps, lifted it onto the wall's end with no wheel down, and tipped it to 0.76 roof-up.

Measured at top speed on `wallGround()`, stick centred, throttle held (throwaway code; speeds on the map):

| Hit | Rapier alone | With the rules |
| --- | --- | --- |
| 10 degrees | touches 1 step; 29.5 m/s a second later | the same |
| 30 degrees | parallel in 0.3 s; 26.1 m/s a second later; still scraping the wall 1.5 s on | leaves the wall after 37 steps, pointing 1.2 degrees off it; 26.2 m/s a second later (87%) |
| 60 degrees | **spins round to face backwards (145 degrees)**, under 5 m/s a second later | the same (with the body's grip 0, the same too) |
| Head on, then nothing pressed | rolls back at 0.77 m/s | rolls back at 1.45 m/s; reverses 10.3 m in 2 s on the brake |
| The sloping end, head on | ramp: 0.46 m up, tipped to 0.76 roof-up, no wheel down | blunt: stops level, roof-up 1.00, four wheels down |

Tests (`bump.test.ts`, `walls.test.ts`), seen failing first: the missing module; the head-on roll-back (0.77 m/s with Rapier alone); the 30-degree hit still touching a second later (with the plan's rule as written); the wall end tipped to 0.76; the slope and `sinceWall` missing from the fingerprint. **Changed with the behaviour:** `worldColliders.test.ts`'s wall height test now expects each sloping piece level at its higher end (seen failing on the old colliders, 0.10 m out). Corrected in my own new tests before the commit: the speed going into the wall is read on the step before the hit, since Rapier has already slowed the car on the step of it; and `wallTurn`'s tests were rewritten for `away` and `along` (the plan's form failed them dead head on).2,224 unit tests pass; all 338 browser tests passed in one run (24.2 minutes); the drive pictures of seeds 1, 7, 42, 100, 2024 and 48213 are byte for byte those of 7a (none of those runs touches a wall).

### 7c: trees and rocks

The plan expected no new rule here. The tests found two problems that config could not fix, and **Tane chose both changes on 2026-11-20**, from options with the numbers:

- **Rocks the body can reach are upright posts** (`rockPost` in `physics/colliders.ts`; `sim.colliders.rockClear: 0.2`, `rockPostHeight: 1`). A rock no higher than 0.2 m (6 cm under the body's ride height) has no collider: the body passes over it. A taller rock is an upright post as wide as the drawn rock at the ground, at least 1 m tall (over the body's top at 0.86 m), reaching 1 m into the ground (`trunkRoot`). `WorldColliders.rocks` keeps one entry a rock, `NO_COLLIDER` for the low ones. Plain courses' `balls` became `rocks`, built by the same `rockPost`. **Why:** as domes (3b's shape), rocks met at top speed threw the car up: 0.66 m for a 0.3 m rock, 4.5 m for 0.45 m, 5 m for 0.6 m, 2.5 m for 0.8 m and 1.9 m for 1.2 m, down to 0.55 roof-up. Seeds 1 to 20 have 154 rocks within 25 m of the road, 79 of them 0.26 to 0.8 m high. The post can stand up to 0.7 m above a low drawn rock.
- **A hit's spin is capped** (`Car.settle`, called by `sim.step` straight after the physics step; `car.bump.spin: 6`). After a step in which the body touched a wall, the gate, a tree or a rock, its whole turning (about its up, with its roll and pitch in proportion) is held to 6 rad/s. **Why:** a trunk clipped 0.5 m off centre at top speed spun the car at 7.8 rad/s, and 0.75 m off at 9.8 with the car carrying on at 22 m/s; less body grip (0.1, 0) and more bounce (0.3, 0.6) each made it worse (up to 13.9). Tane chose the cap for walls too, so a 60-degree wall hit is held to it. Holding only the spin about the up (as first asked) left the 0.5 m hit at 6.09 rad/s in all, because the hit also rolls the body; holding the whole turning also kept the 0.75 m hit from tipping (0.80 roof-up with the up-only cap, 0.97 now).

Measured at top speed on the flat (throwaway code; the rock's reach at the ground 1 to 1.5 m):

| What is hit | A second later | Most turning | Lowest roof-up | Lifted |
| --- | --- | --- | --- | --- |
| A trunk (0.38 m) head on | stopped | 0.08 rad/s | 1.00 | 0.01 m |
| 0.25 m off centre | stopped | 3.82 | 1.00 | 0.01 m |
| 0.5 m off centre | 7.1 m/s | 5.46 (was 7.8) | 1.00 | 0 |
| 0.75 m off centre | 1.1 m/s | 5.64 (was 9.8) | 0.97 | 0.32 m |
| 1 m off centre (a brush) | 18.9 m/s | 2.15 | 0.99 | 0.05 m |
| A 0.2 m rock | passed over, nothing touched | | | |
| Rocks of 0.3, 0.45, 0.6, 0.8 and 1.2 m | stopped | 0.30 to 0.55 | 1.00 | 0.03 m at most (as domes: 0.66 to 5 m) |
| A wall at 60 degrees | 1.2 m/s | 5.48 (was 8.7) | 1.00 | 0.01 m |

Tests (`obstacles.test.ts`, and a 60-degree test in `walls.test.ts`), seen failing first: the trunk 0.5 and 0.75 m off centre (8.35 and 10.5 rad/s); the tall rock as a dome (0.55 roof-up); the low rock, the rocks as posts and the 60-degree wall (no `rockClear`, no `rocks` on plain courses, no `bump.spin`). **Changed with the behaviour** (Tane's choice): the plan's flat rock (0.3 m crossed at 18 m/s) is now two tests, a rock under the body's clearance passed over at 18 and 30 m/s, and rocks of 0.3, 0.6 and 1.2 m that stop the car like a trunk; `worldColliders.test.ts`'s rock test now checks posts and the low rocks with none (seen failing, on the missing settings); the collider order test leaves out the low rocks. 2,233 unit tests pass; all 338 browser tests passed in one run (21.7 minutes).

Pictures looked at: of the 24 drive pictures (seeds 1, 7, 42, 100, 2024 and 48213), only seed 100's boost changed. The slide helper's long slide ends on a beach rock there: in 7b's picture the rock had thrown the kart onto its side; now it stops against the rock, level and on its wheels. Nothing drawn changed.

### 7d: kerbs

The plan expected no new rule. **Tane chose softer springs on 2026-11-20**, from options with the numbers: `car.suspension.damping` **0.5** (was 0.8).

**Why:** crossing a kerb's 9 cm upright outer face from the grass at 30 m/s, the springs took the step in one go and threw the front wheels off the ground for a few steps. The car came out turned 4.2 degrees at 20 degrees to the kerb (the bar is 3), and lost 3.2% of its speed at 30 degrees (the bar is 3%). Of the plan's two levers, a wheel ball of 0.1 m fixed the kerb but broke four other tests (the banked ring at top speed, the two off-centre trunks, the 45-degree crossing at 18 m/s). Damping 0.5 fixed it and kept every other test.

Measured (throwaway code, then tests), crossing up the face at 30 m/s, the stick let go 10 m before it:

| Angle to the kerb | Damping 0.8: turned, speed lost | **Damping 0.5** |
| --- | --- | --- |
| 20 degrees | 4.21 degrees, 1.5% | 0.84 degrees, 0.7% |
| 30 degrees | 1.87 degrees, 3.2% | 0.11 degrees, 1.8% |

At damping 0.8, the crossings at 18 m/s, and at 5 and 45 degrees at 30 m/s, kept their heading within 0.3 degrees and their speed within 0.4%; at 0.5 they pass the test's bars. Wheel ball 0.1 m gave 0.72 degrees and 0.6%, 0.16 and 0.9%; 0.15 m gave 2.93 and 1.2%, 2.16 and 1.7%; damping 1.2 gave 1.12 and 0.9%, 3.54 and 12%.

Tests (`steering.test.ts`, "crossing a kerb from the outside, up its upright face"): the face crossed at 5, 20, 30 and 45 degrees at 18 and 30 m/s (each runs up along the kerb, turns in on its heading, and lets the stick go 10 m before the face); a tight slide across the kerb (up its ramp and off its face) carries on with its charge. Seen failing first: 20 degrees at 30 m/s (4.2 degrees) and 30 degrees at 30 m/s (3.2%) at damping 0.8; the others and the slide passed at once, as guards. `obstacles.test.ts`'s spin checks allow the physics engine's rounding (1e-5 rad/s), as 6b's 39 m/s check does: at damping 0.5 the turning held at 6 read 6.0000003. 2,242 unit tests pass; all 338 browser tests passed in one run (21.4 minutes).

Pictures looked at: the 18 moving drive pictures of seeds 1, 7, 42, 100, 2024 and 48213 changed with the softer springs (the start pictures are byte for byte the same). The kart sits on its four wheels at its usual height on the road, grass and sand; seed 42 after 5 s reads 108 km/h on the road; seed 100's boost still stops level against the beach rock; nothing is drawn differently, and nothing fails the visual bar.

**Step 7 is done.** What it gives Tane at check-in 2: drive off the road onto grass or sand (the readout names it, and the car slows to 65 km/h); scrape a wall at an angle (the car turns along it and off it); hit a tree or a rock (the car stops, upright).

## Step 8: progress and respawn (2026-11-21)

Planned in plan mode and approved by Tane on 2026-11-21 (plan file: `C:\Users\tanee\.claude\plans\pasted-content-id-ebfb-random-racing-sleepy-dove.md`). The rules and tests are those of `docs/plan/M3-driving.md`, "Step 8".

| Part | What | Status |
| --- | --- | --- |
| 8a | **Place on the lap and checkpoints**: `sim/track/progress.ts`, `sim.progress`, `CarState.progress` | Done |
| 8b | **Respawn**: water, the map's edge, flipped, stuck, R; `poseBehind`, `CarPhysics.place`, `sim.respawn` | Done |
| 8c | **The page**: R through the input record, the fade, the place on the readout, `drive.replay` | Done |

### 8a: the place on the lap and checkpoints

- **`sim/track/progress.ts`**: `ProgressState` (`near`, `along`, `off`, `next`, `passed`), `placeOnLap`, `startProgress`, `stepProgress`, `checkpointCount`, `checkpointAt`. Pure sums, exact maths only.
- **`sim.progress: { window: 40, lost: 30, every: 100, margin: 6, stride: 40 }`** (`ProgressConfig`): the place is looked for within 40 m along the lap of the last one, and over the whole lap when the nearest sample there is over 30 m away; checkpoints every 100 m or so (the lap divided evenly), checkpoint 0 on the start line; one counts when the place moves forwards past it by under 40 m in a step, with the car within half the road's width plus 6 m of the centre line, and only the next in order counts.
- **In the simulation** (`sim.ts`): the progress starts from the start pose and is moved on after each physics step from the body's position; it is in `hash()`, `SimSnapshot.progress` and `CarState.progress`. On a plain test ground it is null. Every simulation fingerprint changed (none is written into a test).
- The last checkpoint passed is worked out from `next` and `passed` rather than stored.

**Three changes to the plan's rule, Claude's calls, for Tane to judge:**
- **The place is taken between the two samples either side**, at the share of the way where the point is square to the line, the line's direction turning evenly between the samples. The plan's `j × spacing + dot(p − p_j, t_j)` steps back slightly each time the nearest sample changes on the outside of a corner: measured 4 cm at worst on seeds 7 and 147, weaving 8 m either side at half a metre a step. Now the place only ever rises.
- **"More than 30 m from the line" is judged by the distance to the nearest sample found**, not by `|off|`. A car put far along its own road (a respawn ahead, say) is near the line but far from every sample in the window, and `|off|` alone would not notice.
- **The folded seed is 147, its sections 67.5 m apart centre to centre.** The plan's "sections 40 m apart" was the 12 m road; on the 20 m road seed 147 is the closest of seeds 1 to 200 (then 20 at 69.4 m and 72 at 69.6 m), measured between samples more than 150 m apart along the lap.

Tests (`sim/track/progress.test.ts`, and "the place on the lap" in `sim/sim.test.ts`), seen failing first on the missing module and on the missing `CarState.progress`: on seeds 7 and 147 a point moved round the whole lap from 4 m behind the line, weaving 8 m either side, has a place within 15 cm of where it was put that only rises, and passes every checkpoint in order; on seed 147, 15 m from one section towards the next, the place stays on its own section, and a car set down on the next section is found there with no checkpoint for the jump; the hourglass fixture, 60 m between its waists, the same; a cut 20 m off the line over checkpoint 2 does not pass 3; reversing over a checkpoint does not count, and coming forwards again does not count it twice; reversing on the line over a missed one does not count it; the margin passes at 15.99 m off on a 20 m road and not at 16.01; a step of 42 m forwards counts nothing. In the simulation: seeds 42, 7 and 5 start 4 m short of the line with the line next; seed 7 driven down the road passes the line within a metre of it and the next checkpoint within a metre of its place; a snapshot carries the progress exactly; a change to any one of its numbers changes the fingerprint. 2,266 unit tests pass. The browser suite: 329 passed and 7 failed in Firefox in a run of 49 minutes, during which the laptop went into standby twice (Kernel-Power 506 and 507 at 20:06, 20:11 and 20:32): six pages that did not load or a Firefox that did not start, and "gives the same picture of a slide and of a boost twice", this time on the boost's picture. All seven passed run again alone, twice each. Nothing 8a changed is drawn. The slide test's pictures were lost: the `list` reporter writes no attachment given only as bytes, so the test now writes the pictures that differ into its own folder in `test-results/`.

### 8b: respawn

- **`sim.respawn: { delay: 1, waterDepth: 0.5, edge: 20, deep: 30, flipped: { roofUp: 0.3, time: 1 }, stuck: { speed: 0.5, time: 3 } }`** (`RespawnConfig`). A wait of 60 steps starts when the car's middle is 0.5 m under the sea, within 20 m of the tile's edge or 30 m under the sea ("lost"), when its roof-up has been under 0.3 for 60 steps, or when the throttle or the brake has been down for 180 steps with the car under 0.5 m/s. During the wait the pedals and stick do nothing. Then the car stands at the last checkpoint passed, still, remembering nothing (no drift, charge or boost).
- **R** (the input record's `reset` bit), on the step it goes down, does the same at once, wait or no wait. Holding it does not repeat it.
- **`sim/respawn.ts`**: `RespawnState` (`waitLeft`, `flippedFor`, `stuckFor`, `why`, `placedAt`, `respawns`), `watchCar` (the triggers, pure). In `hash()`, `SimSnapshot.respawn` and `CarState.respawn`. `placedAt` and `respawns` are for 8c's fade.
- **`poseBehind(world, cfg, sample, back)`** in `sim/start.ts`: `startPose` with sample 0 made a parameter, so `startPose` is exactly what it was (a test compares it with the old code, word for word). **`checkpointPose(world, cfg, k)`**: on the centre line where checkpoint `k` stands, facing along the lap at the sample at or just past it, tipped with the road.
- **`CarPhysics.place(pose)`** (`setTranslation`, `setRotation`, `setLinvel`, `setAngvel`); **`Car.halt()`**, when a wait starts (the drift cancelled with no boost, so letting go of the button during the wait gives none); **`Car.clear()`**, when the car is put back.
- **`createSimOn(..., home?)`**: before any checkpoint is passed, a respawn puts the car on the island's start pose (whatever pose the simulation started from), or on a test ground its `home` (its start pose unless another is given). Without this a car started upside down for a test would be put back upside down.
- **`seaOpenings(world)`** in `testing/checkSeeds.ts`: places where the roadside is open and the sea bed is 2 m under the sea within 150 m of the road, with no tree or rock on the way. **Seed 7 has none since the 20 m road** (its open roadsides are all over 150 m from the sea), so the tests use seeds 9 (the sea 32 m from the centre line at sample 630) and 18 (36 m at sample 125). Of seeds 1 to 20, 15 have one.

**Answers to step 2's questions** (throwaway code on the 45% grass hillside test ground): the car climbs from the road at its foot to the top, 55 m up the slope, in 4.95 s, at 16.8 m/s (half way up from rest: 3.17 s). It does not slide down: with nothing pressed it stands still on the slope facing up, down or across, so a hillside never needs a respawn and never counts as stuck. Reversing up it with the brake held, it climbs at 7.2 m/s.

Tests (`sim/respawn.test.ts`, `sim/start.test.ts`, `place` in `physics/carBody.test.ts`), seen failing first on the missing settings, `poseBehind`, `checkpointPose` and `place`: on seeds 9 and 18 the car follows the centre line past a checkpoint, steers off into the sea, and 60 steps after its middle went 0.5 m under (59 still waiting, with the throttle and stick held) stands at the last checkpoint it passed, still, on four wheels, facing along the road; 15 m from the edge and 31 m under the sea the wait starts at once ("lost"); upside down on the flat it starts after 60 steps and the car comes back on its wheels; the 4e roll from 3 m up is never respawned; pressed against a wall with the throttle down it is stuck after 3 s, and moves exactly as a twin given nothing during the wait; the brake held at a standstill and nothing pressed for 10 s are never stuck; R puts the car at the last checkpoint on the step it goes down, not again while held, on the start pose before any checkpoint, and at once during a wait; a slide with a boost running when a wait starts ends with no boost, and letting go of the button during the wait gives none; a snapshot taken during a wait carries on exactly; a change to any one of the respawn numbers changes the fingerprint; `startPose` is to the last digit what it was on seeds 42, 7 and 5; every checkpoint pose on seeds 42, 7, 5, 9, 18 and 147 is on the centre line (within 5 cm along, 10 cm across), facing along the lap, roof up, above the sea and over 20 m from the edge. Two mistakes in my own new tests were corrected before the commit: the checkpoint pose faces along the sample just past the checkpoint, not the nearest (up to 5 degrees apart in a tight corner); and the car driven into the sea may pass one more checkpoint before it leaves the road, so the test reads which one it passed last. 2,292 unit tests pass; all 338 browser tests passed in one run (28.1 minutes).

A run of the unit suite on battery (14%, slowed by Windows) timed out three mountain tests and the corner test; on mains power all passed in 4 minutes.

### 8c: respawn on the page

- **R and the controller's Back reach the simulation in the input record** and put the car back at the last checkpoint passed (8b). The page's own R, which built a new simulation on the start line, is gone; `drive.reset()` still does that, for tests and the console. The hint says "R goes back to the last checkpoint".
- **The fade** (`respawnFade` in `app/drive.ts`, `render.respawnFade: { in: 0.3, out: 0.4 }`): a layer over the picture and under the cards, in the cards' pale off-white (`RESPAWN_FADE` in `render/palette.ts`), rising evenly over the last 0.3 s of the wait, white on the step the car is put back, clearing over 0.4 s. Worked out from the simulation's state and step count alone, so `still=1` pictures repeat. R gives only the fade back from white (Claude's call). `data-drive-fade` on the page.
- **No blend across a respawn** (`driving.ts`): the step after one is drawn as it is and the camera put straight behind the car, so the car does not streak across the island for a frame and the camera does not swoop.
- **The readout** gains the place on the lap (`placeReadout`): "0.20 of 2.12 km · next checkpoint 3 of 20", "next the line" for checkpoint 0. `data-drive-respawns` on the page.
- **`drive.replay(packed)`** steps through a list of packed inputs and draws one frame: a drive worked out in Node, replayed exactly (9c uses it too).
- **`testing/seaDriver.ts`**: the sea tests' driver, now shared with the browser test. It follows the centre line until 20 m before the opening, then keeps going for the sea; as first written it aimed across the island when the opening was more than half a lap ahead (found in the pictures, test code only).

Tests, seen failing first (no fade settings, no `placeReadout`, the car blended across the respawn; in the browser, no place line and no `data-drive-respawns`): `respawnFade` (clear until the last 0.3 s of a wait, rising evenly to white, white on the step of the respawn, clear 0.4 s later), `placeReadout`, and no blend across a respawn in `driving.test.ts`. Browser, Chromium and Firefox: seed 18 driven into the sea in Node, the inputs replayed on the page: clear at the wait's start, part white near its end, white with the car at its checkpoint, clear 0.4 s later, the same fingerprint as Node a second after the wait, the readout naming the next checkpoint; R held on the page puts the car at the start line through the same simulation (its step count carries on). **Changed with the behaviour:** "R puts the car back on the start line" expected a new simulation from step 0; it now expects the same simulation, at the last checkpoint passed. **Waits made longer** (not what the tests check): `sim.test.ts`'s setup builds three islands and timed out at the default 10 s twice when the whole suite ran at once, and the foothills test in `mountains.test.ts` sat on its 20 s limit as the snow test beside it had; both are given 60 s. 2,299 unit tests pass; all 340 browser tests passed in one run (22.4 minutes).

Pictures looked at (a throwaway spec, Chromium, seeds 18, 9, 20, 2 and 8; six moments each: going in, under, fading, white, clearing, back): the kart runs down the beach into the sea and is seen under the water; the picture whitens evenly with the cards readable on top; it clears on the kart standing on its four wheels in the middle of the road at its checkpoint (the start line's chequers on seed 9 in the first run, which got stuck among trees and came back by the "stuck" rule), facing along the road; the readout reads the place. Nothing fails the visual bar; `VISUAL_BAR.md` describes the fade and the readout's new line.

**Step 8 is done.** What it gives Tane at check-in 2: drive into the sea or off the map, roll the car or get it stuck, and it comes back at the last checkpoint after a second with a white fade; R does it at once; the readout shows the place on the lap.

## Step 9: the bot and the corner proof (2026-11-22)

Planned in plan mode and approved by Tane on 2026-11-22 (plan file: `C:\Users\tanee\.claude\plans\pasted-content-id-1f6b-random-toasty-unicorn-of-085b5350-b85d-4259-87b7-a9865d32c7c3.md`). The rules and tests are those of `docs/plan/M3-driving.md`, "Step 9".

| Part | What | Status |
| --- | --- | --- |
| 9a | **A bot that laps**: `testing/botDriver.ts`; the brake past top speed | Done |
| 9b | **The bot drifts: the corner proof**: `passCorner`, `bestPass`; the sliding laps | Done |
| 9c | **The same lap in every browser**: the sliding laps of seeds 1 and 7 replayed on the page | Done |

### 9a: a bot that laps

- **The bot** (`src/testing/botDriver.ts`, test code): `createBot(world, cfg, { margin })` gives what to press from the car's state. It steers with `stickToward` at the point on the centre line `6 + 0.5 x speed` m ahead of its place on the lap (`pointAlong`, between the samples). It brakes for what is coming within 80 m (`targetSpeed`): a corner allows `sqrt(0.9 x sideForce x radius)`, and braking at 0.7 of the brake brings it there in time. More than 0.5 m/s under that it presses right down, more than 0.5 m/s over it brakes (by how far over, a whole press for 2 m/s), and between it holds the throttle at the target's share of top speed. The sum is `cornerLimit` in `testing/lineDriver.ts`, now shared with the corner driver's `roadLane.limit` (same numbers, same results).
- **`lapRun(rapier, world, cfg, bot, laps)`** drives laps from the start line; a lap ends when the car passes the line again having passed every checkpoint. It gives each lap's time, average speed, share of steps with four wheels on road or kerb, and seconds with any wheel off it; wall and gate touches, tree and rock touches, respawns, and every step's packed input.
- **Found: the brake did nothing at top speed downhill** (`speedChange` in `sim/car/drive.ts`). Rule 9 (6b) slows a car above top speed by the shed or the brake, "no further than to top speed". Downhill, gravity takes the car a hair over top speed every step, so a car with the brake right down stayed at 30 m/s. The bot first touched walls on 8 of the 20 seeds, each time arriving at a corner at 30 m/s with the brake held for over a second (seed 5: 90 steps of full brake into a 22 m hairpin, still at 30 m/s). **Now the shed stops at top speed and the brake does not** (the plan's rule changed in the same commit; Claude's call, for Tane to feel at check-in 2: braking at top speed down a hill now works). On the flat, and with no brake, nothing changes. With it fixed, every lap below is clean with no change to the bot.

The laps (seeds 1 to 20, Node; lap 1 from standing 4 m behind the line, lap 2 flying):

| Seed | Relief | Lap (m) | Lap 1 (s) | Flying lap (s) | Average (km/h) | Four wheels on road or kerb (%) | Off the road (s) | Wall touches | Tree and rock touches | Respawns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | mountain | 2,385 | 90.6 | 88.8 | 95 / 97 | 99.9 / 99.9 | 0 | 0 | 0 | 0 |
| 2 | flat | 1,916 | 73.6 | 71.8 | 94 / 96 | 100 / 100 | 0 | 0 | 0 | 0 |
| 3 | mountain | 2,740 | 101.0 | 99.2 | 98 / 99 | 100 / 100 | 0 | 0 | 0 | 0 |
| 4 | rolling | 2,246 | 86.3 | 84.4 | 94 / 96 | 100 / 100 | 0 | 0 | 0 | 0 |
| 5 | hilly | 2,049 | 76.4 | 74.7 | 97 / 99 | 99.9 / 99.9 | 0 | 0 | 0 | 0 |
| 6 | hilly | 1,998 | 78.8 | 77.0 | 91 / 93 | 99.7 / 99.8 | 0 | 0 | 0 | 0 |
| 7 | hilly | 1,888 | 75.0 | 73.3 | 91 / 93 | 100 / 100 | 0 | 0 | 0 | 0 |
| 8 | rolling | 1,650 | 67.6 | 65.7 | 88 / 90 | 100 / 99.7 | 0 | 0 | 0 | 0 |
| 9 | flat | 1,910 | 72.9 | 71.0 | 94 / 97 | 99.9 / 99.6 | 0 | 0 | 0 | 0 |
| 10 | hilly | 1,901 | 73.6 | 71.7 | 93 / 96 | 100 / 99.9 | 0 | 0 | 0 | 0 |
| 11 | mountain | 2,689 | 98.6 | 96.6 | 98 / 100 | 99.7 / 99.8 | 0 | 0 | 0 | 0 |
| 12 | mountain | 2,116 | 79.6 | 77.7 | 96 / 98 | 99.9 / 99.7 | 0 | 0 | 0 | 0 |
| 13 | mountain | 2,141 | 80.5 | 78.7 | 96 / 98 | 99.8 / 99.9 | 0 | 0 | 0 | 0 |
| 14 | mountain | 2,394 | 90.0 | 88.1 | 96 / 98 | 100 / 100 | 0 | 0 | 0 | 0 |
| 15 | flat | 1,651 | 63.9 | 62.0 | 93 / 96 | 100 / 99.7 | 0 | 0 | 0 | 0 |
| 16 | rolling | 2,050 | 81.6 | 79.7 | 90 / 93 | 99.9 / 100 | 0 | 0 | 0 | 0 |
| 17 | rolling | 2,106 | 77.8 | 75.9 | 97 / 100 | 100 / 100 | 0 | 0 | 0 | 0 |
| 18 | flat | 2,123 | 82.5 | 80.6 | 93 / 95 | 100 / 99.9 | 0 | 0 | 0 | 0 |
| 19 | rolling | 1,963 | 76.1 | 74.2 | 93 / 95 | 100 / 100 | 0 | 0 | 0 | 0 |
| 20 | rolling | 2,074 | 80.0 | 78.2 | 93 / 95 | 99.8 / 100 | 0 | 0 | 0 | 0 |

The share under 100% is wheels in the air for a step or two over crests, never off the road. The 40 laps take 132 s in one worker (2.4 to 13.3 s a seed; seed 20, the most wooded, slowest).

Tests, seen failing first: `testing/botDriver.test.ts` (8, the speed sum, aiming and pedals, on the missing module); `sim/car/laps.test.ts` (both laps finished, 0 respawns, 0 wall or gate touches, 98% on road or kerb each lap) on the missing module, then on wall touches on seed 1; the new `drive.test.ts` test (the brake at top speed downhill gave -0.02 m/s a step, not -0.33). Every other test passes unchanged, the corner tests included. 2,312 unit tests pass; all 340 browser tests passed in one run (22.9 minutes). Nothing drawn changed.

### 9b: the bot drifts, and the corner proof

**The bot told to slide** (`createBot(world, cfg, { slide: true })`, or `corners` for chosen ones) drifts through the generator's own drift corners, 45 degrees or more with a radius of 90 m or less (`slideCorners`, from `track.score.driftMinDegrees` and `driftMaxRadius`):
- It presses the button 10 m before the corner, with at least 0.35 of stick into it.
- In the slide it asks for the circle through the car, along its line of travel, and a point 12 m ahead on the centre line (`stickForCurve`, the inverse of `pathCurve`), with the throttle down.
- It lets go when 15 degrees of the corner are left (`turnLeft`).
- It does not brake for a corner it will slide through, and it holds the car's own top speed while a boost runs (`CarState.top`), so it does not brake the boost away.

**What the first runs found in the bot, fixed in the bot (Claude's calls, test code only):**
- **A slide to the other side pressed too early** (seed 4, a right into a left): the nose was still swinging back, so the press was lost. It now waits for the nose, as 6a makes a player wait.
- **After a slide was cancelled by a wall** it kept pressing with full stick into the wall until the car was "stuck". It now drives the rest of the corner on grip.
- **A slide started while the road still turned the other way** (seed 18's 90 m sweeper comes straight out of a 26 m left): a slide curves only its own way, so the car ran off the outside. It now presses before a corner only if the road there is not turning the other way tighter than a 500 m circle.
- **A slide started heading for the corner's inside edge** (seed 15, carried out of a left into a right) cannot steer back out, even on the widest circle. It now presses only once its own line turns into the corner.
- **The comparison was not like for like**: the pass without a slide picked the best of three margins (0.9, 1.0, 1.1) while the slide pass kept 0.9, and on seed 20 the next corner, 30 m and inside the 120 m timed, decided it. Both passes now take the best of the three margins for their driving on grip.

**The corner proof** (`passCorner`, `bestPass`, `pickCorners`; `sim/car/cornerProof.test.ts`): the car at rest on the middle of the road 250 m before the corner, timed from 40 m before it to 120 m after it by its place on the lap, between steps. "Clean" is every wheel on road or kerb, nothing touched and no respawn over that stretch. The 12 corners are each kind's tightest, middle and widest by radius, with the middle swapped for a mountain seed's when none of the three is on one. All 12 pass:

| Corner | Seed (relief) | Radius, turn | With the slide: time, exit speed, tier | Best without: time, exit speed | Saved |
| --- | --- | --- | --- | --- | --- |
| Hairpin | 6 (hilly) | 22 m, 184 deg | 9.72 s, 27.3 m/s, 3 | 11.12 s, 26.0 m/s | 1.40 s |
| Hairpin | 1 (mountain) | 38 m, 180 deg | 10.50 s, 27.9 m/s, 3 | 11.78 s, 27.9 m/s | 1.28 s |
| Hairpin | 15 (flat) | 43 m, 180 deg | 9.71 s, 30.0 m/s, 3 | 10.95 s, 30.0 m/s | 1.24 s |
| Sweeper | 8 (rolling) | 73 m, 60 deg | 9.05 s, 25.3 m/s, 2 | 9.20 s, 25.4 m/s | 0.15 s |
| Sweeper | 13 (mountain) | 86 m, 61 deg | 8.35 s, 30.0 m/s, 2 | 8.49 s, 30.0 m/s | 0.14 s |
| Sweeper | 18 (flat) | 90 m, 84 deg | 10.51 s, 28.0 m/s, 3 | 10.75 s, 27.9 m/s | 0.24 s |
| Chicane | 8 (rolling) | 22 m, 79 deg | 6.92 s, 25.3 m/s, 1 | 7.70 s, 25.4 m/s | 0.78 s |
| Chicane | 14 (mountain) | 33 m, 47 deg | 7.05 s, 29.9 m/s, 0 | 7.30 s, 29.9 m/s | 0.25 s |
| Chicane | 6 (hilly) | 46 m, 66 deg | 7.63 s, 27.4 m/s, 1 | 7.87 s, 27.4 m/s | 0.24 s |
| Plain corner | 17 (rolling) | 22 m, 78 deg | 6.76 s, 25.0 m/s, 1 | 7.61 s, 25.0 m/s | 0.85 s |
| Plain corner | 3 (mountain) | 31 m, 72 deg | 6.69 s, 29.9 m/s, 1 | 7.36 s, 29.8 m/s | 0.67 s |
| Plain corner | 20 (rolling) | 65 m, 48 deg | 7.88 s, 29.4 m/s, 1 | 7.89 s, 29.5 m/s | **0.01 s** |

**Every slid corner of seeds 1 to 20** (177; throwaway code, the same passes):

| Kind | Corners | Quicker with the slide and clean | Time saved: middle (least, most) | Exit speed, with less without: middle (worst) |
| --- | --- | --- | --- | --- |
| Hairpin | 25 | 25 | 1.40 s (0.85, 1.68) | 0 (-0.1 m/s) |
| Sweeper (70 to 90 m) | 11 | 11 | 0.23 s (0.14, 0.29) | 0 (0) |
| Chicane | 24 | 24 | 0.44 s (0.16, 0.78) | 0 (0) |
| Plain corner | 117 | 116 | 0.72 s (0.01, 1.31) | 0 (-2.5 m/s) |

- The one that fails is a 22 m, 101-degree corner on seed 7: quicker with the slide at every margin (8.10 to 8.44 s against 8.72 s), but it touches the wall.
- **For check-in 2:** the slide pays most in tight corners and least in wide ones. A 65 to 90 m corner gains 0.01 to 0.29 s, because the car takes it nearly flat out on grip; there the boost (1.15 times for 0.5 to 1.6 s) is the whole gain. Seed 20's 65 m corner passes by 0.01 s, so a weaker boost or a slower slide at 10a would tip it.
- The exit speeds are the same with and without, because 120 m after the corner both cars are back at their speed for what comes next.

**The laps with slides** (`sim/car/slidingLaps.test.ts`, one lap from the start line each):

| Seed | On grip (s) | With slides (s) | Wall touches | Respawns | On road or kerb (%) |
| --- | --- | --- | --- | --- | --- |
| 1 | 90.62 | 81.65 | 0 | 0 | 99.9 |
| 2 | 73.63 | 65.60 | 0 | 0 | 99.9 |
| 3 | 100.98 | 95.30 | 0 | 0 | 99.8 |
| 4 | 86.32 | 76.80 | 0 | 0 | 99.6 |
| 5 | 76.43 | 70.68 | 0 | 0 | 99.3 |
| 6 | 78.80 | 67.82 | 0 | 0 | 99.8 |
| 7 | 75.05 | 64.98 | 1 | 0 | 98.3 |
| 8 | 67.60 | 60.50 | 4 | 0 | 95.2 |
| 9 | 72.88 | 65.27 | 0 | 0 | 99.6 |
| 10 | 73.58 | 65.85 | 0 | 0 | 99.9 |
| 11 | 98.57 | 92.35 | 0 | 0 | 100 |
| 12 | 79.60 | 71.75 | 0 | 0 | 99.0 |
| 13 | 80.45 | 74.38 | 0 | 0 | 99.0 |
| 14 | 90.00 | 82.00 | 0 | 0 | 99.4 |
| 15 | 63.87 | 57.38 | 0 | 0 | 100 |
| 16 | 81.58 | 70.27 | 0 | 0 | 99.8 |
| 17 | 77.82 | 72.05 | 0 | 0 | 98.5 |
| 18 | 82.48 | 72.20 | 0 | 0 | 99.5 |
| 19 | 76.07 | 67.12 | 0 | 0 | 99.8 |
| 20 | 80.05 | 70.97 | 0 | 0 | 99.7 |

Quicker on all 20 seeds, by 5.7 to 11.3 s (6 to 14%). The wall touches on seeds 7 and 8 are recorded, not tested, as planned.

Tests, seen failing first on the missing functions (and the sliding lap on the bot that ignored `slide`): `botDriver.test.ts` gains 4 (which corners slide, `stickForCurve` against `pathCurve` both ways, held to full stick, `turnLeft`); `cornerProof.test.ts` (3: three of each kind with a mountain seed, each slid clean, each quicker); `slidingLaps.test.ts` (2: finished on every seed, quicker on all 20). 9a's laps pass unchanged with the bot holding the car's own top speed. 2,321 unit tests pass; all 340 browser tests passed in one run (21.8 minutes). Nothing drawn changed.

### 9c: the same lap in every browser

- **`e2e/determinism.spec.ts`** gains one test per seed, 1 (mountain) and 7 (hilly). In Node, inside the Playwright process, the bot drives its lap with slides from the start line (`lapRun`, `createBot(..., { slide: true })`). Those inputs are stepped again in a fresh simulation to take the fingerprint after every 600 steps and at the end.
- **On the 3D page** (`seed=<s>&still=1`) the same inputs go through `window.seedCircuit.drive.replay` 600 at a time. After each chunk `drive.hash()` must equal Node's, so a mismatch says when it went wrong, and at the end the page's car must have finished the lap (every checkpoint and the line again).
- Seed 1's lap is 4,899 steps (9 chunks), seed 7's 3,899 (7 chunks). Each run takes 15 to 30 s in a browser.
- **Seen failing first on a deliberate fault**: the Node side changed one step's input half way. It failed in the chunk holding that step (after 3,000 steps on seed 1, 2,400 on seed 7), in Chromium and Firefox, and matched in every chunk before it. With the fault taken out all four pass: **one fingerprint in Node, Chromium and Firefox** for a whole lap of slides, boosts, a kerb or two and every checkpoint.

2,321 unit tests pass; all 344 browser tests passed in one run (22.7 minutes). Nothing drawn changed.

**Step 9 is done.** What it gives Tane at check-in 2: the tables above (laps on grip and with slides, the corner proof by kind), and the brake that now works at top speed downhill.

## Working agreements

- Branch + pull request per milestone. Commit and push after each step. Direct pushes to `main` are blocked, including docs updates.
- Models: Fable 5.2 built up to 4c and wrote the plan (2026-11-16); Opus 5.5 builds from here. Which model and effort for each milestone is Tane's call.
- Start each milestone in a fresh session: read `CLAUDE.md`, this file, `docs/PLAN.md` and the milestone's file in `docs/plan/`, and `docs/GAME_BRIEF.md`, then plan in plan mode.
- Playwright runs three browsers at a time (15e; first thought to be load, but the failures then turned out to be the laptop going into standby).
- When the laptop is hot it runs at half speed and tests time out (2026-11-15 evening: 19 browser timeouts, unit tests over their 20 s limit). Run unit tests with `npx vitest run --maxWorkers=6`, or let it cool; Tane can run `npm run e2e` by hand.
- Keep the laptop awake while the test suites or `npm run perf` run: Modern Standby stalls the browsers, and tests fail with worlds that never load or `ERR_NETWORK_IO_SUSPENDED` (found 2026-11-15). Since 8a Claude runs the browser suite through a small PowerShell wrapper (in the session's scratchpad) that asks Windows to stay awake for as long as the run lasts (`SetThreadExecutionState`, no admin rights, nothing changed in the settings); closing the lid still sends it to sleep.
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
| 2026-11-17 | **The car rides at 26 cm** (`car.suspension.rideHeight`, was 18) | Tane's choice (4e), from three options. At 18 cm the body's corner dug into a 45% bank met at an angle, and the car rolled over on 40 of 261 crossings. At 26 cm, 1 of 261 fails and every test passes. Rounded body edges fixed all 261 but jolted the car on the banked ring for reasons not yet found. The car is drawn 8 cm higher than planned |
| 2026-11-17 | **Check-in 1 (Tane):** top speed (30 m/s, about 4 s to reach), steering (60 m circle at top speed, 6 m at walking pace), braking into reverse on one pedal and the chase camera (6.5 m back, 2.4 m up, 60 degrees, 0.15 s follow) all stay as they are. Steering is fine because drifting will make the corners easier. **The walls are fine**: their places, the 40% slope rule, open beaches and the share of coast roads open to the sea, so the Claude's calls of 2026-11-15 and 16 stand. **The car looks good for now**; Tane may make a proper design later, perhaps with other car styles. The controller was not tried (Tane does not use one) | Tane's answers at check-in 1. Other car styles are under "Not in version 1" in the brief ("Car choice or customisation"), so they would be a change to the brief, for Tane to decide when the time comes |
| 2026-11-17 | **The car casts no shadow** (`carView.ts`: off the casters' layer, `castShadow` false); it still takes the shadows of trees, walls and the gate. `docs/VISUAL_BAR.md` changed to match: a car that casts a shadow now fails the bar | Tane's choice at check-in 1: the car's shadow was annoying to look at while driving |
| 2026-11-16 | **"No wheel in the air for over 0.2 s" at the kerb is timed per wheel** | Claude's reading of the plan's words, for Tane to judge. The wheels leave the kerb's 9 cm face one after another, each for up to 0.17 s, so all four are not down together for 0.3 s at 15 degrees and 30 m/s. Heading and speed are unaffected (0.11 degrees, 0.09%) |
| 2026-11-17 | **Keys are read by their place on the keyboard** (`KeyboardEvent.code`), not by the letter on them (5a) | Claude's call, for Tane to judge. W, A, S and D then sit under the same fingers on any layout (AZERTY's Z, Q, S, D) |
| 2026-11-17 | **A close view of the car, `look=car`**, and **no car in the old views** (5c) | Claude's call, for Tane to judge. The car needs a repeatable close picture before the chase camera exists, and for the visual bar's references. Old addresses keep their pictures, as the plan asks |
| 2026-11-17 | **The chase camera stays behind the nose while the car reverses**, and follows the velocity only when going forwards faster than 2 m/s (5d) | Claude's call, for Tane to judge. Following the velocity, it would swing round in front of a car backing away at more than 2 m/s |
| 2026-11-17 | **R puts the car back on the start line** as a new simulation, until 8b makes reset the simulation's own respawn; **"reduce motion" no longer holds the car**, only `still=1` does; **`sim.maxStepsPerFrame` lives in the `sim` block** (5e, 5b) | Claude's calls, for Tane to judge. Without R the car could only be brought back from the sea by reloading the page at check-in 1. Stopping the car would stop people who asked for less motion from driving at all. The limit sits beside the step rate it belongs with, though only the page reads it |
| 2026-11-22 | **The bot drives as a player would, and both passes of a corner take the best of three margins** (9b) | Claude's calls, test code only, for Tane to see. The slide follows the circle through a point 12 m ahead (as the keyboard corner driver), not the plan's curvature-plus-offset rule; it presses only when the road is not turning the other way and its line turns into the corner, waits for the nose before a slide the other way, gives up a corner after a hit. Each was found as a wall touch or a stuck car on a real seed, and none changes the car. The margins: the pass without a slide had its pick of three, the slide pass had one, and the next corner inside the 120 m decided seed 20 |
| 2026-11-22 | **The brake takes a car on past top speed** (`speedChange`, 9a): above top speed the shed stops at top speed, the brake does not | Claude's call, for Tane to feel at check-in 2. Rule 9 as first written stopped the brake at top speed too, so downhill, where gravity takes the car a hair over top speed every step, the brake did nothing at 30 m/s. Found by step 9a's bot, which then touched walls on 8 of 20 seeds; with the fix, none |
| 2026-11-21 | **Step 8, Claude's calls:** the place on the lap is taken between the two samples either side (it never steps back); a car far from every sample near its last place is looked for over the whole lap; before any checkpoint a respawn goes to the start line; a respawn's wait cancels any drift and boost; "stuck" counts the throttle or the brake; R gives only the fade back from white | For Tane to judge at check-in 2 (question 7). Details under "Step 8". The hillsides beside mountain roads need no respawn: the car climbs 45% back to the road in 5 s and stands still on it with nothing pressed |
| 2026-11-20 | **The springs are damped 0.5** (`car.suspension.damping`, was 0.8; 7d) | Tane's choice, from options with the numbers. At 0.8 a kerb's upright face crossed at 30 m/s threw the front wheels up and turned the car 4.2 degrees; a bigger wheel ball fixed that but broke four other tests |
| 2026-11-20 | **Rocks the body can reach are upright posts, at least 1 m tall; rocks of 0.2 m or less are not hit. After a hit on a wall, the gate, a tree or a rock the car's turning is held to 6 rad/s** (7c) | Tane's choices, from options with the numbers. As domes, rocks of 0.3 to 1.2 m met at top speed threw the car 0.7 to 5 m up; a trunk clipped off centre spun it at 8 to 10 rad/s, and the body's grip and bounce only made it worse |
| 2026-11-20 | **The wall's turn aims a little away from the wall** (`bump.away` 0.05, about 3 degrees) **and fades to nothing dead head on** (times how far the nose points along the wall); **the walls' sloping ends are blunt** (each piece's box level at its higher end) | Claude's calls, for Tane to judge (7b). With the plan's rule a 30-degree hit left the car scraping along the wall with its side; dead head on it turned at full rate either way by rounding; the ramp end stopped the car in 5 steps and tipped it to 0.76 roof-up. The blunt end is the plan's own fallback |
| 2026-11-20 | **Reversing is not slowed off the road** (7a) | Claude's call, for Tane to judge: a car can always back out of the grass at 8 m/s |
| 2026-11-18 | **Only the drift's effects are bloomed, drawn on their own layer** (6h-5), not the whole picture above a brightness threshold | Claude's call, the plan's fallback taken from the start. The island is then untouched byte for byte, whatever the sun's glint on the sea does, and nothing is drawn when no effect shows. Costs about 2.2 ms a frame at 1080p on the Arc graphics while an effect shows |
| 2026-11-18 | **The view's triangle and draw counts are the whole frame's**, the bloom's and speed lines' passes included (6h-5) | Claude's call. Three.js counted only the last draw, which read 0 once the bloom drew |
| 2026-11-17 | **6h, Tane's choices after the second drive:** a road 20 m wide at the corners (was 12; the brief said 12 to 14); a boost of 1.15 times top speed at 12 m/s² (was 1.3 at 30), times unchanged; steering keeps its top-speed circle above top speed; sparks and boost with CC0 sprites and bloom on the effects only (a change to the visual bar) | Tane, from options in plan mode. A boosted car at 39 m/s could steer no tighter than a 101 m circle. Measured in 6h-1: the old boost made 8 of 195 drives out of a corner unclean, the new boost with the cap none |
| 2026-11-17 | **Slide circles of 28, 57 and 203 m; the once-a-second driver's bar on chicanes 85%** (6h-4) | Tane chose the 85% bar from options. I had rounded 30 m's 84.8% (39 of 46) to 85% when asking; by the plan's rule (the gentlest that meet the bars) the circles are 28, 57 and 203 m, 2 m tighter than offered |
| 2026-11-17 | **6h-3, Tane's choices:** walls beside ground steeper than 45% (was 40%); the sea beside 15 to 30% of the lap on islands that only touch it (was 40%); mountain placement near-misses listed in the test like the gorges; the near-shadow budget 210,000 triangles (was 200,000) | Each from options with the numbers, when the 20 m road's new worlds broke a check that config could not fix without changing something Tane had chosen |
| 2026-11-17 | **The earthworks rule holds at the road's banked edges**, except on mountain seeds; **distances between sections are measured between road edges**; **the layout's road-dependent settings are given in road widths** (6h-2, 6h-3) | Claude's calls. A 20 m road's banked edge stands 1.4 m above its middle, so the middle alone no longer tells the fill; centre-to-centre distances shrink the gap between sections as the road widens; and a later width change then carries through |
| 2026-11-17 | **Slide circles of 30, 61 and 218 m** (6h-1); the corner test asks for a driver who changes key about once a second, not one who holds the key | The gentlest circles that pass every bar on the 20 m road. Tane chose the new bar: no circles let a driver who holds one key through 80% of hairpins and plain corners (best 54%) |
| 2026-11-17 | **A slide follows a circle of 22, 45 or 160 m whatever the speed** (key into the corner, no key, the other key), not a turn rate; **the nose points 15 degrees into the corner** (was 24) | Tane's choices after the first drive (6g): a held slide ran into the barrier within a second. A keyboard corner driver holds a slide through 95% of the corners of seeds 1 to 20 with these circles, 78% with the 30/50/110 m Tane chose first |

## Notes for later milestones

The design notes for Milestones 4, 5 and 6, and their steps, are in `docs/PLAN.md`.

### Earlier notes

- **M2 (from Tane):** track-first is fine. Shape the island so the track looks like it belongs: hills where it climbs, coastline near it where possible.
- **M3 (from Tane), done 2026-11-15:** checked and flagged; Tane chose the deterministic build (see decisions).
- **M2:** add the elevation score; move generation into a Web Worker.
- **M2:** folded tracks have parallel sections as close as 40 m (centre to centre). Terrain fitting must keep neighbouring sections at similar heights or separate them with a wall or bank, since the brief's cut-and-fill blends over 10 to 25 m.
- **M2:** corner entries have no easing (the curvature steps from zero to 1/radius). Banking handles this by averaging its tilt over 30 m (done in step 8); kerbs should allow for it too.

## Known issues and risks

- **"Gives the same picture of a slide and of a boost twice" fails now and then in Firefox in a full run**: on the slide's picture in 6h-5, on the boost's in 8a (a run with the laptop in standby twice), passing in every run alone (33 so far); the cause is unknown (see "6h-5"). Since 8a the pictures that differ are written to the test's folder in `test-results/` (`slide-round-1.png` and so on): look at them before running anything else, since every Playwright run empties `test-results/`.
- **A slide gains little in wide corners** (9b): 0.01 to 0.29 s in 65 to 90 m corners, where the car is nearly flat out on grip and the boost is the whole gain; seed 20's 65 m corner by 0.01 s, so a weaker boost at 10a would tip it. For check-in 2 (question 4).
- **The bot's lap with slides touches a wall on seeds 7 (once) and 8 (four times)** (9b), and seed 7's 22 m, 101-degree corner is quicker with the slide but touches the wall at every margin. Recorded, not tested; nothing is respawned. Worth a look by hand at check-in 2.
- **The drift's look waits for Tane** (check-in 2): tier 3's purple reads lilac at the spray's white-hot heads, and `drive-slide.jpg` and `drive-boost.jpg` are only proposed references.
- **The chase camera can be cut by a steep slope beside it** (seed 1, sliding onto a hillside, step 6d's pictures): it keeps clear of the ground under it, not beside it. For check-in 2 and step 8 (off the road).
- **From the chase camera in long meadow grass, the flower dabs look large and busy** (seed 7, 6d's pictures). `render.grass.flowers` has their size; for check-in 2 or M6.3.
- **No person has driven with a controller yet** (5a, 5e): the controller is read and tested by numbers only. Tane does not use one (check-in 1). The dead zone (0.15) and the triggers are untried by hand.
- **The car drives up a 45% grass slope from rest** (4e), at 16.8 m/s since 7a's grass slowdown (26 m/s before): nothing limits the engine's push by grip. If it should not climb such slopes, the plan's lever is `grip.drive` (the push held to what the wheels' load allows). For step 8 and check-in 2.
- **One hillside crossing in 261 still rolls the car** (4e, at 26 cm ride height; worst 44 degrees). A body with rounded edges fixed every crossing in a trial but jolted the car on the banked ring; worth another look if rolls show up in step 9's laps.
- **A wall hit at about 60 degrees at top speed turns the car away from the wall and stops it** (7b): its turning is held to 6 rad/s since 7c (it was 8.7), and it is at 1.2 m/s a second later. For check-in 2 (question 5: does a head-on hit feel fair?).
- **A rock's post can stand up to 0.7 m above a low drawn rock** (7c), so the car can stop just short of a rock that looks lower than its body. For check-in 2.
- **A wall's blunt end stands up to 0.38 m above the drawn wall for one 2 m piece** (7b), where the drawn end rises: a car can stop just short of the low drawn lip. For check-in 2.

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
- **A ridged range can stand over the road, which then runs through it in a gorge** (seeds 39898 and 42 since the 20 m road; 28496 before; about 1 seed in 40). Mountain placement checks a foot at 32 points round its outline. Tane chose to keep the gorges (step 17). The same coarse check lets a range's foot come 50 m from the road, or a mountain's land only just meet the road's, on test islands of seed 5 (6h-3, listed in `mountains.test.ts`). For M6.3: checking feet at 64 points removes the gorges too.
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
- **The start line can sit on a steep slope** (seed 5 starts on 8% since the 20 m road; mountain seeds up to 15%; seed 42 did before). The solver does not yet know where the start is. Worth flattening the start area before Milestone 4 puts a grid there.
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
- **2026-11-17 (Milestone 3, Opus 5.5):** 4e done, which ends step 4 (see "4e"). In the air the car turns back towards roof-up (`stability.ts`, `car.stability: { upright: 12, calm: 3 }`), and every change of spin goes through the box's own inertia (`twistFor`). Found: driving onto the 45% hillside at an angle rolled the car over, because the body's corner dug into the slope. Mapped over 261 crossings; ride height, wheel size and a rounded body tried; Tane chose ride height 26 cm (was 18). Also found: the car drives up the 45% grass hillside from rest (known issues). 1,986 unit tests pass. The browser suite passed in one clean run: 276 tests in 16.9 minutes, the fingerprint check across Node, Chromium and Firefox included. Next: step 5, planned in plan mode first.
- **2026-11-17 (Milestone 3, Opus 5.5):** Step 5 planned in plan mode and approved (see "Step 5"). 5a done: the keyboard and a controller are turned into the simulation's input (`src/input/`: `keysToInput`, `padToInput`, `padPresses`, `mergeInputs`; `input.deadZone` 0.15). Keys are read by their place on the keyboard (decisions). The page does not use them yet. 2,009 unit tests pass; all 276 browser tests passed in one run (13.1 minutes). Next: 5b, the fixed-step loop.
- **2026-11-17 (Milestone 3, Opus 5.5):** 5b done: the fixed-step loop's sums (`advance`, `blendState` in `src/app/drive.ts`; `sim.maxStepsPerFrame` 5) and the island's simulation built on the page beside the world, freed on a new island, not stepped yet (`drive.state()`, `drive.hash()`). Rapier loads in 101 ms (Chromium) and 253 ms (Firefox); the simulation builds in 31 to 104 ms; the world is no slower with Rapier fetched beside it. 2,019 unit tests pass; all 280 browser tests passed in one run (16.1 minutes). Next: 5c, the car drawn.
- **2026-11-17 (Milestone 3, Opus 5.5):** 5c done: the kart is built in code (`render/carShape.ts`, 492 triangles, inside the body box) and drawn where the simulation has it, wheels on the springs and front wheels turned with the stick (`render/carView.ts`, `WorldView.setCar`). New close view `look=car`; no car in the old views. Pictures of seeds 1, 3, 7 and 42 looked at beside the visual bar. 2,031 unit tests pass; all 290 browser tests passed in one run (16.0 minutes). Next: 5d, the chase camera.
- **2026-11-17 (Milestone 3, Opus 5.5):** 5d done: the chase camera as plain numbers (`camera/chase.ts`, `camera.chase`). Its easing is solved exactly, so it follows a steadily turning car identically at 30, 60 and 144 frames a second; it keeps behind the nose while reversing; it clears the ground through seed 28496's start gorge. 2,041 unit tests pass; all 290 browser tests passed in one run (16.0 minutes). Next: 5e, the page opens driving.
- **2026-11-17 (Milestone 3, Opus 5.5):** 5e, first commit: the old browser tests open flying with `cam=fly`, and the page reads it (`openingCamera` in `app/route.ts`); the page itself is unchanged. 2,044 unit tests pass; all 290 browser tests passed in one run (19.2 minutes). Next: 5e's second commit, the page opens driving.
- **2026-11-17 (Milestone 3, Opus 5.5):** 5e done, which ends step 5: the page opens driving. Keys and a controller drive the car (`input/devices.ts`), the fixed-step loop moves it and draws it blended between steps with the chase camera behind it (`app/driving.ts`), C goes driving, flying, circling, R puts the car back on the start line, and a readout shows the speed and the surface. Old addresses open their old views with the simulation built but not running. Pictures of seeds 1, 3, 7 and 42 looked at. 2,056 unit tests pass; all 320 browser tests passed in one run (22.5 minutes), the 3-second budget tests included. Step 4's record moved unchanged to `docs/archive/STATE-milestone-3-step-4.md`, so this file still reads in one go. Next: check-in 1 with Tane.
- **2026-11-17 (Milestone 3, Opus 5.5):** Check-in 1 with Tane. Speed, steering, braking into reverse, the camera and the walls stay as they are. The car looks good for now; a proper design, perhaps with other car styles, may come later. The controller was not tried. **The car casts no shadow** now (Tane: annoying while driving): `carView.ts`, with a new `carView.test.ts` seen failing first, and the visual bar changed to match. Pictures of seeds 1, 3, 7 and 42 (driving and `look=car`) looked at again. The car's reference pictures `drive-start.jpg` and `car-close.jpg` added to `docs/visual-bar/`. 2,059 unit tests pass; all 320 browser tests passed in one run (18.4 minutes). Next: step 6, planned in plan mode first.
- **2026-11-17 (Milestone 3, Opus 5.5):** Step 6 planned in plan mode and approved (see "Step 6"). 6a done: the drift rules as a pure function (`src/sim/car/drift.ts`: `stepDrift`, `tierOf`, `pathTurn`, `driftSteps`), with `car.drift`, `car.boost` and `car.engine.shed` in the config. Three Claude's calls (the 0.3 stick read from the record, a cancel during the hop, a slide to the other side waiting for the nose). 2,084 unit tests pass; all 320 browser tests passed in one run (18.1 minutes). Next: 6b, drift and boost in the car.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6b done: the car drifts and boosts (`car.ts` follows the plan's step line by line; `speedChange` takes the step's top speed and the boost, and sheds 9 m/s2 above top speed; the drift state in the fingerprint and the snapshot). Slide circles of 19.7, 34.1 and 119.9 m at top speed; 29.5 m/s in the tightest slide; a 2.1 s slide gives 39 m/s in 0.32 s for 1 s. 2,109 unit tests pass; all 320 browser tests passed in one run (18.4 minutes), the scripted run's fingerprint across Node, Chromium and Firefox included, now with drift live. Next: 6c, hits cancel a drift.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6c done: hits cancel a drift. `touching()` in `carBody.ts` names the wall, gate, tree or rock the body is against (with the contact's slope); the simulation reads it after each physics step and the car's next step cancels a slide on it. Plain test courses can have walls, posts and balls; new `wallGround()`. 2,116 unit tests pass; all 320 browser tests passed in one run (17.2 minutes). Next: 6d, sparks, flame and hop.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6d done: sparks in the tier's colour at both rear wheels, an orange flame with a pale tip while a boost runs, the hop drawn, and the tier and boost left on the readout (`render/driftEffects.ts`, `kartPose`, `carView`, `driftReadout`). Browser helper `slideTo` and new screenshots `-drive-slide` and `-drive-boost`; pictures of seeds 1, 7, 42 and 2024 looked at. Two known issues added (the camera beside a steep slope, flower dabs from the chase camera). 2,134 unit tests pass; all 330 browser tests passed in one run (19.1 minutes). Next: 6e, camera swing and wider view.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6e done: the chase camera swings 0.12 rad to the outside of a slide and widens to 70 degrees during a boost, eased the same at any frame rate (`camera/chase.ts`, `camera.chase`). Pictures of seeds 1, 7, 42 and 2024 looked at again. 2,142 unit tests pass; all 330 browser tests passed in one run (19.2 minutes). Next: 6f, the tuning panel.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6f done, which ends step 6: the tuning panel (T) with a slider for each number of the engine, steering, grip, drift, boost and chase camera, working on the page's own copy of the config; a car setting rebuilds the simulation from a snapshot (30 to 43 ms), a camera setting needs none; "Copy for config.ts" gives the values as text. The driving hint names the drift and T. 2,150 unit tests pass; all 334 browser tests passed in one run (19.6 minutes). Next: step 7 (surfaces and bumps), planned in plan mode first.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6g, from Tane's first drive: a slide held for a second ran into the barrier. Slides now follow circles of 22, 45 or 160 m at any speed (key into the corner, none, the other key; were turn rates) and the nose points 15 degrees in (was 24), Tane's choices from measured options. New keyboard corner driver (`testing/cornerDriver.ts`) and test: a slide held from just after each corner's start to just before its end, on the road, through 95% of the corners of seeds 1 to 20 (hairpins and plain corners 100%). 2,153 unit tests pass; all 334 browser tests passed in one run (22.1 minutes). Next: step 7, planned in plan mode first.
- **2026-11-18 (Milestone 3, Opus 5.5):** 6h-5 done, which ends 6h (see "6h-5"). The drift's effects are CC0 sprites (Kenney's Particle Pack, five PNGs in `public/effects/`) with a bloom on the effects alone: sparks that grow with the tier and cool from white-hot into its colour, a burst on letting go, tyre smoke, twin flames in the boost's tier colour, the kart's lean, counter-steer and squash, and speed lines. The bloom costs about 2.2 ms a frame at 1080p on the Arc graphics; no frame over 16.7 ms. Found: the view's counts read 0 once the bloom drew (fixed, test first). A Firefox picture test failed once and not in 31 runs after; cause unknown, the test now reports which check failed with the pictures. Pictures of tiers 1 to 3 and the boost on seeds 1, 7, 42, 100 and 2024 looked at; `drive-slide.jpg` and `drive-boost.jpg` proposed. 2,200 unit tests pass; the browser suite passed 335 of 336 (the flying test out of time under load, then 4 of 4 alone), and the budget tests on their own. Next: step 7, planned in plan mode first.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6h-4 done: the boost is 1.15 times top speed at 12 m/s², a boosted car steers on its top-speed circle, and slides follow circles of 28, 57 and 203 m. On the final 20 m worlds: the careful driver gets through 97% of corners, the once-a-second driver every hairpin, 96% of plain corners and 87% of chicanes; 97% of slides drive out clean with their boost. Tane chose 85% for that driver on chicanes; I had rounded 30 m's 84.8% when asking, so the circles are 2 m tighter than offered (decisions). Seed 42 can be brought to tier 3 from its start again, so its drift pictures are back. 2,189 unit tests pass. The browser suite failed one test (seed 42's drift pictures, out of time: the slide was searched for twice); the search now runs once, the repeat-picture drift test has 3 minutes, and the drift tests passed run again. Next: 6h-5.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6h-3 done: the road is 20 m wide and every island changed with it.
  - Distances between sections are measured between road edges, and straights widen 4 to 10 m.
  - The narrow folds are 2.9 to 4 widths and stretched bases at least 1.5.
  - The earthworks rule holds at the banked edges (but on mountain seeds).
  - Tane chose walls from 45%, sea beside 15 to 30% of touching islands, near-misses listed like gorges, and a shadow budget of 210,000.
  - The gorge, sloped-start and other seed fixtures moved with the worlds.
  - All 13 reference pictures were taken again and looked at; seed 42 has no drift pictures.

  2,186 unit tests pass. The browser suite's second run failed 3 (two timeouts and one load), and those passed run again alone. Next: 6h-4.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6h-2 done: the layout's distances and smallest corners are given against the road's width (`LayoutSettings`), worked out in metres by `trackRulesFor` (`TrackRules`). Seeds 1 to 60 have identical tracks at 12 m. At 20 m, seeds 1 to 200 all build with no fallback, with laps and build times as before. Hairpins fall to 90% of seeds unless the narrow folds are made 3 to 4.5 widths across, which gives 99%; 6h-3 sets that with the width. 2,175 unit tests pass; all 334 browser tests passed in one run (19.9 minutes). Next: 6h-3.
- **2026-11-17 (Milestone 3, Opus 5.5):** 6h planned in plan mode and approved. Tane's choices: a 20 m road, a boost of 1.15 at 12 m/s², the steering cap above top speed, sprites and bloom. 6h-1 done:
  - The corner driver gains a holder style and a drive out of the corner that brakes for what is coming.
  - The measured grid chose slide circles of 30, 61 and 218 m.
  - Tane's boost with the cap made no drive out of a corner unclean, where the old boost made 8 of 195 unclean.
  - No circles let a driver who holds one key through 80% of corners (best 54%), so Tane chose a bar for a driver who changes key once a second instead.

  2,158 unit tests pass; all 334 browser tests passed in one run (20.0 minutes). Next: 6h-2, the track at 20 m.
- **2026-11-17 (Milestone 3, Opus 5.5):** Tane's second drive, after 6g: the drift still feels wrong, the boost after it throws the car into walls and off edges, and the effects can look much better. Tane's four changes recorded under "Tane's second drive" (a milder boost, a much wider road, gentler drift turning, better sparks and flame) as part 6h, to be planned in a new session. Docs only. Next: plan 6h.
- **2026-11-20 (Milestone 3, Opus 5.5):** Step 7 planned in plan mode and approved (see "Step 7"). 7a done: off the road the car's top speed is the average of each wheel's surface share (`car.surfaces`: grass, sand, rock and snow 0.6), so 18 m/s on grass, 24 with two wheels on it, 20.7 boosting on it; a car faster than that sheds 9 m/s². Reversing is not slowed (Claude's call). The 45% grass hillside is now climbed at 16.8 m/s (was 26.2). 2,209 unit tests pass; all 338 browser tests passed in one run (25.4 minutes). Next: 7b, walls.
- **2026-11-20 (Milestone 3, Opus 5.5):** 7b done: the whole touch (thing and slope) and the time since the last hit are kept and fingerprinted; while touching a wall or the gate the nose is turned along it and on to about 3 degrees off it (`bump.away`, Claude's call), and a new hit sends the car off at 1.5 m/s; the walls' sloping ends are blunt (Claude's call, the plan's fallback). A 30-degree hit at top speed leaves the wall with 87% of its speed; head on the car rolls back at 1.45 m/s; the wall end met head on stops it level. Found: a 60-degree hit spins the car round (known issues). 2,224 unit tests pass; all 338 browser tests passed in one run (24.2 minutes); the drive pictures of seeds 1, 7, 42, 100, 2024 and 48213 are byte for byte those of 7a (none of those runs touches a wall). Next: 7c, trees and rocks.
- **2026-11-20 (Milestone 3, Opus 5.5):** 7c done, with two changes Tane chose from measured options: rocks the body can reach are upright posts at least 1 m tall (as domes, rocks of 0.3 to 1.2 m threw a car at top speed 0.7 to 5 m up; 79 such rocks stand within 25 m of the road on seeds 1 to 20), and after a hit on anything solid the car's turning is held to 6 rad/s (a trunk clipped 0.5 to 0.75 m off centre spun it at 8 to 10). Trunks and rocks now stop the car level; a 60-degree wall hit turns at most 5.5 rad/s. 2,233 unit tests pass; all 338 browser tests passed in one run (21.7 minutes). Next: 7d, kerbs.
- **2026-11-20 (Milestone 3, Opus 5.5):** 7d done, which ends step 7. The kerb's upright face, crossed from the grass at 30 m/s, threw the front wheels up and turned the car 4.2 degrees at 20 degrees to it; Tane chose softer springs (damping 0.5, was 0.8) from options with the numbers, which keep every other test (a bigger wheel ball broke four). Crossings at 5, 20, 30 and 45 degrees at 18 and 30 m/s now keep their heading within 3 degrees and their speed within 3% (20 and 30 degrees at 30 m/s: 0.84 and 0.11 degrees, 0.7 and 1.8%); a slide across a kerb carries on. 2,242 unit tests pass; all 338 browser tests passed in one run (21.4 minutes). Next: step 8, planned in plan mode first.
- **2026-11-21 (Milestone 3, Opus 5.5):** Step 8 planned in plan mode and approved (see "Step 8"). 8a done: the car's place on the lap (metres along it, metres right of the centre line) and checkpoints every 100 m or so, passed only in order, forwards, near the road (`sim/track/progress.ts`, `sim.progress`), in the fingerprint and the snapshot. Claude's calls: the place is taken between the samples either side, so it never steps back (the plan's sum did, by up to 4 cm); "far from the line" is judged by distance to the nearest sample; the folded seed tested is 147, 67.5 m between sections on the 20 m road. 2,266 unit tests pass; the browser suite ran with the laptop in standby twice and 7 Firefox tests failed, all of which passed run again alone (see "8a"). Next: 8b, respawn.
- **2026-11-21 (Milestone 3, Opus 5.5):** 8b done: the car is brought back to the last checkpoint passed 1 s after its middle goes 0.5 m under the sea, it nears the map's edge, it has been upside down for 1 s or stuck with a pedal down for 3 s; R does it at once (`sim/respawn.ts`, `sim.respawn`, `checkpointPose`, `CarPhysics.place`). Seed 7 has no open roadside near the sea on the 20 m road, so the sea tests use seeds 9 and 18. The car climbs the 45% grass hillside back to the road in 5 s and never slides down one. 2,292 unit tests pass; all 338 browser tests passed in one run (28.1 minutes). Next: 8c, respawn on the page.
- **2026-11-21 (Milestone 3, Opus 5.5):** 8c done, which ends step 8. R and the controller's Back go through the simulation (back to the last checkpoint); a short fade to white and back over a respawn, drawn from the simulation's state; no blend or camera swoop across a respawn; the readout shows the place on the lap; `drive.replay` replays packed inputs, and seed 18's drive into the sea gives the same fingerprint on the page as in Node. Pictures of five seeds looked at. Two slow waits given 60 s. 2,299 unit tests pass; all 340 browser tests passed in one run (22.4 minutes). Next: step 9, planned in plan mode first.
- **2026-11-22 (Milestone 3, Opus 5.5):** Step 9 planned in plan mode and approved (see "Step 9"). 9a done: a bot (`testing/botDriver.ts`) that follows the centre line and brakes for what is coming laps seeds 1 to 20, from the line and flying, with 0 respawns, 0 wall touches and 99.6% or more of each lap on the road (table under "9a"). Found: the brake did nothing at top speed downhill (rule 9 stopped it at top speed); fixed in `speedChange`, test first (Claude's call, decisions). 2,312 unit tests pass; all 340 browser tests passed in one run (22.9 minutes). Next: 9b, the corner proof.
- **2026-11-22 (Milestone 3, Opus 5.5):** 9b done, the corner proof. The bot slides through the generator's drift corners (45 degrees or more, 90 m or less) and is quicker, cleanly, through all 12 picked corners (three each of hairpin, sweeper, chicane and plain corner, a mountain seed among each kind) and through 176 of the 177 slid corners of seeds 1 to 20; the lap with slides is quicker on all 20 seeds, by 6 to 14%. Saved per corner: hairpins 1.4 s, plain corners 0.7, chicanes 0.4, sweepers 0.2 (middles); seed 20's 65 m corner by only 0.01 s. Four bot habits and a like-for-like comparison came from wall touches on real seeds (decisions). 2,321 unit tests pass; all 340 browser tests passed in one run (21.8 minutes). Nothing drawn changed. Next: 9c.
- **2026-11-22 (Milestone 3, Opus 5.5):** 9c done, which ends step 9. The bot's lap with slides on seeds 1 and 7, worked out in Node, replayed on the 3D page through `drive.replay` 600 steps at a time, gives the same fingerprint after every chunk in Chromium and Firefox, and finishes the lap there too (`e2e/determinism.spec.ts`). Seen failing first on a deliberate fault, in the chunk that held it. 2,321 unit tests pass; all 344 browser tests passed in one run (22.7 minutes). Nothing drawn changed. Next: check-in 2 with Tane.
