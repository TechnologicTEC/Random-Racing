import type { TunnelLightConfig } from '../config';
import type { TunnelRoom } from '../gen/road/tunnels';

/** A point this far over the ceiling is on the lid (which stands at least `road.tunnels.cover` 1.5 m over it), so keeps all the light. */
const OVER_CEILING = 0.5;
/** The walls are dimmed to this far beyond their inner faces however short the lid: the walls' thickness, and a little. */
const WALL = 0.65;

/**
 * The share of the light left at a point (M6.2c), 0 to 1, from the tunnels' room there (`tunnelRooms`): all of it
 * outside the tunnels, in front of a portal, and over the ceiling (on the lid); under the lid, `rules.light` deep
 * inside, fading in from all of it at each portal over `rules.fade` metres. Under the lid, beyond the walls the hidden
 * ground is dimmed out to `rules.spread` beyond the walls' inner faces, but no nearer than that to the lid's edge, so
 * none of the ground seen round the lid is dimmed; the walls always are.
 */
export function tunnelLightAt(room: TunnelRoom | null, y: number, rules: TunnelLightConfig): number {
  if (!room?.under || y > room.ceiling + OVER_CEILING) return 1;
  const across = Math.max(room.inner + WALL, Math.min(room.inner + rules.spread, room.reach - rules.spread));
  if (Math.abs(room.lateral) > across) return 1;
  const t = Math.max(0, Math.min(1, room.depth / rules.fade));
  return 1 - (1 - rules.light) * t * t * (3 - 2 * t);
}

/** Multiplies each vertex's colour (three numbers a vertex, beside its three of position) by the light at it, in place. */
export function dimColours(positions: Float32Array, colours: Float32Array, lightAt: (x: number, y: number, z: number) => number): void {
  for (let v = 0; v * 3 < positions.length; v++) {
    const light = lightAt(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!);
    if (light === 1) continue;
    colours[v * 3] = colours[v * 3]! * light;
    colours[v * 3 + 1] = colours[v * 3 + 1]! * light;
    colours[v * 3 + 2] = colours[v * 3 + 2]! * light;
  }
}
