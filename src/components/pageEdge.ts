// Where the page's own area starts on the left: the floating sidebar's right edge on a computer (the sidebar sits
// over the page, and the page runs under it to the window's edge), the page's left edge on a phone.
// The sidebar hands over how far its right edge is from the window's left as --rail (px), on <html>.
export const RAIL_COLLAPSED_PX = 96; // 16px from the window's edge + 80px sidebar
export const RAIL_EXPANDED_PX = 272; // 16px + 256px

export function pageContentLeft(main: HTMLElement): number {
  const box = main.getBoundingClientRect();
  const mainLeft = box.left + main.clientLeft;
  if (!window.matchMedia('(min-width: 768px)').matches) return mainLeft;
  const rail = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail'));
  return Math.max(mainLeft, Number.isFinite(rail) ? rail : RAIL_COLLAPSED_PX);
}
