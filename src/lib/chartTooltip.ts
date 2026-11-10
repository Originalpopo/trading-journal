// The balloon shown when pointing at any chart in the app: a small white card (styled in globals.css as
// .chart-tooltip) instead of Chart.js's black box, with a circle in each line's colour, its name, and its
// value on the right. Imported once by every page with a chart; it sets Chart.js's defaults, so each chart
// keeps only its own wording (its tooltip callbacks).
import { Chart as ChartJS, Tooltip, type Chart, type ChartEvent, type ChartType, type Plugin, type TooltipItem, type TooltipModel } from 'chart.js';
import { themeColor } from './themeColors';

// Its defaults only exist once the Tooltip plugin is registered (the pages register it too; twice is harmless).
ChartJS.register(Tooltip);

// The circle of a line or area too faint to see (the Balance grey) is drawn in stone-300.
const faintColour = () => themeColor('ink-disabled');

function solidColour(colour: unknown, index: number): string | null {
  const value = Array.isArray(colour) ? colour[index] : colour;
  if (typeof value !== 'string' || value === 'transparent') return null;
  const rgba = value.match(/rgba\(([^)]+)\)/);
  if (rgba) {
    const alpha = parseFloat(rgba[1].split(',')[3] ?? '1');
    if (alpha < 0.3) return null;
  }
  return value;
}

// A line in its line colour; a bar or an area in its fill (per bar when the bars differ).
function circleColour(item: TooltipItem<ChartType>): string {
  const dataset = item.dataset as { borderColor?: unknown; backgroundColor?: unknown };
  return solidColour(dataset.borderColor, item.dataIndex)
    ?? solidColour(dataset.backgroundColor, item.dataIndex)
    ?? faintColour();
}

function tooltipElement(chart: Chart): HTMLDivElement | null {
  const parent = chart.canvas.parentElement;
  if (!parent) return null;
  let el = parent.querySelector<HTMLDivElement>(':scope > .chart-tooltip');
  if (!el) {
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    el = document.createElement('div');
    el.className = 'chart-tooltip';
    el.setAttribute('aria-hidden', 'true');
    parent.appendChild(el);
  }
  return el;
}

function div(className: string, text?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function externalTooltip({ chart, tooltip }: { chart: Chart; tooltip: TooltipModel<ChartType> }) {
  const el = tooltipElement(chart);
  if (!el) return;
  if (tooltip.opacity === 0) {
    el.style.opacity = '0';
    return;
  }

  el.replaceChildren();
  tooltip.title.forEach(line => el.appendChild(div('chart-tooltip-title', line)));
  tooltip.body.forEach((body, i) => {
    body.lines.forEach(line => {
      // "Name: value" → the name on the left, the value on the right.
      const cut = line.lastIndexOf(': ');
      const row = div('chart-tooltip-row');
      const dot = div('chart-tooltip-dot');
      dot.style.backgroundColor = String(tooltip.labelColors[i]?.backgroundColor ?? faintColour());
      row.appendChild(dot);
      row.appendChild(div('chart-tooltip-name', (cut === -1 ? line : line.slice(0, cut)).trim()));
      if (cut !== -1) row.appendChild(div('chart-tooltip-value', line.slice(cut + 2)));
      el.appendChild(row);
    });
  });
  if (tooltip.footer.length) {
    const footer = div('chart-tooltip-footer');
    tooltip.footer.forEach(line => footer.appendChild(div('', line)));
    el.appendChild(footer);
  }

  // Beside the point, to its right, or to its left when there is no room; level with it.
  const canvas = chart.canvas;
  const parent = canvas.parentElement!;
  const gap = 14;
  // Measured at the left edge: left where it was (near the right edge) it would be squeezed narrower.
  el.style.left = '0px';
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const pointX = canvas.offsetLeft + tooltip.caretX;
  let left = pointX + gap;
  if (left + width > parent.clientWidth) left = Math.max(0, pointX - gap - width);
  const top = Math.max(0, Math.min(canvas.offsetTop + tooltip.caretY - height / 2, parent.clientHeight - height));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.opacity = '1';
}

const tooltipDefaults = ChartJS.defaults.plugins.tooltip;
tooltipDefaults.enabled = false;
tooltipDefaults.external = externalTooltip;
tooltipDefaults.callbacks.labelColor = (item: TooltipItem<ChartType>) => {
  const colour = circleColour(item);
  return { borderColor: colour, backgroundColor: colour };
};

// The balloon waits until the pointer rests: passing the mouse over a chart, or a finger scrolling the page across
// it, shows nothing. Once it is showing it follows the pointer until the pointer leaves the chart. A tap or a click
// shows it at once. Added per chart (plugins: [hoverDelayPlugin]).
const HOVER_DELAY_MS = 350;
const REST_PX = 4; // a hand's small shake still counts as resting
type HoverDelayState = {
  timer: ReturnType<typeof setTimeout> | null;
  shown: boolean;
  releasing: boolean;
  touching: boolean;
  anchor: { x: number; y: number } | null;
  last: ChartEvent | null;
  cancel: () => void;
  press: () => void;
  lift: () => void;
};
const hoverDelay = new WeakMap<Chart, HoverDelayState>();
const hideBalloon = (chart: Chart) => {
  if (!chart.getActiveElements().length && !chart.tooltip?.getActiveElements().length) return;
  chart.setActiveElements([]);
  chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
  chart.render();
};
const hoverDelay_: Plugin = {
  id: 'hoverDelay',
  afterInit(chart) {
    const state: HoverDelayState = { timer: null, shown: false, releasing: false, touching: false, anchor: null, last: null, cancel: () => {}, press: () => {}, lift: () => {} };
    // A finger lifted or the page scrolled before the wait was over: it was not a rest.
    state.cancel = () => {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.anchor = null;
    };
    // Chart.js handles events on the next frame, so a finger's last move can reach it after the finger is lifted:
    // whether a finger is down is kept here, from the touches themselves.
    state.press = () => { state.touching = true; };
    state.lift = () => { state.touching = false; state.cancel(); };
    chart.canvas.addEventListener('touchstart', state.press, { passive: true });
    chart.canvas.addEventListener('touchend', state.lift, { passive: true });
    chart.canvas.addEventListener('touchcancel', state.lift, { passive: true });
    window.addEventListener('scroll', state.cancel, { passive: true, capture: true });
    hoverDelay.set(chart, state);
  },
  beforeEvent(chart, args) {
    const state = hoverDelay.get(chart);
    if (!state || state.releasing) return;
    const e = args.event;
    // Chart.js going over the last pointer position again after an update: only while the balloon is showing.
    if (args.replay) return state.shown ? undefined : false;
    if (e.type === 'mouseout') { state.cancel(); state.shown = false; return; }
    if (e.type === 'click') { state.cancel(); state.shown = true; return; }
    // A touch that arrives after its finger was lifted.
    if (e.native?.type.startsWith('touch') && !state.touching) return false;
    // Each new touch starts over: the balloon from the last one goes, and this one waits for its own rest.
    if (e.native?.type === 'touchstart') {
      state.cancel();
      state.shown = false;
      hideBalloon(chart);
    } else if (state.shown) {
      return;
    }
    if (e.x == null || e.y == null) return false;
    state.last = e;
    const moved = !state.anchor || Math.hypot(e.x - state.anchor.x, e.y - state.anchor.y) > REST_PX;
    if (moved) {
      state.cancel();
      state.anchor = { x: e.x, y: e.y };
      state.timer = setTimeout(() => {
        state.timer = null;
        if (!chart.ctx || !state.last) return; // destroyed
        state.shown = true;
        state.releasing = true;
        // Hands the resting position to Chart.js as if it had just arrived.
        (chart as unknown as { _eventHandler: (e: ChartEvent) => void })._eventHandler(state.last);
        state.releasing = false;
      }, HOVER_DELAY_MS);
    }
    return false;
  },
  afterDestroy(chart) {
    const state = hoverDelay.get(chart);
    if (!state) return;
    state.cancel();
    chart.canvas?.removeEventListener('touchstart', state.press);
    chart.canvas?.removeEventListener('touchend', state.lift);
    chart.canvas?.removeEventListener('touchcancel', state.lift);
    window.removeEventListener('scroll', state.cancel, { capture: true });
    hoverDelay.delete(chart);
  },
};

// Fits any kind of chart (lines, bars, both).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const hoverDelayPlugin = hoverDelay_ as Plugin<any>;

// A chart drawn again (another measure, the privacy eye) takes its balloon with it.
ChartJS.register({
  id: 'chartTooltipCleanup',
  beforeDestroy(chart: Chart) {
    chart.canvas?.parentElement?.querySelector(':scope > .chart-tooltip')?.remove();
  },
});
