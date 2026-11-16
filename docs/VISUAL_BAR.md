# Visual bar


What the game looks like, in terms that can be checked, with pictures to lay new work beside. Written 2026-11-16 from eleven pictures taken that day (1280 by 720, headless Chromium, `still=1`) and looked at one by one. They are in `docs/visual-bar/`. **Anything new that is drawn (the car, sparks, flames, menus) must look as if it belongs in these pictures.**

**The look in one line:** a bright, clean toy island on a clear day. Every surface is flat-coloured facets with no textures and no outlines, the light is one sun and a soft sky, the horizon fades into blue haze, and the road is the crispest thing in the picture.

## The rules that make it

- **Flat shading everywhere.** Each triangle has one colour and its own light; nothing is rounded off by smooth shading. Trees are faceted lumps, clouds are clusters of faceted puffs, rocks are faceted boulders.
- **No image files.** Colour comes from `src/render/palette.ts` (ordinary screen colours from 0 to 1) and from the ground's cover. A new thing takes its colours from that file, or adds to it.
- **One light for everything.** A sun and a sky light worked out from the time of day (`render/daylight.ts`), the same for ground, road, trees and anything new. Shadows keep 60% of the sky's light (`render.shadows.skyShare`), so a shadow is a darker tint of the surface, never black.
- **Haze** from 1,500 m to 6,600 m, in the horizon's colour, so far land and sea melt into the sky.
- **No glow, bloom, outlines or film effects.** There is no post-processing at all. Bright things (sparks, a flame) are bright because they are drawn unlit in a light colour.
- **The view** is 50 degrees tall for the flying and circling cameras; the chase camera is planned at 60.
- **The cards** on top are pale, slightly see-through rounded panels (`rgba(246, 250, 247, 0.86)`, 14 px corners, a soft shadow) with dark green-black text (`#15302b`) and one teal accent (`#1a7d77`). They sit in the corners and along the bottom, never over the middle of the road.

## Each part, with its picture

| Part | What it must look like | Picture |
| --- | --- | --- |
| **Road** | Dark blue-grey asphalt (`[0.26, 0.265, 0.275]`), off-white dashed centre line and solid edge lines with crisp edges, a brown earth shoulder that fades into the grass. Banked in corners | `road-straight-meadow.jpg`, `road-corner-kerb.jpg` |
| **Kerbs** | Red and off-white blocks on the inside of corners, low and flat, each block one clean colour | `road-corner-kerb.jpg`, `hairpin-and-beach.jpg` |
| **Walls** | Low pale-grey blocks, red and white on the outside of corners, plain elsewhere. A wall's end slopes down to the ground. No gap under a wall | `road-morning-shadows.jpg`, `road-corner-woods.jpg` (a sloping end), `mountain-road.jpg` |
| **Start gate** | Two dark posts, a pale beam, a chequered line across the road, a short wall each side | `start-gate.jpg`, `sunrise.jpg` |
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

`cam=fly` does nothing today (the page opens flying); it is there so the addresses still give these pictures once the page opens driving (step 5e). The generator is `v0`: if a later change moves a seed's world, take the picture again and say so here.

## The car, sparks and flame (not built yet: a proposal for Tane to judge at check-in 1)

Nothing here has been drawn or seen. It is the bar the first version should aim at, by the rules above.

- **The car** is a small open kart with a driver, built in code from flat-shaded facets, 300 to 600 triangles: a wedge nose, a low floor, side pods, a seat back, a driver's body and a round helmet, and four fat wheels that stand clear of the body. The helmet and the open wheels are what make it read as a kart and give it scale. It fits the simulated body: 1.4 m wide, 2.2 m long, about 1 m to the top of the helmet.
- **Colours** (to add to `palette.ts`): body a warm yellow-orange, about `[0.98, 0.72, 0.12]`, which stands out from the green grass, the dark road, the blue sea and the red of the kerbs; chassis and seat the gate's dark grey `[0.16, 0.17, 0.2]`; helmet off-white `[0.94, 0.94, 0.92]`; tyres near black `[0.07, 0.07, 0.08]` with pale hubs.
- **It sits in the world's light**: lit by the same sun and sky as the road, casting a shadow on it and shaded by trees and walls. Its wheels touch the road: no gap and no sinking that can be seen.
- **From the chase camera** it is about an eighth of the picture's width, low in the middle, with the road ahead clear above it.
- **Sparks** are small flat triangles, like the flower dabs, thrown back and out from the two rear wheels, 20 to 30 a wheel, each living about a quarter of a second, drawn unlit: blue `[0.25, 0.65, 1.0]`, orange `[1.0, 0.6, 0.12]`, purple `[0.7, 0.35, 1.0]`. A burst never grows bigger than the wheel it comes from.
- **The boost flame** is two faceted cones behind the car, pale yellow at the core `[1, 0.95, 0.7]` and orange outside `[1, 0.55, 0.1]`, unlit, 0.6, 0.9 and 1.2 m long for the three tiers and flickering by a sixth of that. Never longer than the car.
- **The readout** is a card like the others, in a bottom corner: the speed in large figures, the surface, the drift tier as a dot of the tier's colour.

When the car has been drawn and Tane has approved it at check-in 1, add `drive-start.jpg`, `drive-slide.jpg` and `drive-boost.jpg` to `docs/visual-bar/` and to the table above.

## What fails the bar

- Smooth-shaded or textured surfaces, or anything with an outline, a glow or a blur.
- A colour that is not in `palette.ts`, or a thing lit by its own light so that it looks pasted on (compare its shadowed side with the wall in `road-morning-shadows.jpg`).
- A car with no shadow, or one that floats above the road or sinks into it.
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
3. Look at what is new against "What fails the bar", on at least seeds 1 (mountain), 7 (hilly, by the sea), 42 (sloped start) and 2024 (rolling, wooded), and at a low sun (`time=07:30`).
4. Say in the report which pictures were looked at.
