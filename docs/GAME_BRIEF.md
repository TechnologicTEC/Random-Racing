# Seed Circuit — game design brief

Nov 10, 2026 · @delta

## Overview

Seed Circuit is a single-player kart racer for desktop browsers where every race happens on a brand-new world and track, both generated from one number: the seed. You drift through corners to charge speed boosts, chase your best lap against a ghost of your previous run, and save any seed you love to race again.

Version 1 is a solo time trial. AI opponents and multiplayer come later, but the code is structured for them from day one. "Seed Circuit" is a working title.

## Design pillars

When a decision is unclear, pick the option that best serves these five principles.

1. **Every seed is a new place.** Variety comes from generation, not hand-made content.
2. **Drifting is the core skill.** Easy to start, satisfying to master, and always the fastest way through a corner.
3. **Generated tracks must be fun, not just valid.** Boring or awkward layouts are rejected before the player sees them.
4. **Instant to play.** Open a browser tab and be racing within about 10 seconds, with nothing to download.
5. **Same seed, same everything.** Determinism is what makes saving, ghosts, sharing and future multiplayer possible.

## Driving and drift-boost

The car handles like a Mario Kart kart: grippy and forgiving by default, with drifting as the skill that separates a good lap from a great one. All numbers below are starting points to tune by feel, kept together in one config file.

### Controls

| Action | Keyboard | Controller |
| --- | --- | --- |
| Accelerate | W or Up | Right trigger |
| Brake and reverse | S or Down | Left trigger |
| Steer | A/D or Left/Right | Left stick |
| Drift | Space or Shift (hold) | Right bumper (hold) |
| Reset to track | R | Back/View |
| Change camera | C | Y/Triangle |
| Pause menu | Esc | Start/Menu |

### Drift-boost

- Hold drift while steering above about 40% of top speed to start a drift. The car hops slightly and slides at an angle.
- During a drift, steering changes how tight the slide is rather than its direction, so you commit to a corner.
- Charge builds in three tiers, shown by spark colour: blue at about 1 second, orange at about 2 seconds, purple at about 3 seconds.
- Releasing gives a boost of about 0.5, 1.0 or 1.6 seconds for the three tiers.
- Hitting a wall or braking hard cancels the drift and loses the charge.
- A well-timed throttle press during the start countdown gives a small starting boost.

### Surfaces and recovery

- Grass and sand cut top speed by about 40%, so cutting corners rarely pays.
- Barriers along the track edge bounce the car back gently instead of stopping it dead.
- Falling into water or off the map respawns the car at the last checkpoint after about 1 second.
- The car should never flip in normal driving; use stability assists so it lands on its wheels.

### Camera and feel

- A chase camera that swings outward during drifts and widens its field of view during boosts.
- Speed effects such as subtle motion lines, drift sparks, tyre smoke and boost flames.
- Input must feel instant: no smoothing delay on steering or throttle.

### Physics approach

Use Rapier for the car body, raycast suspension and collisions, with a custom arcade layer on top that controls sideways grip, drifting and boost. The simulation runs at a fixed 60 steps per second so it behaves the same on every computer.

## Procedural world

The world builds on the island demo already made in Claude (saved in the repo as `reference/island-demo.html`), scaled up to hold a full race track.

- **Carried over from the demo:** noise-based terrain with beaches, grass, rock and snow; a water shader with waves, sun reflections and shore foam; wind-blown grass that wraps around the camera; low-poly instanced trees and rocks; drifting clouds that cast shadows; and a day/night lighting cycle.
- **Scale:** an island roughly 1.2 km across, large enough for a 1.4 to 2.4 km lap. The demo's 420 m island needs a larger heightmap, with more detail near the track and less far away.
- **Time of day:** chosen by the seed, with an option for the player to pick it.
- **Biomes:** one coastal island biome in version 1. Others (desert canyon, snowy pass, night city) come later.
- **Shaped around the track:** the terrain is cut and filled to fit the road, not the other way round. See the next section.
- **Style:** stylised low-poly with flat shading, built in code. No photorealism and no image files needed for the world itself.

## Procedural track generation

Each seed generates about 30 candidate tracks, rejects any that break the rules, scores the rest on how fun they are, and keeps the best one. The pipeline runs in this order:

1. **Random streams.** Split the seed into separate random streams for world, track and decoration, so tweaking one part of the generator doesn't reshuffle the others.
2. **Layout.** Place 10 to 18 control points around a loop, push them in and out with noise, and run a closed Catmull-Rom spline through them to get the centre line.
3. **Validate.** Reject layouts that cross themselves, have corners tighter than about 15 m radius, bring separate sections closer than about 2.5 track widths, or fall outside a 1.4 to 2.4 km lap.
4. **Score.** Reward at least two straights over 150 m (for boosting and, later, overtaking), a mix of hairpins, sweepers and chicanes, corners that suit drifting, some elevation change, and good flow between corners. Show the scores in a debug view.
5. **Elevation.** Sample the terrain along the line, smooth it, keep gradients under about 8%, and avoid sharp crests that launch the car by accident.
6. **Fit the terrain.** Flatten a corridor to the road's height, then blend in cuttings and embankments over 10 to 25 m. Where the road sits more than about 6 m above ground or water, build a bridge; where it sits more than about 8 m below the surface, build a tunnel.
7. **Build the road.** A 12 to 14 m wide road, banking of up to about 8 degrees in fast corners, kerbs on the apexes, barriers along the edges, a start/finish gate, and invisible checkpoints about every 100 m for lap validation and respawning.
8. **Decorate.** Clear trees and rocks from the road corridor and place trackside props.

A 2D top-down debug view, toggled with a key, shows the centre line, rejected candidates and the score breakdown for the current seed.

## Seeds, saving and ghosts

A track is fully defined by its seed plus the generator version, so saving and sharing a track means saving two numbers.

- **Seeds.** Show the seed on screen and let the player type one in. A shareable code combines version and seed, for example `v1-48213`. Each track also gets a generated name, like the island demo's.
- **Determinism rules.** Generation uses only the seeded random number generator, never `Math.random`. Physics runs on a fixed timestep with no dependence on frame rate.
- **Generator versions.** Changing the generator changes what old seeds produce. Keep each released generator version available so saved favourites still rebuild exactly, or at minimum store a snapshot of the track's centre line with each favourite.
- **Favourites.** A saved list of seed, version, track name, personal best and date, kept in browser storage.
- **Ghosts.** Record the player's inputs every physics step (throttle, brake, steering, drift), plus an occasional position snapshot to correct drift. Replay them on the same seed as a see-through car with no collisions. Keep the best ghost per seed in IndexedDB.

## Version 1 scope

Version 1 is a complete solo time trial: generate a track, race 3 laps against your own ghost, and save the tracks you like.

| In version 1 | Not in version 1 |
| --- | --- |
| World and track from a random or typed-in seed | AI opponents |
| One car with drift-boost | Multiplayer |
| 3-lap time trial with countdown, lap and sector times | Items or weapons |
| Ghost of your personal best per seed | Car choice or customisation |
| Favourites list | Phones and touch controls |
| Keyboard and controller support | Underground caves |
| Menus: new track, enter seed, restart, pause, settings | Biomes other than the coastal island |
| Basic sound: engine, drift screech, boost | Online leaderboards |
| Desktop Chrome, Edge and Firefox | Track editing |

## Technical direction

Build it as a TypeScript browser game with Three.js for graphics and Rapier for physics, keeping generation, simulation and rendering strictly separate.

### Stack

- **Vite** for the dev server and builds, with **TypeScript** throughout.
- **Three.js** for rendering, installed from npm at a pinned version.
- **Rapier** (`@dimforge/rapier3d-compat`) for physics and the raycast vehicle.
- **Vitest** for unit tests on the generators and simulation.
- **Playwright** for automated screenshots and smoke tests across several seeds.

### Architecture rules

- **Generation is pure.** Seed in, plain data out, with no Three.js imports. This keeps it testable, lets it run in a Web Worker so the game doesn't freeze while generating, and lets a future server generate the same track.
- **Simulation is separate from rendering.** The game logic runs at a fixed 60 steps per second on plain data; rendering only reads that state and smooths it between steps.
- **Input is one small record per step.** Keyboard and controller are translated into the same input record. This is what ghosts save, and what multiplayer would send over the network later.
- **Simulation state can be saved and restored.** Needed later for multiplayer and handy for debugging now.
- **Tuning values live in one config file.** Car handling, drift timings and generator limits, so they can be tweaked without hunting through code.

### Performance targets

- 60 frames per second at 1080p on a mid-range laptop, with a lower graphics setting for weaker machines.
- A new world and track generated in under 3 seconds, behind a loading screen.

## Milestones

Build in six milestones, each finished and playtested before the next starts. Track generation comes first because it is the riskiest and most original part.

1. **Track lab.** Project setup, seeded random numbers, and a 2D top-down viewer that generates tracks from any seed with validation and scores shown.
   - Done when: 20 random seeds all produce valid, varied layouts, and unit tests cover self-intersection and corner-radius checks.
2. **World and track in 3D.** Port the island terrain, water and grass; lay the road onto the terrain with cuttings, embankments, kerbs and barriers; add a camera that flies along the track.
   - Done when: the track sits cleanly in the terrain on 20 seeds, checked with Playwright screenshots.
3. **Driving.** The car with Rapier suspension and the arcade grip layer, chase camera, drift-boost tiers, off-road slowdown and respawning.
   - Done when: drift-boost works through every corner type and the handling passes a playtest sign-off.
4. **Time trial.** Start countdown, checkpoints, laps, sector times, results screen, menus, and new or typed-in seeds.
   - Done when: a full 3-lap race can be played from the menu and back with correct times.
5. **Ghosts and favourites.** Input recording, ghost replay, and saving and loading favourite tracks.
   - Done when: a ghost replays a lap exactly on the same seed after reloading the page.
6. **Polish.** Bridges and tunnels, sound, drift sparks and dust, boost effects, settings and a performance pass.
   - Done when: version 1 scope is complete and hits the performance targets.

## Later ideas

These are out of scope for version 1, but the architecture should not block any of them.

- **AI opponents.** Compute a racing line per track (a minimum-curvature line, using the TUM racing-line work as a reference), then have AI karts follow it with varied skill, sensible catch-up so races stay close, and use of slipstream and drift-boost to overtake.
- **Easy overtaking.** Slipstreaming behind other karts, wide tracks, and drift-boost exits designed so passing feels achievable.
- **Multiplayer.** Racing friends in the browser, with the server or the host running the shared simulation. Seeds make this cheap: everyone generates the same track locally.
- **Underground sections and caves,** built as separate 3D meshes because the heightmap can't represent ceilings.
- **More biomes:** desert canyon, snowy mountain pass, night city, plus weather.
- **Car choice,** custom car models built in Blender, and online leaderboards per seed.

## Working with Claude Code

Claude Code plans before it builds, works one milestone at a time, and checks its own work in a real browser before calling anything done.

- **Plan first.** Start each milestone in plan mode and wait for approval before writing code.
- **Small steps.** Each step ends with something runnable or a passing test, committed with a clear message. One GitHub issue per milestone.
- **Look before reporting.** After any visual change, run the game with Playwright and review screenshots across several seeds.
- **Keep a log.** Maintain `docs/STATE.md` with progress, decisions made and known issues, so any new session can pick up where the last one stopped.
- **Ask before adding dependencies** beyond the stack above, and pin every version.
- **Report clearly.** At the end of each step: what changed, how to try it, and what's next.

### Kickoff prompt

Save this doc as `docs/GAME_BRIEF.md` and the island demo as `reference/island-demo.html` in your local copy of the Random-Racing repo (github.com/TechnologicTEC/Random-Racing), open that folder in VS Code, start Claude Code in plan mode, and paste:

```
Read docs/GAME_BRIEF.md and reference/island-demo.html. We're building the game described in the brief, and you're the main developer.

Don't write code yet. First:
1. Propose the project structure, module boundaries and libraries (with pinned versions), following the brief's architecture rules.
2. Write a detailed implementation plan for Milestone 1 (Track lab) only, broken into small steps that each end with something I can run or a passing test.
3. List any questions or decisions you need from me.

This folder is already a git repo connected to github.com/TechnologicTEC/Random-Racing, so don't create a new one. Once I approve, open one GitHub issue per milestone using the gh CLI and start Milestone 1. Keep docs/STATE.md updated as you go.
```
