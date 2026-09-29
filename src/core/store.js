import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { emptyState } from './sync.js';

/** État du joueur sauvegardé dans un fichier JSON local. */
export class Store {
  constructor(file) {
    this.file = file;
    this.state = emptyState();
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      this.state = { ...emptyState(), ...JSON.parse(await readFile(this.file, 'utf8')) };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    return this.state;
  }

  /** Écriture atomique, sérialisée pour ne jamais mélanger deux sauvegardes. */
  save() {
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(this.state, null, 2));
      await rename(tmp, this.file);
    });
    return this.writing;
  }
}
