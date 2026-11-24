import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { hashHandling, RECORD_FORMAT, type RunRecord } from '../sim/record';
import { startRace, raceSteps, type RaceState } from '../sim/race';
import { chooseGhost, ghostGap, ghostPlace, ghostRows, saveVerdict, titleTimes } from './ghost';

const HALF = Math.SQRT1_2;
/** A made-up record: three places, 6 steps apart, the car moving along x and turning a quarter round about up. */
function madeUp(): RunRecord {
  return {
    format: RECORD_FORMAT,
    seed: 7,
    generator: 0,
    driver: 'player',
    every: 6,
    handling: hashHandling(config),
    inputs: new Uint32Array(14),
    // prettier-ignore
    places: Float32Array.from([
      0, 1, 0, 0, 0, 0, 1,
      6, 1, 0, 0, HALF, 0, HALF,
      12, 2, -3, 0, 1, 0, 0,
    ]),
    laps: [],
    splits: [],
    total: 0,
    hash: '00000000',
  };
}

describe('where the ghost is (ghostPlace)', () => {
  it('is exactly a kept place at a multiple of 6 steps', () => {
    const record = madeUp();
    expect(ghostPlace(record, 0)).toEqual({ position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    expect(ghostPlace(record, 6)!.position).toEqual({ x: 6, y: 1, z: 0 });
    expect(ghostPlace(record, 6)!.rotation.y).toBeCloseTo(HALF, 6);
    expect(ghostPlace(record, 12)!.position).toEqual({ x: 12, y: 2, z: -3 });
  });

  it('is blended between the two nearest places in between, by step', () => {
    const record = madeUp();
    const half = ghostPlace(record, 9)!;
    expect(half.position).toEqual({ x: 9, y: 1.5, z: -1.5 });
    // Half way round from a quarter turn to a half turn about up, one long.
    const r = half.rotation;
    expect(Math.hypot(r.x, r.y, r.z, r.w)).toBeCloseTo(1, 9);
    expect(Math.atan2(r.y, r.w) * 2).toBeCloseTo((3 * Math.PI) / 4, 1);
    const early = ghostPlace(record, 1.5)!;
    expect(early.position.x).toBeCloseTo(1.5, 9);
  });

  it('is nowhere past the last place kept, or before step 0', () => {
    const record = madeUp();
    expect(ghostPlace(record, 12.01)).toBeNull();
    expect(ghostPlace(record, 400)).toBeNull();
    expect(ghostPlace(record, -1)).toBeNull();
    expect(ghostPlace({ ...madeUp(), places: new Float32Array(0) }, 0)).toBeNull();
  });
});

describe('which ghost is drawn (chooseGhost: the bot until the player beats it, Tane at M5.0)', () => {
  const today = hashHandling(config);
  const run = (driver: 'player' | 'bot', total: number, handling = today): RunRecord => ({ ...madeUp(), driver, total, handling });

  it("is the bot's while there is no ghost of the player's", () => {
    const bot = run('bot', 9000);
    expect(chooseGhost(null, bot, today)).toEqual({ record: bot, driver: 'bot', older: false });
  });

  it("is the player's once faster than the bot, and the bot's while it is not", () => {
    const bot = run('bot', 9000);
    const quicker = run('player', 8999.5);
    expect(chooseGhost(quicker, bot, today)).toEqual({ record: quicker, driver: 'player', older: false });
    expect(chooseGhost(run('player', 9000), bot, today)!.driver).toBe('bot');
    expect(chooseGhost(run('player', 9500), bot, today)!.driver).toBe('bot');
  });

  it("is the player's with no bot's (not worked out yet, left out, or the bot did not finish)", () => {
    const own = run('player', 9500);
    expect(chooseGhost(own, null, today)).toEqual({ record: own, driver: 'player', older: false });
  });

  it("puts an older version's ghost of the player's behind the bot's, and draws it marked older only with no bot's", () => {
    const old = run('player', 5000, 'deadbeef');
    const bot = run('bot', 9000);
    expect(chooseGhost(old, bot, today)!.driver).toBe('bot');
    expect(chooseGhost(old, null, today)).toEqual({ record: old, driver: 'player', older: true });
  });

  it("never draws a bot's race of other handling, and gives none with nothing kept", () => {
    expect(chooseGhost(null, run('bot', 9000, 'deadbeef'), today)).toBeNull();
    expect(chooseGhost(null, null, today)).toBeNull();
  });
});

describe('the gap to the ghost (ghostGap, M5.4b)', () => {
  const sps = config.sim.stepsPerSecond;
  const race = (splits: number[]): RaceState => ({ ...startRace(raceSteps(config.sim.race, sps)), splits });
  const ghost = { ...madeUp(), splits: [1100, 1200, 1150, 1000, 1050, 1080, 1000, 1040, 1070] };

  it('is nothing before the first sector is done', () => {
    expect(ghostGap(race([]), ghost)).toBeNull();
  });

  it('is the time to the end of the last sector done against the ghost\'s to the same sector', () => {
    expect(ghostGap(race([1090]), ghost)).toBe(-10);
    expect(ghostGap(race([1090, 1230]), ghost)).toBe(20);
    expect(ghostGap(race([1100, 1200, 1150, 990]), ghost)).toBe(-10);
  });

  it('is nothing past the sectors the ghost has, as for a ghost that did not finish', () => {
    expect(ghostGap(race([1100, 1200]), { ...ghost, splits: [1100] })).toBeNull();
  });
});

describe("the race card's ghost rows (ghostRows; the times since the check-in after M5.4)", () => {
  const sps = config.sim.stepsPerSecond;
  const today = hashHandling(config);
  const botRun = { ...madeUp(), driver: 'bot' as const, total: 8374.68 };
  const ownRun = { ...madeUp(), total: 8706.24 };
  const bot = { record: botRun, driver: 'bot' as const, older: false };
  const own = { record: ownRun, driver: 'player' as const, older: false };

  it('names the ghost by its total: the bot, or the best of the player', () => {
    expect(ghostRows(null, null, true, null, today, sps)).toEqual([]);
    expect(ghostRows(bot, null, true, null, today, sps)).toEqual([{ label: 'Bot 2:19.578', gap: null, ahead: false }]);
    expect(ghostRows(own, ownRun, true, null, today, sps)).toEqual([{ label: 'Your best 2:25.104', gap: null, ahead: false }]);
    expect(ghostRows({ ...own, older: true }, ownRun, true, null, today, sps)).toEqual([{ label: 'Your best 2:25.104 · older version', gap: null, ahead: false }]);
  });

  it("gives the player's best on a second row while the bot is still the ghost", () => {
    expect(ghostRows(bot, ownRun, true, -12, today, sps)).toEqual([
      { label: 'Bot 2:19.578', gap: '−0.200', ahead: true },
      { label: 'Your best 2:25.104', gap: null, ahead: false },
    ]);
    // A best of an older version is not given beside the bot.
    expect(ghostRows(bot, { ...ownRun, handling: 'deadbeef' }, true, null, today, sps)).toHaveLength(1);
  });

  it('says the ghost is hidden, keeping its time and the gap; never a gap against an older version', () => {
    expect(ghostRows(bot, null, false, 6, today, sps)).toEqual([{ label: 'Bot 2:19.578 (hidden)', gap: '+0.100', ahead: false }]);
    expect(ghostRows(own, ownRun, true, 30, today, sps)[0]).toEqual({ label: 'Your best 2:25.104', gap: '+0.500', ahead: false });
    expect(ghostRows({ ...own, older: true }, ownRun, true, -60, today, sps)[0]!.gap).toBeNull();
  });
});

describe("the title's times (titleTimes, the check-in after M5.4)", () => {
  const sps = config.sim.stepsPerSecond;
  const today = hashHandling(config);
  const bot = { ...madeUp(), driver: 'bot' as const, total: 8374.68 };
  const own = (total: number, handling = today): RunRecord => ({ ...madeUp(), total, handling });

  it("gives the bot's time until it is beaten, and the player's best until it is bettered", () => {
    expect(titleTimes(null, null, today, sps)).toBeNull();
    expect(titleTimes(null, bot, today, sps)).toBe('Bot 2:19.578');
    expect(titleTimes(own(8706.24), bot, today, sps)).toBe('Bot 2:19.578 · Your best 2:25.104');
    expect(titleTimes(own(8300), bot, today, sps)).toBe('Your best 2:18.333');
    expect(titleTimes(own(8300), null, today, sps)).toBe('Your best 2:18.333');
  });

  it("leaves out a best of an older version and a bot's race of other handling", () => {
    expect(titleTimes(own(8000, 'deadbeef'), bot, today, sps)).toBe('Bot 2:19.578');
    expect(titleTimes(null, { ...bot, handling: 'deadbeef' }, today, sps)).toBeNull();
  });
});

describe('saving a personal best (saveVerdict, M5.4a)', () => {
  const today = hashHandling(config);
  const sps = config.sim.stepsPerSecond;
  const run = (driver: 'player' | 'bot', total: number, handling = today): RunRecord => ({ ...madeUp(), driver, total, handling });
  const base = { tuned: false, kept: true, own: null, bot: null, today };

  it('saves a first race, and says so', () => {
    expect(saveVerdict(9000, base, sps)).toEqual({ save: true, line: 'New best, ghost saved' });
  });

  it("saves a race faster than the player's best, and not one as fast or slower, giving the best", () => {
    const own = run('player', 9000);
    expect(saveVerdict(8999, { ...base, own }, sps)).toEqual({ save: true, line: 'New best, ghost saved' });
    expect(saveVerdict(9000, { ...base, own }, sps)).toEqual({ save: false, line: 'Not saved: slower than your best 2:30.000' });
    expect(saveVerdict(9600, { ...base, own }, sps).save).toBe(false);
  });

  it("saves any race over a best from an older version, which is not the time to beat", () => {
    expect(saveVerdict(12000, { ...base, own: run('player', 9000, 'deadbeef') }, sps)).toEqual({ save: true, line: 'New best, ghost saved' });
  });

  it("says whether the new best takes the ghost from the bot, or the bot stays the ghost to beat", () => {
    const bot = run('bot', 9000);
    expect(saveVerdict(8990, { ...base, bot }, sps)).toEqual({ save: true, line: "New best: your ghost replaces the bot's" });
    expect(saveVerdict(9500, { ...base, bot }, sps)).toEqual({ save: true, line: "New best. The bot's 2:30.000 is still the ghost to beat" });
    expect(saveVerdict(9000, { ...base, bot }, sps).line).toBe("New best. The bot's 2:30.000 is still the ghost to beat");
    // Already faster than the bot: the player's ghost was the one to beat.
    expect(saveVerdict(8000, { ...base, bot, own: run('player', 8500) }, sps)).toEqual({ save: true, line: 'New best, ghost saved' });
    // Slower than the bot, faster than the player's last: kept as the best, the bot still the ghost.
    expect(saveVerdict(9200, { ...base, bot, own: run('player', 9400) }, sps)).toEqual({ save: true, line: "New best. The bot's 2:30.000 is still the ghost to beat" });
  });

  it('never saves a race in which the car was tuned', () => {
    expect(saveVerdict(1000, { ...base, tuned: true }, sps)).toEqual({ save: false, line: 'Not saved: the car was tuned' });
  });

  it('keeps a best for the page but says it is not saved when the browser keeps no data', () => {
    expect(saveVerdict(9000, { ...base, kept: false }, sps)).toEqual({ save: true, line: 'Not saved: this browser keeps no data' });
    expect(saveVerdict(9000, { ...base, kept: false, tuned: true }, sps).line).toBe('Not saved: the car was tuned');
  });
});
