import { readFile } from 'node:fs/promises';
import { NameIndex } from './names.js';

const DATA_DIR = new URL('../../data/', import.meta.url);

export async function loadRules() {
  return JSON.parse(await readFile(new URL('screen-rules.json', DATA_DIR), 'utf8'));
}

/** Noms livrés avec l'app + noms ajoutés par le joueur. */
export async function loadNames(extra = []) {
  const { names } = JSON.parse(await readFile(new URL('aniimo-names.json', DATA_DIR), 'utf8'));
  return new NameIndex([...names, ...extra]);
}
