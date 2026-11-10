# Project state

Updated at the end of every work session. A new session should read this first, then `docs/GAME_BRIEF.md`.

## Where we are

- **Current milestone:** 1, Track lab ([issue #1](https://github.com/TechnologicTEC/Random-Racing/issues/1))
- **Branch:** `milestone-1-track-lab` (one pull request per milestone, merged after sign-off)
- **Last finished step:** 8 (candidate pipeline, viewer rebuilt around it, contact sheet)
- **Next step:** mid-point check with Tane, then 9 (variety pass)

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
| 8 | Pipeline of 30 candidates, names, candidates panel, contact sheet. **Mid-point check with Tane** | Done, waiting for Tane's feedback |
| 9 | Variety pass: layout operators and tuning | To do |
| 10 | Batch stats, Playwright screenshots of 20 seeds, cross-browser determinism (contact sheet already done in step 8) | To do |
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

- **Layouts are bland (step 9 fixes this).** The placeholder layout is a ring of points with noise, so every track is a wobbly loop: always clockwise, no hairpins, no truly straight straights, "chicanes" that are only gentle wiggles.
- **The score is too generous.** Those bland loops score 82 to 92 out of 100. Causes to fix in step 9: anything gentler than a 400 m radius counts as "straight", so long curves earn straight marks; chicanes are detected from small direction changes; five drift corners is too easy a target.
- The lab sidebar is taller than a 720-pixel-high window, so the candidates panel needs a scroll.

- Cross-browser determinism: generation avoids browser-dependent maths by design (see Decisions). Step 10 still adds a test that Chromium, Firefox and Node agree on track hashes.

## Session log

- **2026-11-11:** Plan approved. Opened issues #1 to #6, created the branch and this file.
- **2026-11-11:** Steps 1 to 4 done. Added `src/core/dmath.ts` (own sin/cos built from plain arithmetic) and extended the architecture guard to ban `Math.sin`, `Math.cos`, `Math.hypot` and other browser-dependent functions from `src/core` and `src/gen`, so the cross-browser risk is designed out rather than only tested for.
- **2026-11-11:** Steps 5 to 8 done: validation, section analysis, scoring, the 30-candidate pipeline with fallback, track names, track hashing. Viewer rebuilt around the pipeline (score bars, candidate chips, rejected overlay) and the contact sheet (`?sheet=20`) pulled forward from step 10. 184 unit tests and 22 Playwright tests pass. Seeds 1 to 200 all give a valid winner with no fallback, about 30 ms per seed in Node and 65 ms in the browser. Stopped for the mid-point check.
