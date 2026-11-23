import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { raceSteps, startRace, type RaceState } from '../sim/race';
import { countdownLights, formatGap, formatRaceTime, raceCard } from './raceCard';

const SPS = config.sim.stepsPerSecond;
const times = raceSteps(config.sim.race, SPS);
const look = config.render.race;

/** A race in the middle of things: `laps` and `splits` finished, the clock at `clock`, this lap begun at `lapStart`. */
function racing(clock: number, laps: number[] = [], splits: number[] = [], lapStart = 0): RaceState {
  return { ...startRace(times), phase: 'racing', countdownLeft: 0, started: true, clock, lap: laps.length + 1, laps, splits, lapStart, sectorStart: lapStart };
}

describe('formatRaceTime', () => {
  it('writes a time in steps as minutes, seconds and thousandths', () => {
    expect(formatRaceTime(0, SPS)).toBe('0:00.000');
    expect(formatRaceTime(61 * SPS, SPS)).toBe('1:01.000');
    expect(formatRaceTime(3438.4, SPS)).toBe('0:57.307');
  });

  it('rounds to the nearest thousandth, carrying into the minutes', () => {
    expect(formatRaceTime(59.9995 * SPS, SPS)).toBe('1:00.000');
    expect(formatRaceTime(59.9994 * SPS, SPS)).toBe('0:59.999');
  });

  it('places a fraction of a step: half a step is 8 thousandths of a second, one step 17', () => {
    expect(formatRaceTime(0.5, SPS)).toBe('0:00.008');
    expect(formatRaceTime(1, SPS)).toBe('0:00.017');
  });

  it('goes past ten minutes', () => {
    expect(formatRaceTime(605.25 * SPS, SPS)).toBe('10:05.250');
  });
});

describe('formatGap', () => {
  it('writes a gap with its sign, in seconds and thousandths', () => {
    expect(formatGap(-0.214 * SPS, SPS)).toBe('−0.214');
    expect(formatGap(1.5 * SPS, SPS)).toBe('+1.500');
    expect(formatGap(0, SPS)).toBe('+0.000');
    expect(formatGap(-62.5 * SPS, SPS)).toBe('−1:02.500');
  });
});

describe('countdownLights', () => {
  const lightsAt = (elapsed: number) => countdownLights({ ...startRace(times), countdownLeft: times.countdown - elapsed }, times, SPS, look);

  it('shows nothing without a race', () => {
    expect(countdownLights(null, times, SPS, look).shown).toBe(false);
  });

  it('lights one red light a second through the countdown', () => {
    expect(lightsAt(0)).toEqual({ shown: true, lit: 1, green: false, opacity: 1 });
    expect(lightsAt(59).lit).toBe(1);
    expect(lightsAt(60).lit).toBe(2);
    expect(lightsAt(120).lit).toBe(3);
    expect(lightsAt(179)).toEqual({ shown: true, lit: 3, green: false, opacity: 1 });
  });

  it('turns all three green at "go", holds them a second, then fades them out', () => {
    expect(config.render.race.goShown).toBe(1);
    expect(countdownLights(racing(0), times, SPS, look)).toEqual({ shown: true, lit: 3, green: true, opacity: 1 });
    expect(countdownLights(racing(60), times, SPS, look).opacity).toBe(1);
    const fade = look.goFade * SPS;
    const half = countdownLights(racing(60 + fade / 2), times, SPS, look);
    expect(half.shown).toBe(true);
    expect(half.opacity).toBeCloseTo(0.5, 9);
    expect(countdownLights(racing(60 + fade), times, SPS, look).shown).toBe(false);
  });

  it('shows nothing once finished', () => {
    expect(countdownLights({ ...racing(9000), phase: 'finished' }, times, SPS, look).shown).toBe(false);
  });
});

describe('raceCard', () => {
  const race = config.sim.race;

  it('reads lap 1 of 3 and no time in the countdown', () => {
    const card = raceCard(startRace(times), race, SPS);
    expect(card.lap).toBe('Lap 1/3');
    expect(card.time).toBe('0:00.000');
    expect(card.finished).toBe(false);
    expect(card.last).toBeNull();
    expect(card.best).toBeNull();
    expect(card.sectors).toEqual([null, null, null]);
  });

  it('counts this lap from its start while racing, and shows the sectors finished so far, with no gap on lap 1', () => {
    const card = raceCard(racing(1500, [], [1200]), race, SPS);
    expect(card.time).toBe('0:25.000');
    expect(card.sectors).toEqual([{ time: '0:20.000', gap: null, quicker: false }, null, null]);
  });

  it('gives the last and best laps, and each sector of a later lap against the best of that sector before it', () => {
    // Laps of 3600 and 3300 steps; lap 3 has done its first two sectors.
    const splits = [1200, 1200, 1200, 1000, 1150, 1150, 1100, 1200];
    const card = raceCard(racing(6900 + 2400, [3600, 3300], splits, 6900), race, SPS);
    expect(card.lap).toBe('Lap 3/3');
    expect(card.time).toBe('0:40.000');
    expect(card.last).toBe('0:55.000');
    expect(card.best).toBe('0:55.000');
    expect(card.sectors).toEqual([
      { time: '0:18.333', gap: '+1.667', quicker: false },
      { time: '0:20.000', gap: '+0.833', quicker: false },
      null,
    ]);
  });

  it('shows a sector quicker than the best in green, and keeps the last lap’s sectors until the first of a new lap is done', () => {
    const splits = [1200, 1200, 1200, 1000, 1150, 1150];
    const card = raceCard(racing(6900 + 300, [3600, 3300], splits, 6900), race, SPS);
    expect(card.time).toBe('0:05.000');
    expect(card.sectors).toEqual([
      { time: '0:16.667', gap: '−3.333', quicker: true },
      { time: '0:19.167', gap: '−0.833', quicker: true },
      { time: '0:19.167', gap: '−0.833', quicker: true },
    ]);
  });

  it('reads "Finished" with the total and every lap, the best marked', () => {
    const splits = [1200, 1200, 1200, 1000, 1150, 1150, 1100, 1200, 1100];
    const finished: RaceState = { ...racing(10300, [3600, 3300, 3400], splits, 6900), phase: 'finished', lap: 3, total: 10300 };
    const card = raceCard(finished, race, SPS);
    expect(card.lap).toBe('Finished');
    expect(card.finished).toBe(true);
    expect(card.time).toBe('2:51.667');
    expect(card.laps).toEqual([
      { time: '1:00.000', best: false },
      { time: '0:55.000', best: true },
      { time: '0:56.667', best: false },
    ]);
  });
});
