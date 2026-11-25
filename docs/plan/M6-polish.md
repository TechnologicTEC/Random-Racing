# Milestone 6: polish

Part of the plan. `docs/PLAN.md` has the build order, the routine for one part, what to do when something does not go to plan, and the questions for Tane; this file has the steps of one milestone. Tick the build order in `docs/PLAN.md` as parts are finished.

Issue #6. **Done when** (the brief): version 1 scope is complete and hits the performance targets. Branch `milestone-6-polish`; plan in plan mode first. **This is the biggest milestone and the first place to trim.** At M6.0 agree with Tane which steps are in, in what order, and what goes first if it runs long. **Tane's answers at M6.0 (2026-11-25):** the steps are built in the order below (the generator changes first, since they move every seed's world and must be done before `v1`; then what is heard and seen; speed measured on the finished game). **If it runs long, only M6.5's new effects are cut**; tunnels, bridges and the look stay. Two check-ins: after M6.2 and after M6.5 (after M6.4 if M6.5 is cut).

| Step | Build | Done when |
| --- | --- | --- |
| **M6.1 Bridges** | A generator change (`gen/road/bridges.ts`, `Road.bridges` spans, in the world fingerprint). Where the road would need a fill over 6 m (the earthworks rule rejects such turns today), the road becomes a bridge instead: the ground under it is left natural (or sea), and the road mesh is unchanged, since the wheels feel the road mesh and not the ground. New meshes: the deck's sides, railings (walls in `Road.walls`, so they are hit) and pillars (boxes in the colliders). The earthworks rule stops counting fill on a bridge. Rules in `road.bridges` (shortest and longest span, pillar spacing) | Over seeds 1 to 200: how many seeds gain a bridge, and how many more candidates are kept. The car drives over one in a simulation test at top speed, with four wheels down and no bump at either end. The 20-seed screenshots and a close view of three bridges looked at |
| **M6.2 Tunnels** | The same for cuts over 8 m: the ground above is left natural, the road runs in a tunnel with walls and a lid (its own mesh and colliders). The chase camera must stay under the lid (its clearance takes the lid as a ceiling), the light inside is dimmer, and the grass and trees are not drawn inside. **The hardest step in the milestone, and the first to cut** | As for bridges; and the camera never goes through the lid on any tunnel of seeds 1 to 200 (a unit test along each tunnel) |
| **M6.3 The look** | The known look issues Tane picks from the table "Where each known issue is dealt with" in `docs/PLAN.md` (saw-tooth cliff tops, the sun's glare from above, dark clouds at dawn, "evening light" with a blue sky, the round massif, and so on), each its own small part with pictures before and after | Each picked issue's picture beside its reference, looked at; `docs/VISUAL_BAR.md` updated where the bar moves |
| **M6.4 Sound** | `src/audio/`, page code, Web Audio only, no files: the engine (two oscillators, pitch from the speed, louder with the throttle), the screech (filtered noise, while sliding, louder by tier), the boost (a rising whoosh), a bump (a short thud on a new wall hit). It starts on the first key or click (browsers allow no sound before). Volume and mute (M) in settings. Sounds are worked out from the simulation's state, never feed back | Unit tests of the pure parts (pitch from speed, gain from tier). Browser test: the audio graph is built after a key press and not before; no console errors. Tane listens |
| **M6.5 Effects** | Tyre smoke while sliding, dust off the road, motion lines in a boost, better sparks and flame (the proposal in `docs/VISUAL_BAR.md`). All drawn from the simulation's state and its step count, so `still=1` repeats; all within 1 ms a frame | Screenshots of each, looked at; the same address twice gives the same picture; `npm run perf` shows the cost |
| **M6.6 Settings** | A settings screen: quality (High, Low; already there), volume, time of day (the brief: the player may pick it), the controls shown, camera distance. Kept in `localStorage`. **Settings touch drawing and sound only**: nothing in `src/sim` or `src/gen`, or ghosts and seeds break | Browser test: each setting survives a reload; the simulation's fingerprint is the same with every setting changed |
| **M6.7 Speed and size** | The brief's targets: 60 frames a second at 1080p on a mid-range laptop, a world in under 3 s, racing within about 10 s of opening the page. Measure with `npm run perf` and, for the 10 s, Chromium's network throttling. Levers known today: the grass's 176,000 triangles; the most wooded islands (589,000 triangles from above); the water shader; Rapier's 1.68 MB (the build that does not carry its WebAssembly as text saves about a quarter, but needs Vite to serve a `.wasm` file: a new dependency or setting, so ask Tane) | The numbers in STATE.md, against the targets; anything missed is Tane's call |
| **M6.8 Generator `v1`** | `GENERATOR_VERSION = 1` (`src/gen/version.ts`). A test pins the world fingerprints of 20 seeds (`src/gen/v1.test.ts`), so any later change to the generator fails it and must become `v2`. The brief: keep each released version available so saved favourites rebuild, or at least store each favourite's centre line; decide with Tane which | The pin test passes; a favourite saved now is listed as `v1`; the share code reads `v1-48213` |
| **M6.9 Version 1** | The brief's "Version 1 scope" table, line by line, checked by hand in Chrome, Edge and Firefox on Windows, with a controller and a keyboard. README for players. Hosting and the game's name, as Tane decides. The pull request | Every line of the table works. **Tane's sign-off**, merge, release |

## The parts (M6.0)

Each part ends with passing tests and one commit (`docs/PLAN.md`, "The routine for one part"). Steps marked "split at its start" are split into lettered parts once their questions for Tane are answered, and the split recorded here and in the build order.

| Part | Build |
| --- | --- |
| **M6.1a** | Bridge spans, pure (`gen/road/bridges.ts`): where the road stands more than `road.maxFill` above the natural ground or the sea, a span, padded to firm ground and merged when close; rules in `road.bridges` (shortest and longest span, pad, pillar spacing). The earthworks rule stops counting fill on a span and rejects a span longer than the longest. `Road.bridges` in the world fingerprint. Measured over seeds 1 to 200: seeds gaining a bridge, candidates kept. Pinned fingerprints and per-seed tests updated where winners change, as at M4.1 |
| **M6.1b** | The bridge in the world: `gen/world/fit.ts` leaves the ground under a span natural; the deck's sides and underside, railings (walls in `Road.walls`), pillars (boxes in the colliders); drawn; a bridge row in `docs/VISUAL_BAR.md` |
| **M6.1c** | The bridge's own look (Tane, after M6.1b), below: planned in plan mode first |
| **M6.1d** | Bridges across water and ravines (Tane, after M6.1b), below: planned in plan mode first |
| **M6.1e** | (Was M6.1c.) A simulation test over a bridge at top speed (four wheels down, no bump at either end); a `look=bridge` close view; the 20-seed screenshots and three bridges looked at; the visual bar's seed 7 pictures taken again |
| **M6.2a** | Tunnel spans, pure: as M6.1a for cuts deeper than `road.maxCut`; rules in `road.tunnels`; measured over seeds 1 to 200 |
| **M6.2b** | The tunnel in the world: the heightfield stays cut to the road (the ground is one height at each point; the wheels and the body need it); the lid is its own mesh covering the cutting with the hillside's shape, with portals; walls, lid and portals collide; no grass or trees inside |
| **M6.2c** | The chase camera's clearance takes the lid as a ceiling (a unit test along every tunnel of seeds 1 to 200); dimmer light inside, drawing only; a `look=tunnel` view; pictures |
| | **Check-in 1 with Tane** |
| **M6.3a…** | One part per look issue Tane picks at the start of M6.3, generator ones first |
| **M6.4a** | Sound, pure (`src/audio/`): engine pitch and gain, screech by tier, boost whoosh, thud on a new wall hit, from the simulation's state |
| **M6.4b** | The Web Audio graph on the page after the first key or click; M mutes; the browser test |
| **M6.5a…** | Effects, split at its start (the one step that may be cut) |
| | **Check-in 2 with Tane** |
| **M6.6a** | The settings record, pure, kept in `localStorage` (quality, volume and mute, time of day, camera distance, the controls card) |
| **M6.6b** | The settings card from the title and the pause card; the browser tests |
| **M6.7a…** | Speed and size, split at its start once measured |
| **M6.8** | Generator `v1`, after Tane's answer on keeping released versions |
| **M6.9** | Version 1 checked, README, the pull request, sign-off, merge, release |

## Tane after M6.1b (2026-11-25): the bridge's look, and crossings

Tane, on seeing M6.1b's bridges: "on top it looks the same and a player wouldn't really notice the difference. Instead could it maybe look like a wooden bridge or a different colour to the track. I also think we should look into using bridges to cross bits of water ... spanning across a ravine or a river and the bridge can connect the track on either side." Both are planned in plan mode, in a fresh session, before M6.1e. What follows is an outline to start from, not the plan.

**What M6.1b left to build on.** A bridge is found from the road's fill (`findBridgeSpans`, over 6 m, at most 250 m); the road mesh is unchanged over it; its railings are walls (`findWalls`); the deck, its solid boxes and the pillars are `src/gen/road/bridges.ts`; under it the ground is left as it was (`fitRoad`, `FitInput.bridged`). 16 of seeds 1 to 200 have one; they cross dips in the ground (low viaducts, 5 to 8 m up in the middle), never water. The sea is one surface at height 0 (`render/water.ts`): any ground carved below sea level shows as water, with its shallows and foam drawn from the depth; ground inland above 0 can hold no water without a new water surface. A car below `sim.respawn.waterDepth` is put back (`respawn.ts`).

### M6.1c: the bridge's own look (drawing, and generation's meshes)

The road over a bridge should read as a bridge from the car. Options to show Tane with pictures (the visual bar still holds: flat-coloured facets, no textures, colours from `palette.ts`):
- **Wooden:** the deck's surface as planks across the road (strips of two browns, each plank its own flat colour, small gaps), timber railings (posts and a rail) in place of the concrete wall on the bridge, timber trestles or stone piers for pillars. The railings' solid boxes stay as the walls' (so the car meets the same thing); only the drawing changes.
- **Another colour:** the road surface on the bridge in a paler concrete or a red-brown, lines kept, steel or white railings.
- **By the bridge:** wooden for short, low bridges; concrete or steel for long or high ones.

Questions for Tane: which look; whether the white lines carry over the planks; whether the railings change too; whether a plank deck should sound or feel different (a rumble in M6.4's sound; grip unchanged unless Tane asks, since handling is Tane's call and changes ghosts). What changes: the road ribbon's material along a bridge's samples (new `ROAD_MATERIAL` numbers), the railing pieces' mesh on a bridge, the pillars' mesh, palette entries, `docs/VISUAL_BAR.md`; meshes are in the world fingerprint, so every bridged seed's fingerprint moves; no simulation change.

### M6.1d: bridges across water and ravines (a generator change)

Today bridges appear only where the island happens to dip under the lap. Tane wants the track to cross a river or a ravine on purpose, the bridge joining the road either side. A sketch:
- **Where:** after the winning layout is chosen, a share of seeds (from its own seeded stream) get a crossing: a stretch of the lap that is straight or gently curved, away from the start area and the lap gates, long enough for a bridge of about 40 to 150 m.
- **What is carved:** across the lap there, in the island's ground (before the road is fitted), a channel: a **river or inlet** cut below sea level and open to the coast, which the sea's surface then fills with water (shallows and foam come free); or a **dry ravine** 10 to 30 m deep on inland seeds. The road's height is kept, so the fill there passes 6 m and M6.1a's rule makes the bridge.
- **What else it touches:** the coast rules (the surf is kept 10 m from the road, which a river under a bridge breaks on purpose, so the check must allow it under a bridge); the island's shape tests; walls; trees and rocks cleared from the channel; the respawn into water; the fit report; every seed's fingerprint and the 20-seed checks, as at M6.1a. All before `v1` (M6.8).

Questions for Tane: which kinds (a river to the sea, an inlet of the sea, a dry ravine, or all three); how many seeds should have one (for example one in three, or every seed); one crossing a lap or more; a river higher in the hills too (it would need its own water surface: new drawing work, and more to test); how long a bridge may be; whether a river may cut the island in two.

**Order to suggest:** M6.1c first (smaller, and every later bridge takes the new look), then M6.1d, then M6.1e's driving test and pictures; or M6.1d first if Tane wants the crossings seen before choosing the look.

## Decisions, what to reuse, and traps

- **Bridges and tunnels are a generator change.** Every world fingerprint moves once more, and the generator becomes `v1` only after them (decision of 2026-11-11). The ground is one height at each point, so a bridge is the road's own mesh over lowered ground (the wheels already feel the road mesh, not the ground under it), and a tunnel is a cutting with a lid over it, drawn and collided as its own mesh. The earthworks rule (`gen/track/earthworks.ts`) rejects the turns that would need them today; that is where they come in.
- **Sound is made in code** with Web Audio (the engine's pitch from the speed, filtered noise for the screech and the boost). No files, so nothing more to download (pillar 4). A browser only lets sound start after a key or a click.
- **Effects only read the simulation's state.** Smoke, dust and motion lines never feed back into it, and are driven by its step count so that `still=1` pictures repeat.
- **Speed and size:** Rapier is 1.68 MB gzipped; the build that does not carry its WebAssembly as text saves about a quarter. "Racing within 10 seconds" should be measured on a slow connection. The frame numbers to hold are in the archive under "Step 15".
- **Traps:** an effect driven by the frame clock makes screenshots differ from run to run; a setting that changes anything in `src/sim` or `src/gen` breaks ghosts and seeds, so settings touch drawing and sound only.
