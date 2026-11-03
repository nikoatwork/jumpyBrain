import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, mkdir, lstat, link, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IndexingPolicy } from '../../types.js';

export const SEMANTIC_MODEL = Object.freeze({
  name: 'EmbeddingGemma 300M Q8_0',
  sha256: 'b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63',
  bytes: 333590944,
  url: 'https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF/resolve/0f741b5a6585bd53aeb15cd1372c56f2a0f65e12/embeddinggemma-300M-Q8_0.gguf',
  terms: 'https://ai.google.dev/gemma/terms',
});
type Artifact = typeof SEMANTIC_MODEL | { name: string; sha256: string; bytes: number; url: string; terms: string };
function modelDirectory() {
  const configured = process.env.JUMPYBRAIN_MODEL_DIRECTORY;
  if (configured !== undefined && (!configured.trim() || !path.isAbsolute(configured))) throw new Error('JUMPYBRAIN_MODEL_DIRECTORY requires an absolute device-local path.');
  return configured ?? path.join(os.homedir(), '.jumpybrain/models');
}
export function localModelPath(policy: IndexingPolicy): string | undefined {
  if (policy.modelId && !/^sha256:[a-f0-9]{64}$/.test(policy.modelId)) throw new Error('Invalid device-local model identity.');
  return policy.modelId ? path.join(modelDirectory(), policy.modelId.slice(7) + '.gguf') : policy.model;
}
export function resolveLocalModelPolicy(policy: IndexingPolicy): IndexingPolicy {
  return policy.modelId ? { ...policy, model: localModelPath(policy), modelHash: policy.modelId.slice(7) } : policy;
}
async function validArtifact(file: string, artifact: Artifact): Promise<boolean> {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size !== artifact.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    return hash.digest('hex') === artifact.sha256;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw new Error('Local model is unavailable; inspect its device-local model directory.'); }
  finally { await handle?.close(); }
}

/** Explicit provisioning only. Status/recall never call this network path. */
export async function provisionLocalModel(options: { download?: boolean; file?: string; signal?: AbortSignal; directory?: string; fetchImpl?: typeof fetch } = {}, artifact: Artifact = SEMANTIC_MODEL) {
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 4) throw new Error('Invalid model artifact identity.');
  const directory = options.directory ? path.resolve(options.directory) : modelDirectory();
  const file = path.join(directory, artifact.sha256 + '.gguf');
  const plan = { name: artifact.name, modelId: 'sha256:' + artifact.sha256, sha256: artifact.sha256,
    downloadBytes: artifact.bytes, temporaryDiskBudgetBytes: artifact.bytes * 2, source: artifact.url, terms: artifact.terms,
    compatibility: 'Requires supported QMD 2.8.3 and its prebuilt local inference runtime. Setup does not change lexical defaults for other brains.' };
  const policy: IndexingPolicy = { mode: 'semantic', modelId: plan.modelId, modelHash: artifact.sha256 };
  options.signal?.throwIfAborted();
  if (await validArtifact(file, artifact)) { options.signal?.throwIfAborted(); return { ...plan, status: 'available' as const, reused: true, policy }; }
  try { await lstat(file); throw new Error('Cached model fails verification. Inspect or remove only this derived model artifact, then repeat explicit setup.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (!options.download && !options.file) return { ...plan, status: 'consent_required' as const, reused: false };
  if (options.file && options.download) throw new Error('Select a local model file or explicitly download, not both.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()) || (info.mode & 0o022)) throw new Error('Model directory must be an owned directory without other-user writes.');
  const temporary = path.join(directory, '.' + artifact.sha256 + '.' + randomUUID() + '.partial');
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), 600_000);
  let input: Awaited<ReturnType<typeof open>> | undefined, output: Awaited<ReturnType<typeof open>> | undefined;
  let response: Response | undefined;
  try {
    let stream: AsyncIterable<Uint8Array>;
    if (options.file) {
      input = await open(options.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = await input.stat();
      if (!stat.isFile() || stat.size !== artifact.bytes) throw new Error('Selected model has the wrong size; use the supported artifact.');
      stream = input.createReadStream({ autoClose: false });
    } else {
      response = await (options.fetchImpl ?? fetch)(artifact.url, { signal });
      if (!response.ok || !response.body) throw new Error('Model download unavailable; retry explicit setup when online or select a local file.');
      stream = response.body as unknown as AsyncIterable<Uint8Array>;
    }
    output = await open(temporary, 'wx', 0o600);
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of stream) {
      signal.throwIfAborted(); bytes += chunk.byteLength;
      if (bytes > artifact.bytes) throw new Error('Model download exceeds the pinned artifact size.');
      hash.update(chunk); await output.writeFile(chunk);
    }
    if (bytes !== artifact.bytes || hash.digest('hex') !== artifact.sha256) throw new Error('Model verification failed; no model was selected.');
    await output.sync(); await output.close(); output = undefined;
    signal.throwIfAborted();
    try { await link(temporary, file); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !await validArtifact(file, artifact)) throw new Error('Cached model conflicts with verified bytes. Inspect the device-local artifact before retrying.');
    }
    return { ...plan, status: 'available' as const, reused: false, policy };
  } finally {
    clearTimeout(timer); await output?.close(); await input?.close();
    await response?.body?.cancel().catch(() => {});
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function localModelAvailable(policy: IndexingPolicy): Promise<boolean> {
  const file = localModelPath(policy);
  if (!file) return false;
  try { const info = await lstat(file); return info.isFile() && !info.isSymbolicLink(); }
  catch { return false; }
}
