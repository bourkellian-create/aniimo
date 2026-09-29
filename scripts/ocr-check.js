// Usage : npm run ocr -- capture1.png [capture2.png ...]
// Affiche le texte lu, l'écran détecté et ce qui serait synchronisé.
// Sert à ajuster data/screen-rules.json avec de vraies captures du jeu.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNames, loadRules } from '../src/core/data.js';
import { OcrReader } from '../src/core/ocr.js';
import { parseScreen } from '../src/core/parser.js';
import { applyParse, emptyState } from '../src/core/sync.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage : npm run ocr -- capture.png [autre.png ...]');
  process.exit(1);
}

const names = await loadNames();
const rules = await loadRules();
const ocr = new OcrReader(join(tmpdir(), 'aniimo-sync'));
const state = emptyState();
try {
  for (const file of files) {
    const text = await ocr.read(file);
    const parsed = parseScreen(text, names, rules);
    console.log(`\n=== ${file} ===\n--- texte lu ---\n${text.trim()}\n--- analyse ---`);
    console.log(JSON.stringify(parsed, null, 2));
    console.log('--- synchronisation ---');
    for (const change of applyParse(state, parsed, { source: file })) console.log(`• ${change}`);
  }
} finally {
  await ocr.stop();
}
