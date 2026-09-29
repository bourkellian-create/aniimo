import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadNames, loadRules } from '../src/core/data.js';
import { dHash, hamming, prepareForOcr } from '../src/core/image.js';
import { NameIndex } from '../src/core/names.js';
import { extractProgress, extractUid, parseScreen } from '../src/core/parser.js';
import { Store } from '../src/core/store.js';
import { applyParse, emptyState, resolvePending } from '../src/core/sync.js';
import { normalize } from '../src/core/text.js';

const rules = await loadRules();
const names = await loadNames();

test('normalize retire accents et ponctuation', () => {
  assert.equal(normalize("Ajouté à l'Aniilog !"), 'ajoute a l aniilog');
});

test('NameIndex tolère les erreurs d’OCR sur les noms longs', () => {
  const found = names.find('Capture réussie ! Inferlvpa');
  assert.deepEqual(found.map((f) => f.name), ['Inferlupa']);
});

test('NameIndex préfère le nom composé à sa partie', () => {
  const found = names.find('Prismana Glacy');
  assert.deepEqual(found.map((f) => f.name), ['Prismana Glacy']);
});

test('NameIndex est strict sur les noms courts', () => {
  assert.deepEqual(names.find('Tuba'), []);
  assert.deepEqual(names.find('TURBO').map((f) => f.name), ['Turbo']);
});

test('NameIndex ignore les doublons et accepte les ajouts du joueur', () => {
  const index = new NameIndex(['Turbo']);
  assert.equal(index.add('turbo'), false);
  assert.equal(index.add('Nouvelmon'), true);
  assert.deepEqual(index.find('un Nouvelmon sauvage').map((f) => f.name), ['Nouvelmon']);
});

test('extractUid lit les UID même mal reconnus', () => {
  assert.equal(extractUid('UID: 804112937'), '804112937');
  assert.equal(extractUid('U1D 551230984'), '551230984');
  assert.equal(extractUid('Niveau 12'), null);
});

test('extractProgress ignore les fractions invraisemblables', () => {
  assert.deepEqual(extractProgress('HP 3/5 — Aniilog 57/210'), { caught: 57, total: 210 });
  assert.equal(extractProgress('Échanges 3/5'), null);
});

test('parseScreen reconnaît chaque type d’écran', () => {
  assert.equal(parseScreen('Capture réussie ! Inferlupa', names, rules).screen, 'catch');
  assert.equal(parseScreen('New Aniimo Caught! Turbo', names, rules).screen, 'catch');
  assert.equal(parseScreen('Pathfinder Profile UID: 804112937', names, rules).screen, 'profile');
  assert.equal(parseScreen('Affinity Good Friend', names, rules).affinityLevel, 'Good Friend');
  assert.equal(parseScreen('Affinité Illusory Friends', names, rules).affinityLevel, 'Illusory Friends');
  assert.equal(parseScreen('Paramètres graphiques', names, rules).screen, 'unknown');
});

test('une capture sûre est ajoutée, puis dédoublonnée', () => {
  const state = emptyState();
  const parsed = parseScreen('New Aniimo Caught! Prismana Glacy Illusory', names, rules);
  applyParse(state, parsed, { source: 'screen', at: 1000 });
  applyParse(state, parsed, { source: 'screenshot', at: 5000 });
  assert.equal(state.collection['Prismana Glacy'].count, 1);
  assert.equal(state.collection['Prismana Glacy'].illusory, true);
  applyParse(state, parsed, { source: 'screen', at: 200_000 });
  assert.equal(state.collection['Prismana Glacy'].count, 2);
});

test('une capture ambiguë part en confirmation', () => {
  const state = emptyState();
  applyParse(state, parseScreen('Caught! Stellarys Somniwing', names, rules), { source: 'screen', at: 1 });
  assert.deepEqual(state.collection, {});
  assert.equal(state.pending.length, 1);
  assert.deepEqual(state.pending[0].candidates.sort(), ['Somniwing', 'Stellarys']);
  resolvePending(state, { id: state.pending[0].id, accept: true, name: 'Somniwing' }, 2);
  assert.equal(state.collection.Somniwing.count, 1);
  assert.equal(state.pending.length, 0);
});

test('le profil demande confirmation de l’UID puis applique la progression', () => {
  const state = emptyState();
  applyParse(state, parseScreen('Pathfinder Profile UID: 804112937 Aniilog 57/210', names, rules), { source: 'screen', at: 1 });
  assert.equal(state.profile.uid, null);
  assert.equal(state.pending[0].kind, 'uid');
  resolvePending(state, { id: state.pending[0].id, accept: true });
  assert.equal(state.profile.uid, '804112937');
  assert.equal(state.profile.aniilog.caught, 57);
});

test('l’affinité d’un ami est suivie par UID', () => {
  const state = emptyState();
  state.profile.uid = '804112937';
  applyParse(state, parseScreen('Affinity UID 551230984 Good Friend', names, rules), { source: 'screen', at: 1 });
  assert.equal(state.friends['551230984'].level, 'Good Friend');
  assert.equal(state.pending.length, 0);
});

test('l’affinité sans UID lisible demande à quel ami la rattacher', () => {
  const state = emptyState();
  applyParse(state, parseScreen('Affinité Good Friend', names, rules), { source: 'screen', at: 1 });
  applyParse(state, parseScreen('Affinité Good Friend', names, rules), { source: 'screen', at: 2 });
  assert.equal(state.pending.length, 1);
  resolvePending(state, { id: state.pending[0].id, accept: true, uid: '123456789' });
  assert.equal(state.friends['123456789'].level, 'Good Friend');
});

function bitmap(width, height, fn) {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = fn(x, y);
      buf.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return buf;
}

test('dHash distingue deux écrans et reconnaît le même', () => {
  const a = dHash(bitmap(9, 8, (x) => x * 20));
  const b = dHash(bitmap(9, 8, (x) => x * 20 + 3));
  const c = dHash(bitmap(9, 8, (x) => 200 - x * 20));
  assert.equal(hamming(a, b), 0);
  assert.equal(hamming(a, c), 64);
});

test('prepareForOcr inverse les écrans sombres', () => {
  const dark = bitmap(4, 1, (x) => (x === 0 ? 250 : 10));
  const out = prepareForOcr(dark);
  assert.equal(out[0], 0);
  assert.equal(out[4], 255);
});

test('Store sauvegarde et recharge l’état', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'aniimo-')), 'state.json');
  const store = new Store(file);
  await store.load();
  store.state.profile.uid = '42424242';
  await store.save();
  assert.equal(JSON.parse(await readFile(file, 'utf8')).profile.uid, '42424242');
  const again = new Store(file);
  await again.load();
  assert.equal(again.state.profile.uid, '42424242');
});
