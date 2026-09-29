// Chaîne complète sur des captures synthétiques (texte clair sur fond sombre).
// Les vraies captures du jeu sont à ajouter dans test/fixtures/ pour calibrer.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { loadNames, loadRules } from '../src/core/data.js';
import { OcrReader } from '../src/core/ocr.js';
import { parseScreen } from '../src/core/parser.js';

const names = await loadNames();
const rules = await loadRules();
const ocr = new OcrReader(join(tmpdir(), 'aniimo-sync-test'));
after(() => ocr.stop());

const read = async (name) => parseScreen(await ocr.read(join(import.meta.dirname, 'fixtures', name)), names, rules);

test('OCR : capture en français', async () => {
  const r = await read('catch-fr.png');
  assert.equal(r.screen, 'catch');
  assert.deepEqual(r.aniimo.map((a) => a.name), ['Inferlupa']);
});

test('OCR : capture Illusory en anglais', async () => {
  const r = await read('catch-en-illusory.png');
  assert.equal(r.screen, 'catch');
  assert.deepEqual(r.aniimo.map((a) => a.name), ['Prismana Glacy']);
  assert.equal(r.variants.illusory, true);
});

test('OCR : profil', async () => {
  const r = await read('profile.png');
  assert.equal(r.screen, 'profile');
  assert.equal(r.uid, '804112937');
  assert.deepEqual(r.progress, { caught: 57, total: 210 });
});

test('OCR : affinité', async () => {
  const r = await read('affinity.png');
  assert.equal(r.screen, 'affinity');
  assert.equal(r.affinityLevel, 'Good Friend');
});
