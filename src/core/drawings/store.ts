import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile as readPath, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertCompatibleMemoryRoot } from '../memory-root/index.js';
import { DRAWING_EXTENSION, DRAWING_MAX_BYTES, DRAWING_MAX_FILES, DrawingError, emptyDrawingScene, isDrawingName, validateDrawingScene,
  type DrawingErrorCode, type DrawingList, type DrawingRecord, type DrawingSummary } from './model.js';

const hash = (bytes: Buffer) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const fail = (code: DrawingErrorCode, message: string): never => { throw new DrawingError(code, message); };
const validHash = (value: unknown): value is string => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
type Context = { directory: string; exists: boolean };

function drawingFile(context: Context, name: unknown): string {
  if (!isDrawingName(name)) return fail('invalid_drawing', 'Use a drawing name of 1–100 characters without slashes, brackets, colons, # or |.');
  return path.join(context.directory, name + DRAWING_EXTENSION);
}
async function directoryFor(rootArg: string, create = false): Promise<Context> {
  const root = await realpath(path.resolve(rootArg));
  await assertCompatibleMemoryRoot(root);
  const directory = path.join(root, 'drawings');
  if (create) await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('drawing_unsafe', 'The drawings directory must be a real directory.');
    return { directory, exists: true };
  } catch (error) { if (!create && missing(error)) return { directory, exists: false }; throw error; }
}
async function readBytes(filename: string): Promise<{ bytes: Buffer; updatedAt: string }> {
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => {
    if (missing(error)) fail('drawing_missing', 'Drawing not found.');
    if (error.code === 'ELOOP') fail('drawing_unsafe', 'Drawing files must not be links.');
    throw error;
  });
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > DRAWING_MAX_BYTES) fail('drawing_unsafe', 'Drawing files must be regular files of at most 4 MiB.');
    const bytes = await handle.readFile();
    if (bytes.length > DRAWING_MAX_BYTES) fail('drawing_unsafe', 'Drawing files must be regular files of at most 4 MiB.');
    return { bytes, updatedAt: stat.mtime.toISOString() };
  } finally { await handle.close(); }
}
async function readRecord(filename: string, name: string): Promise<DrawingRecord> {
  const { bytes, updatedAt } = await readBytes(filename);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('invalid_drawing', 'Drawing file contains invalid JSON or UTF-8.'); }
  return { name, scene: validateDrawingScene(parsed), contentHash: hash(bytes), updatedAt };
}
/** Lists by file metadata only; unsupported entries are counted, never repaired or removed. */
export async function listDrawingFiles(root: string): Promise<DrawingList> {
  const context = await directoryFor(root);
  const packet: DrawingList = { drawings: [], skipped: 0 };
  if (!context.exists) return packet;
  const entries = (await readdir(context.directory)).filter(entry => !entry.startsWith('.') && entry.toLowerCase().endsWith(DRAWING_EXTENSION));
  const found: DrawingSummary[] = [];
  for (const entry of entries) {
    const name = entry.slice(0, -DRAWING_EXTENSION.length);
    const stat = await lstat(path.join(context.directory, entry)).catch(() => null);
    if (!isDrawingName(name) || !entry.endsWith(DRAWING_EXTENSION) || !stat?.isFile() || stat.size > DRAWING_MAX_BYTES) { packet.skipped++; continue; }
    found.push({ name, bytes: stat.size, updatedAt: stat.mtime.toISOString() });
  }
  found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  packet.skipped += Math.max(0, found.length - DRAWING_MAX_FILES);
  packet.drawings = found.slice(0, DRAWING_MAX_FILES);
  return packet;
}
export async function readDrawingFile(root: string, name: string): Promise<DrawingRecord> {
  const context = await directoryFor(root), file = drawingFile(context, name);
  if (!context.exists) return fail('drawing_missing', 'Drawing not found.');
  return readRecord(file, name);
}
async function mutate<T>(root: string, operation: (context: Context) => Promise<T>): Promise<T> {
  const context = await directoryFor(root, true), lockFile = path.join(context.directory, '.write.lock');
  const acquire = () => open(lockFile, 'wx', 0o600);
  const lock = await acquire().catch(async error => {
    if (error.code !== 'EEXIST') throw error;
    // An autosaving editor must not stay blocked by a crashed writer on this machine.
    const holder = await readPath(lockFile, 'utf8').then(text => Number(JSON.parse(text).pid)).catch(() => NaN);
    let alive = true;
    if (Number.isInteger(holder) && holder > 0) { try { process.kill(holder, 0); } catch (probe) { alive = (probe as NodeJS.ErrnoException).code !== 'ESRCH'; } }
    if (alive) return fail('drawing_busy', 'Another drawing writer is active. Try again in a moment.');
    await unlink(lockFile).catch(() => {});
    return acquire().catch(() => fail('drawing_busy', 'Another drawing writer is active. Try again in a moment.'));
  });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }) + '\n');
    return await operation(context);
  } finally { await lock.close(); await unlink(lockFile).catch(() => {}); }
}
async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; } catch (error) { if (missing(error)) return false; throw error; }
}
async function publish(context: Context, file: string, bytes: Buffer): Promise<void> {
  const temporary = path.join(context.directory, '.' + randomUUID() + '.tmp');
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}
function serialize(value: unknown): Buffer {
  const bytes = Buffer.from(JSON.stringify(validateDrawingScene(value), null, 2) + '\n');
  if (bytes.length > DRAWING_MAX_BYTES) fail('invalid_drawing', 'Drawing exceeds 4 MiB. Remove or shrink embedded images.');
  return bytes;
}
export async function createDrawingFile(root: string, name: string, scene: unknown = emptyDrawingScene()): Promise<DrawingRecord> {
  const bytes = serialize(scene);
  return mutate(root, async context => {
    const file = drawingFile(context, name);
    if (await exists(file)) fail('drawing_conflict', 'A drawing with this name already exists.');
    if ((await readdir(context.directory)).filter(entry => entry.endsWith(DRAWING_EXTENSION)).length >= DRAWING_MAX_FILES) fail('invalid_drawing', 'A brain supports at most 1000 drawings.');
    await publish(context, file, bytes);
    return readRecord(file, name);
  });
}
export async function saveDrawingFile(root: string, name: string, scene: unknown, ifMatch: string): Promise<DrawingRecord> {
  if (!validHash(ifMatch)) fail('invalid_drawing', 'Use the prior drawing content hash.');
  const bytes = serialize(scene);
  return mutate(root, async context => {
    const file = drawingFile(context, name);
    if (hash((await readBytes(file)).bytes) !== ifMatch) fail('drawing_conflict', 'Drawing changed. Read it again before saving.');
    await publish(context, file, bytes);
    return readRecord(file, name);
  });
}
export async function renameDrawingFile(root: string, name: string, nextName: string, ifMatch: string): Promise<DrawingRecord> {
  if (!validHash(ifMatch)) fail('invalid_drawing', 'Use the prior drawing content hash.');
  return mutate(root, async context => {
    const file = drawingFile(context, name), target = drawingFile(context, nextName);
    if (hash((await readBytes(file)).bytes) !== ifMatch) fail('drawing_conflict', 'Drawing changed. Read it again before renaming.');
    // Case-only renames address the same file on case-insensitive volumes.
    if (name.toLowerCase() !== nextName.toLowerCase() && await exists(target)) fail('drawing_conflict', 'A drawing with this name already exists.');
    if (name !== nextName) await rename(file, target);
    return readRecord(target, nextName);
  });
}
export async function deleteDrawingFile(root: string, name: string, ifMatch: string) {
  if (!validHash(ifMatch)) fail('invalid_drawing', 'Use the prior drawing content hash.');
  return mutate(root, async context => {
    const file = drawingFile(context, name);
    if (hash((await readBytes(file)).bytes) !== ifMatch) fail('drawing_conflict', 'Drawing changed. Read it again before deleting.');
    await unlink(file);
    return { name, deleted: true as const, notesPreserved: true as const };
  });
}
