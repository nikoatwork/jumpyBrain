// Design-gate experiment only. Bounded server-order rebasing, not a general OT/CRDT.
export class SourceConflict extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}
const bad = (code, details) => { throw new SourceConflict(code, details); };
const boundary = (text, position) => !(position > 0 && position < text.length
  && /[\uD800-\uDBFF]/.test(text[position - 1]) && /[\uDC00-\uDFFF]/.test(text[position]));
export function difference(before, after) {
  let start = 0, endBefore = before.length, endAfter = after.length;
  while (start < endBefore && start < endAfter && before[start] === after[start]) start++;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
  // UTF-16 protocol offsets must not split a surrogate pair.
  if (!boundary(before, start) || !boundary(after, start)) start--;
  if (!boundary(before, endBefore)) endBefore++;
  if (!boundary(after, endAfter)) endAfter++;
  return { start, deleteCount: endBefore - start, insert: after.slice(start, endAfter) };
}
export class SourceSession {
  constructor(body, { epoch = globalThis.crypto.randomUUID(), historyLimit = 128, maxBytes = 65536, maxActors = 32, maxStreams = 16 } = {}) {
    if (typeof body !== 'string' || !Number.isSafeInteger(historyLimit) || historyLimit < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1
      || !Number.isSafeInteger(maxActors) || maxActors < 1 || !Number.isSafeInteger(maxStreams) || maxStreams < 1
      || typeof epoch !== 'string' || !epoch || epoch.length > 128 || !epoch.isWellFormed()
      || !body.isWellFormed() || new TextEncoder().encode(body).length > maxBytes) bad('invalid_session');
    this.body = body; this.epoch = epoch; this.revision = 0; this.historyLimit = historyLimit; this.maxBytes = maxBytes;
    this.maxActors = maxActors; this.maxStreams = maxStreams;
    this.history = []; this.receipts = new Map(); this.streams = new Map(); this.actorUndo = new Map(); this.versions = new Map([[0, body]]);
  }
  snapshot() { return { body: this.body, epoch: this.epoch, revision: this.revision }; }
  apply(request) {
    if (!request || request.epoch !== this.epoch) bad('epoch_changed');
    const { actor, id, baseRevision, deleteCount, insert } = request;
    if (typeof actor !== 'string' || !actor || actor.length > 256 || !actor.isWellFormed()
      || typeof id !== 'string' || !id || id.length > 256 || !id.isWellFormed()) bad('invalid_identity');
    const identity = JSON.stringify([actor, id]), signature = JSON.stringify(request);
    const previous = this.receipts.get(identity);
    if (previous) {
      if (previous.signature !== signature) bad('operation_identity_reused');
      return { ...this.snapshot(), operation: previous.result.operation, committedRevision: previous.result.revision, duplicate: true };
    }
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0 || baseRevision > this.revision) bad('invalid_revision');
    const baseBody = this.versions.get(baseRevision);
    if (baseBody === undefined) bad('history_expired');
    if (!Number.isSafeInteger(request.start) || request.start < 0 || !Number.isSafeInteger(deleteCount) || deleteCount < 0
      || typeof insert !== 'string' || !insert.isWellFormed() || insert.length > this.maxBytes || new TextEncoder().encode(insert).length > this.maxBytes) bad('invalid_patch');
    if (request.start + deleteCount > baseBody.length || !boundary(baseBody, request.start) || !boundary(baseBody, request.start + deleteCount)) bad('invalid_base_range');
    if (!request.undo && !this.actorUndo.has(actor) && this.actorUndo.size >= this.maxActors) bad('actor_limit');
    let start = request.start;
    for (const other of this.history.filter((edit) => edit.revision > baseRevision)) {
      const end = start + deleteCount, otherEnd = other.start + other.deleteCount;
      // Server order is deterministic for simultaneous insertions at one position.
      if (other.deleteCount === 0 && deleteCount === 0 && start === other.start) { start += other.insert.length; continue; }
      if (otherEnd <= start) { start += other.insert.length - other.deleteCount; continue; }
      if (end <= other.start) continue;
      bad('overlapping_edit', { actor, otherActor: other.actor, baseRevision, currentRevision: this.revision });
    }
    if (start + deleteCount > this.body.length || !boundary(this.body, start) || !boundary(this.body, start + deleteCount)) bad('invalid_range');
    const removed = this.body.slice(start, start + deleteCount);
    if (removed !== baseBody.slice(request.start, request.start + deleteCount)) bad('rebase_content_mismatch');
    if (removed === insert) {
      const result = { ...this.snapshot(), unchanged: true, operation: { actor, id, start, deleteCount, insert, removed, revision: this.revision } };
      this.receipts.set(identity, { signature, result });
      while (this.receipts.size > this.historyLimit) this.receipts.delete(this.receipts.keys().next().value);
      return result;
    }
    const next = this.body.slice(0, start) + insert + this.body.slice(start + deleteCount);
    if (new TextEncoder().encode(next).length > this.maxBytes) bad('document_limit');
    const edit = { actor, id, start, deleteCount, insert, removed, revision: ++this.revision };
    this.body = next; this.history.push(edit);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.versions.set(this.revision, next);
    while (this.versions.size > this.historyLimit + 1) this.versions.delete(this.versions.keys().next().value);
    const oldest = this.revision - this.history.length;
    for (const [name, stack] of this.actorUndo) {
      const current = stack.filter((entry) => entry.revision >= oldest);
      if (current.length) this.actorUndo.set(name, current); else this.actorUndo.delete(name);
    }
    for (const [name, stream] of this.streams) if (stream.baseRevision < oldest) this.streams.delete(name);
    const result = { ...this.snapshot(), operation: edit };
    this.receipts.set(identity, { signature, result });
    while (this.receipts.size > this.historyLimit) this.receipts.delete(this.receipts.keys().next().value);
    if (!request.undo) {
      const stack = this.actorUndo.get(actor) ?? [];
      stack.push(edit); if (stack.length > this.historyLimit) stack.shift(); this.actorUndo.set(actor, stack);
    }
    return result;
  }
  undo(actor, id) {
    const previous = this.receipts.get(JSON.stringify([actor, id]));
    if (previous) {
      if (JSON.parse(previous.signature).undo !== true) bad('operation_identity_reused');
      return { ...this.snapshot(), operation: previous.result.operation, committedRevision: previous.result.revision, duplicate: true };
    }
    const stack = this.actorUndo.get(actor) ?? [], original = stack.at(-1);
    if (!original) bad('nothing_to_undo');
    const result = this.apply({ actor, id, epoch: this.epoch, baseRevision: original.revision,
      start: original.start, deleteCount: original.insert.length, insert: original.removed, undo: true });
    const current = this.actorUndo.get(actor) ?? [];
    const index = current.findIndex((entry) => entry === original);
    if (index >= 0) current.splice(index, 1);
    if (!current.length) this.actorUndo.delete(actor);
    return result;
  }
  beginStream(actor, streamId, start, baseRevision = this.revision) {
    if (typeof actor !== 'string' || !actor || actor.length > 256 || !actor.isWellFormed()
      || typeof streamId !== 'string' || !streamId || streamId.length > 128 || !streamId.isWellFormed()) bad('invalid_identity');
    const key = JSON.stringify([actor, streamId]);
    if (this.streams.has(key)) bad('stream_exists');
    if (this.streams.size >= this.maxStreams) bad('stream_limit');
    if (!Number.isSafeInteger(baseRevision) || !this.versions.has(baseRevision)) bad('history_expired');
    const body = this.versions.get(baseRevision);
    if (!Number.isSafeInteger(start) || start < 0 || start > body.length || !boundary(body, start)) bad('invalid_base_range');
    this.streams.set(key, { actor, streamId, start, baseRevision, sequence: 0, cancelled: false });
  }
  chunk(actor, streamId, sequence, insert) {
    const stream = this.streams.get(JSON.stringify([actor, streamId]));
    if (!stream || stream.cancelled) bad('stream_inactive');
    if (sequence < stream.sequence) {
      const receipt = this.receipts.get(JSON.stringify([actor, JSON.stringify(['stream', streamId, sequence])]));
      if (!receipt || receipt.result.operation.insert !== insert) bad('stream_duplicate_mismatch');
      return { ...this.snapshot(), operation: receipt.result.operation, committedRevision: receipt.result.revision, duplicate: true };
    }
    if (sequence !== stream.sequence) bad('stream_gap');
    if (!Number.isSafeInteger(sequence) || sequence < 0) bad('stream_gap');
    const result = this.apply({ actor, id: JSON.stringify(['stream', streamId, sequence]), epoch: this.epoch,
      baseRevision: stream.baseRevision, start: stream.start, deleteCount: 0, insert });
    stream.baseRevision = result.revision; stream.start = result.operation.start + insert.length; stream.sequence++;
    return result;
  }
  cancel(actor, streamId) {
    const key = JSON.stringify([actor, streamId]), stream = this.streams.get(key);
    if (!stream) bad('stream_inactive');
    this.streams.delete(key); return this.snapshot();
  }
}
