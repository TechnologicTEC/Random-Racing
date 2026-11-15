# Random Racing

A procedural kart racer for desktop browsers. Every race happens on a world and track generated from one number, the seed. Working title: **Seed Circuit**.

- Design brief: [docs/GAME_BRIEF.md](docs/GAME_BRIEF.md)
- Progress, decisions and known issues: [docs/STATE.md](docs/STATE.md)

## Where it is now

Milestone 2, **world and track in 3D**, is finished and waiting for sign-off. The page builds an island and its track from a seed and flies a camera round the lap, with water, sky, trees, grass and shadows. There is no driving yet; that is Milestone 3. The **track lab** from Milestone 1, a 2D top-down view that shows how each track was chosen, is kept as a debug view.

## Running it

You need [Node.js](https://nodejs.org/) 22.12 or newer. In PowerShell, from this folder:

```powershell
npm install
npm run dev
```

Then open http://127.0.0.1:5173.

| Address | What it shows |
| --- | --- |
| `/` | A random island in 3D |
| `/?seed=48213` | One seed in 3D (`cam=orbit`, `time=17:45`, `quality=low` and more: see `src/app/worldPage.ts`) |
| `/?lab=1&seed=48213` | One seed in the track lab. Leave the seed off for a random one |
| `/?seed=48213&candidate=7` | The lab, showing one of the 30 candidates instead of the winner |
| `/?seed=48213&minRadius=30` | The lab, what-if: which layouts a stricter rule would reject (also `gapWidths=4`) |
| `/?sheet=20&from=1` | A contact sheet of 20 seeds in a row, with a one-line summary |
| `/?seeds=5,99,31337` | A contact sheet of chosen seeds |

L switches between the 3D view and the lab, on the same seed.

In 3D: Space pauses, the up and down arrows change speed, C circles the island (drag to turn, scroll to zoom), N makes a new island, Q switches between High and Low quality, F shows frame times.

In the lab: drag to pan, scroll to zoom, double-click to fit. Arrow keys step through seeds, N picks a random one, R overlays rejected layouts.

## Checks

```powershell
npx playwright install chromium firefox   # first time only
npm test            # unit tests
npm run typecheck   # type checks
npm run build       # type checks, then a build in dist/
npm run e2e         # browser tests and screenshots (saved in test-results/screens)
npm run perf        # frame times on the real graphics card (about 8 minutes, opens a browser window)
```

Screenshots can be chosen with environment variables, for example `$env:SEEDS = "5,6,7"; $env:SHEETS = "1,21"; npm run e2e`. `LOOKS`, `LAPS` and `TIMES` choose the close views, the points of the lap and the times of day of the 3D pictures (see `e2e/world.spec.ts`).

## How a world is generated

1. The seed picks a character, one trait at a time: the layout style (folded, stretched or round), the relief (flat, rolling, hilly or mountain), the coast (inland, touching the sea, or coastal), the shape of its mountains (a ridged range, rolling hill country or a lone peak) and how many there are (0 to 4), and whether the road is 12 m wide all round or widens to 22 m in places. A mountain lap either climbs onto its mountain or circles it.
2. The ground's relief comes from the seed alone. On hilly and mountain seeds it holds the main mountain.
3. Thirty candidate layouts are built. Each is a skeleton of 10 to 18 corners: a base shape, folded in and out to make hairpins and parallel straights, with chicanes and long curves added. Every corner is rounded with an arc; the rest stays straight. On mountain and hilly seeds each layout is also tried turned to face the mountain.
4. Each layout gets road heights that follow the ground, with gradients up to 8% (15% on mountain seeds) and no sharp crests.
5. Layouts that break a rule are rejected: crossing itself, a corner under 15 m radius, sections too close together, a lap outside 1.4 to 2.4 km (up to 3 km on mountain seeds), leaving the buildable area, or needing a cutting deeper than 8 m or an embankment taller than 6 m.
6. The rest are scored for fun (long straights, a mix of corner types, corners that suit drifting, flow, and use of the hills) and the best one wins.
7. The island is built round the winner: land beyond the track, a coast with beaches, cliffs, bays and headlands where the road is by the sea, the other mountains and foothills, then the ground cut and filled to the road. Kerbs, barriers and a start gate follow the road's edge.
8. Last come sand, grass, rock and snow, trees, rocks, clouds and the time of day. A fit report measures how cleanly the road sits in the ground.

The same seed always gives exactly the same world, in every browser.
