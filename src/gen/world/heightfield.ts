import type { HeightField } from '../types';

/** An empty height grid covering a square tile `extent` metres wide, centred on the origin. */
export function createField(extent: number, cell: number): HeightField {
  const size = Math.round(extent / cell) + 1;
  return { size, cell, origin: -extent / 2, height: new Float32Array(size * size) };
}

/** World X of a column of samples. */
export function worldX(field: HeightField, ix: number): number {
  return field.origin + ix * field.cell;
}

/** World Z of a row of samples. */
export function worldZ(field: HeightField, iz: number): number {
  return field.origin + iz * field.cell;
}

/** Column position of a world X, as a fraction (12.5 is half way between columns 12 and 13). */
export function cellX(field: HeightField, x: number): number {
  return (x - field.origin) / field.cell;
}

/** Row position of a world Z, as a fraction. */
export function cellZ(field: HeightField, z: number): number {
  return (z - field.origin) / field.cell;
}

/**
 * Height at any point of the tile, blended from the four samples around it.
 * Works on any grid of values laid out like the field's heights.
 *
 * @param outside returned for points off the tile
 */
export function sampleGrid(field: HeightField, values: ArrayLike<number>, x: number, z: number, outside: number): number {
  const gx = cellX(field, x);
  const gz = cellZ(field, z);
  const last = field.size - 1;
  if (gx < 0 || gz < 0 || gx > last || gz > last) return outside;
  const ix = Math.min(last - 1, Math.floor(gx));
  const iz = Math.min(last - 1, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  const i = iz * field.size + ix;
  const top = values[i]! + (values[i + 1]! - values[i]!) * fx;
  const bottom = values[i + field.size]! + (values[i + field.size + 1]! - values[i + field.size]!) * fx;
  return top + (bottom - top) * fz;
}

/** Height of the field at any point of the tile. */
export function sampleField(field: HeightField, x: number, z: number, outside: number): number {
  return sampleGrid(field, field.height, x, z, outside);
}
