import { describe, expect, it } from 'vitest';
import { backMove, cameraFree, choiceAfter, menuFor, MOVES, move, steps, type Move, type Screen } from './screens';

const TITLE: Screen = { name: 'title' };
const RACE: Screen = { name: 'race' };
const FREE: Screen = { name: 'free' };
const RESULTS: Screen = { name: 'results' };
const pausedFrom = (from: 'race' | 'free'): Screen => ({ name: 'paused', from });
const LOADING: Screen = { name: 'loading' };
/** A favourite's island being built, to race once it is in (M5.5). */
const LOADING_TO_RACE: Screen = { name: 'loading', then: 'race' };
const FAVOURITES: Screen = { name: 'favourites' };

/**
 * Every move from every screen (M4.4): what it leads to, null where it is not allowed. A move left out of a screen's
 * row is not allowed there.
 */
const TABLE: Array<[string, Screen, Partial<Record<Move, Screen>>]> = [
  ['the title', TITLE, { start: RACE, freeDrive: FREE, favourites: FAVOURITES, newTrack: LOADING, enterSeed: LOADING }],
  // Tane, M4.0: the plain address and N open the title card, so a new island always comes in on it.
  ['loading', LOADING, { loaded: TITLE, newTrack: LOADING, enterSeed: LOADING }],
  // A favourite of another island (M5.5): built, then raced at once. Esc while it builds lands on the title instead,
  // and another island asked for is shown on the title as usual.
  ['loading to race', LOADING_TO_RACE, { loaded: RACE, quit: LOADING, newTrack: LOADING, enterSeed: LOADING }],
  // Tane, M5.0: Favourites is its own card. Racing the island shown starts at once; another island is built first.
  ['the favourites', FAVOURITES, { start: RACE, raceSeed: LOADING_TO_RACE, quit: TITLE }],
  ['the race', RACE, { pause: pausedFrom('race'), restart: RACE, finished: RESULTS }],
  ['free driving', FREE, { pause: pausedFrom('free'), restart: FREE, newTrack: LOADING }],
  // The star stays on the card it was pressed on.
  ['paused in a race', pausedFrom('race'), { resume: RACE, restart: RACE, star: pausedFrom('race'), quit: TITLE }],
  ['paused in free driving', pausedFrom('free'), { resume: FREE, restart: FREE, star: pausedFrom('free'), quit: TITLE }],
  ['the results', RESULTS, { restart: RACE, star: RESULTS, newTrack: LOADING, quit: TITLE }],
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
    expect([...MOVES].sort()).toEqual(
      ['enterSeed', 'favourites', 'finished', 'freeDrive', 'loaded', 'newTrack', 'pause', 'quit', 'raceSeed', 'restart', 'resume', 'star', 'start'].sort(),
    );
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
    for (const screen of [TITLE, LOADING, LOADING_TO_RACE, FAVOURITES, pausedFrom('race'), pausedFrom('free'), RESULTS]) expect(steps(screen)).toBe(false);
  });

  it('lets C change the camera only while driving freely: in a race it does nothing', () => {
    expect(cameraFree(FREE)).toBe(true);
    for (const screen of [TITLE, RACE, FAVOURITES, pausedFrom('race'), RESULTS]) expect(cameraFree(screen)).toBe(false);
  });

  it('gives Esc (and the controller’s B) a move on each screen', () => {
    expect(backMove(RACE)).toBe('pause');
    expect(backMove(FREE)).toBe('pause');
    expect(backMove(pausedFrom('race'))).toBe('resume');
    expect(backMove(RESULTS)).toBe('quit');
    expect(backMove(TITLE)).toBeNull();
    expect(backMove(LOADING)).toBeNull();
  });

  it('takes Esc back to the title from the favourites, and from a favourite being built to race', () => {
    expect(backMove(FAVOURITES)).toBe('quit');
    expect(backMove(LOADING_TO_RACE)).toBe('quit');
  });
});

describe('the menus', () => {
  it('offers Race, Free drive, Favourites and a new island on the title', () => {
    expect(menuFor(TITLE)).toEqual([
      { label: 'Race', move: 'start' },
      { label: 'Free drive', move: 'freeDrive' },
      { label: 'Favourites', move: 'favourites' },
      { label: 'New island', move: 'newTrack' },
    ]);
  });

  it('offers to resume, restart, star the island or go back to the title when paused', () => {
    for (const from of ['race', 'free'] as const) {
      expect(menuFor(pausedFrom(from))).toEqual([
        { label: 'Resume', move: 'resume' },
        { label: 'Restart', move: 'restart' },
        { label: '☆ Favourite', move: 'star' },
        { label: 'Quit to title', move: 'quit' },
      ]);
    }
  });

  it('offers to race again, star the island, a new island or the title on the results', () => {
    expect(menuFor(RESULTS)).toEqual([
      { label: 'Race again', move: 'restart' },
      { label: '☆ Favourite', move: 'star' },
      { label: 'New island', move: 'newTrack' },
      { label: 'Title', move: 'quit' },
    ]);
  });

  it('fills the star once the island is a favourite', () => {
    expect(menuFor(RESULTS, true)[1]).toEqual({ label: '★ Favourite', move: 'star' });
    expect(menuFor(pausedFrom('race'), true)[2]).toEqual({ label: '★ Favourite', move: 'star' });
    expect(menuFor(TITLE, true)).toEqual(menuFor(TITLE));
  });

  it('has no menu of choices while driving or loading, nor on the favourites (that card lists the favourites)', () => {
    for (const screen of [RACE, FREE, LOADING, LOADING_TO_RACE, FAVOURITES]) expect(menuFor(screen)).toEqual([]);
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
