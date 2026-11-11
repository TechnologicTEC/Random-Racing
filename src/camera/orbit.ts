/**
 * A camera that circles a point, as plain numbers. The renderer turns this
 * into a real camera; nothing here knows about Three.js.
 */
export interface Orbit {
  /** The point the camera looks at, in metres. */
  targetX: number;
  targetY: number;
  targetZ: number;
  /** Compass direction of the camera from the target, in radians. */
  angle: number;
  /** How far the camera is tipped up from the horizon, in radians: near 0 looks along the ground, near a quarter turn looks straight down. */
  tilt: number;
  /** Metres from the target to the camera. */
  distance: number;
}

const MIN_TILT = 0.08;
const MAX_TILT = Math.PI / 2 - 0.02;

/** Radians turned per pixel dragged. */
const DRAG = 0.005;

/** Where the camera is. */
export function orbitEye(orbit: Orbit): { x: number; y: number; z: number } {
  const flat = orbit.distance * Math.cos(orbit.tilt);
  return {
    x: orbit.targetX + flat * Math.sin(orbit.angle),
    y: orbit.targetY + orbit.distance * Math.sin(orbit.tilt),
    z: orbit.targetZ + flat * Math.cos(orbit.angle),
  };
}

/** The orbit after dragging the pointer by a number of pixels: sideways turns it, up and down tilts it. */
export function dragOrbit(orbit: Orbit, dx: number, dy: number): Orbit {
  return {
    ...orbit,
    angle: orbit.angle - dx * DRAG,
    tilt: Math.min(MAX_TILT, Math.max(MIN_TILT, orbit.tilt + dy * DRAG)),
  };
}

/** The orbit after turning the mouse wheel, kept between the nearest and furthest distances. */
export function zoomOrbit(orbit: Orbit, wheel: number, nearest: number, furthest: number): Orbit {
  return { ...orbit, distance: Math.min(furthest, Math.max(nearest, orbit.distance * Math.exp(wheel * 0.0012))) };
}
