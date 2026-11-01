export class CollaborationError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "CollaborationError";
  }
}
function fail(code: string, message?: string): never {
  throw new CollaborationError(code, message);
}
const bytes = (text: string) => new TextEncoder().encode(text).length;
export const isSourceText = (text: string) =>
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
    text,
  );
const boundary = (text: string, at: number) =>
  !(
    at > 0 &&
    at < text.length &&
    /[\uD800-\uDBFF]/.test(text[at - 1]!) &&
    /[\uDC00-\uDFFF]/.test(text[at]!)
  );
export interface SourceEdit {
  actor: string;
  operationId: string;
  epoch: string;
  baseRevision: number;
  start: number;
  deleteCount: number;
  insert: string;
}
export interface SourceOperation {
  actor: string;
  operationId: string;
  start: number;
  deleteCount: number;
  insert: string;
  removed: string;
  revision: number;
}
interface Receipt {
  signature: string;
  operation?: SourceOperation;
  revision: number;
}
interface Stream {
  actor: string;
  streamId: string;
  start: number;
  baseRevision: number;
  sequence: number;
  state: "active" | "cancelled" | "finished";
  reason?: "cancelled" | "lease_expired" | "authorization_revoked";
}
export interface ModelOptions {
  epoch: string;
  historyLimit?: number;
  maxBytes?: number;
  maxHistoryBytes?: number;
  maxActors?: number;
  maxStreams?: number;
}
export class SourceModel {
  body: string;
  revision = 0;
  readonly epoch: string;
  readonly historyLimit: number;
  readonly maxBytes: number;
  readonly maxHistoryBytes: number;
  readonly maxActors: number;
  readonly maxStreams: number;
  history: SourceOperation[] = [];
  versions = new Map<number, string>();
  receipts = new Map<string, Receipt>();
  undoStacks = new Map<string, SourceOperation[]>();
  streams = new Map<string, Stream>();
  retiredStreams = new Map<string, Stream>();
  redoStacks = new Map<string, SourceOperation[]>();
  constructor(body: string, options: ModelOptions) {
    this.epoch = options.epoch;
    this.historyLimit = options.historyLimit ?? 128;
    this.maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
    this.maxHistoryBytes = options.maxHistoryBytes ?? 8 * 1024 * 1024;
    this.maxActors = options.maxActors ?? 64;
    this.maxStreams = options.maxStreams ?? 32;
    if (
      !this.epoch ||
      typeof body !== "string" ||
      !isSourceText(body) ||
      bytes(body) > this.maxBytes ||
      [
        this.historyLimit,
        this.maxBytes,
        this.maxHistoryBytes,
        this.maxActors,
        this.maxStreams,
      ].some((n) => !Number.isSafeInteger(n) || n < 1)
    )
      fail("document_limit");
    this.body = body;
    this.versions.set(0, body);
  }
  fork(): SourceModel {
    const copy = new SourceModel(this.body, this);
    copy.revision = this.revision;
    copy.history = structuredClone(this.history);
    copy.versions = new Map(this.versions);
    copy.receipts = structuredClone(this.receipts);
    copy.undoStacks = structuredClone(this.undoStacks);
    copy.redoStacks = structuredClone(this.redoStacks);
    copy.streams = structuredClone(this.streams);
    copy.retiredStreams = structuredClone(this.retiredStreams);
    return copy;
  }
  private identity(actor: string, id: string) {
    if (
      typeof actor !== "string" ||
      !actor ||
      actor.length > 512 ||
      !isSourceText(actor) ||
      typeof id !== "string" ||
      !id ||
      id.length > 256 ||
      !isSourceText(id)
    )
      fail("invalid_identity");
    return JSON.stringify([actor, id]);
  }
  get retainedBytes() {
    const operationBytes = (operation: SourceOperation) =>
      bytes(operation.insert) +
      bytes(operation.removed) +
      bytes(operation.actor) +
      bytes(operation.operationId) +
      128;
    return (
      [...this.versions.values()].reduce((n, body) => n + bytes(body), 0) +
      this.history.reduce((n, operation) => n + operationBytes(operation), 0) +
      [...this.receipts.values()].reduce(
        (n, receipt) => n + bytes(receipt.signature) + 128,
        0,
      ) +
      [...this.undoStacks.values(), ...this.redoStacks.values()]
        .flat()
        .reduce((n, operation) => n + operationBytes(operation), 0)
    );
  }
  pruneHistory(limit: number) {
    this.retain(
      Math.min(this.maxHistoryBytes, Math.max(bytes(this.body), limit)),
    );
  }
  private retain(limit = this.maxHistoryBytes) {
    // Active streams retain a current anchor rather than pinning full old
    // snapshots. Independent edits can therefore outlive bounded read history.
    for (const [key, stream] of this.streams) {
      let start = stream.start,
        valid = true;
      for (const operation of this.history)
        if (operation.revision > stream.baseRevision) {
          if (operation.start + operation.deleteCount <= start)
            start += operation.insert.length - operation.deleteCount;
          else if (start > operation.start) {
            valid = false;
            break;
          }
        }
      if (valid) {
        stream.start = start;
        stream.baseRevision = this.revision;
      } else {
        stream.state = "cancelled";
        this.streams.delete(key);
        this.retiredStreams.set(key, stream);
      }
    }
    while (
      this.history.length > this.historyLimit ||
      (this.retainedBytes > limit && this.versions.size > 1)
    ) {
      const oldest = this.versions.keys().next().value!;
      this.versions.delete(oldest);
      this.history.shift();
    }
    const oldest = this.versions.keys().next().value!;
    for (const stacks of [this.undoStacks, this.redoStacks])
      for (const [actor, stack] of stacks) {
        const retained = stack.filter((op) => op.revision >= oldest);
        if (retained.length) stacks.set(actor, retained);
        else stacks.delete(actor);
      }
    for (const [id, stream] of this.streams)
      if (stream.baseRevision < oldest) {
        stream.state = "cancelled";
        this.retiredStreams.set(id, stream);
        this.streams.delete(id);
      }
    for (const map of [this.receipts, this.retiredStreams])
      while (map.size > this.historyLimit) map.delete(map.keys().next().value!);
    while (this.receipts.size && this.retainedBytes > limit)
      this.receipts.delete(this.receipts.keys().next().value!);
    while (this.undoStacks.size && this.retainedBytes > limit)
      this.undoStacks.delete(this.undoStacks.keys().next().value!);
    while (this.redoStacks.size && this.retainedBytes > limit)
      this.redoStacks.delete(this.redoStacks.keys().next().value!);
  }
  apply(
    request: SourceEdit,
    undo: false | true | "redo" = false,
  ): { operation?: SourceOperation; duplicate?: boolean; unchanged?: boolean } {
    if (request.epoch !== this.epoch)
      fail(
        "epoch_changed",
        "The document restarted or was replaced. Resynchronize before publishing.",
      );
    const {
      actor,
      operationId,
      baseRevision,
      start: requestedStart,
      deleteCount,
      insert,
    } = request;
    const key = this.identity(actor, operationId);
    const signature = JSON.stringify([
      actor,
      operationId,
      request.epoch,
      baseRevision,
      requestedStart,
      deleteCount,
      insert,
      undo,
    ]);
    const prior = this.receipts.get(key);
    if (prior) {
      if (prior.signature !== signature) fail("operation_identity_reused");
      return { operation: prior.operation, duplicate: true };
    }
    if (
      !Number.isSafeInteger(baseRevision) ||
      baseRevision < 0 ||
      baseRevision > this.revision
    )
      fail("invalid_revision");
    const base = this.versions.get(baseRevision);
    if (base === undefined)
      fail(
        "history_expired",
        "The read revision expired. Resynchronize and reconcile the retained draft.",
      );
    if (
      !Number.isSafeInteger(requestedStart) ||
      requestedStart < 0 ||
      !Number.isSafeInteger(deleteCount) ||
      deleteCount < 0 ||
      typeof insert !== "string" ||
      !isSourceText(insert) ||
      bytes(insert) > this.maxBytes
    )
      fail("invalid_patch");
    if (
      requestedStart + deleteCount > base.length ||
      !boundary(base, requestedStart) ||
      !boundary(base, requestedStart + deleteCount)
    )
      fail("invalid_base_range");
    if (
      !undo &&
      !this.undoStacks.has(actor) &&
      this.undoStacks.size >= this.maxActors
    )
      fail("actor_limit");
    let start = requestedStart;
    for (const other of this.history.filter(
      (op) => op.revision > baseRevision,
    )) {
      const end = start + deleteCount,
        otherEnd = other.start + other.deleteCount;
      if (
        other.deleteCount === 0 &&
        deleteCount === 0 &&
        start === other.start
      ) {
        start += other.insert.length;
        continue;
      }
      if (otherEnd <= start) {
        start += other.insert.length - other.deleteCount;
        continue;
      }
      if (end <= other.start) continue;
      fail(
        "overlapping_edit",
        "Both edits change the same source range. Keep the draft and reconcile against the current note.",
      );
    }
    if (
      start < 0 ||
      start + deleteCount > this.body.length ||
      !boundary(this.body, start) ||
      !boundary(this.body, start + deleteCount)
    )
      fail("invalid_range");
    const removed = this.body.slice(start, start + deleteCount);
    if (removed !== base.slice(requestedStart, requestedStart + deleteCount))
      fail("rebase_content_mismatch");
    if (removed === insert) {
      this.receipts.set(key, { signature, revision: this.revision });
      this.retain();
      return { unchanged: true };
    }
    const next =
      this.body.slice(0, start) + insert + this.body.slice(start + deleteCount);
    if (bytes(next) > this.maxBytes) fail("document_limit");
    const operation = {
      actor,
      operationId,
      start,
      deleteCount,
      insert,
      removed,
      revision: ++this.revision,
    };
    this.body = next;
    this.history.push(operation);
    this.versions.set(this.revision, next);
    this.receipts.set(key, { signature, operation, revision: this.revision });
    if (!undo) {
      const stack = this.undoStacks.get(actor) ?? [];
      stack.push(operation);
      this.undoStacks.set(actor, stack);
      this.redoStacks.delete(actor);
    }
    this.retain();
    return { operation };
  }
  /** Metadata advances the read revision without invalidating body anchors. */
  checkpoint(actor: string, operationId: string) {
    const key = this.identity(actor, operationId),
      prior = this.receipts.get(key);
    if (prior) {
      if (JSON.parse(prior.signature).at(-1) !== "checkpoint")
        fail("operation_identity_reused");
      return { operation: prior.operation, duplicate: true };
    }
    const operation: SourceOperation = {
      actor,
      operationId,
      start: 0,
      deleteCount: 0,
      insert: "",
      removed: "",
      revision: ++this.revision,
    };
    this.history.push(operation);
    this.versions.set(this.revision, this.body);
    this.receipts.set(key, {
      signature: JSON.stringify([actor, operationId, this.epoch, "checkpoint"]),
      operation,
      revision: this.revision,
    });
    this.retain();
    return { operation };
  }
  undo(actor: string, operationId: string) {
    const key = this.identity(actor, operationId),
      prior = this.receipts.get(key);
    if (prior) {
      if (JSON.parse(prior.signature).at(-1) !== true)
        fail("operation_identity_reused");
      return { operation: prior.operation, duplicate: true };
    }
    const original = this.undoStacks.get(actor)?.at(-1);
    if (!original) fail("nothing_to_undo");
    const result = this.apply(
      {
        actor,
        operationId,
        epoch: this.epoch,
        baseRevision: original.revision,
        start: original.start,
        deleteCount: original.insert.length,
        insert: original.removed,
      },
      true,
    );
    const stack = this.undoStacks.get(actor) ?? [],
      index = stack.findIndex(
        (op) =>
          op.revision === original.revision &&
          op.operationId === original.operationId,
      );
    if (index >= 0) stack.splice(index, 1);
    if (!stack.length) this.undoStacks.delete(actor);
    if (result.operation) {
      const redo = this.redoStacks.get(actor) ?? [];
      redo.push(result.operation);
      this.redoStacks.set(actor, redo);
      this.retain();
    }
    return result;
  }
  redo(actor: string, operationId: string) {
    const key = this.identity(actor, operationId),
      prior = this.receipts.get(key);
    if (prior) {
      if (JSON.parse(prior.signature).at(-1) !== "redo")
        fail("operation_identity_reused");
      return { operation: prior.operation, duplicate: true };
    }
    const inverse = this.redoStacks.get(actor)?.at(-1);
    if (!inverse) fail("nothing_to_redo");
    const result = this.apply(
      {
        actor,
        operationId,
        epoch: this.epoch,
        baseRevision: inverse.revision,
        start: inverse.start,
        deleteCount: inverse.insert.length,
        insert: inverse.removed,
      },
      "redo",
    );
    const redo = this.redoStacks.get(actor) ?? [],
      index = redo.findIndex(
        (op) =>
          op.revision === inverse.revision &&
          op.operationId === inverse.operationId,
      );
    if (index >= 0) redo.splice(index, 1);
    if (!redo.length) this.redoStacks.delete(actor);
    if (result.operation) {
      const undo = this.undoStacks.get(actor) ?? [];
      undo.push(result.operation);
      this.undoStacks.set(actor, undo);
      this.retain();
    }
    return result;
  }
  startStream(
    actor: string,
    streamId: string,
    start: number,
    baseRevision: number,
  ) {
    const key = this.identity(actor, streamId),
      existing = this.streams.get(key);
    if (existing) {
      if (existing.start !== start || existing.baseRevision !== baseRevision)
        fail("stream_exists");
      return existing;
    }
    if (this.retiredStreams.has(key)) fail("stream_inactive");
    if (this.streams.size >= this.maxStreams) fail("stream_limit");
    if (
      !Number.isSafeInteger(baseRevision) ||
      baseRevision < 0 ||
      baseRevision > this.revision
    )
      fail("invalid_revision");
    const base = this.versions.get(baseRevision);
    if (base === undefined) fail("history_expired");
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start > base.length ||
      !boundary(base, start)
    )
      fail("invalid_base_range");
    const stream: Stream = {
      actor,
      streamId,
      start,
      baseRevision,
      sequence: 0,
      state: "active",
    };
    this.streams.set(key, stream);
    return stream;
  }
  chunk(actor: string, streamId: string, sequence: number, insert: string) {
    const key = this.identity(actor, streamId),
      stream = this.streams.get(key);
    if (!stream) fail("stream_inactive");
    if (!Number.isSafeInteger(sequence) || sequence < 0) fail("stream_gap");
    const operationId = JSON.stringify(["stream", streamId, sequence]);
    if (sequence < stream.sequence) {
      const prior = this.receipts.get(this.identity(actor, operationId));
      if (!prior) fail("history_expired");
      if (JSON.parse(prior.signature)[6] !== insert)
        fail("stream_duplicate_mismatch");
      return { operation: prior.operation, duplicate: true };
    }
    if (sequence !== stream.sequence) fail("stream_gap");
    const result = this.apply({
      actor,
      operationId,
      epoch: this.epoch,
      baseRevision: stream.baseRevision,
      start: stream.start,
      deleteCount: 0,
      insert,
    });
    stream.baseRevision = this.revision;
    stream.start = (result.operation?.start ?? stream.start) + insert.length;
    stream.sequence++;
    return result;
  }
  cancelStream(
    actor: string,
    streamId: string,
    reason: Stream["reason"] = "cancelled",
  ) {
    const key = this.identity(actor, streamId),
      stream = this.streams.get(key) ?? this.retiredStreams.get(key);
    if (!stream) fail("stream_inactive");
    if (stream.state !== "active") return stream;
    stream.state = "cancelled";
    stream.reason = reason;
    this.streams.delete(key);
    this.retiredStreams.set(key, stream);
    this.retain();
    return stream;
  }
  finishStream(actor: string, streamId: string) {
    const key = this.identity(actor, streamId),
      stream = this.streams.get(key) ?? this.retiredStreams.get(key);
    if (!stream) fail("stream_inactive");
    if (stream.state !== "active") return stream;
    stream.state = "finished";
    this.streams.delete(key);
    this.retiredStreams.set(key, stream);
    this.retain();
    return stream;
  }
  streamStatus(actor: string, streamId: string) {
    return (
      this.streams.get(this.identity(actor, streamId)) ??
      this.retiredStreams.get(this.identity(actor, streamId)) ??
      null
    );
  }
}
export function sourceDifference(before: string, after: string) {
  let start = 0,
    endBefore = before.length,
    endAfter = after.length;
  while (
    start < endBefore &&
    start < endAfter &&
    before[start] === after[start]
  )
    start++;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore--;
    endAfter--;
  }
  if (!boundary(before, start) || !boundary(after, start)) start--;
  if (!boundary(before, endBefore)) endBefore++;
  if (!boundary(after, endAfter)) endAfter++;
  return {
    start,
    deleteCount: endBefore - start,
    insert: after.slice(start, endAfter),
  };
}
