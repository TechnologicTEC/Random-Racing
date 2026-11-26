import type { GenConfig } from '../../config';
import type { CenterLine, MeshData } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';

/** What each material number in the road mesh stands for. The renderer chooses the colours. */
export const ROAD_MATERIAL = {
  asphalt: 0,
  /** White paint: edge lines and the centre dashes. */
  line: 1,
  /** The apron folded down from each edge of the road. */
  shoulder: 2,
  /** The red and the white blocks of a kerb. */
  kerbRed: 3,
  kerbWhite: 4,
  /** The wall along each edge: plain, and the red and white blocks on the outside of corners. */
  barrier: 5,
  barrierRed: 6,
  barrierWhite: 7,
  /** The dark squares of the chequered start line (the light ones are `line`). */
  startDark: 8,
  /** The posts of the start gate, and the beam across it. */
  gate: 9,
  gateBeam: 10,
  /** The beam of a lap gate (M5.4d): its posts are `gate`. */
  lapGateBeam: 11,
  /** A bridge's deck and pillars (M6.1b). */
  bridge: 12,
  /** The road's surface on a wooden bridge (M6.1c): still the road the car drives on, but not drawn; the planks are drawn there. */
  deckUnder: 14,
  /** A wooden bridge's planks, in two browns, and the dark gap after each (M6.1c). */
  plankLight: 15,
  plankDark: 16,
  plankGap: 17,
  /** Timber: a wooden bridge's railings and its aprons (M6.1c). */
  timber: 18,
  /** A concrete bridge's white steel railings (M6.1c). */
  steel: 19,
} as const;

/** What stands under each piece of the road (M6.1c, `deckPieces`): no bridge, a wooden one or a concrete one. */
export const DECK = { none: 0, wood: 1, concrete: 2 } as const;

/**
 * One side of a strip: `edge` picks the left road edge (-1), the centre line
 * (0) or the right road edge (1), and `offset` is metres to the right of that.
 * Measuring from the edges lets the same strips fit a road of any width.
 */
interface Side {
  edge: -1 | 0 | 1;
  offset: number;
}

/** One lengthwise strip of the road's cross-section. */
interface Strip {
  from: Side;
  to: Side;
  /** How far each side of the strip sits below the road surface, in metres. */
  dropFrom: number;
  dropTo: number;
  material: number;
  /** Painted only on every other dash length (the centre line). Between dashes it is plain asphalt. */
  dashed: boolean;
}

/**
 * Builds the road surface as triangles: asphalt with a white line along each
 * edge and a dashed one down the middle, tilted with the banking, plus an
 * apron folded down from each edge to cover the gap above the sunken ground.
 *
 * @param height height of the road centre at each sample, in metres
 * @param cross tilt at each sample: metres of height gained per metre to the right. Null for a level road
 * @param width road width at each sample, in metres
 * @param decks for each piece of the road (from a sample to the next), what bridge it is on, if any (`deckPieces`, M6.1c):
 *   on a concrete deck the road keeps its own colours (Tane, M6.1c-3), its aprons the deck's; on a wooden one the surface is left out of the drawing
 *   (`deckUnder`) for the planks. Only the colours change: every position and triangle stays, as the car drives on them
 */
export function buildRoadRibbon(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  cfg: GenConfig,
  decks?: Uint8Array,
): MeshData {
  const road = cfg.road;
  const centre = road.centreLine / 2;
  const left = (offset: number): Side => ({ edge: -1, offset });
  const middle = (offset: number): Side => ({ edge: 0, offset });
  const right = (offset: number): Side => ({ edge: 1, offset });
  const strips: Strip[] = [
    { from: left(-road.apronWidth), to: left(0), dropFrom: road.apronDrop, dropTo: 0, material: ROAD_MATERIAL.shoulder, dashed: false },
    { from: left(0), to: left(road.edgeLine), dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.line, dashed: false },
    { from: left(road.edgeLine), to: middle(-centre), dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.asphalt, dashed: false },
    { from: middle(-centre), to: middle(centre), dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.line, dashed: true },
    { from: middle(centre), to: right(-road.edgeLine), dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.asphalt, dashed: false },
    { from: right(-road.edgeLine), to: right(0), dropFrom: 0, dropTo: 0, material: ROAD_MATERIAL.line, dashed: false },
    { from: right(0), to: right(road.apronWidth), dropFrom: 0, dropTo: road.apronDrop, material: ROAD_MATERIAL.shoulder, dashed: false },
  ];

  const n = line.count;
  /** A point of the cross-section at a sample. The surface tilts only across the road itself; the aprons hang from its edges. */
  const point = (i: number, side: Side, drop: number): Point => {
    const half = width[i]! / 2;
    const lateral = side.edge * half + side.offset;
    const onRoad = Math.max(-half, Math.min(half, lateral));
    return {
      // Right of the direction of travel is (-tz, tx) on the map.
      x: line.x[i]! - line.tz[i]! * lateral,
      y: height[i]! + (cross ? cross[i]! * onRoad : 0) - drop,
      z: line.z[i]! + line.tx[i]! * lateral,
    };
  };

  const dashSamples = Math.max(1, Math.round(road.centreDash / line.spacing));
  const builder = new MeshBuilder();
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const painted = Math.floor(i / dashSamples) % 2 === 0;
    const deck = decks ? decks[i]! : DECK.none;
    for (const strip of strips) {
      const material = onDeck(strip.dashed && !painted ? ROAD_MATERIAL.asphalt : strip.material, deck);
      builder.quad(
        point(i, strip.from, strip.dropFrom),
        point(i, strip.to, strip.dropTo),
        point(next, strip.from, strip.dropFrom),
        point(next, strip.to, strip.dropTo),
        material,
      );
    }
  }
  return builder.build();
}

/** A strip's material on a bridge (M6.1c): the aprons take the deck's colour; on wood the surface is left for the planks; on concrete the road keeps its own colours (Tane, M6.1c-3). */
function onDeck(material: number, deck: number): number {
  if (deck === DECK.wood) return material === ROAD_MATERIAL.shoulder ? ROAD_MATERIAL.timber : ROAD_MATERIAL.deckUnder;
  if (deck === DECK.concrete && material === ROAD_MATERIAL.shoulder) return ROAD_MATERIAL.bridge;
  return material;
}
