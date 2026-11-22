import type { Vec3 } from '../quat';
import { add, dot, unit } from '../vec';
import type { Surface } from './surface';

/**
 * The ground direction each wheel's spring pushes along, with a passing odd one steadied (Tane, 10a-4). A wheel's
 * ball cast that meets the road's mesh on an edge between two triangles can come back with its direction tilted about
 * 10 degrees for a step, and the spring pushing along it then kicks the car. So a touching wheel whose direction is
 * further than `limit` (a cosine) from the average of the other touching wheels, when at least two others are down to
 * compare with, all on the same surface as it (so one wheel on a hillside's grass or a kerb is real ground), and they
 * agree among themselves (each within `limit` of their average), takes that average instead,
 * **on the first step it is odd only**: a real change of ground under one
 * wheel that lasts (a bank, a kerb's upright face) is felt from the next step. Each wheel is compared with the others
 * as the casts gave them. A kerb's top (5 degrees) is within the limit.
 *
 * @param limit the cosine of the largest angle a wheel may be from the others: `car.suspension.oddNormal`
 * @param wasOdd which wheels were odd on the last step (remembered by the car)
 * @returns the directions to push along, and which wheels are odd on this step
 */
export function steadyNormals(
  wheels: ReadonlyArray<{ touching: boolean; normal: Vec3; surface: Surface | null }>,
  limit: number,
  wasOdd: readonly boolean[],
): { normals: Vec3[]; odd: boolean[] } {
  const normals: Vec3[] = [];
  const odd: boolean[] = [];
  for (const [i, wheel] of wheels.entries()) {
    let rest: Vec3 | null = null;
    if (wheel.touching) {
      let others = { x: 0, y: 0, z: 0 };
      let count = 0;
      for (const [j, other] of wheels.entries()) {
        if (j === i || !other.touching) continue;
        others = add(others, other.normal);
        count++;
      }
      if (count >= 2) {
        const mean = unit(others);
        // The others must agree: two wheels on a slope and two on the road is real ground, not one odd cast.
        const agree = wheels.every((other, j) => j === i || !other.touching || (other.surface === wheel.surface && dot(other.normal, mean) >= limit));
        if (agree) rest = mean;
      }
    }
    const isOdd = rest !== null && dot(wheel.normal, rest) < limit;
    odd.push(isOdd);
    normals.push(isOdd && !wasOdd[i] ? rest! : wheel.normal);
  }
  return { normals, odd };
}
