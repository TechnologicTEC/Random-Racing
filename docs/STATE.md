# Project state

Updated at the end of every work session. A new session should read this first, then `docs/GAME_BRIEF.md`.

## Where we are

- **Current milestone:** 2, World and track in 3D ([issue #2](https://github.com/TechnologicTEC/Random-Racing/issues/2)), in progress. Milestone 1 (Track lab) is merged and signed off (PR #7)
- **Branch:** `milestone-2-world`. `main` is protected by a GitHub ruleset (no force pushes, no deletion, pull request required); one pull request per milestone, merged after Tane signs off
- **Last finished step:** Milestone 2 step 2 (generation runs in a Web Worker)
- **Next step:** Milestone 2 step 3, rolling relief and the road height solver

## Milestone 2 steps

Part A is data only (no Three.js). Part B is the 3D view.

| # | Step | Status |
| --- | --- | --- |
| 0 | Branch, plan and decisions recorded here | Done |
| 1 | `core/noise.ts`, `core/scalar.ts`: seeded simplex, fbm, ridged, exact maths only | Done |
| 2 | Web Worker: protocol, handler, client; lab and contact sheet generate through it | Done |
| 3 | Rolling relief and the road height solver (gradient, crests, close sections); elevation chart in the lab | To do |
| 4 | Elevation score at 12% weight | To do |
| 5 | Island: height grid, coast shaped by the track, natural ground; island map in the lab | To do |
| 6 | Cut and fill, cover maps, fit report, `generateWorld`, world fingerprint | To do |
| | **Check-in 1 with Tane:** 2D contact sheets of islands for 20 seeds | |
| 7 | Add Three.js; `/?view=3d` with terrain chunks and an orbit camera; Playwright WebGL screenshots proven | To do |
| 8 | Banking, road frames, asphalt ribbon | To do |
| 9 | Kerbs | To do |
| 10 | Barriers, start line and gate | To do |
| 11 | Fly-along camera and HUD | To do |
| | **Check-in 2 with Tane:** fly a few seeds | |
| 12 | Water and sky; time of day from the seed | To do |
| 13 | Trees, rocks and clouds | To do |
| 14 | Grass | To do |
| 15 | Shadows, far-terrain detail levels, low quality option, performance numbers | To do |
| 16 | 3D becomes the default page; lab on the L key and `?lab=1` | To do |
| 17 | 20-seed check with screenshot sheets and fit reports; pull request | To do |

## Milestone 2 design

One rule: **generation says what the world is, as plain numbers; rendering only draws those numbers.**

- `src/core`: RNG, exact maths, noise, hashing. `src/gen/track`: the Milestone 1 layout pipeline. `src/gen/road`: road heights, banking, 3D frames, kerbs, barriers and their triangle lists. `src/gen/world`: relief, island, cut and fill, cover maps, tree and rock positions. All pure, no Three.js, exact maths only.
- `src/worker`: runs generation off the main thread. `src/render`: the only folder that imports Three.js. `src/camera`: camera maths as plain numbers. `src/app`: page wiring.
- **Island around the track, in this order:**
  1. *Relief* from the seed alone: rolling hills, lowlands at 3 m, hills to about 30 m, slopes under about 12%.
  2. *Road heights* for each candidate: sample the relief along the line, then smooth and enforce gradient at most 8%, crest radius at least 200 m, at least 2 m above the sea, at most 5 m above or 6 m below the ground (no bridges or tunnels before Milestone 6).
  3. *Elevation score* from that profile, so the winner is partly chosen for how it uses the hills.
  4. *Coast* for the winner: inside the loop is land; outside, land extends a margin past the road, small (a beach) where the road is low and wider where it is high.
  5. *Scenery*: tall ridged peaks only beyond about 40 m from the road.
  6. *Fit*: ground follows the road and a 2.5 m verge, sunk 0.25 m, then blends back to natural ground over 10 to 25 m.
- **Folded sections 40 m apart:** heights come from a smooth map of the ground, so close sections start similar; the solver couples sections closer than about 55 m and limits their height difference to what a 45% bank can cover; the fit builds one surface between both road edges, never two overlapping blends.
- Every seed gets a **fit report** (deepest cut, tallest fill, steepest gradient, steepest bank between close sections, ground through the road, height above sea, closest coast). Tests assert on it and the screenshot cameras aim at its worst spots.

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
| 2026-11-11 | Elevation part of the score waits for M2 (shown as pending, zero weight) | Needs terrain |
| 2026-11-11 | Generation runs on the main thread in M1; Web Worker in M2 (done in M2 step 2) | Takes about 45 ms per seed without terrain |
| 2026-11-11 | Extra hard rule: track must fit the buildable circle. Start line goes on the longest straight | Not in the brief's list but needed |
| 2026-11-11 | Pinned Vite 8.3.5, TypeScript 7.0.2, Vitest 5.0.5, Playwright 1.64.1 | Newest releases at least two weeks old |
| 2026-11-11 | Generation code may only use exact maths (`+ - * /`, `Math.sqrt`, and `core/dmath.ts` for sin/cos); enforced by the architecture test | Browsers may round `Math.sin` etc. differently, which would break "same seed, same track" |
| 2026-11-11 | Three.js (0.187.0) and Rapier (0.21.0) not installed until M2 and M3; re-check versions then | Not needed for the 2D lab |
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
| 2026-11-11 | Defaults for Milestone 2: 3D becomes the default page at step 16 (lab on L and `?lab=1`); start line and gate now, checkpoints in Milestone 4; seeds pick a time of day from 07:00 to 19:30; only trees and rocks as decoration; road width fixed at 13 m; README converted from UTF-16 to UTF-8 | Listed in the plan; Tane approved without changes |

## Notes for later milestones

- **M2 (from Tane):** track-first is fine. Shape the island so the track looks like it belongs: hills where it climbs, coastline near it where possible.
- **M3 (from Tane):** when M3 starts, check whether we need Rapier's cross-platform deterministic build for ghost replays, and flag it to Tane before choosing.
- **M2:** add the elevation score; move generation into a Web Worker.
- **M2:** folded tracks have parallel sections as close as 40 m (centre to centre). Terrain fitting must keep neighbouring sections at similar heights or separate them with a wall or bank, since the brief's cut-and-fill blends over 10 to 25 m.
- **M2:** corner entries have no easing (the curvature steps from zero to 1/radius). Banking and kerbs should be driven from the smoothed curvature the centre line already carries.

## Known issues and risks

- **Almost every track has a hairpin** (about 98% of seeds). Tane asked for "most", not all. The scorer rewards a hairpin, a sweeper and a chicane, so the winner nearly always has one. Could be loosened with a hairpin-free style if wanted.
- **Folds are still modest.** Tracks fold back on themselves, but the very long double straights of a Sepang-style layout are rare, because the lap limit (2.4 km) caps how deep folds can go.
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
