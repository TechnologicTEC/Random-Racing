import { describe, expect, it } from 'vitest';
import { choosePage, nextCamera, openingCamera, openingScreen, switchAddress } from './route';

const page = (query: string) => choosePage(new URLSearchParams(query));
const BASE = 'http://127.0.0.1:5173/';

describe('choosePage: which page an address opens', () => {
  it('opens the 3D view by default, with or without a seed or 3D options', () => {
    for (const query of ['', '?seed=5', '?seed=5&cam=orbit&time=13:00', '?view=3d&seed=5', '?quality=low']) {
      expect(page(query), query).toEqual({ kind: 'world' });
    }
  });

  it('keeps ?view=3d on the 3D view even beside sheet options, as before', () => {
    expect(page('?view=3d&sheet=20')).toEqual({ kind: 'world' });
    expect(page('?view=3d&seeds=5,99')).toEqual({ kind: 'world' });
  });

  it('opens the lab with lab=1, and for options only the lab understands', () => {
    for (const query of ['?lab=1', '?lab=1&seed=5', '?seed=5&candidate=7', '?minRadius=30', '?seed=9&gapWidths=4']) {
      expect(page(query), query).toEqual({ kind: 'lab' });
    }
  });

  it('opens a contact sheet of a run of seeds', () => {
    expect(page('?sheet=20&from=7')).toEqual({ kind: 'sheet', seeds: Array.from({ length: 20 }, (_, i) => 7 + i), run: { from: 7, count: 20 } });
    expect(page('?sheet=3')).toEqual({ kind: 'sheet', seeds: [1, 2, 3], run: { from: 1, count: 3 } });
    expect(page('?sheet=3&from=-3')).toEqual({ kind: 'sheet', seeds: [1, 2, 3], run: { from: 1, count: 3 } });
    expect(page('?sheet=3&from=0')).toEqual({ kind: 'sheet', seeds: [0, 1, 2], run: { from: 0, count: 3 } });
  });

  it('holds a run to 100 seeds', () => {
    const sheet = page('?sheet=500');
    expect(sheet.kind).toBe('sheet');
    if (sheet.kind === 'sheet') expect(sheet.seeds).toHaveLength(100);
  });

  it('opens a contact sheet of chosen seeds, reading share codes too, before anything but view=3d', () => {
    expect(page('?seeds=5,99,v0-31337')).toEqual({ kind: 'sheet', seeds: [5, 99, 31337], run: null });
    expect(page('?lab=1&seeds=5')).toEqual({ kind: 'sheet', seeds: [5], run: null });
    expect(page('?sheet=20&seeds=5')).toEqual({ kind: 'sheet', seeds: [5], run: null });
  });

  it('ignores a seed list or a sheet size that holds nothing usable', () => {
    expect(page('?seeds=junk')).toEqual({ kind: 'world' });
    expect(page('?sheet=0')).toEqual({ kind: 'world' });
    expect(page('?sheet=junk&lab=1')).toEqual({ kind: 'lab' });
  });
});

describe('switchAddress: where the L key goes', () => {
  it('goes from the 3D view to the lab on the same seed, keeping the 3D options', () => {
    const next = new URL(switchAddress(`${BASE}?seed=42&cam=orbit&time=13:00`, 'lab'));
    expect(next.searchParams.get('lab')).toBe('1');
    expect(next.searchParams.get('seed')).toBe('42');
    expect(next.searchParams.get('cam')).toBe('orbit');
    expect(next.searchParams.get('time')).toBe('13:00');
    expect(choosePage(next.searchParams)).toEqual({ kind: 'lab' });
  });

  it('leaves view=3d behind on the way to the lab, or the lab would not open', () => {
    const next = new URL(switchAddress(`${BASE}?view=3d&seed=42`, 'lab'));
    expect(next.searchParams.has('view')).toBe(false);
    expect(choosePage(next.searchParams)).toEqual({ kind: 'lab' });
  });

  it('goes from the lab to the 3D view on the same seed, dropping what only the lab understands', () => {
    const next = new URL(switchAddress(`${BASE}?lab=1&seed=48213&candidate=7&minRadius=30&gapWidths=4&cam=orbit`, 'world'));
    expect([...next.searchParams.keys()].sort()).toEqual(['cam', 'seed']);
    expect(next.searchParams.get('seed')).toBe('48213');
    expect(choosePage(next.searchParams)).toEqual({ kind: 'world' });
  });

  it('comes back to the page it started on', () => {
    const start = `${BASE}?seed=7&still=1`;
    const there = switchAddress(start, 'lab');
    const back = new URL(switchAddress(there, 'world'));
    expect(choosePage(back.searchParams)).toEqual({ kind: 'world' });
    expect(back.searchParams.get('seed')).toBe('7');
    expect(back.searchParams.get('still')).toBe('1');
  });

  it('keeps the path, so the game still works when served from a folder', () => {
    expect(new URL(switchAddress('http://example.com/racing/?seed=3', 'lab')).pathname).toBe('/racing/');
  });
});

describe('openingCamera: which camera the 3D view opens with', () => {
  const camera = (query: string) => openingCamera(new URLSearchParams(query));

  it('flies the lap for cam=fly, and circles for cam=orbit', () => {
    expect(camera('?seed=5&cam=fly')).toBe('fly');
    expect(camera('?seed=5&cam=orbit')).toBe('orbit');
  });

  it('flies the lap when a point of the lap is asked for, whatever else', () => {
    expect(camera('?seed=5&lap=0.3')).toBe('fly');
    expect(camera('?seed=5&still=1&lap=0')).toBe('fly');
  });

  it('drives at the plain address, and for cam=chase', () => {
    expect(camera('')).toBe('chase');
    expect(camera('?seed=5&still=1')).toBe('chase');
    expect(camera('?seed=5&cam=chase')).toBe('chase');
    expect(camera('?seed=5&cam=nonsense')).toBe('chase');
  });
});

describe('openingScreen: what the 3D view opens on (M4.4)', () => {
  const screen = (query: string) => openingScreen(new URLSearchParams(query));

  it('races straight away for mode=race', () => {
    expect(screen('?seed=7&mode=race')).toBe('race');
    expect(screen('?seed=7&still=1&mode=race')).toBe('race');
  });

  it('drives freely for mode=free', () => {
    expect(screen('?seed=7&mode=free')).toBe('free');
    expect(screen('?seed=7&still=1&mode=free')).toBe('free');
  });

  it('drives freely for an address that asks for a camera or a place, so its picture is as it was', () => {
    for (const query of ['?seed=7&cam=fly', '?seed=7&cam=orbit', '?seed=7&cam=chase', '?seed=7&lap=0.3', '?seed=7&look=start', '?seed=7&at=10,20']) {
      expect(screen(query), query).toBe('free');
    }
  });

  it('opens on the title card at the plain address, or with a seed and nothing else (Tane, M4.0)', () => {
    expect(screen('')).toBe('title');
    expect(screen('?seed=7')).toBe('title');
    expect(screen('?seed=7&still=1&time=07:30')).toBe('title');
    expect(screen('?seed=7&mode=nonsense')).toBe('title');
  });
});

describe('nextCamera: what C changes to', () => {
  it('goes driving, flying, circling, and back to driving', () => {
    expect(nextCamera('chase')).toBe('fly');
    expect(nextCamera('fly')).toBe('orbit');
    expect(nextCamera('orbit')).toBe('chase');
  });
});
