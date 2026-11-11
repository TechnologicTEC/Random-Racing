# Project state

Updated at the end of every work session. A new session should read this first, then `docs/GAME_BRIEF.md`.

## Where we are

- **Current milestone:** 1, Track lab ([issue #1](https://github.com/TechnologicTEC/Random-Racing/issues/1))
- **Branch:** `milestone-1-track-lab` (one pull request per milestone, merged after sign-off)
- **Last finished step:** 11 (wrap-up). All Milestone 1 steps are done
- **Next step:** Tane tries the lab and signs off; then merge the pull request, close issue #1 and plan Milestone 2 in plan mode

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
| 11 | Wrap-up: 20 fresh seeds, docs, pull request | Done, waiting for sign-off |

## Working agreements

- Branch + pull request per milestone. Commit and push after each step.
- **No Claude attribution** on commits, pull requests or issues.
- Milestone 1 pace: short report after each step; one mid-point check (done) and a sign-off at the end.
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
| 2026-11-11 | Generation runs on the main thread in M1; Web Worker in M2 | Takes about 45 ms per seed without terrain |
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
