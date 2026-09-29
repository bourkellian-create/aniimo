const api = window.aniimo;
const $ = (sel) => document.querySelector(sel);

let data = { state: null, status: {}, names: [] };
let settings = null;

/** Crée un élément ; le texte passe toujours par textContent (données lues à l'écran). */
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children.flat()) if (child != null) node.append(child);
  return node;
}

const fmtDate = (at) =>
  at ? new Date(at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// --- Onglets ---

document.querySelectorAll('nav button').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button, .tab').forEach((n) => n.classList.remove('active'));
    btn.classList.add('active');
    $(`#${btn.dataset.tab}`).classList.add('active');
  }),
);

// --- Rendu ---

function renderStatus() {
  const { gameWindow, lastRead, queue, error } = data.status;
  const autoOn = settings?.autoCapture;
  $('#status').replaceChildren(...[
    el('span', { className: gameWindow ? 'on' : '' }, el('span', { className: 'dot' }),
      !autoOn ? 'Lecture auto désactivée' : gameWindow ? `Jeu détecté : ${gameWindow}` : 'Jeu non détecté'),
    lastRead ? el('span', {}, `Dernière lecture ${fmtDate(lastRead.at)} (${lastRead.screen})`) : null,
    queue ? el('span', {}, `${queue} en attente`) : null,
    error ? el('span', { className: 'error' }, error) : null,
  ].filter(Boolean));
}

function renderCollection() {
  const { collection, aniilogSeen, profile } = data.state;
  const all = [...new Set([...data.names, ...Object.keys(collection)])].sort((a, b) => a.localeCompare(b, 'fr'));
  const filter = $('#filter').value.trim().toLowerCase();
  const caught = Object.values(collection);

  $('#caught-count').textContent = caught.length;
  const illusory = caught.filter((c) => c.illusory).length;
  $('#illusory-count').textContent = illusory ? `· ${illusory} Illusory` : '';

  $('#aniilog-progress').hidden = !profile.aniilog;
  if (profile.aniilog) {
    const { caught: n, total } = profile.aniilog;
    $('#aniilog-label').textContent = `Aniilog en jeu : ${n}/${total}`;
    $('#aniilog-bar').style.width = `${(100 * n) / total}%`;
  }

  $('#grid').replaceChildren(
    ...all
      .filter((name) => !filter || name.toLowerCase().includes(filter))
      .map((name) => {
        const c = collection[name];
        const seen = aniilogSeen[name];
        return el('div', { className: `tile ${c ? 'caught' : seen ? 'seen' : ''}` },
          el('div', { className: 'name' }, name),
          el('div', { className: 'meta' },
            c ? `×${c.count} · depuis le ${fmtDate(c.firstCaughtAt)}` : seen ? 'Vu dans l’Aniilog' : 'Pas encore synchronisé'),
          c?.illusory ? el('span', { className: 'tag illusory' }, 'Illusory') : null,
          c?.sparkling ? el('span', { className: 'tag sparkling' }, 'Sparkling') : null,
        );
      }),
  );
}

function renderPending() {
  const { pending } = data.state;
  $('#pending-count').hidden = !pending.length;
  $('#pending-count').textContent = pending.length;

  const ignore = (id) => el('button', { onclick: () => api.resolve({ id, accept: false }) }, 'Ignorer');

  $('#pending-list').replaceChildren(
    ...(pending.length ? [] : [el('li', { className: 'muted' }, 'Rien à confirmer.')]),
    ...pending.map((p) => {
      const actions = [];
      if (p.kind === 'uid') {
        actions.push(el('button', { className: 'primary', onclick: () => api.resolve({ id: p.id, accept: true }) }, 'Oui, c’est moi'));
      } else if (p.kind === 'catch') {
        for (const name of p.candidates) {
          actions.push(el('button', { className: 'primary', onclick: () => api.resolve({ id: p.id, accept: true, name }) }, name));
        }
        const input = el('input', { placeholder: 'Autre nom…' });
        actions.push(input, el('button', {
          onclick: async () => {
            const name = input.value.trim();
            if (!name) return;
            await api.addName(name);
            api.resolve({ id: p.id, accept: true, name });
          },
        }, 'Valider'));
      } else if (p.kind === 'affinity') {
        const input = el('input', { placeholder: 'UID de l’ami' });
        input.setAttribute('list', `friend-uids-${p.id}`);
        const options = el('datalist', { id: `friend-uids-${p.id}` },
          Object.entries(data.state.friends).map(([uid, f]) => el('option', { value: uid, label: f.name ?? uid })));
        actions.push(input, options, el('button', {
          className: 'primary',
          onclick: () => /^\d{6,12}$/.test(input.value.trim()) && api.resolve({ id: p.id, accept: true, uid: input.value.trim() }),
        }, 'Associer'));
      }
      actions.push(ignore(p.id));
      return el('li', { className: 'card' },
        el('p', {}, p.summary),
        el('p', { className: 'muted' }, `${p.source} · ${fmtDate(p.at)}`),
        el('div', { className: 'actions' }, actions));
    }),
  );
}

function renderFriends() {
  const rows = Object.entries(data.state.friends).sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  $('#friends-list').replaceChildren(
    ...(rows.length ? [] : [el('tr', {}, el('td', { colSpan: 5, className: 'muted' }, 'Ouvre la fiche d’un ami en jeu : son affinité sera lue automatiquement.'))]),
    ...rows.map(([uid, f]) => {
      const name = el('input', { value: f.name ?? '', placeholder: 'Pseudo' });
      name.addEventListener('change', () => api.setFriend({ uid, name: name.value.trim() }));
      return el('tr', {},
        el('td', {}, name),
        el('td', {}, uid),
        el('td', {}, f.level ?? '—'),
        el('td', { className: 'muted' }, fmtDate(f.updatedAt)),
        el('td', {}, el('button', { onclick: () => api.removeFriend(uid) }, 'Retirer')));
    }),
  );
}

function renderJournal() {
  const { events } = data.state;
  $('#events').replaceChildren(
    ...(events.length ? [] : [el('li', { className: 'muted' }, 'Rien pour l’instant : lance le jeu ou dépose une capture d’écran.')]),
    ...events.slice(0, 200).map((e) =>
      el('li', {}, el('time', {}, fmtDate(e.at)), el('span', {}, e.summary), el('span', { className: 'src' }, e.source))),
  );
}

function renderSettings() {
  if (!settings) return;
  $('#auto-capture').checked = settings.autoCapture;
  $('#interval').value = settings.intervalSec;
  $('#window-match').value = settings.windowMatch;
  $('#my-uid').value = data.state.profile.uid ?? '';
  $('#folders').replaceChildren(
    ...(settings.screenshotDirs.length ? [] : [el('li', { className: 'muted' }, 'Aucun dossier surveillé.')]),
    ...settings.screenshotDirs.map((dir) =>
      el('li', {}, dir, el('button', {
        onclick: async () => {
          settings = await api.setSettings({ screenshotDirs: settings.screenshotDirs.filter((d) => d !== dir) });
          renderSettings();
        },
      }, '×'))),
  );
  $('#names').textContent = `${data.names.length} noms : ${data.names.join(', ')}`;
}

function render() {
  if (!data.state) return;
  renderStatus();
  renderCollection();
  renderPending();
  renderFriends();
  renderJournal();
  renderSettings();
}

// --- Actions ---

$('#filter').addEventListener('input', renderCollection);

$('#friend-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  api.setFriend({ uid: form.get('uid').trim(), name: form.get('name').trim() || undefined });
  e.target.reset();
});

$('#name-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api.addName(new FormData(e.target).get('name'));
  e.target.reset();
});

const saveSetting = (patch) => api.setSettings(patch).then((s) => { settings = s; renderStatus(); });
$('#auto-capture').addEventListener('change', (e) => saveSetting({ autoCapture: e.target.checked }));
$('#interval').addEventListener('change', (e) => saveSetting({ intervalSec: Number(e.target.value) || 4 }));
$('#window-match').addEventListener('change', (e) => saveSetting({ windowMatch: e.target.value.trim() || 'Aniimo' }));
$('#my-uid').addEventListener('change', (e) => e.target.checkValidity() && api.setUid(e.target.value.trim()));
$('#add-folder').addEventListener('click', async () => { settings = await api.chooseFolder(); renderSettings(); });
$('#import').addEventListener('click', () => api.importFiles());

api.onUpdate((update) => {
  data = { ...data, ...update };
  render();
});

api.get().then((initial) => {
  settings = initial.settings;
  data = initial;
  render();
});
