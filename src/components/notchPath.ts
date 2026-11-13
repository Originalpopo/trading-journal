// Outlines for the menus' cut-out: a rounded card with a notch cut into one edge where the open page's button sits,
// so the page shows through it. The notch's own corners are rounded (r), and so are the card's corners where its
// edge turns into the notch (f). Drawn as SVG paths in the card's own pixels.

const NOTCH_INNER = 12; // the notch's two corners deep in the card
const NOTCH_FLARE = 12; // the card's corners where its edge turns into the notch
const FILL_SHORT = -4; // where the orange stops, measured in from where those corners start (negative: past them, 8px short of the edge)

function frame(w: number, h: number, R: number) {
  return { R: Math.max(0, Math.min(R, w / 2, h / 2)) };
}

/** A card w×h with corner radius R and a notch cut into its right edge from y=top to y=bottom, reaching in to x=left. */
export function rightNotchPath(w: number, h: number, R: number, notch: { top: number; bottom: number; left: number } | null): string {
  const { R: c } = frame(w, h, R);
  const start = `M ${c},0 H ${w - c} A ${c} ${c} 0 0 1 ${w},${c}`;
  const end = `V ${h - c} A ${c} ${c} 0 0 1 ${w - c},${h} H ${c} A ${c} ${c} 0 0 1 0,${h - c} V ${c} A ${c} ${c} 0 0 1 ${c},0 Z`;
  if (!notch) return `${start} ${end}`;
  const f = NOTCH_FLARE;
  const left = Math.max(2, Math.min(notch.left, w - 2 * f));
  const top = Math.max(c + f, notch.top);
  const bottom = Math.min(h - c - f, notch.bottom);
  if (bottom - top < 2 * NOTCH_INNER) return `${start} ${end}`;
  const r = Math.min(NOTCH_INNER, (w - f - left) / 2);
  return [
    start,
    `V ${top - f} A ${f} ${f} 0 0 1 ${w - f},${top}`,
    `H ${left + r} A ${r} ${r} 0 0 0 ${left},${top + r}`,
    `V ${bottom - r} A ${r} ${r} 0 0 0 ${left + r},${bottom}`,
    `H ${w - f} A ${f} ${f} 0 0 1 ${w},${bottom + f}`,
    end,
  ].join(' ');
}

/** A card w×h with corner radius R and a notch cut into its top edge from x=left to x=right, reaching down to y=bottom. */
export function topNotchPath(w: number, h: number, R: number, notch: { left: number; right: number; bottom: number } | null): string {
  const { R: c } = frame(w, h, R);
  const end = `H ${w - c} A ${c} ${c} 0 0 1 ${w},${c} V ${h - c} A ${c} ${c} 0 0 1 ${w - c},${h} H ${c} A ${c} ${c} 0 0 1 0,${h - c} V ${c} A ${c} ${c} 0 0 1 ${c},0 Z`;
  if (!notch) return `M ${c},0 ${end}`;
  const f = NOTCH_FLARE;
  const left = Math.max(c + f, notch.left);
  const right = Math.min(w - c - f, notch.right);
  const bottom = Math.max(2 * f, Math.min(notch.bottom, h - 2));
  if (right - left < 2 * NOTCH_INNER) return `M ${c},0 ${end}`;
  const r = Math.min(NOTCH_INNER, (bottom - f) / 2);
  return [
    `M ${c},0 H ${left - f} A ${f} ${f} 0 0 1 ${left},${f}`,
    `V ${bottom - r} A ${r} ${r} 0 0 0 ${left + r},${bottom}`,
    `H ${right - r} A ${r} ${r} 0 0 0 ${right},${bottom - r}`,
    `V ${f} A ${f} ${f} 0 0 1 ${right + f},0`,
    end,
  ].join(' ');
}

/** The notch itself, as the filled shape of the open page's tab: what rightNotchPath cuts out of the card. */
export function rightNotchFill(w: number, h: number, R: number, notch: { top: number; bottom: number; left: number }): string | null {
  const { R: c } = frame(w, h, R);
  const f = NOTCH_FLARE;
  const left = Math.max(2, Math.min(notch.left, w - 2 * f));
  const top = Math.max(c + f, notch.top);
  const bottom = Math.min(h - c - f, notch.bottom);
  if (bottom - top < 2 * NOTCH_INNER) return null;
  const r = Math.min(NOTCH_INNER, (w - f - left) / 2);
  // The orange stops a little short of the card's edge and ends straight; the page's grey shows in the rest of the notch.
  const end = w - f - FILL_SHORT;
  return `M ${end},${top} H ${left + r} A ${r} ${r} 0 0 0 ${left},${top + r} V ${bottom - r} A ${r} ${r} 0 0 0 ${left + r},${bottom} H ${end} Z`;
}

/** The notch itself, as the filled shape of the open page's tab: what topNotchPath cuts out of the card. */
export function topNotchFill(w: number, h: number, R: number, notch: { left: number; right: number; bottom: number }): string | null {
  const { R: c } = frame(w, h, R);
  const f = NOTCH_FLARE;
  const left = Math.max(c + f, notch.left);
  const right = Math.min(w - c - f, notch.right);
  const bottom = Math.max(2 * f, Math.min(notch.bottom, h - 2));
  if (right - left < 2 * NOTCH_INNER) return null;
  const r = Math.min(NOTCH_INNER, (bottom - f) / 2);
  const end = Math.min(f + FILL_SHORT, bottom - 2 * r); // as in rightNotchFill: short of the edge, ending straight
  return `M ${left},${end} V ${bottom - r} A ${r} ${r} 0 0 0 ${left + r},${bottom} H ${right - r} A ${r} ${r} 0 0 0 ${right},${bottom - r} V ${end} Z`;
}
