import { chaseNext, chaseStart, type ChaseView } from '../camera/chase';
import type { GameConfig } from '../config';
import type { InputRecord } from '../sim/input';
import type { CarState, Sim } from '../sim/sim';
import { advance, blendState } from './drive';

/**
 * Driving on the page: the island's simulation, moved on by the fixed-step
 * loop, and the chase camera behind the car. No drawing and no devices here;
 * the page reads the keys and the controller and draws what this gives it.
 */
export interface Driving {
  /** Drives a new simulation, or none. The camera starts straight behind the car. */
  setSim(sim: Sim | null): void;
  /**
   * Drives a simulation that takes over from the last one at the same moment (the tuning panel's rebuild: a
   * snapshot of the old restored into the new). The camera carries on easing from where it was.
   */
  replaceSim(sim: Sim): void;
  sim(): Sim | null;
  /**
   * One frame of the page, `seconds` after the last. While `stepping`, the simulation takes the steps the loop
   * gives (`advance`) with `input`; otherwise it takes none and no time is carried over. Then the car to draw and
   * the camera are worked out. Returns whether anything to draw changed.
   */
  frame(seconds: number, input: InputRecord, stepping: boolean, groundAt: (x: number, z: number) => number): boolean;
  /**
   * Takes `steps` steps at once with `input`, for browser tests and the console. The page's next frame takes no
   * step of its own and shows exactly where the steps ended, with the camera straight behind the car.
   */
  run(steps: number, input: InputRecord): CarState;
  /** Puts the camera straight behind the car at the next frame instead of easing it there. */
  snap(): void;
  /** The car as it is drawn now: between the last two steps' states. Null before the first frame. */
  shown(): CarState | null;
  /** The chase camera now. Null before the first frame. */
  view(): ChaseView | null;
}

export function createDriving(cfg: Pick<GameConfig, 'sim' | 'camera'>): Driving {
  let sim: Sim | null = null;
  let before: CarState | null = null;
  let after: CarState | null = null;
  let shown: CarState | null = null;
  let view: ChaseView | null = null;
  let carried = 0;
  let snapNext = true;
  let holdNext = false;

  return {
    setSim(next) {
      sim = next;
      before = after = next ? next.state() : null;
      shown = null;
      view = null;
      carried = 0;
      snapNext = true;
      holdNext = false;
    },
    replaceSim(next) {
      sim = next;
      before = after = next.state();
      carried = 0;
    },
    sim: () => sim,

    frame(seconds, input, stepping, groundAt) {
      if (!sim || !after) return false;
      let steps = 0;
      let blend = 0;
      if (stepping && !holdNext) {
        const next = advance(carried, seconds, cfg.sim);
        carried = next.carried;
        blend = next.blend;
        for (; steps < next.steps; steps++) {
          sim.step(input);
          before = after;
          after = sim.state();
          // Put back at a checkpoint: no blend from where the car was, and the camera straight behind it there.
          if (before.respawn.respawns !== after.respawn.respawns) {
            before = after;
            snapNext = true;
          }
        }
      } else {
        carried = 0;
      }
      const wasHeld = holdNext;
      holdNext = false;
      const drawn = blend > 0 && before ? blendState(before, after, blend) : after;
      const changed = steps > 0 || shown === null || snapNext || wasHeld || drawn !== shown;
      shown = drawn;
      view = snapNext || !view ? chaseStart(drawn, groundAt, cfg.camera.chase) : chaseNext(view, drawn, seconds, groundAt, cfg.camera.chase);
      snapNext = false;
      return changed;
    },

    run(steps, input) {
      if (!sim) throw new Error('There is no simulation to run yet');
      for (let k = 0; k < steps; k++) sim.step(input);
      before = after = shown = sim.state();
      carried = 0;
      snapNext = true;
      holdNext = true;
      return after;
    },

    snap() {
      snapNext = true;
    },
    shown: () => shown,
    view: () => view,
  };
}
