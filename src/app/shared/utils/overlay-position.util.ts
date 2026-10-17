/**
 * Places a portaled overlay (position: fixed, a child of <body>) directly below its trigger —
 * the one rule every `.dd` / `.dp` / range picker follows (design-system.md, "Menu
 * positioning and open/close behavior"; global-fixes.md rule 1):
 *
 *   - below the trigger if the whole panel fits; else above it if it fits there; else
 *     whichever side has more room, with the panel's height capped to that room (it scrolls);
 *   - left-aligned with the trigger and clamped inside the viewport.
 *
 * Returns true when the panel was flipped above the trigger.
 */
export const OVERLAY_GAP = 8;
export const OVERLAY_EDGE = 8;

export const placeBelow = (panel: HTMLElement, anchor: DOMRect): boolean => {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  panel.style.position = 'fixed';
  panel.style.maxHeight = '';

  const height = panel.offsetHeight;
  const width = panel.offsetWidth;
  const below = viewportH - anchor.bottom - OVERLAY_GAP - OVERLAY_EDGE;
  const above = anchor.top - OVERLAY_GAP - OVERLAY_EDGE;

  const flipped = height > below && (height <= above || above > below);
  const room = flipped ? above : below;
  if (height > room) panel.style.maxHeight = `${Math.max(160, room)}px`;
  const finalHeight = Math.min(height, Math.max(160, room));
  const top = flipped ? anchor.top - OVERLAY_GAP - finalHeight : anchor.bottom + OVERLAY_GAP;
  const left = Math.min(Math.max(OVERLAY_EDGE, anchor.left), viewportW - width - OVERLAY_EDGE);

  panel.style.top = `${Math.min(Math.max(OVERLAY_EDGE, top), Math.max(OVERLAY_EDGE, viewportH - finalHeight - OVERLAY_EDGE))}px`;
  panel.style.left = `${Math.max(OVERLAY_EDGE, left)}px`;
  panel.classList.toggle('flipped', flipped);
  return flipped;
};
