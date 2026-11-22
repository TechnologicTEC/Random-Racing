# Milestone 3: driving, steps 4d to 10

Part of the plan. `docs/PLAN.md` has the build order, the routine for one part, what to do when something does not go to plan, and the questions for Tane; this file has the steps of one milestone. Tick the build order in `docs/PLAN.md` as parts are finished.

Written by the model that built steps 0 to 4c, on its last day, and approved by Tane the same day. It splits every step still to do into parts, each with the tests and numbers that prove it is done. **Every number is a starting value in `src/config.ts`, to be tuned by feel at the check-ins; the tests read the config, so they follow it.** The reasons are given so that a number can be changed with its consequences in view.

Each part ends with: its tests seen failing and then passing, `npm test`, `npm run typecheck`, `npm run e2e`, a commit, a push, and `docs/STATE.md` saying what is next, with the line ticked in `docs/PLAN.md`'s build order. Each step is still planned in plan mode when it starts (CLAUDE.md); this section is what that plan starts from.

## Rules that hold for every part

- **`src/sim` uses exact maths only**: `+ - * /`, `Math.sqrt`, and `dsin` / `dcos` from `src/core/dmath.ts`. The architecture test enforces it. `src/camera`, `src/render`, `src/input` and `src/app` may use anything.
- **Anything the simulation remembers from one step to the next goes into `hash()`, `snapshot()` and `restore()`**, with a test that a restored run carries on exactly. Up to step 5 it remembers nothing of its own. The drift state (step 6), the wall touch (7b) and the progress (8) are the first.
- **Times in the config are seconds; the code turns each into whole steps once** (`Math.round(seconds * stepsPerSecond)`) and counts steps. Never add up fractions of a second.
- **Look Rapier's function names up** in `node_modules/@dimforge/rapier3d-deterministic-compat/dist/**/*.d.ts`. This is version 0.21; do not trust memory. Only `src/sim/physics` may import it, so anything new the car needs from the engine (a contact, setting the body's place) becomes a function on `CarPhysics` in `carBody.ts`.
- **What the exact-maths rule covers**: `src/core`, `src/gen` and `src/sim`, but not their `.test.ts` files and not `src/testing` (`src/architecture.test.ts`). Test code may use `Math.sin`; it rarely needs to, because a direction can be built from a cross product.
- **Where tests go**: pure sums beside their file (`steer.test.ts`), the car on a test ground in one file per part (`steering.test.ts`, as `driving.test.ts` is for 4c), real seeds in the same file or `src/gen/…` style seed tests. Browser tests in `e2e/`. Shared test helpers (the `hold` function at the top of `driving.test.ts`, a line-following driver) move into `src/testing/` the second time they are needed.
- **Prove a rule on a test ground first** (`src/testing/testGrounds.ts`: the ground is exactly known), then on real seeds.
- **Directions.** The car's front is -z, its right +x, its roof +y. In `car.ts`, `across` (`cross(along, normal)`) points to the car's right. A positive `steer` is to the right. A positive turn rate about the car's `up` is to the left (anticlockwise seen from above), so steering right asks for a negative one.
- **If a test's number cannot be met, tune the config; if it still cannot, report to Tane.** Do not loosen a number quietly.
- **The browser suite takes about 25 minutes. Keep the laptop awake for it.** A page that "did not load in time" is standby or a slow spell, not the code: check Windows' event log (Kernel-Power 506 and 507) and run the failed tests again alone before debugging (see `docs/archive/STATE-milestone-3-step-4.md`, "4c").

## Step 4: the two parts left

| Part | Build | Rule and starting values | Done when |
| --- | --- | --- | --- |
| **4d Steering and cornering** | `car/steer.ts`: `turnWanted(steer, speed, car)`. `car.ts` gives it to `turnGrip` in place of the 0 it gives now | `car.steer: { minRadius: 6, sideForce: 15 }`. The turn rate asked for is `steer` times the smaller of speed / `minRadius` and `sideForce` / speed, and it changes sign with the speed, so a reversing car steers as a real one does. That is a 6 m circle up to 9.5 m/s, 15 m at 15 m/s and 60 m at 30 m/s; the fastest turning is 1.58 rad/s at 9.5 m/s. `sideForce` is under `grip.side` (22), so the car never slides in ordinary steering | Pure tests: those values; half stick gives half the rate; left mirrors right exactly; nothing at a standstill; reversed when rolling backwards. On the flat: circles at throttle 0.25, 0.5 and 1 have radius 6, 15 and 60 m within 5% (worked out from speed / turn rate, and the middle of the circle stays put within 5% of the radius for a whole lap); left and right within 1% of each other; speed within 2% of the straight-line speed for that throttle; four wheels down; roof up. One step after the stick moves, at 15 m/s, the turn rate is over 0.4 rad/s (the brief: instant). Half stick at top speed: 120 m. Reversing with the stick right: the car backs to its right and its nose swings left. Two laps of the banked ring (70 m, 8 degrees) at top speed, steered by a simple test driver: within 1 m of its middle line, 29 m/s or more, wheels down (it needs 12.9 of the 15 m/s2). The kerb crossed at 5 and 15 degrees, at 18 and 30 m/s, up its ramp and off its upright face: heading changed by under 3 degrees afterwards, no wheel in the air for over 0.2 s (each wheel timed on its own: they leave the upright face one after another, so all four are not down together for up to 0.3 s at 15 degrees and 30 m/s), under 3% of the speed lost. Every earlier test still passes |
| **4e Stability and the whole car** | `car/stability.ts`; the scripted run looked at now that it drives; the measured table | `car.stability: { upright: 12, calm: 3 }`. With no wheel on the ground: a turn towards roof-up of 12 rad/s2 for each unit of tilt (the sine of the angle between the car's up and straight up), and its roll and pitch damped by 3 a second; yaw is left alone. With wheels down, nothing new: drive, brake and grip already act through the body's middle, so they cannot roll it. Levers if a test fails, in this order: a bump stop (the spring twice as stiff over its last 4 cm before the underside meets the ground); then an extra pull down while only some wheels touch. **Done 2026-11-17:** neither was needed. The hillside test failed for another reason (the body's corner digging in), fixed by raising `suspension.rideHeight` to 0.26 (see "If step 4 goes wrong") | Four wheels touching on every step over the 200 m crest at top speed (it needs 4.5 of gravity's 9.81 m/s2; at boost speed, 7.6). Onto the 45% hillside at 20 degrees, along it for 3 s and off again: never tipped more than 8 degrees beyond the slope's own 24, never under three wheels down for over 0.3 s. Off the 1 m drop at 10 and at 30 m/s: roof-up 0.95 or more at touchdown, level a second later, under 10% of forward speed lost, within 0.5 m of its line 2 s on. Started 3 m up, rolled 60 degrees and pitched 30: lands on its wheels (roof-up 0.9 or more). The scripted run on seeds 42 and 7 stays roof-up (0.7 or more) and gives one fingerprint in Node, Chromium and Firefox (`e2e/determinism.spec.ts`, as now). A table in STATE.md under "Step 4": top speed, time to 95% of it, braking distance, the three circles, speed up the 15% climb, whether it climbs the 45% hillside from rest and how fast, the cost of a step on seeds 7 and 8 |

### 4d in detail

```
// src/sim/car/steer.ts
// The turn rate the stick asks for, in radians per second; positive is to the left (see "Directions" in "Rules that hold for every part").
turnWanted(steer, speed, car):          // steer from -1 (left) to 1 (right); speed along the car, negative backwards
  size = abs(speed)
  if size == 0: return 0
  rate = min(size / car.steer.minRadius, car.steer.sideForce / size)
  return -steer * sign(speed) * rate
```

- In `car.ts` the last two lines of `step` become `turnGrip(dot(motion.spin, up), turnWanted(pedals.steer, dot(motion.velocity, along), car), share, car, dt)`. `inputFractions` already gives `steer`. Nothing else in `car.ts` changes.
- Config: `SteerConfig { minRadius: number; sideForce: number }` beside `EngineConfig`, and `steer: SteerConfig` in `CarConfig`, with a comment that `sideForce` must stay under `grip.side`.
- **The test driver for the banked ring** (`src/testing/lineDriver.ts`, `stickToward`, which 9a's bot grows from): it aims at a point a set distance ahead on a line. On the map the car faces `f = (fx, fz)` (its nose, flattened and made one long), the point is `d = (dx, dz)` from the car, and its right is `(-fz, fx)`. It asks for the circle through the car and the point (pure pursuit): curvature `k = 2 * (-fz * dx + fx * dz) / |d|²`, and `stick = clamp(k * max(steer.minRadius, speed² / steer.sideForce), -1, 1)`, the stick `turnWanted` turns into `speed * k`. No trigonometry. For the ring, the point is on the middle circle 15 m ahead (`pointOnRing`). **Changed while building 4d:** the plan first had `stick = 2.5 * sin(angle to the point)`, which on the 70 m ring at top speed gives 0.27 of the 0.857 stick needed at the line, so the car would settle about 3.8 m wide; pure pursuit holds the line (4 cm measured).
- **Kerb crossings at an angle**: start the car with `poseOn(ground, x, z, forward, cfg)`, `forward` made from a cross product or written out (5 degrees is `(0.0872, -0.9962)`).

### 4e in detail

```
// src/sim/car/stability.ts: only on a step with no wheel on the ground
uprightChange(up, spin, car, dt):        // the change of spin for one step
  lean = cross(up, WORLD_UP)             // one long times the sine of the tilt, about the axis that brings the roof back up
  tumble = spin - up * dot(spin, up)     // the spin apart from yaw, which is left alone
  return (lean * car.stability.upright - tumble * car.stability.calm) * dt
```

- **Applying a change of spin**: the body is a box, so its inertia is simple along its own axes: `mass * (a² + b²) / 3`, with `a` and `b` the two half-sizes across that axis (about its right axis: half height and half length; about its forward axis: half width and half height; about its up axis: half width and half length, the `turnInertia` `car.ts` already uses). Add `spinBy(change)` to `car.ts`: split `change` along the body's right, up and forward axes, multiply each part by that axis's inertia, put them back together, and `physics.twist` the result. Use it for the yaw twist too.
- Config: `StabilityConfig { upright: number; calm: number }`, `stability` in `CarConfig`.

### If step 4 goes wrong

| Symptom | First thing to try |
| --- | --- |
| Circles too wide at low speed | The turn grip (`grip.turn`, 30) cannot reach the rate in time: raise it |
| The car leans or lifts a wheel in a fast corner | Check every new push goes through the body's middle. Then raise `suspension.damping` |
| The car rolls over driving onto a steep bank at an angle (found in 4e) | The body's bottom corner digs into the slope before the springs can lift it: a speed loss of several m/s in one step gives it away. `suspension.rideHeight` is the lever (raised from 0.18 to 0.26 in 4e, Tane's choice). A bump stop does not help here, because the corner meets the slope before any wheel's spring is near the end of its travel. A box with 15 cm rounded edges fixed it fully in a trial, but gave an unexplained 0.4 m/s jolt on the banked ring, so it was not used |
| A wheel meeting the kerb's upright face pushes the car sideways | The cast's slope there is nearly level. Count a wheel as touching only where its slope is within about 45 degrees of the car's up (`dot(normal, up) > 0.7`); otherwise it is in the air |
| The car drives up slopes no car should (4e measures it on the 45% hillside) | Nothing limits the engine's push by grip today. Add `grip.drive`: the push along the car held to that many m/s² times how hard the wheels press on the ground |
| Jitter or a slow wobble when parked on a slope after 4d | The steering asks for 0 at a standstill, so this is the turn grip: check `turnWanted` returns exactly 0 at speed 0 |
| The scripted run's fingerprint differs between browsers | A sum in `steer.ts` or `stability.ts` uses something inexact; the architecture test should have caught it, so check it is not imported from outside `src/sim` |

## Step 5: drive it

Nothing in `src/sim` changes in this step.

| Part | Build | Done when |
| --- | --- | --- |
| **5a Input** | `src/input/keyboard.ts`: `keysToInput(held)`. `src/input/gamepad.ts`: `padToInput(axes, buttons, cfg)` for the standard mapping only (right trigger, button 7, throttle; left trigger, 6, brake; left stick, axis 0, steering; right bumper, 5, drift; Back, 8, reset; Y, 3, camera and Start, 9, pause are for the page, not the record). `mergeInputs(a, b)`: the larger of each pedal, the steering further from the middle, either button. New `input: { deadZone: 0.15 }`: a stick inside it reads 0, and the rest is stretched to reach 1. **No smoothing anywhere** (the brief) | Unit tests: every key in the brief's table; left and right together give 0; Space and Shift both drift; a stick at 0.15 gives 0, at 0.575 gives a half, at 1 gives 1, and left mirrors right; a trigger at 0.5 gives 128 of 255; `mergeInputs` |
| **5b The loop** | `src/app/drive.ts`: `advance(carried, frameSeconds)` gives how many steps to take (5 at most, the rest dropped) and the blend between the last two states; `blendState(before, after, blend)` (positions straight, turns the short way round). Rapier (`loadRapier`) is fetched beside world generation and the simulation made when both are in. A new island frees the old simulation (`sim.free()`); a Rapier world is not freed by itself | Unit tests: 1,000 frames at 144 a second give 60 steps a second within 1; one frame of a whole second (the tab was hidden) gives 5 steps and carries nothing over; the blend is at least 0 and under 1; a blend of 0 and of 1 give the two states exactly |
| **5c The car drawn** | `src/render/carShape.ts` (plain numbers, unit tested, the pattern of `treeShapes.ts`) and `src/render/carView.ts` (the Three.js wrapper). A low-poly kart built in code: see `docs/VISUAL_BAR.md`. Each wheel is drawn where the simulation says it is (`CarState.wheels[i].at`), so the springs show; the front wheels turn with the stick; the car casts a shadow | Unit tests: the shape lies inside the body's box (1.4 by 0.6 by 2.2 m) apart from the wheels; the wheels sit at `wheelMounts`; under 600 triangles. Screenshots on seeds 1, 3, 7 and 42 looked at beside the pictures of `docs/VISUAL_BAR.md` |
| **5d Chase camera** | `src/camera/chase.ts` as plain numbers, like `flyAlong.ts`. New `camera.chase: { back: 6.5, height: 2.4, lookAhead: 5, lookHeight: 1, follow: 0.15, clearance: 0.8, fieldOfView: 60 }` (the other cameras keep 50). It stands `back` metres behind the car along **the way the car is travelling on the map** (its velocity above 2 m/s, its nose below), `height` up, and looks at a point `lookAhead` in front and `lookHeight` up. Its direction eases to the car's with a time of `follow` seconds, by the frame's own length, so it is the same at any frame rate. It never comes within `clearance` of the ground (`sampleField` on `world.ground`, the idea in `flyAlong.ts`) | Unit tests: 6.5 m behind and 2.4 m up on the flat; after the car turns a quarter circle the camera is within 5 degrees of behind it in 0.5 s; the same place within 1 cm after 2 s at 30, 60 and 144 frames a second; never within 0.8 m of the ground on seed 28496 (the start gate in a gorge) |
| **5e The page** | `worldPage.ts` stays the wiring. The page opens driving. C goes round chase, flying, circling. In the chase view W, S, A, D, the arrows, Space, Shift and R drive; in the flying view Space and the arrows keep their old use. `cam=fly`, `cam=orbit`, `look=`, `at=` and `lap=` open their old views with the simulation not running, so old screenshot addresses give the same pictures as before. `still=1` holds the simulation too. A readout card: speed in km/h and the surface. `window.seedCircuit.drive`: `state()` and `run(steps, input)`, so a browser test steps the simulation itself instead of waiting in real time. Existing tests that assumed the page opens flying get `cam=fly` in their address; so does `e2e/perf.spec.ts` | Browser tests, Chromium and Firefox: the car is on the start line on four wheels (within 0.5 m of `startPose`); W held moves it; `run(300, { throttle: 1 })` leaves it over 20 m/s further down the road; C switches the camera and the hint; each old address still opens its old view; no console errors; the 3-second budget tests still pass. New screenshots `world-<seed>-drive-start.png` and `-drive-5s.png` (after `run(300, …)`), looked at on seeds 1, 3, 7 and 42 |

### 5e in detail: the page

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

### If step 5 goes wrong

| Symptom | First thing to try |
| --- | --- |
| The car stutters at 144 frames a second | The drawing is not blending between the last two states (`blendState`), or the camera follows the raw state |
| The camera shakes in a corner | It is following the car's nose, which the springs rock; follow the velocity on the map, as planned |
| The camera goes into a bank or under the gate's beam | Clearance is from the ground only; the gate's beam is 6 m up, the camera 2.4 m, so it should not meet it. Check `clearance` uses `world.ground`, the fitted ground |
| A browser test of driving takes minutes | It is waiting in real time. Use `drive.run` |
| A controller does nothing in Firefox | Firefox shows a pad only after a button is pressed on it; the page should say "press a button on the controller" |

Then **check-in 1 with Tane**: speed, steering, camera, where the walls are. By then the car steers but does not drift, the walls are hard (step 7 softens them) and nothing brings the car back from the sea (step 8); say so.

## Step 6: drift and boost, the exact rules

**What the car remembers** (`DriftState`, all of it in `hash()` and the snapshot): `phase` (none, hop or slide), `dir` (-1 left, 1 right, 0 none; kept after a slide ends until `slide` is back to 0, because the nose swings back that way), `charge` (steps spent sliding), `hopLeft` (steps of hop still to draw), `slide` (from 0 to 1: how far the nose has swung in), `boostLeft` (steps), `boostTier` (0 to 3, for the flame), `held` (whether the button was down on the last step).

**Starting values:**

```
car.drift: {
  startSpeed: 0.4,                     // share of top speed: 12 m/s (brief: about 40%)
  endSpeed: 0.3,                       // 9 m/s
  steerToStart: 0.3,                   // share of full stick
  hop: { time: 0.15, height: 0.08 },   // seconds and metres; drawn only
  angle: 0.2618,                       // radians: 15 degrees (Tane, 2026-11-17; was 0.42, 24 degrees)
  swing: 0.25, recover: 0.2,           // seconds for the nose to swing in, and back
  radius: { tight: 28, middle: 57, wide: 203 }, // metres, at any speed (6h-4 on the 20 m road; 22/45/160 in 6g; first a turn rate)
  grip: 60,                            // m/s2
  turnGrip: 240,                       // rad/s2: 4 rad/s in one step
  tiers: [1, 2, 3],                    // seconds (brief)
  boosts: [0.5, 1.0, 1.6],             // seconds (brief)
  brakeCancel: 0.5,                    // share of the brake pedal
}
car.boost: { speed: 1.15, accel: 12 }  // times top speed; m/s2 (Tane, 6h: was 1.3 and 30). Steering keeps its top-speed circle above top speed
car.engine.shed: 9                     // m/s2
```

New types in `src/config.ts`: `DriftConfig` and `BoostConfig`, with `drift` and `boost` in `CarConfig`; `shed` joins `EngineConfig`. The two `[1, 2, 3]` lists are tuples of three.

**The rules:**

1. **Start.** On the step the drift button goes from up to down, with the car going forwards at 12 m/s or more and two or more wheels on the ground, the hop begins: 9 steps, drawn only. If the stick is 0.3 or more to one side on that step, the slide starts at once to that side. If it is not, the slide starts on the first of the hop's 9 steps on which the stick reaches 0.3 with the button still down. If the hop ends first, nothing more happens until the button is let go and pressed again.
2. **The direction is locked.** `dir` never changes during a slide, whatever the stick does.
3. **The slide.** `slide` rises evenly from 0 to 1 over `swing` (15 steps). The nose points `angle * slide` into the corner from the line the car travels along. That line is `travel = along * dcos(b) - across * dir * dsin(b)` with `b = angle * slide`, **taking `slide` as it was before this step changed it** (see "The car's step, line by line"). While `slide` is above 0 the tyres take off the speed across `travel`, up to `drift.grip`, and the engine and the brake act along `travel`, on the speed along it. (With `slide` at 0 this is exactly step 4's car.)
4. **Steering sets how tight, not which way.** The path follows a circle towards `dir` of `radius.wide` (160 m) with the stick fully away from the corner, `radius.middle` (45 m) with it in the middle and `radius.tight` (22 m) with it fully into the corner, and evenly between in how much it curves (`pathCurve`, one over the radius). The circle is the same at any speed: the path turns at the speed along `travel` times that curve. **Changed by Tane on 2026-11-17** after the first drive: it was a turn rate (0.25 to 1.5 rad/s), which on a keyboard (always full stick) gave a 20 m circle at top speed and tighter still as the car slowed, so a slide held for a second ran into the barrier. The body's turn rate asked for is the path's plus the rate the nose is swinging, held with `drift.turnGrip` in place of `grip.turn`.
5. **Charge.** `charge` goes up by one on every step of the slide. Tier 1 (blue) from 60, tier 2 (orange) from 120, tier 3 (purple) from 180.
6. **Release.** When the button comes up during a slide: a boost of 30, 60 or 96 steps for tiers 1, 2 and 3, and none below tier 1. If a boost is still running, the longer of the two is kept, with its tier. `charge` goes to 0, `phase` to none, and `slide` falls evenly to 0 over `recover` (12 steps): the nose swings back out while the car carries on along `travel`, which ordinary steering now turns.
7. **Cancel**, with no boost and the charge lost (`slide` falls as in 6): the body touches a wall, the gate, a tree or a rock (6c); the brake is half down or more; the speed along `travel` falls under 9 m/s; a respawn (step 8). **Not** cancelled by: leaving the ground, kerbs, grass, letting go of the throttle.
8. **Boost.** While `boostLeft` is above 0 it falls by one a step, on the ground or in the air. For those steps the top speed is 1.3 times what it would be (39 m/s on the road), the throttle counts as fully down, and the engine's push is `boost.accel` with no easing, never taking the car past that top speed. The brake still brakes.
9. **After a boost.** A car faster than its top speed, with no boost running, slows by `engine.shed` and no further than to its top speed, or by the brake if that is harder, which takes it on past top speed (**changed in 9a**: as first written the brake also stopped at top speed, so downhill, where gravity takes the car a hair over top speed every step, the brake did nothing at 30 m/s). This replaces what 4c does above top speed, and 4c's two tests of that ("holds the car back above top speed…" in `drive.test.ts`) change with it. Below top speed nothing changes: half throttle at 20 m/s still eases off gently. Step 7 uses the same rule when the car runs onto grass.

**Since 6h (Tane's second drive):** the road is 20 m wide; the boost is 1.15 times top speed at 12 m/s², reached in about 0.4 s and shed in 0.5 s; steering keeps its top-speed circle (60 m) above top speed, so a boosted car can follow the road; the circles are 28, 57 and 203 m, the gentlest that pass `corners.test.ts` on the final 20 m worlds (a careful keyboard driver through 97% of corners, one changing key once a second through every hairpin, 96% of plain corners and 87% of chicanes, and 97% of slides driving out 100 m clean with their boost). The paragraph below is the reasoning as it stood before 6h.

**Why these numbers (before 6h).** The corners of seeds 1 to 40, by their tightest point, have median radii of 26 m (hairpins), 34 m (plain corners) and 101 m (sweepers). A keyboard driver that keeps each key at least 0.15 s holds a slide from just after each corner's start to just before its end, on the road, through 95% of the corners of seeds 1 to 20 with circles of 22, 45 and 160 m, and 78% with 30, 50 and 110 m (`src/sim/car/corners.test.ts`, `src/testing/cornerDriver.ts`). (First written: the generator scores a corner as a drift corner when its radius is 20 to 90 m, and a hairpin's widest line on a 12 m road is about 25 m.) Ordinary steering turns no tighter than 60 m at top speed, so every corner the generator banks fully (70 m and wider) is flat out on grip alone and anything tighter needs a slide or a lift: that is what makes drifting the fastest way through a corner (pillar 2). Turning takes a little speed off by itself, because the tyres take off the sideways part of the car's speed on every step: 0.06 m/s at 0.5 rad/s, 0.5 m/s in the tightest slide. With `shed` at 9, a boost is worth about 8, 12 and 18 m of road for the three tiers (a quarter to six tenths of a second); at the coasting rate it would fade for three more seconds and the tiers would hardly differ. The drift grip of 60 m/s² holds the tightest slide at top speed (41 m/s² on 22 m at 30 m/s); at boost speed (69 m/s² at 39 m/s) the tightest slide runs a little wide.

### The car's step, line by line (6b)

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
    path = drift.phase == slide ? -drift.dir * dot(velocity, travel) * pathCurve(drift, pedals.steer)
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

### If step 6 goes wrong

| Symptom | First thing to try |
| --- | --- |
| The car swings wide as a slide starts | The order above: line 6 must use `old.slide`. Then `drift.turnGrip` |
| The slide circles are too wide | The drift grip is the limit (41 m/s² on the 22 m circle at 30 m/s); raise `drift.grip` |
| The car spins out of a slide when it ends | The turn grip drops from 240 to 30 while the nose is still swinging back: use `drift.turnGrip` until `slide` is 0 (line 11 does) |
| A boost lasts too long or too short on screen | Count steps, not seconds; `boosts` turns into steps once, with `Math.round` |
| Two runs from a mid-slide snapshot differ | Something in `CarMemory` is missing from the snapshot or the fingerprint; the test that changes only the drift state finds which |
| The tiers are hard to reach on short corners | Expected: tier 1 needs a second of sliding (about 30 m of road). It is for Tane to judge at check-in 2, with `tiers` on the tuning panel |

| Part | Build | Done when |
| --- | --- | --- |
| **6a The rules** | `car/drift.ts`: `DriftState`, `NO_DRIFT`, `stepDrift(state, asked, cfg)`, a pure function from the state, what is asked (button, stick, brake, speed along `travel`, wheels down, hit) and the config to the next state; `tierOf(charge)`; `pathCurve(state, steer)` (was `pathTurn`, a rate, until 6g) | One unit test for each rule, on the exact step: starts at 12.0 m/s and not at 11.9; not without the stick; the stick arriving on the hop's ninth step starts it and on the tenth does not; not while reversing; a stick thrown the other way mid-slide changes nothing; `pathCurve` gives circles of 160, 45 and 22 m towards `dir` (6g; was `pathTurn` 0.25, 0.875 and 1.5 rad/s); tiers on steps 60, 120 and 180 exactly; boosts of 30, 60 and 96 steps; none at 59; the longer boost is kept; each cancel loses the charge; the brake at 0.49 does not cancel; nothing restarts while the button stays down |
| **6b In the car** | `car.ts` uses `travel`, the path's circle, the drift grip, the boost and the shed; `speedChange` is given the top speed for the step; `Car` gains `save()` and `load()`; `Sim` puts the drift state in `hash`, `snapshot` and `restore`; `CarState.drift` for drawing (phase, dir, tier, slide angle, hop from 0 to 1, boost left and tier) | On the flat at top speed, sliding right and left: circles of 22, 45 and 160 m within 5%, and the same at 20 m/s (6g; were 20, 34 and 120 m at top speed); the nose 15 degrees (was 24) inside the line of travel within 1 degree once swung in; as a slide starts the path never turns away from the corner by more than 1 degree (this is what `turnGrip` and the order of the sums below are for); 97% of top speed or more in the tightest slide. After a 2.1 s slide and release: over 30 m/s on the next step, 39 m/s within 0.4 s, held within 1% to the boost's last step, back under 30.1 m/s within 1.2 s more, never over 39. The top speed is raised on exactly 30, 60 and 96 steps. A snapshot taken mid-slide and one taken mid-boost carry on exactly; two simulations that differ only in drift state have different fingerprints. The scripted run already dabs the drift button, so `e2e/determinism.spec.ts` proves one fingerprint in Node, Chromium and Firefox |
| **6c Hits cancel** | `carBody.ts`: `touching()`, from `world.contactPairsWith` and `world.contactPair` (a manifold with `numContacts()` above 0, its `normal()`), names the solid thing the body is against (wall, gate, tree or rock, by `WorldColliders`) or null; the ground, road and kerbs do not count. `PlainCourse` gains optional walls, posts and balls; new `wallGround()` in `testGrounds.ts` | Sliding into the wall at 20 degrees ends the slide with no boost and `charge` 0; landing hard on the body's underside (the 1 m drop, mid-slide) does not |
| **6d Sparks, flame and hop** | `carView.ts`: the hop drawn from `hopLeft` (an arc 8 cm high); sparks at both rear wheels while sliding from tier 1, in the tier's colour; a flame behind the car while a boost runs, longer for a higher tier. Colours in a new `render.car`. Everything is drawn from the simulation's state and its step count, never the frame clock, so `still=1` repeats. Readout: tier and boost left | Screenshots of each tier and of a boost (reached with `drive.run`), looked at beside `docs/VISUAL_BAR.md`; the same address twice gives the same picture |
| **6e Camera** | `chase.ts`: because it follows the line of travel, a sliding car is already seen turned into the corner; add a swing of `camera.chase.swing` (0.12 rad) to the outside of the corner, eased over 0.3 s, and a field of view of `boostFieldOfView` (70) during a boost, eased over 0.25 s in and 0.5 s out | Unit tests in `chase.test.ts` |
| **6f Tuning panel** | T opens a panel of sliders for `car.engine`, `car.steer`, `car.grip`, `car.drift`, `car.boost` and `camera.chase`, with a button that copies the values as text for `config.ts`. The panel works on its own copy of the config. When a value changes it takes a snapshot, builds a new simulation with the new values and restores into it (about 60 ms). The body, mass, wheels and springs are not on the panel: a snapshot carries the old body | Browser test: moving the top-speed slider changes the speed the car reaches; the copied text holds the value; the shared `config` and every fingerprint are untouched |

## Step 6h: the drift rework from Tane's second drive

Planned in plan mode and approved by Tane on 2026-11-17 (plan file: `C:\Users\tanee\.claude\plans\random-racing-branch-milestone-3-driving-shiny-hamster.md`). **Tane's choices:** a road 20 m wide at the corners (was 12); a short, mild boost (1.15 times top speed at 12 m/s², the times unchanged); steering that keeps its top-speed circle (60 m) above top speed; sparks and boost with CC0 sprites and bloom on the effects only; gentler slide circles, the gentlest that pass the bars in 6h-4. **Found while planning:** steering is held to 15 m/s² sideways, so at the old boost speed (39 m/s) full stick turned only a 101 m circle, and a boosted car could not follow the road out of a hairpin.

| Part | Build | Done when |
| --- | --- | --- |
| **6h-1 Measure** | `cornerDriver.ts`: a `holder` style (the key into the corner from the button to letting go) beside the `careful` one; `driveOut` (100 m on the line driver after letting go, with the boost earned) and `straightLane`, `roadLane`; `CornerRun` gains `keyChanges`, `exitTier`, `exitClean`, `exitHit`. `CarState.touch`. The line driver takes its full-stick circle from `turnWanted`. Throwaway grid on seeds 1 to 20: roads of 12, 16 and 20 m, tight circles of 22, 26, 30 and 34 m (middle and wide in proportion), the boost old and new, with and without the steering cap | `cornerDriver.test.ts`: on `wallGround`, a drive out that meets the wall names it and is not clean, one along a clear lane is clean, one that strays off its lane is not; the holder changes no key. The grid's table in STATE.md and the circles chosen for 6h-4 |
| **6h-2 The track at 20 m** | The layout's distances that set how close sections come (`clearance`, `fold.hairpinWidth`, `stretchedHalfWidth`'s least, `jog.offset`) in road widths, and the smallest corners as the room inside them (`LayoutSettings`, worked out in metres by `trackRulesFor` as `TrackRules`). The width itself is switched in 6h-3, with the road and island checks | Nothing moves at 12 m (identical track fingerprints). At 20 m, seeds 1 to 200: a valid winner each, no fallback; a table of the corner mix, lap lengths and build time at 12 and 20 m. The track tests written from the config's limits |
| **6h-3 The road and the island at 20 m** | `track.roadWidth: 20` and `fold.hairpinWidths: [3, 4.5]` (6h-2's table); `road.coupleDistance`, `road.walls.closeDistance` and the island's look-out for bays and headlands measured from the road's edge; straights widened by 4 to 10 m over the base | The Milestone 2 checks clean on seeds 1 to 20, the 20 fresh seeds and the gorge seeds; the 3 s budget; a table of open roadside, cut, fill and build time. Every reference picture taken again and looked at; `GAME_BRIEF.md`'s road width changed |
| **6h-4 Drift and boost** | `car.drift.radius: { tight: 30, middle: 61, wide: 218 }` (6h-1); `car.boost: { speed: 1.15, accel: 12 }`; `turnWanted` holds the circle it gives at top speed for any faster speed | Full stick at 34.5 m/s turns a 60 m circle within 2%; seeds 1 to 20 on the 20 m road: the careful driver (each key kept 0.15 s) through 95% of corners and 90% of hairpins, plain corners and chicanes; **a driver who keeps each key 0.5 s (about one change a second) through 90% of hairpins, plain corners and chicanes** (Tane, 2026-11-17, in place of the plan's "holder through 80%", which no circles can meet: best 54%); 95% of held slides drive out 100 m clean with their boost, braking for what is coming |
| **6h-5 The look** | Kenney's Particle Pack (CC0), the few sprites used, in `public/effects/` with their licence and SHA-256; selective bloom (`render.bloom`, `bloom=0` turns it off); sparks that grow with the tier, a burst on letting go, tyre smoke, a flame in the boost's tier colour, the kart leaning out of a slide with its front wheels counter-steered, speed lines during a boost | Unit tests of each; the same `still=1` pictures twice byte for byte; bloom on and off differ in under 0.1% of pixels by at most 2 levels at `look=start`; the bloom's cost measured; pictures of the tiers and the boost on seeds 1, 7, 42, 100 and 2024 and at 07:30; `VISUAL_BAR.md` rewritten |

## Step 7: surfaces and bumps

| Part | Build | Done when |
| --- | --- | --- |
| **7a Off the road** | New `car.surfaces: { road: 1, kerb: 1, grass: 0.6, sand: 0.6, rock: 0.6, snow: 0.6 }`: each surface's share of top speed. The car's share is the average over its wheels on the ground, so two wheels on a kerb or the grass cost little. It multiplies the top speed, boost included; the car comes down to it by rule 9 | Unit test of the average. On a grass test ground: top speed 18 m/s within 1% (the brief: about 40% slower); from 30 m/s on the road, under 19 m/s within 1.5 s of all four wheels reaching the grass; two wheels on grass, 24 m/s; a boost on grass, 20.7 m/s (0.6 × 30 × 1.15 since 6h; 23.4 with the old 1.3 boost). **Done 2026-11-20**; reversing is not slowed (Claude's call). On seed 7, a wheel on the beach reads sand and slows the same |
| **7b Walls** | The touch from 6c is kept in the simulation's state (in `hash` and the snapshot) and used on the next step. New `car.bump: { turn: 3, push: 1.5, again: 0.5 }` (see "Step 7 in detail" for the name): while the body touches a wall or the gate, the turn rate asked for gains up to `bump.turn` rad/s, in proportion to how squarely the nose points into the wall, turning it along the wall; and on a new hit (none in the last `bump.again` seconds) the car is pushed off the wall at `bump.push` m/s. **These two rules are untried**: Rapier already stops the car going through, with the body's own grip of 0.2, and the tests decide what more is needed | On `wallGround()` at top speed: a 30-degree hit leaves 21 m/s or more (70%) a second later, within 10 degrees of the wall's line, roof-up, not touching, and at no step through the wall; a 10-degree brush keeps 90%; head on, the car stops, rolls back at 1 to 2 m/s, stays roof-up and can reverse away. The sloping end of a wall met head on at 30 m/s does not launch the car (under 0.5 m of height gained, lands on its wheels); if it does, make the end's collider blunt in `wallColliders`: colliders are not part of the world fingerprint |
| **7c Trees and rocks** | Decided: the wheels do not feel rocks, the body does. No new rule unless a test needs one | A trunk met head on, and half a metre off centre, at 30 m/s: under 3 m/s a second later (head on), roof-up 0.95 or more throughout, never turning faster than 6 rad/s, never inside the trunk. A flat rock (0.3 m high) crossed at 18 m/s: roof-up 0.8 or more throughout, on its wheels and level 2 s later. A tall rock stops it like a tree |
| **7d Kerbs** | No new rule | The kerb's upright outer face crossed from the grass at 5, 20 and 45 degrees, at 18 and 30 m/s: under 3 degrees of heading and 3% of speed lost. A slide across a kerb carries on with its charge |

### Step 7 in detail

- **7a**: `surfaceShare(wheels, car)` in `car/surface.ts`: the average of `car.surfaces[wheel.surface]` over the wheels that touch, 1 with none touching. It feeds `top` (line 8 of "The car's step"), so nothing else changes. Config: `SurfaceConfig` (a share for each `Surface`).
- **7b as built (2026-11-20, Claude's calls):** the turn is `bump.turn × (into + bump.away) × along`, where `along = dot(up, cross(facing, n))` (how far the nose points along the wall, signed), and nothing once `into + away` is 0 or less; `bump.away` 0.05 turns the nose on to about 3 degrees off the wall, so a car pressed flat against it leaves it, and the factor `along` makes it fade to nothing dead head on. The sloping ends of walls are blunt (`wallBox`: each piece level at its higher end). The rule as first written follows.
- **7b, the wall's turn**: with `n` the contact's slope from `touching()`, flattened onto the map and pointing out of the wall towards the car, and `facing` the car's nose: `into = -dot(facing, n)` (above 0 when the nose points into the wall). The turn that brings the nose along the wall has the sign of `dot(up, cross(facing, n))`, and its size is `car.bump.turn * into`. It is added to `wanted` (line 11) while touching. **The push**: on a new hit (none in the last `bump.again` seconds, counted in steps and remembered in `CarMemory`), `push(n * mass * max(0, bump.push - dot(velocity, n)))`. A drift is already cancelled by the hit (6c). Config: `BumpConfig`, the block `car.bump` (not `WallConfig`: that name is taken by `road.walls`, the generator's).
- **7c**: if the tree test shows the car spinning on a trunk, the lever is the body's own grip (`car.body.grip`, 0.2) and bounce (0), not a new rule.
- **7d as built (2026-11-20, Tane's choice):** at damping 0.8 the face crossed at 30 m/s threw the front wheels up (4.2 degrees at 20 degrees to the kerb, 3.2% of speed at 30 degrees); `car.suspension.damping` is 0.5, and the test also crosses at 30 degrees.
- **7c as built (2026-11-20, Tane's choices):** the grip and bounce only made the spin worse, and rocks as domes threw the car up to 5 m, so rocks the body can reach are upright posts at least 1 m tall (`rockPost`; rocks of 0.2 m or less are not hit), and after a hit on a wall, the gate, a tree or a rock the body's whole turning is held to `bump.spin` (6 rad/s, `Car.settle`). The flat-rock test became: a rock under the body's clearance is passed over at 18 and 30 m/s; rocks of 0.3, 0.6 and 1.2 m stop the car like a trunk.

### If step 7 goes wrong

| Symptom | First thing to try |
| --- | --- |
| A glancing wall hit stops the car dead | The body's grip on the wall: lower `car.body.grip`. Then the wall's turn |
| The car climbs the wall | A wheel is meeting the wall's top: the wheels must not feel walls (they do not: `WHEEL_GROUPS` in `colliders.ts`), so it is the body riding up. Lower the body's grip; check the sloping wall end separately |
| The car bounces back off walls | `car.body.bounce` should stay 0; reduce `bump.push` |
| Grass slows the car too suddenly | Rule 9's `shed` (9 m/s²) is the rate; it is meant to be quick |

## Step 8: progress and respawn

| Part | Build | Done when |
| --- | --- | --- |
| **8a Place on the lap** | `src/sim/track/progress.ts`. The car's place: metres along the lap from the start line, and metres to the right of the centre line (`world.track.candidates[winnerIndex].line`, the arrays `startPose` reads). It is looked for within 40 m along the lap of the last place; only when the car is more than 30 m from the line there is the whole lap searched. **Checkpoints** every 100 m (the lap divided evenly into the nearest whole number of them): one is passed when the place goes forwards past it with the car within half the road's width plus 6 m of the centre line, and only the next one in order can be passed. Remembered, in `hash` and the snapshot: the place, the last checkpoint, how many have been passed | On seed 7 and on a folded seed with sections 40 m apart: a car moved round the centre line has a place that only rises, with every checkpoint passed in order; a car set down on the section next door is not mistaken for being there; a cut across the grass that misses a checkpoint does not pass the one after it; reversing over one does not count |
| **8b Respawn** | New `sim.respawn: { delay: 1, waterDepth: 0.5, edge: 20, flipped: { roofUp: 0.3, time: 1 }, stuck: { speed: 0.5, time: 3 } }`. A wait of `delay` (60 steps) starts when: the car's middle is 0.5 m or more under the sea (height 0); it is within 20 m of the tile's edge or 30 m under the sea; its roof-up has been under 0.3 for 1 s; or a pedal has been down for 3 s with the car slower than 0.5 m/s. During the wait the pedals and stick do nothing. Then the car stands at the last checkpoint passed (the start pose before any): on the centre line, facing along the lap, tipped with the road, at its ride height, still, with no drift, charge or boost (`poseAlong(world, cfg, metres)`, made from `startPose`). R, on the step it goes down, does the same with no wait | On real seeds with an opening onto the sea (7 and 9; find the place with a helper in `testing/checkSeeds.ts`): driven in, the car is at the last checkpoint, still, on four wheels and facing along the road, 60 steps after it went under. One test for each of the other triggers and for R. A car holding the brake at a standstill is never "stuck". A snapshot taken during the wait carries on exactly |
| **8c The page** | A short fade to white and back over the respawn; the readout shows the place on the lap | Browser test: `drive.run` into the sea and back to the checkpoint; no console errors |

### Step 8 in detail

- **The line**: `line = world.track.candidates[world.track.winnerIndex].line` (`count`, `spacing`, `length`, `x`, `z`, `tx`, `tz`, `curvature`); the road's width at each sample is `world.road.width`.
- **The place** (`placeOnLap(line, x, z, near)`): look at the samples within 40 m of sample `near` (wrapping round the lap) for the one nearest `(x, z)`, call it `j`. Then `along = j * spacing + dot(p - p_j, t_j)`, wrapped into 0 to `length`, and `off = dot(p - p_j, (-tz_j, tx_j))` (metres to the right). If `|off|` is over 30 m, look at every sample instead (a few thousand: cheap enough for the rare step it happens).
- **Checkpoints**: `n = round(length / 100)`, checkpoint `k` at `k * length / n`. Checkpoint 0 is the start line. The car starts 4 m behind it with `next = 0`, so the first thing it passes is the line. Checkpoint `next` is passed on the step `along` goes from before it to at or after it (moving forwards, by under 40 m, allowing for the wrap at the line) with `|off|` at most half the road's width plus 6 m; then `next = (next + 1) % n` and `passed` goes up by one. Milestone 4 counts a lap when `next` comes back round to 1 having passed all `n`.
- **8a as built (2026-11-21, Claude's calls):** the place is taken between the two samples either side of the car (the share of the way where it is square to the line, the direction turning evenly between them), not `j * spacing + dot(...)`, which steps back a few centimetres on the outside of corners; the whole lap is searched when the nearest sample in the window is over 30 m away, not when `|off|` is; the folded seed is 147 (sections 67.5 m apart centre to centre on the 20 m road, the closest of seeds 1 to 200). `ProgressState` sits in the simulation beside `CarMemory`, and the last checkpoint passed is worked out from `next` and `passed`.
- **Remembered** (in `CarMemory` or a `ProgressState` beside it, in the fingerprint and the snapshot): `near` (the sample last found), `along`, `off`, `next`, `passed`, the last checkpoint passed, and for 8b `waitLeft`, `flippedFor`, `stuckFor` (steps).
- **The respawn pose**: `poseAlong(world, cfg, metres)` in `sim/start.ts`, the general form of `startPose` (which becomes `poseAlong(world, cfg, -sim.start.back)`): the height read between the two samples either side, the climb from them, the bank from `world.road.cross` at the nearer sample. A test checks `startPose` gives exactly what it gave before.
- **Putting the car there**: `CarPhysics.place(pose)` in `carBody.ts`: the body's position and turn set, its speed and spin set to 0 (look the setter names up in `rigid_body.d.ts`). `sim.step` does it at the start of a step, then the step carries on with nothing pressed.
- **R** is the input record's `reset` bit, so a ghost replays it.
- **8b as built (2026-11-21, Claude's calls):** `poseBehind(world, cfg, sample, back)` (a sample and a distance behind it, not plain metres, so `startPose` stays exact to the last digit), and `checkpointPose(world, cfg, k)` from the sample at or just past the checkpoint, its bank read there; before any checkpoint is passed a respawn goes to the island's start pose, or on a test ground to the `home` pose `createSimOn` is given (its start unless another); a wait's start cancels the drift and any boost (`Car.halt`), so the button let go during the wait gives none; the respawn's reason is kept (`why`: water, lost, flipped, stuck) for the tests and the readout; "stuck" counts the throttle or the brake. The seeds with an opening onto the sea are 9 and 18: seed 7 has none within 150 m of the sea on the 20 m road.

### If step 8 goes wrong

| Symptom | First thing to try |
| --- | --- |
| The place jumps to the section next door on a folded track | The 40 m window is too wide for that seed's spacing of sections (the generator keeps them 40 m apart centre to centre at the least); narrow it to 25 m |
| A respawned car drops or bounces | It is placed at ride height on a banked or sloped road: check `poseAlong` tips it with the road, as `startPose` does |
| A car in shallow sea is never respawned | The sea is at height 0 in the island's own heights; check the car's middle against 0, not the ground |

Also answer in this step, from step 2's list: can the car drive back up a 40% hillside onto a mountain road (4e's table says whether it climbs 45% on the road's grip; grass takes 40% of its top speed, not its push), and does a long slide down one need a respawn (the "stuck" rule should cover it).

## Step 9: the bot and the corner proof

| Part | Build | Done when |
| --- | --- | --- |
| **9a A bot that laps** | `src/testing/botDriver.ts` (test code, never shipped). It steers at the point on the centre line 6 m plus half a second of travel ahead of its place (`stickToward` from 4d: the circle through the car and that point). It brakes for what is coming within 80 m: the speed a corner allows is the square root of 0.9 × `sideForce` × its radius | Seeds 1 to 20 in Node, one lap from the start line and one flying lap: every lap finished, **0 respawns**, 0 wall touches, four wheels on road or kerb for 98% of the lap. A table in STATE.md: lap time, average speed, wall touches, seconds off the road |
| **9b Drifting where told** | The bot slides through corners that turn 45 degrees or more with a radius of 90 m or less (the generator's own drift corners): button and stick from 10 m before the corner, the stick then holding the centre line, release when 15 degrees of the corner are left | Three real corners each of hairpin, sweeper (70 to 110 m), chicane and plain corner, from seeds 1 to 20, the 3 km 15% seeds among them: from 40 m before the corner to 120 m after it, the pass with the slide is quicker than the best pass without, with four wheels on road or kerb and no wall touched. The lap with slides is quicker on all 20 seeds. A table in STATE.md, by corner type: time and exit speed with and without. **This table is the evidence for the milestone's "drift-boost works through every corner type"** |
| **9c Same everywhere** | The inputs of the sliding lap on seeds 1 and 7, recorded in Node (`packInput`) and replayed through `window.seedCircuit` | One fingerprint in Node, Chromium and Firefox |

### Step 9 in detail

- **Where it runs**: the bot is test code (`src/testing/botDriver.ts`), run from unit tests in Node. It reads the simulation's state and returns a `RawInput` each step, so a lap is a list of inputs that can be packed (`packInput`) and replayed anywhere (9c).
- **Steering**: `stickToward` (`src/testing/lineDriver.ts`) from 4d, aiming at the point on the centre line `6 + 0.5 * speed` metres ahead of its place (8a).
- **Speed without sliding**: for each sample from its place to 80 m ahead, at distance `d`, the speed allowed there is `sqrt(0.9 * steer.sideForce / |curvature|)` (no limit where the curvature is 0), and the speed it may have now to brake down to it in time is `sqrt(allowed² + 2 * 0.7 * brake.strength * d)`. The target is the least of those and the top speed. Throttle 1 when more than 0.5 m/s under the target, brake (by how far over, up to 1) when more than 0.5 m/s over, otherwise throttle to hold.
- **The corners** come from the winner's analysis: `world.track.candidates[winnerIndex].sections`, the `CornerSection`s, with `kind` (hairpin, sweeper, chicane, kink, corner), `startIndex`, `sampleCount`, `turnDegrees`, `minRadius`, `direction`.
- **Sliding (9b)**: for a corner of 45 degrees or more and 90 m or less, from 10 m before `startIndex`: press the drift button with the stick towards the corner (it needs 12 m/s). In the slide, the path turn wanted is `speed * |curvature|` at its place, and the stick that asks for it is `2 * (rate - wide) / (tight - wide) - 1`, towards the corner, plus 0.1 for each metre it is off the line, back towards it, held to full. Release when the turn left in the corner (its curvature times spacing, added over the samples to its end) is 15 degrees or less.
- **"The best pass without"**: the same bot without sliding, run from the same place and speed, with its 0.9 safety margin tried at 0.9, 1.0 and 1.1, and the quickest that stays on the road and off the walls taken.
- **The table's numbers**: time from 40 m before the corner to 120 m after it, and speed at 120 m after, with and without, for each corner, then the middle and the worst of each kind.

- **9a as built (2026-11-22):** `src/testing/botDriver.ts` (`createBot`, `targetSpeed`, `aimDistance`, `pointAlong`, `pedalsFor`, `lapRun`); the corner speed sum is `cornerLimit` in `testing/lineDriver.ts`, shared with the corner driver's `roadLane.limit`. The bot first touched walls on 8 of 20 seeds: braking into a hairpin downhill did nothing at top speed (rule 9 as first written, fixed in `speedChange`). With the brake fixed every lap is clean, with no change to the bot.
- **9b as built (2026-11-22, Claude's calls on the bot, test code):** in a slide the bot asks for the slide circle through the car (along its line of travel) and a point 12 m ahead on the centre line, as the keyboard corner driver does (`stickForCurve`, the inverse of `pathCurve`), not the path's curvature plus 0.1 of stick a metre (written for 6b's turn rates). It does not brake for a corner it will slide through, and while a boost runs it holds the car's own raised top speed. As a player would, it presses 10 m before the corner only if the road there is not still turning the other way (tighter than a 500 m circle), and only once its own line turns into the corner (a slide curves only that way, so a car heading for the inside edge cannot steer back out); it waits for the nose to come back before a slide to the other side; and once a slide is cancelled it drives the rest of that corner on grip. Before the slide starts it steers on its line with at least 0.35 of stick into the corner, so the press picks the side. **Both passes of the corner proof are the best of the bot cornering on grip at 0.9, 1.0 and 1.1**, not only the pass without: the 120 m after a corner can hold another one that neither slides through (seed 20's 65 m corner is followed by a 30 m one). The sweepers are 70 to 90 m, since the slide rule stops at 90 m. The proof is `sim/car/cornerProof.test.ts`, the laps `sim/car/slidingLaps.test.ts`.
- **9c as built (2026-11-22):** in `e2e/determinism.spec.ts`, the bot's lap with slides on seeds 1 and 7 is worked out in Node inside the Playwright process and replayed on the 3D page (`seed=<s>&still=1`) through `drive.replay`, 600 steps at a time, the fingerprint compared after each chunk and at the end; the lap must be finished on the page too. It was seen failing on a deliberate fault (one step's input changed half way on the Node side): it failed in the chunk holding that step, in both browsers, and matched in every chunk before it.

### If step 9 goes wrong

| Symptom | First thing to try |
| --- | --- |
| The bot runs wide on hairpins without sliding | Its 0.9 margin, then its look-ahead. It is test code: tune it, not the car |
| Sliding is slower than not sliding on some kind of corner | That is the finding the step exists for. Tune `drift.turn` and `drift.grip`, then the tiers, and say so to Tane at check-in 2 with the table. Do not change the bot to hide it |
| A respawn on a 15% mountain seed | Look at where: off a cliff edge (an open roadside?) or stuck on a bank. Record it in the table; 0 respawns is part of "done" |

Then **check-in 2 with Tane**: the feel of the drift, with the tuning panel.

## Step 10

| Part | Build | Done when |
| --- | --- | --- |
| **10a Tuning** | Tane's numbers from check-in 2 into `config.ts`, in four parts (below) | Step 9's tables run again and still pass; the new tables in STATE.md |
| 10a-1 Why a drift ended | `DriftState.ended` (let go, wall, gate, tree, rock, brake, slow, respawn) and `ends`, in the fingerprint and the snapshot; the readout says "drift cancelled: hit a wall" and so on for `render.cancelShown` (2 s) after a cancel | One test per reason on the exact step; the wall slide on `wallGround` ends `wall`; a respawn's wait `respawn`; the fingerprint sees both fields; browser test: a slide braked shows "braked" for 2 s; pictures on seeds 1, 7, 42 |
| 10a-2 Tests that follow the config | Run-ups, hold times, ground sizes, circles and the bots' look-ahead worked out from the config, not sized for 30 m/s | Every test passes at today's config, and step 9's tables come out the same. Left for 10a-4: 95% of top speed in 3.5 to 4.5 s, wheels down over the 200 m crest at top speed, 97% of top speed in the tightest slide, a tier 1 boost reaching boost speed in its 0.5 s. **Done 2026-11-22**: every size the larger of the old one and the config's, so nothing moves at 30 m/s (`runUp`, `distanceIn`, `circleAt`, `reachFor`) |
| 10a-3 Measure | Throwaway grid at 53 m/s: `steer.sideForce` 15 to 22, with and without a downforce trial; `drift.grip` 60, 100, 135; start and end speeds as shares or as today's 12 and 9 m/s | The table in STATE.md; Tane picks |
| 10a-4 The new speed | `engine.topSpeed` 53 and Tane's picks | Every test passes; `laps`, `cornerProof`, `slidingLaps`, `corners` at the new config; one fingerprint in every browser; step 9's tables again in STATE.md. **Done 2026-11-22**: steering grip 25, tyre grip 35, downforce 0.0025, an odd wheel's ground direction steadied (`steadyNormals`); the test drivers brake for the corners they slide through as a player would (`cornerLimit`'s slide grip, `enterWhole`, `aheadOnly`); four tests changed with Tane's say (see STATE.md, "10a-4") |
| 10a-5 Tane's drive after 10a-4: measure | Throwaway: an island-like road edge (road, apron, kerb and skirt, grass 0.25 m down, wall 1.65 m out); the kerb crossed from the grass at 0 to 31 m/s, walls hit at 10 to 60 degrees at 30 and 53 m/s, trunks; the same on `34e4184`; kerb, hit and tier options | The cause and the tables in STATE.md ("10a-5"); Tane picks. **Done 2026-11-22**: the grass beside the road is 25 cm low and the body rides 26 cm up, so the kerb's skirt and the road's edge are steps at body height |
| 10a-6a Hits and kerbs | Tane's picks from 10a-5 but the cap: the body's box from 0.15 m above its floor, the damper's closing speed capped at 4 m/s, turning and lift held for 0.25 s after a hit; `roadEdgeGround`, an island's road edge built by the generator's own code | Tests first, seen failing: grass to road over a kerb and a bare edge from rest to grass top speed; the clipped trunk; every test passes; one fingerprint in every browser. **Done 2026-11-22**; found the wall seams |
| 10a-6b Wall seams, then the cap of 3 | Measure: walls as a triangle mesh with `FIX_INTERNAL_EDGES`, a round-edged body box, longer boxes for straight runs; Tane picks; then `bump.spin` 3 | Walls with a kerb in front and bare at 5, 10 and 30 degrees at 53 and 32 m/s: low, level, along the wall a second later with 70% of its speed; 60 degrees never spun round; every test passes |
| 10a-7 Boost tiers | Tane's pick (likely 0.5, 1 and 1.5 s; boosts unchanged) | `drift.test.ts`'s step counts and the two `drifting.test.ts` tests sized to the old tiers read the config; the corner proof and sliding laps measured again; drive pictures on several seeds |
| **10b Speed** | `npm run perf` with the chase view added to its views | 16.7 ms a frame or less on High at 1080p on the Arc graphics; a step under 1 ms on seed 8 (the most wooded) |
| **10c Docs and the pull request** | README, CLAUDE.md (controls, addresses, commands), STATE.md and the plan, one pull request for the milestone | Tane's playtest sign-off, then merge |
