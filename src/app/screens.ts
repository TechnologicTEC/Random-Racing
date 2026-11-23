/**
 * The screens of the 3D page as a pure state machine (M4.4): the title, a new island loading, a race (its countdown
 * and laps), free driving, paused, and the results. Every move between them is named, and a move a screen does not
 * allow gives null, so the page can never end up somewhere it should not be (no pause on the results, say). The page
 * shows the screen the machine is in; this file knows nothing of the page.
 */

/** What the car is being driven for: a race, or freely with no clock. */
export type DriveKind = 'race' | 'free';

export type Screen =
  | { name: 'title' }
  /** A new island on its way from the worker. It comes in on the title card (Tane, M4.0: the plain address and N open it). */
  | { name: 'loading' }
  | { name: 'race' }
  | { name: 'free' }
  /** Paused, with what it paused to go back to. */
  | { name: 'paused'; from: DriveKind }
  | { name: 'results' };

export type Move = 'start' | 'freeDrive' | 'pause' | 'resume' | 'restart' | 'quit' | 'newTrack' | 'enterSeed' | 'loaded' | 'finished';

/** Every move, in a fixed order. */
export const MOVES: readonly Move[] = ['start', 'freeDrive', 'pause', 'resume', 'restart', 'quit', 'newTrack', 'enterSeed', 'loaded', 'finished'];

const TITLE: Screen = { name: 'title' };
const LOADING: Screen = { name: 'loading' };
const RACE: Screen = { name: 'race' };
const FREE: Screen = { name: 'free' };

/** The screen a move leads to, or null if this screen does not allow it. */
export function move(screen: Screen, m: Move): Screen | null {
  switch (screen.name) {
    case 'title':
      if (m === 'start') return RACE;
      if (m === 'freeDrive') return FREE;
      if (m === 'newTrack' || m === 'enterSeed') return LOADING;
      return null;
    case 'loading':
      if (m === 'loaded') return TITLE;
      // Another island asked for while one is on its way: that one is shown instead.
      if (m === 'newTrack' || m === 'enterSeed') return LOADING;
      return null;
    case 'race':
      if (m === 'pause') return { name: 'paused', from: 'race' };
      if (m === 'restart') return RACE;
      if (m === 'finished') return { name: 'results' };
      return null;
    case 'free':
      if (m === 'pause') return { name: 'paused', from: 'free' };
      if (m === 'restart') return FREE;
      if (m === 'newTrack') return LOADING;
      return null;
    case 'paused':
      if (m === 'resume' || m === 'restart') return screen.from === 'race' ? RACE : FREE;
      if (m === 'quit') return TITLE;
      return null;
    case 'results':
      if (m === 'restart') return RACE;
      if (m === 'newTrack') return LOADING;
      if (m === 'quit') return TITLE;
      return null;
  }
}

/** Whether the simulation takes steps on this screen: only while the car is driven. Paused takes none and records nothing. */
export function steps(screen: Screen): boolean {
  return screen.name === 'race' || screen.name === 'free';
}

/** Whether C (and the controller's Y) may change the camera: only in free driving. In a race the race is driven, not watched. */
export function cameraFree(screen: Screen): boolean {
  return screen.name === 'free';
}

/** What Esc and the controller's B do on a screen: pause the driving, resume from the pause, leave the results. */
export function backMove(screen: Screen): Move | null {
  if (screen.name === 'race' || screen.name === 'free') return 'pause';
  if (screen.name === 'paused') return 'resume';
  if (screen.name === 'results') return 'quit';
  return null;
}

/** One choice on a menu card: what it says, and the move it makes. */
export interface Choice {
  label: string;
  move: Move;
}

/** The choices on a screen's card, in order; none while driving or loading. */
export function menuFor(screen: Screen): Choice[] {
  switch (screen.name) {
    case 'title':
      return [
        { label: 'Race', move: 'start' },
        { label: 'Free drive', move: 'freeDrive' },
        { label: 'New island', move: 'newTrack' },
      ];
    case 'paused':
      return [
        { label: 'Resume', move: 'resume' },
        { label: 'Restart', move: 'restart' },
        { label: 'Quit to title', move: 'quit' },
      ];
    case 'results':
      return [
        { label: 'Race again', move: 'restart' },
        { label: 'New island', move: 'newTrack' },
        { label: 'Title', move: 'quit' },
      ];
    default:
      return [];
  }
}

/** The choice `step` places on from `index` (1 down, -1 up) among `count`, round from the last to the first and back. */
export function choiceAfter(index: number, count: number, step: 1 | -1): number {
  if (count <= 0) return 0;
  return (((index + step) % count) + count) % count;
}
