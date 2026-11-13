# Project state

Updated at the end of every work session. A new session should read this first, then `docs/GAME_BRIEF.md`.

## Where we are

- **Current milestone:** 2, World and track in 3D ([issue #2](https://github.com/TechnologicTEC/Random-Racing/issues/2)), in progress. Milestone 1 (Track lab) is merged and signed off (PR #7)
- **Branch:** `milestone-2-world`. `main` is protected by a GitHub ruleset (no force pushes, no deletion, pull request required); one pull request per milestone, merged after Tane signs off
- **Last finished step:** 12, water and sky with the time of day from the seed (see "Step 12" below)
- **Next step:** step 13, trees, rocks and clouds. Then steps 14 to 17. Read "Milestone 2 rework" and "Check-in 3 response" below first; they replace parts of "Milestone 2 design"

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
| C0–C6 | **Check-in 3 response** (table below), then check-in 4 | Done |
| 12 | Water and sky; time of day from the seed | Done (12a to 12f, see "Step 12") |
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
| C2 | Landform trait: `character.ts`, config weights, lab and contact sheets | Tests: same seed same landform; each shape at about its weight over 2000 seeds; other traits unchanged on seeds 1 to 2000 | Done, with the climb or circle route for mountain seeds |
| C3 | `landforms.ts`: range, hills, peak | Tests per shape: heights in range; steepest slope within limit; peak foot not a circle (radius varies at least 25%); range has 3 to 6 summits with saddles at least 55% of the lower neighbour; hill country at least 5 swells, below the snow line, slopes at most about 60%; no copies | Done; slope limits 120% for peaks and 150% for ranges (see decisions) |
| C4 | Massif in the relief, longer mountain laps, turns, earthworks rule, score changes | Mountain climb tests: new lap range band, 15%, crests, cut and fill and banks on every valid candidate, no fallback on 200 seeds, most winners round the summit or near its top, laps at most 3 km. Other reliefs still pass at 2.4 km. Build time measured | Done; steep rock cuttings beside mountain roads allowed (Tane's choice, see decisions) |
| C5 | Island with shapes and the main mountain from the relief; joined-land placement; softer coast join | Mountain tests rewritten: not doubled; others in shape and 60 m clear; every mountain joined by land to the road's land; main top never carved; coastal mountain seeds keep sea by the road; snow only on range and peak. Fit clean on 30 worlds; barrier footing passes | Done, except the softer coast join: it did not soften the bands (see C5 results) |
| C6 | Lab and 3D: shape shown, `look=summit`, `look=climb` | Screenshots of seeds 1 to 20 plus mountain seeds of each shape checked by eye; triangle counts; 3 s budget passes in Chromium and Firefox | Done |
| | **Check-in 4:** Tane looks at contact sheets and flies mountain seeds of each shape | Feedback | Done: looks good, no changes asked; the rock trenches on climbing seeds stay as they are for now |

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

**C3 results (2026-11-13): the three shapes on their own, 30 streams each** (peaks and ranges 200 and 250 m high, hill country 120 and 170 m), measured on the game's 3 m grid.

| Shape | Slope limit | Steepest (median / worst of 30) | Size, including the foot |
| --- | --- | --- | --- |
| Lone peak | 120% | 95% / 115% | about 1.0 to 1.6 km across |
| Ridged range | 150% | 116% / 122% | 3 to 6 peaks over 300 to 1200 m; with the feet up to about 2 km long and 0.8 km wide |
| Hill country | 60% | 54% / 58% | about 1.3 to 2 km across; the tallest is the widest |

Looked at as shaded maps of 8 streams per shape (not yet in the game): peaks are oval with rock ridges and gullies; ranges are lines of spires, some bending; hill country is clusters of swells running into each other on an uneven dome. The first two attempts were rejected by eye: peaks read as smooth domes with a "+"-shaped top, ranges as faceted crystals with a sawtooth outline, hill country sat on a round disc.

**C4 results (2026-11-13): the massif in the relief, 60 seeds for each route and shape.** Real pipeline (8 turns, laps 1.6 to 3 km, 600 m area, earthworks rule). "Round" means the summit is inside the loop; "near the top" means within 150 m of the top's foot.

| Route, shape | Lap range: lowest / tenth / median / ninetieth / highest | In band | Round; near the top | Candidates rejected for earthworks | Summit (above the lowland) | Track time in Node, median |
| --- | --- | --- | --- | --- | --- | --- |
| Climbing, lone peak | 74 / 96 / 112 / 128 / 138 m | 57 of 60 (90 to 160 m) | 0; 60 | 0.7% | 226 m | 100 ms |
| Climbing, range | 74 / 92 / 111 / 134 / 143 m | 57 | 0; 60 | 0.7% | 226 m | 121 ms |
| Climbing, hill country | 74 / 100 / 121 / 138 / 157 m | 57 | 0; 60 | 0% | 176 m | 101 ms |
| Circling, lone peak | 46 / 60 / 79 / 92 / 95 m | 59 of 60 (55 to 100 m) | 40; 60 | 49% | 154 m | 136 ms |
| Circling, range | 51 / 62 / 80 / 92 / 107 m | 55 | 32; 60 | 59% | 154 m | 162 ms |
| Circling, hill country | 58 / 70 / 85 / 96 / 103 m | 58 | 49; 60 | 17% | 127 m | 117 ms |

No fallbacks. Deepest centre-line cut 7.5 m, tallest fill 6.0 m, steepest bank between sections 46%. About 3 in 5 mountain laps are over 2.4 km; the longest 2.97 km.

- *Compared with C1's test mountain:* the lap ranges match (climbing median 120 m in C1, circling 77 m). Fewer circling laps go fully round (C1: three in four), most of all with ranges: the real tops are wider than C1's 130 m bell.
- *Hilly seeds, 100 seeds:* 4 turns lift the median lap range from 42 to 45 m and bring all 100 laps into the 30 to 60 m band (95 with 1 turn), for 121 ms instead of 46 ms per track.
- *Banks beside the road on 30 mountain worlds* (whole island, after the fit): median 104%, ninetieth percentile 157%, steepest 209%. Laps that reach the top run across ground 40 to 90% steep and are cut into it. Checking cut and fill at the edges of the verges as well as the centre line was tried: it rejected most circling candidates, two seeds fell back to the oval, one took 3.2 s, and the banks barely changed. Tane chose to allow the rock cuttings.
- *World build time, fastest of three:* in Node, mountain worlds 0.87 to 1.0 s, seed 7 0.84 s. In the browsers on the lab page: seed 3 (climbing range, the slowest kind) 1.0 to 1.2 s in Chromium and 1.4 s in Firefox; seed 7 0.8 s and 1.1 s. On the 3D page, where headless Chromium draws in software and takes processor time from the worker: seed 3 3.0 to 3.3 s in Chromium (2.3 to 2.5 s before C4) and 1.8 to 2.0 s in Firefox; seed 7 2.0 to 2.6 s and 1.1 to 1.5 s, as before C4. The budget test (seed 7) passes in both.
- *Speed-ups that keep results the same:* the road solver finds which parts of the lap run side by side once per candidate instead of once per turn (track 300 to 400 ms down to 100 to 160 ms); the island looks up the relief once per cell; each spire of a range skips points beyond its reach.

**C5 results (2026-11-13): mountains in the seed's shape on the island.**

- *Sizes:* a shape's foot spreads with its height. At 250 m a lone peak's foot is about 850 m in radius (1.7 km across; the old round mountain was 437 m), a range's 700 m, and hill country at 170 m about 860 m. Beside a 1 km track area on a 2.7 km tile most full-height mountains cannot fit, so a mountain is built lower, and so smaller, where it must.
- *Placement over seeds 1 to 60* (as they come): 84 of 90 mountains asked for found room (lone peaks 30 of 31, ranges 16 of 20, hill country 38 of 39). Their summits are a median 84 to 88% of the middle of their range, none under 57%.
- *Coastal mountain seeds* (seeds 1 to 6, forced coastal): the sea is within 120 m of the road along 19 to 67% of the lap. Climbing ranges are lowest (0.19 and 0.28): the road runs up beside the range, whose land covers that side.
- *Build time, fastest of three, in Node:* seed 3 (climbing range) 1.15 to 1.27 s (1.0 s after C4), seed 13 1.14 s, seed 7 0.86 s. In the browsers: on the lab page seed 3 takes 1.0 s in Chromium and 1.5 s in Firefox; on the 3D page 2.9 to 3.7 s in Chromium and 2.0 s in Firefox; seed 7 2.1 to 2.5 s and 1.4 to 1.5 s. The budget test (seed 7) passes in both.
- *Speed-ups that keep results the same:* a spire's shape is worked out once and moved while its col is searched for (it was rebuilt 24 times); the massif is built once in the island and handed to the relief; a range skips spires too far away to be the nearest; each cell's distance outside each foot is kept from pass 2 for pass 3.
- *The coast bands (seed 12) were not softened.* 9,816 of the 10,887 cells steeper than 60% on seed 12 (away from the road and the feet) are ground the coast cut more than 2 m. They are the hinterland's coast cutting a sea cliff, up to its 250% limit, into the cone 60 m and more above the sea. Three changes were tried and undone: rounding the top of the cut over 1.5 m plus 30% of the coast's height there (no visible change; 10,835 steep cells); the coast's limit rising inland at 50% instead of 100% (no visible change); the hinterland's coast climbing half as steeply (11,327 steep cells: a gentler climb cuts a wider swathe). On land this high the coast must drop 60 to 100 m wherever the hinterland's edge crosses it. The fix is for the coastline to follow the terrain (the waterline where the land is already low), a change to how the island's outline is chosen. For check-in 4.

**C6 results (2026-11-13): the lab and 3D.**

- *Seeds photographed:* 1 to 20 (mountain seeds among them: circling lone peaks 1, 11, 12, 14; climbing range 3; circling range 13) plus 27 (circling hill country), 44 (climbing lone peak), 47 (climbing range) and 53 (climbing hill country). Each has the overview, four flying views and eight close views (cut, fill, bank, water, hairpin, start, summit, climb), 312 in all, plus lab pages and contact sheets from seeds 1, 21 and 41.
- *Checked by eye:* the summit view shows the lap's highest point with the main summit behind it on every mountain seed; the climb view looks up the steepest stretch. Flat seed 9 (no mountain) looks along the road from its highest point. Two close views were blocked by a mountainside (seed 44 `bank` was half white snow, seed 47 `water` only grass); the close camera now turns until its view is clear (see decisions).
- *What the pictures show for check-in 4:* deep rock trenches with saw-tooth edges between parallel sections at different heights on climbing seeds (seed 3 `hairpin` and `start`, seed 53 `cut`, `fill` and `start`); the steep rock cuttings Tane allowed in C4, very visible from close up. Seed 44's snow cap looks smeared at close range.
- *Ground triangles loaded* (far ground at quarter detail), 11 seeds: 47% to 74% of full detail, 318k to 434k on hilly and mountain seeds (R8: 455k at most). Seed 2024 keeps all 164k.
- *Triangles drawn per frame* (Chromium, 1280 by 720), seeds 1, 3, 7, 12, 13, 27, 44, 47, 53, 2024, 48213: circling view 182k to 428k in 25 to 80 draw calls (R8: 182k to 407k, 25 to 70); flying view 92k to 197k in 13 to 38 calls (R8: 92k to 141k, 13 to 29); summit view 116k to 337k in 17 to 68 calls.
- *Budget:* the 3-second budget test (seed 7) passes in Chromium and Firefox.

## Step 12: water and sky (2026-11-14)

Plan approved in plan mode. Tane's choices: seeds pick a time from 07:00 to 19:30, all equally likely, no night; a clock and slider with a "Seed's time" button and a `time=17:30` address option; waves always moving (the page draws every frame unless held still); the seed also picks the compass direction of the sun's path. The full plan: `C:\Users\tanee\.claude\plans\read-claude-md-docs-state-md-and-graceful-peach.md`.

| # | Step | Status |
| --- | --- | --- |
| 12a | `gen/world/sky.ts` (`pickSky`), `world.sky`, `WorldResult.sky` in the world fingerprint, lab line | Done |
| 12b | `render/daylight.ts` (`daylightAt`): sun direction, sky, haze, light and water colours as plain numbers | Done |
| 12c | Sky dome (`render/sky.ts`), lights and haze from the daylight; `time=`; `look=sun`; no drawing while a world is built | Done |
| 12d | Water (`render/water.ts`, `render/waterDepth.ts`) in place of the flat sea; waves move every frame unless held still | Done |
| 12e | Clock, slider and "Seed's time" button; the title card names the time and its light | Done |
| 12f | Screenshots, counts, this file | Done |
| 12g | Tane's feedback on the water (below): waves of our own in `render/waves.ts` | Done |

**What carried over from the island demo:** the sky shader (horizon to zenith, glow round a low sun, sun disc and halo, haze below the horizon), its day colour keys and blends, and its water shader (summed wave slopes, shallow to deep colour by depth, sky reflection, sun glints, moving shore foam, see-through shallows). Moon and stars were left out: there is no night.

**What changed for the 2.7 km tile:** the sun's path (sunrise 06:30, sunset 20:00, 60 degrees at its highest, so 07:00 and 19:30 are about 7 degrees up; the demo's sun set at 18:00); colours converted to linear light and light strengths matched to the old midday (sun 2.4, sky 1.5); the dome sized from the camera's far distance and drawn first, hiding nothing; the depth comes from the island's fitted ground as a 901 by 901 float texture; the large waves fade between 300 and 1500 m and the glints dim where the small waves have faded, because from the circling camera, a kilometre or more out, the regular waves made a fish-scale pattern; the sun disc is about half the demo's size.

**Results.**
- *Screenshots checked by eye:* seeds 1 to 20 at their own times (view from above, four flying views and eight close views each, 260 pictures); a time strip of seeds 1, 7, 12, 44 and 53 at 07:00, 10:00, 13:00, 16:30, 18:30 and 19:30, from above and facing the sun (`look=sun`); seed 44 in Firefox against Chromium (same picture; only the slider's thumb differs). Sky and sea meet at the horizon with no seam; shallows and foam line beaches and cliff feet; the sun shows low in morning and evening views; nothing is hidden by the dome.
- *Triangles and draw calls per frame* (Chromium, 1280 by 720, seeds 1, 3, 7, 12, 44, 53, 2024): circling view 184k to 401k in 26 to 81 calls; flying view 94k to 193k in 14 to 39; summit view 118k to 339k in 18 to 69. As in C6 plus the dome's one call (the water replaces the flat sea's).
- *Budget:* both 3-second budget tests pass in the full run. Frame rate on a real graphics card is for step 15 (headless browsers draw in software).
- 883 unit tests and 194 browser tests pass.

**Tane's feedback after trying it (2026-11-14):** the time, sunrise and sunset all look good. The water looks like a checker pattern, blurry and not like waves: waves should be spaced out more and come unevenly, some bigger, some later, some smaller.

**12g, the response.** The demo's five regular waves crossed at wide angles and made a lattice, and far-off waves smaller than a pixel shimmered into false patterns. The waves are now our own (`render/waves.ts`, settings in `render.water`):
- Eight trains, 62 m down to 2.1 m long, all within 40 degrees of one wind direction, so crests are long lines across the wind and not a grid.
- Each train builds up and dies down in patches about 4.5 wavelengths across (waves come in groups), and its crests are pushed forward or back by up to half a wavelength from patch to patch, so they bend and come sooner or later.
- Crests are peaked, with broad troughs between; long waves travel faster than short ones, as at sea.
- A wave is dropped once a pixel covers 7% to 30% of its length (measured the way it travels), which replaces the fades by distance. Where waves are dropped, the sun's glints spread and soften.
- The water takes light and shade from the waves' faces, and the tops of the taller waves are a little lighter. The demo's water only showed waves through reflections, so they vanished when seen from above.

`waveField` does the sums in TypeScript for the tests (13 of them: uneven gaps between big crests, crests of very different sizes, no repeat down or across the wind, peaked crests, slopes that match heights, travel down the wind); `wavesGlsl` writes the same sums for the shader. Checked by eye on seeds 2, 4, 5, 6, 7, 9, 13, 15, 17, 18, 19 and 20, from above, flying and close to the shore. 896 unit tests and 194 browser tests pass.

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
- Throwaway measurements go in a temporary `src/explore.tmp.test.ts` (deleted before committing). One-off screenshots: copy a script into `test-results/` (ignored by git) so it can import Playwright, with `npm run dev` running. Every Playwright run empties `test-results/`, so keep the script's master copy in the scratchpad and copy it in again.
- Run Vitest from PowerShell. From Git Bash every test file fails with "Vitest failed to find the current suite" (found 2026-11-14).
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
- **A bay only reaches 10 m beside low road.** Where every seaward stretch of road is high, the nearest water is further out (seed 2: 13.4 m), because the drop may not be steeper than 250%.
- Enclosed water is possible where a fold in the track is closed off by land at its mouth. None seen yet; it would be a lagoon.
- In 3D the sea cliffs read well as rock faces. The peak is craggy and a bit lumpy from the ridge texture on its sides; worth a look once lighting and shadows are in.
- **The sun's glare on the sea, seen from the circling camera, is a wide pale patch with wave stripes in it** (seed 7 at 10:00). Softer than it was; `render.water.glint*` are the settings.
- **The water shader does more work per pixel than the demo's** (eight wave trains, each with a noise lookup). Step 15 measures the frame rate on a real graphics card; fewer trains is the lever.
- The wind blows the same way on every island. It could come from the seed.
- **07:00 and 19:30 are quite dark**, with pink skies (see the step 12 time strip). Sunrise, sunset and the blends are config values; for Tane to judge.
- **The page now draws every frame** while the waves move. Step 15 measures the frame rate on a real graphics card; reduced motion and `still=1` stop it.
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
- **2026-11-13 (Milestone 2):** Step C2 done. `Character.landform` and `Character.route`, their weights, `withCharacter` can force them, and the lab shows "Route" and "Mountain shape"; captions read like "mountain, circling · touches · 3 mountains, lone peak" and the sheet summary counts shapes and routes. Nothing reads them yet, so the lab can name a route or shape the land does not show until C4 and C5. The budget tests now run one after the other (see decisions). World build time alone, seed 7, worker: Chromium 1.1 to 2.2 s, Firefox 1.3 to 1.6 s, slower than R7's measurement on a busier machine. 779 unit tests and 154 Playwright tests pass.
- **2026-11-13 (Milestone 2):** Step C3 done. `gen/world/landforms.ts` (`buildLandform`: peak, range, hills) and `world.scenery.landforms`; 25 new tests in `landforms.test.ts`. Nothing uses it yet. Shapes reworked twice after looking at shaded maps (see "Rework measurements", C3). 804 unit tests and 154 Playwright tests pass.
- **2026-11-13 (Milestone 2):** Step C4 done. Massif in the relief (`placeMassif`), rules by relief (`gen/track/rules.ts`), candidate turns, the earthworks rule (`gen/track/earthworks.ts`), mountain score weights; the island lists the massif as its main mountain; the lab shows the turn and the new rejection reasons. Tried checking earthworks at the verge edges (rejected too many circling layouts) and a faster blur (no measurable gain); both undone. Tane chose to allow steep rock cuttings beside mountain roads. 838 unit tests and 154 Playwright tests pass. Numbers under "Rework measurements", C4.
- **2026-11-13 (Milestone 2):** Step C5 done. Island mountains are landforms in the seed's shape (heights by shape), built lower where they do not fit, joined to the road's land, kept from the coast by their own foot; hill country stays green. Mountain tests rewritten (19, including a flood fill from the road); shore widths reworked twice after steep spots on seeds 5 and 7. The softer coast join was tried three ways and undone. Spire shapes are built once; the massif once per island. 843 unit tests and 154 Playwright tests pass. Numbers under "Rework measurements", C5.
- **2026-11-13 (Milestone 2):** Step C6 done. `WorldResult.mountains`; `look=summit` and `look=climb` (`lookAtRoad`); the 3D title card names the kind of island; close cameras turn away from a hillside in the way. Screenshots of seeds 1 to 20 plus 27, 44, 47 and 53 checked by eye; triangle counts and budget in "Rework measurements", C6. 854 unit tests and 412 Playwright tests pass. **Check-in 3 response complete; stopped for check-in 4.**
- **2026-11-13 (Milestone 2):** Check-in 4. Tane looked at the C6 screenshots: looks good, carry on. No changes asked. Next: step 12.
- **2026-11-14 (Milestone 2):** Step 12 planned in plan mode (Tane chose daylight only, a slider, always-moving waves, a seed's sun bearing) and done in six commits (12a to 12f): the seed's time of day, `render/daylight.ts`, the sky dome, the water shader, the time controls, and screenshots of seeds 1 to 20 plus a time strip. Found on the way: the budget test failed under load once the page drew while worlds were built (fixed by not drawing during builds), and Vitest does not run from Git Bash on this machine. 883 unit tests and 194 browser tests pass. Next: step 13.
- **2026-11-14 (Milestone 2):** Tane tried step 12: time, sunrise and sunset good; the water looked like a checker pattern, not waves. Step 12g: new waves in `render/waves.ts` (wind-driven trains in groups, bent and peaked crests, dropped when too small to draw), shading from the waves and lighter crests in `render/water.ts`. 896 unit tests and 194 browser tests pass.
