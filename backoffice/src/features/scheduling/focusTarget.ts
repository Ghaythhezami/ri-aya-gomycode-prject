/** Highlight target shared by the insight rows, the grid and the mobile list. */
export interface FocusTarget {
  kind: 'appointment' | 'doctor';
  id: string;
}

/** First visible element carrying `attr="id"` (desktop grid and mobile list are both in the DOM). */
function visible(attr: string, id: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[${attr}="${CSS.escape(id)}"]`);
  return Array.from(nodes).find((n) => n.getClientRects().length > 0) ?? null;
}

/** Scroll the target into view and move keyboard focus to it. */
export function focusTarget(target: FocusTarget): void {
  const attr = target.kind === 'appointment' ? 'data-appt' : 'data-row';
  const node = visible(attr, target.id);
  if (!node) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
  const focusable = node.matches('[tabindex]')
    ? node
    : node.querySelector<HTMLElement>('[tabindex="0"]');
  focusable?.focus({ preventScroll: true });
}
