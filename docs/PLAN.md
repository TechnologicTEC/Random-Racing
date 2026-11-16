# The plan: what to build, in order

Written 2026-11-16 by the model that built Milestones 1 and 2 and Milestone 3 up to step 4c, for the model that builds the rest. Tane approved it the same day. `docs/STATE.md` says where the project is; this file says what to do next and how to know it is done; `docs/GAME_BRIEF.md` is the design; `docs/VISUAL_BAR.md` is the look.

**How to use it:** find the first line without a tick in "The build order". Read that part's row in its milestone's file in `docs/plan/` (linked from each milestone below). Follow "The routine for one part". Tick the line. Nothing here is built out of order: each part stands on the ones before it.

**How firm it is:** the order, the rules and the "done when" tests are the plan. The numbers are starting values in `src/config.ts`, to be tuned by feel at the check-ins; tests read the config, so they follow it. Where something in the plan turns out wrong, say so to Tane, fix the plan in the same commit as the code, and carry on.

## The build order

**Before anything else**

- [ ] **0. One clean run of `npm run e2e`.** 4c was committed without one (STATE.md, "4c"). Laptop awake, nothing else open, no dev server left running; ask Tane whether it has already been run by hand. Note the result in STATE.md's session log.

**Milestone 3: driving** (branch `milestone-3-driving`, issue #3; the parts: [`docs/plan/M3-driving.md`](plan/M3-driving.md))

- [x] Steps 0 to 3, and 4a, 4b, 4c
- [ ] **4d** Steering and cornering
- [ ] **4e** Stability and the whole car
- [ ] **5a** Input: keyboard and controller
- [ ] **5b** The fixed-step loop
- [ ] **5c** The car drawn
- [ ] **5d** Chase camera
- [ ] **5e** The page opens driving
- [ ] **Check-in 1 with Tane** (questions below). Add the car's reference pictures to `docs/VISUAL_BAR.md` once Tane likes the look
- [ ] **6a** The drift rules, pure
- [ ] **6b** Drift and boost in the car
- [ ] **6c** Hits cancel a drift
- [ ] **6d** Sparks, flame and hop
- [ ] **6e** Camera swing and wider view
- [ ] **6f** Tuning panel
- [ ] **7a** Off the road
- [ ] **7b** Walls
- [ ] **7c** Trees and rocks
- [ ] **7d** Kerbs
- [ ] **8a** Place on the lap and checkpoints
- [ ] **8b** Respawn
- [ ] **8c** Respawn on the page
- [ ] **9a** A bot that laps
- [ ] **9b** The bot drifts: the corner proof
- [ ] **9c** The same lap in every browser
- [ ] **Check-in 2 with Tane** (questions below)
- [ ] **10a** Tuning from check-in 2
- [ ] **10b** Speed, with the car
- [ ] **10c** README, CLAUDE.md, STATE.md, the pull request; **Tane's playtest sign-off**; merge and delete the branch

**Milestone 4: time trial** (new branch `milestone-4-time-trial` from `main`, issue #4; plan it in plan mode first; the steps: [`docs/plan/M4-time-trial.md`](plan/M4-time-trial.md))

- [ ] **M4.0** Plan approved; steps recorded in STATE.md
- [ ] **M4.1** Flatten the start area
- [ ] **M4.2** The race rules in the simulation
- [ ] **M4.3** The race on screen
- [ ] **M4.4** Screens and menus
- [ ] **M4.5** New track, typed seed, restart
- [ ] **M4.6** A whole race in the browser tests; check-in; tuning; pull request; **sign-off**; merge

**Milestone 5: ghosts and favourites** (branch `milestone-5-ghosts`, issue #5; plan first; the steps: [`docs/plan/M5-ghosts.md`](plan/M5-ghosts.md))

- [ ] **M5.0** Plan approved
- [ ] **M5.1** The run record and its replay
- [ ] **M5.2** Storage
- [ ] **M5.3** The ghost drawn
- [ ] **M5.4** Personal bests
- [ ] **M5.5** Favourites
- [ ] **M5.6** The reload test; pull request; **sign-off**; merge

**Milestone 6: polish** (branch `milestone-6-polish`, issue #6; plan first; the steps: [`docs/plan/M6-polish.md`](plan/M6-polish.md))

- [ ] **M6.0** Plan approved, with the order and the cut list agreed with Tane
- [ ] **M6.1** Bridges
- [ ] **M6.2** Tunnels
- [ ] **M6.3** The look issues Tane picks
- [ ] **M6.4** Sound
- [ ] **M6.5** Effects
- [ ] **M6.6** Settings
- [ ] **M6.7** Speed and size
- [ ] **M6.8** Generator `v1`
- [ ] **M6.9** The brief's version 1 table checked line by line; README; pull request; **sign-off**; merge; release

## The routine for one part

The same every time. A part is one ticked line above.

1. **Read** the part's row in its milestone's file (`docs/plan/`), the code it names, and STATE.md's "Working agreements". At the start of a step (5, 6, 7 and so on) and of a milestone, write the plan in plan mode and wait for Tane's approval (CLAUDE.md). The plan can be short: this file is what it starts from.
2. **Write the tests** the row lists, in a test file beside the code (`steer.test.ts` for the pure sums, `steering.test.ts` for the car on a test ground, as `drive.test.ts` and `driving.test.ts` are).
3. **Run them and see them fail** for the right reason (the function is missing, or the car does not yet do it), not for a typo.
4. **Write the code**, the least that passes. Every number goes in `src/config.ts` with a comment saying what it is; every new config block gets its type (`SteerConfig` and so on, beside `EngineConfig`).
5. **Run everything**, from PowerShell: `npx vitest run --maxWorkers=6`, then `npm run typecheck`, then `npm run e2e` (about 25 minutes; laptop awake). Never chain a test run and a commit in one command.
6. **If anything drawn changed**, take the pictures and look at them beside `docs/VISUAL_BAR.md` ("How to check a visual change").
7. **Measure** what the row asks for with a throwaway `src/explore.tmp.test.ts` (run with `--silent=false` to see its output; delete it before committing) and put the numbers in STATE.md.
8. **Commit, push, record.** One commit for the part. Update STATE.md ("Where we are", the step's own section, the session log) and tick the line in "The build order" above, in the same commit. Then a short report to Tane in plain words: what changed, how to try it, what is next.

**Commit messages** follow the ones in `git log`: `M3 step 4d: ` then one plain sentence of what the car or the page now does, the files and functions, the config values, the tests, the measured numbers, the test counts, and `STATE.md: 4d done, 4e next`. **Never any Claude attribution**, on commits, pull requests or issues.

**Stop only at the end of a part.** Do not start the next part's edits while a long test run for the last one is still going.

## When something does not go to plan

| What happens | What to do |
| --- | --- |
| A "done when" number cannot be met | Tune the config first (the row's "if it goes wrong" says which lever). If it still cannot be met, stop and tell Tane what the best number was and what changing the test would give up. Never loosen a number quietly |
| A rule here is wrong or cannot work | Say so, propose the smallest change that keeps the rule's purpose, fix this file with the code |
| The browser suite fails on pages that "did not load in time" | It is the laptop, not the code, until shown otherwise: check Windows' event log for standby (Kernel-Power 506 and 507), run the failed tests again alone (`npx playwright test --project=chromium -g "part of the test name"`), and ask Tane to run the suite by hand. Say plainly in the commit what did and did not pass |
| A fingerprint differs between Node, Chromium and Firefox | Stop. Something in `src/sim` or `src/gen` is using inexact maths or the frame clock. Find it before building anything else: everything later rests on it |
| A test that passed yesterday fails today with no change near it | Use `git stash` to run it on the last commit. If it fails there too it is the machine or a flaky test: fix the test's wait, not its meaning |
| A new package would help | Ask Tane first, and pin its exact version (CLAUDE.md) |
| The work is bigger than the row suggests | Split the part (4d-1, 4d-2), record the split in the milestone's file and the build order, and still end each piece with passing tests and a commit |

**Whose call is it?** Claude's: names, how the code is laid out inside the planned folders, starting values, anything this file leaves open that Tane will not see or feel. Tane's: anything that departs from the brief, how the game feels (speed, steering, drift, camera), how it looks, what is cut, any change to a "done when", new packages, sign-offs. When a call is Claude's, make it, write it in STATE.md's "Decisions" with the reason, and say "Claude's call, for Tane to judge" in the report.

## What to ask Tane at each check-in

The check-ins are lines in the build order. Bring the page running, a short list of seeds to try, and these questions. Write the answers into STATE.md's "Decisions" and turn them into config values.

**Check-in 1, after step 5** (the car drives, steers and reverses; no drift, hard walls, no respawn yet: say so first). Seeds to try: 7 (hilly), 1 and 3 (mountain, 15%), 42 (sloped start), 28496 (gorge), 2024 (rolling, wooded).

1. Is the speed right? Top speed is 30 m/s (108 km/h); it takes about 4 s to reach.
2. Is the steering right? A 60 m circle at top speed, 6 m at walking pace. Too heavy, too twitchy?
3. Does braking into reverse on one pedal feel right?
4. The camera: how far back (6.5 m), how high (2.4 m), how wide (60 degrees), how quickly it follows.
5. The car's look, against `docs/VISUAL_BAR.md`'s proposal. If yes, its pictures become references.
6. The walls (decided for Tane to judge on 2026-11-15 and 16): are they in the right places? Is 40% the right slope to keep one? Should beaches stay open? Only half the seeds with sea beside the road have an opening onto it: enough?
7. The controller: dead zone, triggers.

**Check-in 2, after step 9** (drift, boost, surfaces, respawn, with the tuning panel open and step 9's table to hand). Same seeds, plus the corners the table names.

1. Starting a drift: is 40% of top speed the right threshold? Is the hop right, drawn only?
2. The slide: the angle (24 degrees), how tight and how wide it can go (20 m to 120 m at top speed).
3. The tiers (1, 2 and 3 s) and the boosts (0.5, 1.0 and 1.6 s at 1.3 times top speed): worth the risk? Too strong?
4. Is drifting the fastest way through each kind of corner when driving by hand, as the table says it is for the bot?
5. Walls: does a glancing hit feel gentle enough? Does a head-on one feel fair?
6. Grass and sand (40% slower): does cutting a corner ever pay?
7. Respawn: is 1 s right? Does it put the car somewhere sensible every time?
8. Anything that made the car flip, stick or fall through.

**At each milestone's sign-off:** the brief's "done when" for that milestone, shown working; what was left out and why; the known issues that milestone added.

**Questions only Tane can answer, with the step that needs the answer:**

| Question | Needed by |
| --- | --- |
| How many laps does a ghost cover: the best single lap, or the whole 3-lap race? (This plan assumes the whole race) | M5.0 |
| May a favourite saved before the generator is `v1` stop rebuilding when the generator changes? (This plan assumes yes, with a note on screen) | M5.0 |
| What is cut from Milestone 6 if it runs long, and in what order are its steps wanted? | M6.0 |
| When the generator changes after `v1`: keep every released version runnable, or store each favourite's centre line? (The brief allows either) | M6.8 |
| Where is version 1 hosted, and under which name ("Seed Circuit" is a working title)? | M6.9 |

## Where each known issue is dealt with

Every item under "Known issues and risks" in `docs/STATE.md`, by the step that deals with it. "Tane" means it is a question for the check-in or step named; "left" means it stays as it is unless Tane asks. When a step deals with an issue, take it off STATE.md's list in the same commit.

| Issue (STATE.md) | Dealt with in |
| --- | --- |
| The start line can sit on a steep slope (seed 42, 8%) | **M4.1** |
| A gorge can hold the start gate (seed 28496) | M4.1 checks it; 5d's camera clearance is tested there |
| Wall ends are ramps; hillsides of up to 40% open beside mountain roads | **7b** (the wall end met head on), **4e** and **8** (climbing back up, sliding down) |
| Few roadsides open onto the sea; beaches open; the 40% wall rule | Tane, **check-in 1** (question 6) |
| Nobody has watched the grass move; from the road it reads as a fine texture | Tane, **check-in 1** (the chase camera is lower and closer than the flying one) |
| Near and far tree shapes swap a whole square at once | Watched while driving at **check-in 1**; fixed in **M6.7** if it shows |
| Mountain worlds are the slowest to build (3.0 to 3.3 s headless); Firefox 1.6 times slower than Chromium | **M6.7** (the budget test uses seed 7 and passes) |
| The grass's 176,000 triangles; the most wooded islands' 589,000 from above; the water shader's cost; Low gains least from above; the page draws every frame | **M6.7**, and **10b** checks the chase view |
| Sea cliffs and cut banks have a saw-tooth top edge on the 3 m grid | **M6.3** (Tane picks) |
| The sun's glare from above is a wide pale patch with wave stripes | **M6.3** |
| Clouds dark grey-brown at 07:00 and 19:30; those times quite dark; 18:30 called "evening light" with a blue sky; 10:00 called "midday light" | **M6.3** (all one look at `render/daylight.ts` and `lightName`) |
| The coast cuts high ground into curved rock bands; the round cone under a massif; mountain rock in hard-edged bands; the peak a bit lumpy | **M6.3** if Tane picks them; they are generator changes, so before **M6.8** |
| Steep rock cuttings beside mountain roads | **M6.2** (tunnels take the deepest), then **M6.3** |
| Flat seeds show large sandy patches; the mown strip is the same width everywhere; nothing cleared round trees in long grass; the wind blows the same way on every island | **M6.3** candidates (small) |
| From far above, islands look fairly bare; tree shadows small at midday | Tane, **M6.3** (`world.decor.trees` levels) |
| The circling camera frames only part of the biggest islands; it can look through clouds | Left (it is a debug and title view); **M4.4** if the title screen uses it |
| A close camera checks the ground, not trees | Left (close views are for screenshots) |
| The verge dips a little at its outer edge on steep banks | Left; the barrier footing hides it |
| Islands big and blobby; coastal mountain seeds keep the sea further out and have less sea beside the road; mountains lower than asked; circling summits lower; fewer circling laps go round the summit; not every island gets a peak; a bay reaches 10 m only beside low road; enclosed water possible | Left: generator character Tane has seen and accepted. Revisit only if Tane asks before **M6.8** |
| Almost every track has a hairpin; folds modest; winner scores cluster; lap height a little under target; some Milestone 1 winners changed | Left (scoring), unless step **9**'s table shows a kind of corner the car handles badly |
| The lab: the sidebar taller than 720 pixels; the rejected-layouts overlay usually empty; the contact sheet frame generous; wall lines thin from far out | Left (debug views) |
| Two test files never seen failing for a reason other than a missing module | Left |
| Timing on the laptop is unreliable for spells; the browser suite times out in long runs | The working agreements and "When something does not go to plan" |
| Edge is not tested separately | **M6.9** checks it by hand |
