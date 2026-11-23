import { describe, expect, it } from 'vitest';
import { backMove, cameraFree, choiceAfter, menuFor, MOVES, move, steps, type Move, type Screen } from './screens';

const TITLE: Screen = { name: 'title' };
const RACE: Screen = { name: 'race' };
const FREE: Screen = { name: 'free' };
const RESULTS: Screen = { name: 'results' };
const pausedFrom = (from: 'race' | 'free'): Screen => ({ name: 'paused', from });
const LOADING: Screen = { name: 'loading' };

/**
 * Every move from every screen (M4.4): what it leads to, null where it is not allowed. A move left out of a screen's
 * row is not allowed there.
 */
const TABLE: Array<[string, Screen, Partial<Record<Move, Screen>>]> = [
  ['the title', TITLE, { start: RACE, freeDrive: FREE, newTrack: LOADING, enterSeed: LOADING }],
  // Tane, M4.0: the plain address and N open the title card, so a new island always comes in on it.
  ['loading', LOADING, { loaded: TITLE, newTrack: LOADING, enterSeed: LOADING }],
  ['the race', RACE, { pause: pausedFrom('race'), restart: RACE, finished: RESULTS }],
  ['free driving', FREE, { pause: pausedFrom('free'), restart: FREE, newTrack: LOADING }],
  ['paused in a race', pausedFrom('race'), { resume: RACE, restart: RACE, quit: TITLE }],
  ['paused in free driving', pausedFrom('free'), { resume: FREE, restart: FREE, quit: TITLE }],
  ['the results', RESULTS, { restart: RACE, newTrack: LOADING, quit: TITLE }],
];

describe('move: the screens and the moves between them', () => {
  for (const [name, screen, allowed] of TABLE) {
    for (const m of MOVES) {
      const expected = allowed[m] ?? null;
      it(`${name}: ${m} ${expected ? `leads to ${expected.name}` : 'is not allowed'}`, () => {
        expect(move(screen, m)).toEqual(expected);
      });
    }
  }

  it('names every move', () => {
    expect([...MOVES].sort()).toEqual(['enterSeed', 'finished', 'freeDrive', 'loaded', 'newTrack', 'pause', 'quit', 'restart', 'resume', 'start'].sort());
  });

  it('never pauses the results, nor finishes anything but a race', () => {
    expect(move(RESULTS, 'pause')).toBeNull();
    for (const screen of [TITLE, FREE, pausedFrom('race'), RESULTS]) expect(move(screen, 'finished')).toBeNull();
  });
});

describe('what each screen does', () => {
  it('takes steps only while racing or driving freely', () => {
    expect(steps(RACE)).toBe(true);
    expect(steps(FREE)).toBe(true);
    for (const screen of [TITLE, LOADING, pausedFrom('race'), pausedFrom('free'), RESULTS]) expect(steps(screen)).toBe(false);
  });

  it('lets C change the camera only while driving freely: in a race it does nothing', () => {
    expect(cameraFree(FREE)).toBe(true);
    for (const screen of [TITLE, RACE, pausedFrom('race'), RESULTS]) expect(cameraFree(screen)).toBe(false);
  });

  it('gives Esc (and the controller’s B) a move on each screen', () => {
    expect(backMove(RACE)).toBe('pause');
    expect(backMove(FREE)).toBe('pause');
    expect(backMove(pausedFrom('race'))).toBe('resume');
    expect(backMove(RESULTS)).toBe('quit');
    expect(backMove(TITLE)).toBeNull();
    expect(backMove(LOADING)).toBeNull();
  });
});

describe('the menus', () => {
  it('offers Race, Free drive and a new island on the title', () => {
    expect(menuFor(TITLE)).toEqual([
      { label: 'Race', move: 'start' },
      { label: 'Free drive', move: 'freeDrive' },
      { label: 'New island', move: 'newTrack' },
    ]);
  });

  it('offers to resume, restart or go back to the title when paused', () => {
    expect(menuFor(pausedFrom('race'))).toEqual([
      { label: 'Resume', move: 'resume' },
      { label: 'Restart', move: 'restart' },
      { label: 'Quit to title', move: 'quit' },
    ]);
  });

  it('offers to race again, a new island or the title on the results', () => {
    expect(menuFor(RESULTS)).toEqual([
      { label: 'Race again', move: 'restart' },
      { label: 'New island', move: 'newTrack' },
      { label: 'Title', move: 'quit' },
    ]);
  });

  it('has no menu while driving or loading', () => {
    for (const screen of [RACE, FREE, LOADING]) expect(menuFor(screen)).toEqual([]);
  });

  it('offers only moves the screen allows', () => {
    for (const [, screen] of TABLE) for (const choice of menuFor(screen)) expect(move(screen, choice.move), choice.label).not.toBeNull();
  });

  it('moves the choice up and down, round from the last to the first', () => {
    expect(choiceAfter(0, 3, 1)).toBe(1);
    expect(choiceAfter(2, 3, 1)).toBe(0);
    expect(choiceAfter(0, 3, -1)).toBe(2);
    expect(choiceAfter(1, 3, -1)).toBe(0);
    expect(choiceAfter(0, 0, 1)).toBe(0);
  });
});
