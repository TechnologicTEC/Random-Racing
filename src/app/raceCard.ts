import type { RaceConfig, RenderConfig } from '../config';
import type { RaceSteps, RaceState } from '../sim/race';

/**
 * What the race cards say (M4.3), worked out from the race's state alone, so the page only writes it out. Every time
 * comes from the simulation's steps, never from the clock, so what is shown is what Node and every browser give.
 */

/** Rounds a time in steps to whole thousandths of a second. */
const thousandths = (steps: number, stepsPerSecond: number): number => Math.round((steps * 1000) / stepsPerSecond);

/** `m:ss.mmm` from whole thousandths of a second, 0 or more. */
function clock(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor(ms / 1000) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

/** A time in steps (fractions of a step allowed) as `m:ss.mmm`, to the nearest thousandth of a second. */
export function formatRaceTime(steps: number, stepsPerSecond: number): string {
  return clock(Math.max(0, thousandths(steps, stepsPerSecond)));
}

/** A gap in steps as `+0.214` or `−0.214` (with a true minus sign), and `+1:02.500` once it is a minute or more. */
export function formatGap(steps: number, stepsPerSecond: number): string {
  const ms = thousandths(steps, stepsPerSecond);
  const size = Math.abs(ms);
  const sign = ms < 0 ? '−' : '+';
  if (size >= 60000) return sign + clock(size);
  return `${sign}${Math.floor(size / 1000)}.${String(size % 1000).padStart(3, '0')}`;
}

/** The countdown's three lights: whether the card shows, how many are lit, whether they are green, and how faded it is (1 is solid). */
export interface Lights {
  shown: boolean;
  lit: 0 | 1 | 2 | 3;
  green: boolean;
  opacity: number;
}

const HIDDEN: Lights = { shown: false, lit: 0, green: false, opacity: 0 };

/**
 * The countdown's lights (Tane, M4.0): one red light more each second of the countdown, all three green at "go", held
 * for `goShown` seconds, then faded out over `goFade`.
 */
export function countdownLights(race: RaceState | null, times: RaceSteps, stepsPerSecond: number, look: RenderConfig['race']): Lights {
  if (!race || race.phase === 'finished') return HIDDEN;
  if (race.phase === 'countdown') {
    const elapsed = times.countdown - race.countdownLeft;
    const lit = Math.min(3, Math.floor(elapsed / stepsPerSecond) + 1) as 1 | 2 | 3;
    return { shown: true, lit, green: false, opacity: 1 };
  }
  const held = look.goShown * stepsPerSecond;
  const fade = look.goFade * stepsPerSecond;
  const opacity = race.clock <= held ? 1 : 1 - (race.clock - held) / fade;
  return opacity > 0 ? { shown: true, lit: 3, green: true, opacity } : HIDDEN;
}

/**
 * What the lights card says under the green lights about the start (Tane at the sign-off: nothing showed whether the
 * boost was earned): "Boost start!", "Too early" for a throttle first pressed before the boost's last quarter second,
 * and nothing in the countdown or when the throttle was never pressed. It fades with the lights.
 */
export function startNote(race: RaceState): string {
  if (race.phase !== 'racing') return '';
  if (race.startBoost) return 'Boost start!';
  return race.pressedOn > 0 ? 'Too early' : '';
}

/** One sector's time on the card, and its gap to the best time of that sector on the laps before (none on lap 1). */
export interface SectorRow {
  time: string;
  gap: string | null;
  /** Quicker than that best: drawn in the accent colour. */
  quicker: boolean;
}

/** What the race card says. */
export interface RaceCard {
  /** "Lap 2/3", or "Finished". */
  lap: string;
  /** This lap's time so far, or the whole race's once finished. */
  time: string;
  finished: boolean;
  /** The last lap finished and the best so far; null before the first. */
  last: string | null;
  best: string | null;
  /** One row a sector: this lap's, or the last lap's until this lap's first sector is done. Null for a sector not yet done. */
  sectors: Array<SectorRow | null>;
  /** Every lap once finished, the best marked; empty before. */
  laps: Array<{ time: string; best: boolean }>;
}

/** The race card for a race as it is now. */
export function raceCard(race: RaceState, cfg: RaceConfig, stepsPerSecond: number): RaceCard {
  const show = (steps: number): string => formatRaceTime(steps, stepsPerSecond);
  const finished = race.phase === 'finished';
  const best = race.laps.length > 0 ? Math.min(...race.laps) : null;
  const n = cfg.sectors;

  // The sectors of this lap, or of the last one while none of this lap's is done.
  const thisLap = race.laps.length;
  const lap = race.splits.length > thisLap * n || thisLap === 0 ? thisLap : thisLap - 1;
  const sectors: Array<SectorRow | null> = [];
  for (let k = 0; k < n; k++) {
    const time = race.splits[lap * n + k];
    if (time === undefined) {
      sectors.push(null);
      continue;
    }
    let before = Infinity;
    for (let j = 0; j < lap; j++) before = Math.min(before, race.splits[j * n + k]!);
    const gap = before === Infinity ? null : time - before;
    sectors.push({ time: show(time), gap: gap === null ? null : formatGap(gap, stepsPerSecond), quicker: gap !== null && gap < 0 });
  }

  const running = race.phase === 'racing' ? race.clock - race.lapStart : 0;
  return {
    lap: finished ? 'Finished' : `Lap ${race.lap}/${cfg.laps}`,
    time: show(finished ? race.total : running),
    finished,
    last: race.laps.length > 0 ? show(race.laps[race.laps.length - 1]!) : null,
    best: best === null ? null : show(best),
    sectors,
    laps: finished ? race.laps.map((time) => ({ time: show(time), best: time === best })) : [],
  };
}
