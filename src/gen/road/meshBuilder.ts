import type { MeshData } from '../types';

/** A corner of a quad: a position and nothing else. */
export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Collects flat-coloured quads into one mesh. Each quad gets its own four vertices, so its colour never bleeds into its neighbours. */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];
  private readonly materials: number[] = [];

  /**
   * Adds a four-sided face as two triangles. Seen from the side it should
   * face, `a` to `b` runs one way across it and `c` to `d` the same way
   * further along; the face then points towards whoever sees a, b, c turn clockwise.
   * For a face lying on the ground with b to the right of a and c ahead of a, that is up.
   */
  quad(a: Point, b: Point, c: Point, d: Point, material: number): void {
    const first = this.positions.length / 3;
    for (const point of [a, b, c, d]) {
      this.positions.push(point.x, point.y, point.z);
      this.materials.push(material);
    }
    this.indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
  }

  build(): MeshData {
    return {
      positions: Float32Array.from(this.positions),
      indices: Uint32Array.from(this.indices),
      materials: Uint8Array.from(this.materials),
    };
  }
}
