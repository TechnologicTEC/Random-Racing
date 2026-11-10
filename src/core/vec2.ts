/**
 * A point or direction on the ground plane, in metres.
 *
 * The game world has Y pointing up, so the ground is the X/Z plane. On a
 * top-down map X runs right and Z runs down the screen.
 */
export interface Vec2 {
  x: number;
  z: number;
}
