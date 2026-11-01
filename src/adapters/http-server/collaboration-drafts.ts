import {applySourceSplices,type SourceSplice} from "../../core/collaboration/source.js";
// Recovery records contain source and scope identifiers, never credentials.
export interface CollaborationDraft {
  version: 2; scope: string; principalId: string; documentId: string; clientId: string;
  epoch: string; baseRevision: number; baseBody: string; body: string; updatedAt: number;
  title?: string; baseTitle?: string;
  operations?: SourceSplice[];
  archivedFromClientId?: string;
  unconfirmed?: { operationId: string; submittedBody: string };
}
export interface DraftResult<T> { value: T; error?: string }
const prefix = "jumpybrain.collaboration.draft.v2:";
const keyFor = (record: Pick<CollaborationDraft, "scope" | "principalId" | "documentId" | "clientId">) => prefix + JSON.stringify([record.scope, record.principalId, record.documentId, record.clientId]);
function valid(value: unknown): value is CollaborationDraft {
  if (!value || typeof value !== "object") return false;
  const record = value as CollaborationDraft;
  if(record.operations!==undefined){try{if(!Array.isArray(record.operations)||applySourceSplices(record.baseBody,record.operations)!==record.body)return false}catch{return false}}
  return record.version === 2 && [record.scope, record.principalId, record.documentId, record.clientId, record.epoch, record.baseBody, record.body].every((part) => typeof part === "string") && (record.title === undefined || typeof record.title === "string") && (record.baseTitle === undefined || typeof record.baseTitle === "string") && (record.archivedFromClientId === undefined || typeof record.archivedFromClientId === "string") && Number.isSafeInteger(record.baseRevision) && typeof record.updatedAt === "number" && record.body.length <= 2 * 1024 * 1024 && record.baseBody.length <= 2 * 1024 * 1024;
}
export function createCollaborationDraftStore(storage?: Storage) {
  function getStorage() { return storage ?? globalThis.localStorage; }
  return {
    read(scope: Pick<CollaborationDraft, "scope" | "principalId" | "documentId" | "clientId">): DraftResult<CollaborationDraft | null> {
      try { const raw = getStorage().getItem(keyFor(scope)); if (!raw) return { value: null }; const parsed: unknown = JSON.parse(raw); return valid(parsed) && parsed.scope === scope.scope && parsed.principalId === scope.principalId && parsed.documentId === scope.documentId && parsed.clientId === scope.clientId ? { value: parsed } : { value: null, error: "The saved draft is invalid; its stored bytes have been retained." }; }
      catch { return { value: null, error: "Draft storage is unavailable. Keep this window open to retain unpublished edits." }; }
    },
    save(record: CollaborationDraft): DraftResult<boolean> {
      try { if (!valid(record)) throw new Error("Invalid draft"); getStorage().setItem(keyFor(record), JSON.stringify(record)); return { value: true }; }
      catch { return { value: false, error: "The local draft could not be stored. Keep this window open to retain unpublished edits." }; }
    },
    remove(scope: Pick<CollaborationDraft, "scope" | "principalId" | "documentId" | "clientId">): DraftResult<boolean> {
      try { getStorage().removeItem(keyFor(scope)); return { value: true }; } catch { return { value: false, error: "The saved local draft could not be cleared." }; }
    },
    list(scope: Pick<CollaborationDraft, "scope" | "principalId" | "documentId">): DraftResult<CollaborationDraft[]> {
      try {
        const saved: CollaborationDraft[] = [], current = getStorage();
        for (let index = 0; index < current.length; index++) {
          const key = current.key(index); if (!key?.startsWith(prefix)) continue;
          try { const record: unknown = JSON.parse(current.getItem(key) ?? "null"); if (valid(record) && key === keyFor(record) && record.scope === scope.scope && record.principalId === scope.principalId && record.documentId === scope.documentId) saved.push(record); } catch { /* Preserve invalid records for manual recovery. */ }
        }
        return { value: saved.sort((a, b) => b.updatedAt - a.updatedAt) };
      } catch { return { value: [], error: "Draft storage is unavailable." }; }
    },
  };
}
export type CollaborationDraftStore = ReturnType<typeof createCollaborationDraftStore>;
// Preserve a unique version under a separate key before another recovery
// selection can replace its live page record. The payload is otherwise exact.
export function archiveCollaborationDraft(store: Pick<CollaborationDraftStore, "save">, record: CollaborationDraft): DraftResult<CollaborationDraft | null> {
  const archived = { ...record, clientId: "archive:" + crypto.randomUUID(), archivedFromClientId: record.archivedFromClientId ?? record.clientId };
  const saved = store.save(archived);
  return saved.value ? { value: archived } : { value: null, error: saved.error ?? "The current draft could not be preserved. Copy it before selecting another version." };
}

// One identity per live page/brain. Session storage is cloned by Duplicate Tab
// and window.open, so it cannot identify an actor or own a private draft key.
// A reload offers older records through explicit recovery rather than adopting
// another live tab's unpublished source or undo history.
const pageClientIds = new Map<string, string>();
export function collaborationClientId(scope: string): string {
  let value = pageClientIds.get(scope);
  if (!value) { value = crypto.randomUUID(); pageClientIds.set(scope, value); }
  return value;
}
