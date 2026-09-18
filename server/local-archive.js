import { mkdir, readdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('.races');
export const localArchive = {
  async list() {
    await mkdir(directory, { recursive: true });
    const files = (await readdir(directory)).filter((f) => f.endsWith('.json'));
    const races = await Promise.all(
      files.map(async (f) => {
        const { frames, ...meta } = JSON.parse(await readFile(resolve(directory, f), 'utf8'));
        return meta;
      }),
    );
    return races.sort((a, b) => b.created - a.created).slice(0, 50);
  },
  async get(owner, id) {
    try {
      return JSON.parse(await readFile(resolve(directory, id + '.json'), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  },
  async put(owner, r) {
    await mkdir(directory, { recursive: true });
    const temp = resolve(directory, r.id + '.tmp');
    await writeFile(temp, JSON.stringify(r));
    await rename(temp, resolve(directory, r.id + '.json'));
  },
  async remove(owner, id) {
    await unlink(resolve(directory, id + '.json')).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  },
};
