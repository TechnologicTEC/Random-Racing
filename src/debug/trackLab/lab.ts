import './lab.css';
import { config, GENERATOR_VERSION } from '../../config';
import { createRng } from '../../core/rng';
import { formatSeedCode, MAX_SEED, parseSeedInput } from '../../core/seedCode';
import { generateControlPoints } from '../../gen/track/layout';
import { sampleClosedSpline } from '../../gen/track/spline';
import { drawLab, type LabScene } from './draw';
import { fitView, panBy, zoomAt, type View } from './view';

const TEMPLATE = `
  <div class="lab">
    <aside class="lab-side">
      <header>
        <h1 class="lab-title">Seed Circuit track lab</h1>
        <p class="lab-sub">Generator v${GENERATOR_VERSION}</p>
      </header>

      <section class="lab-section">
        <h2>Seed</h2>
        <form class="lab-seed-form" data-ref="form">
          <input data-ref="input" data-testid="seed-input" inputmode="numeric" autocomplete="off"
            spellcheck="false" aria-label="Seed or share code" />
          <button type="submit" class="primary">Go</button>
        </form>
        <p class="lab-error" data-ref="error" data-testid="seed-error" role="alert"></p>
        <div class="lab-row">
          <button type="button" data-ref="prev" data-testid="seed-prev">Previous</button>
          <button type="button" data-ref="next" data-testid="seed-next">Next</button>
          <button type="button" data-ref="random" data-testid="seed-random">Random</button>
        </div>
      </section>

      <section class="lab-section">
        <h2>Track</h2>
        <dl class="lab-facts" data-ref="facts" data-testid="facts"></dl>
      </section>

      <p class="lab-hint">Drag to pan, scroll to zoom, double-click to fit. Arrow keys step through seeds, N picks a random one.</p>
    </aside>
    <main class="lab-stage">
      <canvas data-ref="canvas" data-testid="track-canvas"></canvas>
    </main>
  </div>
`;

/** Builds the track lab inside the given element. */
export function mountTrackLab(root: HTMLElement): void {
  root.innerHTML = TEMPLATE;
  const ref = <T extends HTMLElement>(name: string): T => {
    const el = root.querySelector<T>(`[data-ref="${name}"]`);
    if (!el) throw new Error(`Track lab template is missing "${name}"`);
    return el;
  };
  const canvas = ref<HTMLCanvasElement>('canvas');
  const input = ref<HTMLInputElement>('input');
  const errorEl = ref('error');
  const factsEl = ref('facts');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw to a 2D canvas');

  const cfg = config.track;
  let seed = 0;
  let scene: LabScene | null = null;
  let view: View = fitView(1, 1, cfg.buildableRadius, 24);
  let fitted = true;

  function render(): void {
    const dpr = window.devicePixelRatio || 1;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLab(ctx!, view, scene, cfg);
  }

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    view = fitted ? fitView(width, height, cfg.buildableRadius, 24) : { ...view, width, height };
    render();
  }

  function setSeed(next: number): void {
    seed = Math.min(MAX_SEED, Math.max(0, Math.floor(next)));
    const controlPoints = generateControlPoints(createRng(seed, 'track'), cfg);
    const line = sampleClosedSpline(controlPoints, cfg.sampleSpacing, cfg.curvatureWindow);
    scene = { controlPoints, line };

    input.value = String(seed);
    errorEl.textContent = '';
    factsEl.innerHTML = '';
    addFact('Share code', formatSeedCode(seed, GENERATOR_VERSION));
    addFact('Lap length', `${Math.round(line.length)} m`);
    addFact('Control points', String(controlPoints.length));

    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.history.replaceState(null, '', url);
    document.body.dataset.labSeed = String(seed);
    render();
  }

  function addFact(label: string, value: string): void {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    factsEl.append(dt, dd);
  }

  /** Picking a random seed is app code, not generation, so Math.random is fine here. */
  function randomSeed(): number {
    return 1 + Math.floor(Math.random() * 99999);
  }

  ref<HTMLFormElement>('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const parsed = parseSeedInput(input.value);
    if (!parsed) {
      errorEl.textContent = `Type a whole number from 0 to ${MAX_SEED}, or a code like v${GENERATOR_VERSION}-48213.`;
      return;
    }
    if (parsed.version !== null && parsed.version !== GENERATOR_VERSION) {
      setSeed(parsed.seed);
      errorEl.textContent = `That code is from generator v${parsed.version}. Showing the seed with v${GENERATOR_VERSION}; the track may differ.`;
      return;
    }
    setSeed(parsed.seed);
  });
  ref('prev').addEventListener('click', () => setSeed(seed === 0 ? MAX_SEED : seed - 1));
  ref('next').addEventListener('click', () => setSeed(seed === MAX_SEED ? 0 : seed + 1));
  ref('random').addEventListener('click', () => setSeed(randomSeed()));

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowLeft') setSeed(seed === 0 ? MAX_SEED : seed - 1);
    else if (event.key === 'ArrowRight') setSeed(seed === MAX_SEED ? 0 : seed + 1);
    else if (event.key === 'n' || event.key === 'N') setSeed(randomSeed());
    else return;
    event.preventDefault();
  });

  // Pan, zoom and fit.
  let dragging: { id: number; x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || dragging.id !== event.pointerId) return;
    view = panBy(view, event.clientX - dragging.x, event.clientY - dragging.y);
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    fitted = false;
    render();
  });
  const endDrag = (event: PointerEvent): void => {
    if (dragging?.id === event.pointerId) dragging = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      view = zoomAt(view, event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0015));
      fitted = false;
      render();
    },
    { passive: false },
  );
  canvas.addEventListener('dblclick', () => {
    fitted = true;
    resize();
  });

  new ResizeObserver(resize).observe(canvas);

  const fromUrl = parseSeedInput(new URL(window.location.href).searchParams.get('seed') ?? '');
  resize();
  setSeed(fromUrl ? fromUrl.seed : randomSeed());
  document.body.dataset.labReady = 'true';
}
