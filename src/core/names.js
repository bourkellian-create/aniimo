import { normalize, similarity, tokenize } from './text.js';

const MAX_WORDS = 3;

/**
 * Dictionnaire des noms d'Aniimo, utilisé pour corriger les erreurs d'OCR.
 * Les noms composés (« Prismana Glacy ») sont prioritaires sur leurs parties.
 */
export class NameIndex {
  constructor(names = []) {
    this.entries = [];
    for (const name of names) this.add(name);
  }

  add(name) {
    const key = normalize(name);
    if (key.length < 3 || this.entries.some((e) => e.key === key)) return false;
    this.entries.push({ name: String(name).trim(), key, words: key.split(' ').length });
    this.entries.sort((a, b) => b.key.length - a.key.length);
    return true;
  }

  get names() {
    return this.entries.map((e) => e.name);
  }

  /**
   * Trouve les noms présents dans un texte OCR.
   * @returns {{name: string, score: number, raw: string}[]}
   */
  find(text, minScore = 0.8) {
    const tokens = tokenize(text);
    const used = new Array(tokens.length).fill(false);
    const found = new Map();

    for (const entry of this.entries) {
      // Un nom court tolère moins d'erreurs : « Turbo » ne doit pas matcher « Tuba ».
      const threshold = entry.key.length <= 5 ? Math.max(minScore, 0.99) : minScore;
      for (let i = 0; i + entry.words <= tokens.length; i++) {
        const span = tokens.slice(i, i + entry.words);
        if (entry.words > MAX_WORDS || used.slice(i, i + entry.words).some(Boolean)) continue;
        const raw = span.join(' ');
        const score = similarity(raw, entry.key);
        if (score < threshold) continue;
        for (let j = i; j < i + entry.words; j++) used[j] = true;
        const prev = found.get(entry.name);
        if (!prev || prev.score < score) found.set(entry.name, { name: entry.name, score, raw });
      }
    }
    return [...found.values()].sort((a, b) => b.score - a.score);
  }
}
