import { normalizeMemoryActor } from "../../core/contribution.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, lstat, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
  latestRecovery,
  readRecovery,
  recordLatestRecovery,
} from "./recovery.js";
import {
  CollaborationError,
  SourceModel,
  sourceDifference,
  rawSourceDifferences,
  operationSplices,
  isSourceText,
  type SourceOperation,
  type SourceSplice,
} from "../../core/collaboration/index.js";
import {
  readBoundedCanonicalSource,
  parseFrontmatter,
} from "../../core/canonical/markdown-store.js";
import { mergeMemoryDocumentUpdate } from "../../core/document-update.js";
import {
  readMemoryDocument,
  updateMemoryDocument,
} from "../local-memory/index.js";
import { markRemoteIndexStale } from "../server-memory/state.js";
import type {
  MemoryDocumentReadResult,
  MemoryActor,
  SearchRecognitionMetadata,
} from "../../types.js";

export interface CollaborationPrincipal {
  id: string;
  name: string;
  role: "reader" | "writer" | "admin";
}
export interface Presence {
  actor: string;
  principalId: string;
  clientId: string;
  name: string;
  kind: "human" | "agent";
  activity: "viewing" | "editing" | "streaming";
  epoch: string;
  revision: number;
  leaseExpiresAt: number;
  sequence?: number;
  selectionRevision?: number;
  anchor?: number;
  focus?: number;
}
export type PublishedSourceOperation = Omit<
  SourceOperation,
  "removed" | "insert" | "operations"
> & {
  insert?: string;
  snapshotOnly?: true;
  operations?: { start: number; deleteCount: number; insert: string; ambiguous?:true }[];
  splices?: { start: number; deleteCount: number; insert: string; ambiguous?:true }[];
};
export interface CollaborationSnapshot {
  protocol: 2;
  documentId: string;
  epoch: string;
  revision: number;
  prefix: string;
  body: string;
  title: string;
  file: string;
  contentHash: string;
  saved: boolean;
  recognition?: SearchRecognitionMetadata;
  operation?: PublishedSourceOperation;
  presence: Presence[];
  conflict?: { code: string };
  indexing?: "pending" | "failed";
  stream?: {
    streamId: string;
    sequence: number;
    state: string;
    reason?: string;
  } | null;
  recovery?: {
    code: "external_destructive_replacement";
    directory: string;
    recoveryId: string;
    baseContentHash: string;
    externalContentHash: string;
  };
  recoveryDiscovery?: "incomplete";
}
interface Session {
  documentId: string;
  base: MemoryDocumentReadResult;
  model: SourceModel;
  listeners: Set<(snapshot: CollaborationSnapshot) => void>;
  presence: Map<string, Presence>;
  connections: Map<string, { count:number; principalId:string; role:CollaborationPrincipal["role"] }>;
  accessedAt: number;
  busy: boolean;
  streamActivity: Map<string, number>;
  recovery?: CollaborationSnapshot["recovery"];
  recoveryDiscovery?: "incomplete";
  conflict?: string;
  fingerprint?: string;
  candidate?: {
    hash: string;
    content?: string;
    firstSeen: number;
    changedAt: number;
    missing?: boolean;
  };
}
export interface CollaborationHubOptions {
  root: string;
  enqueueWrite?: <T>(operation: () => Promise<T>) => Promise<T>;
  onWrite?: () => void;
  observeIntervalMs?: number;
  quietMs?: number;
  maxWaitMs?: number;
  idleMs?: number;
  maxSessions?: number;
  maxDocumentBytes?: number;
  maxHistoryBytes?: number;
  maxTotalHistoryBytes?: number;
  maxSnapshotBytes?: number;
  streamLeaseMs?: number;
  presenceLeaseMs?: number;
}
function fail(code: string, message?: string): never {
  throw new CollaborationError(code, message);
}
const hash = (content: string | Buffer) =>
  "sha256:" + createHash("sha256").update(content).digest("hex");
const errorCode = (error: unknown) =>
  typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "source_unavailable";
const validId = (id: unknown): string => {
  if (
    typeof id !== "string" ||
    !/^mem_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      id,
    )
  )
    fail("invalid_document");
  return id;
};
const text = (value: unknown, max = 256): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > max ||
    !isSourceText(value)
  )
    fail("invalid_request");
  return value;
};
const integer = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    fail("invalid_request");
  return value;
};
export function splitCanonicalContent(content: string) {
  let offset = 0,
    line = 0;
  while (offset < content.length) {
    const newline = content.indexOf("\n", offset),
      end = newline === -1 ? content.length : newline,
      delimiter = content.slice(offset, end).trim() === "---";
    if (line === 0 && !delimiter) break;
    if (line > 0 && delimiter) {
      const boundary = newline === -1 ? end : end + 1;
      return {
        prefix: content.slice(0, boundary),
        body: content.slice(boundary),
      };
    }
    if (newline === -1) break;
    offset = end + 1;
    line++;
  }
  return { prefix: "", body: content };
}
function stampActor(
  principal: CollaborationPrincipal,
  params: Record<string, unknown>,
): MemoryActor {
  const declared = normalizeMemoryActor(params.declaredActor);
  if (declared) return declared;
  return {
    kind: params.actorKind === "agent" ? "agent" : "human",
    id: principal.id,
    name: principal.name,
  };
}
export class CollaborationHub {
  readonly root: string;
  readonly maxDocumentBytes: number;
  private readonly sessions = new Map<string, Session>();
  private readonly options: CollaborationHubOptions;
  private queue = Promise.resolve();
  private readonly timer?: ReturnType<typeof setInterval>;
  private observing = false;
  private closed = false;
  constructor(options: CollaborationHubOptions) {
    this.options = options;
    this.root = options.root;
    this.maxDocumentBytes = options.maxDocumentBytes ?? 2 * 1024 * 1024;
    if (options.observeIntervalMs !== 0) {
      this.timer = setInterval(() => {
        void this.observe().catch(() => {});
      }, options.observeIntervalMs ?? 250);
      this.timer.unref?.();
    }
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed)
      return Promise.reject(new CollaborationError("backend_stopping"));
    const run = this.queue.then(() =>
      this.options.enqueueWrite
        ? this.options.enqueueWrite(operation)
        : operation(),
    );
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  private actor(
    principal: CollaborationPrincipal,
    params: Record<string, unknown>,
  ) {
    return JSON.stringify([
      text(principal.id),
      typeof params.clientId === "string"
        ? text(params.clientId, 128)
        : "default",
    ]);
  }
  private insertion(session: Session, value: unknown) {
    if (typeof value !== "string") fail("invalid_patch");
    // Canonical attribution serialization uses the document's line ending.
    // Normalize the incoming splice before rebasing so streamed anchors already
    // describe the exact bytes that the existing publisher will acknowledge.
    const lineEnding = splitCanonicalContent(
      session.base.content,
    ).prefix.includes("\r\n")
      ? "\r\n"
      : "\n";
    return value.replace(/\r?\n/g, lineEnding);
  }
  private snapshot(
    session: Session,
    operation?: SourceOperation,
    persistPresence = true,
  ): CollaborationSnapshot {
    const { prefix } = splitCanonicalContent(session.base.content);
    const operations = operation && operationSplices(operation).map(
      ({ start, deleteCount, insert, ambiguous }) => ({ start, deleteCount, insert, ...(ambiguous ? {ambiguous:true as const} : {}) }),
    );
    const includeInsert =
      operation &&
      Buffer.byteLength(
        operations ? JSON.stringify(operations) : operation.insert,
      ) <= 8192;
    const publishedOperation = operation
      ? {
          actor: operation.actor,
          operationId: operation.operationId,
          start: operation.start,
          deleteCount: operation.deleteCount,
          revision: operation.revision,
          ...(operation.inverseOf ? { inverseOf: { ...operation.inverseOf } } : {}),
          ...(includeInsert
            ? {
                insert: operation.insert,
                ...(operations ? { operations, splices: operations } : {}),
              }
            : { snapshotOnly: true as const }),
        }
      : undefined;
    return {
      protocol: 2,
      documentId: session.documentId,
      epoch: session.model.epoch,
      revision: session.model.revision,
      prefix,
      body: session.model.body,
      title: session.base.title,
      file: session.base.file,
      contentHash: session.base.contentHash,
      saved: !session.conflict,
      recognition: session.base.recognition,
      presence: this.projectPresence(session, persistPresence),
      ...(session.recovery ? { recovery: session.recovery } : {}),
      ...(session.recoveryDiscovery
        ? { recoveryDiscovery: session.recoveryDiscovery }
        : {}),
      ...(publishedOperation ? { operation: publishedOperation } : {}),
      ...(session.conflict ? { conflict: { code: session.conflict } } : {}),
    };
  }
  private emit(
    session: Session,
    operation?: SourceOperation,
    stream?: CollaborationSnapshot["stream"],
  ) {
    const snapshot = this.snapshot(session, operation);
    if (stream)
      snapshot.stream = {
        streamId: stream.streamId,
        sequence: stream.sequence,
        state: stream.state,
        ...(stream.reason ? { reason: stream.reason } : {}),
      };
    for (const listener of session.listeners) {
      try {
        listener(snapshot);
      } catch {
        /* a transport cannot break publication */
      }
    }
    return snapshot;
  }
  private prune() {
    const idle = this.options.idleMs ?? 5 * 60_000,
      now = Date.now();
    for (const [id, session] of this.sessions)
      if (
        !session.listeners.size &&
        !session.busy &&
        now - session.accessedAt > idle
      )
        this.sessions.delete(id);
  }
  private capHistory(candidate: SourceModel, own: Session) {
    const others = [...this.sessions.values()].reduce(
      (sum, session) =>
        sum + (session === own ? 0 : session.model.retainedBytes),
      0,
    );
    const available =
      (this.options.maxTotalHistoryBytes ?? 32 * 1024 * 1024) - others;
    if (available < Buffer.byteLength(candidate.body))
      fail(
        "session_capacity",
        "Too many large open documents. Close an inactive note before editing.",
      );
    candidate.pruneHistory(available);
  }
  private async session(documentId: string): Promise<Session> {
    this.prune();
    let session = this.sessions.get(documentId);
    if (session) {
      session.accessedAt = Date.now();
      return session;
    }
    if (this.sessions.size >= (this.options.maxSessions ?? 16)) {
      const idle = [...this.sessions.values()]
        .filter((s) => !s.listeners.size && !s.busy)
        .sort((a, b) => a.accessedAt - b.accessedAt)[0];
      if (idle) this.sessions.delete(idle.documentId);
      else
        fail(
          "session_capacity",
          "Close an inactive note before opening another.",
        );
    }
    const base = await readMemoryDocument(this.root, documentId, {
      maxSourceBytes: this.maxDocumentBytes,
    });
    if (
      Buffer.byteLength(base.content) > this.maxDocumentBytes ||
      hash(base.content) !== base.contentHash
    )
      fail(
        "document_limit",
        "This note exceeds live editing limits or contains invalid UTF-8. Its canonical file is unchanged.",
      );
    const model = new SourceModel(splitCanonicalContent(base.content).body, {
      epoch: randomUUID(),
      maxBytes: this.maxDocumentBytes,
      maxHistoryBytes: this.options.maxHistoryBytes ?? 8 * 1024 * 1024,
    });
    const recovery = await latestRecovery(
      base.root,
      documentId,
      this.maxDocumentBytes,
    );
    session = {
      documentId,
      base,
      model,
      listeners: new Set(),
      presence: new Map(),
      connections: new Map(),
      accessedAt: Date.now(),
      busy: false,
      streamActivity: new Map(),
      recovery: recovery.recovery,
      recoveryDiscovery: recovery.incomplete ? "incomplete" : undefined,
    };
    this.capHistory(model, session);
    this.sessions.set(documentId, session);
    return session;
  }
  async open(
    documentId: string,
    principal?: CollaborationPrincipal,
    params: Record<string, unknown> = {},
  ): Promise<CollaborationSnapshot> {
    return this.serialize(async () => {
      const session = await this.session(validId(documentId));
      await this.settleOpen(session);
      if (principal) this.setPresence(session, principal, params);
      return this.snapshot(session);
    });
  }
  read(documentId: string) {
    return this.open(documentId);
  }
  async readHistory(params: Record<string, unknown>, principal: CollaborationPrincipal) {
    if (!["reader", "writer", "admin"].includes(principal.role)) fail("forbidden");
    return this.serialize(async () => {
      const session = await this.session(validId(params.documentId));
      await this.settleOpen(session);
      if (session.conflict) fail("source_conflict");
      if (params.epoch !== session.model.epoch) fail("epoch_changed");
      const fromRevision = integer(params.fromRevision);
      const toRevision = params.toRevision === undefined ? session.model.revision : integer(params.toRevision);
      if (fromRevision > toRevision || toRevision > session.model.revision) fail("invalid_revision");
      if (toRevision - fromRevision > 128) fail("history_limit", "The operation range exceeds the bounded live history. Retain the draft and resynchronize.");
      const operations = session.model.changesSince(fromRevision, toRevision).map((operation) => ({
        revision: operation.revision, actor: operation.actor, operationId: operation.operationId,
        ...(operation.inverseOf ? { inverseOf: { ...operation.inverseOf } } : {}),
        splices: operationSplices(operation).map(({start,deleteCount,insert,ambiguous}) => ({start,deleteCount,insert,...(ambiguous ? {ambiguous:true as const} : {})})),
      }));
      const response = { documentId: session.documentId, epoch: session.model.epoch, fromRevision, toRevision, operations };
      if (Buffer.byteLength(JSON.stringify(response)) > (this.options.maxSnapshotBytes ?? 3 * 1024 * 1024) - 4096)
        fail("history_limit", "The exact operations exceed the live history response budget. Retain the draft and resynchronize.");
      return response;
    });
  }
  async readRecovery(
    params: Record<string, unknown>,
    principal: CollaborationPrincipal,
  ) {
    if (!["reader", "writer", "admin"].includes(principal.role))
      fail("forbidden");
    return this.serialize(async () => {
      const session = await this.session(validId(params.documentId));
      const result = await readRecovery(
        session.base.root,
        session.documentId,
        params.recoveryId,
        this.maxDocumentBytes,
      );
      if (
        params.expectedBaseHash !== result.base.contentHash ||
        params.expectedExternalHash !== result.external.contentHash
      )
        fail("recovery_changed");
      const current = await readMemoryDocument(this.root, session.documentId, {
        maxSourceBytes: this.maxDocumentBytes,
      });
      if (
        params.copy !== undefined &&
        params.copy !== "base" &&
        params.copy !== "external"
      )
        fail("invalid_request");
      if (params.format !== undefined && params.format !== "editable")
        fail("invalid_request");
      const editable = (copy: typeof result.base) => {
        const parsed = parseFrontmatter(copy.content);
        return {
          title:
            typeof parsed.frontmatter.title === "string"
              ? parsed.frontmatter.title
              : "Untitled note",
          body: splitCanonicalContent(copy.content).body,
          contentHash: copy.contentHash,
        };
      };
      const copies =
        params.format === "editable"
          ? { base: editable(result.base), external: editable(result.external) }
          : { base: result.base, external: result.external };
      const response = {
        ...result,
        ...copies,
        ...(params.copy === "base"
          ? { external: undefined }
          : params.copy === "external"
            ? { base: undefined }
            : {}),
        currentContentHash: current.contentHash,
      };
      if (
        Buffer.byteLength(JSON.stringify(response)) >
        (this.options.maxSnapshotBytes ?? 3 * 1024 * 1024) - 4096
      )
        fail(
          "recovery_limit",
          "The retained comparison exceeds the bounded live response limit.",
        );
      return response;
    });
  }
  async openSubscribed(
    documentId: string,
    principal: CollaborationPrincipal,
    params: Record<string, unknown>,
    listener: (snapshot: CollaborationSnapshot) => void,
  ) {
    return this.serialize(async () => {
      const session = await this.session(validId(documentId));
      await this.settleOpen(session);
      this.setPresence(session, principal, params);
      const actor = this.actor(principal, params);
      const connection = session.connections.get(actor) ?? {count:0,principalId:principal.id,role:principal.role};
      connection.count++; connection.role = principal.role; session.connections.set(actor,connection);
      const publish = (snapshot:CollaborationSnapshot) => listener(snapshot);
      session.listeners.add(publish);
      this.syncActiveUndoActors(session);
      this.emit(session);
      let disposed = false;
      return {
        snapshot: this.snapshot(session),
        dispose: () => {
          if (disposed) return; disposed = true;
          session.listeners.delete(publish);
          const current = session.connections.get(actor);
          if (current === connection && --current.count === 0) session.connections.delete(actor);
          const removed = !session.connections.has(actor) && session.presence.delete(actor);
          this.syncActiveUndoActors(session);
          session.accessedAt = Date.now();
          if (removed) this.emit(session);
        },
      };
    });
  }
  subscribe(
    documentId: string,
    listener: (snapshot: CollaborationSnapshot) => void,
  ) {
    const session = this.sessions.get(validId(documentId));
    if (!session) fail("document_not_open");
    session.listeners.add(listener);
    session.accessedAt = Date.now();
    return () => {
      session.listeners.delete(listener);
      session.accessedAt = Date.now();
    };
  }
  private setPresence(
    session: Session,
    principal: CollaborationPrincipal,
    params: Record<string, unknown>,
    clearMissingSelection = false,
  ) {
    this.projectPresence(session);
    const actor = this.actor(principal, params);
    if (!session.presence.has(actor) && session.presence.size >= 64)
      fail("actor_limit");
    const previous = session.presence.get(actor);
    const declared = stampActor(principal, params);
    const value: Presence = {
      actor,
      principalId: principal.id,
      clientId:
        typeof params.clientId === "string" ? params.clientId : "default",
      activity: "viewing",
      epoch: session.model.epoch,
      revision: session.model.revision,
      leaseExpiresAt: Date.now() + (this.options.presenceLeaseMs ?? 30_000),
      ...(previous?.epoch === session.model.epoch ? previous : {}),
      name: declared.name || principal.name,
      kind: declared.kind,
    };
    value.leaseExpiresAt =
      Date.now() + (this.options.presenceLeaseMs ?? 30_000);
    if (params.presenceSequence !== undefined) {
      const sequence = integer(params.presenceSequence);
      if (previous?.sequence !== undefined && sequence <= previous.sequence)
        fail("stale_presence");
      value.sequence = sequence;
    }
    const selection = params.selection;
    if (selection === undefined && (clearMissingSelection || params.activity === "viewing")) {
      delete value.anchor;
      delete value.focus;
      value.activity = "viewing";
    }
    if (selection !== undefined) {
      if (!selection || typeof selection !== "object") fail("invalid_request");
      if (params.epoch !== session.model.epoch) fail("epoch_changed");
      const revision = integer(params.baseRevision);
      if (revision > session.model.revision) fail("invalid_revision");
      if (
        previous?.selectionRevision !== undefined &&
        revision < previous.selectionRevision
      )
        fail("stale_presence");
      const { anchor, focus } = selection as Record<string, unknown>;
      value.anchor = session.model.transformPosition(integer(anchor), revision);
      value.focus = session.model.transformPosition(integer(focus), revision);
      value.epoch = session.model.epoch;
      value.revision = session.model.revision;
      value.selectionRevision = revision;
      value.activity = params.activity === "viewing" ? "viewing" : "editing";
      if (params.presenceSequence !== undefined)
        value.sequence = integer(params.presenceSequence);
    }
    session.presence.set(actor, value);
    this.syncActiveUndoActors(session);
  }
  private activeUndoActors(session:Session) {
    const actors = new Set<string>(),now = Date.now();
    for (const [actor, connection] of session.connections)
      if (connection.count > 0 && connection.role !== "reader" && (session.presence.get(actor)?.leaseExpiresAt ?? 0) > now) actors.add(actor);
    for (const [key, stream] of session.model.streams)
      if (stream.state === "active" && now-(session.streamActivity.get(key) ?? -Infinity) < (this.options.streamLeaseMs ?? 60_000)) actors.add(stream.actor);
    return actors;
  }
  private syncActiveUndoActors(session:Session) {
    session.model.setActiveActors(this.activeUndoActors(session));
  }
  private projectPresence(session: Session, persist = true): Presence[] {
    const projected: Presence[] = [];
    for (const [actor, stored] of session.presence) {
      if (stored.leaseExpiresAt <= Date.now()) {
        if (persist) session.presence.delete(actor);
        continue;
      }
      const value = { ...stored };
      if (value.activity === "streaming") {
        value.activity = "viewing";
        delete value.anchor;
        delete value.focus;
      }
      try {
        if (value.epoch !== session.model.epoch) fail("epoch_changed");
        if (value.anchor !== undefined)
          value.anchor = session.model.transformPosition(
            value.anchor,
            value.revision,
          );
        if (value.focus !== undefined)
          value.focus = session.model.transformPosition(
            value.focus,
            value.revision,
          );
      } catch {
        delete value.anchor;
        delete value.focus;
        if (value.epoch !== session.model.epoch) {
          delete value.selectionRevision;
          delete value.sequence;
        }
        value.activity = "viewing";
      }
      value.epoch = session.model.epoch;
      value.revision = session.model.revision;
      for (const stream of session.model.streams.values()) {
        if (stream.actor !== actor || stream.state !== "active") continue;
        try {
          value.anchor = value.focus = session.model.transformPosition(
            stream.start,
            stream.baseRevision,
          );
          value.kind = "agent";
          value.activity = "streaming";
        } catch {
          /* An unprovable stream anchor must not paint a stale cursor. */
        }
      }
      if (persist) session.presence.set(actor, value);
      projected.push(value);
    }
    if (persist) this.syncActiveUndoActors(session);
    return projected;
  }
  leave(
    principal: CollaborationPrincipal,
    clientId: string,
    documentId?: string,
  ) {
    const actor = this.actor(principal, { clientId });
    for (const session of this.sessions.values())
      if (
        (!documentId || session.documentId === documentId) &&
        !session.connections.has(actor) &&
        session.presence.delete(actor)
      )
        this.emit(session);
    for (const session of this.sessions.values()) this.syncActiveUndoActors(session);
  }
  private expireStreams(session: Session) {
    let expired = false;
    for (const [key, stream] of session.model.streams) {
      const last = session.streamActivity.get(key);
      if (
        last === undefined ||
        Date.now() - last >= (this.options.streamLeaseMs ?? 60_000)
      ) {
        session.model.cancelStream(
          stream.actor,
          stream.streamId,
          "lease_expired",
        );
        session.streamActivity.delete(key);
        expired = true;
      }
    }
    this.syncActiveUndoActors(session);
    if (expired) this.emit(session);
  }
  async revokePrincipal(principalId: string) {
    if (this.closed) return;
    await this.serialize(async () => {
      for (const session of this.sessions.values()) {
        let revoked = false;
        for (const [actor,connection] of session.connections)
          if (connection.principalId === principalId) {session.connections.delete(actor);revoked = true;}
        for (const [actor, presence] of session.presence)
          if (presence.principalId === principalId) {
            session.presence.delete(actor);
            revoked = true;
          }
        for (const [key, stream] of session.model.streams) {
          let owner: unknown;
          try {
            owner = JSON.parse(stream.actor);
          } catch {
            continue;
          }
          if (Array.isArray(owner) && owner[0] === principalId) {
            session.model.cancelStream(
              stream.actor,
              stream.streamId,
              "authorization_revoked",
            );
            session.streamActivity.delete(key);
            revoked = true;
          }
        }
        this.syncActiveUndoActors(session);
        if (revoked) this.emit(session);
      }
    });
  }
  async dispatch(
    method: string,
    params: Record<string, unknown>,
    principal: CollaborationPrincipal,
  ): Promise<CollaborationSnapshot> {
    if (method === "open")
      return this.open(text(params.documentId), principal, params);
    return this.serialize(async () => {
      const session = await this.session(validId(params.documentId));
      this.expireStreams(session);
      if (method === "presence" || method === "stream.status")
        await this.refresh(session, true);
      else await this.settleOpen(session);
      if (method === "presence") {
        if (params.epoch !== session.model.epoch) fail("epoch_changed");
        const revision = integer(params.baseRevision);
        if (revision > session.model.revision) fail("invalid_revision");
        if (!session.model.versions.has(revision)) fail("history_expired");
      }
      this.setPresence(session, principal, params, method === "presence");
      if (method === "presence") return this.emit(session);
      if (method === "resync") {
        const current = await readMemoryDocument(
          this.root,
          session.documentId,
          { maxSourceBytes: this.maxDocumentBytes },
        );
        if (
          hash(current.content) !== current.contentHash ||
          Buffer.byteLength(current.content) > this.maxDocumentBytes
        )
          fail("unsafe_source");
        if (
          !session.conflict &&
          current.contentHash === session.base.contentHash
        )
          return this.snapshot(session);
        if (principal.role === "reader")
          fail(
            "forbidden",
            "A writer must resolve the external source conflict.",
          );
        session.base = current;
        session.model = new SourceModel(
          splitCanonicalContent(current.content).body,
          { epoch: randomUUID(), maxBytes: this.maxDocumentBytes },
        );
        session.conflict = undefined;
        session.candidate = undefined;
        session.streamActivity.clear();
        return this.emit(session);
      }
      if (principal.role === "reader")
        fail("forbidden", "This credential has read-only access.");
      if (session.conflict)
        fail(
          "source_conflict",
          "The external source needs recovery. Your draft must be retained.",
        );
      if (params.epoch !== session.model.epoch)
        fail(
          "epoch_changed",
          "Resynchronize before publishing the retained draft.",
        );
      if ((method === "edit" || method === "title") && params.expectedContentHash !== undefined) {
        if (
          typeof params.expectedContentHash !== "string" ||
          !/^sha256:[a-f0-9]{64}$/.test(params.expectedContentHash)
        )
          fail("invalid_request");
        if (
          params.expectedContentHash !== session.base.contentHash ||
          params.baseRevision !== session.model.revision
        )
          fail(
            "precondition_failed",
            "The saved note changed after review. Refresh the comparison before restoring.",
          );
      }
      this.syncActiveUndoActors(session);
      const actor = this.actor(principal, params),
        candidate = session.model.fork();
      let operation: SourceOperation | undefined,
        stream: CollaborationSnapshot["stream"];
      if (method === "edit") {
        const identity = {
          actor,
          operationId: text(params.operationId),
          epoch: candidate.epoch,
          baseRevision: integer(params.baseRevision),
        };
        let result;
        if (params.operations !== undefined) {
          if (
            !Array.isArray(params.operations) ||
            params.operations.length > 256 ||
            ["start", "deleteCount", "insert"].some(
              (key) => params[key] !== undefined,
            )
          )
            fail(
              "invalid_patch",
              "Use either one splice or a bounded operations batch.",
            );
          const operations = params.operations.map((value) => {
            if (!value || typeof value !== "object" || Array.isArray(value))
              fail("invalid_patch");
            const operation = value as Record<string, unknown>;
            return {
              start: integer(operation.start),
              deleteCount: integer(operation.deleteCount),
              insert: this.insertion(session, operation.insert),
            };
          });
          result = candidate.applyBatch({ ...identity, operations });
        } else
          result = candidate.apply({
            ...identity,
            start: integer(params.start),
            deleteCount: integer(params.deleteCount),
            insert: this.insertion(session, params.insert),
          });
        operation = result.operation;
      } else if (method === "undo") {
        operation = candidate.undo(actor, text(params.operationId)).operation;
      } else if (method === "redo") {
        operation = candidate.redo(actor, text(params.operationId)).operation;
      } else if (method === "stream.start") {
        stream = candidate.startStream(
          actor,
          text(params.streamId),
          integer(params.start),
          integer(params.baseRevision),
        );
      } else if (method === "stream.chunk") {
        operation = candidate.chunk(
          actor,
          text(params.streamId),
          integer(params.sequence),
          this.insertion(session, params.insert),
        ).operation;
        stream = candidate.streamStatus(actor, text(params.streamId));
      } else if (method === "stream.cancel") {
        stream = candidate.cancelStream(actor, text(params.streamId));
      } else if (method === "stream.finish") {
        stream = candidate.finishStream(actor, text(params.streamId));
      } else if (method === "stream.status") {
        stream = candidate.streamStatus(actor, text(params.streamId));
      } else if (method === "title") {
        if (integer(params.baseRevision) !== session.model.revision)
          fail("title_conflict");
        const title = text(params.title, 2000).trim();
        if (!title) fail("invalid_title");
        const { prefix, body } = splitCanonicalContent(session.base.content);
        const nextPrefix = /^title:.*$/m.test(prefix)
          ? prefix.replace(/^title:.*$/m, "title: " + JSON.stringify(title))
          : prefix.replace(
              /\r?\n---(?:\r?\n|$)$/,
              (end) => "\ntitle: " + JSON.stringify(title) + end,
            );
        operation = candidate.checkpoint(
          actor,
          typeof params.operationId === "string"
            ? text(params.operationId)
            : randomUUID(),
        ).operation;
        await this.publish(
          session,
          candidate,
          nextPrefix + body,
          stampActor(principal, params),
          operation,
        );
        return this.emit(session, operation);
      } else fail("unknown_method");
      this.capHistory(candidate, session);
      if (candidate.body !== session.model.body) {
        const { prefix } = splitCanonicalContent(session.base.content);
        await this.publish(
          session,
          candidate,
          prefix + candidate.body,
          stampActor(principal, params),
          operation,
        );
      } else session.model = candidate;
      for (const key of session.streamActivity.keys())
        if (!session.model.streams.has(key)) session.streamActivity.delete(key);
      if (stream?.state === "active")
        session.streamActivity.set(
          JSON.stringify([actor, stream.streamId]),
          Date.now(),
        );
      return this.emit(session, operation, stream);
    });
  }
  private async publish(
    session: Session,
    candidate: SourceModel,
    submitted: string,
    actor: MemoryActor,
    operation?: SourceOperation,
  ) {
    if (Buffer.byteLength(submitted) > this.maxDocumentBytes)
      fail("document_limit");
    const updatedAt = new Date().toISOString(),
      predicted = mergeMemoryDocumentUpdate(session.base.content, submitted, {
        updatedAt,
        actor,
      }).content;
    if (Buffer.byteLength(predicted) > this.maxDocumentBytes)
      fail(
        "document_limit",
        "The saved note and its metadata must fit within the live source limit.",
      );
    const predictedBase = {
      ...session.base,
      content: predicted,
      contentHash: hash(predicted) as MemoryDocumentReadResult["contentHash"],
      title: String(
        parseFrontmatter(predicted).frontmatter.title ?? session.base.title,
      ),
    };
    const projected = this.snapshot(
      { ...session, base: predictedBase, model: candidate },
      operation,
      false,
    );
    projected.body = splitCanonicalContent(predicted).body;
    if (
      Buffer.byteLength(
        JSON.stringify({
          event: "document",
          documentId: session.documentId,
          snapshot: projected,
        }),
      ) >
      (this.options.maxSnapshotBytes ?? 3 * 1024 * 1024) - 4096
    )
      fail(
        "document_limit",
        "The escaped saved note exceeds the live response limit. The canonical note is unchanged.",
      );
    session.busy = true;
    try {
      const result = await updateMemoryDocument(
        this.root,
        session.documentId,
        submitted,
        {
          ifMatch: session.base.contentHash,
          updatedAt,
          actor,
          maxSourceBytes: this.maxDocumentBytes,
        },
      );
      if (result.newContentHash !== hash(predicted)) {
        session.conflict = "publication_uncertain";
        await this.preserve(
          session,
          "publication_uncertain",
          undefined,
          submitted,
        );
        fail(
          "publication_uncertain",
          "The write outcome needs a canonical refresh. Retain the draft; do not repeat it blindly.",
        );
      }
      const parsed = parseFrontmatter(predicted);
      session.base = {
        ...session.base,
        content: predicted,
        contentHash: result.newContentHash,
        title:
          typeof parsed.frontmatter.title === "string"
            ? parsed.frontmatter.title
            : session.base.title,
        frontmatter: parsed.frontmatter,
        recognition: result.recognition,
      };
      // The canonical policy can normalize line endings. Never let the live
      // model drift from the bytes actually acknowledged.
      const publishedBody = splitCanonicalContent(predicted).body;
      session.model =
        publishedBody === candidate.body
          ? candidate
          : new SourceModel(publishedBody, {
              epoch: randomUUID(),
              maxBytes: this.maxDocumentBytes,
            });
      session.fingerprint = undefined;
      session.candidate = undefined;
      try {
        await markRemoteIndexStale(this.root);
        this.options.onWrite?.();
      } catch {
        /* a saved note is still saved when derived maintenance fails */
      }
    } catch (error) {
      if (errorCode(error) === "precondition_failed") {
        session.fingerprint = undefined;
        await this.preserve(session, "publication_raced", undefined, submitted);
      }
      throw error;
    } finally {
      session.busy = false;
    }
  }
  private async preserve(
    session: Session,
    reason: string,
    external?: string | Buffer,
    proposal?: string,
    leafName: string = randomUUID(),
  ) {
    let directory = session.base.root;
    const directories = [directory];
    for (const part of [
      ".jumpybrain",
      "recovery",
      session.documentId,
      leafName,
    ]) {
      directory = path.join(directory, part);
      await mkdir(directory, { mode: 0o700 }).catch((error) => {
        if (errorCode(error) !== "EEXIST") throw error;
      });
      const entry = await lstat(directory);
      if (!entry.isDirectory() || entry.isSymbolicLink())
        fail(
          "unsafe_recovery",
          "Recovery directory must be private and must not contain symlinks.",
        );
      directories.push(directory);
    }
    const files: Record<string, string | Buffer> = {
      "base.md": session.base.content,
      "pending.md":
        proposal ??
        splitCanonicalContent(session.base.content).prefix + session.model.body,
    };
    if (external !== undefined) files["external.md"] = external;
    files["recovery.json"] =
      JSON.stringify({
        version: 1,
        reason,
        documentId: session.documentId,
        epoch: session.model.epoch,
        revision: session.model.revision,
        externalObserved: external !== undefined,
        baseContentHash: session.base.contentHash,
        ...(external !== undefined
          ? { externalContentHash: hash(external) }
          : {}),
      }) + "\n";
    for (const [name, content] of Object.entries(files)) {
      const handle = await open(path.join(directory, name), "wx", 0o600);
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    for (const parent of directories.reverse()) {
      let handle;
      try {
        handle = await open(parent, "r");
        await handle.sync();
      } catch {
        /* Directory fsync is unavailable on some supported filesystems. */
      } finally {
        await handle?.close();
      }
    }
    return path
      .relative(session.base.root, directory)
      .split(path.sep)
      .join("/");
  }
  private async preserveDestructiveExternal(
    session: Session,
    external: string,
  ) {
    const externalHash = hash(external),
      key = createHash("sha256")
        .update(session.base.contentHash)
        .update(externalHash)
        .digest("hex");
    const parent = path.join(
        session.base.root,
        ".jumpybrain",
        "recovery",
        session.documentId,
      ),
      directory = path.join(parent, "raw-" + key);
    const complete = async () => {
      try {
        await recordLatestRecovery(
          session.base.root,
          session.documentId,
          "raw-" + key,
          this.maxDocumentBytes,
        );
        session.recoveryDiscovery = undefined;
      } catch {
        session.recoveryDiscovery = "incomplete";
      }
      return path
        .relative(session.base.root, directory)
        .split(path.sep)
        .join("/");
    };
    const verify = async () => {
      const metadata = JSON.parse(
        (
          await readBoundedCanonicalSource(
            session.base.root,
            path.join(directory, "recovery.json"),
            4096,
          )
        ).toString("utf8"),
      );
      if (
        metadata.reason !== "external_destructive_replacement" ||
        metadata.documentId !== session.documentId ||
        metadata.baseContentHash !== session.base.contentHash ||
        metadata.externalContentHash !== externalHash
      )
        fail("unsafe_recovery");
      if (
        hash(
          await readBoundedCanonicalSource(
            session.base.root,
            path.join(directory, "base.md"),
            this.maxDocumentBytes,
          ),
        ) !== session.base.contentHash ||
        hash(
          await readBoundedCanonicalSource(
            session.base.root,
            path.join(directory, "external.md"),
            this.maxDocumentBytes,
          ),
        ) !== externalHash
      )
        fail("unsafe_recovery");
    };
    try {
      await verify();
      return complete();
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    const staging = await this.preserve(
      session,
      "external_destructive_replacement",
      external,
      undefined,
      "raw-" + key + "." + randomUUID() + ".pending",
    );
    const stage = path.join(session.base.root, staging);
    try {
      await rename(stage, directory);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(errorCode(error))) throw error;
      await verify();
      await rm(stage, { recursive: true }); // Proven identical duplicate, never unique recovery data.
    }
    let handle;
    try {
      handle = await open(parent, "r");
      await handle.sync();
    } catch {
      /* Directory fsync is not supported on every filesystem. */
    } finally {
      await handle?.close();
    }
    return complete();
  }
  private async settleOpen(session: Session) {
    // Reopening must not acknowledge an older Saved revision while a complete
    // replacement is still inside the external-writer quiet period.
    await this.refresh(session, true);
    const deadline = Date.now() + (this.options.maxWaitMs ?? 2000) + 50;
    while (session.candidate && !session.conflict) {
      if (Date.now() >= deadline) {
        session.conflict = "external_unstable";
        await this.preserve(
          session,
          session.conflict,
          session.candidate.content,
        );
        this.emit(session);
        break;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(25, Math.max(1, this.options.quietMs ?? 150)),
        ),
      );
      await this.refresh(session, true);
    }
  }
  private async refresh(session: Session, immediate = false, settled = false) {
    if (session.conflict) return;
    const canonicalRoot = session.base.root;
    const file = path.join(canonicalRoot, session.base.file);
    let content: string | undefined,
      fingerprint: string | undefined,
      missing = false,
      raw: Buffer | undefined;
    try {
      const stat = await lstat(file);
      fingerprint = [
        stat.dev,
        stat.ino,
        stat.size,
        stat.mtimeMs,
        stat.ctimeMs,
      ].join(":");
      if (!immediate && fingerprint === session.fingerprint) return;
      raw = await readBoundedCanonicalSource(
        canonicalRoot,
        file,
        this.maxDocumentBytes,
      );
      content = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        try {
          const moved = await readMemoryDocument(
            this.root,
            session.documentId,
            { maxSourceBytes: this.maxDocumentBytes },
          );
          session.base = { ...session.base, file: moved.file };
          content = moved.content;
        } catch {
          missing = true;
        }
      } else {
        const now = Date.now(),
          signature = "unreadable:" + (fingerprint ?? errorCode(error));
        if (!session.candidate)
          session.candidate = {
            hash: signature,
            firstSeen: now,
            changedAt: now,
          };
        else if (session.candidate.hash !== signature)
          Object.assign(session.candidate, { hash: signature, changedAt: now });
        if (
          now - session.candidate.firstSeen <
          (this.options.maxWaitMs ?? 2000)
        )
          return;
        session.conflict =
          error instanceof TypeError ? "invalid_utf8" : "unsafe_source";
        await this.preserve(session, session.conflict, raw);
        this.emit(session);
        return;
      }
    }
    if (!missing && hash(content!) === session.base.contentHash) {
      session.fingerprint = fingerprint;
      session.candidate = undefined;
      return;
    }
    const now = Date.now(),
      signature = missing ? "missing" : hash(content!);
    if (!session.candidate)
      session.candidate = {
        hash: signature,
        content,
        firstSeen: now,
        changedAt: now,
        missing,
      };
    else if (session.candidate.hash !== signature)
      Object.assign(session.candidate, {
        hash: signature,
        content,
        changedAt: now,
        missing,
      });
    const candidate = session.candidate,
      quiet =
        settled || now - candidate.changedAt >= (this.options.quietMs ?? 150),
      expired = now - candidate.firstSeen >= (this.options.maxWaitMs ?? 2000);
    if (!quiet) {
      if (expired) {
        session.conflict = "external_unstable";
        await this.preserve(session, session.conflict, content);
        this.emit(session);
      }
      return;
    }
    if (missing) {
      session.conflict = "source_deleted";
      await this.preserve(session, session.conflict);
      this.emit(session);
      return;
    }
    const parsed = parseFrontmatter(content!);
    if (parsed.frontmatter.id !== session.documentId) {
      if (expired) {
        session.conflict = "invalid_identity_or_partial_file";
        await this.preserve(session, session.conflict, content);
        this.emit(session);
      }
      return;
    }
    const current = await readMemoryDocument(this.root, session.documentId, {
      maxSourceBytes: this.maxDocumentBytes,
    });
    if (current.contentHash !== candidate.hash) return;
    this.syncActiveUndoActors(session);
    const next = session.model.fork(),
      difference = sourceDifference(
        session.model.body,
        splitCanonicalContent(current.content).body,
      );
    let operation: SourceOperation | undefined;
    const prefixDifference = sourceDifference(
      splitCanonicalContent(session.base.content).prefix,
      splitCanonicalContent(current.content).prefix,
    );
    let operations: SourceSplice[] = [];
    if (difference.deleteCount || difference.insert) {
      try {
        operations = rawSourceDifferences(
          session.model.body,
          splitCanonicalContent(current.content).body,
        );
      } catch (error) {
        if (!(error instanceof CollaborationError) || error.code !== "diff_limit") throw error;
        // The raw bytes remain authority when bounded alignment cannot prove
        // positional identity. Pause affected origins instead of guessing.
        operations = [{ start:0, deleteCount:session.model.body.length, insert:splitCanonicalContent(current.content).body, ambiguous:true }];
      }
    }
    if (difference.deleteCount > 0 || prefixDifference.deleteCount > 0) {
      session.recovery = {
        code: "external_destructive_replacement",
        baseContentHash: session.base.contentHash,
        externalContentHash: current.contentHash,
        recoveryId:
          "raw-" +
          createHash("sha256")
            .update(session.base.contentHash)
            .update(current.contentHash)
            .digest("hex"),
        directory: await this.preserveDestructiveExternal(
          session,
          current.content,
        ),
      };
    }
    if (difference.deleteCount || difference.insert) {
      operation = next.applyBatch({
        actor: "external",
        operationId: randomUUID(),
        epoch: next.epoch,
        baseRevision: next.revision,
        operations,
      }).operation;
      this.capHistory(next, session);
    }
    // Metadata advances read revisions while preserving source anchors and
    // agent streams. Valid identity and a stable canonical boundary were checked.
    const metadataChanged =
      splitCanonicalContent(session.base.content).prefix !==
      splitCanonicalContent(current.content).prefix;
    if (metadataChanged) {
      const checkpoint = next.checkpoint("external", randomUUID()).operation;
      if (!operation) operation = checkpoint;
    }
    this.capHistory(next, session);
    session.base = current;
    session.model = next;
    session.candidate = undefined;
    session.fingerprint = fingerprint;
    this.emit(session, operation);
    try {
      await markRemoteIndexStale(this.root);
      this.options.onWrite?.();
    } catch {
      /* Observed canonical bytes remain authoritative when derived maintenance fails. */
    }
  }
  async observe() {
    if (this.observing || this.closed) return;
    this.observing = true;
    try {
      await this.serialize(async () => {
        this.prune();
        for (const session of this.sessions.values()) {
          const presenceCount = session.presence.size;
          this.projectPresence(session);
          if (presenceCount !== session.presence.size) this.emit(session);
          this.expireStreams(session);
          if (
            session.listeners.size ||
            Date.now() - session.accessedAt < 60_000
          ) {
            try {
              await this.refresh(session);
            } catch {
              session.conflict = "source_unavailable";
              try {
                await this.preserve(
                  session,
                  session.conflict,
                  session.candidate?.content,
                );
              } catch {
                /* Keep the live draft even when private recovery storage is unavailable. */
              }
              this.emit(session);
            }
          }
        }
      });
    } finally {
      this.observing = false;
    }
  }
  async beforeLegacyWrite(documentId: string, ifMatch?: string) {
    const session = this.sessions.get(documentId);
    if (!session) return;
    if (session.busy)
      fail(
        "live_edits_pending",
        "A live publication is in flight. Retain the proposal.",
      );
    // The HTTP/CLI host already holds its canonical write queue here. Settle
    // directly instead of recursively joining this hub's serialized queue.
    await this.settleOpen(session);
    if (session.conflict) fail("source_conflict");
    if (ifMatch && session.base.contentHash !== ifMatch)
      fail("precondition_failed");
  }
  async notifyCanonicalWrite(documentId?: string) {
    for (const session of this.sessions.values())
      if (!documentId || session.documentId === documentId) {
        session.fingerprint = undefined;
        await this.refresh(session, true, true);
      }
  }
  resourceUsage() {
    return {
      sessions: this.sessions.size,
      historyBytes: [...this.sessions.values()].reduce(
        (sum, session) => sum + session.model.retainedBytes,
        0,
      ),
      streams: [...this.sessions.values()].reduce(
        (sum, session) => sum + session.model.streams.size,
        0,
      ),
      presence: [...this.sessions.values()].reduce(
        (sum, session) => sum + session.presence.size,
        0,
      ),
      subscriptions: [...this.sessions.values()].reduce(
        (sum, session) => sum + session.listeners.size,
        0,
      ),
      undoOwners: [...this.sessions.values()].reduce((sum,session) => sum+new Set([...session.model.undoStacks.keys(),...session.model.redoStacks.keys()]).size,0),
      activeUndoOwners: [...this.sessions.values()].reduce((sum,session) => {const owners = new Set([...session.model.undoStacks.keys(),...session.model.redoStacks.keys()]);return sum+[...this.activeUndoActors(session)].filter(actor=>owners.has(actor)).length;},0),
    };
  }
  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.queue;
    this.sessions.clear();
  }
}
export function createCollaborationHub(options: CollaborationHubOptions) {
  return new CollaborationHub(options);
}
