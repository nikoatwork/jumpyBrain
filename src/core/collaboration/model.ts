import {
  CollaborationError,
  collaborationFailure as fail,
  isSourceText,
  sourceBoundary as boundary,
} from "./errors.js";
import {
  applySourceSplices,
  invertSourceSplices,
  rebaseSourceSplices,
  sourceDifference,
  transformSourcePosition,
  validateSourceSplices,
  type SourceSplice,
  type AppliedSourceSplice,
} from "./source.js";
export { CollaborationError, isSourceText } from "./errors.js";
export { sourceDifference } from "./source.js";
const bytes = (text: string) => new TextEncoder().encode(text).length;
export interface SourceEdit {
  actor: string;
  operationId: string;
  epoch: string;
  baseRevision: number;
  start: number;
  deleteCount: number;
  insert: string;
}
export interface SourceBatchEdit {
  actor: string;
  operationId: string;
  epoch: string;
  baseRevision: number;
  operations: SourceSplice[];
}
interface OperationIdentity {
  actor: string;
  operationId: string;
  revision: number;
}
export interface SourceOperation extends AppliedSourceSplice {
  actor: string;
  operationId: string;
  revision: number;
  /** All coordinates refer to the same pre-transaction source. */
  operations?: AppliedSourceSplice[];
  inverseOf?: OperationIdentity;
}
export const operationSplices = (
  operation: SourceOperation,
): AppliedSourceSplice[] =>
  operation.operations ?? [
    {
      start: operation.start,
      deleteCount: operation.deleteCount,
      insert: operation.insert,
      removed: operation.removed,
    },
  ];
function coalesce(operations: AppliedSourceSplice[]): AppliedSourceSplice[] {
  const result: AppliedSourceSplice[] = [];
  for (const operation of operations) {
    const previous = result.at(-1);
    if (
      previous &&
      (previous.start + previous.deleteCount === operation.start ||
        (previous.start === operation.start &&
          (!previous.deleteCount || !operation.deleteCount)))
    ) {
      previous.deleteCount += operation.deleteCount;
      previous.insert += operation.insert;
      previous.removed += operation.removed;
    } else result.push({ ...operation });
  }
  return result;
}
function transaction(
  actor: string,
  operationId: string,
  revision: number,
  operations: AppliedSourceSplice[],
  inverseOf?: OperationIdentity,
): SourceOperation {
  const first = operations[0] ?? {
    start: 0,
    deleteCount: 0,
    insert: "",
    removed: "",
  };
  return {
    actor,
    operationId,
    revision,
    ...first,
    ...(operations.length !== 1 ? { operations } : {}),
    ...(inverseOf ? { inverseOf } : {}),
  };
}
function sameSplices(
  left: AppliedSourceSplice[],
  right: AppliedSourceSplice[],
) {
  return (
    left.length === right.length &&
    left.every((operation, index) => {
      const other = right[index]!;
      return (
        operation.start === other.start &&
        operation.deleteCount === other.deleteCount &&
        operation.insert === other.insert &&
        operation.removed === other.removed
      );
    })
  );
}
/** Remove only still-owned source; never consume a later actor's inserted text. */
function selectiveRebase(
  local: AppliedSourceSplice[],
  remote: readonly SourceSplice[],
  projectInterior = false,
): AppliedSourceSplice[] {
  let result = local;
  for (let index = remote.length - 1; index >= 0; index--) {
    const other = remote[index]!;
    if (!other.deleteCount && !other.insert) continue;
    const otherEnd = other.start + other.deleteCount,
      next: AppliedSourceSplice[] = [];
    const anchor = (position: number, allowInterior: boolean) => {
      if (!other.deleteCount)
        return position >= other.start
          ? position + other.insert.length
          : position;
      if (position <= other.start) return position;
      if (position >= otherEnd)
        return position + other.insert.length - other.deleteCount;
      if (!allowInterior)
        fail(
          "overlapping_edit",
          "Undo cannot prove an insertion anchor removed by another writer. Retain the draft for review.",
        );
      return other.start + other.insert.length;
    };
    for (const operation of result) {
      const end = operation.start + operation.deleteCount;
      if (!operation.deleteCount) {
        next.push({
          ...operation,
          start: anchor(operation.start, projectInterior),
        });
        continue;
      }
      const overlap = operation.start < otherEnd && end > other.start;
      if (
        overlap &&
        other.deleteCount &&
        other.insert &&
        operation.insert &&
        !projectInterior
      )
        fail(
          "overlapping_edit",
          "Undo overlaps another writer's replacement. Both intents require review.",
        );
      const pieces: AppliedSourceSplice[] = [];
      const add = (start: number, finish: number) => {
        if (finish > start)
          pieces.push({
            start:
              start >= otherEnd
                ? start + other.insert.length - other.deleteCount
                : start,
            deleteCount: finish - start,
            insert: "",
            removed: operation.removed.slice(
              start - operation.start,
              finish - operation.start,
            ),
          });
      };
      add(operation.start, Math.min(end, other.start));
      add(Math.max(operation.start, otherEnd), end);
      const restoreAt = anchor(operation.start, true);
      if (operation.insert) {
        if (pieces[0]?.start === restoreAt) pieces[0].insert = operation.insert;
        else
          pieces.unshift({
            start: restoreAt,
            deleteCount: 0,
            insert: operation.insert,
            removed: "",
          });
      }
      next.push(...pieces);
    }
    result = coalesce(next).filter(
      (operation) => operation.removed !== operation.insert,
    );
    if (result.length > 256)
      fail(
        "history_expired",
        "Selective history exceeds the bounded splice budget.",
      );
  }
  return result;
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
      operationSplices(operation).reduce(
        (sum, splice) =>
          sum + bytes(splice.insert) + bytes(splice.removed) + 64,
        0,
      ) +
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
    // Active streams carry current anchors instead of pinning unbounded snapshots.
    for (const [key, stream] of this.streams) {
      try {
        stream.start = this.transformPosition(
          stream.start,
          stream.baseRevision,
        );
        stream.baseRevision = this.revision;
      } catch {
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
  private base(revision: number) {
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      revision > this.revision
    )
      fail("invalid_revision");
    const body = this.versions.get(revision);
    if (body === undefined)
      fail(
        "history_expired",
        "The read revision expired. Resynchronize and reconcile the retained draft.",
      );
    return body;
  }
  /** Reduce only verified inverse pairs, commuting intervening independent edits. */
  private effectiveHistory(
    baseRevision: number,
    charge: (cost: number) => void = () => {},
  ) {
    const result: SourceOperation[] = [];
    for (const actual of this.history.filter(
      (operation) => operation.revision > baseRevision,
    )) {
      const target = actual.inverseOf,
        index = target
          ? result.findIndex(
              (operation) =>
                operation.actor === target.actor &&
                operation.operationId === target.operationId &&
                operation.revision === target.revision,
            )
          : -1;
      if (index < 0) {
        result.push(actual);
        continue;
      }
      const original = result[index]!,
        middle = result.slice(index + 1),
        commuted: SourceOperation[] = [];
      let inverse = invertSourceSplices(operationSplices(original));
      for (const operation of middle) {
        const splices = operationSplices(operation);
        charge(Math.max(1, inverse.length * splices.length * 2));
        const mapped = selectiveRebase(splices, inverse, true);
        const advanced = selectiveRebase(inverse, splices);
        commuted.push(
          transaction(
            operation.actor,
            operation.operationId,
            operation.revision,
            coalesce(mapped),
            operation.inverseOf,
          ),
        );
        inverse = coalesce(advanced);
      }
      if (!sameSplices(coalesce(inverse), coalesce(operationSplices(actual))))
        fail(
          "history_expired",
          "An inverse history pair could not be proven. Resynchronize before editing.",
        );
      result.splice(index, result.length - index, ...commuted);
    }
    return result;
  }
  transformPosition(
    position: number,
    baseRevision: number,
    association: -1 | 1 | "left" | "right" = 1,
  ) {
    const body = this.base(baseRevision);
    if (
      !Number.isSafeInteger(position) ||
      position < 0 ||
      position > body.length ||
      !boundary(body, position)
    )
      fail("invalid_base_range");
    let cost = 0,
      result = position;
    const charge = (amount: number) => {
      if ((cost += amount) > 1_000_000)
        fail(
          "history_expired",
          "The retained transform budget expired. Resynchronize.",
        );
    };
    for (const operation of this.effectiveHistory(baseRevision, charge)) {
      charge(operationSplices(operation).length);
      result = transformSourcePosition(
        result,
        operationSplices(operation),
        association,
      );
    }
    if (result < 0 || result > this.body.length || !boundary(this.body, result))
      fail("invalid_range");
    return result;
  }
  apply(request: SourceEdit, mode: false | true | "redo" = false) {
    return this.applyBatch(
      {
        ...request,
        operations: [
          {
            start: request.start,
            deleteCount: request.deleteCount,
            insert: request.insert,
          },
        ],
      },
      mode,
    );
  }
  applyBatch(
    request: SourceBatchEdit,
    mode: false | true | "redo" = false,
    inverseOf?: OperationIdentity,
  ): { operation?: SourceOperation; duplicate?: boolean; unchanged?: boolean } {
    if (request.epoch !== this.epoch)
      fail(
        "epoch_changed",
        "The document restarted or was replaced. Resynchronize before publishing.",
      );
    const { actor, operationId, baseRevision } = request,
      key = this.identity(actor, operationId);
    if (!Array.isArray(request.operations) || request.operations.length > 256)
      fail("batch_limit");
    if (
      request.operations.some(
        (operation) =>
          !operation ||
          typeof operation.insert !== "string" ||
          !isSourceText(operation.insert) ||
          !Number.isSafeInteger(operation.start) ||
          operation.start < 0 ||
          !Number.isSafeInteger(operation.deleteCount) ||
          operation.deleteCount < 0,
      )
    )
      fail("invalid_patch");
    if (
      request.operations.reduce(
        (sum, operation) => sum + bytes(operation.insert),
        0,
      ) > this.maxBytes
    )
      fail("document_limit");
    const signature = JSON.stringify([
      actor,
      operationId,
      request.epoch,
      baseRevision,
      request.operations.map((operation) => [
        operation.start,
        operation.deleteCount,
        operation.insert,
      ]),
      mode,
    ]);
    const prior = this.receipts.get(key);
    if (prior) {
      if (prior.signature !== signature) fail("operation_identity_reused");
      return { operation: prior.operation, duplicate: true };
    }
    const base = this.base(baseRevision);
    validateSourceSplices(base, request.operations);
    if (
      request.operations.reduce(
        (sum, operation) => sum + bytes(operation.insert),
        0,
      ) > this.maxBytes
    )
      fail("document_limit");
    if (
      !mode &&
      !this.undoStacks.has(actor) &&
      this.undoStacks.size >= this.maxActors
    )
      fail("actor_limit");
    let operations: AppliedSourceSplice[] = request.operations.map(
        (operation) => ({
          ...operation,
          removed: base.slice(
            operation.start,
            operation.start + operation.deleteCount,
          ),
        }),
      ),
      cost = 0;
    const charge = (amount: number) => {
      if ((cost += amount) > 1_000_000)
        fail(
          "history_expired",
          "The retained rebase budget expired. Resynchronize before publishing.",
        );
    };
    for (const other of this.effectiveHistory(baseRevision, charge)) {
      const splices = operationSplices(other);
      charge(Math.max(1, operations.length * splices.length));
      operations = mode
        ? selectiveRebase(operations, splices)
        : rebaseSourceSplices(operations, splices).map((operation, index) => ({
            ...operation,
            removed: operations[index]!.removed,
          }));
    }
    const applied = coalesce(
      operations
        .map((operation) => {
          const removed = this.body.slice(
            operation.start,
            operation.start + operation.deleteCount,
          );
          if (removed !== operation.removed) fail("rebase_content_mismatch");
          return { ...operation, removed };
        })
        .filter((operation) => operation.insert !== operation.removed),
    );
    validateSourceSplices(this.body, applied);
    const next = applySourceSplices(this.body, applied);
    if (bytes(next) > this.maxBytes) fail("document_limit");
    if (!applied.length && !inverseOf) {
      this.receipts.set(key, { signature, revision: this.revision });
      this.retain();
      return { unchanged: true };
    }
    const operation = transaction(
      actor,
      operationId,
      ++this.revision,
      applied,
      inverseOf,
    );
    this.body = next;
    this.history.push(operation);
    this.versions.set(this.revision, next);
    this.receipts.set(key, { signature, operation, revision: this.revision });
    if (!mode) {
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
  private historyMutation(
    actor: string,
    operationId: string,
    mode: true | "redo",
  ) {
    const key = this.identity(actor, operationId),
      prior = this.receipts.get(key);
    if (prior) {
      if (JSON.parse(prior.signature).at(-1) !== mode)
        fail("operation_identity_reused");
      return { operation: prior.operation, duplicate: true };
    }
    const source = mode === true ? this.undoStacks : this.redoStacks,
      target = mode === true ? this.redoStacks : this.undoStacks,
      original = source.get(actor)?.at(-1);
    if (!original) fail(mode === true ? "nothing_to_undo" : "nothing_to_redo");
    // If an ancestor's inverse discarded this operation's original source,
    // restoring that retired source would resurrect another actor's undone text.
    const oldest = this.versions.keys().next().value!;
    if (
      this.history.some(
        (operation) =>
          operation.revision > original.revision &&
          operation.inverseOf &&
          operation.inverseOf.revision <= oldest,
      )
    )
      fail(
        "history_expired",
        "An intervening inverse lost its original ownership history. Review retained versions before restoring source.",
      );
    let normalizationCost = 0;
    const charge = (amount: number) => {
      if ((normalizationCost += amount) > 1_000_000)
        fail(
          "history_expired",
          "Selective history exceeded its bounded proof budget.",
        );
    };
    const projected =
      mode === true
        ? this.effectiveHistory(oldest, charge).find(
            (operation) =>
              operation.actor === original.actor &&
              operation.operationId === original.operationId &&
              operation.revision === original.revision,
          )
        : undefined;
    if (projected) {
      const authored = (operation: SourceOperation) =>
        JSON.stringify([
          operationSplices(operation)
            .map((splice) => splice.insert)
            .join(""),
          operationSplices(operation)
            .map((splice) => splice.removed)
            .join(""),
        ]);
      if (authored(projected) !== authored(original))
        fail(
          "overlapping_edit",
          "Undo's original source was retired by another inverse. Review the retained versions before restoring it.",
        );
    }
    const result = this.applyBatch(
      {
        actor,
        operationId,
        epoch: this.epoch,
        baseRevision: original.revision,
        operations: invertSourceSplices(operationSplices(original)),
      },
      mode,
      {
        actor: original.actor,
        operationId: original.operationId,
        revision: original.revision,
      },
    );
    const stack = source.get(actor) ?? [],
      index = stack.findIndex(
        (operation) =>
          operation.revision === original.revision &&
          operation.operationId === original.operationId,
      );
    if (index >= 0) stack.splice(index, 1);
    if (!stack.length) source.delete(actor);
    if (result.operation) {
      const destination = target.get(actor) ?? [];
      destination.push(result.operation);
      target.set(actor, destination);
      this.retain();
    }
    return result;
  }
  undo(actor: string, operationId: string) {
    return this.historyMutation(actor, operationId, true);
  }
  redo(actor: string, operationId: string) {
    return this.historyMutation(actor, operationId, "redo");
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
      if (JSON.parse(prior.signature)[4]?.[0]?.[2] !== insert)
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
