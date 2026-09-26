/**
 * Initials + gradient for a person's avatar — shared by app-row-avatar and every list
 * that renders the references' round `.st-avatar` / square `.r-avatar`. One definition,
 * so the same person is the same colour on every page.
 */

export const AVATAR_GRADIENTS: readonly string[] = [
  'linear-gradient(135deg,var(--brand),var(--brand-deep))',
  'linear-gradient(135deg,#ff9a76,#ff7676)',
  'linear-gradient(135deg,#4fd6c4,#2fb6a4)',
  'linear-gradient(135deg,#5aa9f0,#2f79d8)',
  'linear-gradient(135deg,#f6a5d0,#e06ea9)',
  'linear-gradient(135deg,#ffc46b,#f39c12)'
];

export const initialsOf = (name: string): string =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || '?';

/** Deterministic: the same seed always picks the same gradient. */
export const avatarGradient = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < (seed || '').length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};
