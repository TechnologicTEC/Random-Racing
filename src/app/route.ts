import { parseSeedInput } from '../core/seedCode';

/** The pages the game can show. */
export type Page =
  | { kind: 'world' }
  | { kind: 'lab' }
  /** A contact sheet: a run of seeds (`run` set), or a chosen list (`run` null). */
  | { kind: 'sheet'; seeds: number[]; run: { from: number; count: number } | null };

/** The most seeds one contact sheet shows. */
const SHEET_MOST = 100;

/** Address options only the lab understands: an address with one of them opens the lab, so links from before step 16 still work. */
const LAB_ONLY = ['candidate', 'minRadius', 'gapWidths'] as const;

/**
 * Which page an address opens. The 3D view is the default; `?lab=1` opens the
 * track lab, `?sheet=20&from=1` and `?seeds=5,99` contact sheets. `?view=3d`,
 * from before the 3D view was the default, still opens it whatever else is asked.
 */
export function choosePage(params: URLSearchParams): Page {
  if (params.get('view') === '3d') return { kind: 'world' };
  const listed = (params.get('seeds') ?? '')
    .split(',')
    .map((text) => parseSeedInput(text)?.seed)
    .filter((seed): seed is number => seed !== undefined)
    .slice(0, SHEET_MOST);
  if (listed.length > 0) return { kind: 'sheet', seeds: listed, run: null };
  const sheet = Number(params.get('sheet'));
  if (Number.isInteger(sheet) && sheet > 0) {
    const asked = Number(params.get('from') ?? '1');
    const from = Number.isInteger(asked) && asked >= 0 ? asked : 1;
    const count = Math.min(sheet, SHEET_MOST);
    return { kind: 'sheet', seeds: Array.from({ length: count }, (_, i) => from + i), run: { from, count } };
  }
  if (params.get('lab') === '1' || LAB_ONLY.some((name) => params.has(name))) return { kind: 'lab' };
  return { kind: 'world' };
}

/** The cameras of the 3D view: behind the car while driving, flying the lap, or circling a point. */
export type CameraMode = 'chase' | 'fly' | 'orbit';

/**
 * Which camera the 3D view opens with: `cam=orbit` circles the island;
 * `cam=fly`, or a point of the lap (`lap=0.3`), flies the lap; anything else,
 * the plain address and `cam=chase` among them, drives. A close view (`look=`,
 * `at=`) is chosen once the island is in, and circles.
 */
export function openingCamera(params: URLSearchParams): CameraMode {
  if (params.get('cam') === 'orbit') return 'orbit';
  if (params.get('cam') === 'fly' || params.has('lap')) return 'fly';
  return 'chase';
}

/** What the 3D view opens on (M4.4): the title card, free driving, or a race. */
export type OpeningScreen = 'title' | 'free' | 'race';

/** Options that ask for a camera or a place: an address with one of them opens free, so its picture is as it was. */
const VIEW_OPTIONS = ['cam', 'lap', 'look', 'at'] as const;

/**
 * What the 3D view opens on: `mode=race` races at once, `mode=free` drives freely with no clock, and so does an
 * address that asks for a camera or a place (`cam=`, `lap=`, `look=`, `at=`). For now every other address drives
 * freely too; M4.4c gives the plain address the title card.
 */
export function openingScreen(params: URLSearchParams): OpeningScreen {
  if (params.get('mode') === 'race') return 'race';
  if (params.get('mode') === 'free' || VIEW_OPTIONS.some((name) => params.has(name))) return 'free';
  return 'free';
}

/** The camera C changes to: driving, flying, circling, and back to driving. */
export function nextCamera(mode: CameraMode): CameraMode {
  return mode === 'chase' ? 'fly' : mode === 'fly' ? 'orbit' : 'chase';
}

/**
 * The address the L key goes to: the same seed on the other page. The 3D
 * view's options are kept both ways, so coming back finds them again; the
 * lab's own options are left behind, or the address would open the lab again.
 */
export function switchAddress(href: string, to: 'world' | 'lab'): string {
  const url = new URL(href);
  url.searchParams.delete('view');
  if (to === 'lab') {
    url.searchParams.set('lab', '1');
  } else {
    url.searchParams.delete('lab');
    for (const name of LAB_ONLY) url.searchParams.delete(name);
  }
  return url.toString();
}
