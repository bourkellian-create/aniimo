import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const LANGS = ['eng', 'fra'];

/**
 * Lecteur OCR hors ligne : les données de langue viennent des paquets npm
 * @tesseract.js-data/*, regroupées dans un seul dossier au premier lancement.
 */
export class OcrReader {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.worker = null;
  }

  async start() {
    if (this.worker) return;
    const langPath = join(this.cacheDir, 'tessdata');
    await mkdir(langPath, { recursive: true });
    for (const lang of LANGS) {
      const pkgDir = dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
      const src = join(pkgDir, '4.0.0_best_int', `${lang}.traineddata.gz`);
      await copyFile(src, join(langPath, `${lang}.traineddata.gz`));
    }
    this.worker = await createWorker(LANGS, 1, { langPath, cachePath: langPath, gzip: true });
  }

  /** @param {Buffer|string} image PNG/JPEG en mémoire ou chemin de fichier */
  async read(image) {
    await this.start();
    const { data } = await this.worker.recognize(image);
    return data.text;
  }

  async stop() {
    await this.worker?.terminate();
    this.worker = null;
  }
}
