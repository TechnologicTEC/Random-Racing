/** Buckets items by grid cell so only nearby items are compared. */
export class Grid {
  private readonly cells = new Map<number, number[]>();

  constructor(private readonly cellSize: number) {}

  cellOf(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  get(cellX: number, cellZ: number): number[] | undefined {
    return this.cells.get((cellX + 32768) * 65536 + (cellZ + 32768));
  }

  add(cellX: number, cellZ: number, item: number): void {
    const key = (cellX + 32768) * 65536 + (cellZ + 32768);
    const cell = this.cells.get(key);
    if (cell) cell.push(item);
    else this.cells.set(key, [item]);
  }
}
