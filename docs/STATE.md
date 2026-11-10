# Project state

Updated at the end of every work session. A new session should read this first, then `docs/GAME_BRIEF.md`.

## Where we are

- **Current milestone:** 1, Track lab ([issue #1](https://github.com/TechnologicTEC/Random-Racing/issues/1))
- **Branch:** `milestone-1-track-lab` (one pull request per milestone, merged after sign-off)
- **Last finished step:** 7 (scoring)
- **Next step:** 8 (candidate pipeline, then mid-point check)

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
| 7 | Scoring (breakdown panel lands with step 8) | Done |
| 8 | Pipeline of 30 candidates, names, candidates panel. **Mid-point check with Tane** | To do |
| 9 | Variety pass: layout operators and tuning | To do |
| 10 | Contact sheet, batch stats, Playwright screenshots, cross-browser determinism | To do |
| 11 | Wrap-up: 20 fresh seeds, docs, pull request | To do |

## Working agreements

- Branch + pull request per milestone. Commit and push after each step.
- Milestone 1 pace: short report after each step; pause at step 8 for a look at the shapes, and at the end for sign-off.
- No linter or formatter for now. The architecture rules are enforced by a DOM-free type check of `src/core` and `src/gen` and by `src/architecture.test.ts`.
- **Generator quality comes before viewer features.** If Milestone 1 runs long, trim the viewer, not the generator.
- Tests are written before the code they cover.

## Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-11 | Package name `random-racing`; on-screen title "Seed Circuit" (working title) | Repo and brief use different names |
| 2026-11-11 | Seeds are whole numbers 0 to 4,294,967,295; "new track" picks 1 to 99999 | Short share codes like the brief's `v1-48213` |
| 2026-11-11 | Generator version is `v0` during development, `v1` at release | Seeds will change while tuning; the "old seeds rebuild exactly" promise starts at release |
| 2026-11-11 | Track first, island second: M1 layouts only need to fit a buildable circle | The brief says terrain fits the road |
| 2026-11-11 | Elevation part of the score waits for M2 (shown as pending, zero weight) | Needs terrain |
| 2026-11-11 | Generation runs on the main thread in M1; Web Worker in M2 | Takes milliseconds without terrain |
| 2026-11-11 | Extra hard rule: track must fit the buildable circle. Start line goes on the longest straight | Not in the brief's list but needed |
| 2026-11-11 | Pinned Vite 8.3.5, TypeScript 7.0.2, Vitest 5.0.5, Playwright 1.64.1 | Newest releases at least two weeks old |
| 2026-11-11 | Generation code may only use exact maths (`+ - * /`, `Math.sqrt`, and `core/dmath.ts` for sin/cos); enforced by the architecture test | Browsers may round `Math.sin` etc. differently, which would break "same seed, same track" |
| 2026-11-11 | Three.js (0.187.0) and Rapier (0.21.0) not installed until M2 and M3; re-check versions then | Not needed for the 2D lab |

## Notes for later milestones

- **M2 (from Tane):** track-first is fine. Shape the island so the track looks like it belongs: hills where it climbs, coastline near it where possible.
- **M3 (from Tane):** when M3 starts, check whether we need Rapier's cross-platform deterministic build for ghost replays, and flag it to Tane before choosing.
- **M2:** add the elevation score; move generation into a Web Worker.

## Known issues and risks

- `Math.sin`, `Math.cos` and similar are not guaranteed bit-identical across browsers, so a seed could in theory differ between Chrome and Firefox. Step 10 adds a cross-browser hash test. If it fails, replace the offending functions with fixed versions in `src/core`.

## Session log

- **2026-11-11:** Plan approved. Opened issues #1 to #6, created the branch and this file.
- **2026-11-11:** Steps 1 to 4 done. Added `src/core/dmath.ts` (own sin/cos built from plain arithmetic) and extended the architecture guard to ban `Math.sin`, `Math.cos`, `Math.hypot` and other browser-dependent functions from `src/core` and `src/gen`, so the cross-browser risk is designed out rather than only tested for.
