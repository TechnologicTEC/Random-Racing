import './lab.css';
import { config, GENERATOR_VERSION } from '../../config';
import { MAX_SEED } from '../../core/seedCode';
import { generateTrack } from '../../gen';
import { drawThumbnail } from './draw';
import { fitView } from './view';

const THUMB = 232;

/**
 * A grid of winning tracks for a run of seeds, for judging variety at a
 * glance. Opened with ?sheet=20 (and optionally &from=1).
 */
export function mountContactSheet(root: HTMLElement, from: number, count: number): void {
  const cfg = config.track;
  root.innerHTML = `
    <div class="sheet">
      <header class="sheet-head">
        <div>
          <h1 class="lab-title">Seed Circuit contact sheet</h1>
          <p class="lab-sub" data-ref="range"></p>
        </div>
        <nav class="lab-row sheet-nav">
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
  ref('range').textContent = `Seeds ${from} to ${from + count - 1}, generator v${GENERATOR_VERSION}. Click a track to open it in the lab.`;

  const dpr = window.devicePixelRatio || 1;
  const view = fitView(THUMB, THUMB, cfg.buildableRadius, 6);
  let done = 0;

  // One track per frame keeps the page responsive while the sheet fills in.
  const addNext = (): void => {
    if (done >= count) {
      document.body.dataset.labReady = 'true';
      return;
    }
    const seed = from + done;
    const result = generateTrack(seed, cfg);
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
      drawThumbnail(ctx, view, winner, cfg);
    }
    const caption = document.createElement('span');
    caption.className = 'sheet-caption';
    const score = winner.score ? Math.round(winner.score.total * 100) : 0;
    caption.textContent = `${seed} · ${result.name} · ${result.style} · ${Math.round(winner.line.length)} m · ${score}${result.fallback ? ' · fallback' : ''}`;
    card.append(canvas, caption);
    grid.append(card);

    done++;
    requestAnimationFrame(addNext);
  };
  requestAnimationFrame(addNext);
}
