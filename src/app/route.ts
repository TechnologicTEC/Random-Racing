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
