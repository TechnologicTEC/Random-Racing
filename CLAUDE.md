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

## Commands
(Fill in once the project is set up: how to run the dev server, tests and Playwright checks.)