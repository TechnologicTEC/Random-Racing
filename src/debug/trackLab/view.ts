import type { Vec2 } from '../../core/vec2';

/** The part of the world shown on the canvas. Sizes are in CSS pixels. */
export interface View {
  /** World point at the middle of the canvas, in metres. */
  centerX: number;
  centerZ: number;
  /** Pixels per metre. */
  scale: number;
  width: number;
  height: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 40;

export function worldToScreen(view: View, x: number, z: number): { sx: number; sy: number } {
  return {
    sx: view.width / 2 + (x - view.centerX) * view.scale,
    sy: view.height / 2 + (z - view.centerZ) * view.scale,
  };
}

export function screenToWorld(view: View, sx: number, sy: number): Vec2 {
  return {
    x: view.centerX + (sx - view.width / 2) / view.scale,
    z: view.centerZ + (sy - view.height / 2) / view.scale,
  };
}

/** Zooms by a factor while keeping the world point under (sx, sy) where it is. */
export function zoomAt(view: View, sx: number, sy: number, factor: number): View {
  const anchor = screenToWorld(view, sx, sy);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  return {
    ...view,
    scale,
    centerX: anchor.x - (sx - view.width / 2) / scale,
    centerZ: anchor.z - (sy - view.height / 2) / scale,
  };
}

/** Moves the content by a drag distance in pixels. */
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, centerX: view.centerX - dx / view.scale, centerZ: view.centerZ - dy / view.scale };
}

/** A view centred on the origin that fits a circle of the given radius, with padding in pixels. */
export function fitView(width: number, height: number, radius: number, padding: number): View {
  const room = Math.max(1, Math.min(width, height) - padding * 2);
  return { centerX: 0, centerZ: 0, scale: room / (radius * 2), width, height };
}
