/**
 * Turns in space as plain numbers, for the simulation. Only +, -, *, / and
 * square roots are used, so every computer gets exactly the same answer.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A turn, as a unit quaternion: the form the physics engine keeps a body's turn in. */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * The turn that carries the x, y and z axes onto the three directions given:
 * unit vectors at right angles to each other, with `z` equal to `x` crossed
 * with `y` (a right-handed set, like the axes themselves).
 */
export function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): Quat {
  const trace = x.x + y.y + z.z;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    return { x: (y.z - z.y) / s, y: (z.x - x.z) / s, z: (x.y - y.x) / s, w: s / 4 };
  }
  if (x.x > y.y && x.x > z.z) {
    const s = 2 * Math.sqrt(1 + x.x - y.y - z.z);
    return { x: s / 4, y: (y.x + x.y) / s, z: (z.x + x.z) / s, w: (y.z - z.y) / s };
  }
  if (y.y > z.z) {
    const s = 2 * Math.sqrt(1 + y.y - x.x - z.z);
    return { x: (y.x + x.y) / s, y: s / 4, z: (z.y + y.z) / s, w: (z.x - x.z) / s };
  }
  const s = 2 * Math.sqrt(1 + z.z - x.x - y.y);
  return { x: (z.x + x.z) / s, y: (z.y + y.z) / s, z: s / 4, w: (x.y - y.x) / s };
}

/** A vector turned by a turn. */
export function rotate(turn: Quat, v: Vec3): Vec3 {
  // v + 2w(q x v) + 2 q x (q x v), with q the turn's vector part.
  const cx = turn.y * v.z - turn.z * v.y;
  const cy = turn.z * v.x - turn.x * v.z;
  const cz = turn.x * v.y - turn.y * v.x;
  return {
    x: v.x + 2 * (turn.w * cx + turn.y * cz - turn.z * cy),
    y: v.y + 2 * (turn.w * cy + turn.z * cx - turn.x * cz),
    z: v.z + 2 * (turn.w * cz + turn.x * cy - turn.y * cx),
  };
}
