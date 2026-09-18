import { mkdir, readdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('.races');
const communityDirectory = resolve(directory, 'community');
export const localArchive = {
  async community() {
    await mkdir(communityDirectory, { recursive: true });
    const files = (await readdir(communityDirectory)).filter((f) => f.endsWith('.json'));
    const records = await Promise.all(
      files.map(async (file) => {
        const { frames, ...meta } = JSON.parse(
          await readFile(resolve(communityDirectory, file), 'utf8'),
        );
        return { ...meta, shared: true };
      }),
    );
    return records.sort((a, b) => b.created - a.created).slice(0, 30);
  },
  async publicRace(id) {
    try {
      return {
        ...JSON.parse(await readFile(resolve(communityDirectory, id + '.json'), 'utf8')),
        shared: true,
      };
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  },
  async publish(owner, id, published) {
    const record = await this.get(owner, id);
    if (!record || (published && !record.finished)) return null;
    await mkdir(communityDirectory, { recursive: true });
    if (published)
      await writeFile(resolve(communityDirectory, id + '.json'), JSON.stringify(record));
    else
      await unlink(resolve(communityDirectory, id + '.json')).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    return id;
  },
  async list() {
    await mkdir(directory, { recursive: true });
    const files = (await readdir(directory)).filter((f) => f.endsWith('.json'));
    const races = await Promise.all(
      files.map(async (f) => {
        const { frames, ...meta } = JSON.parse(await readFile(resolve(directory, f), 'utf8'));
        return { ...meta, published: !!(await localArchive.publicRace(meta.id)) };
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
    await this.publish(owner, id, false);
    await unlink(resolve(directory, id + '.json')).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  },
};
