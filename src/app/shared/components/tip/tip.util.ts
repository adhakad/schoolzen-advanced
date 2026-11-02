/**
 * The one floating tooltip (Rule 21f). Mouse users get the native `title`; touch users
 * get this bubble on tap or long-press, because a phone never shows a `title`. One bubble
 * at a time, appended to <body> so no card or table wrapper can clip it.
 */
let bubble: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const hideTip = (): void => {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  bubble?.remove();
  bubble = null;
};

/** Shows `text` just above `anchor` (below it when there is no room), then hides it. */
export const showTip = (anchor: HTMLElement, text: string, ms = 2200): void => {
  hideTip();
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'sz-tip';
  el.setAttribute('role', 'tooltip');
  el.textContent = text;
  document.body.appendChild(el);
  const a = anchor.getBoundingClientRect();
  const t = el.getBoundingClientRect();
  const left = Math.min(Math.max(8, a.left + a.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  const top = a.top - t.height - 6 >= 4 ? a.top - t.height - 6 : a.bottom + 6;
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
  bubble = el;
  hideTimer = setTimeout(hideTip, ms);
};

/** Full label, plus why it is disabled ("Bulk Print (0) — Select at least one row"). */
export const tipText = (button: HTMLElement): string => {
  const label = (button.querySelector('.btn-label')?.textContent ?? button.textContent ?? '').replace(/\s+/g, ' ').trim();
  const why = (button as HTMLButtonElement).disabled ? (button.getAttribute('data-why') || '').trim() : '';
  return why ? `${label} — ${why}` : label;
};
