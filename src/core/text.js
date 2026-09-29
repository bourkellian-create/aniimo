import { distance } from 'fastest-levenshtein';

/** Minuscules, sans accents, seulement lettres/chiffres/espaces. */
export function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Similarité 0..1 entre deux chaînes déjà normalisées. */
export function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

export function tokenize(text) {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

/**
 * Vrai si `phrase` apparaît dans `tokens`, en tolérant les erreurs d'OCR
 * (similarité >= minScore sur la fenêtre de même nombre de mots).
 */
export function containsFuzzy(tokens, phrase, minScore = 0.84) {
  const target = normalize(phrase);
  if (!target) return false;
  const size = target.split(' ').length;
  for (let i = 0; i + size <= tokens.length; i++) {
    const window = tokens.slice(i, i + size).join(' ');
    if (window === target) return true;
    if (target.length >= 4 && similarity(window, target) >= minScore) return true;
  }
  return false;
}
