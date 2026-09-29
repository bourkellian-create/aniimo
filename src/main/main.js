import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import chokidar from 'chokidar';
import { loadNames, loadRules } from '../core/data.js';
import { dHash, hamming, prepareForOcr } from '../core/image.js';
import { OcrReader } from '../core/ocr.js';
import { parseScreen } from '../core/parser.js';
import { Store } from '../core/store.js';
import { applyParse, resolvePending } from '../core/sync.js';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp']);
const SAME_SCREEN_DISTANCE = 4;
const OCR_MIN_WIDTH = 1600;

let win;
let store;
let names;
let rules;
let ocr;
let watcher;
let captureTimer;
let settings;
let lastScreenHash = null;
let busy = false;
const queue = [];
const status = { gameWindow: null, lastRead: null, queue: 0, error: null };

const userFile = (name) => join(app.getPath('userData'), name);

function defaultSettings() {
  const screenshots = join(app.getPath('pictures'), 'Screenshots');
  return {
    screenshotDirs: existsSync(screenshots) ? [screenshots] : [],
    autoCapture: true,
    intervalSec: 4,
    windowMatch: 'Aniimo',
    extraNames: [],
  };
}

async function loadSettings() {
  try {
    return { ...defaultSettings(), ...JSON.parse(await readFile(userFile('settings.json'), 'utf8')) };
  } catch {
    return defaultSettings();
  }
}

async function saveSettings() {
  await writeFile(userFile('settings.json'), JSON.stringify(settings, null, 2));
}

function push() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('update', { state: store.state, status, names: names.names });
}

/** Image → texte → analyse → état du joueur. Une seule lecture OCR à la fois. */
function enqueue(job) {
  queue.push(job);
  status.queue = queue.length;
  drain();
}

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    status.queue = queue.length;
    try {
      const text = await ocr.read(job.image);
      const parsed = parseScreen(text, names, rules);
      const changes = applyParse(store.state, parsed, { source: job.source });
      status.lastRead = { at: Date.now(), source: job.source, screen: parsed.screen };
      status.error = null;
      if (changes.length) await store.save();
    } catch (err) {
      status.error = `Lecture impossible (${job.label}) : ${err.message}`;
    }
    push();
  }
  busy = false;
}

/** Agrandit les petites images et met le texte en noir sur blanc pour l'OCR. */
function toOcrPng(image) {
  let img = image;
  const { width } = img.getSize();
  if (width < OCR_MIN_WIDTH) img = img.resize({ width: OCR_MIN_WIDTH, quality: 'best' });
  const size = img.getSize();
  return nativeImage.createFromBitmap(prepareForOcr(img.toBitmap()), size).toPNG();
}

// --- Captures d'écran déposées dans un dossier (touche Impr. écran, Steam, outil Capture…) ---

function watchScreenshots() {
  watcher?.close();
  if (!settings.screenshotDirs.length) return;
  watcher = chokidar.watch(settings.screenshotDirs, {
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
  });
  watcher.on('add', (file) => importFile(file, 'capture d’écran'));
}

function importFile(file, source) {
  if (!IMAGE_EXT.has(extname(file).toLowerCase())) return;
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) return;
  enqueue({ image: toOcrPng(image), source, label: file });
}

// --- Lecture automatique de la fenêtre du jeu ---

function scheduleCapture() {
  clearInterval(captureTimer);
  if (!settings.autoCapture) {
    status.gameWindow = null;
    return;
  }
  captureTimer = setInterval(captureGameWindow, Math.max(2, settings.intervalSec) * 1000);
}

async function captureGameWindow() {
  if (busy || queue.length) return;
  try {
    const ownId = win.getMediaSourceId();
    const match = settings.windowMatch.toLowerCase();
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    const game = sources.find((s) => s.id !== ownId && s.name.toLowerCase().includes(match) && !s.name.includes('Aniimo Sync'));
    status.gameWindow = game?.name ?? null;
    if (!game || game.thumbnail.isEmpty()) return push();

    // On ne relit l'écran que s'il a changé : l'OCR coûte cher.
    const hash = dHash(game.thumbnail.resize({ width: 9, height: 8 }).toBitmap());
    if (lastScreenHash && hamming(hash, lastScreenHash) <= SAME_SCREEN_DISTANCE) return;
    lastScreenHash = hash;
    enqueue({ image: toOcrPng(game.thumbnail), source: 'écran du jeu', label: game.name });
  } catch (err) {
    status.error = `Capture de la fenêtre impossible : ${err.message}`;
    push();
  }
}

// --- Échanges avec l'interface ---

function registerIpc() {
  ipcMain.handle('get', () => ({ state: store.state, status, names: names.names, settings }));

  ipcMain.handle('resolve', async (_e, answer) => {
    resolvePending(store.state, answer);
    await store.save();
    push();
  });

  ipcMain.handle('set-settings', async (_e, patch) => {
    settings = { ...settings, ...patch };
    await saveSettings();
    watchScreenshots();
    scheduleCapture();
    return settings;
  });

  ipcMain.handle('add-name', async (_e, name) => {
    if (!names.add(name)) return false;
    settings.extraNames = [...new Set([...settings.extraNames, name.trim()])];
    await saveSettings();
    push();
    return true;
  });

  ipcMain.handle('choose-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (canceled) return settings;
    settings.screenshotDirs = [...new Set([...settings.screenshotDirs, filePaths[0]])];
    await saveSettings();
    watchScreenshots();
    return settings;
  });

  ipcMain.handle('import-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: [...IMAGE_EXT].map((e) => e.slice(1)) }],
    });
    if (!canceled) for (const file of filePaths) importFile(file, 'import manuel');
  });

  ipcMain.handle('set-friend', async (_e, { uid, name, level }) => {
    const friend = store.state.friends[uid] ?? { level: null, updatedAt: Date.now() };
    store.state.friends[uid] = { ...friend, ...(name !== undefined && { name }), ...(level !== undefined && { level }) };
    await store.save();
    push();
  });

  ipcMain.handle('remove-friend', async (_e, uid) => {
    delete store.state.friends[uid];
    await store.save();
    push();
  });

  ipcMain.handle('set-uid', async (_e, uid) => {
    store.state.profile.uid = uid || null;
    await store.save();
    push();
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    title: 'Aniimo Sync',
    backgroundColor: '#12151f',
    webPreferences: { preload: join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  await win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  settings = await loadSettings();
  store = new Store(userFile('aniimo-state.json'));
  await store.load();
  rules = await loadRules();
  names = await loadNames(settings.extraNames);
  ocr = new OcrReader(app.getPath('userData'));

  registerIpc();
  await createWindow();
  watchScreenshots();
  scheduleCapture();
});

app.on('window-all-closed', async () => {
  clearInterval(captureTimer);
  await watcher?.close();
  await ocr?.stop();
  app.quit();
});
