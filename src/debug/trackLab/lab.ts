import './lab.css';
import { config, GENERATOR_VERSION, type GameConfig, type TrackConfig } from '../../config';
import { formatSeedCode, MAX_SEED, parseSeedInput } from '../../core/seedCode';
import { hashTrack, type Candidate, type TrackResult } from '../../gen';
import { genClient } from '../../worker/client';
import { drawLab, SECTION_COLORS } from './draw';
import { describeScorePart, describeViolation } from './format';
import { fitView, panBy, zoomAt, type View } from './view';

const TEMPLATE = `
  <div class="lab">
    <aside class="lab-side">
      <header>
        <h1 class="lab-title">Seed Circuit track lab</h1>
        <p class="lab-sub">Generator v${GENERATOR_VERSION} · <a href="?sheet=20" data-ref="sheetLink" data-testid="sheet-link">Contact sheet of 20 seeds</a></p>
      </header>

      <section class="lab-section">
        <h2>Seed</h2>
        <form class="lab-seed-form" data-ref="form">
          <input data-ref="input" data-testid="seed-input" inputmode="numeric" autocomplete="off"
            spellcheck="false" aria-label="Seed or share code" />
          <button type="submit" class="primary">Go</button>
        </form>
        <p class="lab-error" data-ref="error" data-testid="seed-error" role="alert"></p>
        <p class="lab-note" data-ref="rules" data-testid="rules-note" hidden></p>
        <div class="lab-row">
          <button type="button" data-ref="prev" data-testid="seed-prev">Previous</button>
          <button type="button" data-ref="next" data-testid="seed-next">Next</button>
          <button type="button" data-ref="random" data-testid="seed-random">Random</button>
        </div>
      </section>

      <section class="lab-section">
        <h2>Track</h2>
        <p class="lab-name" data-ref="name" data-testid="track-name"></p>
        <dl class="lab-facts" data-ref="facts" data-testid="facts"></dl>
        <ul class="lab-verdict" data-ref="verdict" data-testid="verdict"></ul>
      </section>

      <section class="lab-section">
        <h2>Fun score</h2>
        <div class="lab-total"><span data-ref="totalLabel"></span><strong data-ref="total" data-testid="score-total"></strong></div>
        <div class="lab-bars" data-ref="bars" data-testid="score-bars"></div>
      </section>

      <section class="lab-section">
        <h2>Candidates</h2>
        <div class="lab-chips" data-ref="chips" data-testid="candidates"></div>
        <p class="lab-note" data-ref="tally" data-testid="candidate-tally"></p>
        <label class="lab-check">
          <input type="checkbox" data-ref="ghosts" data-testid="rejected-toggle" />
          Show rejected layouts on the map
        </label>
      </section>

      <p class="lab-hint">Drag to pan, scroll to zoom, double-click to fit. Arrow keys step through seeds, N picks a random one, R shows rejected layouts.</p>
    </aside>
    <main class="lab-stage">
      <canvas data-ref="canvas" data-testid="track-canvas"></canvas>
    </main>
  </div>
`;

const CORNER_LABELS = {
  hairpin: 'Hairpins',
  sweeper: 'Sweepers',
  chicane: 'Chicane corners',
  corner: 'Other corners',
  kink: 'Kinks',
} as const;

const asPoints = (score: number): string => String(Math.round(score * 100));

/**
 * What-if overrides for the hard rules, for seeing which layouts a stricter
 * rule would reject: ?minRadius=30 (metres) and ?gapWidths=4 (road widths).
 */
function readRuleOverrides(params: URLSearchParams): { values: Partial<TrackConfig>; notes: string[] } {
  const values: Partial<TrackConfig> = {};
  const notes: string[] = [];
  const minRadius = Number(params.get('minRadius'));
  if (params.has('minRadius') && minRadius > 0 && minRadius < 1000) {
    values.minCornerRadius = minRadius;
    notes.push(`minimum corner radius ${minRadius} m`);
  }
  const gapWidths = Number(params.get('gapWidths'));
  if (params.has('gapWidths') && gapWidths > 0 && gapWidths < 50) {
    values.sectionGapWidths = gapWidths;
    notes.push(`sections at least ${gapWidths} road widths apart`);
  }
  return { values, notes };
}

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
  const ghostsBox = ref<HTMLInputElement>('ghosts');
  const errorEl = ref('error');
  const factsEl = ref('facts');
  const verdictEl = ref('verdict');
  const barsEl = ref('bars');
  const chipsEl = ref('chips');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw to a 2D canvas');

  const overrides = readRuleOverrides(new URL(window.location.href).searchParams);
  const cfg: TrackConfig = { ...config.track, ...overrides.values };
  const gameConfig: GameConfig = { ...config, track: cfg };
  if (overrides.notes.length > 0) {
    const rulesEl = ref('rules');
    rulesEl.hidden = false;
    rulesEl.textContent = `What-if rules from the URL: ${overrides.notes.join(', ')}. Layouts are still built for the normal rules.`;
  }
  let result: TrackResult | null = null;
  /** The seed last asked for. Its track may still be on its way from the worker. */
  let wantedSeed = 0;
  let selectedIndex = 0;
  let view: View = fitView(1, 1, cfg.buildableRadius, 24);
  let fitted = true;

  function render(): void {
    const dpr = window.devicePixelRatio || 1;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!result) {
      drawLab(ctx!, view, null, cfg);
      return;
    }
    const ghosts = ghostsBox.checked
      ? result.candidates.filter((c) => c.violations.length > 0 && c.index !== selectedIndex)
      : [];
    drawLab(ctx!, view, { selected: result.candidates[selectedIndex]!, isWinner: selectedIndex === result.winnerIndex, ghosts }, cfg);
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

  /** Generates the seed's track in the worker and shows it. Resolves once it is on screen. */
  async function setSeed(next: number): Promise<void> {
    const seed = Math.min(MAX_SEED, Math.max(0, Math.floor(next)));
    wantedSeed = seed;
    let generated;
    try {
      generated = await genClient().track(seed, gameConfig);
    } catch (error) {
      if (wantedSeed === seed) errorEl.textContent = error instanceof Error ? error.message : String(error);
      return;
    }
    // A newer seed was asked for while this one was generating: drop this answer.
    if (wantedSeed !== seed) return;
    result = generated.result;
    const elapsed = generated.ms;
    selectedIndex = result.winnerIndex;

    input.value = String(seed);
    errorEl.textContent = '';
    ref('name').textContent = result.name;

    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.history.replaceState(null, '', url);
    document.body.dataset.labSeed = String(seed);
    document.body.dataset.labHash = hashTrack(result);
    document.body.dataset.labMs = elapsed.toFixed(1);
    ref<HTMLAnchorElement>('sheetLink').href = `?sheet=20&from=${seed}`;

    renderChips();
    renderSelected();
  }

  function select(index: number): void {
    selectedIndex = index;
    for (const chip of chipsEl.querySelectorAll<HTMLButtonElement>('button')) {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.index) === index));
    }
    renderSelected();
  }

  /** One button per candidate: its score out of 100, or a cross if rejected. */
  function renderChips(): void {
    if (!result) return;
    chipsEl.innerHTML = '';
    for (const candidate of result.candidates) {
      const valid = candidate.violations.length === 0;
      const isWinner = candidate.index === result.winnerIndex;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lab-chip';
      chip.dataset.index = String(candidate.index);
      chip.dataset.valid = String(valid);
      chip.dataset.winner = String(isWinner);
      chip.dataset.testid = 'candidate-chip';
      chip.textContent = candidate.score ? asPoints(candidate.score.total) : '✖';
      const summary = valid
        ? `scored ${asPoints(candidate.score!.total)}${isWinner ? ' (winner)' : ''}`
        : `rejected: ${candidate.violations.map(describeViolation).join('; ')}`;
      chip.title = `Candidate ${candidate.index + 1}, ${summary}`;
      chip.setAttribute('aria-label', chip.title);
      chip.setAttribute('aria-pressed', String(candidate.index === selectedIndex));
      chip.addEventListener('click', () => select(candidate.index));
      chipsEl.append(chip);
    }
    const validCount = result.candidates.filter((c) => c.violations.length === 0).length;
    const fallbackNote = result.fallback ? ' No candidate was valid, so a plain oval was used.' : '';
    ref('tally').textContent =
      `${validCount} valid, ${result.candidates.length - validCount} rejected. Outlined: the winner.${fallbackNote}`;
  }

  /** Fills the Track and Fun score panels for the candidate being shown. */
  function renderSelected(): void {
    if (!result) return;
    const candidate: Candidate = result.candidates[selectedIndex]!;
    const isWinner = selectedIndex === result.winnerIndex;

    factsEl.innerHTML = '';
    addFact('Share code', formatSeedCode(result.seed, result.generatorVersion));
    addFact('Style', result.style[0]!.toUpperCase() + result.style.slice(1));
    addFact('Showing', isWinner ? `Winner (no. ${selectedIndex + 1})` : `Candidate ${selectedIndex + 1}`);
    addFact('Lap length', `${Math.round(candidate.line.length)} m`);
    addFact('Generated in', `${document.body.dataset.labMs} ms`);
    addFact('Build attempts', String(candidate.buildAttempts));

    const straights = candidate.sections.filter((s) => s.type === 'straight');
    const corners = candidate.sections.filter((s) => s.type === 'corner');
    addFact('Straights over 150 m', String(straights.filter((s) => s.length >= 150).length), SECTION_COLORS.longStraight);
    for (const kind of ['hairpin', 'sweeper', 'chicane', 'corner', 'kink'] as const) {
      addFact(CORNER_LABELS[kind], String(corners.filter((c) => c.kind === kind).length), SECTION_COLORS[kind]);
    }

    verdictEl.innerHTML = '';
    const valid = candidate.violations.length === 0;
    verdictEl.dataset.valid = String(valid);
    const lines = valid ? ['✔ Valid layout'] : candidate.violations.map((v) => `✖ ${describeViolation(v)}`);
    for (const text of lines) {
      const item = document.createElement('li');
      item.textContent = text;
      verdictEl.append(item);
    }

    barsEl.innerHTML = '';
    ref('totalLabel').textContent = candidate.score ? 'Total out of 100' : 'Rejected layouts are not scored';
    ref('total').textContent = candidate.score ? asPoints(candidate.score.total) : '–';
    for (const part of candidate.score?.parts ?? []) {
      const { label, detail } = describeScorePart(part);
      const bar = document.createElement('div');
      bar.className = 'lab-bar';
      bar.dataset.pending = String(part.pending);
      bar.innerHTML = `
        <div class="lab-bar-head"><span></span><span></span></div>
        <div class="lab-bar-track"><div class="lab-bar-fill"></div></div>
        <p class="lab-bar-detail"></p>`;
      const [name, value] = bar.querySelectorAll('span');
      name!.textContent = label;
      value!.textContent = part.pending ? '–' : asPoints(part.score);
      bar.querySelector<HTMLElement>('.lab-bar-fill')!.style.width = `${part.pending ? 0 : part.score * 100}%`;
      bar.querySelector('.lab-bar-detail')!.textContent = detail;
      barsEl.append(bar);
    }

    render();
  }

  function addFact(label: string, value: string, swatch?: string): void {
    const dt = document.createElement('dt');
    dt.textContent = label;
    if (swatch) {
      const dot = document.createElement('span');
      dot.className = 'lab-swatch';
      dot.style.background = swatch;
      dt.prepend(dot);
    }
    const dd = document.createElement('dd');
    dd.textContent = value;
    factsEl.append(dt, dd);
  }

  /** Picking a random seed is app code, not generation, so Math.random is fine here. */
  function randomSeed(): number {
    return 1 + Math.floor(Math.random() * 99999);
  }
  const currentSeed = (): number => wantedSeed;
  const previousSeed = (): number => (currentSeed() === 0 ? MAX_SEED : currentSeed() - 1);
  const nextSeed = (): number => (currentSeed() === MAX_SEED ? 0 : currentSeed() + 1);

  ref<HTMLFormElement>('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const parsed = parseSeedInput(input.value);
    if (!parsed) {
      errorEl.textContent = `Type a whole number from 0 to ${MAX_SEED}, or a code like v${GENERATOR_VERSION}-48213.`;
      return;
    }
    void setSeed(parsed.seed).then(() => {
      if (parsed.version !== null && parsed.version !== GENERATOR_VERSION) {
        errorEl.textContent = `That code is from generator v${parsed.version}. Showing the seed with v${GENERATOR_VERSION}; the track may differ.`;
      }
    });
  });
  ref('prev').addEventListener('click', () => void setSeed(previousSeed()));
  ref('next').addEventListener('click', () => void setSeed(nextSeed()));
  ref('random').addEventListener('click', () => void setSeed(randomSeed()));
  ghostsBox.addEventListener('change', render);

  window.addEventListener('keydown', (event) => {
    // Typing in the seed box must not trigger shortcuts; other controls should not block them.
    if (event.target === input || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowleft') void setSeed(previousSeed());
    else if (key === 'arrowright') void setSeed(nextSeed());
    else if (key === 'n') void setSeed(randomSeed());
    else if (key === 'r') {
      ghostsBox.checked = !ghostsBox.checked;
      render();
    } else return;
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
  void setSeed(fromUrl ? fromUrl.seed : randomSeed()).then(() => {
    // ?candidate=7 opens that candidate instead of the winner, for linking to a rejected layout.
    const wanted = Number(new URL(window.location.href).searchParams.get('candidate'));
    if (result && Number.isInteger(wanted) && wanted >= 1 && wanted <= result.candidates.length) {
      select(wanted - 1);
    }
    document.body.dataset.labReady = 'true';
  });
}
