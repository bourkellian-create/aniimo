/**
 * Transforme ce qui a été lu à l'écran en modifications de l'état du joueur.
 * Les lectures sûres sont appliquées directement ; les lectures douteuses
 * partent dans `pending` pour que le joueur les confirme dans l'app.
 */

export const AUTO_SCORE = 0.9;
const CATCH_COOLDOWN_MS = 90_000;
const MAX_EVENTS = 500;

export function emptyState() {
  return {
    version: 1,
    profile: { uid: null, aniilog: null },
    collection: {},
    aniilogSeen: {},
    friends: {},
    pending: [],
    events: [],
  };
}

/**
 * @param {ReturnType<typeof emptyState>} state modifié sur place
 * @param {ReturnType<import('./parser.js').parseScreen>} parsed
 * @param {{source: string, at?: number}} meta
 * @returns {string[]} résumé lisible de ce qui a changé
 */
export function applyParse(state, parsed, { source, at = Date.now() }) {
  const changes = [];
  const log = (type, summary) => {
    changes.push(summary);
    state.events.unshift({ at, type, summary, source });
    state.events.length = Math.min(state.events.length, MAX_EVENTS);
  };

  const { screen, aniimo, uid, progress, variants, affinityLevel } = parsed;
  const isMine = !uid || uid === state.profile.uid;

  // Seul un écran de profil peut révéler ton UID ; la progression lue avec attend ta confirmation.
  if (uid && !state.profile.uid && screen === 'profile') {
    addPending(state, { kind: 'uid', uid, progress, source, at }, log, `UID ${uid} lu : est-ce le tien ?`);
  }

  if (progress && isMine && (screen === 'aniilog' || (screen === 'profile' && state.profile.uid))) {
    const prev = state.profile.aniilog;
    if (!prev || prev.caught !== progress.caught || prev.total !== progress.total) {
      state.profile.aniilog = { ...progress, updatedAt: at };
      log('aniilog', `Aniilog : ${progress.caught}/${progress.total}`);
    }
  }

  if (screen === 'catch') {
    const sure = aniimo.filter((m) => m.score >= AUTO_SCORE);
    if (sure.length === 1) {
      recordCatch(state, sure[0].name, variants, { source, at }, log);
    } else {
      addPending(
        state,
        { kind: 'catch', candidates: aniimo.map((m) => m.name), variants, source, at },
        log,
        aniimo.length ? `Capture à confirmer : ${aniimo.map((m) => m.name).join(' / ')}` : 'Capture détectée, nom non reconnu',
      );
    }
  }

  if (screen === 'aniilog') {
    for (const m of aniimo.filter((x) => x.score >= AUTO_SCORE)) {
      if (!state.aniilogSeen[m.name]) {
        state.aniilogSeen[m.name] = at;
        log('seen', `${m.name} vu dans l'Aniilog`);
      }
    }
  }

  if (screen === 'affinity' && affinityLevel) {
    if (uid && uid !== state.profile.uid) {
      setFriendLevel(state, uid, affinityLevel, at, log);
    } else {
      addPending(state, { kind: 'affinity', level: affinityLevel, source, at }, log, `Affinité « ${affinityLevel} » : avec quel ami ?`);
    }
  }

  return changes;
}

export function recordCatch(state, name, variants, { source, at }, log) {
  const entry = state.collection[name];
  // Le même écran de capture peut être lu plusieurs fois (images successives, capture d'écran + écran live).
  if (entry && source !== 'confirmation' && at - entry.lastCaughtAt < CATCH_COOLDOWN_MS) return false;
  const next = entry ?? { firstCaughtAt: at, count: 0, illusory: false, sparkling: false };
  next.count += 1;
  next.lastCaughtAt = at;
  next.illusory ||= Boolean(variants?.illusory);
  next.sparkling ||= Boolean(variants?.sparkling);
  state.collection[name] = next;
  const tags = [variants?.illusory && 'Illusory', variants?.sparkling && 'Sparkling'].filter(Boolean);
  log?.('catch', `${entry ? 'Nouvelle capture' : 'Nouveau'} : ${name}${tags.length ? ` (${tags.join(', ')})` : ''}`);
  return true;
}

export function setFriendLevel(state, uid, level, at, log) {
  const prev = state.friends[uid];
  if (prev?.level === level) return;
  state.friends[uid] = { ...prev, level, updatedAt: at };
  log?.('affinity', `Affinité avec ${prev?.name ?? uid} : ${level}`);
}

function addPending(state, item, log, summary) {
  const duplicate = state.pending.some(
    (p) => p.kind === item.kind && JSON.stringify(pendingKey(p)) === JSON.stringify(pendingKey(item)),
  );
  if (duplicate) return;
  state.pending.push({ id: `${item.at}-${Math.random().toString(36).slice(2, 8)}`, summary, ...item });
  log('pending', summary);
}

function pendingKey(p) {
  return { kind: p.kind, uid: p.uid, level: p.level, candidates: p.candidates };
}

/**
 * Le joueur répond à une lecture douteuse depuis l'app.
 * @param {{id: string, accept: boolean, name?: string, uid?: string}} answer
 */
export function resolvePending(state, { id, accept, name, uid }, at = Date.now()) {
  const index = state.pending.findIndex((p) => p.id === id);
  if (index === -1) return false;
  const [item] = state.pending.splice(index, 1);
  if (!accept) return true;

  const log = (type, summary) => state.events.unshift({ at, type, summary, source: 'confirmation' });
  if (item.kind === 'uid') {
    state.profile.uid = item.uid;
    log('profile', `UID enregistré : ${item.uid}`);
    if (item.progress) state.profile.aniilog = { ...item.progress, updatedAt: item.at };
  } else if (item.kind === 'catch' && name) {
    recordCatch(state, name, item.variants, { source: 'confirmation', at }, log);
  } else if (item.kind === 'affinity' && uid) {
    setFriendLevel(state, uid, item.level, at, log);
  }
  return true;
}
