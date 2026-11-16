# The plan: what to build, in order

Written 2026-11-16 by the model that built Milestones 1 and 2 and Milestone 3 up to step 4c, for the model that builds the rest. Tane approved it the same day. `docs/STATE.md` says where the project is; this file says what to do next and how to know it is done; `docs/GAME_BRIEF.md` is the design; `docs/VISUAL_BAR.md` is the look.

**How to use it:** find the first line without a tick in "The build order". Read that part's row further down. Follow "The routine for one part". Tick the line. Nothing here is built out of order: each part stands on the ones before it.

**How firm it is:** the order, the rules and the "done when" tests are the plan. The numbers are starting values in `src/config.ts`, to be tuned by feel at the check-ins; tests read the config, so they follow it. Where something here turns out wrong, say so to Tane, fix this file in the same commit as the code, and carry on.

## The build order

**Before anything else**

- [ ] **0. One clean run of `npm run e2e`.** 4c was committed without one (STATE.md, "4c"). Laptop awake, nothing else open, no dev server left running; ask Tane whether it has already been run by hand. Note the result in STATE.md's session log.

**Milestone 3: driving** (branch `milestone-3-driving`, issue #3)

- [x] Steps 0 to 3, and 4a, 4b, 4c
- [ ] **4d** Steering and cornering
- [ ] **4e** Stability and the whole car
- [ ] **5a** Input: keyboard and controller
- [ ] **5b** The fixed-step loop
- [ ] **5c** The car drawn
- [ ] **5d** Chase camera
- [ ] **5e** The page opens driving
- [ ] **Check-in 1 with Tane** (questions below). Add the car's reference pictures to `docs/VISUAL_BAR.md` once Tane likes the look
- [ ] **6a** The drift rules, pure
- [ ] **6b** Drift and boost in the car
- [ ] **6c** Hits cancel a drift
- [ ] **6d** Sparks, flame and hop
- [ ] **6e** Camera swing and wider view
- [ ] **6f** Tuning panel
- [ ] **7a** Off the road
- [ ] **7b** Walls
- [ ] **7c** Trees and rocks
- [ ] **7d** Kerbs
- [ ] **8a** Place on the lap and checkpoints
- [ ] **8b** Respawn
- [ ] **8c** Respawn on the page
- [ ] **9a** A bot that laps
- [ ] **9b** The bot drifts: the corner proof
- [ ] **9c** The same lap in every browser
- [ ] **Check-in 2 with Tane** (questions below)
- [ ] **10a** Tuning from check-in 2
- [ ] **10b** Speed, with the car
- [ ] **10c** README, CLAUDE.md, STATE.md, the pull request; **Tane's playtest sign-off**; merge and delete the branch

**Milestone 4: time trial** (new branch `milestone-4-time-trial` from `main`, issue #4; plan it in plan mode first)

- [ ] **M4.0** Plan approved; steps recorded in STATE.md
- [ ] **M4.1** Flatten the start area
- [ ] **M4.2** The race rules in the simulation
- [ ] **M4.3** The race on screen
- [ ] **M4.4** Screens and menus
- [ ] **M4.5** New track, typed seed, restart
- [ ] **M4.6** A whole race in the browser tests; check-in; tuning; pull request; **sign-off**; merge

**Milestone 5: ghosts and favourites** (branch `milestone-5-ghosts`, issue #5; plan first)

- [ ] **M5.0** Plan approved
- [ ] **M5.1** The run record and its replay
- [ ] **M5.2** Storage
- [ ] **M5.3** The ghost drawn
- [ ] **M5.4** Personal bests
- [ ] **M5.5** Favourites
- [ ] **M5.6** The reload test; pull request; **sign-off**; merge

**Milestone 6: polish** (branch `milestone-6-polish`, issue #6; plan first)

- [ ] **M6.0** Plan approved, with the order and the cut list agreed with Tane
- [ ] **M6.1** Bridges
- [ ] **M6.2** Tunnels
- [ ] **M6.3** The look issues Tane picks
- [ ] **M6.4** Sound
- [ ] **M6.5** Effects
- [ ] **M6.6** Settings
- [ ] **M6.7** Speed and size
- [ ] **M6.8** Generator `v1`
- [ ] **M6.9** The brief's version 1 table checked line by line; README; pull request; **sign-off**; merge; release

## The routine for one part

The same every time. A part is one ticked line above.

1. **Read** the part's row here, the code it names, and STATE.md's "Working agreements". At the start of a step (5, 6, 7 and so on) and of a milestone, write the plan in plan mode and wait for Tane's approval (CLAUDE.md). The plan can be short: this file is what it starts from.
2. **Write the tests** the row lists, in a test file beside the code (`steer.test.ts` for the pure sums, `steering.test.ts` for the car on a test ground, as `drive.test.ts` and `driving.test.ts` are).
3. **Run them and see them fail** for the right reason (the function is missing, or the car does not yet do it), not for a typo.
4. **Write the code**, the least that passes. Every number goes in `src/config.ts` with a comment saying what it is; every new config block gets its type (`SteerConfig` and so on, beside `EngineConfig`).
5. **Run everything**, from PowerShell: `npx vitest run --maxWorkers=6`, then `npm run typecheck`, then `npm run e2e` (about 25 minutes; laptop awake). Never chain a test run and a commit in one command.
6. **If anything drawn changed**, take the pictures and look at them beside `docs/VISUAL_BAR.md` ("How to check a visual change").
7. **Measure** what the row asks for with a throwaway `src/explore.tmp.test.ts` (run with `--silent=false` to see its output; delete it before committing) and put the numbers in STATE.md.
8. **Commit, push, record.** One commit for the part. Update STATE.md ("Where we are", the step's own section, the session log) and tick the line here, in the same commit. Then a short report to Tane in plain words: what changed, how to try it, what is next.

**Commit messages** follow the ones in `git log`: `M3 step 4d: ` then one plain sentence of what the car or the page now does, the files and functions, the config values, the tests, the measured numbers, the test counts, and `STATE.md: 4d done, 4e next`. **Never any Claude attribution**, on commits, pull requests or issues.

**Stop only at the end of a part.** Do not start the next part's edits while a long test run for the last one is still going.

## When something does not go to plan

| What happens | What to do |
| --- | --- |
| A "done when" number cannot be met | Tune the config first (the row's "if it goes wrong" says which lever). If it still cannot be met, stop and tell Tane what the best number was and what changing the test would give up. Never loosen a number quietly |
| A rule here is wrong or cannot work | Say so, propose the smallest change that keeps the rule's purpose, fix this file with the code |
| The browser suite fails on pages that "did not load in time" | It is the laptop, not the code, until shown otherwise: check Windows' event log for standby (Kernel-Power 506 and 507), run the failed tests again alone (`npx playwright test --project=chromium -g "part of the test name"`), and ask Tane to run the suite by hand. Say plainly in the commit what did and did not pass |
| A fingerprint differs between Node, Chromium and Firefox | Stop. Something in `src/sim` or `src/gen` is using inexact maths or the frame clock. Find it before building anything else: everything later rests on it |
| A test that passed yesterday fails today with no change near it | Use `git stash` to run it on the last commit. If it fails there too it is the machine or a flaky test: fix the test's wait, not its meaning |
| A new package would help | Ask Tane first, and pin its exact version (CLAUDE.md) |
| The work is bigger than the row suggests | Split the part (4d-1, 4d-2), record the split in this file, and still end each piece with passing tests and a commit |

**Whose call is it?** Claude's: names, how the code is laid out inside the planned folders, starting values, anything this file leaves open that Tane will not see or feel. Tane's: anything that departs from the brief, how the game feels (speed, steering, drift, camera), how it looks, what is cut, any change to a "done when", new packages, sign-offs. When a call is Claude's, make it, write it in STATE.md's "Decisions" with the reason, and say "Claude's call, for Tane to judge" in the report.

## What to ask Tane at each check-in

Bring the page running, a short list of seeds to try, and these questions. Write the answers into STATE.md's "Decisions" and turn them into config values.

**Check-in 1, after step 5** (the car drives, steers and reverses; no drift, hard walls, no respawn yet: say so first). Seeds to try: 7 (hilly), 1 and 3 (mountain, 15%), 42 (sloped start), 28496 (gorge), 2024 (rolling, wooded).

1. Is the speed right? Top speed is 30 m/s (108 km/h); it takes about 4 s to reach.
2. Is the steering right? A 60 m circle at top speed, 6 m at walking pace. Too heavy, too twitchy?
3. Does braking into reverse on one pedal feel right?
4. The camera: how far back (6.5 m), how high (2.4 m), how wide (60 degrees), how quickly it follows.
5. The car's look, against `docs/VISUAL_BAR.md`'s proposal. If yes, its pictures become references.
6. The walls (decided for Tane to judge on 2026-11-15 and 16): are they in the right places? Is 40% the right slope to keep one? Should beaches stay open? Only half the seeds with sea beside the road have an opening onto it: enough?
7. The controller: dead zone, triggers.

**Check-in 2, after step 9** (drift, boost, surfaces, respawn, with the tuning panel open and step 9's table to hand). Same seeds, plus the corners the table names.

1. Starting a drift: is 40% of top speed the right threshold? Is the hop right, drawn only?
2. The slide: the angle (24 degrees), how tight and how wide it can go (20 m to 120 m at top speed).
3. The tiers (1, 2 and 3 s) and the boosts (0.5, 1.0 and 1.6 s at 1.3 times top speed): worth the risk? Too strong?
4. Is drifting the fastest way through each kind of corner when driving by hand, as the table says it is for the bot?
5. Walls: does a glancing hit feel gentle enough? Does a head-on one feel fair?
6. Grass and sand (40% slower): does cutting a corner ever pay?
7. Respawn: is 1 s right? Does it put the car somewhere sensible every time?
8. Anything that made the car flip, stick or fall through.

**At each milestone's sign-off:** the brief's "done when" for that milestone, shown working; what was left out and why; the known issues that milestone added.

**Questions only Tane can answer, with the step that needs the answer:**

| Question | Needed by |
| --- | --- |
| How many laps does a ghost cover: the best single lap, or the whole 3-lap race? (This plan assumes the whole race) | M5.0 |
| May a favourite saved before the generator is `v1` stop rebuilding when the generator changes? (This plan assumes yes, with a note on screen) | M5.0 |
| What is cut from Milestone 6 if it runs long, and in what order are its steps wanted? | M6.0 |
| Where is version 1 hosted, and under which name ("Seed Circuit" is a working title)? | M6.9 |

## Milestone 3: steps 4d to 10

Written by the model that built steps 0 to 4c, on its last day, and approved by Tane the same day. It splits every step still to do into parts, each with the tests and numbers that prove it is done. **Every number is a starting value in `src/config.ts`, to be tuned by feel at the check-ins; the tests read the config, so they follow it.** The reasons are given so that a number can be changed with its consequences in view.

Each part ends with: its tests seen failing and then passing, `npm test`, `npm run typecheck`, `npm run e2e`, a commit, a push, and this file saying what is next. Each step is still planned in plan mode when it starts (CLAUDE.md); this section is what that plan starts from.

### Rules that hold for every part

- **`src/sim` uses exact maths only**: `+ - * /`, `Math.sqrt`, and `dsin` / `dcos` from `src/core/dmath.ts`. The architecture test enforces it. `src/camera`, `src/render`, `src/input` and `src/app` may use anything.
- **Anything the simulation remembers from one step to the next goes into `hash()`, `snapshot()` and `restore()`**, with a test that a restored run carries on exactly. Up to step 5 it remembers nothing of its own. The drift state (step 6), the wall touch (7b) and the progress (8) are the first.
- **Times in the config are seconds; the code turns each into whole steps once** (`Math.round(seconds * stepsPerSecond)`) and counts steps. Never add up fractions of a second.
- **Look Rapier's function names up** in `node_modules/@dimforge/rapier3d-deterministic-compat/dist/**/*.d.ts`. This is version 0.21; do not trust memory. Only `src/sim/physics` may import it, so anything new the car needs from the engine (a contact, setting the body's place) becomes a function on `CarPhysics` in `carBody.ts`.
- **What the exact-maths rule covers**: `src/core`, `src/gen` and `src/sim`, but not their `.test.ts` files and not `src/testing` (`src/architecture.test.ts`). Test code may use `Math.sin`; it rarely needs to, because a direction can be built from a cross product.
- **Where tests go**: pure sums beside their file (`steer.test.ts`), the car on a test ground in one file per part (`steering.test.ts`, as `driving.test.ts` is for 4c), real seeds in the same file or `src/gen/…` style seed tests. Browser tests in `e2e/`. Shared test helpers (the `hold` function at the top of `driving.test.ts`, a line-following driver) move into `src/testing/` the second time they are needed.
- **Prove a rule on a test ground first** (`src/testing/testGrounds.ts`: the ground is exactly known), then on real seeds.
- **Directions.** The car's front is -z, its right +x, its roof +y. In `car.ts`, `across` (`cross(along, normal)`) points to the car's right. A positive `steer` is to the right. A positive turn rate about the car's `up` is to the left (anticlockwise seen from above), so steering right asks for a negative one.
- **If a test's number cannot be met, tune the config; if it still cannot, report to Tane.** Do not loosen a number quietly.
- **The browser suite takes about 25 minutes. Keep the laptop awake for it.** A page that "did not load in time" is standby or a slow spell, not the code: check Windows' event log (Kernel-Power 506 and 507) and run the failed tests again alone before debugging (see "4c").

### Step 4: the two parts left

| Part | Build | Rule and starting values | Done when |
| --- | --- | --- | --- |
| **4d Steering and cornering** | `car/steer.ts`: `turnWanted(steer, speed, car)`. `car.ts` gives it to `turnGrip` in place of the 0 it gives now | `car.steer: { minRadius: 6, sideForce: 15 }`. The turn rate asked for is `steer` times the smaller of speed / `minRadius` and `sideForce` / speed, and it changes sign with the speed, so a reversing car steers as a real one does. That is a 6 m circle up to 9.5 m/s, 15 m at 15 m/s and 60 m at 30 m/s; the fastest turning is 1.58 rad/s at 9.5 m/s. `sideForce` is under `grip.side` (22), so the car never slides in ordinary steering | Pure tests: those values; half stick gives half the rate; left mirrors right exactly; nothing at a standstill; reversed when rolling backwards. On the flat: circles at throttle 0.25, 0.5 and 1 have radius 6, 15 and 60 m within 5% (worked out from speed / turn rate, and the middle of the circle stays put within 5% of the radius for a whole lap); left and right within 1% of each other; speed within 2% of the straight-line speed for that throttle; four wheels down; roof up. One step after the stick moves, at 15 m/s, the turn rate is over 0.4 rad/s (the brief: instant). Half stick at top speed: 120 m. Reversing with the stick right: the car backs to its right and its nose swings left. Two laps of the banked ring (70 m, 8 degrees) at top speed, steered by a simple test driver: within 1 m of its middle line, 29 m/s or more, wheels down (it needs 12.9 of the 15 m/s2). The kerb crossed at 5 and 15 degrees, at 18 and 30 m/s, up its ramp and off its upright face: heading changed by under 3 degrees afterwards, no wheel in the air for over 0.2 s, under 3% of the speed lost. Every earlier test still passes |
| **4e Stability and the whole car** | `car/stability.ts`; the scripted run looked at now that it drives; the measured table | `car.stability: { upright: 12, calm: 3 }`. With no wheel on the ground: a turn towards roof-up of 12 rad/s2 for each unit of tilt (the sine of the angle between the car's up and straight up), and its roll and pitch damped by 3 a second; yaw is left alone. With wheels down, nothing new: drive, brake and grip already act through the body's middle, so they cannot roll it. Levers if a test fails, in this order: a bump stop (the spring twice as stiff over its last 4 cm before the underside meets the ground); then an extra pull down while only some wheels touch | Four wheels touching on every step over the 200 m crest at top speed (it needs 4.5 of gravity's 9.81 m/s2; at boost speed, 7.6). Onto the 45% hillside at 20 degrees, along it for 3 s and off again: never tipped more than 8 degrees beyond the slope's own 24, never under three wheels down for over 0.3 s. Off the 1 m drop at 10 and at 30 m/s: roof-up 0.95 or more at touchdown, level a second later, under 10% of forward speed lost, within 0.5 m of its line 2 s on. Started 3 m up, rolled 60 degrees and pitched 30: lands on its wheels (roof-up 0.9 or more). The scripted run on seeds 42 and 7 stays roof-up (0.7 or more) and gives one fingerprint in Node, Chromium and Firefox (`e2e/determinism.spec.ts`, as now). A table under "Step 4": top speed, time to 95% of it, braking distance, the three circles, speed up the 15% climb, whether it climbs the 45% hillside from rest and how fast, the cost of a step on seeds 7 and 8 |

#### 4d in detail

```
// src/sim/car/steer.ts
// The turn rate the stick asks for, in radians per second; positive is to the left (see "Directions").
turnWanted(steer, speed, car):          // steer from -1 (left) to 1 (right); speed along the car, negative backwards
  size = abs(speed)
  if size == 0: return 0
  rate = min(size / car.steer.minRadius, car.steer.sideForce / size)
  return -steer * sign(speed) * rate
```

- In `car.ts` the last two lines of `step` become `turnGrip(dot(motion.spin, up), turnWanted(pedals.steer, dot(motion.velocity, along), car), share, car, dt)`. `inputFractions` already gives `steer`. Nothing else in `car.ts` changes.
- Config: `SteerConfig { minRadius: number; sideForce: number }` beside `EngineConfig`, and `steer: SteerConfig` in `CarConfig`, with a comment that `sideForce` must stay under `grip.side`.
- **The test driver for the banked ring** (`src/testing/lineDriver.ts`, which 9a's bot grows from): it aims at a point a set distance ahead on a line. On the map the car faces `f = (fx, fz)` (its nose, flattened and made one long), the point is `d = (dx, dz)` from the car, and its right is `(-fz, fx)`. Then `stick = clamp(2.5 * (-fz * dx + fx * dz) / |d|, -1, 1)`: the sine of the angle to the point, with no trigonometry. For the ring, the point is on the middle circle 15 m ahead.
- **Kerb crossings at an angle**: start the car with `poseOn(ground, x, z, forward, cfg)`, `forward` made from a cross product or written out (5 degrees is `(0.0872, -0.9962)`).

#### 4e in detail

```
// src/sim/car/stability.ts: only on a step with no wheel on the ground
uprightChange(up, spin, car, dt):        // the change of spin for one step
  lean = cross(up, WORLD_UP)             // one long times the sine of the tilt, about the axis that brings the roof back up
  tumble = spin - up * dot(spin, up)     // the spin apart from yaw, which is left alone
  return (lean * car.stability.upright - tumble * car.stability.calm) * dt
```

- **Applying a change of spin**: the body is a box, so its inertia is simple along its own axes: `mass * (a² + b²) / 3`, with `a` and `b` the two half-sizes across that axis (about its right axis: half height and half length; about its forward axis: half width and half height; about its up axis: half width and half length, the `turnInertia` `car.ts` already uses). Add `spinBy(change)` to `car.ts`: split `change` along the body's right, up and forward axes, multiply each part by that axis's inertia, put them back together, and `physics.twist` the result. Use it for the yaw twist too.
- Config: `StabilityConfig { upright: number; calm: number }`, `stability` in `CarConfig`.

#### If step 4 goes wrong

| Symptom | First thing to try |
| --- | --- |
| Circles too wide at low speed | The turn grip (`grip.turn`, 30) cannot reach the rate in time: raise it |
| The car leans or lifts a wheel in a fast corner | Check every new push goes through the body's middle. Then raise `suspension.damping` |
| A wheel meeting the kerb's upright face pushes the car sideways | The cast's slope there is nearly level. Count a wheel as touching only where its slope is within about 45 degrees of the car's up (`dot(normal, up) > 0.7`); otherwise it is in the air |
| The car drives up slopes no car should (4e measures it on the 45% hillside) | Nothing limits the engine's push by grip today. Add `grip.drive`: the push along the car held to that many m/s² times how hard the wheels press on the ground |
| Jitter or a slow wobble when parked on a slope after 4d | The steering asks for 0 at a standstill, so this is the turn grip: check `turnWanted` returns exactly 0 at speed 0 |
| The scripted run's fingerprint differs between browsers | A sum in `steer.ts` or `stability.ts` uses something inexact; the architecture test should have caught it, so check it is not imported from outside `src/sim` |

### Step 5: drive it

Nothing in `src/sim` changes in this step.

| Part | Build | Done when |
| --- | --- | --- |
| **5a Input** | `src/input/keyboard.ts`: `keysToInput(held)`. `src/input/gamepad.ts`: `padToInput(axes, buttons, cfg)` for the standard mapping only (right trigger, button 7, throttle; left trigger, 6, brake; left stick, axis 0, steering; right bumper, 5, drift; Back, 8, reset; Y, 3, camera and Start, 9, pause are for the page, not the record). `mergeInputs(a, b)`: the larger of each pedal, the steering further from the middle, either button. New `input: { deadZone: 0.15 }`: a stick inside it reads 0, and the rest is stretched to reach 1. **No smoothing anywhere** (the brief) | Unit tests: every key in the brief's table; left and right together give 0; Space and Shift both drift; a stick at 0.15 gives 0, at 0.575 gives a half, at 1 gives 1, and left mirrors right; a trigger at 0.5 gives 128 of 255; `mergeInputs` |
| **5b The loop** | `src/app/drive.ts`: `advance(carried, frameSeconds)` gives how many steps to take (5 at most, the rest dropped) and the blend between the last two states; `blendState(before, after, blend)` (positions straight, turns the short way round). Rapier (`loadRapier`) is fetched beside world generation and the simulation made when both are in. A new island frees the old simulation (`sim.free()`); a Rapier world is not freed by itself | Unit tests: 1,000 frames at 144 a second give 60 steps a second within 1; one frame of a whole second (the tab was hidden) gives 5 steps and carries nothing over; the blend is at least 0 and under 1; a blend of 0 and of 1 give the two states exactly |
| **5c The car drawn** | `src/render/carShape.ts` (plain numbers, unit tested, the pattern of `treeShapes.ts`) and `src/render/carView.ts` (the Three.js wrapper). A low-poly kart built in code: see `docs/VISUAL_BAR.md`. Each wheel is drawn where the simulation says it is (`CarState.wheels[i].at`), so the springs show; the front wheels turn with the stick; the car casts a shadow | Unit tests: the shape lies inside the body's box (1.4 by 0.6 by 2.2 m) apart from the wheels; the wheels sit at `wheelMounts`; under 600 triangles. Screenshots on seeds 1, 3, 7 and 42 looked at beside the pictures of `docs/VISUAL_BAR.md` |
| **5d Chase camera** | `src/camera/chase.ts` as plain numbers, like `flyAlong.ts`. New `camera.chase: { back: 6.5, height: 2.4, lookAhead: 5, lookHeight: 1, follow: 0.15, clearance: 0.8, fieldOfView: 60 }` (the other cameras keep 50). It stands `back` metres behind the car along **the way the car is travelling on the map** (its velocity above 2 m/s, its nose below), `height` up, and looks at a point `lookAhead` in front and `lookHeight` up. Its direction eases to the car's with a time of `follow` seconds, by the frame's own length, so it is the same at any frame rate. It never comes within `clearance` of the ground (`sampleField` on `world.ground`, the idea in `flyAlong.ts`) | Unit tests: 6.5 m behind and 2.4 m up on the flat; after the car turns a quarter circle the camera is within 5 degrees of behind it in 0.5 s; the same place within 1 cm after 2 s at 30, 60 and 144 frames a second; never within 0.8 m of the ground on seed 28496 (the start gate in a gorge) |
| **5e The page** | `worldPage.ts` stays the wiring. The page opens driving. C goes round chase, flying, circling. In the chase view W, S, A, D, the arrows, Space, Shift and R drive; in the flying view Space and the arrows keep their old use. `cam=fly`, `cam=orbit`, `look=`, `at=` and `lap=` open their old views with the simulation not running, so old screenshot addresses give the same pictures as before. `still=1` holds the simulation too. A readout card: speed in km/h and the surface. `window.seedCircuit.drive`: `state()` and `run(steps, input)`, so a browser test steps the simulation itself instead of waiting in real time. Existing tests that assumed the page opens flying get `cam=fly` in their address; so does `e2e/perf.spec.ts` | Browser tests, Chromium and Firefox: the car is on the start line on four wheels (within 0.5 m of `startPose`); W held moves it; `run(300, { throttle: 1 })` leaves it over 20 m/s further down the road; C switches the camera and the hint; each old address still opens its old view; no console errors; the 3-second budget tests still pass. New screenshots `world-<seed>-drive-start.png` and `-drive-5s.png` (after `run(300, …)`), looked at on seeds 1, 3, 7 and 42 |

#### 5e in detail: the page

**Do it in two commits.** First, with the page unchanged: add `cam=fly` to every `openWorld(page, '…')` address in `e2e/world.spec.ts` that has no `cam=`, `look=` or `at=` (about 40 of them; `grep -n "openWorld(page, '" e2e/world.spec.ts`), to the plain-address test's expectations, and to the `fly` views in `e2e/perf.spec.ts`; teach the page that `cam=fly` means flying (today it is simply the default); run the suite; commit. Then change the default to driving, with the suite still passing. That way a failure in the second commit is about driving, not about old tests.

| The page's view | Opened by | Simulation | Keys |
| --- | --- | --- | --- |
| **Driving** (chase camera) | the plain address, `cam=chase` | runs | W or Up: throttle. S or Down: brake and reverse. A, D, Left, Right: steer. Space or Shift: drift. R: reset. C: next view. N: new island. Q: quality. L: lab. F: frame times. T: tuning panel (6f) |
| **Flying** | `cam=fly`, or `lap=` | built, not stepped | as today: Space pauses, Up and Down change speed. C: next view |
| **Circling** | `cam=orbit` | built, not stepped | as today. C: next view |
| **A close view** | `look=` or `at=` | built, not stepped | as today |

- C goes driving, flying, circling, driving. Coming back to driving carries on from where the car was.
- **Keys go to the car only when no text box, slider or button has the focus.** The time slider keeps its own arrow keys (decision of 2026-11-14) and the seed box its typing. Keys held when the window loses focus count as let go.
- `still=1` holds the simulation as well as the waves: no steps are taken, so the car stands at its start and pictures repeat.
- The hint text on the title card says the keys of the view in use.
- The readout is a card in a bottom corner (`docs/VISUAL_BAR.md`): speed in km/h (`Math.round(speed * 3.6)`) and the surface under most wheels. Step 6 adds the drift tier and the boost.
- New body attributes, as the page has for the camera: `data-world-camera="chase"` while driving, and `data-drive-step` (the step count) so a test can wait for steps.

**`window.seedCircuit.drive`** (set on the page when a world is shown, for browser tests and for Tane's console):

```
drive.state(): CarState | null        // the simulation's state, or null before it is built
drive.run(steps, raw?): CarState      // takes that many steps with that input (a RawInput, nothing pressed if left out), at once, then draws one frame
drive.reset(): void                   // the car back to its start pose, as a new simulation
drive.hash(): string                  // the simulation's fingerprint
```

While a test is calling `run`, the page's own loop must not also step: `run` pauses the loop's stepping until the next frame (or the test opens with `still=1`).

**Building the simulation on the page**: `import('../sim/physics/rapier')` is fetched at the same time as the world is asked of the worker (as `main.ts` does for `simHashFor`), then `createSim(rapier, world, config)`. A new island calls `sim.free()` on the old one first. The 3-second budget test measures the world, not Rapier, but check that fetching Rapier beside it does not slow the world down.

#### If step 5 goes wrong

| Symptom | First thing to try |
| --- | --- |
| The car stutters at 144 frames a second | The drawing is not blending between the last two states (`blendState`), or the camera follows the raw state |
| The camera shakes in a corner | It is following the car's nose, which the springs rock; follow the velocity on the map, as planned |
| The camera goes into a bank or under the gate's beam | Clearance is from the ground only; the gate's beam is 6 m up, the camera 2.4 m, so it should not meet it. Check `clearance` uses `world.ground`, the fitted ground |
| A browser test of driving takes minutes | It is waiting in real time. Use `drive.run` |
| A controller does nothing in Firefox | Firefox shows a pad only after a button is pressed on it; the page should say "press a button on the controller" |

Then **check-in 1 with Tane**: speed, steering, camera, where the walls are. By then the car steers but does not drift, the walls are hard (step 7 softens them) and nothing brings the car back from the sea (step 8); say so.

### Step 6: drift and boost, the exact rules

**What the car remembers** (`DriftState`, all of it in `hash()` and the snapshot): `phase` (none, hop or slide), `dir` (-1 left, 1 right, 0 none; kept after a slide ends until `slide` is back to 0, because the nose swings back that way), `charge` (steps spent sliding), `hopLeft` (steps of hop still to draw), `slide` (from 0 to 1: how far the nose has swung in), `boostLeft` (steps), `boostTier` (0 to 3, for the flame), `held` (whether the button was down on the last step).

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
  turnGrip: 240,                       // rad/s2: 4 rad/s in one step
  tiers: [1, 2, 3],                    // seconds (brief)
  boosts: [0.5, 1.0, 1.6],             // seconds (brief)
  brakeCancel: 0.5,                    // share of the brake pedal
}
car.boost: { speed: 1.3, accel: 30 }   // times top speed; m/s2
car.engine.shed: 9                     // m/s2
```

New types in `src/config.ts`: `DriftConfig` and `BoostConfig`, with `drift` and `boost` in `CarConfig`; `shed` joins `EngineConfig`. The two `[1, 2, 3]` lists are tuples of three.

**The rules:**

1. **Start.** On the step the drift button goes from up to down, with the car going forwards at 12 m/s or more and two or more wheels on the ground, the hop begins: 9 steps, drawn only. If the stick is 0.3 or more to one side on that step, the slide starts at once to that side. If it is not, the slide starts on the first of the hop's 9 steps on which the stick reaches 0.3 with the button still down. If the hop ends first, nothing more happens until the button is let go and pressed again.
2. **The direction is locked.** `dir` never changes during a slide, whatever the stick does.
3. **The slide.** `slide` rises evenly from 0 to 1 over `swing` (15 steps). The nose points `angle * slide` into the corner from the line the car travels along. That line is `travel = along * dcos(b) - across * dir * dsin(b)` with `b = angle * slide`, **taking `slide` as it was before this step changed it** (see "The car's step, line by line"). While `slide` is above 0 the tyres take off the speed across `travel`, up to `drift.grip`, and the engine and the brake act along `travel`, on the speed along it. (With `slide` at 0 this is exactly step 4's car.)
4. **Steering sets how tight, not which way.** The path turns towards `dir` at `wide` with the stick fully away from the corner, `tight` with it fully into the corner, and evenly between: 0.875 rad/s with the stick in the middle. At top speed those are circles of 120 m, 20 m and 34 m; slower, they are tighter. The body's turn rate asked for is the path's plus the rate the nose is swinging, held with `drift.turnGrip` in place of `grip.turn`.
5. **Charge.** `charge` goes up by one on every step of the slide. Tier 1 (blue) from 60, tier 2 (orange) from 120, tier 3 (purple) from 180.
6. **Release.** When the button comes up during a slide: a boost of 30, 60 or 96 steps for tiers 1, 2 and 3, and none below tier 1. If a boost is still running, the longer of the two is kept, with its tier. `charge` goes to 0, `phase` to none, and `slide` falls evenly to 0 over `recover` (12 steps): the nose swings back out while the car carries on along `travel`, which ordinary steering now turns.
7. **Cancel**, with no boost and the charge lost (`slide` falls as in 6): the body touches a wall, the gate, a tree or a rock (6c); the brake is half down or more; the speed along `travel` falls under 9 m/s; a respawn (step 8). **Not** cancelled by: leaving the ground, kerbs, grass, letting go of the throttle.
8. **Boost.** While `boostLeft` is above 0 it falls by one a step, on the ground or in the air. For those steps the top speed is 1.3 times what it would be (39 m/s on the road), the throttle counts as fully down, and the engine's push is `boost.accel` with no easing, never taking the car past that top speed. The brake still brakes.
9. **After a boost.** A car faster than its top speed, with no boost running, slows by `engine.shed` (or by the brake, if that is harder) and no further than to its top speed. This replaces what 4c does above top speed, and 4c's two tests of that ("holds the car back above top speed…" in `drive.test.ts`) change with it. Below top speed nothing changes: half throttle at 20 m/s still eases off gently. Step 7 uses the same rule when the car runs onto grass.

**Why these numbers.** The generator scores a corner as a drift corner when its radius is 20 to 90 m (`track.score.driftMinRadius`, `driftMaxRadius`), and a hairpin's widest line on a 12 m road is about 25 m: so a slide must turn as tightly as 20 m at top speed and as widely as 120 m. Ordinary steering turns no tighter than 60 m at top speed, so every corner the generator banks fully (70 m and wider) is flat out on grip alone and anything tighter needs a slide or a lift: that is what makes drifting the fastest way through a corner (pillar 2). Turning takes a little speed off by itself, because the tyres take off the sideways part of the car's speed on every step: 0.06 m/s at 0.5 rad/s, 0.5 m/s in the tightest slide. With `shed` at 9, a boost is worth about 8, 12 and 18 m of road for the three tiers (a quarter to six tenths of a second); at the coasting rate it would fade for three more seconds and the tiers would hardly differ. The drift grip of 60 m/s² holds the tightest slide (45 m/s² at 30 m/s) and just holds it at boost speed (58.5 m/s² at 39 m/s).

#### The car's step, line by line (6b)

This is `createCar(...).step(input)` in `car.ts` once step 6 is in. Steps 7 and 8 add the lines marked. **The order matters**: the line of travel is worked out from the slide as it was before this step changes it, and the swing goes into the turn asked for, so that as a slide starts the body turns first and the line of travel follows a step later, without the path ever turning away from the corner.

```
 1  pedals = inputFractions(input); motion = physics.motion(); wheels = feel(motion)
 2  springs: as now (one push per grounded wheel, at the wheel)
 3  old = drift                                    // the drift state as the last step left it
 4  if no wheel is down:
      spinBy(uprightChange(...))                   // 4e
      drift = stepDrift(old, asked with grounded = false, cfg); return
 5  normal, along, across as now; coming = velocity with this step's gravity added
 6  b = angle * old.slide;  s = old.dir
    travel = along * dcos(b) - across * s * dsin(b)        // the line the car travels along
    side = cross(travel, normal)
 7  drift = stepDrift(old, asked, cfg)            // asked: button, stick, brake, dot(velocity, travel), wheels down, hit (6c)
 8  top = engine.topSpeed * surfaceShare(wheels)  // surfaceShare is 1 until 7a
    if drift.boostLeft > 0: top = top * boost.speed
 9  sideways: push(side * mass * within(-dot(coming, side), (old.slide > 0 ? drift.grip : grip.side) * dt * share))
10  along the line: push(travel * mass * speedChange(dot(velocity, travel), pull along travel, pedals', share, top, boosting, car, dt))
      // pedals' has throttle 1 while boosting; speedChange takes `top` in place of car.engine.topSpeed, and
      // above `top` it gives -shed (or the brake, if harder) whatever the pedals (rule 9)
11  swing = (drift.slide - old.slide) * angle * stepsPerSecond      // how fast the nose swings, radians per second
    path = drift.phase == slide ? -drift.dir * pathTurn(drift, pedals.steer)
                                : turnWanted(pedals.steer, dot(velocity, travel), car)
    d = drift.dir != 0 ? drift.dir : old.dir      // the side of the slide, on its first and last steps too
    wanted = path - d * swing                     // into the corner is -d (see "Directions")
    hold = (drift.phase == slide or drift.slide > 0 or old.slide > 0) ? drift.turnGrip : grip.turn
    spinBy(up * within(wanted - dot(motion.spin, up), hold * dt * share))   // turnGrip, given its limit as an argument from now on
12  [7b] the wall's turn and push, from the touch the last physics step left
13  [8b] the respawn wait, flips and stuck counts are updated in sim.step, not here
```

- **`stepDrift` gets the hit from the last physics step.** `sim.step` reads `physics.touching()` right after `physics.step()` and keeps it in the simulation's own state (in `hash` and the snapshot), so a restore does not depend on whether Rapier's snapshot carries its contacts. The car uses it on the next step.
- **What is remembered moves into one place**: `Car` gains `save(): CarMemory` and `load(memory)`, with `CarMemory` holding the drift state now, and the wall touch (7b) later. `Sim.hash()` adds its numbers in a fixed order; `SimSnapshot` gains `car: CarMemory` (plain numbers).
- **The turn grip in a slide must reach the swing in one step.** As a slide starts, the body is asked for the path's turn plus the swing, up to 1.5 + 1.68 = 3.2 rad/s, from whatever it was turning at. `drift.turnGrip` 240 rad/s² gives 4 rad/s in a step. Lower it and the "never turns away from the corner" test fails first.
- **The 4c tests that change with rule 9**: the one titled "holds the car back above top speed, as gently as it eased off, and never harder than coasting" becomes "slows by `engine.shed` above top speed, whatever the pedals"; the 12-second run on the flat ("never goes over it") is unchanged.

#### If step 6 goes wrong

| Symptom | First thing to try |
| --- | --- |
| The car swings wide as a slide starts | The order above: line 6 must use `old.slide`. Then `drift.turnGrip` |
| The slide circles are too wide | The drift grip is the limit (45 m/s² at 30 m/s and 1.5 rad/s); raise `drift.grip` |
| The car spins out of a slide when it ends | The turn grip drops from 240 to 30 while the nose is still swinging back: use `drift.turnGrip` until `slide` is 0 (line 11 does) |
| A boost lasts too long or too short on screen | Count steps, not seconds; `boosts` turns into steps once, with `Math.round` |
| Two runs from a mid-slide snapshot differ | Something in `CarMemory` is missing from the snapshot or the fingerprint; the test that changes only the drift state finds which |
| The tiers are hard to reach on short corners | Expected: tier 1 needs a second of sliding (about 30 m of road). It is for Tane to judge at check-in 2, with `tiers` on the tuning panel |

| Part | Build | Done when |
| --- | --- | --- |
| **6a The rules** | `car/drift.ts`: `DriftState`, `NO_DRIFT`, `stepDrift(state, asked, cfg)`, a pure function from the state, what is asked (button, stick, brake, speed along `travel`, wheels down, hit) and the config to the next state; `tierOf(charge)`; `pathTurn(state, steer)` | One unit test for each rule, on the exact step: starts at 12.0 m/s and not at 11.9; not without the stick; the stick arriving on the hop's ninth step starts it and on the tenth does not; not while reversing; a stick thrown the other way mid-slide changes nothing; `pathTurn` is 0.25, 0.875 and 1.5 towards `dir`; tiers on steps 60, 120 and 180 exactly; boosts of 30, 60 and 96 steps; none at 59; the longer boost is kept; each cancel loses the charge; the brake at 0.49 does not cancel; nothing restarts while the button stays down |
| **6b In the car** | `car.ts` uses `travel`, the path's turn rate, the drift grip, the boost and the shed; `speedChange` is given the top speed for the step; `Car` gains `save()` and `load()`; `Sim` puts the drift state in `hash`, `snapshot` and `restore`; `CarState.drift` for drawing (phase, dir, tier, slide angle, hop from 0 to 1, boost left and tier) | On the flat at top speed, sliding right and left: circles of 20, 34 and 120 m within 5%; the nose 24 degrees inside the line of travel within 1 degree once swung in; as a slide starts the path never turns away from the corner by more than 1 degree (this is what `turnGrip` and the order of the sums below are for); 97% of top speed or more in the tightest slide. After a 2.1 s slide and release: over 30 m/s on the next step, 39 m/s within 0.4 s, held within 1% to the boost's last step, back under 30.1 m/s within 1.2 s more, never over 39. The top speed is raised on exactly 30, 60 and 96 steps. A snapshot taken mid-slide and one taken mid-boost carry on exactly; two simulations that differ only in drift state have different fingerprints. The scripted run already dabs the drift button, so `e2e/determinism.spec.ts` proves one fingerprint in Node, Chromium and Firefox |
| **6c Hits cancel** | `carBody.ts`: `touching()`, from `world.contactPairsWith` and `world.contactPair` (a manifold with `numContacts()` above 0, its `normal()`), names the solid thing the body is against (wall, gate, tree or rock, by `WorldColliders`) or null; the ground, road and kerbs do not count. `PlainCourse` gains optional walls, posts and balls; new `wallGround()` in `testGrounds.ts` | Sliding into the wall at 20 degrees ends the slide with no boost and `charge` 0; landing hard on the body's underside (the 1 m drop, mid-slide) does not |
| **6d Sparks, flame and hop** | `carView.ts`: the hop drawn from `hopLeft` (an arc 8 cm high); sparks at both rear wheels while sliding from tier 1, in the tier's colour; a flame behind the car while a boost runs, longer for a higher tier. Colours in a new `render.car`. Everything is drawn from the simulation's state and its step count, never the frame clock, so `still=1` repeats. Readout: tier and boost left | Screenshots of each tier and of a boost (reached with `drive.run`), looked at beside `docs/VISUAL_BAR.md`; the same address twice gives the same picture |
| **6e Camera** | `chase.ts`: because it follows the line of travel, a sliding car is already seen turned into the corner; add a swing of `camera.chase.swing` (0.12 rad) to the outside of the corner, eased over 0.3 s, and a field of view of `boostFieldOfView` (70) during a boost, eased over 0.25 s in and 0.5 s out | Unit tests in `chase.test.ts` |
| **6f Tuning panel** | T opens a panel of sliders for `car.engine`, `car.steer`, `car.grip`, `car.drift`, `car.boost` and `camera.chase`, with a button that copies the values as text for `config.ts`. The panel works on its own copy of the config. When a value changes it takes a snapshot, builds a new simulation with the new values and restores into it (about 60 ms). The body, mass, wheels and springs are not on the panel: a snapshot carries the old body | Browser test: moving the top-speed slider changes the speed the car reaches; the copied text holds the value; the shared `config` and every fingerprint are untouched |

### Step 7: surfaces and bumps

| Part | Build | Done when |
| --- | --- | --- |
| **7a Off the road** | New `car.surfaces: { road: 1, kerb: 1, grass: 0.6, sand: 0.6, rock: 0.6, snow: 0.6 }`: each surface's share of top speed. The car's share is the average over its wheels on the ground, so two wheels on a kerb or the grass cost little. It multiplies the top speed, boost included; the car comes down to it by rule 9 | Unit test of the average. On a grass test ground: top speed 18 m/s within 1% (the brief: about 40% slower); from 30 m/s on the road, under 19 m/s within 1.5 s of all four wheels reaching the grass; two wheels on grass, 24 m/s; a boost on grass, 23.4 m/s. On seed 7, a wheel on the beach reads sand and slows the same |
| **7b Walls** | The touch from 6c is kept in the simulation's state (in `hash` and the snapshot) and used on the next step. New `car.bump: { turn: 3, push: 1.5, again: 0.5 }` (see "Step 7 in detail" for the name): while the body touches a wall or the gate, the turn rate asked for gains up to `bump.turn` rad/s, in proportion to how squarely the nose points into the wall, turning it along the wall; and on a new hit (none in the last `bump.again` seconds) the car is pushed off the wall at `bump.push` m/s. **These two rules are untried**: Rapier already stops the car going through, with the body's own grip of 0.2, and the tests decide what more is needed | On `wallGround()` at top speed: a 30-degree hit leaves 21 m/s or more (70%) a second later, within 10 degrees of the wall's line, roof-up, not touching, and at no step through the wall; a 10-degree brush keeps 90%; head on, the car stops, rolls back at 1 to 2 m/s, stays roof-up and can reverse away. The sloping end of a wall met head on at 30 m/s does not launch the car (under 0.5 m of height gained, lands on its wheels); if it does, make the end's collider blunt in `wallColliders`: colliders are not part of the world fingerprint |
| **7c Trees and rocks** | Decided: the wheels do not feel rocks, the body does. No new rule unless a test needs one | A trunk met head on, and half a metre off centre, at 30 m/s: under 3 m/s a second later (head on), roof-up 0.95 or more throughout, never turning faster than 6 rad/s, never inside the trunk. A flat rock (0.3 m high) crossed at 18 m/s: roof-up 0.8 or more throughout, on its wheels and level 2 s later. A tall rock stops it like a tree |
| **7d Kerbs** | No new rule | The kerb's upright outer face crossed from the grass at 5, 20 and 45 degrees, at 18 and 30 m/s: under 3 degrees of heading and 3% of speed lost. A slide across a kerb carries on with its charge |

#### Step 7 in detail

- **7a**: `surfaceShare(wheels, car)` in `car/surface.ts`: the average of `car.surfaces[wheel.surface]` over the wheels that touch, 1 with none touching. It feeds `top` (line 8 of "The car's step"), so nothing else changes. Config: `SurfaceConfig` (a share for each `Surface`).
- **7b, the wall's turn**: with `n` the contact's slope from `touching()`, flattened onto the map and pointing out of the wall towards the car, and `facing` the car's nose: `into = -dot(facing, n)` (above 0 when the nose points into the wall). The turn that brings the nose along the wall has the sign of `dot(up, cross(facing, n))`, and its size is `car.bump.turn * into`. It is added to `wanted` (line 11) while touching. **The push**: on a new hit (none in the last `bump.again` seconds, counted in steps and remembered in `CarMemory`), `push(n * mass * max(0, bump.push - dot(velocity, n)))`. A drift is already cancelled by the hit (6c). Config: `BumpConfig`, the block `car.bump` (not `WallConfig`: that name is taken by `road.walls`, the generator's).
- **7c**: if the tree test shows the car spinning on a trunk, the lever is the body's own grip (`car.body.grip`, 0.2) and bounce (0), not a new rule.

#### If step 7 goes wrong

| Symptom | First thing to try |
| --- | --- |
| A glancing wall hit stops the car dead | The body's grip on the wall: lower `car.body.grip`. Then the wall's turn |
| The car climbs the wall | A wheel is meeting the wall's top: the wheels must not feel walls (they do not: `WHEEL_GROUPS` in `colliders.ts`), so it is the body riding up. Lower the body's grip; check the sloping wall end separately |
| The car bounces back off walls | `car.body.bounce` should stay 0; reduce `bump.push` |
| Grass slows the car too suddenly | Rule 9's `shed` (9 m/s²) is the rate; it is meant to be quick |

### Step 8: progress and respawn

| Part | Build | Done when |
| --- | --- | --- |
| **8a Place on the lap** | `src/sim/track/progress.ts`. The car's place: metres along the lap from the start line, and metres to the right of the centre line (`world.track.candidates[winnerIndex].line`, the arrays `startPose` reads). It is looked for within 40 m along the lap of the last place; only when the car is more than 30 m from the line there is the whole lap searched. **Checkpoints** every 100 m (the lap divided evenly into the nearest whole number of them): one is passed when the place goes forwards past it with the car within half the road's width plus 6 m of the centre line, and only the next one in order can be passed. Remembered, in `hash` and the snapshot: the place, the last checkpoint, how many have been passed | On seed 7 and on a folded seed with sections 40 m apart: a car moved round the centre line has a place that only rises, with every checkpoint passed in order; a car set down on the section next door is not mistaken for being there; a cut across the grass that misses a checkpoint does not pass the one after it; reversing over one does not count |
| **8b Respawn** | New `sim.respawn: { delay: 1, waterDepth: 0.5, edge: 20, flipped: { roofUp: 0.3, time: 1 }, stuck: { speed: 0.5, time: 3 } }`. A wait of `delay` (60 steps) starts when: the car's middle is 0.5 m or more under the sea (height 0); it is within 20 m of the tile's edge or 30 m under the sea; its roof-up has been under 0.3 for 1 s; or a pedal has been down for 3 s with the car slower than 0.5 m/s. During the wait the pedals and stick do nothing. Then the car stands at the last checkpoint passed (the start pose before any): on the centre line, facing along the lap, tipped with the road, at its ride height, still, with no drift, charge or boost (`poseAlong(world, cfg, metres)`, made from `startPose`). R, on the step it goes down, does the same with no wait | On real seeds with an opening onto the sea (7 and 9; find the place with a helper in `testing/checkSeeds.ts`): driven in, the car is at the last checkpoint, still, on four wheels and facing along the road, 60 steps after it went under. One test for each of the other triggers and for R. A car holding the brake at a standstill is never "stuck". A snapshot taken during the wait carries on exactly |
| **8c The page** | A short fade to white and back over the respawn; the readout shows the place on the lap | Browser test: `drive.run` into the sea and back to the checkpoint; no console errors |

#### Step 8 in detail

- **The line**: `line = world.track.candidates[world.track.winnerIndex].line` (`count`, `spacing`, `length`, `x`, `z`, `tx`, `tz`, `curvature`); the road's width at each sample is `world.road.width`.
- **The place** (`placeOnLap(line, x, z, near)`): look at the samples within 40 m of sample `near` (wrapping round the lap) for the one nearest `(x, z)`, call it `j`. Then `along = j * spacing + dot(p - p_j, t_j)`, wrapped into 0 to `length`, and `off = dot(p - p_j, (-tz_j, tx_j))` (metres to the right). If `|off|` is over 30 m, look at every sample instead (a few thousand: cheap enough for the rare step it happens).
- **Checkpoints**: `n = round(length / 100)`, checkpoint `k` at `k * length / n`. Checkpoint 0 is the start line. The car starts 4 m behind it with `next = 0`, so the first thing it passes is the line. Checkpoint `next` is passed on the step `along` goes from before it to at or after it (moving forwards, by under 40 m, allowing for the wrap at the line) with `|off|` at most half the road's width plus 6 m; then `next = (next + 1) % n` and `passed` goes up by one. Milestone 4 counts a lap when `next` comes back round to 1 having passed all `n`.
- **Remembered** (in `CarMemory` or a `ProgressState` beside it, in the fingerprint and the snapshot): `near` (the sample last found), `along`, `off`, `next`, `passed`, the last checkpoint passed, and for 8b `waitLeft`, `flippedFor`, `stuckFor` (steps).
- **The respawn pose**: `poseAlong(world, cfg, metres)` in `sim/start.ts`, the general form of `startPose` (which becomes `poseAlong(world, cfg, -sim.start.back)`): the height read between the two samples either side, the climb from them, the bank from `world.road.cross` at the nearer sample. A test checks `startPose` gives exactly what it gave before.
- **Putting the car there**: `CarPhysics.place(pose)` in `carBody.ts`: the body's position and turn set, its speed and spin set to 0 (look the setter names up in `rigid_body.d.ts`). `sim.step` does it at the start of a step, then the step carries on with nothing pressed.
- **R** is the input record's `reset` bit, so a ghost replays it.

#### If step 8 goes wrong

| Symptom | First thing to try |
| --- | --- |
| The place jumps to the section next door on a folded track | The 40 m window is too wide for that seed's spacing of sections (the generator keeps them 40 m apart centre to centre at the least); narrow it to 25 m |
| A respawned car drops or bounces | It is placed at ride height on a banked or sloped road: check `poseAlong` tips it with the road, as `startPose` does |
| A car in shallow sea is never respawned | The sea is at height 0 in the island's own heights; check the car's middle against 0, not the ground |

Also answer in this step, from step 2's list: can the car drive back up a 40% hillside onto a mountain road (4e's table says whether it climbs 45% on the road's grip; grass takes 40% of its top speed, not its push), and does a long slide down one need a respawn (the "stuck" rule should cover it).

### Step 9: the bot and the corner proof

| Part | Build | Done when |
| --- | --- | --- |
| **9a A bot that laps** | `src/testing/botDriver.ts` (test code, never shipped). It steers at the point on the centre line 6 m plus half a second of travel ahead of its place (the stick is 2.5 times the sine of the angle to that point, held to full). It brakes for what is coming within 80 m: the speed a corner allows is the square root of 0.9 × `sideForce` × its radius | Seeds 1 to 20 in Node, one lap from the start line and one flying lap: every lap finished, **0 respawns**, 0 wall touches, four wheels on road or kerb for 98% of the lap. A table here: lap time, average speed, wall touches, seconds off the road |
| **9b Drifting where told** | The bot slides through corners that turn 45 degrees or more with a radius of 90 m or less (the generator's own drift corners): button and stick from 10 m before the corner, the stick then holding the centre line, release when 15 degrees of the corner are left | Three real corners each of hairpin, sweeper (70 to 110 m), chicane and plain corner, from seeds 1 to 20, the 3 km 15% seeds among them: from 40 m before the corner to 120 m after it, the pass with the slide is quicker than the best pass without, with four wheels on road or kerb and no wall touched. The lap with slides is quicker on all 20 seeds. A table here, by corner type: time and exit speed with and without. **This table is the evidence for the milestone's "drift-boost works through every corner type"** |
| **9c Same everywhere** | The inputs of the sliding lap on seeds 1 and 7, recorded in Node (`packInput`) and replayed through `window.seedCircuit` | One fingerprint in Node, Chromium and Firefox |

#### Step 9 in detail

- **Where it runs**: the bot is test code (`src/testing/botDriver.ts`), run from unit tests in Node. It reads the simulation's state and returns a `RawInput` each step, so a lap is a list of inputs that can be packed (`packInput`) and replayed anywhere (9c).
- **Steering**: `lineDriver` from 4d, aiming at the point on the centre line `6 + 0.5 * speed` metres ahead of its place (8a).
- **Speed without sliding**: for each sample from its place to 80 m ahead, at distance `d`, the speed allowed there is `sqrt(0.9 * steer.sideForce / |curvature|)` (no limit where the curvature is 0), and the speed it may have now to brake down to it in time is `sqrt(allowed² + 2 * 0.7 * brake.strength * d)`. The target is the least of those and the top speed. Throttle 1 when more than 0.5 m/s under the target, brake (by how far over, up to 1) when more than 0.5 m/s over, otherwise throttle to hold.
- **The corners** come from the winner's analysis: `world.track.candidates[winnerIndex].sections`, the `CornerSection`s, with `kind` (hairpin, sweeper, chicane, kink, corner), `startIndex`, `sampleCount`, `turnDegrees`, `minRadius`, `direction`.
- **Sliding (9b)**: for a corner of 45 degrees or more and 90 m or less, from 10 m before `startIndex`: press the drift button with the stick towards the corner (it needs 12 m/s). In the slide, the path turn wanted is `speed * |curvature|` at its place, and the stick that asks for it is `2 * (rate - wide) / (tight - wide) - 1`, towards the corner, plus 0.1 for each metre it is off the line, back towards it, held to full. Release when the turn left in the corner (its curvature times spacing, added over the samples to its end) is 15 degrees or less.
- **"The best pass without"**: the same bot without sliding, run from the same place and speed, with its 0.9 safety margin tried at 0.9, 1.0 and 1.1, and the quickest that stays on the road and off the walls taken.
- **The table's numbers**: time from 40 m before the corner to 120 m after it, and speed at 120 m after, with and without, for each corner, then the middle and the worst of each kind.

#### If step 9 goes wrong

| Symptom | First thing to try |
| --- | --- |
| The bot runs wide on hairpins without sliding | Its 0.9 margin, then its look-ahead. It is test code: tune it, not the car |
| Sliding is slower than not sliding on some kind of corner | That is the finding the step exists for. Tune `drift.turn` and `drift.grip`, then the tiers, and say so to Tane at check-in 2 with the table. Do not change the bot to hide it |
| A respawn on a 15% mountain seed | Look at where: off a cliff edge (an open roadside?) or stuck on a bank. Record it in the table; 0 respawns is part of "done" |

Then **check-in 2 with Tane**: the feel of the drift, with the tuning panel.

### Step 10

| Part | Build | Done when |
| --- | --- | --- |
| **10a Tuning** | Tane's numbers from check-in 2 into `config.ts` | Step 9's tables run again and still pass; new tables here |
| **10b Speed** | `npm run perf` with the chase view added to its views | 16.7 ms a frame or less on High at 1080p on the Arc graphics; a step under 1 ms on seed 8 (the most wooded) |
| **10c Docs and the pull request** | README, CLAUDE.md (controls, addresses, commands), this file, one pull request for the milestone | Tane's playtest sign-off, then merge |

## Milestone 4: time trial

Issue #4. **Done when** (the brief): a full 3-lap race can be played from the menu and back with correct times. Start a new branch `milestone-4-time-trial` from `main` once Milestone 3 is merged, and plan in plan mode first: this section is what that plan starts from. Ask Tane the milestone's questions (pace, check-ins) at M4.0.

| Step | Build | Done when |
| --- | --- | --- |
| **M4.1 Flatten the start area** | A generator change. `solveProfile` (`gen/road/profile.ts`) takes the steepest gradient allowed at each sample instead of one number for the lap; within `road.start: { before: 100, after: 30, gradient: 0.02 }` metres of the line it is 2%. The line is on a straight, so the road there is not banked already. Every world fingerprint changes (allowed while the generator is `v0`): update the tests that pin fingerprints, and `seeds1to20.test.ts` and `freshSeeds.test.ts` must stay clean | Over seeds 1 to 200: the road's gradient within the start area is at most 2% on every seed; every seed still valid and clean (`testing/checkSeeds.ts`). Seed 42 (8% today) and seed 28496 (the gate in a gorge) looked at. The 20-seed screenshots looked at; the start views (`look=start`) of six seeds looked at beside `start-gate.jpg`. Measured: how many candidates the earthworks rule now rejects, against before |
| **M4.2 The race rules** | `src/sim/race.ts`, pure, in the simulation's memory, fingerprint and snapshot. `RaceState`: phase (countdown, racing, finished), `countdownLeft` (steps), `lap` (1 to 3), the step the lap started on (a fraction), lap and sector times (fractions of steps), the step the throttle was first pressed. New `race: { laps: 3, countdown: 3, startBoostWindow: 0.25, sectors: 3, finishedFor: 2 }`. **Countdown**: 3 s; the car is held (the pedals do nothing to it); a throttle first pressed in the last 0.25 s gives a tier 1 boost at "go", one pressed earlier gives none. **Times**: on the step the car crosses checkpoint 0 with all checkpoints passed (8a), the crossing's fraction of the step is `(length - before) / (after - before)` from `along` before and after the step, wrapped; a lap time is the steps between two crossings, fractions included, divided by 60. **Sectors** end at checkpoints `round(n/3)` and `round(2n/3)`. **Finished** after lap 3; the inputs are then ignored and the car coasts to a stop. A respawn does not stop the clock | Unit tests on the rules with a made-up `along` per step: the countdown is exactly 180 steps; the start boost is given for a throttle first pressed on step 166 to 180 and not on 165; a lap that skipped a checkpoint does not count; three lap times add up to the total; a crossing half way through a step gives a time ending in a half step. In Node, the bot (9a) races 3 laps on seeds 1 to 5 and finishes. The race's results are in the fingerprint, and one run gives one fingerprint in Node, Chromium and Firefox (add it to `e2e/determinism.spec.ts`) |
| **M4.3 The race on screen** | HTML cards over the canvas, in the style of `docs/VISUAL_BAR.md`: countdown lights (three red, then green on "go"), lap 1/3, the time of this lap, the last and best lap, each sector's split against the best (green when quicker), "Finished" and the total. `formatRaceTime(steps)` gives `m:ss.mmm`, pure and tested | Unit tests of `formatRaceTime` (0, 59.9995 s, 61 s, a fraction of a step). Browser test: `drive.run` through the countdown and a lap shows lap 2/3 and a lap time equal to the simulation's. Screenshots of the countdown, mid-lap and finished looked at |
| **M4.4 Screens and menus** | `src/app/screens.ts`: the screens as a pure state machine (title, loading, countdown and race, paused, results), each move named (start, pause, resume, restart, quit, newTrack, enterSeed, finished). The page shows the screen the machine is in. Keyboard: arrows, Enter, Esc. Controller: D-pad or stick, A, B, Start. Pausing takes no steps and records no inputs; the page pauses itself when the tab is hidden | Unit tests: every move from every screen, and the ones that are not allowed (no pause on the results screen). Browser test: the whole round from the title to a race to the results and back, with the keyboard only, then with a made-up controller (`navigator.getGamepads` stubbed) |
| **M4.5 New track, typed seed, restart** | The title screen offers: a new island (a random seed, as N does today), a seed or share code typed in (`parseSeedInput` and `formatSeedCode`, `core/seedCode.ts`), the time of day (the slider's numbers, `time=`). Restart builds a new simulation on the same world, without asking the worker again. The results screen shows the seed's share code and name | Browser tests: a typed `v0-48213` opens that seed; a bad code says why; restart starts the countdown again within 0.5 s and the lap times are cleared |
| **M4.6 The whole race** | The browser test of the milestone: from the title, start seed 7, race 3 laps with the bot's recorded inputs fed through `drive.run`, see the results screen, go back to the title. Then a check-in with Tane, tuning, README and CLAUDE.md, STATE.md, the pull request | The results screen's times equal the ones Node gives for the same inputs, to the millisecond, in Chromium and Firefox. **Tane's sign-off**, then merge and delete the branch |

**If it goes wrong:** a lap time that differs between browsers means the crossing sum uses something inexact or the frame clock; times that drift by a step mean the countdown or the pause is counted in frames somewhere. Both are bugs to fix before anything else, because ghosts rest on them.

### Decisions, what to reuse, and traps

- **The race clock is steps, never the wall clock.** A lap time is steps divided by 60, with the moment the car crosses the line placed inside its step by exact sums (how far before and after the line it was). A time is then the same on every computer, and a ghost's time can be checked by replaying it.
- **The race's rules are a pure state machine in `src/sim`** (countdown, racing, finished; laps; sector times), in `hash()` and the snapshot like the drift state. The page only draws it. The countdown is counted in steps too.
- **A lap counts only when every checkpoint was passed in order** (step 8a). Crossing the line alone is not a lap; that is what stops a cut across the grass from counting.
- **Sectors:** three, each a whole number of checkpoints.
- **Start boost:** the throttle first pressed in the last 0.25 s before "go" gives a tier 1 boost (`boostLeft` from step 6); a throttle held from earlier gives none. Decided by step counts, so a ghost replays it.
- **Flatten the start area first** (known issue: seed 42 starts on an 8% descent). It is a generator change, so every world fingerprint moves: do it before anything is saved by seed in Milestone 5.
- **Menus are HTML over the canvas**, as the title card is, not drawn in 3D. Pausing is simply not calling `step`. Pause when the tab is hidden; `advance` (step 5b) already drops a long frame.
- **Reuse:** checkpoints and `poseAlong` (step 8), `boostLeft` (step 6), `parseSeedInput` and `formatSeedCode` (`core/seedCode.ts`), the track's generated name, the readout card, `time=` for the player's pick of time of day.
- **Traps:** timing anything with `performance.now()`; taking steps or recording inputs while paused; a lap that counts after a short cut; a results screen that reads the wall clock.

## Milestone 5: ghosts and favourites

Issue #5. **Done when** (the brief): a ghost replays a lap exactly on the same seed after reloading the page. Branch `milestone-5-ghosts`; plan in plan mode first. **Answer first, with Tane, at M5.0**: does a ghost cover the best lap or the whole race (this plan assumes the whole 3-lap race, from the countdown), and may a favourite saved before generator `v1` stop rebuilding (this plan assumes yes, with a note on screen).

| Step | Build | Done when |
| --- | --- | --- |
| **M5.1 The run record and its replay** | `src/sim/record.ts`, pure. `RunRecord`: format version, seed, generator version, the handling's fingerprint (`hashHandling(cfg)`: every number of `config.car` and `config.sim`, keys in a fixed order, through `createHasher`), every step's packed input (`Uint32Array`), the car's place every 6 steps (position and turn, `Float32Array`), the lap times, and the last `hash()`. `packRun` and `unpackRun` turn it into bytes and back (a short header, then the arrays, read and written with a `DataView`, little-endian). `replayRun(rapier, world, cfg, record)` runs the inputs in a fresh simulation and gives the last fingerprint. A 3-lap race is about 13,000 steps: 52 kB of inputs and 61 kB of places | Unit tests: pack then unpack gives the same record, byte for byte; a bot race on seed 7 replays to its own last fingerprint; a record with one input changed does not; `hashHandling` changes when any car or sim number does and not when a drawing number does. The replay gives one fingerprint in Node, Chromium and Firefox |
| **M5.2 Storage** | `src/app/store.ts`: one small interface (`getGhost(seed)`, `putGhost(seed, bytes)`, `listFavourites()`, `putFavourite(favourite)`, `removeFavourite(seed)`) with three makers: IndexedDB for ghosts and `localStorage` for favourites (the real one), and one in memory (for unit tests, and when the browser refuses storage). Every read and write is wrapped so a refusal never stops the page; the page says "not saved" instead | Unit tests on the memory one. Browser test: a ghost and a favourite written, the page reloaded, both read back the same; with storage blocked (a private window in Playwright, or IndexedDB removed before the page loads) the race still runs and says "not saved" |
| **M5.3 The ghost drawn** | A second `carView` (5c) drawn from the record's places, blended between the two nearest (`blendState`), at the race's own step count: see-through (about 40%), no shadow, never hit. No second physics world runs | Browser test: a ghost on seed 7 is drawn at the place its record says at steps 0, 600 and 3000. Screenshots of the car and its ghost side by side looked at |
| **M5.4 Personal bests** | On a finished race with every lap valid, faster in total than the stored ghost or with none stored, the record is saved. A race in which the tuning panel changed anything is never saved (a flag on the simulation's page wrapper, not in `src/sim`). During a race the split against the ghost shows at each sector. A ghost whose handling fingerprint differs from today's is still drawn, marked "older version", and is not the time to beat | Browser tests: a faster race replaces the ghost and a slower one does not; a race with a slider moved is not saved; a ghost saved with another top speed is shown as older |
| **M5.5 Favourites** | A star on the results and pause screens saves the seed, its version, the track's name, the best time and the date. The title screen lists them: race one, remove one | Browser test: star seed 7, reload, it is listed with its best time; race it from the list; remove it |
| **M5.6 The reload test** | The milestone's browser test: race seed 7 (recorded inputs through `drive.run`), finish, reload the page, open seed 7: the ghost loads, and replaying its inputs in the page gives its saved last fingerprint, and the ghost is drawn where the car was. Then README, STATE.md, the pull request | Passes in Chromium and Firefox. **Tane's sign-off**, then merge |

**Traps:** saving the places as numbers from the drawing (they must come from the simulation's state); starting the record after the countdown (a start boost would not replay); a reset (R) not recorded; reading the ghost by wall-clock time instead of by step.

### Decisions, what to reuse, and traps

- **A ghost is the inputs, one whole number a step** (`packInput`), from the first step of the countdown, saved with the seed, the generator version, a fingerprint of `config.car` and `config.sim` (the handling), and the run's last `hash()`. A 3-lap race is about 13,000 numbers.
- **Also save where the car was, ten times a second** (position and turn). The ghost is drawn from those, so no second physics world runs during a race. The inputs are the proof: replayed in a fresh simulation they must end on the saved fingerprint. That replay, after a page reload, is the milestone's "done when" test.
- **If the handling's fingerprint differs** (the game was tuned since), the ghost is still drawn from its saved places, marked as from an older version, and its time is not the one to beat.
- **Ghosts in IndexedDB** (the best per seed), **favourites in `localStorage`** (seed, version, name, best time, date). All storage is page code; `src/sim` never sees it.
- **Reuse:** `packInput` / `unpackInput` (`sim/input.ts`), `sim.hash()`, the pattern of `sim/script.ts` and `e2e/determinism.spec.ts` (step 9c already replays recorded inputs in every browser), `blendState` for drawing between saved places.
- **Traps:** a run made with the tuning panel open must not be saved; a snapshot is 7 to 9 MB and is not for ghosts; the reset button is part of the input record and must replay; a favourite saved under generator `v0` will not rebuild after the generator changes, so say so on screen until `v1`.

## Milestone 6: polish

Issue #6. **Done when** (the brief): version 1 scope is complete and hits the performance targets. Branch `milestone-6-polish`; plan in plan mode first. **This is the biggest milestone and the first place to trim.** At M6.0 agree with Tane which steps are in, in what order, and what goes first if it runs long. The order below is a suggestion: the generator changes first (they move every seed's world and must be done before `v1`), the rest by how much a player notices them.

| Step | Build | Done when |
| --- | --- | --- |
| **M6.1 Bridges** | A generator change (`gen/road/bridges.ts`, `Road.bridges` spans, in the world fingerprint). Where the road would need a fill over 6 m (the earthworks rule rejects such turns today), the road becomes a bridge instead: the ground under it is left natural (or sea), and the road mesh is unchanged, since the wheels feel the road mesh and not the ground. New meshes: the deck's sides, railings (walls in `Road.walls`, so they are hit) and pillars (boxes in the colliders). The earthworks rule stops counting fill on a bridge. Rules in `road.bridges` (shortest and longest span, pillar spacing) | Over seeds 1 to 200: how many seeds gain a bridge, and how many more candidates are kept. The car drives over one in a simulation test at top speed, with four wheels down and no bump at either end. The 20-seed screenshots and a close view of three bridges looked at |
| **M6.2 Tunnels** | The same for cuts over 8 m: the ground above is left natural, the road runs in a tunnel with walls and a lid (its own mesh and colliders). The chase camera must stay under the lid (its clearance takes the lid as a ceiling), the light inside is dimmer, and the grass and trees are not drawn inside. **The hardest step in the milestone, and the first to cut** | As for bridges; and the camera never goes through the lid on any tunnel of seeds 1 to 200 (a unit test along each tunnel) |
| **M6.3 The look** | The known look issues Tane picks from the table below (saw-tooth cliff tops, the sun's glare from above, dark clouds at dawn, "evening light" with a blue sky, the round massif, and so on), each its own small part with pictures before and after | Each picked issue's picture beside its reference, looked at; `docs/VISUAL_BAR.md` updated where the bar moves |
| **M6.4 Sound** | `src/audio/`, page code, Web Audio only, no files: the engine (two oscillators, pitch from the speed, louder with the throttle), the screech (filtered noise, while sliding, louder by tier), the boost (a rising whoosh), a bump (a short thud on a new wall hit). It starts on the first key or click (browsers allow no sound before). Volume and mute (M) in settings. Sounds are worked out from the simulation's state, never feed back | Unit tests of the pure parts (pitch from speed, gain from tier). Browser test: the audio graph is built after a key press and not before; no console errors. Tane listens |
| **M6.5 Effects** | Tyre smoke while sliding, dust off the road, motion lines in a boost, better sparks and flame (the proposal in `docs/VISUAL_BAR.md`). All drawn from the simulation's state and its step count, so `still=1` repeats; all within 1 ms a frame | Screenshots of each, looked at; the same address twice gives the same picture; `npm run perf` shows the cost |
| **M6.6 Settings** | A settings screen: quality (High, Low; already there), volume, time of day (the brief: the player may pick it), the controls shown, camera distance. Kept in `localStorage`. **Settings touch drawing and sound only**: nothing in `src/sim` or `src/gen`, or ghosts and seeds break | Browser test: each setting survives a reload; the simulation's fingerprint is the same with every setting changed |
| **M6.7 Speed and size** | The brief's targets: 60 frames a second at 1080p on a mid-range laptop, a world in under 3 s, racing within about 10 s of opening the page. Measure with `npm run perf` and, for the 10 s, Chromium's network throttling. Levers known today: the grass's 176,000 triangles; the most wooded islands (589,000 triangles from above); the water shader; Rapier's 1.68 MB (the build that does not carry its WebAssembly as text saves about a quarter, but needs Vite to serve a `.wasm` file: a new dependency or setting, so ask Tane) | The numbers in STATE.md, against the targets; anything missed is Tane's call |
| **M6.8 Generator `v1`** | `GENERATOR_VERSION = 1` (`src/gen/version.ts`). A test pins the world fingerprints of 20 seeds (`src/gen/v1.test.ts`), so any later change to the generator fails it and must become `v2`. The brief: keep each released version available so saved favourites rebuild, or at least store each favourite's centre line; decide with Tane which | The pin test passes; a favourite saved now is listed as `v1`; the share code reads `v1-48213` |
| **M6.9 Version 1** | The brief's "Version 1 scope" table, line by line, checked by hand in Chrome, Edge and Firefox on Windows, with a controller and a keyboard. README for players. Hosting and the game's name, as Tane decides. The pull request | Every line of the table works. **Tane's sign-off**, merge, release |

### Decisions, what to reuse, and traps

- **Bridges and tunnels are a generator change.** Every world fingerprint moves once more, and the generator becomes `v1` only after them (decision of 2026-11-11). The ground is one height at each point, so a bridge is the road's own mesh over lowered ground (the wheels already feel the road mesh, not the ground under it), and a tunnel is a cutting with a lid over it, drawn and collided as its own mesh. The earthworks rule (`gen/track/earthworks.ts`) rejects the turns that would need them today; that is where they come in.
- **Sound is made in code** with Web Audio (the engine's pitch from the speed, filtered noise for the screech and the boost). No files, so nothing more to download (pillar 4). A browser only lets sound start after a key or a click.
- **Effects only read the simulation's state.** Smoke, dust and motion lines never feed back into it, and are driven by its step count so that `still=1` pictures repeat.
- **Speed and size:** Rapier is 1.68 MB gzipped; the build that does not carry its WebAssembly as text saves about a quarter. "Racing within 10 seconds" should be measured on a slow connection. The frame numbers to hold are in the archive under "Step 15".
- **Traps:** an effect driven by the frame clock makes screenshots differ from run to run; a setting that changes anything in `src/sim` or `src/gen` breaks ghosts and seeds, so settings touch drawing and sound only.

## Where each known issue is dealt with

Every item under "Known issues and risks" in `docs/STATE.md`, by the step that deals with it. "Tane" means it is a question for the check-in or step named; "left" means it stays as it is unless Tane asks. When a step deals with an issue, take it off STATE.md's list in the same commit.

| Issue (STATE.md) | Dealt with in |
| --- | --- |
| The start line can sit on a steep slope (seed 42, 8%) | **M4.1** |
| A gorge can hold the start gate (seed 28496) | M4.1 checks it; 5d's camera clearance is tested there |
| Wall ends are ramps; hillsides of up to 40% open beside mountain roads | **7b** (the wall end met head on), **4e** and **8** (climbing back up, sliding down) |
| Few roadsides open onto the sea; beaches open; the 40% wall rule | Tane, **check-in 1** (question 6) |
| Nobody has watched the grass move; from the road it reads as a fine texture | Tane, **check-in 1** (the chase camera is lower and closer than the flying one) |
| Near and far tree shapes swap a whole square at once | Watched while driving at **check-in 1**; fixed in **M6.7** if it shows |
| Mountain worlds are the slowest to build (3.0 to 3.3 s headless); Firefox 1.6 times slower than Chromium | **M6.7** (the budget test uses seed 7 and passes) |
| The grass's 176,000 triangles; the most wooded islands' 589,000 from above; the water shader's cost; Low gains least from above; the page draws every frame | **M6.7**, and **10b** checks the chase view |
| Sea cliffs and cut banks have a saw-tooth top edge on the 3 m grid | **M6.3** (Tane picks) |
| The sun's glare from above is a wide pale patch with wave stripes | **M6.3** |
| Clouds dark grey-brown at 07:00 and 19:30; those times quite dark; 18:30 called "evening light" with a blue sky; 10:00 called "midday light" | **M6.3** (all one look at `render/daylight.ts` and `lightName`) |
| The coast cuts high ground into curved rock bands; the round cone under a massif; mountain rock in hard-edged bands; the peak a bit lumpy | **M6.3** if Tane picks them; they are generator changes, so before **M6.8** |
| Steep rock cuttings beside mountain roads | **M6.2** (tunnels take the deepest), then **M6.3** |
| Flat seeds show large sandy patches; the mown strip is the same width everywhere; nothing cleared round trees in long grass; the wind blows the same way on every island | **M6.3** candidates (small) |
| From far above, islands look fairly bare; tree shadows small at midday | Tane, **M6.3** (`world.decor.trees` levels) |
| The circling camera frames only part of the biggest islands; it can look through clouds | Left (it is a debug and title view); **M4.4** if the title screen uses it |
| A close camera checks the ground, not trees | Left (close views are for screenshots) |
| The verge dips a little at its outer edge on steep banks | Left; the barrier footing hides it |
| Islands big and blobby; coastal mountain seeds keep the sea further out and have less sea beside the road; mountains lower than asked; circling summits lower; fewer circling laps go round the summit; not every island gets a peak; a bay reaches 10 m only beside low road; enclosed water possible | Left: generator character Tane has seen and accepted. Revisit only if Tane asks before **M6.8** |
| Almost every track has a hairpin; folds modest; winner scores cluster; lap height a little under target; some Milestone 1 winners changed | Left (scoring), unless step **9**'s table shows a kind of corner the car handles badly |
| The lab: the sidebar taller than 720 pixels; the rejected-layouts overlay usually empty; the contact sheet frame generous; wall lines thin from far out | Left (debug views) |
| Two test files never seen failing for a reason other than a missing module | Left |
| Timing on the laptop is unreliable for spells; the browser suite times out in long runs | The working agreements and "When something does not go to plan" |
| Edge is not tested separately | **M6.9** checks it by hand |
