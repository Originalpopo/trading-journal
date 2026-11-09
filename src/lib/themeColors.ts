// The job-named colours (globals.css, AGENTS.md "Colours") for things drawn on a canvas, which can't use class names:
// charts read their colours here, so a theme that changes the :root variables changes the charts too.
// In the browser a colour is read from its CSS variable once and kept; elsewhere (tests, the build) the fallback below
// is used, which is the same colour as Tailwind's.

export type ThemeColor =
  | 'accent' | 'accent-strong' | 'accent-soft' | 'accent-line'
  | 'loss' | 'loss-soft' | 'loss-line'
  | 'ink' | 'ink-muted' | 'ink-faint' | 'ink-disabled'
  | 'line' | 'line-soft' | 'surface-2' | 'surface' | 'card';

// Tailwind's own values for the shades the names point at today, as [r, g, b].
const FALLBACK: Record<ThemeColor, [number, number, number]> = {
  'accent': [255, 137, 4], 'accent-strong': [255, 105, 0], 'accent-soft': [255, 247, 237], 'accent-line': [255, 214, 167],
  'loss': [130, 24, 26], 'loss-soft': [254, 242, 242], 'loss-line': [255, 201, 201],
  'ink': [12, 10, 9], 'ink-muted': [121, 113, 107], 'ink-faint': [166, 160, 155], 'ink-disabled': [214, 211, 209],
  'line': [231, 229, 228], 'line-soft': [245, 245, 244], 'surface-2': [245, 245, 244], 'surface': [250, 250, 249],
  'card': [255, 255, 255],
};

const cache = new Map<ThemeColor, [number, number, number]>();

// The colour as plain red, green and blue: the CSS variable may hold any CSS colour (oklch, lab...), so it is painted
// on a 1px canvas and read back.
function rgbOf(name: ThemeColor): [number, number, number] {
  const hit = cache.get(name);
  if (hit) return hit;
  if (typeof document === 'undefined') return FALLBACK[name];
  // Not kept until the stylesheet is in: before that the variable is empty and the probe would read the text colour.
  if (!getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()) return FALLBACK[name];
  const probe = document.createElement('span');
  probe.style.color = `var(--${name})`;
  probe.style.display = 'none';
  document.body.append(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !css) return FALLBACK[name];
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const rgb: [number, number, number] = [r, g, b];
  cache.set(name, rgb);
  return rgb;
}

// A colour for a canvas, faded when `alpha` is below 1 (only the levels in AGENTS.md: 0.45 lines, 0.7 labels, 0.35 hatching).
export function themeColor(name: ThemeColor, alpha = 1): string {
  const [r, g, b] = rgbOf(name);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// For a future theme switch: forget the colours read so far, so the next chart draw reads the new ones.
export function clearThemeColors() {
  cache.clear();
}
