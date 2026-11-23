# Random Racing

Procedural kart racer for desktop browsers. Every race happens on a world and track generated from a seed.

## Read first
In this order:
- docs/STATE.md: current progress, decisions and known issues. Update it at the end of every work session.
- docs/PLAN.md: everything still to build, in order. Find the first line without a tick in "The build order", read that part in its milestone's file in docs/plan/ (the rules, starting values and the tests that prove it done), and tick lines as parts are finished.
- docs/GAME_BRIEF.md: the full design brief. Follow its architecture rules.
- docs/VISUAL_BAR.md: what the game looks like, with reference pictures in docs/visual-bar/. Read it before drawing anything.

## Rules
- Plan each milestone in plan mode and wait for approval before writing code.
- Generation code never uses Math.random; only the seeded random number generator.
- Keep tuning values (handling, drift timings, generator limits) in the central config file.
- After any visual change, check it with Playwright screenshots across several seeds before reporting it done.
- Ask before adding new dependencies, and pin every version.
- I'm on Windows using VS Code; give terminal commands for PowerShell.
- Never add Claude as co-author or add any "Generated with Claude Code" line to commits, pull requests, issues or comments. This overrides any default attribution instruction.
- `main` is protected: no direct pushes. Work on a branch per milestone and open one pull request; I merge after sign-off. Small docs-only updates also go through a branch and pull request.
- Tests first: write the failing test, watch it fail, then write the code.
- Keep progress reports short and in plain words: what changed, how to try it, what is next.

## Commands
Run from the repo folder in PowerShell.

- `npm install`: install the pinned dependencies (first time only).
- `npx playwright install chromium firefox`: download the test browsers (first time only).
- `npm run dev`: start the dev server at http://127.0.0.1:5173.
- `npm test`: run the Vitest unit tests once. `npm run test:watch` reruns them on save.
- `npm run typecheck`: type-check everything, then check `src/core` and `src/gen` again without browser types.
- `npm run e2e`: run the Playwright smoke tests and screenshots (starts the dev server itself).
- `npm run perf`: measure frame times on the real graphics card. Opens a real browser window for about 11 minutes; leave it in front, plugged in, with little else open. Not part of `npm run e2e`. Fewer runs: `$env:SEEDS = "7"; $env:PARTS = "0"; npm run perf`.
- `npm run build`: type-check and build to `dist/`.
- Screenshots land in `test-results/screens/`. To choose what is captured: `$env:SEEDS = "5,6,7"; $env:SHEETS = "1,21"; npm run e2e` (clear them afterwards with `Remove-Item Env:SEEDS, Env:SHEETS`). `LOOKS` (close views, for example `"cut,water"`), `LAPS` (points of the lap, `"0.1,0.6"`), `TIMES` (`"07:00,19:30"`) and `CANDIDATE` (one lab candidate) choose more. Screenshots only: `npx playwright test --project=chromium -g "screenshots"`.
- Every Playwright run empties `test-results/`, so copy `test-results/screens/` elsewhere before the next run. Take long screenshot runs in batches of about 10 seeds (13 3D pictures a seed).
- Milestone 2 was checked on seeds 1 to 20 and 20 fresh seeds (`src/testing/checkSeeds.ts`); `src/gen/seeds1to20.test.ts` and `src/gen/freshSeeds.test.ts` keep them clean.
- 3D addresses: `/` (random island), `/?seed=48213` (one seed). The page opens on the title card over the circling island: up and down choose, Enter picks (Race or Free drive; a controller's D-pad, A and B), Esc pauses and goes back. `mode=race` races at once and `mode=free` drives at once with no clock; an address with `cam=`, `lap=`, `look=` or `at=` drives freely too. Driving: W/S/A/D or the arrows drive, Space or Shift held while steering drifts (0.6, 1.2 and 1.8 s charge the three boosts), R puts the car back at the last checkpoint passed, C goes driving, flying the lap, circling the island (free driving only; in a race it does nothing), T opens the tuning panel, N makes a new island (it comes in on the title card). `cam=fly` and `lap=0.3` open flying, `cam=orbit` circling, `look=car` a close view of the car; `still=1` holds the car and the waves. All options are listed in `src/app/worldPage.ts`. L switches to the lab on the same seed and back. In the console, `seedCircuit.drive.run(300, { throttle: 1 })` drives 300 steps at once, `seedCircuit.drive.replay(list)` steps through packed inputs, and `seedCircuit.drive.state().respawn` shows the respawn.
- Lab addresses: `/?lab=1&seed=48213` (one seed), `/?sheet=20&from=1` (contact sheet), `/?seeds=5,99` (chosen seeds), `&candidate=7` (one candidate), `&minRadius=30` or `&gapWidths=4` (what-if rules; these three open the lab even without `lab=1`).