import { readFile, lstat, open, rename, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateBoards, type Board } from '../../app/collections/index.js';
type Packet = { revision: number; boards: Board[] };
/** One host owns the file. A serialized queue and revision checks protect multiple windows. */
export function createCollectionStore(directory: string) {
  const file = path.join(directory, 'collections.json');
  let tail: Promise<unknown> = Promise.resolve();
  async function read(): Promise<{ version: number; scopes: Record<string, Packet> }> {
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 8_000_000) throw new Error('Unsafe board configuration.');
      const bytes = await readFile(file, 'utf8');
      if (bytes.length > 8_000_000) throw new Error('Board configuration is too large.');
      const data = JSON.parse(bytes);
      if (data.version !== 1 || !data.scopes || typeof data.scopes !== 'object' || Array.isArray(data.scopes)) throw new Error('Unsupported board configuration.');
      for (const p of Object.values(data.scopes) as Packet[]) { if (!Number.isSafeInteger(p.revision) || p.revision < 0) throw new Error('Invalid revision.'); validateBoards(p.boards); }
      return data;
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, scopes: {} }; throw e; }
  }
  return {
    async get(scope: string): Promise<Packet> { await tail; return (await read()).scopes[scope] || { revision: 0, boards: [] }; },
    put(scope: string, revision: number, value: unknown): Promise<Packet> {
      const operation = tail.then(async () => {
        const boards = validateBoards(value), data = await read();
        if (revision !== (data.scopes[scope]?.revision || 0)) throw Object.assign(new Error('Boards changed in another window. Reload and try again.'), { status: 409 });
        const packet = { revision: revision + 1, boards }; data.scopes[scope] = packet;
        const bytes = JSON.stringify(data) + '\n';
        if (bytes.length > 8_000_000) throw new Error('Board configuration is full.');
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = file + '.' + randomUUID();
        try { const handle = await open(temporary, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } await rename(temporary, file); }
        finally { await unlink(temporary).catch(() => {}); }
        return packet;
      });
      tail = operation.catch(() => {}); return operation;
    },
  };
}
