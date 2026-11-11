# Random Racing

Procedural kart racer for desktop browsers. Every race happens on a world and track generated from a seed.

## Read first
- docs/GAME_BRIEF.md: the full design brief. Follow its architecture rules.
- docs/STATE.md: current progress, decisions and known issues. Update it at the end of every work session.

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
- `npm run build`: type-check and build to `dist/`.
- Screenshots land in `test-results/screens/`. To choose what is captured: `$env:SEEDS = "5,6,7"; $env:SHEETS = "1,21"; npm run e2e` (clear them afterwards with `Remove-Item Env:SEEDS, Env:SHEETS`).
- Lab addresses: `/?seed=48213` (one seed), `/?sheet=20&from=1` (contact sheet), `/?seeds=5,99` (chosen seeds), `&candidate=7` (one candidate), `&minRadius=30` or `&gapWidths=4` (what-if rules).