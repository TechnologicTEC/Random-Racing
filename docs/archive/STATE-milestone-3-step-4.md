# Milestone 3, step 4: the record

Moved here unchanged from `docs/STATE.md` on 2026-11-17, when step 5 was done, so that STATE.md can still be read in one go (25,000 tokens). The decisions these parts made are still in STATE.md's "Decisions"; what the car does is in the code and its tests.

## Step 4: springs, engine, steering and grip (2026-11-16 and 17, done)

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

### 4e: stability and the whole car

The car lands on its wheels. In `src/sim/car/stability.ts`:
- `uprightChange(up, spin, car, dt)`: on a step with no wheel on the ground, the body is turned towards roof-up by `stability.upright` (12 rad/s²) for each unit of tilt, and its roll and pitch are damped by `stability.calm` (3 a second). Yaw is left alone.
- `twistFor(change, rotation, car)`: the turning push that changes the spin by a given amount, using the box's inertia about each of its own axes. `car.ts` gives every change of spin through it (`spinBy`), the steering's yaw included. With wheels down nothing new acts.

**Settings:** `car.stability: { upright: 12, calm: 3 }` (`StabilityConfig`). **`car.suspension.rideHeight` is now 0.26 (was 0.18)**, see below.

**Found: driving onto the 45% hillside at an angle could roll the car over.** It is not the air: at 20 degrees and 18 m/s the car meets the slope's foot side-on at 6 m/s, so the ground under its right wheels rises at 2.8 m/s. The springs cannot lift that side fast enough, the body's front corner (10 cm outboard of and 30 cm ahead of the wheel) digs into the slope, and the kick rolls the car 62 degrees. The car lost 4.7 m/s in that one step. Mapped over 261 crossings (5 to 25 degrees, 9 to 30 m/s, run on the hillside test ground):

| Tried | Crossings that fail | Worst tilt |
| --- | --- | --- |
| As it was (ride height 18 cm) | 40 | on its roof |
| Ride height 22 cm, damping 1.0 | 4 | 164 degrees |
| **Ride height 26 cm** | **1** | **44 degrees** |
| Ride height 30 cm | 1 | 50 degrees |
| Wheel balls of 12, 15 and 20 cm | 32, 27, 24 | on its roof |
| Body with 15 cm rounded edges (same size, same inertia) | 0 | 28 degrees |

A bump stop, the plan's first lever, would not have helped: the corner meets the slope while the springs are still 2 cm or more short of where it would start. The rounded body fixed every crossing but gave an unexplained 0.4 m/s upward jolt on the banked ring with all four wheels down, so it was not used. **Tane chose ride height 26 cm**: every test passes, and the car will be drawn 8 cm higher than planned (5c).

**Also found: the car drives straight up the 45% grass hillside from rest**, at 26 m/s after 4 s. Nothing limits the engine's push by grip, and the slope help makes up half the climb. 7a's grass slowdown will cap it at 18 m/s. Whether it should climb at all is for step 8 and check-in 1 (known issues).

The whole car, measured (throwaway code, deleted):

| What | Measured |
| --- | --- |
| Top speed; time to 95% of it | 30.000 m/s; 3.98 s |
| Braking from top speed | 22.3 m |
| Full stick circles at 7.4, 14.9 and 29.9 m/s | 6.00, 14.88 and 59.75 m |
| The 15% climb | 29.30 m/s (97.7% of top speed) |
| The 45% grass hillside, straight up from rest | Climbs: 7.3 m/s after 1 s, 25.9 m/s after 4 s, 23.5 m higher |
| Onto the 45% hillside at 20 degrees, 18 m/s, along it 3 s and off | Most tilt 24.7 degrees (the slope is 24.2); never under three wheels down for more than 1 step |
| The 200 m crest at top speed | Four wheels down throughout, the lightest still 2.8 cm squashed |
| The 1 m drop at 10 and 30 m/s | 17 and 24 steps in the air; roof-up 0.965 and 0.997 at touchdown, level a second later; speed lost 0.4% and 0; on its line |
| Dropped from 3 m, rolled 60 and pitched 30 degrees | Roof-up 0.999 when the first wheel touches |
| Scripted run, lowest roof-up | Seed 42: 0.843, seed 7: 0.971, seed 8: 0.974 |
| One step of the scripted run, with a state read each step | Seed 42: 0.36 ms, seed 7: 0.49 ms, seed 8 (the most wooded): 0.94 ms |

Tests: `stability.test.ts` (the sums) and `upright.test.ts` (the crest, the hillside, the drop at two speeds, the tipped fall, the scripted run on seeds 42 and 7). Seen failing before the code: the pure tests on the missing module, and the hillside, the 10 m/s drop, the tipped fall and seed 42's scripted run (roof-up 0.57). 1,986 unit tests pass, and all 276 browser tests passed in one run.
