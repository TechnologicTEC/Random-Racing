# Project state

Updated at the end of every work session. A new session should read this first, then `docs/GAME_BRIEF.md`.

## Where we are

- **Current milestone:** 2, World and track in 3D ([issue #2](https://github.com/TechnologicTEC/Random-Racing/issues/2)), in progress. Milestone 1 (Track lab) is merged and signed off (PR #7)
- **Branch:** `milestone-2-world`. `main` is protected by a GitHub ruleset (no force pushes, no deletion, pull request required); one pull request per milestone, merged after Tane signs off
- **Last finished step:** C1, the spike (measurements only; see "Rework measurements", C1). Tane chose half climbing, half circling mountain seeds. The rework R1 to R8 is built and pushed
- **Next step:** C2, the landform trait (and the climb or circle choice for mountain seeds). Then C3 to C6, check-in 4, then the original steps 12 to 17. Read "Milestone 2 rework" and "Check-in 3 response" below first; they replace parts of "Milestone 2 design"

## Milestone 2 steps

Part A is data only (no Three.js). Part B is the 3D view.

| # | Step | Status |
| --- | --- | --- |
| 0 | Branch, plan and decisions recorded here | Done |
| 1 | `core/noise.ts`, `core/scalar.ts`: seeded simplex, fbm, ridged, exact maths only | Done |
| 2 | Web Worker: protocol, handler, client; lab and contact sheet generate through it | Done |
| 3 | Rolling relief and the road height solver (gradient, crests, close sections); elevation chart in the lab | Done |
| 4 | Elevation score at 12% weight | Done |
| 5 | Island: height grid, coast shaped by the track, natural ground; island map in the lab | Done |
| 6 | Cut and fill, cover maps, fit report, `generateWorld`, world fingerprint | Done |
| | **Check-in 1 with Tane:** 2D contact sheets of islands for 20 seeds | Done: Tane's island feedback applied (see decisions) |
| 7 | Add Three.js; `/?view=3d` with terrain chunks and an orbit camera; Playwright WebGL screenshots proven | Done |
| 8 | Banking and the asphalt ribbon; close-up cameras on the fit report's worst spots | Done |
| 9 | Kerbs | Done |
| 10 | Barriers, start line and gate | Done |
| 11 | Fly-along camera and HUD | Done |
| | **Check-in 2 with Tane:** fly a few seeds | Done: islands too basic. See "Milestone 2 rework" |
| R1–R8 | **Rework** (table below), then check-in 3 | Done |
| C0–C6 | **Check-in 3 response** (table below), then check-in 4 | In progress |
| 12 | Water and sky; time of day from the seed | To do |
| 13 | Trees, rocks and clouds | To do |
| 14 | Grass | To do |
| 15 | Shadows, far-terrain detail levels, low quality option, performance numbers | To do |
| 16 | 3D becomes the default page; lab on the L key and `?lab=1` | To do |
| 17 | 20-seed check with screenshot sheets and fit reports; pull request | To do |

## Milestone 2 rework (agreed at check-in 2, 2026-11-12)

**Tane's feedback after flying the islands:** they are too basic. Too flat; the mountains are too small and there should be more of them; some tracks should climb a mountain or descend one while others stay flat; the track should only sometimes run beside the sea, and the land can extend well past it; the road should be wider in some parts; and not every trait should apply to every track, so that coastal, tall, flat, edge-hugging and folded tracks combine differently.

**Tane's choices:** mountains 200 to 250 m, on a bigger island; up to 15% gradient on mountain tracks; road 12 m widening to 22 m.

**This replaces parts of the check-in 1 feedback.** Sea 15 to 35 m from the road now applies only to coastal stretches (still never under 10 m). Height near the road depends on the seed's relief. The single 40 to 70 m peak becomes 0 to 4 mountains. Beaches, cliffs, bays and headlands stay, on coastal stretches.

### Rework design

1. **Each seed gets a character** (`src/gen/character.ts`, new, from the `world` stream). Independent traits, weights in `src/config.ts`, shown in the lab:

   | Trait | Values (starting weights) |
   | --- | --- |
   | Layout style (exists) | folded 50%, stretched 25%, round 25% |
   | Relief | flat 20%, rolling 35%, hilly 25%, mountain 20% |
   | Coast | inland 25% (road never by the sea), touches 45% (one or two coastal stretches), coastal 30% (most of the outside by the sea) |
   | Mountains | 0 to 4; flat seeds 0 or 1; mountain seeds at least 1 |
   | Road width | constant 35%, varied 65% |

2. **Relief and climbs.** `relief.ts` stays seed-only, built from the relief trait. Lap height range aimed for, and road gradient limit: flat under 8 m (8%); rolling 15 to 30 m (8%); hilly 30 to 60 m (8%); mountain 60 to 120 m (15%). Mountain relief adds a broad ramp across the buildable area (the lower flank of a mountain, no steeper than about 18%) so a 15% road follows it with ordinary cut and fill. `solveProfile` takes the gradient limit from the character. The elevation score's targets come from the relief trait, so flat seeds are not marked down. Cut and fill limits stay 6 m and 8 m.
3. **Variable road width** (`src/gen/road/width.ts`, new): one width per sample of the winner's line. 12 m base, up to 22 m on the start straight, long straights and hairpin exits, eased over about 40 m. Not widened beside a close section. Chosen after the winner is picked (own stream), so it does not change which layout wins. Everything that used the fixed `cfg.track.roadWidth` takes the per-sample width: `fit.ts`, `report.ts`, `ribbon.ts`, `kerbs.ts`, `barriers.ts`, `startGate.ts`, `island.ts`, `cover.ts`, `profile.ts`, and the lab's road drawing. The validator keeps judging layouts at the base width.
4. **Bigger island.** Tile 2700 m (was 1400 m), 3 m cells (was 2 m), about 812,000 heights; verge 4 m (was 2.5 m), which also removes the verge dip. A **hinterland** is added in `island.ts`: a separate, gently shaped landmass from its own noise. Land = infield + the strip beside the road + hinterland + every mountain's foot. Where the hinterland covers the road the land runs on 80 to 600 m past it; where the road sticks out of it, the coast is the existing near coast. The coast trait sets how much of the road it covers. Build it as its own landform with bounded slopes, never as a multiplier on the margin (that mistake made 200% slopes before). `shoreShape`, `coastProfile` and `carveCoast` are reused unchanged.
5. **Mountains and hills.** `placePeak` becomes `placeMountains`: 0 to 4, main one 200 to 250 m, others 80 to 200 m, sides up to about 110% (the main one is about 700 m across). In a large infield or on the hinterland outside the loop, which grows to hold them; nothing within 60 m of the road. On mountain-relief seeds the main one sits at the top of the ramp. Foothills (5 to 25 m, about 150 m across) on land away from the road. Snow above about 180 m.
6. **3D follow-ups.** Far ground at quarter detail (pulled forward from step 15); fog, camera far distance and orbit limits scaled up.

**About the folds:** the layouts have not changed since Milestone 1. They look stuck to the edge because the sea follows the road everywhere and fills every fold; the hinterland should fix that. R1 measures fold counts to confirm, in case the elevation score did reduce them.

### Rework steps

Tests first, watched failing. Run the unit and browser suites so that a failure stops the commit (do not pipe test output through a filter in the same command chain as `git commit`).

| # | Step | Ends with | Status |
| --- | --- | --- | --- |
| R0 | Record the plan and decisions here | Pushed | Done |
| R1 | Baselines: fold and hairpin counts for seeds 1 to 200 now and with the Milestone 1 scorer; world build time at the new tile size in Node, Chromium and Firefox | Numbers here; a decision on style weights, and on the grid if Firefox is over 3 s | Done: style weights and grid stay as planned |
| R2 | Seed character: `gen/character.ts`, config weights, on `TrackResult`, shown in the lab | Tests: same seed same character; each value at about its weight over 2000 seeds | Done |
| R3 | Relief by character, gradient limit by character, elevation score targets | Tests per relief type on 200 seeds: lap range in its band, gradient within its limit, cut and fill within 6 m and 8 m | Done: the plan worked as written; mountain seeds keep every layout style |
| R4 | Variable road width through generation, meshes, fit, report and lab | Tests: 12 to 22 m, eased, not widened beside close sections, ground follows the wider road, kerbs and barriers at the true edge | Done |
| R5 | Bigger tile, 3 m cells, 4 m verge | Existing fit tests pass at the new grid; build time measured | Done |
| R6 | Hinterland and coast trait | Tests: inland seeds have no sea within 60 m of the road; coastal seeds have most of their outside within 35 m; never under 10 m; open sea deep; tile edge is sea | Done |
| R7 | Mountains (0 to 4, main 200 to 250 m), foothills, snow | Tests: heights in range, 60 m clear of the road, slopes within limit, mountain seeds have the main one above the ramp | Done |
| R8 | 3D: far-ground detail levels, fog and camera limits | Triangle count recorded; fly, orbit and close-up screenshots on 20 seeds | Done |
| | **Check-in 3:** Tane looks at contact sheets and flies a few seeds | Feedback | Done: see "Check-in 3 feedback" |

After check-in 3, resume steps 12 to 17 in the table above.

### Check-in 3 feedback (2026-11-13)

Tane looked at the contact sheets and flew seeds (screenshots: a single cone-shaped mountain behind a track; seeds 19 and 20 with round mountain islands beside the track). Feedback, in Tane's words where possible:

1. **Tracks should include the mountains.** Right now the mountains are only background. Some tracks should go up the mountains and right around them.
2. **More elevation on some tracks.** Some of the mountain-relief tracks do not go very high. Some should drive up a mountain and back down.
3. **Mountains look too basic.** They are cones that only vary in height, copies of each other. They should vary in shape: for example rolling hills that dip up and down and mould the terrain (reference: a photo of soft, rounded green hills folding into each other), or sharp pointed peaks joined together into a range (reference: a photo of jagged Dolomite-style spires connected by ridges).

**Not yet decided; for the planning session.** The track is built first and the land shaped around it. Layouts only know the seed's relief (`createRelief`), and mountains are placed afterwards, at least 60 m from the road. Points to settle in the plan:

- To route a track over or around a mountain, the mountain has to exist before the layouts are scored. It could become part of the relief, which is seed-only and already holds the highland. Candidates could then also be scored on how they use it.
- A road limited to 15% with cut and fill of at most 6 m and 8 m cannot go straight up 110% sides. It needs gentler mountain flanks where the road goes, or switchbacks, or layouts that wrap round the mountain along its contours. The layout builder knows nothing about terrain today.
- Shapes: rolling hill country (overlapping soft swells, perhaps from noise rather than separate bells) and ridged ranges (several sharp peaks joined by ridges, from ridged noise along a spine), chosen per seed like the other traits.
- These would also answer the check-in 3 issues already noted under "Known issues": round dome-islands off the coast, and coastal ramps slicing hills into bands.
- Elevation targets: the mountain relief band (60 to 120 m per lap) and its score target may need raising, within the cut and fill limits.

### Check-in 3 response (agreed 2026-11-13)

**The limit found while planning:** a 15% road on a lap of at most 2.4 km can rise about 150 m at most, so it can reach a 200 to 250 m mountain's shoulder, not its summit.

**Tane's choices:**
- Mountain seeds may have laps up to **3 km** (departs from the brief's 1.4 to 2.4 km). The gradient stays 15%. That allows about 180 m of climb.
- **Every mountain-relief seed** (20% of seeds) climbs onto its main mountain and goes round it. Hilly seeds keep climbing the lower slopes of a mountain beyond the track, in the new shapes.
- **Three shapes, one per seed:** ridged range about 40%, rolling hill country about 35%, lone peak about 25%. The lone peak is reshaped too: an uneven foot, spurs and a steep top instead of a cone.

**Tane's choice after the C1 spike:** a lap can climb high or go right round a mountain, not both (going round follows the contour, so it stays at one height). So mountain seeds are split **half climbing, half circling**, a new per-seed choice. Climbing seeds have the summit at the edge of the track area and rise about 100 to 145 m onto its shoulder; circling seeds have the summit 200 m from the centre and go round it, rising about 60 to 90 m. Mountain seeds get a 600 m track area (500 m for the others). The numbers are under "Rework measurements", C1. Where they differ from the design below, C1 wins.

#### Design

1. **Landform trait.** `Character.landform`: `range`, `hills` or `peak`, from its own stream (`world/character/landform`), so no other trait changes. The mountain count (0 to 4) stays; every mountain on an island has the seed's shape.
   - *Range:* 3 to 6 sharp peaks along a curved spine 500 to 1200 m long; saddles at 55 to 75% of the lower neighbouring peak; steep sides (up to about 110%) with crags from ridged noise. The tallest peak is 200 to 250 m.
   - *Hill country:* overlapping soft swells from smooth noise over a raised dome, rounded and folding into each other. Tops stay below the snow line (main 120 to 170 m, others 50 to 120 m).
   - *Lone peak:* gentle foot and steep top; the foot's radius varies by about 30% with direction; the summit is off-centre; 3 to 5 spurs run down from it.
2. **Shapes module** `src/gen/world/landforms.ts` (new, pure, exact maths): height above its base at any point, distance outside its foot, summits, bounds. Used by the relief (main mountain) and the island (the others). Replaces the round bell in `placeMountains`.
3. **The main mountain moves into the relief.** `placeHighland` becomes `placeMassif`, in the seed's landform. The relief still depends only on the seed. On mountain seeds the summit is inside the track area (150 to 300 m from the centre, settled by C1), with lower slopes a 15% road can climb by running across them; the steep top is kept clear by the earthworks rule. On hilly seeds the massif stays beyond the track area with an 8% lower flank, as today's highland.
4. **Longer mountain laps.** Lap length becomes a range per relief: mountain about 1600 to 3000 m (C1 sets the lower end), the others 1400 to 2400 m as now. If 3 km laps do not fit, mountain seeds get a 600 m buildable radius instead of 500 m (C1 decides).
5. **Turning candidates to face the mountain.** Each candidate's shape is tried at several turns about the centre (about 8 on mountain seeds, 4 on hilly, 1 on the others; C1 settles it), and the best-scoring valid turn is kept. The candidate records its `turn` for the lab.
6. **Earthworks rule.** A new reason to reject a candidate: its road needs a cut deeper than 8 m, a fill taller than 6 m, or a bank between close sections steeper than 45%. Gentle ground used to guarantee these; now the ground can be steeper than the road.
7. **Scoring.** Higher elevation targets on mountain seeds (about range 160 m, climb 240 m) and more weight on elevation there (C1 sets the numbers). If fewer than about half of mountain winners go round the mountain, a "goes round the mountain" share joins the elevation part.
8. **Island.** On hilly and mountain seeds the main mountain comes from the relief (listed, not added twice); the others use `landforms.ts` and stay 60 m clear of the road. The main mountain's upper part is never cut by the coast; its lower slopes meet the sea like other land. Other mountains go only where their foot touches the road's land (no more dome islands across a channel, seed 4). The coast's join with high ground is rounded over a height that grows with the cut (softens seed 12's bands). Snow on range and peak tops above 180 m; hill country stays green.
9. **Lab and 3D.** The shape in the Track panel, captions and sheet summary. New close views `look=summit` (the lap's highest point, facing the summit) and `look=climb` (the steepest stretch).

#### Steps

Tests first, watched failing. Unit and browser suites must pass before each commit.

| # | Step | Ends with | Status |
| --- | --- | --- | --- |
| C0 | Record the plan and Tane's choices here | Pushed | Done |
| C1 | **Spike** (throwaway): a simple concave massif in the relief of 200 mountain seeds, laps of 1.6 to 3 km, 1, 4 and 8 turns, earthworks rule. Measure lap range, how many winners go round the summit or within 150 m of its steep top, rejects per seed, fallbacks, cut and fill, whether 3 km fits in 500 m, time per seed | Numbers here; decisions on summit distance, flank profile, turns, buildable radius, lap minimum, score numbers. **If the median range is under 110 m, report to Tane before going on** | Done: reported; Tane chose half climbing, half circling |
| C2 | Landform trait: `character.ts`, config weights, lab and contact sheets | Tests: same seed same landform; each shape at about its weight over 2000 seeds; other traits unchanged on seeds 1 to 2000 | To do |
| C3 | `landforms.ts`: range, hills, peak | Tests per shape: heights in range; steepest slope within limit; peak foot not a circle (radius varies at least 25%); range has 3 to 6 summits with saddles at least 55% of the lower neighbour; hill country at least 5 swells, below the snow line, slopes at most about 60%; no copies | To do |
| C4 | Massif in the relief, longer mountain laps, turns, earthworks rule, score changes | Mountain climb tests: new lap range band, 15%, crests, cut and fill and banks on every valid candidate, no fallback on 200 seeds, most winners round the summit or near its top, laps at most 3 km. Other reliefs still pass at 2.4 km. Build time measured | To do |
| C5 | Island with shapes and the main mountain from the relief; joined-land placement; softer coast join | Mountain tests rewritten: not doubled; others in shape and 60 m clear; every mountain joined by land to the road's land; main top never carved; coastal mountain seeds keep sea by the road; snow only on range and peak. Fit clean on 30 worlds; barrier footing passes | To do |
| C6 | Lab and 3D: shape shown, `look=summit`, `look=climb` | Screenshots of seeds 1 to 20 plus mountain seeds of each shape checked by eye; triangle counts; 3 s budget passes in Chromium and Firefox | To do |
| | **Check-in 4:** Tane looks at contact sheets and flies mountain seeds of each shape | Feedback | To do |

#### Risks

- Too few valid candidates on mountain seeds once the earthworks rule bites. Turns first, extra rounds second; the fallback oval must try every turn too.
- Build time: up to 8 turns of 30 candidates on longer laps. If too slow, a quick ground-only check picks the best two or three turns before the full road solve.
- A road across a 30% mountainside makes wide cuttings and embankments. The report and the barrier footing test catch problems; C6 screenshots check the look.
- Every hilly and mountain winner changes and every mountain changes shape (allowed while the generator is v0).
- Milestone 3 must handle 3 km laps with 15% climbs.

The full plan as approved is also in Tane's plan file: `C:\Users\tanee\.claude\plans\read-claude-md-docs-state-md-and-purring-pearl.md`.

### Rework measurements

**R1 baselines (2026-11-12), before any rework code.**

*Folds and hairpins, winners of seeds 1 to 200.* A fold is counted as a pocket at least 100 m deep in the track's outline (its convex hull).

| | Now (elevation 12%) | Milestone 1 scorer |
| --- | --- | --- |
| Folds per track | 1.12 (none 14%, one 63%, two 23%, three or more 2%) | 1.07 (none 17%, one 61%, two 21%, three or more 2%) |
| Hairpins per track | 1.60 (none 2%, one 58%, two or more 41%) | 1.60 (same shares) |
| Lap length over outline length | 1.19 | 1.18 |
| Share of the lap with another section within 80 m | 12% | 12% |

By style now: folded 1.17 folds and 1.85 hairpins; stretched 1.16 and 1.35; round 0.96 and 1.30. 45 of 200 winners differ between the two scorers.

**Decision:** the elevation score did not reduce folds, so the style weights stay at 50 / 25 / 25. The tracks look stuck to the edge because the sea fills every fold; the hinterland (R6) is the fix.

*World build time, 8 seeds, median (range), in milliseconds.*

| | Node | Chromium worker | Firefox worker |
| --- | --- | --- | --- |
| Now: 1400 m tile, 2 m cells | 435 (403 to 491) | 372 (353 to 402) | 603 (561 to 743) |
| New: 2700 m tile, 3 m cells, 4 m verge | 575 (554 to 644) | 489 (480 to 535) | 845 (816 to 903) |
| New tile with land out to 500 m from the road (stands in for the hinterland; 24% of the tile is land) | 608 (592 to 678) | 551 (514 to 560) | 881 (844 to 901) |
| 2700 m tile at 2 m cells, for comparison | 1268 | not measured | not measured |

Handing the result from the worker to the page adds 1 to 4 ms. **Decision:** Firefox is far under the 3 s budget, so the grid stays as planned (2700 m, 3 m cells). Mountains and the hinterland's own noise will add to this; R5, R6 and R7 measure again.

**R3 results (2026-11-13): winners of seeds 1 to 200, every seed forced to one relief.**

| Relief | Ground | Lap height range, lowest to highest (median) | Inside its band | Steepest road | Deepest cut, tallest fill | Winner scores |
| --- | --- | --- | --- | --- | --- | --- |
| Flat | hills 7 m | 1.2 to 6.3 m (4.2) | 100% under 8 m | 4% | 0.1 m, 0.1 m | 89 to 100 |
| Rolling | hills 33 m, as before | 5.6 to 29.6 m (20.5) | 91% in 15 to 30 m | 8% | 4.7 m, 4.7 m | 85 to 99 |
| Hilly | 8% flank, hills 14 m | 23.9 to 59.5 m (41.2) | 95% in 30 to 60 m | 8% | 4.6 m, 4.6 m | 84 to 97 |
| Mountain | 15% flank, hills 12 m | 47.1 to 106.8 m (75.8) | 90% in 60 to 120 m | 15% | 3.5 m, 3.5 m | 84 to 96 |

Over all 30 candidates of 40 seeds per relief, cut and fill also stay inside 6 m and 8 m, and the bank between close sections stays under 45%. On 30 whole worlds with their own characters the fit is clean: nothing through the road, nothing hanging, deepest cutting 3.2 m, tallest embankment 3.7 m, steepest bank 65%.

**R4 results (2026-11-13): winners of seeds 1 to 200, every seed forced to varied width.**

- 194 of 200 widen somewhere. The 6 that do not are folded layouts with another section within 70 m of every straight.
- Wide stretches per seed: 1.75 on average. Widest point: median 20.2 m, largest 22.0 m.
- Share of the lap wider than 12 m: median 19% (one seed in ten under 8%, one in ten over 37%, most 55%). By style: folded 16%, stretched 23%, round 21%.
- On 24 whole worlds with their own characters (15 of them varied) the fit is still clean: nothing through the road, nothing hanging, deepest cutting 3.2 m, tallest embankment 3.6 m, steepest bank 66%.

**R5 results (2026-11-13): 2700 m tile, 3 m cells (901 by 901, 812,000 heights), 4 m verge.**

- World build time, 8 seeds: Node 611 to 705 ms (median 661), Chromium worker 551 to 621 ms (median 598), Firefox worker 822 to 891 ms (median 858). Budget 3 s.
- Barrier footing (0.6 m nominal) on 10 hilly and mountain seeds: at least 0.40 m in the ground on 9 of them; 0.29 m at worst on seed 1. The verge dip is smaller (about 0.3 m, was about 0.45 m) but not gone.
- Fit still clean on those 10 seeds: deepest cutting 3.2 m, tallest embankment 3.6 m, steepest bank 63%.

**R6 results (2026-11-13): seeds 1 to 12 of each coast trait, on a 5 m grid.** "Rays" go straight out from every fourth sample on each side of the road that faces outwards.

| Coast | Sea within 35 m of the road (or as near as a cliff beside a high road allows) | Land 80 m or more past the road, where the hinterland covers it |
| --- | --- | --- |
| Inland | none on any seed; no sea within 60 m anywhere | 100% on every seed |
| Touches | 7% to 48% of rays per seed | 54% to 97% of covered rays (median about 82%); the rest is the short stretch where the hinterland gives way to the coast |
| Coastal | more than half of rays on every seed (seeds 1 to 8) | little land beyond the road |

- On every island: never sea within 10 m of the road edge, the tile edge is open sea, no water cut off from the open sea, no slope steeper than 250% more than 80 m from the road.
- World build time: R6 itself adds about 50 ms (measured back to back with R5: 1,254 ms before, 1,294 ms after in Node). But the machine was busier than in R5's measurement, so today's absolute numbers are higher: Node about 1.3 s, Chromium worker 1.05 to 1.23 s (median 1.12), Firefox worker 1.72 to 1.83 s (median 1.77). Budget 3 s. Measure again in R8 with nothing else running.

**R7 results (2026-11-13).**

- Seeds 1 to 40 with their own characters (5 m grid): 76 mountains asked for, 76 placed. Every main mountain is 201 to 248 m high, with a foot 154 to 416 m in radius. All 10 mountain-relief seeds have their main mountain on the highland.
- Steepest mountain sides on 8 sample mountains: 107% to 129% (the 110% limit, plus the slope of the ground under them).
- World build time, measured with only the dev server running: Chromium worker 655 to 812 ms, Firefox worker 1,028 to 1,198 ms. Budget 3 s.

**R8 results (2026-11-13).**

- Ground triangles loaded, 8 seeds: 58% to 74% of full detail with far ground at quarter detail (seed 12: 786k down to 455k). Seed 2024, whose land is all within 250 m of the road, keeps all 164k.
- Triangles drawn per frame (Chromium, 1280 by 720): circling view 182k to 407k in 25 to 70 draw calls; flying view 92k to 141k in 13 to 29 draw calls. Seeds 1, 12, 2024 and 48213.
- Fly, orbit and close-up screenshots of seeds 1 to 20 checked by eye: no seams where the detail levels meet.

**C1 results (2026-11-13): the check-in 3 spike, mountain seeds only.** Throwaway code: the candidate loop rebuilt from `generateLayout`, `solveProfile`, `measureProfile` and `scoreLayout`, with a test mountain added to the seed's relief (no highland), each candidate tried at several turns about the centre, and the earthworks rule (cut 8 m, fill 6 m, bank 45%) rejecting turns. "Sweep" is how many degrees round the summit the lap passes within 300 m of the steep top's foot; "fully round" means the summit is inside the loop.

*First tries, 40 seeds, laps 1.6 to 3 km, 500 m track area, 8 turns unless stated.*

| Test mountain | Median lap range | Laps under 90 m | Fully round | Median sweep | Turns rejected |
| --- | --- | --- | --- | --- | --- |
| Today (highland flank, 1 turn, laps to 2.4 km) | 77.3 m | 33 | 0 | 0° | 0% |
| Broad dome 150 m, 900 m radius, under the whole area, peak on top | 78.6 m | 30 | 19 | 200° | 94% |
| 15% cone, summit 450 m out, 1 turn | 89.2 m | 23 | 0 | 80° | 10% |
| Same, 4 turns | 99.5 m | 8 | 0 | 90° | 11% |
| Same, 8 turns | 105.5 m | 4 | 0 | 90° | 10% |
| Same, 8 turns, laps to 2.4 km only | 97.4 m | 10 | 0 | 80° | 7% |
| 15% cone, summit 350 m out | 86.0 m | 25 | 0 | 120° | 45% |
| 15% cone, summit 250 m out | 69.3 m | 38 | 5 | 150° | 80% |
| 600 m area, cone summit 550 m out | 112.7 m | 5 | 0 | 70° | 2% |
| Same, elevation weight 25% | 124.0 m | 1 | 0 | 70° | 2% |
| 600 m area, weight 25%, cone summit 200 m out | 76.9 m | 36 | 26 | 320° | 78% |
| Same, summit 120 m out | 67.1 m | 40 | 34 | 350° | 77% |

What it shows: a dome steeper than the road's 15% almost everywhere leaves few layouts that fit. A 15% cone works, with the steep top only at its summit. Climb is limited by how far the track area reaches up the slope, not by lap length (3 km laps add about 8 m). A lap that circles a mountain stays near one height.

*Confirmed on 200 seeds (600 m area, laps 1.6 to 3 km, elevation weight 25%, targets 160 m range and 240 m climb).*

| | Climbing: summit 550 m out, 8 turns | Same, 4 turns | Circling: summit 200 m out, 8 turns |
| --- | --- | --- | --- |
| Lap range, lowest / tenth / median / ninetieth / highest | 76.9 / 100.8 / 120.4 / 140.3 / 149.2 m | 72.8 / 98.7 / 118.5 / 137.3 / 149.2 m | 38.8 / 63.7 / 77.1 / 89.9 / 101.8 m |
| Laps under 90 m | 5 | 11 | 182 |
| Highest point of the lap (median) | 147 m | 144 m | 108 m |
| Fully round the summit; 180° or more | 0; 0 | 0; 0 | 152; 170 |
| Within 150 m of the steep top | 197 | 193 | 200 |
| Turns rejected for earthworks | 1.5% | 1.4% | 76% |
| Fallbacks (no valid candidate) | 0 | 0 | 0 |
| Deepest cut, tallest fill, steepest bank of winners | 7.4 m, 5.9 m, 35% | 7.3 m, 5.9 m, 32% | 7.7 m, 6.0 m, 40% |
| Laps over 2.4 km; longest | 121; 2970 m | 126; 2970 m | 112; 2970 m |
| Track generation per seed in Node (median) | 287 ms | 162 ms | 317 ms (today 47 ms) |

**Decisions from C1 (Tane chose the split; the rest follows from the numbers):**
- Mountain seeds are half climbing, half circling, from a stream of their own.
- The main mountain stands on a 15% cone that eases in over 120 m at its foot and reaches 600 m past the summit. Its steep top stands on a flat shoulder about 100 m higher. Climbing seeds: summit 550 m from the centre, top's foot 130 m across in radius (summit about 250 m above the sea). Circling seeds: summit 200 m out, foot 110 m (summit about 200 m). C3 and C5 give the top its landform shape.
- Mountain seeds: 600 m track area, laps 1.6 to 3 km, 8 turns (4 turns loses 2 m of median range and doubles the laps under 90 m), elevation weight 25% (the other four parts 18.75% each), elevation targets 160 m range and 240 m climb.
- The earthworks rule is needed: without it, three in four turns on circling seeds would break the cut and fill limits.
- No "goes round the mountain" score: three in four circling winners already go fully round.
- Test bands for lap range: climbing 90 to 160 m; circling 55 to 100 m.
- 3 km laps fit (the longest winner is 2.97 km, no layout failed to build), so only mountain seeds get the bigger area, for the climb.
- Not measured yet: hilly seeds (C4 measures whether turns help them) and whole-world build time in browsers (C4).

### Rework risks

- **Build time.** About 1.7 times as many heights, and Firefox is already slow under the dev server. R1 measures first. Fallbacks: skip open-sea cells earlier, or a coarser far field.
- **Mountain tracks.** A 15% road on an 18% flank must stay within the cut and fill limits beside folded sections. If R3's tests fail, mountain seeds avoid the folded style.
- **Proportion.** A 250 m mountain beside a 12 m road is very large. Tane judges it at check-in 3; the heights are config values.
- **Width touches many modules.** The existing real-seed fit tests are the safety net.

The full plan as approved is also in Tane's plan file: `C:\Users\tanee\.claude\plans\pasted-content-id-9c3b-read-claude-md-playful-sutton.md`.

## Milestone 2 design

*Steps 0 to 11 as built. Where the rework above differs (coast distance, the single peak, fixed road width, tile and grid size, 8% gradient everywhere), the rework wins.*

One rule: **generation says what the world is, as plain numbers; rendering only draws those numbers.**

- `src/core`: RNG, exact maths, noise, hashing. `src/gen/track`: the Milestone 1 layout pipeline. `src/gen/road`: road heights, banking, 3D frames, kerbs, barriers and their triangle lists. `src/gen/world`: relief, island, cut and fill, cover maps, tree and rock positions. All pure, no Three.js, exact maths only.
- `src/worker`: runs generation off the main thread. `src/render`: the only folder that imports Three.js. `src/camera`: camera maths as plain numbers. `src/app`: page wiring.
- **Island around the track, in this order:**
  1. *Relief* from the seed alone: rolling hills, lowlands at 3 m, hills to 36 m, 99% of the ground gentler than 15% (`gen/world/relief.ts`).
  2. *Road heights* for each candidate (`gen/road/profile.ts`): sample the relief along the line, limit the gradient to 8%, then average over 33 samples so no crest or dip is tighter than 200 m radius. Always at least 2 m above the sea. Measured on 3,000 layouts: never more than 5.3 m above or below the ground (limits 6 m and 8 m), so no bridges or tunnels are needed before Milestone 6.
  3. *Elevation score* from that profile, so the winner is partly chosen for how it uses the hills.
  4. *Inland ground* for the winner (`gen/world/island.ts`): the relief, small bumps that fade in over the first 30 m from the road, and one peak. The peak stands where the infield is furthest from the road, with a summit 40 to 70 m above the sea (taller where there is more room) and a round foot that ends at least 60 m from the road edge. Infields with nowhere 96 m from the road get no peak.
  5. *Coast*: a limit on how high the ground may be, worked out from distance to the road. The waterline follows the road edge at a margin that is usually 15 to 35 m, comes in to 10 m at one or two bays (put beside low road) and goes out to 40 to 60 m at one or two headlands. Never under 10 m. Going inland from the waterline: a beach 5 to 25 m wide (none on cliff stretches, about a third of the coast), then a climb to road height by 5 m from the road edge. Beside a high road the climb is a cliff, up to 250% steep; the water moves out far enough to keep it at that.
  6. *Fit* (`gen/world/fit.ts`): the road is fitted into the inland ground: ground follows the road and a 2.5 m verge, sunk 0.25 m, then blends back over 10 to 25 m (wide enough to average a 40% slope). It already takes a per-sample tilt, ready for banking in step 8.
  7. *Carve* (`carveCoast`): the coast limit is applied after the fit, so an embankment can never spill into the sea. The road and verges are never touched.
  8. *Cover* (`gen/world/cover.ts`): sand, grass, rock and a variation map, one byte per cell each. No grass on the road or verges.
- **Folded sections 40 m apart:** heights come from a smooth map of the ground, so close sections start similar; the solver couples sections closer than about 55 m and limits their height difference to what a 45% bank can cover; the fit builds one surface between both road edges, never two overlapping blends (each nearby section pulls the ground towards its own height, with a pull that becomes total at its verge).
- Every seed gets a **fit report** (`gen/world/report.ts`: deepest cutting, tallest embankment, steepest bank, closest sections, nearest sea, points where ground shows through the road, points where the road hangs). Each entry has a map position, so the screenshot cameras can aim at the worst spots. Tests assert on it, and the lab shows it under "Road fit".

## Milestone 1 steps

| # | Step | Status |
| --- | --- | --- |
| 0 | Issues, branch, this file | Done |
| 1 | Scaffold: Vite, TypeScript, Vitest, Playwright, central config | Done |
| 2 | Seeded RNG, streams, seed codes, architecture guard test | Done |
| 3 | Spline: closed Catmull-Rom, even resampling, curvature | Done |
| 4 | Viewer shell: canvas, pan/zoom, seed controls, seed in URL | Done |
| 5 | Validation rules | Done |
| 6 | Straight/corner analysis and corner types | Done |
| 7 | Scoring | Done |
| 8 | Pipeline of 30 candidates, names, candidates panel, contact sheet. Mid-point check with Tane | Done |
| 9 | Variety pass: layout builder rewritten after Tane's feedback | Done |
| 10 | Contact sheet summary, Playwright screenshots of 20 seeds, cross-browser determinism | Done |
| 11 | Wrap-up: 20 fresh seeds, docs, pull request | Done |

## Working agreements

- Branch + pull request per milestone. Commit and push after each step. Direct pushes to `main` are blocked, including docs updates.
- Models: plan each milestone with Fable 5.2 at high effort; mechanical steps after plan approval can use medium effort or a cheaper model (Tane's call).
- Start each milestone in a fresh session: read `CLAUDE.md`, this file and `docs/GAME_BRIEF.md`, then plan in plan mode.
- Never let a failing test run be followed by a commit in the same command. On 2026-11-12 a Firefox failure was committed past because the test output was piped through a filter, which hid the exit code.
- Throwaway measurements go in a temporary `src/explore.tmp.test.ts` (deleted before committing). One-off screenshots: copy a script into `test-results/` (ignored by git) so it can import Playwright, with `npm run dev` running.
- On this machine, bash heredocs fail when their text has an odd number of apostrophes. Write multi-line scripts and test files with the Write tool, then run them.
- Windows and PowerShell: use `python -I` scripts in the scratchpad for multi-line file edits; avoid bash heredocs containing backticks or `${}`.
- **No Claude attribution** on commits, pull requests or issues.
- Milestone 1 pace: short report after each step; one mid-point check (done) and a sign-off at the end.
- Milestone 2 pace: short report after each step; two check-ins (after step 6 and after step 11) and a sign-off at the end.
- No linter or formatter for now. The architecture rules are enforced by a DOM-free type check of `src/core` and `src/gen` and by `src/architecture.test.ts`.
- **Generator quality comes before viewer features.** If Milestone 1 runs long, trim the viewer, not the generator.
- Tests are written before the code they cover.

## How track generation works now

1. **Style.** Each seed gets one style: folded (50%), stretched (25%) or round (25%).
2. **Skeleton.** Each of the 30 candidates builds a closed polygon of 10 to 18 corners (the brief's control points): a base shape, then *folds* (inlets pushed in, fingers pushed out), *jogs* (sideways steps that become chicanes) and *bows* (long gentle curves). A narrow fold's sides become parallel straights and its end becomes a hairpin.
3. **Rounding.** Every corner is replaced by a circular arc of a chosen radius (never under 18 m); the rest of each edge stays an exact straight. Half the tracks are reversed.
4. **Validate, analyse, score, pick** as in the brief. The winner's lap starts 40% of the way along its longest straight.

Files: `src/gen/track/layout.ts` (builder), `fillet.ts` (corner rounding), `skeleton.ts` (polygon checks), `validate.ts`, `analysis.ts`, `score.ts`, `pipeline.ts`. All numbers are in `src/config.ts`.

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
| 2026-11-13 | Haze from 1,500 m to 6,600 m (was 900 to 4,200), sea 16 km across (was 9 km), orbit camera out to 3,600 m (was 2,400) | The plan: scaled for the 2,700 m tile. A test checks the far side of the tile stays inside the haze from the furthest orbit |
| 2026-11-13 | The 3-second budget test runs in its own Playwright projects (`chromium-budget`, `firefox-budget`), after all the other tests, and takes the fastest of three builds | Headless browsers draw WebGL in software. With four of them drawing islands at once, a world took 3.1 to 4.8 s; alone it takes 0.7 to 1.2 s |
| 2026-11-13 | **Check-in 3 response approved.** Mountain-relief seeds may have laps up to 3 km (departs from the brief's 1.4 to 2.4 km); the gradient stays 15% | Tane's choice: a 15% road on a 2.4 km lap can rise only about 150 m, short of a 200 to 250 m mountain. 3 km allows about 180 m |
| 2026-11-13 | Every mountain-relief seed climbs onto its main mountain and goes round it; hilly seeds climb the lower slopes of one beyond the track | Tane's choice (check-in 3: tracks should include the mountains) |
| 2026-11-13 | Mountain shape is a per-seed trait: ridged range about 40%, rolling hill country about 35%, lone peak about 25% | Tane's choice (check-in 3: mountains are copies of one cone) |
| 2026-11-13 | **Mountain seeds are half climbing, half circling** (C1) | Tane's choice: in the spike a lap either climbed high (median 120 m) or went round the mountain (three in four fully round, median 77 m), never both |
| 2026-11-13 | Mountain seeds get a 600 m track area (others keep 500 m), 8 candidate turns and 25% weight on elevation | C1: a 500 m area capped the climbing median at 105 m; the wider area and weight lift it to 120 m with 5 of 200 laps under 90 m |
| 2026-11-12 | Unit tests may take up to 20 s each (`vite.config.ts`) | A test that builds four real worlds brushed the default 5 s when every test file ran at once, which would block commits at random |
| 2026-11-11 | Defaults for Milestone 2: 3D becomes the default page at step 16 (lab on L and `?lab=1`); start line and gate now, checkpoints in Milestone 4; seeds pick a time of day from 07:00 to 19:30; only trees and rocks as decoration; road width fixed at 13 m; README converted from UTF-16 to UTF-8 | Listed in the plan; Tane approved without changes |

## Notes for later milestones

- **M2 (from Tane):** track-first is fine. Shape the island so the track looks like it belongs: hills where it climbs, coastline near it where possible.
- **M3 (from Tane):** when M3 starts, check whether we need Rapier's cross-platform deterministic build for ghost replays, and flag it to Tane before choosing.
- **M2:** add the elevation score; move generation into a Web Worker.
- **M2:** folded tracks have parallel sections as close as 40 m (centre to centre). Terrain fitting must keep neighbouring sections at similar heights or separate them with a wall or bank, since the brief's cut-and-fill blends over 10 to 25 m.
- **M2:** corner entries have no easing (the curvature steps from zero to 1/radius). Banking handles this by averaging its tilt over 30 m (done in step 8); kerbs should allow for it too.

## Known issues and risks

- **The verge still dips a little at its outer edge on steep banks** (about 0.3 m at worst, seed 1; was about 0.45 m before R5's 4 m verge). The road is unaffected and the barrier footing hides it; the barrier test asks for a third of the footing in the ground and passes. Holding the road's height one cell beyond the verge in `fit.ts` would remove the rest.
- **Sea cliffs have a coarser saw-tooth edge on the 3 m grid** (visible in close views, for example seed 1 `look=bank` and seed 7 `look=water`). R6 left the coast beside the road unchanged. A finer grid near the coast, or smoothing the cliff's top edge, would help.
- **Coastal mountain seeds keep the sea further out** (seed 1: about half the outside within 35 m), because a cliff from a high road may be no steeper than 250% (check-in 1). Tests allow for it.
- **Flat seeds show large sandy patches** on the hinterland: their lowland is 3 m, right at the top of the sand band (1 to 2.6 m). Worth a look at check-in 3.
- **Coastal ramps slice foothills and mountain slopes into curved rock-coloured bands** (seed 12, an inland mountain seed: up to 60 to 108 m cut away, faces of 70% to 120%). The hinterland's coast and each mountain's skirt slope gently down to the sea, and where that ramp passes under higher ground the coast cuts it. Within every limit the tests set, but it looks terraced. A softer join where the coast's limit meets the ground (`lowerTo` rounds only 1.5 m) would help.
- **Mountains are very round**: their feet are circles, so a mountain off the coast reads as a round dome-island beside the track (seeds 4, 5, 15 and 17). A warped or oval foot would help.
- **Some mountains stand on their own round island across a channel from the track** (seed 4): placed where there was room off a coastal track, with the sea between their skirt and the road's land. Worth Tane's view at check-in 3; joining them or keeping them nearer is a placement rule.
- **The contact sheet frame is generous** (it holds the furthest the land could reach, 1160 m from the centre), so most islands look small in their thumbnails.
- **Hilly and mountain islands look like a tilted table with sea cliffs** until R6 (land beyond the road) and R7 (mountains). The road itself sits cleanly.
- **About one mountain lap in ten has under 60 m of height** (lowest 47 m over 200 seeds), mostly folded layouts that happen to lie across the slope. Raising the elevation weight for mountain seeds would lift it.

- **Firefox builds worlds about 1.6 times more slowly than Chromium** (measured in R1: about 0.6 s against 0.37 s per world in the worker; 0.85 s at the new tile size). Both are well inside the 3-second budget. Playwright waits up to 15 s for a new seed to appear, which covers a busy machine.

- **Not every island gets a peak.** Narrow tracks have no infield point far enough from the road (4 of 24 seeds surveyed: 2, 1234, 77777, 43950). Tane asked for one interior peak at least 60 m from the track; those two wishes cannot both be met there.
- **A bay only reaches 10 m beside low road.** Where every seaward stretch of road is high, the nearest water is further out (seed 2: 13.4 m), because the drop may not be steeper than 250%.
- Enclosed water is possible where a fold in the track is closed off by land at its mouth. None seen yet; it would be a lagoon.
- In 3D the sea cliffs read well as rock faces. The peak is craggy and a bit lumpy from the ridge texture on its sides; worth a look once lighting and shadows are in.
- The sea is a flat see-through sheet and the light is plain daylight until step 12.
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

- **2026-11-11:** Plan approved. Opened issues #1 to #6, created the branch and this file.
- **2026-11-11:** Steps 1 to 4 done. Added `src/core/dmath.ts` (own sin/cos built from plain arithmetic) and extended the architecture guard to ban `Math.sin`, `Math.cos`, `Math.hypot` and other browser-dependent functions from `src/core` and `src/gen`.
- **2026-11-11:** Steps 5 to 8 done: validation, section analysis, scoring, the 30-candidate pipeline with fallback, track names, track hashing, viewer rebuilt around the pipeline, contact sheet. Stopped for the mid-point check.
- **2026-11-12:** Tane's feedback: technical level is right; hairpins on most tracks, but they were being rejected as too tight and not counted; tracks should fold back on themselves (reference: the Interlagos and Sepang layouts), and may be round, stretched or folded.
- **2026-11-12:** Step 9 done. Layout builder rewritten (skeleton, folds, jogs, bows, exact corner rounding, three styles, both directions). Fixed a false "crosses itself" verdict on exact diagonal straights. Scoring tightened. Over seeds 1 to 200: every candidate valid, no fallbacks, laps from 1.4 to 2.3 km, 7 to 14 real corners, half the tracks clockwise. 252 unit tests and 24 Playwright tests pass.
- **2026-11-12:** Steps 10 and 11 done. Contact sheet summary line and `?seeds=` list; cross-browser determinism test passes in Chromium and Firefox; screenshot spec now asserts every seed has a valid winner with no fallback. Verified 20 fresh random seeds (73242, 54536, 43950, 92010, 66907, 29980, 96072, 57351, 6492, 69211, 8509, 27227, 90169, 30860, 73750, 51073, 16182, 18418, 26275, 28919): all valid, no fallback, 9 folded / 3 stretched / 8 round, laps 1674 to 2333 m, scores 88 to 97. Also reviewed contact sheets for seeds 1 to 40, 5000 to 5019 and 73000 to 73019. README and CLAUDE.md commands updated; pull request opened.
- **2026-11-12:** Tane signed off Milestone 1. PR #7 merged with a merge commit, issue #1 closed. Next: Milestone 2 planning in a fresh session.
- **2026-11-11 (Milestone 2):** Plan approved in plan mode. Created `milestone-2-world`; recorded the step table, design and decisions here.
- **2026-11-11 (Milestone 2):** Steps 1 and 2 done. `src/core/noise.ts` (seeded simplex, fbm, ridged) and `scalar.ts`. Generation now runs in a Web Worker (`src/worker`): the lab, the contact sheet and `window.seedCircuit.hashFor` (now async) all go through `genClient()`. The worker file has its own type check (`tsconfig.worker.json`). 282 unit tests and 50 Playwright tests pass; fingerprints still match Node in Chromium and Firefox.
- **2026-11-11 (Milestone 2):** Step 3 done. `gen/world/relief.ts` and `gen/road/profile.ts`; every candidate now carries a `profile` (road and ground heights). `Grid` moved to `core/grid.ts`. The lab has an Elevation panel (chart plus facts). Seed screenshots are now 1250 px tall so the whole sidebar shows. Over 100 seeds (3,000 layouts): lap height range 4 to 29 m (median 19 m), cut and fill at most 5.3 m, steepest bank between close sections 27% (limit 45%), about 70 ms per seed in Node. 310 unit tests and 52 Playwright tests pass.
- **2026-11-11 (Milestone 2):** Step 4 done. Elevation is scored (12%; the other four parts 22% each). Over seeds 1 to 200: 45 winners changed, 197 still have a hairpin, winner height range 15 to 25 m for most (median 20.5 m, lowest 5.6 m, highest 29.6 m), scores 85 to 99. The Milestone 1 test "7 to 14 real corners" failed for seed 151 until the corner-count penalty was raised. 319 unit tests and 53 Playwright tests pass.
- **2026-11-12 (Milestone 2):** Step 5 done. `gen/world/heightfield.ts`, `nearest.ts` (nearest road point and inside-the-loop maps), `island.ts`, `gen/generate.ts` (`generateWorld`, `hashWorld`). The worker answers `world` requests. The lab draws the island under the winning track (I toggles it) and contact sheets show islands. Chromium, Firefox and Node build identical islands. Found and fixed on the way: a crease at the map origin, cliffs where the coast margin jumped, 200% slopes from headlands, shoals far out to sea. 364 unit tests and 41 Playwright tests pass.
- **2026-11-12 (Milestone 2):** Step 6 done; Part A complete. `gen/world/fit.ts`, `cover.ts`, `report.ts`; `WorldResult` now has `natural`, `ground`, `cover` and `report`. The lab draws the fitted ground with cuttings tinted red and embankments blue, and has a "Road fit" panel; the screenshot test fails any seed whose fit is not clean. Over 24 seeds: nothing through the road, nothing hanging, deepest cutting 5.1 m, tallest embankment 4.6 m, steepest bank 58%, sea 44 to 63 m from the road edge. 404 unit tests and 59 Playwright tests pass. Stopped for check-in 1.
- **2026-11-12 (Milestone 2):** Check-in 1. Tane's feedback: vary the coastline (beach 5 to 25 m, cliffs, 1 to 2 headlands, 1 to 2 bays), one interior peak 40 to 70 m, sea 15 to 35 m from the road with a few spots at 10 m, smooth coastline. Rebuilt `island.ts` around those numbers (`shoreShape`, `coastProfile`, `carveCoast`, `chooseFeatures`, `placePeak`), changed the order to fit-then-carve, made the distance map exact, and made the lab picture fine-grained. Over 24 seeds: sea 15 to 35 m from the road on 63% to 84% of each coast (median 76%), nearest water 10.0 m on 23 seeds, headlands reach 43 to 62 m, peaks 40 to 64 m on 20 seeds, fit still clean (deepest cutting 5.1 m, tallest embankment 4.6 m, steepest bank 64%), a whole world in about 450 ms. 432 unit tests and 59 Playwright tests pass.
- **2026-11-12 (Milestone 2):** Step 7 done. Installed `three@0.187.0` and `@types/three@0.187.0`. New: `src/render` (`palette.ts`, `terrainChunks.ts`, `worldView.ts`), `src/camera/orbit.ts`, `src/app/worldPage.ts`, `e2e/world.spec.ts`. `/?view=3d&seed=42` builds the world in the worker and shows the island with a camera that circles it (drag to turn, scroll to zoom). Headless Chromium and Firefox both draw WebGL with no special flags, so the Playwright risk from the plan is closed. Screenshots land in `test-results/screens/world-<seed>.png`. 521 unit tests and 56 Playwright tests pass.
- **2026-11-12 (Milestone 2):** Step 8 done. `gen/road/banking.ts`, `ribbon.ts`, `meshBuilder.ts`; `WorldResult.road` holds the banking and the surface mesh; the fit and its report now use the banking. `render/road.ts` and `roadColours.ts` draw it. `camera/spots.ts` gives close views: `/?view=3d&seed=42&look=cut` (or `fill`, `bank`, `close`, `water`), and the screenshot test takes them for every seed (`$env:LOOKS` chooses which). With banking on, the six test seeds still have nothing through the road and nothing hanging.
- **2026-11-12 (Milestone 2):** Step 9 done. `gen/road/kerbs.ts` (`findKerbs`, `buildKerbs`); `WorldResult.road.kerbs` holds the spans and the mesh. Close views now also take `&look=hairpin` (tightest corner), `&look=start` and `&at=x,z` (any map position). Checked by eye on seeds 42 and 100, including the tightest U-turns.
- **2026-11-12 (Milestone 2):** Step 10 done. `gen/road/barriers.ts` and `startGate.ts`; `WorldResult.road` now also has `barriers` and `gate`. Every part of the road is one of eleven materials listed in `gen/road/ribbon.ts`, coloured in `render/palette.ts`. A new real-seed test checks every barrier is footed in the ground. 585 unit tests pass.
- **2026-11-12 (Milestone 2):** Step 11 done. `camera/flyAlong.ts` plans the flight (it climbs early over anything that would come within 2.5 m). `app/worldPage.ts` now opens flying, with Play/Pause (Space), Circle the island / Fly the lap (C), New island (N) and speed (up and down arrows); it starts paused for anyone whose system asks for reduced motion. The screenshot test takes four flying views per seed (`$env:LAPS` chooses where). Stopped for check-in 2.
- **2026-11-12 (Milestone 2):** Check-in 2. Tane flew the islands in 3D and asked for a rework: hillier ground, mountains of 200 to 250 m and more of them, tracks that sometimes climb (up to 15%), land that extends past the track with the road only sometimes by the sea, road width varying from 12 to 22 m, and traits that combine differently per seed. Planned in plan mode and approved (rework steps R1 to R8, then check-in 3, then steps 12 to 17). Step R0 done: the plan is recorded in "Milestone 2 rework" above. No code changed since step 11. Session ended here; the rework starts in a fresh session at R1.
- **2026-11-12 (Milestone 2 rework):** Step R1 done, measurements only (no code changed). Folds did not drop when elevation joined the score (1.12 per winner now, 1.07 with the Milestone 1 scorer, seeds 1 to 200), so style weights stay. The new 2700 m tile at 3 m cells builds in about 0.58 s in Node, 0.49 s in Chromium and 0.85 s in Firefox, so the grid stays as planned. Numbers are in "Rework measurements".
- **2026-11-12 (Milestone 2 rework):** Step R2 done. `gen/character.ts` (`pickCharacter`) and `world.character` weights in the config; `TrackResult.character` (relief, coast, mountains, width) is part of the track fingerprint. The lab's Track panel lists it, each contact sheet caption names it, and the sheet summary counts reliefs and coasts. `pickWeighted` moved to `core/rng.ts`. Over seeds 1 to 2000 every value lands within 4 points of its weight. Nothing reads the character yet, so islands and layouts are unchanged. 628 unit tests and 139 Playwright tests pass.
- **2026-11-13 (Milestone 2 rework):** Step R3 done. `createRelief` builds the ground for the seed's relief; hilly and mountain seeds have a highland (`placeHighland`) whose flank the track climbs. The gradient limit (8%, or 15% on mountain seeds) and the elevation score's targets come from the relief. New tests: `gen/road/climb.<relief>.test.ts` generate 200 seeds of each relief and check gradient, crests, cut and fill, banks and the lap's height range (shared checks in `testing/reliefChecks.ts`). Measured in a throwaway spike before the tests were written. Winners changed on every seed that is not rolling. The 3D screenshot set now includes seed 1 (a mountain seed). Results are in "Rework measurements".
- **2026-11-13 (Milestone 2 rework):** Step R4 done. `gen/road/width.ts` (`solveWidth`) gives the winner a width per sample; `WorldResult.road.width`. The ribbon, kerbs, barriers, start gate, ground fit, fit report, cover and island all take it (`buildIsland` and the mesh builders have a `width` argument; `fitRoad` and `fitReport` take it in their input; `buildCover` and `carveCoast` take the island's `edge` map). The lab draws the true width and says how much of the lap is wider; the contact sheet draws it too. `profile.ts` did not need to change, because the road is never widened beside a close section. 726 unit tests and 150 Playwright tests pass.
- **2026-11-13 (Milestone 2 rework):** Step R5 done (switched from Fable 5.2 to Opus 5.5 part way through, when Tane's Fable usage ran out). Tile 2700 m, 3 m cells, verge 4 m. Fixed a NaN in `fitRoad` at cells exactly on a verge's outer edge. Build time and footing depth are in "Rework measurements". 729 unit tests and 150 Playwright tests pass.
- **2026-11-13 (Milestone 2 rework):** Step R6 done. `world.hinterland` config; `shapeHinterland` and `fillCutOffSea` in `island.ts`; `Island.seaside`. New `hinterland.test.ts` (8 seeds of each coast trait). Contact sheets frame whole islands. Three things found by measuring and fixed on the way: long 40 to 80 m strips (fixed by cutting the pattern instead of lowering it), 400% slopes where the pattern fades out beside high roads (fixed by a gentler pattern and a slower climb), and sea cliffs pulling the barrier's ground down (fixed by the 7 m clear strip). Results are in "Rework measurements". 755 unit tests and 152 Playwright tests pass.
- **2026-11-13 (Milestone 2 rework):** Step R7 done. `placeMountains` replaces `placePeak`; `Island.mountains`; foothills; `Cover.snow` and its colour. New `mountains.test.ts` (16 seeds: mountain-relief, and rolling with three mountains). Found and fixed by measuring: mountain sides of 250% to 450% (ridges too small), a 2 m mountain on a plateau, 500% slopes at the edge of a mountain's skirt (no sea-bed shelf), creases where the nearest road changes (the hinterland's coast now climbs to the land's height), and a step 670 m from the road (the land height has to be used everywhere). Two new known issues for check-in 3: coastal ramps slicing hills into bands, and very round mountains. 768 unit tests and 152 Playwright tests pass.
- **2026-11-13 (Milestone 2 rework):** Step R8 done. `buildTerrainChunks` takes the road and draws far chunks at quarter detail with stitched edges; fog, sea and orbit range scaled; the budget test moved to its own projects that run last. Triangle counts are in "Rework measurements". 774 unit tests and 307 Playwright tests pass (with screenshots of seeds 1 to 20). **The rework is complete; stopped for check-in 3.**
- **2026-11-13 (Milestone 2):** Check-in 3 with Tane. Feedback recorded under "Check-in 3 feedback": tracks should go up and round mountains, some laps should climb more, and mountains should vary in shape (rolling hills, ridged ranges of sharp peaks). The session was at about 770,000 tokens, so the response will be planned in plan mode in a fresh session.
- **2026-11-13 (Milestone 2):** Check-in 3 response planned in plan mode and approved (steps C0 to C6, then check-in 4). Tane chose 3 km laps on mountain seeds, every mountain seed climbing its mountain, and three shapes (range, hill country, lone peak). Step C0 done: the plan is recorded under "Check-in 3 response". No code changed.
- **2026-11-13 (Milestone 2):** Step C1 done, measurements only (throwaway spike, deleted). A broad dome rejects almost every layout; a 15% cone with a steep top works. A lap climbs high or circles the mountain, not both, so Tane chose half and half for mountain seeds. Mountain seeds get a 600 m track area, 8 turns and 25% elevation weight. Numbers and decisions are under "Rework measurements", C1. No generator code changed.
