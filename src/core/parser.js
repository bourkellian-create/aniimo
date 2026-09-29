import { containsFuzzy, tokenize } from './text.js';

const UID_RE = /\bU[I1lL|!]D\b\s*[:：#.]?\s*(\d{6,12})\b/i;
const PROGRESS_RE = /(\d{1,3})\s*[/|]\s*(\d{2,3})\b/g;

/**
 * Analyse le texte OCR d'un écran d'Aniimo.
 * @param {string} text texte brut sorti de l'OCR
 * @param {import('./names.js').NameIndex} names
 * @param {object} rules contenu de data/screen-rules.json
 */
export function parseScreen(text, names, rules) {
  const tokens = tokenize(text);
  const screen = detectScreen(tokens, rules);

  return {
    screen,
    aniimo: names.find(text),
    uid: extractUid(text),
    progress: screen === 'aniilog' || screen === 'profile' ? extractProgress(text) : null,
    variants: {
      illusory: rules.variants.illusory.some((k) => containsFuzzy(tokens, k)),
      sparkling: rules.variants.sparkling.some((k) => containsFuzzy(tokens, k)),
    },
    affinityLevel: screen === 'affinity' ? extractAffinity(tokens, rules) : null,
  };
}

export function detectScreen(tokens, rules) {
  let best = { screen: 'unknown', hits: 0, priority: -1 };
  for (const [screen, rule] of Object.entries(rules.screens)) {
    const hits = rule.keywords.filter((k) => containsFuzzy(tokens, k)).length;
    if (!hits) continue;
    if (hits > best.hits || (hits === best.hits && rule.priority > best.priority)) {
      best = { screen, hits, priority: rule.priority };
    }
  }
  return best.screen;
}

export function extractUid(text) {
  return text.match(UID_RE)?.[1] ?? null;
}

/** Progression de l'Aniilog, ex. « 57/210 ». */
export function extractProgress(text) {
  for (const [, a, b] of text.matchAll(PROGRESS_RE)) {
    const caught = Number(a);
    const total = Number(b);
    if (total >= 50 && total <= 500 && caught <= total) return { caught, total };
  }
  return null;
}

function extractAffinity(tokens, rules) {
  const levels = [...rules.affinityLevels].sort((a, b) => b.length - a.length);
  return levels.find((level) => containsFuzzy(tokens, level, 0.88)) ?? null;
}
