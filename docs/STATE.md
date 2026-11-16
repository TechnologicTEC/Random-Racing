# Project state

Updated at the end of every work session. A new session should read this first, then `docs/GAME_BRIEF.md`.

The step-by-step record of Milestones 1 and 2 (plans, measurements, check-ins and the session log) is in `docs/archive/STATE-milestone-1-2.md`, and their decisions are in `docs/archive/DECISIONS-milestone-1-2.md`. Known issues and working agreements from those milestones are still here.

**For a new model taking over (2026-11-16):** read "Where we are", then "Plan for steps 4d to 10", "Visual bar" and "Working agreements". The rest is the record of what was built and why.

## Where we are

- **Current milestone:** 3, Driving ([issue #3](https://github.com/TechnologicTEC/Random-Racing/issues/3)). Milestones 1 and 2 are merged and signed off (PR #7, PR #9)
- **Branch:** `milestone-3-driving`. `main` is protected by a GitHub ruleset (no force pushes, no deletion, pull request required); one pull request per milestone, merged after Tane signs off
- **Last finished step:** 3, the simulation skeleton (parts 3a to 3c, see "Step 3"): `createSim(rapier, world, config)` in `src/sim/sim.ts` stands the car's body behind the start line and gives `step`, `state`, `hash`, `snapshot` and `restore`. The car does not drive yet: inputs are recorded but move nothing. Step 2 (open walls, see "Step 2") finished the same day
- **Step 4 (springs, engine, steering and grip, no drift yet) is under way**, in parts 4a to 4e (see "Step 4 parts" and "Step 4"). **4a (groundwork), 4b (springs and standing grip) and 4c (engine, brake, reverse) are done; 4d (steering and cornering) is next.** The car stands on four sprung wheels, stays put on any slope, and drives, brakes and reverses in a straight line. The steering still moves nothing
- **Hand-over, 2026-11-16.** This was the last day of the model that built steps 0 to 4c. Everything still to do in this milestone is planned in parts under "Plan for steps 4d to 10", Milestones 4 to 6 have design notes under "Notes for later milestones", and the look is described under "Visual bar". **Tane asked for 4d and 4e not to be started until Tane has had another look**

## Milestone 3 steps

Tests first, watched failing. Unit and browser suites pass before each commit; commit and push after each step; short report after each step.

**Steps 4d to 10 are split into parts, with the tests and numbers that prove each, under "Plan for steps 4d to 10".** The table here is the overview.

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

### Step 4 parts

Planned 2026-11-16 (plan file: `C:\Users\tanee\.claude\plans\random-racing-milestone-3-rippling-corbato.md`). How the car works is in "Step 4" once the parts are done; the short version is under the table. **4d and 4e are set out in full, with their numbers, under "Plan for steps 4d to 10".**

| Part | What | Status |
| --- | --- | --- |
| 4a | **Groundwork**, no change to how the car behaves. Test grounds as plain triangles with a start pose (`src/testing/testGrounds.ts`: flat, 15% ramp, banked bend, 200 m crest, kerb, 45% bank); `createSimOn(rapier, course, cfg, start)` in `sim.ts` (a course is an island or plain meshes); `carBody.ts` gains the wheel cast and the pushes; the wheels feel only ground, road and kerbs; `src/sim/vec.ts`; `car/surface.ts` (road, kerb, grass, sand, rock or snow under a wheel). Tests: each ground is what it claims; a wheel cast finds the road before the first step and after a restore and ignores walls, trees and the gate; surfaces named on seed 7 | Done |
| 4b | **Springs and standing grip.** `car/suspension.ts`, the side grip and the hold, `car/car.ts` joining them, called from `sim.step`; `CarState` gains wheel readings and forward speed; the body's own grip comes down. Tests: dropped on the flat it settles at ride height, level, and stays still; stays put for 10 s on seed 42's sloped start and parked on the 45% bank; fingerprints and restore as before | Done |
| 4c | **Engine, brake, reverse.** `car/drive.ts`. Tests: top speed 30 m/s, 95% of it in 3.5 to 4.5 s, braking in a straight line, reverse, coasting to a stop and holding, at most 10% slower up 15% | Done |
| 4d | **Steering and cornering.** `car/steer.ts`. Tests: steady circles of the radius the settings say at three speeds, left and right alike; reverse steering; the banked bend at top speed; the kerb at an angle | |
| 4e | **Stability and the whole car.** `car/stability.ts`, tuning. Tests: wheels stay down over the 200 m crest; never tips on the 45% bank; lands on its wheels off a 1 m drop; the scripted run on seeds 42 and 7 stays upright with one fingerprint in Node, Chromium and Firefox. The measured table here | |

**How the car will work (Claude's calls):** four 5 cm balls cast down from the body's corners each step; a spring and damper at each; sideways speed cancelled up to a grip limit; speed chases top speed with an acceleration that tapers off near the top, with slope help; the brake reverses from a standstill; the stick sets how fast the car turns at once, with a tightest circle at low speed and a sideways-force limit at high speed; drive, brake and grip forces act at the height of the car's middle so they cannot roll it; in the air a gentle turning force brings the roof back up. Every sum uses only the body's motion and the wheel casts, so there is nothing new to save in a snapshot.

## Plan for steps 4d to 10 (written 2026-11-16 for the next model)

Written by the model that built steps 0 to 4c, on its last day, and approved by Tane the same day. It splits every step still to do into parts, each with the tests and numbers that prove it is done. **Every number is a starting value in `src/config.ts`, to be tuned by feel at the check-ins; the tests read the config, so they follow it.** The reasons are given so that a number can be changed with its consequences in view.

Each part ends with: its tests seen failing and then passing, `npm test`, `npm run typecheck`, `npm run e2e`, a commit, a push, and this file saying what is next. Each step is still planned in plan mode when it starts (CLAUDE.md); this section is what that plan starts from.

### Rules that hold for every part

- **`src/sim` uses exact maths only**: `+ - * /`, `Math.sqrt`, and `dsin` / `dcos` from `src/core/dmath.ts`. The architecture test enforces it. `src/camera`, `src/render`, `src/input` and `src/app` may use anything.
- **Anything the simulation remembers from one step to the next goes into `hash()`, `snapshot()` and `restore()`**, with a test that a restored run carries on exactly. Up to step 5 it remembers nothing of its own. The drift state (step 6), the wall touch (7b) and the progress (8) are the first.
- **Times in the config are seconds; the code turns each into whole steps once** (`Math.round(seconds * stepsPerSecond)`) and counts steps. Never add up fractions of a second.
- **Look Rapier's function names up** in `node_modules/@dimforge/rapier3d-deterministic-compat/dist/**/*.d.ts`. This is version 0.21; do not trust memory. Only `src/sim/physics` may import it.
- **Prove a rule on a test ground first** (`src/testing/testGrounds.ts`: the ground is exactly known), then on real seeds.
- **Directions.** The car's front is -z, its right +x, its roof +y. In `car.ts`, `across` (`cross(along, normal)`) points to the car's right. A positive `steer` is to the right. A positive turn rate about the car's `up` is to the left (anticlockwise seen from above), so steering right asks for a negative one.
- **If a test's number cannot be met, tune the config; if it still cannot, report to Tane.** Do not loosen a number quietly.
- **The browser suite takes about 25 minutes. Keep the laptop awake for it.** A page that "did not load in time" is standby or a slow spell, not the code: check Windows' event log (Kernel-Power 506 and 507) and run the failed tests again alone before debugging (see "4c").

### Step 4: the two parts left

| Part | Build | Rule and starting values | Done when |
| --- | --- | --- | --- |
| **4d Steering and cornering** | `car/steer.ts`: `turnWanted(steer, speed, car)`. `car.ts` gives it to `turnGrip` in place of the 0 it gives now | `car.steer: { minRadius: 6, sideForce: 15 }`. The turn rate asked for is `steer` times the smaller of speed / `minRadius` and `sideForce` / speed, and it changes sign with the speed, so a reversing car steers as a real one does. That is a 6 m circle up to 9.5 m/s, 15 m at 15 m/s and 60 m at 30 m/s; the fastest turning is 1.58 rad/s at 9.5 m/s. `sideForce` is under `grip.side` (22), so the car never slides in ordinary steering | Pure tests: those values; half stick gives half the rate; left mirrors right exactly; nothing at a standstill; reversed when rolling backwards. On the flat: circles at throttle 0.25, 0.5 and 1 have radius 6, 15 and 60 m within 5% (worked out from speed / turn rate, and the middle of the circle stays put within 5% of the radius for a whole lap); left and right within 1% of each other; speed within 2% of the straight-line speed for that throttle; four wheels down; roof up. One step after the stick moves, at 15 m/s, the turn rate is over 0.4 rad/s (the brief: instant). Half stick at top speed: 120 m. Reversing with the stick right: the car backs to its right and its nose swings left. Two laps of the banked ring (70 m, 8 degrees) at top speed, steered by a simple test driver: within 1 m of its middle line, 29 m/s or more, wheels down (it needs 12.9 of the 15 m/s2). The kerb crossed at 5 and 15 degrees, at 18 and 30 m/s, up its ramp and off its upright face: heading changed by under 3 degrees afterwards, no wheel in the air for over 0.2 s, under 3% of the speed lost. Every earlier test still passes |
| **4e Stability and the whole car** | `car/stability.ts`; the scripted run looked at now that it drives; the measured table | `car.stability: { upright: 12, calm: 3 }`. With no wheel on the ground: a turn towards roof-up of 12 rad/s2 for each unit of tilt (the sine of the angle between the car's up and straight up), and its roll and pitch damped by 3 a second; yaw is left alone. With wheels down, nothing new: drive, brake and grip already act through the body's middle, so they cannot roll it. Levers if a test fails, in this order: a bump stop (the spring twice as stiff over its last 4 cm before the underside meets the ground); then an extra pull down while only some wheels touch | Four wheels touching on every step over the 200 m crest at top speed (it needs 4.5 of gravity's 9.81 m/s2; at boost speed, 7.6). Onto the 45% hillside at 20 degrees, along it for 3 s and off again: never tipped more than 8 degrees beyond the slope's own 24, never under three wheels down for over 0.3 s. Off the 1 m drop at 10 and at 30 m/s: roof-up 0.95 or more at touchdown, level a second later, under 10% of forward speed lost, within 0.5 m of its line 2 s on. Started 3 m up, rolled 60 degrees and pitched 30: lands on its wheels (roof-up 0.9 or more). The scripted run on seeds 42 and 7 stays roof-up (0.7 or more) and gives one fingerprint in Node, Chromium and Firefox (`e2e/determinism.spec.ts`, as now). A table under "Step 4": top speed, time to 95% of it, braking distance, the three circles, speed up the 15% climb, whether it climbs the 45% hillside from rest and how fast, the cost of a step on seeds 7 and 8 |

### Step 5: drive it

Nothing in `src/sim` changes in this step.

| Part | Build | Done when |
| --- | --- | --- |
| **5a Input** | `src/input/keyboard.ts`: `keysToInput(held)`. `src/input/gamepad.ts`: `padToInput(axes, buttons, cfg)` for the standard mapping only (right trigger, button 7, throttle; left trigger, 6, brake; left stick, axis 0, steering; right bumper, 5, drift; Back, 8, reset; Y, 3, camera and Start, 9, pause are for the page, not the record). `mergeInputs(a, b)`: the larger of each pedal, the steering further from the middle, either button. New `input: { deadZone: 0.15 }`: a stick inside it reads 0, and the rest is stretched to reach 1. **No smoothing anywhere** (the brief) | Unit tests: every key in the brief's table; left and right together give 0; Space and Shift both drift; a stick at 0.15 gives 0, at 0.575 gives a half, at 1 gives 1, and left mirrors right; a trigger at 0.5 gives 128 of 255; `mergeInputs` |
| **5b The loop** | `src/app/drive.ts`: `advance(carried, frameSeconds)` gives how many steps to take (5 at most, the rest dropped) and the blend between the last two states; `blendState(before, after, blend)` (positions straight, turns the short way round). Rapier (`loadRapier`) is fetched beside world generation and the simulation made when both are in. A new island frees the old simulation (`sim.free()`); a Rapier world is not freed by itself | Unit tests: 1,000 frames at 144 a second give 60 steps a second within 1; one frame of a whole second (the tab was hidden) gives 5 steps and carries nothing over; the blend is at least 0 and under 1; a blend of 0 and of 1 give the two states exactly |
| **5c The car drawn** | `src/render/carShape.ts` (plain numbers, unit tested, the pattern of `treeShapes.ts`) and `src/render/carView.ts` (the Three.js wrapper). A low-poly kart built in code: see "Visual bar". Each wheel is drawn where the simulation says it is (`CarState.wheels[i].at`), so the springs show; the front wheels turn with the stick; the car casts a shadow | Unit tests: the shape lies inside the body's box (1.4 by 0.6 by 2.2 m) apart from the wheels; the wheels sit at `wheelMounts`; under 600 triangles. Screenshots on seeds 1, 3, 7 and 42 looked at beside the "Visual bar" pictures |
| **5d Chase camera** | `src/camera/chase.ts` as plain numbers, like `flyAlong.ts`. New `camera.chase: { back: 6.5, height: 2.4, lookAhead: 5, lookHeight: 1, follow: 0.15, clearance: 0.8, fieldOfView: 60 }` (the other cameras keep 50). It stands `back` metres behind the car along **the way the car is travelling on the map** (its velocity above 2 m/s, its nose below), `height` up, and looks at a point `lookAhead` in front and `lookHeight` up. Its direction eases to the car's with a time of `follow` seconds, by the frame's own length, so it is the same at any frame rate. It never comes within `clearance` of the ground (`sampleField` on `world.ground`, the idea in `flyAlong.ts`) | Unit tests: 6.5 m behind and 2.4 m up on the flat; after the car turns a quarter circle the camera is within 5 degrees of behind it in 0.5 s; the same place within 1 cm after 2 s at 30, 60 and 144 frames a second; never within 0.8 m of the ground on seed 28496 (the start gate in a gorge) |
| **5e The page** | `worldPage.ts` stays the wiring. The page opens driving. C goes round chase, flying, circling. In the chase view W, S, A, D, the arrows, Space, Shift and R drive; in the flying view Space and the arrows keep their old use. `cam=fly`, `cam=orbit`, `look=`, `at=` and `lap=` open their old views with the simulation not running, so old screenshot addresses give the same pictures as before. `still=1` holds the simulation too. A readout card: speed in km/h and the surface. `window.seedCircuit.drive`: `state()` and `run(steps, input)`, so a browser test steps the simulation itself instead of waiting in real time. Existing tests that assumed the page opens flying get `cam=fly` in their address; so does `e2e/perf.spec.ts` | Browser tests, Chromium and Firefox: the car is on the start line on four wheels (within 0.5 m of `startPose`); W held moves it; `run(300, { throttle: 1 })` leaves it over 20 m/s further down the road; C switches the camera and the hint; each old address still opens its old view; no console errors; the 3-second budget tests still pass. New screenshots `world-<seed>-drive-start.png` and `-drive-5s.png` (after `run(300, …)`), looked at on seeds 1, 3, 7 and 42 |

Then **check-in 1 with Tane**: speed, steering, camera, where the walls are. By then the car steers but does not drift, the walls are hard (step 7 softens them) and nothing brings the car back from the sea (step 8); say so.

### Step 6: drift and boost, the exact rules

**What the car remembers** (`DriftState`, all of it in `hash()` and the snapshot): `phase` (none, hop or slide), `dir` (-1 left, 1 right, 0 none), `charge` (steps spent sliding), `hopLeft` (steps of hop still to draw), `slide` (from 0 to 1: how far the nose has swung in), `boostLeft` (steps), `boostTier` (0 to 3, for the flame), `held` (whether the button was down on the last step).

**Starting values:**

```
car.drift: {
  startSpeed: 0.4,                     // share of top speed: 12 m/s (brief: about 40%)
  endSpeed: 0.3,                       // 9 m/s
  steerToStart: 0.3,                   // share of full stick
  hop: { time: 0.15, height: 0.08 },   // seconds and metres; drawn only
  angle: 0.42,                         // radians: 24 degrees
  swing: 0.25, recover: 0.2,           // seconds for the nose to swing in, and back
  turn: { wide: 0.25, tight: 1.5 },    // radians per second
  grip: 60,                            // m/s2
  turnGrip: 120,                       // rad/s2
  tiers: [1, 2, 3],                    // seconds (brief)
  boosts: [0.5, 1.0, 1.6],             // seconds (brief)
  brakeCancel: 0.5,                    // share of the brake pedal
}
car.boost: { speed: 1.3, accel: 30 }   // times top speed; m/s2
car.engine.shed: 9                     // m/s2
```

**The rules:**

1. **Start.** On the step the drift button goes from up to down, with the car going forwards at 12 m/s or more and two or more wheels on the ground, the hop begins: 9 steps, drawn only. If the stick is 0.3 or more to one side on that step, the slide starts at once to that side. If it is not, the slide starts on the first of the hop's 9 steps on which the stick reaches 0.3 with the button still down. If the hop ends first, nothing more happens until the button is let go and pressed again.
2. **The direction is locked.** `dir` never changes during a slide, whatever the stick does.
3. **The slide.** `slide` rises evenly from 0 to 1 over `swing` (15 steps). The nose points `angle * slide` into the corner from the line the car travels along. That line is `travel = along * dcos(b) - across * dir * dsin(b)` with `b = angle * slide`. While `slide` is above 0 the tyres take off the speed across `travel`, up to `drift.grip`, and the engine and the brake act along `travel`, on the speed along it. (With `slide` at 0 this is exactly step 4's car.)
4. **Steering sets how tight, not which way.** The path turns towards `dir` at `wide` with the stick fully away from the corner, `tight` with it fully into the corner, and evenly between: 0.875 rad/s with the stick in the middle. At top speed those are circles of 120 m, 20 m and 34 m; slower, they are tighter. The body's turn rate asked for is the path's plus the rate the nose is swinging, held with `drift.turnGrip` in place of `grip.turn`.
5. **Charge.** `charge` goes up by one on every step of the slide. Tier 1 (blue) from 60, tier 2 (orange) from 120, tier 3 (purple) from 180.
6. **Release.** When the button comes up during a slide: a boost of 30, 60 or 96 steps for tiers 1, 2 and 3, and none below tier 1. If a boost is still running, the longer of the two is kept, with its tier. `charge` goes to 0, `phase` to none, and `slide` falls evenly to 0 over `recover` (12 steps): the nose swings back out while the car carries on along `travel`, which ordinary steering now turns.
7. **Cancel**, with no boost and the charge lost (`slide` falls as in 6): the body touches a wall, the gate, a tree or a rock (6c); the brake is half down or more; the speed along `travel` falls under 9 m/s; a respawn (step 8). **Not** cancelled by: leaving the ground, kerbs, grass, letting go of the throttle.
8. **Boost.** While `boostLeft` is above 0 it falls by one a step, on the ground or in the air. For those steps the top speed is 1.3 times what it would be (39 m/s on the road), the throttle counts as fully down, and the engine's push is `boost.accel` with no easing, never taking the car past that top speed. The brake still brakes.
9. **After a boost.** A car faster than its top speed, with no boost running, slows by `engine.shed` (or by the brake, if that is harder) and no further than to its top speed. This replaces what 4c does above top speed, and 4c's two tests of that ("holds the car back above top speed…" in `drive.test.ts`) change with it. Below top speed nothing changes: half throttle at 20 m/s still eases off gently. Step 7 uses the same rule when the car runs onto grass.

**Why these numbers.** The generator scores a corner as a drift corner when its radius is 20 to 90 m (`track.score.driftMinRadius`, `driftMaxRadius`), and a hairpin's widest line on a 12 m road is about 25 m: so a slide must turn as tightly as 20 m at top speed and as widely as 120 m. Ordinary steering turns no tighter than 60 m at top speed, so every corner the generator banks fully (70 m and wider) is flat out on grip alone and anything tighter needs a slide or a lift: that is what makes drifting the fastest way through a corner (pillar 2). Turning takes a little speed off by itself, because the tyres take off the sideways part of the car's speed on every step: 0.06 m/s at 0.5 rad/s, 0.5 m/s in the tightest slide. With `shed` at 9, a boost is worth about 8, 12 and 18 m of road for the three tiers (a quarter to six tenths of a second); at the coasting rate it would fade for three more seconds and the tiers would hardly differ.

| Part | Build | Done when |
| --- | --- | --- |
| **6a The rules** | `car/drift.ts`: `stepDrift(state, asked, cfg)`, a pure function from the state, what is asked (button, stick, brake, speed along `travel`, wheels down, hit) and the config to the next state; `tierOf(charge)`; `pathTurn(state, steer)` | One unit test for each rule, on the exact step: starts at 12.0 m/s and not at 11.9; not without the stick; the stick arriving on the hop's ninth step starts it and on the tenth does not; not while reversing; a stick thrown the other way mid-slide changes nothing; `pathTurn` is 0.25, 0.875 and 1.5 towards `dir`; tiers on steps 60, 120 and 180 exactly; boosts of 30, 60 and 96 steps; none at 59; the longer boost is kept; each cancel loses the charge; the brake at 0.49 does not cancel; nothing restarts while the button stays down |
| **6b In the car** | `car.ts` uses `travel`, the path's turn rate, the drift grip, the boost and the shed; `speedChange` is given the top speed for the step; `Car` gains `save()` and `load()`; `Sim` puts the drift state in `hash`, `snapshot` and `restore`; `CarState.drift` for drawing (phase, dir, tier, slide angle, hop from 0 to 1, boost left and tier) | On the flat at top speed, sliding right and left: circles of 20, 34 and 120 m within 5%; the nose 24 degrees inside the line of travel within 1 degree once swung in; as a slide starts the path never turns away from the corner by more than half a degree (this is what `turnGrip` is for); 97% of top speed or more in the tightest slide. After a 2.1 s slide and release: over 30 m/s on the next step, 39 m/s within 0.4 s, held within 1% to the boost's last step, back under 30.1 m/s within 1.1 s more, never over 39. The top speed is raised on exactly 30, 60 and 96 steps. A snapshot taken mid-slide and one taken mid-boost carry on exactly; two simulations that differ only in drift state have different fingerprints. The scripted run already dabs the drift button, so `e2e/determinism.spec.ts` proves one fingerprint in Node, Chromium and Firefox |
| **6c Hits cancel** | `carBody.ts`: `touching()`, from `world.contactPairsWith` and `world.contactPair` (a manifold with `numContacts()` above 0, its `normal()`), names the solid thing the body is against (wall, gate, tree or rock, by `WorldColliders`) or null; the ground, road and kerbs do not count. `PlainCourse` gains optional walls, posts and balls; new `wallGround()` in `testGrounds.ts` | Sliding into the wall at 20 degrees ends the slide with no boost and `charge` 0; landing hard on the body's underside (the 1 m drop, mid-slide) does not |
| **6d Sparks, flame and hop** | `carView.ts`: the hop drawn from `hopLeft` (an arc 8 cm high); sparks at both rear wheels while sliding from tier 1, in the tier's colour; a flame behind the car while a boost runs, longer for a higher tier. Colours in a new `render.car`. Everything is drawn from the simulation's state and its step count, never the frame clock, so `still=1` repeats. Readout: tier and boost left | Screenshots of each tier and of a boost (reached with `drive.run`), looked at beside the "Visual bar"; the same address twice gives the same picture |
| **6e Camera** | `chase.ts`: because it follows the line of travel, a sliding car is already seen turned into the corner; add a swing of `camera.chase.swing` (0.12 rad) to the outside of the corner, eased over 0.3 s, and a field of view of `boostFieldOfView` (70) during a boost, eased over 0.25 s in and 0.5 s out | Unit tests in `chase.test.ts` |
| **6f Tuning panel** | T opens a panel of sliders for `car.engine`, `car.steer`, `car.grip`, `car.drift`, `car.boost` and `camera.chase`, with a button that copies the values as text for `config.ts`. The panel works on its own copy of the config. When a value changes it takes a snapshot, builds a new simulation with the new values and restores into it (about 60 ms). The body, mass, wheels and springs are not on the panel: a snapshot carries the old body | Browser test: moving the top-speed slider changes the speed the car reaches; the copied text holds the value; the shared `config` and every fingerprint are untouched |

### Step 7: surfaces and bumps

| Part | Build | Done when |
| --- | --- | --- |
| **7a Off the road** | New `car.surfaces: { road: 1, kerb: 1, grass: 0.6, sand: 0.6, rock: 0.6, snow: 0.6 }`: each surface's share of top speed. The car's share is the average over its wheels on the ground, so two wheels on a kerb or the grass cost little. It multiplies the top speed, boost included; the car comes down to it by rule 9 | Unit test of the average. On a grass test ground: top speed 18 m/s within 1% (the brief: about 40% slower); from 30 m/s on the road, under 19 m/s within 1.5 s of all four wheels reaching the grass; two wheels on grass, 24 m/s; a boost on grass, 23.4 m/s. On seed 7, a wheel on the beach reads sand and slows the same |
| **7b Walls** | The touch from 6c is kept in the simulation's state (in `hash` and the snapshot) and used on the next step. New `car.wall: { turn: 3, push: 1.5, again: 0.5 }`: while the body touches a wall or the gate, the turn rate asked for gains up to `turn` rad/s, in proportion to how squarely the nose points into the wall, turning it along the wall; and on a new hit (none in the last `again` seconds) the car is pushed off the wall at `push` m/s. **These two rules are untried**: Rapier already stops the car going through, with the body's own grip of 0.2, and the tests decide what more is needed | On `wallGround()` at top speed: a 30-degree hit leaves 21 m/s or more (70%) a second later, within 10 degrees of the wall's line, roof-up, not touching, and at no step through the wall; a 10-degree brush keeps 90%; head on, the car stops, rolls back at 1 to 2 m/s, stays roof-up and can reverse away. The sloping end of a wall met head on at 30 m/s does not launch the car (under 0.5 m of height gained, lands on its wheels); if it does, make the end's collider blunt in `wallColliders`: colliders are not part of the world fingerprint |
| **7c Trees and rocks** | Decided: the wheels do not feel rocks, the body does. No new rule unless a test needs one | A trunk met head on, and half a metre off centre, at 30 m/s: under 3 m/s a second later (head on), roof-up 0.95 or more throughout, never turning faster than 6 rad/s, never inside the trunk. A flat rock (0.3 m high) crossed at 18 m/s: roof-up 0.8 or more throughout, on its wheels and level 2 s later. A tall rock stops it like a tree |
| **7d Kerbs** | No new rule | The kerb's upright outer face crossed from the grass at 5, 20 and 45 degrees, at 18 and 30 m/s: under 3 degrees of heading and 3% of speed lost. A slide across a kerb carries on with its charge |

### Step 8: progress and respawn

| Part | Build | Done when |
| --- | --- | --- |
| **8a Place on the lap** | `src/sim/track/progress.ts`. The car's place: metres along the lap from the start line, and metres to the right of the centre line (`world.track.candidates[winnerIndex].line`, the arrays `startPose` reads). It is looked for within 40 m along the lap of the last place; only when the car is more than 30 m from the line there is the whole lap searched. **Checkpoints** every 100 m (the lap divided evenly into the nearest whole number of them): one is passed when the place goes forwards past it with the car within half the road's width plus 6 m of the centre line, and only the next one in order can be passed. Remembered, in `hash` and the snapshot: the place, the last checkpoint, how many have been passed | On seed 7 and on a folded seed with sections 40 m apart: a car moved round the centre line has a place that only rises, with every checkpoint passed in order; a car set down on the section next door is not mistaken for being there; a cut across the grass that misses a checkpoint does not pass the one after it; reversing over one does not count |
| **8b Respawn** | New `sim.respawn: { delay: 1, waterDepth: 0.5, edge: 20, flipped: { roofUp: 0.3, time: 1 }, stuck: { speed: 0.5, time: 3 } }`. A wait of `delay` (60 steps) starts when: the car's middle is 0.5 m or more under the sea (height 0); it is within 20 m of the tile's edge or 30 m under the sea; its roof-up has been under 0.3 for 1 s; or a pedal has been down for 3 s with the car slower than 0.5 m/s. During the wait the pedals and stick do nothing. Then the car stands at the last checkpoint passed (the start pose before any): on the centre line, facing along the lap, tipped with the road, at its ride height, still, with no drift, charge or boost (`poseAlong(world, cfg, metres)`, made from `startPose`). R, on the step it goes down, does the same with no wait | On real seeds with an opening onto the sea (7 and 9; find the place with a helper in `testing/checkSeeds.ts`): driven in, the car is at the last checkpoint, still, on four wheels and facing along the road, 60 steps after it went under. One test for each of the other triggers and for R. A car holding the brake at a standstill is never "stuck". A snapshot taken during the wait carries on exactly |
| **8c The page** | A short fade to white and back over the respawn; the readout shows the place on the lap | Browser test: `drive.run` into the sea and back to the checkpoint; no console errors |

Also answer in this step, from step 2's list: can the car drive back up a 40% hillside onto a mountain road (4e's table says whether it climbs 45% on the road's grip; grass takes 40% of its top speed, not its push), and does a long slide down one need a respawn (the "stuck" rule should cover it).

### Step 9: the bot and the corner proof

| Part | Build | Done when |
| --- | --- | --- |
| **9a A bot that laps** | `src/testing/botDriver.ts` (test code, never shipped). It steers at the point on the centre line 6 m plus half a second of travel ahead of its place (the stick is 2.5 times the sine of the angle to that point, held to full). It brakes for what is coming within 80 m: the speed a corner allows is the square root of 0.9 × `sideForce` × its radius | Seeds 1 to 20 in Node, one lap from the start line and one flying lap: every lap finished, **0 respawns**, 0 wall touches, four wheels on road or kerb for 98% of the lap. A table here: lap time, average speed, wall touches, seconds off the road |
| **9b Drifting where told** | The bot slides through corners that turn 45 degrees or more with a radius of 90 m or less (the generator's own drift corners): button and stick from 10 m before the corner, the stick then holding the centre line, release when 15 degrees of the corner are left | Three real corners each of hairpin, sweeper (70 to 110 m), chicane and plain corner, from seeds 1 to 20, the 3 km 15% seeds among them: from 40 m before the corner to 120 m after it, the pass with the slide is quicker than the best pass without, with four wheels on road or kerb and no wall touched. The lap with slides is quicker on all 20 seeds. A table here, by corner type: time and exit speed with and without. **This table is the evidence for the milestone's "drift-boost works through every corner type"** |
| **9c Same everywhere** | The inputs of the sliding lap on seeds 1 and 7, recorded in Node (`packInput`) and replayed through `window.seedCircuit` | One fingerprint in Node, Chromium and Firefox |

Then **check-in 2 with Tane**: the feel of the drift, with the tuning panel.

### Step 10

| Part | Build | Done when |
| --- | --- | --- |
| **10a Tuning** | Tane's numbers from check-in 2 into `config.ts` | Step 9's tables run again and still pass; new tables here |
| **10b Speed** | `npm run perf` with the chase view added to its views | 16.7 ms a frame or less on High at 1080p on the Arc graphics; a step under 1 ms on seed 8 (the most wooded) |
| **10c Docs and the pull request** | README, CLAUDE.md (controls, addresses, commands), this file, one pull request for the milestone | Tane's playtest sign-off, then merge |

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
| 2026-11-16 | **Steps 4d to 10 are planned in parts with their tests and numbers** ("Plan for steps 4d to 10"), and Milestones 4 to 6 have design notes | Tane: a different model builds everything after today, so the planning is done first. Approved by Tane with the plan |
| 2026-11-16 | **The drift hop is drawn, not simulated**: the body stays on its springs | Claude's call, approved with the plan. A real hop takes the wheels off the ground, and all grip with them, for a quarter of a second at the start of every drift |
| 2026-11-16 | **In a drift the car really is turned 24 degrees into the corner**, and the tyres grip along the line it travels, not the line it points | Claude's call, approved with the plan. The slide is then real for collisions and for the camera, and one rule (how fast the path turns) gives the handling |
| 2026-11-16 | **Drift turning is a turn rate**: 0.25 rad/s with the stick away from the corner to 1.5 with it in, circles of 120 m to 20 m at top speed. **Ordinary steering holds 15 m/s2 at most**: a 60 m circle at top speed | Claude's call, approved with the plan. The generator's drift corners are 20 to 90 m; corners it banks fully (70 m and wider) are flat out on grip alone, tighter ones need a slide or a lift |
| 2026-11-16 | **Above its top speed the car sheds 9 m/s2** (`engine.shed`, from step 6): the end of a boost and running onto grass are one rule | Claude's call, approved with the plan. At the coasting rate a boost would fade for three more seconds and the tiers would hardly differ |
| 2026-11-16 | **Reference pictures for the look are committed** in `docs/visual-bar/` | Claude's call, approved with the plan. `test-results/` is emptied by every run |
| 2026-11-16 | The decisions of Milestones 1 and 2 moved from this file to `docs/archive/DECISIONS-milestone-1-2.md` | This file was 41,000 tokens, and a session reads 25,000 in one go. Approved with the plan |

## Notes for later milestones

### Design notes for Milestones 4, 5 and 6 (written 2026-11-16)

Key decisions, traps and what to reuse, from the model that built Milestone 3's simulation. Not full plans: each milestone is still planned in plan mode when it starts, and Tane decides.

**Milestone 4, time trial**

- **The race clock is steps, never the wall clock.** A lap time is steps divided by 60, with the moment the car crosses the line placed inside its step by exact sums (how far before and after the line it was). A time is then the same on every computer, and a ghost's time can be checked by replaying it.
- **The race's rules are a pure state machine in `src/sim`** (countdown, racing, finished; laps; sector times), in `hash()` and the snapshot like the drift state. The page only draws it. The countdown is counted in steps too.
- **A lap counts only when every checkpoint was passed in order** (step 8a). Crossing the line alone is not a lap; that is what stops a cut across the grass from counting.
- **Sectors:** three, each a whole number of checkpoints.
- **Start boost:** the throttle first pressed in the last 0.25 s before "go" gives a tier 1 boost (`boostLeft` from step 6); a throttle held from earlier gives none. Decided by step counts, so a ghost replays it.
- **Flatten the start area first** (known issue: seed 42 starts on an 8% descent). It is a generator change, so every world fingerprint moves: do it before anything is saved by seed in Milestone 5.
- **Menus are HTML over the canvas**, as the title card is, not drawn in 3D. Pausing is simply not calling `step`. Pause when the tab is hidden; `advance` (step 5b) already drops a long frame.
- **Reuse:** checkpoints and `poseAlong` (step 8), `boostLeft` (step 6), `parseSeedInput` and `formatSeedCode` (`core/seedCode.ts`), the track's generated name, the readout card, `time=` for the player's pick of time of day.
- **Traps:** timing anything with `performance.now()`; taking steps or recording inputs while paused; a lap that counts after a short cut; a results screen that reads the wall clock.

**Milestone 5, ghosts and favourites**

- **A ghost is the inputs, one whole number a step** (`packInput`), from the first step of the countdown, saved with the seed, the generator version, a fingerprint of `config.car` and `config.sim` (the handling), and the run's last `hash()`. A 3-lap race is about 13,000 numbers.
- **Also save where the car was, ten times a second** (position and turn). The ghost is drawn from those, so no second physics world runs during a race. The inputs are the proof: replayed in a fresh simulation they must end on the saved fingerprint. That replay, after a page reload, is the milestone's "done when" test.
- **If the handling's fingerprint differs** (the game was tuned since), the ghost is still drawn from its saved places, marked as from an older version, and its time is not the one to beat.
- **Ghosts in IndexedDB** (the best per seed), **favourites in `localStorage`** (seed, version, name, best time, date). All storage is page code; `src/sim` never sees it.
- **Reuse:** `packInput` / `unpackInput` (`sim/input.ts`), `sim.hash()`, the pattern of `sim/script.ts` and `e2e/determinism.spec.ts` (step 9c already replays recorded inputs in every browser), `blendState` for drawing between saved places.
- **Traps:** a run made with the tuning panel open must not be saved; a snapshot is 7 to 9 MB and is not for ghosts; the reset button is part of the input record and must replay; a favourite saved under generator `v0` will not rebuild after the generator changes, so say so on screen until `v1`.

**Milestone 6, polish**

- **Bridges and tunnels are a generator change.** Every world fingerprint moves once more, and the generator becomes `v1` only after them (decision of 2026-11-11). The ground is one height at each point, so a bridge is the road's own mesh over lowered ground (the wheels already feel the road mesh, not the ground under it), and a tunnel is a cutting with a lid over it, drawn and collided as its own mesh. The earthworks rule (`gen/track/earthworks.ts`) rejects the turns that would need them today; that is where they come in.
- **Sound is made in code** with Web Audio (the engine's pitch from the speed, filtered noise for the screech and the boost). No files, so nothing more to download (pillar 4). A browser only lets sound start after a key or a click.
- **Effects only read the simulation's state.** Smoke, dust and motion lines never feed back into it, and are driven by its step count so that `still=1` pictures repeat.
- **Speed and size:** Rapier is 1.68 MB gzipped; the build that does not carry its WebAssembly as text saves about a quarter. "Racing within 10 seconds" should be measured on a slow connection. The frame numbers to hold are in the archive under "Step 15".
- **Traps:** an effect driven by the frame clock makes screenshots differ from run to run; a setting that changes anything in `src/sim` or `src/gen` breaks ghosts and seeds, so settings touch drawing and sound only.

### Earlier notes

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
- **2026-11-16 (Milestone 3):** Steps 4a, 4b and 4c done (see "Step 4"). 4a: test grounds, `createSimOn`, the wheel cast, pushes, surfaces. 4b: the car stands on four sprung wheels and stays put on any slope; gravity became one push a step. 4c: the engine, the brake and reverse (`speedChange` in `sim/car/drive.ts`); 95% of top speed in 3.98 s, 22.3 m to stop from top speed, 97.6% of top speed up the 15% climb. 1,949 unit tests pass. The browser suite had no clean run (hot laptop, page-load timeouts only; see "4c"): **run `npm run e2e` once the laptop is cool and note the result here.** Next: 4d, steering and cornering.
