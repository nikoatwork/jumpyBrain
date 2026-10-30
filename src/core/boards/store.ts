import { constants } from 'node:fs';
import { lstat, open, realpath, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertCompatibleMemoryRoot } from '../memory-root/index.js';
import { BoardError, BOARD_ID_PATTERN, validateBoard, type Board, type BoardList, type BoardRecord } from './model.js';

const maximum = 65536;
const hash = (bytes: Buffer) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const fail = (code: ConstructorParameters<typeof BoardError>[0], message: string): never => { throw new BoardError(code, message); };
const boardFile = (directory: string, id: string) => {
  if (!BOARD_ID_PATTERN.test(id)) fail('invalid_board', 'Use a valid board ID.');
  return path.join(directory, id + '.json');
};
async function directoryFor(rootArg: string, create = false) {
  const root = await realpath(path.resolve(rootArg));
  await assertCompatibleMemoryRoot(root);
  const directory = path.join(root, 'boards');
  if (create) await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('board_unsafe', 'The boards directory must be a real directory.');
    return { directory, stat };
  } catch (error) { if (!create && missing(error)) return { directory, stat: null }; throw error; }
}
async function readFile(filename: string): Promise<BoardRecord> {
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => {
    if (missing(error)) fail('board_missing', 'Board not found.');
    if (error.code === 'ELOOP') fail('board_unsafe', 'Board files must not be links.');
    throw error;
  });
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > maximum) fail('board_unsafe', 'Board files must be regular single-link files of at most 64 KiB.');
    const bytes = Buffer.alloc(maximum + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, size);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    const after = await handle.stat(), current = await lstat(filename);
    if (size > maximum || before.size !== size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || current.isSymbolicLink() || current.dev !== after.dev || current.ino !== after.ino || current.nlink !== 1) fail('board_conflict', 'Board changed during reading. Read it again.');
    const content = bytes.subarray(0, size);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
    catch { fail('invalid_board', 'Board file contains invalid JSON or UTF-8.'); }
    const board = validateBoard(parsed);
    if (path.basename(filename) !== board.id + '.json') fail('invalid_board', 'Board ID must match its filename.');
    return { board, contentHash: hash(content) };
  } finally { await handle.close(); }
}
async function checkDirectory(context: Awaited<ReturnType<typeof directoryFor>>) {
  const current = await lstat(context.directory);
  if (current.isSymbolicLink() || !current.isDirectory() || current.ino !== context.stat?.ino || current.dev !== context.stat?.dev) fail('board_conflict', 'Boards directory changed. Retry after checking the memory root.');
}
export async function listBoardFiles(root: string): Promise<BoardList> {
  const context = await directoryFor(root);
  const packet: BoardList = { boards: [], hashes: {} };
  if (!context.stat) return packet;
  const entries = (await readdir(context.directory)).filter(name => !name.startsWith('.') && name.endsWith('.json')).sort();
  if (entries.length > 100) fail('invalid_board', 'A brain supports at most 100 boards.');
  for (const name of entries) {
    if (!BOARD_ID_PATTERN.test(name.slice(0, -5))) fail('invalid_board', 'Board filenames must be board IDs.');
    const record = await readFile(path.join(context.directory, name));
    packet.boards.push(record.board); packet.hashes[record.board.id] = record.contentHash;
  }
  await checkDirectory(context);
  return packet;
}
export async function readBoardFile(root: string, id: string): Promise<BoardRecord> {
  const context = await directoryFor(root), file = boardFile(context.directory, id);
  if (!context.stat) return fail('board_missing', 'Board not found.');
  const result = await readFile(file);
  await checkDirectory(context);
  return result;
}
async function mutate<T>(root: string, operation: (context: Awaited<ReturnType<typeof directoryFor>>) => Promise<T>): Promise<T> {
  const context = await directoryFor(root, true), lockFile = path.join(context.directory, '.write.lock');
  const lock = await open(lockFile, 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') fail('board_busy', 'Another board writer is active. Read again before retrying; inspect a stale lock only after confirming no writer is running.');
    throw error;
  });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }) + '\n');
    await checkDirectory(context);
    return await operation(context);
  } finally { await lock.close(); await unlink(lockFile).catch(() => {}); }
}
export async function saveBoardFile(root: string, value: unknown, ifMatch?: string): Promise<BoardRecord> {
  const board: Board = validateBoard(value);
  if (ifMatch !== undefined && !/^sha256:[0-9a-f]{64}$/.test(ifMatch)) fail('invalid_board', 'Use the prior board content hash.');
  const bytes = Buffer.from(JSON.stringify(board, null, 2) + '\n');
  if (bytes.length > maximum) fail('invalid_board', 'Board exceeds 64 KiB.');
  return mutate(root, async context => {
    const file = boardFile(context.directory, board.id);
    if (ifMatch !== undefined) {
      if ((await readFile(file)).contentHash !== ifMatch) fail('board_conflict', 'Board changed. Read it again before saving.');
    } else {
      try { await lstat(file); fail('board_conflict', 'Board already exists. Read it before retrying creation.'); }
      catch (error) { if (!missing(error)) throw error; }
      if ((await listBoardFiles(root)).boards.length >= 100) fail('invalid_board', 'A brain supports at most 100 boards.');
    }
    const temporary = path.join(context.directory, '.' + randomUUID() + '.tmp');
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await checkDirectory(context);
      if (ifMatch !== undefined) {
        if ((await readFile(file)).contentHash !== ifMatch) fail('board_conflict', 'Board changed before publication.');
        await rename(temporary, file);
      } else {
        // The root lock protects cooperating creators; recheck before atomic publication.
        try { await lstat(file); fail('board_conflict', 'Board already exists.'); }
        catch (error) { if (!missing(error)) throw error; }
        await rename(temporary, file);
      }
    } finally { await unlink(temporary).catch(() => {}); }
    return { board, contentHash: hash(bytes) };
  });
}
export async function deleteBoardFile(root: string, id: string, ifMatch: string) {
  if (!/^sha256:[0-9a-f]{64}$/.test(ifMatch)) fail('invalid_board', 'Use the prior board content hash.');
  return mutate(root, async context => {
    const file = boardFile(context.directory, id);
    if ((await readFile(file)).contentHash !== ifMatch) fail('board_conflict', 'Board changed. Read it again before deleting.');
    await checkDirectory(context);
    await unlink(file);
    return { id, deleted: true as const, notesPreserved: true as const };
  });
}
