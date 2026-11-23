import { onScreen } from '../camera/orbitFit';
import type { Orbit } from '../camera/orbit';
import type { CenterLine } from '../gen/types';

/** A box over the picture, in its -1 to 1 across and up: the card in the middle, say. */
export interface PictureBox {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/**
 * The share of a lap's samples a camera on this orbit shows (Tane, after the check-in: the track is what the title
 * view is for): in the picture, above `floor` (the bar of buttons along the bottom), and behind none of the boxes.
 */
export function trackShown(
  line: CenterLine,
  height: ArrayLike<number>,
  orbit: Orbit,
  fieldOfView: number,
  aspect: number,
  covered: readonly PictureBox[],
  floor: number,
): number {
  let shown = 0;
  for (let i = 0; i < line.count; i++) {
    const seen = onScreen({ x: line.x[i]!, y: height[i]!, z: line.z[i]! }, orbit, fieldOfView, aspect);
    if (!seen || Math.abs(seen.x) > 1 || seen.y > 1 || seen.y < floor) continue;
    if (covered.some((box) => seen.x > box.left && seen.x < box.right && seen.y > box.bottom && seen.y < box.top)) continue;
    shown++;
  }
  return shown / line.count;
}
