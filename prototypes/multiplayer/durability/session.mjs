// Design-only coordination seam. Never imported by production entrypoints.
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { readMemoryDocument, updateMemoryDocument } from '../../../dist/runtime/index.js';
import { mergeMemoryDocumentUpdate } from '../../../dist/core/writing/index.js';
import { parseFrontmatter } from '../../../dist/core/canonical/index.js';
import { mergeDocumentEdits } from '../../../dist/adapters/http-server/document-merge.js';

export const contentHash = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
export const bodyOf = (content) => content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
export const withBody = (content, body) => content.slice(0, content.length - bodyOf(content).length) + body;
const failure = (code, message) => Object.assign(new Error(message), { code });

async function durableFile(file, value) {
  const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(value); await handle.sync(); }
  finally { await handle.close(); }
}

export class DocumentSession {
  static async open(root, id, options = {}) {
    const baseline = await readMemoryDocument(root, id);
    return new DocumentSession(root, id, baseline, options);
  }
  constructor(root, id, baseline, { epoch = randomUUID(), publish = updateMemoryDocument } = {}) {
    this.root = root; this.id = id; this.baseline = baseline;
    this.epoch = epoch; this.revision = 0; this.pending = baseline.content;
    this.publisher = publish; this.receipts = []; this.operations = new Map();
    this.busy = false; this.blocked = false;
  }
  get dirty() { return this.pending !== this.baseline.content; }
  state() {
    return { epoch: this.epoch, revision: this.revision, pending: this.pending,
      publishedHash: this.baseline.contentHash, dirty: this.dirty, blocked: this.blocked, busy: this.busy };
  }
  queue({ epoch, baseRevision, id, content }) {
    if (epoch !== this.epoch) throw failure('stale_epoch', 'Resynchronize; old collaboration identities cannot replay after restart.');
    if (this.busy) throw failure('publication_busy', 'Retain the client draft and retry after publication; no edit was admitted.');
    if (this.blocked) throw failure('session_blocked', 'Explicit recovery is required.');
    if (this.operations.has(id)) {
      const previous = this.operations.get(id);
      if (previous.content !== content) throw failure('operation_conflict', 'An operation id cannot mean different content.');
      return previous.receipt;
    }
    if (baseRevision !== this.revision) throw failure('stale_revision', 'This publication seam does not retarget stale offsets.');
    if (typeof content !== 'string' || Buffer.byteLength(content) > 1024 * 1024) throw failure('invalid_content', 'Bounded Markdown required.');
    this.pending = content; this.revision++;
    const receipt = { status: 'admitted', saved: false, epoch, revision: this.revision, operationId: id };
    this.operations.set(id, { content, receipt });
    return receipt;
  }
  async preserve(reason, external) {
    const directory = path.join(this.root, '.jumpybrain', 'recovery', this.id, randomUUID());
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await durableFile(path.join(directory, 'base.md'), this.baseline.content);
    await durableFile(path.join(directory, 'pending.md'), this.pending);
    if (external !== undefined) await durableFile(path.join(directory, 'external.md'), external);
    await durableFile(path.join(directory, 'recovery.json'), JSON.stringify({ version: 1, reason, epoch: this.epoch,
      revision: this.revision, baseHash: this.baseline.contentHash, externalObserved: external !== undefined,
      externalMissing: reason === 'source_deleted' }, null, 2) + '\n');
    try { const handle = await open(directory, 'r'); try { await handle.sync(); } finally { await handle.close(); } } catch {}
    return directory;
  }
  async rejectExternal(reason, external) {
    this.blocked = true;
    return { status: 'conflict', reason, saved: false, recovery: await this.preserve(reason, external) };
  }
  async reconcile(external) {
    if (external.contentHash === this.baseline.contentHash) return { status: 'self_or_unchanged', saved: false };
    if (!this.dirty) {
      this.baseline = external; this.pending = external.content; this.revision++;
      return { status: 'external_accepted', saved: false };
    }
    const merged = mergeDocumentEdits(this.baseline.content, this.pending, external.content);
    if (merged === null) return this.rejectExternal('external_overlap', external.content);
    this.baseline = external; this.pending = merged; this.revision++;
    return { status: 'merged_pending', saved: false };
  }
  async legacyReplace({ ifMatch, content }) {
    const current = await readMemoryDocument(this.root, this.id);
    if (ifMatch !== current.contentHash) throw failure('precondition_failed', 'Legacy disk precondition is stale.');
    // A valid disk hash is insufficient when the session has admitted text.
    if (this.busy || this.dirty || this.blocked) throw failure('live_edits_pending', 'Keep the legacy proposal; live edits must settle or be reconciled first.');
    this.baseline = current; this.pending = current.content;
    this.queue({ epoch: this.epoch, baseRevision: this.revision, id: randomUUID(), content });
    return this.flush();
  }
  async flush({ updatedAt = '2026-11-01T12:00:00.000Z' } = {}) {
    if (this.busy) throw failure('publication_busy', 'One publication at a time.');
    if (this.blocked) throw failure('session_blocked', 'Explicit recovery required.');
    this.busy = true;
    try {
      let current;
      try { current = await readMemoryDocument(this.root, this.id); }
      catch (error) {
        await this.rejectExternal(error.code ?? 'unreadable_source');
        throw error;
      }
      const result = await this.reconcile(current);
      if (result.status === 'conflict') throw failure('external_overlap', 'Both observed versions were retained.');
      if (!this.dirty) return { status: 'unchanged', saved: false, contentHash: this.baseline.contentHash };
      const submitted = this.pending;
      const predicted = mergeMemoryDocumentUpdate(this.baseline.content, submitted, { updatedAt }).content;
      const published = await this.publisher(this.root, this.id, submitted, { ifMatch: this.baseline.contentHash, updatedAt });
      if (published.newContentHash !== contentHash(predicted)) throw failure('publication_contract_changed', 'Current publication bytes differ from the proven serializer.');
      // No follow-up read: another raw writer can run immediately after rename.
      // The receipt describes the bytes actually published, not that later writer.
      this.baseline = { ...this.baseline, content: predicted, contentHash: published.newContentHash };
      this.pending = predicted;
      const receipt = { status: 'published', saved: true, epoch: this.epoch, revision: this.revision,
        contentHash: published.newContentHash, indexing: 'separate', operationIds: [...this.operations.keys()] };
      this.receipts.push(receipt); this.operations.clear();
      return receipt;
    } finally { this.busy = false; }
  }
}

// Watch events only prompt poll(). This bounded observer is also usable on a
// periodic reconciliation tick, so missed events cannot be the sole mechanism.
export class ExternalObserver {
  constructor(session, { quietMs = 20, maxWaitMs = 100, maxBytes = 1024 * 1024 } = {}) {
    this.session = session; this.quietMs = quietMs; this.maxWaitMs = maxWaitMs; this.maxBytes = maxBytes;
    this.file = path.join(session.root, session.baseline.file);
    this.candidate = undefined;
  }
  async poll(now) {
    if (this.session.blocked) return { status: 'blocked' };
    let bytes, missing = false;
    try {
      const before = await lstat(this.file);
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > this.maxBytes) return this.session.rejectExternal('unsafe_source');
      bytes = await readFile(this.file);
      const after = await lstat(this.file);
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return { status: 'changed_during_read' };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing = true;
    }
    const signature = missing ? 'missing' : contentHash(bytes);
    if (!missing && signature === this.session.baseline.contentHash) { this.candidate = undefined; return { status: 'self_or_unchanged' }; }
    if (!this.candidate) this.candidate = { firstSeen: now, changedAt: now, signature, bytes, missing };
    else if (signature !== this.candidate.signature) Object.assign(this.candidate, { changedAt: now, signature, bytes, missing });
    const candidate = this.candidate;
    const quiet = now - candidate.changedAt >= this.quietMs;
    const expired = now - candidate.firstSeen >= this.maxWaitMs;
    let external;
    try { external = candidate.bytes === undefined ? undefined : new TextDecoder('utf-8', { fatal: true }).decode(candidate.bytes); }
    catch {
      if (expired) return this.session.rejectExternal('invalid_utf8_or_partial_file', candidate.bytes);
      return { status: 'stabilizing' };
    }
    if (candidate.missing) {
      if (!quiet) return { status: 'stabilizing' };
      return this.session.rejectExternal('source_deleted', undefined);
    }
    const parsed = parseFrontmatter(external);
    if (parsed.frontmatter.id !== this.session.id || !quiet) {
      if (expired) return this.session.rejectExternal(quiet ? 'invalid_identity_or_partial_file' : 'external_unstable', external);
      return { status: 'stabilizing' };
    }
    let document;
    try { document = await readMemoryDocument(this.session.root, this.session.id); }
    catch (error) { return this.session.rejectExternal(error.code ?? 'unreadable_source', external); }
    if (document.contentHash !== candidate.signature) return { status: 'changed_during_read' };
    const outcome = await this.session.reconcile(document);
    this.candidate = undefined;
    return outcome;
  }
}
