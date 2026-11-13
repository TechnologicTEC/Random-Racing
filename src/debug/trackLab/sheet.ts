import './lab.css';
import { config, GENERATOR_VERSION, type GameConfig } from '../../config';
import { MAX_SEED } from '../../core/seedCode';
import { trackRulesFor, type TrackResult, type WorldResult } from '../../gen';
import { genClient } from '../../worker/client';
import { drawThumbnail } from './draw';
import { shortCharacter, summariseTracks } from './format';
import { terrainPicture } from './terrainImage';
import { fitView } from './view';

const THUMB = 232;

/**
 * A grid of winning tracks, for judging variety at a glance.
 * Opened with ?sheet=20 (optionally &from=1) for a run of seeds, or with
 * ?sheet=1&seeds=5,99,31337 for a chosen list.
 */
export function mountContactSheet(root: HTMLElement, seeds: readonly number[], run: { from: number; count: number } | null): void {
  const count = seeds.length;
  const from = run?.from ?? 0;
  const cfg = config.track;
  root.innerHTML = `
    <div class="sheet">
      <header class="sheet-head">
        <div>
          <h1 class="lab-title">Seed Circuit contact sheet</h1>
          <p class="lab-sub" data-ref="range"></p>
          <p class="lab-sub" data-ref="summary" data-testid="sheet-summary"></p>
        </div>
        <nav class="lab-row sheet-nav" data-ref="nav">
          <button type="button" data-ref="prev">Previous ${count}</button>
          <button type="button" data-ref="next">Next ${count}</button>
          <button type="button" data-ref="random">Random start</button>
        </nav>
      </header>
      <div class="sheet-grid" data-ref="grid" data-testid="sheet-grid"></div>
    </div>`;
  const ref = (name: string): HTMLElement => root.querySelector<HTMLElement>(`[data-ref="${name}"]`)!;
  const grid = ref('grid');

  const go = (start: number): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('from', String(Math.min(MAX_SEED, Math.max(0, start))));
    window.location.href = url.toString();
  };
  ref('prev').addEventListener('click', () => go(from - count));
  ref('next').addEventListener('click', () => go(from + count));
  ref('random').addEventListener('click', () => go(1 + Math.floor(Math.random() * 99000)));
  const which = run ? `Seeds ${from} to ${from + count - 1}` : `${count} chosen seeds`;
  ref('range').textContent = `${which}, generator v${GENERATOR_VERSION}. Click a track to open it in the lab.`;
  if (!run) ref('nav').remove();

  const dpr = window.devicePixelRatio || 1;
  // Framed to hold the whole tile, so the whole island shows: a mountain seed's massif can reach well beyond the hinterland.
  const islandRadius = config.world.tile.extent / 2;
  const view = fitView(THUMB, THUMB, islandRadius, 6);
  // Thumbnails are small, so their islands are built on a coarse grid: 16 times fewer heights, and as many times quicker.
  const sheetConfig: GameConfig = { ...config, world: { ...config.world, tile: { ...config.world.tile, cell: 8 } } };

  const addCard = (seed: number, world: WorldResult): void => {
    const result = world.track;
    const winner = result.candidates[result.winnerIndex]!;

    const card = document.createElement('a');
    card.className = 'sheet-card';
    card.href = `?seed=${seed}`;
    card.dataset.testid = 'sheet-card';
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(THUMB * dpr);
    canvas.height = Math.round(THUMB * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Four pixels per sample of the coarse grid, so coastlines are smooth even at this size.
      drawThumbnail(ctx, view, winner, trackRulesFor(cfg, result.character.relief), terrainPicture(world.ground, null, 4), world.road.width);
    }
    const caption = document.createElement('span');
    caption.className = 'sheet-caption';
    const score = winner.score ? Math.round(winner.score.total * 100) : 0;
    caption.textContent = `${seed} · ${result.name} · ${result.style} · ${shortCharacter(result.character)} · ${Math.round(winner.line.length)} m · ${score}${result.fallback ? ' · fallback' : ''}`;
    card.append(canvas, caption);
    grid.append(card);
  };

  // Tracks are generated in the worker, so the page stays responsive while the sheet fills in.
  const fill = async (): Promise<void> => {
    const results: TrackResult[] = [];
    const pending = seeds.map((seed) => genClient().world(seed, sheetConfig));
    for (let i = 0; i < count; i++) {
      const { result } = await pending[i]!;
      results.push(result.track);
      addCard(seeds[i]!, result);
    }
    ref('summary').textContent = summariseTracks(results);
    document.body.dataset.labReady = 'true';
  };
  void fill().catch((error: unknown) => {
    ref('summary').textContent = error instanceof Error ? error.message : String(error);
  });
}
