import type { GameConfig } from '../config';
import { setTuned, tuningFields, tuningText } from './tuning';

/** The tuning panel on the page (T while driving): a slider for each number of the handling, the drift and the chase camera. */
export interface TuningPanel {
  element: HTMLElement;
  /** Shows it, or hides it. */
  toggle(): void;
}

/** A number as the panel shows it: rounded to ten figures, so float noise does not show. */
const shown = (value: number): string => String(Number(value.toPrecision(10)));

/**
 * Builds the panel, hidden, inside `host`. It changes only `tuned`, the page's
 * own copy of the config, and calls `changed` with the path of each number
 * moved. "Copy for config.ts" puts the blocks, as text, on the clipboard and
 * in the box under it.
 */
export function createTuningPanel(host: HTMLElement, tuned: GameConfig, changed: (path: string) => void): TuningPanel {
  const element = document.createElement('div');
  element.className = 'world-card world-tuning';
  element.dataset.testid = 'tuning-panel';
  element.hidden = true;

  const title = document.createElement('h2');
  title.textContent = 'Tuning';
  const note = document.createElement('p');
  note.className = 'world-tuning-note';
  note.textContent = 'Changes this page only. Copy the values into src/config.ts to keep them.';
  element.append(title, note);

  let group = '';
  for (const field of tuningFields(tuned)) {
    if (field.group !== group) {
      group = field.group;
      const heading = document.createElement('h3');
      heading.textContent = group;
      element.append(heading);
    }
    const row = document.createElement('label');
    row.className = 'world-tuning-row';
    const name = document.createElement('span');
    name.textContent = field.path.slice(group.length + 1);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(field.min);
    slider.max = shown(field.max);
    slider.step = shown(field.step);
    slider.value = String(field.value);
    slider.dataset.path = field.path;
    const output = document.createElement('output');
    output.dataset.path = field.path;
    output.textContent = shown(field.value);
    slider.addEventListener('input', () => {
      const value = Number(slider.value);
      setTuned(tuned, field.path, value);
      output.textContent = shown(value);
      changed(field.path);
    });
    // Let go: the focus goes back to the page, so the keys drive at once.
    slider.addEventListener('change', () => slider.blur());
    row.append(name, slider, output);
    element.append(row);
  }

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy for config.ts';
  copy.dataset.testid = 'tuning-copy';
  const text = document.createElement('textarea');
  text.readOnly = true;
  text.rows = 6;
  text.dataset.testid = 'tuning-text';
  text.setAttribute('aria-label', 'The tuned values, as text for config.ts');
  copy.addEventListener('click', () => {
    text.value = tuningText(tuned);
    // The clipboard may be refused (no permission, or the page not in front): the box under the button still has the text.
    void navigator.clipboard?.writeText(text.value).catch(() => undefined);
  });
  element.append(copy, text);
  host.append(element);

  return {
    element,
    toggle() {
      element.hidden = !element.hidden;
    },
  };
}
