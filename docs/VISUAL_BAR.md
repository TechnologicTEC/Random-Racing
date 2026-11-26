# Visual bar


What the game looks like, in terms that can be checked, with pictures to lay new work beside. Written 2026-11-16 from eleven pictures taken that day (1280 by 720, headless Chromium, `still=1`) and looked at one by one. They are in `docs/visual-bar/`. **Anything new that is drawn (the car, sparks, flames, menus) must look as if it belongs in these pictures.**

**The look in one line:** a bright, clean toy island on a clear day. Every surface is flat-coloured facets with no textures and no outlines, the light is one sun and a soft sky, the horizon fades into blue haze, and the road is the crispest thing in the picture.

## The rules that make it

- **Flat shading everywhere.** Each triangle has one colour and its own light; nothing is rounded off by smooth shading. Trees are faceted lumps, clouds are clusters of faceted puffs, rocks are faceted boulders.
- **No image files**, but for the five pictures the drift's effects are drawn with (Tane, 6h-5): CC0 sprites from Kenney's Particle Pack in `public/effects/`, white shapes on transparency, each listed with its SHA-256 in `public/effects/LICENSE.md`. Everything else, the effects' colours included, comes from `src/render/palette.ts` (ordinary screen colours from 0 to 1) and from the ground's cover. A new thing takes its colours from that file, or adds to it.
- **One light for everything.** A sun and a sky light worked out from the time of day (`render/daylight.ts`), the same for ground, road, trees and anything new. Shadows keep 60% of the sky's light (`render.shadows.skyShare`), so a shadow is a darker tint of the surface, never black.
- **Haze** from 1,500 m to 6,600 m, in the horizon's colour, so far land and sea melt into the sky.
- **No glow, bloom, outlines or film effects on the world.** The only glow is round the drift's effects (Tane, 6h-5: `render.bloom`): the effects alone are spread by a bloom and the spread light is added on top of the finished picture, so the island, the road and the car are never softened. A picture with no effect on screen is exactly the same, byte for byte, with the bloom on or off (`bloom=0`; a browser test checks it).
- **The view** is 50 degrees tall for the flying and circling cameras; the chase camera is planned at 60.
- **The cards** on top are pale, slightly see-through rounded panels (`rgba(246, 250, 247, 0.86)`, 14 px corners, a soft shadow) with dark green-black text (`#15302b`) and one teal accent (`#1a7d77`). They sit in the corners and along the bottom, never over the middle of the road. **While the car is not being driven** (the title, the pause and the results, M4.4) the menu card sits in the middle of the screen (Tane, M4.0), a larger card of the same kind: the heading, a line or two, and its choices stacked, the chosen one filled teal as the page's main button is, the others outlined; behind the title and results cards the camera circles the island. The Favourites card (M5.5b) is the same card made wider: a row a favourite, outlined like a choice (the name in bold, the share code, the best time, the day saved, the code and day a little faded), up to 8 at once, each with a small square ✕ beside it, quiet grey until pointed at, then the kerbs' red (M5.5c); above them, while the island shown is no favourite, a choice to add it; then the quiet lines (how many, the v0 note, its keys) and Back. In a race (M4.3) the countdown's three lights are a small card at the top middle (Tane, M4.0), red one a second and green on "go", and the race card (lap, time, last and best, sectors) is in the top right corner; the best lap and a sector quicker than the best are in the teal accent.

## Each part, with its picture

| Part | What it must look like | Picture |
| --- | --- | --- |
| **Road** | 20 m wide (Tane, 6h: room for a drift), wider on some straights. Dark blue-grey asphalt (`[0.26, 0.265, 0.275]`), off-white dashed centre line and solid edge lines with crisp edges, a brown earth shoulder that fades into the grass. Banked in corners | `road-straight-meadow.jpg`, `road-corner-kerb.jpg` |
| **Kerbs** | Red and off-white blocks on the inside of corners, low and flat, each block one clean colour | `road-corner-kerb.jpg`, `hairpin-and-beach.jpg` |
| **The car** | A small open kart with a driver, flat-shaded facets: yellow-orange body, dark grey chassis and seat, off-white helmet, teal driver, near-black tyres with pale hubs. Its wheels touch the road. Lit by the same sun and sky as the road and shaded by trees, walls and the gate, but **it casts no shadow** (Tane, check-in 1). From the chase camera it is about an eighth of the picture's width, low in the middle, with the road ahead clear above it | `drive-start.jpg`, `car-close.jpg` |
| **Walls** | Low pale-grey blocks, red and white on the outside of corners, plain elsewhere. A wall's end slopes down to the ground. No gap under a wall | `road-morning-shadows.jpg`, `road-corner-woods.jpg` (a sloping end), `mountain-road.jpg` |
| **Start gate** | Two dark posts, a pale beam, a chequered line across the road, a short wall each side | `start-gate.jpg`, `sunrise.jpg` |
| **Lap gates** (M5.4d) | Four a lap, at the middle of a straight or the apex of a corner, square to the road there: built as the start gate (two dark posts outside the barriers, reaching the ground, and a beam over the road), the beam in the cards' teal `#1a7d77`, no paint on the road. They read as gates from 200 m along the road and as small teal marks round the lap from above (Tane, 2026-11-25) | `gates-<seed>-gate1.png`, `-above.png` (`e2e/gates.spec.ts`) |
| **Bridges** (M6.1b, M6.1c) | Where the road would stand over 6 m above the ground: the road carried on a deck 1.2 m deep, the island's own ground and cover under it, a cutting beside it as on any road. **Its look goes by its size** (Tane, 2026-11-26), so a player sees it is a bridge from the car. **Wooden** (at most 100 m long and 12 m up): planks across the road about 1 m wide in two warm browns (`ROAD.plankLight`, `plankDark`) with a thin dark gap after each, **no paint**; timber railings (a post at every 2 m and two rails, `ROAD.timber`); the deck's top, sides and underside in timber; at each row, a timber trestle: two posts, a cap beam under the deck and two braces crossing down to the ground. **Concrete** (the rest): the road's surface pale (`ROAD.deckConcrete`) with its lines kept; white steel railings (thin posts and two rails, `ROAD.steel`); the deck a shade darker than the walls (`ROAD.bridge`) on square pillars two a row, rows no more than 25 m apart. A railing runs on past each end of the deck and meets the ordinary wall at a closed end. Flat-shaded, lit and shadowed like the walls | close views `at=` a bridge's middle: wooden on seeds 12, 14 (its first) and 27, concrete on seeds 7, 11, 13 and 14 (its second); `look=bridge` from M6.1e |
| **Grass** | Green that varies lush to dry in broad patches, fine blades near the camera, a short mown strip by the road, dabs of white, yellow and red flowers in places | `road-straight-meadow.jpg`, `start-gate.jpg` |
| **Trees and rocks** | Broadleaf trees as dark-green faceted lumps on short brown trunks, pines as stacked cones, palms by the beach; in groves and woods, not evenly scattered. Grey faceted boulders on rocky ground. Every tree casts a shadow | `road-corner-woods.jpg`, `road-morning-shadows.jpg`, `hairpin-and-beach.jpg`, `mountain.jpg` (rocks) |
| **Mountains** | Big rounded or ridged forms, grass low down, grey rock above, with the road climbing across them | `mountain.jpg`, `mountain-road.jpg` |
| **Sea and shore** | Deep blue with lines of waves, turquoise shallows, pale sand, a thin white line of foam where they meet | `hairpin-and-beach.jpg`, `shore.jpg`, `island-from-above.jpg` |
| **Sky and clouds** | Blue, paler at the horizon; white faceted clouds, few or many by the seed | `road-straight-meadow.jpg`, `road-corner-kerb.jpg` |
| **Time of day** | Low sun: long shadows across the road, warmer light. 07:00 and 19:30: a pink sky with the sun's disc low over the sea, and darker ground | `road-morning-shadows.jpg` (07:27), `sunrise.jpg` (07:00) |
| **The whole island** | The track is easy to read from above; the land is green with sand at the edge and woods in patches | `island-from-above.jpg` |

## The pictures and how to make each again

Open the address after `http://127.0.0.1:5173/?` with `npm run dev` running. Where the browser suite takes the same picture, its name in `test-results/screens/` is given.

| Picture | Address | From `npm run e2e` |
| --- | --- | --- |
| `road-morning-shadows.jpg` | `seed=7&still=1&cam=fly&lap=0.3` | `world-00007-fly-30.png` |
| `road-straight-meadow.jpg` | `seed=8&still=1&cam=fly&lap=0.3` | with `SEEDS=8`: `world-00008-fly-30.png` |
| `road-corner-kerb.jpg` | `seed=1&still=1&cam=fly&lap=0.55` | `world-00001-fly-55.png` |
| `road-corner-woods.jpg` | `seed=2024&still=1&cam=fly&lap=0.3&time=18:30` | no |
| `start-gate.jpg` | `seed=42&still=1&look=start` | `world-00042-start.png` |
| `hairpin-and-beach.jpg` | `seed=100&still=1&look=hairpin` | `world-00100-hairpin.png` |
| `shore.jpg` | `seed=7&still=1&look=water` | `world-00007-water.png` |
| `mountain-road.jpg` | `seed=1&still=1&look=climb` | `world-00001-climb.png` |
| `mountain.jpg` | `seed=1&still=1&look=summit` | `world-00001-summit.png` |
| `island-from-above.jpg` | `seed=2024&still=1&cam=orbit` | `world-02024.png` |
| `sunrise.jpg` | `seed=7&still=1&look=sun&time=07:00` | with `TIMES=07:00`: `world-00007-at-0700-sun.png` |
| `drive-start.jpg` | `seed=42&still=1` | `world-00042-drive-start.png` |
| `car-close.jpg` | `seed=42&still=1&look=car` | `world-00042-car.png` |
| `drive-slide.jpg` (accepted 2026-11-23) | `seed=7&still=1`, then a slide to tier 3 (`slideTo` in `e2e/drifting.ts`) | `world-00007-drive-slide.png` |
| `drive-boost.jpg` (accepted 2026-11-23) | the same, 10 steps after letting go | `world-00007-drive-boost.png` |

The page opens driving since step 5e; `cam=fly` keeps these addresses on the flying camera, and the car is not drawn in them. The generator is `v0`: if a later change moves a seed's world, take the picture again and say so here.

**All 13 were taken again on 2026-11-17 (6h-3)**, when the road became 20 m wide and every island changed. Since then seed 8's "straight meadow" begins a corner, and seed 42's start is level, by the sea, with its gate's posts out of the chase camera's view. To take them again: `node scripts/visual-bar-pictures.mjs` with `npm run dev` running (or name some: `node scripts/visual-bar-pictures.mjs shore.jpg,mountain.jpg`).

## The car, sparks and flame

The car was drawn in step 5c, to the proposal below, and Tane approved it at check-in 1 (2026-11-17) "for now": a proper design, and perhaps other car styles, may come later. Its pictures are `drive-start.jpg` and `car-close.jpg`. **The car casts no shadow** (Tane's choice at check-in 1: it was distracting to drive behind); it still takes the shadows of trees, walls and the gate. The drift's effects were first built in step 6d, and redrawn in 6h-5 as sprites with a bloom (Tane's choice after the second drive; sizes and counts in `render.car`, the bloom in `render.bloom`). Their pictures come from `npm run e2e` as `world-<seed>-drive-slide.png` and `-drive-boost.png`; **`drive-slide.jpg` and `drive-boost.jpg` (seed 7, tier 3) are proposed as references, for Tane to accept at check-in 2.**

- **The car** is a small open kart with a driver, built in code from flat-shaded facets, 300 to 600 triangles: a wedge nose, a low floor, side pods, a seat back, a driver's body and a round helmet, and four fat wheels that stand clear of the body. The helmet and the open wheels are what make it read as a kart and give it scale. It fits the simulated body: 1.4 m wide, 2.2 m long, about 1 m to the top of the helmet.
- **Colours** (to add to `palette.ts`): body a warm yellow-orange, about `[0.98, 0.72, 0.12]`, which stands out from the green grass, the dark road, the blue sea and the red of the kerbs; chassis and seat the gate's dark grey `[0.16, 0.17, 0.2]`; helmet off-white `[0.94, 0.94, 0.92]`; tyres near black `[0.07, 0.07, 0.08]` with pale hubs.
- **It sits in the world's light**: lit by the same sun and sky as the road and shaded by trees and walls, but casting no shadow of its own. Its wheels touch the road: no gap and no sinking that can be seen.
- **From the chase camera** it is about an eighth of the picture's width, low in the middle, with the road ahead clear above it.
- **Sparks** are thin streaks, each with a bright star at its head, sprayed back, out and up from the two rear wheels while sliding from the first tier: a trickle of 15 a wheel at tier 1, a spray of 45 at tier 3, reaching up to 0.6, 0.85 and 1.1 m. Each lives a quarter of a second, white-hot as it leaves the tyre (`SPARK_HOT`) and in its tier's colour from a third of its flight, so the tier reads at a glance: blue `[0.25, 0.65, 1.0]`, orange `[1.0, 0.6, 0.12]`, purple `[0.7, 0.35, 1.0]`. They are light added to the picture, with a soft glow round them.
- **The burst** on letting go of a slide with a tier: a ring of 14 stars in the tier's colour, spreading to 1.8 m and fading in a fifth of a second.
- **Tyre smoke**: pale puffs (`SMOKE`) from both rear wheels from the start of a slide, growing and rising as they fade over half a second and trailing a couple of metres behind; lit by the world's light, see-through, never a glow.
- **The boost flame** is two jets from the exhaust in the boost's tier colour, with a pale core `[1, 0.95, 0.7]` and a flare where each leaves the engine, 0.6, 0.9 and 1.2 m long for the three tiers and flickering by a sixth of that. Never longer than the car. Seen from straight behind a jet is foreshortened to its flare.
- **The drift on the kart**, drawn only: the body leans about 4 degrees out of a slide and the front wheels are drawn counter-steered; the hop squashes the body a little as it lands.
- **Speed lines** while a boost runs: thin pale streaks near the picture's edges, never over its middle.
- **The readout** is a card like the others, in a bottom corner: the speed in large figures, the surface, the place on the lap in small figures ("1.23 of 2.61 km · next checkpoint 13 of 25"), the drift tier as a dot of the tier's colour.
- **A respawn** (8c) whites the picture out into the cards' pale off-white (`RESPAWN_FADE`) over the last 0.3 s of the wait and clears it over 0.4 s with the car back on the road; the cards stay on top, readable. Nothing else is drawn for it.

`drive-slide.jpg` and `drive-boost.jpg` were taken on 2026-11-18 (6h-5) from the browser suite's `world-00007-drive-slide.png` and `-drive-boost.png` (headless Chromium, 1280 by 720, saved as JPEG at quality 85 like the others). Tane accepted them at Milestone 3's sign-off (2026-11-23). Seed 7's long slide runs onto the grass beside the road, so the sparks are seen over grass.

## What fails the bar

- Smooth-shaded or textured surfaces, or anything with an outline, a glow or a blur, but for the drift's effects (6h-5).
- A colour that is not in `palette.ts`, or a thing lit by its own light so that it looks pasted on (compare its shadowed side with the wall in `road-morning-shadows.jpg`).
- A car that floats above the road or sinks into it, or that casts a shadow (Tane, check-in 1).
- An effect that hides the road ahead, or a card over the middle of the picture.
- Flicker where two surfaces lie on each other, a gap under a wall, or things that pop in while driving.
- Two pictures of the same address with `still=1` that differ.

## Flaws these pictures already have (known issues, not the bar)

- The top edge of a sea cliff or a bank is a saw-tooth (`shore.jpg`; the bank inside the corner in `road-corner-woods.jpg`).
- From above, the sun's glare on the sea is a wide pale patch with wave stripes (`island-from-above.jpg`, right).
- At 07:00 the clouds are grey-brown against the pink sky (`sunrise.jpg`).
- The rock on a mountain can lie in a hard-edged band (`mountain.jpg`).
- `time=18:30` is named "evening light" but its sky is still plain blue (`road-corner-woods.jpg`).

## How to check a visual change

1. `$env:SEEDS = "1,7,42,100,2024"; npm run e2e` (or `npx playwright test --project=chromium -g "screenshots"` for the pictures alone), then copy `test-results/screens/` somewhere, because the next run empties it.
2. Open each new picture beside the reference of the same address. Nothing that was not meant to change should have changed.
3. Look at what is new against "What fails the bar", on at least seeds 1 (mountain), 7 (hilly, by the sea), 42 (a gorge since 6h-3) and 2024 (rolling, wooded), and at a low sun (`time=07:30`).
4. Say in the report which pictures were looked at.
