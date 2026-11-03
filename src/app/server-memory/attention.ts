import { listMemoryAttention, patchMemoryDocumentAttention } from "../attention.js";
import type { MemoryAttentionPacket, MemoryAttentionNote } from "../attention.js";
import { markRemoteIndexStale } from "./state.js";
export { createSettledRevisionReader } from "../attention.js";
export type RemoteMemoryAttentionNote = MemoryAttentionNote;
export interface RemoteMemoryAttentionPacket extends MemoryAttentionPacket {
  memory: "all"; target: "remote"; root: "remote:all";
}

export async function attentionServerMemory(options: { root: string; now?: number }): Promise<RemoteMemoryAttentionPacket> {
  return { ...await listMemoryAttention(options.root, options), memory: "all", target: "remote", root: "remote:all" };
}
export async function patchServerMemoryAttention(options: { root: string; id: string; ifMatch: string; mutation: unknown; now?: number }) {
  const packet = await patchMemoryDocumentAttention(options.root, options.id, options);
  let index;
  try { index = await markRemoteIndexStale(options.root); } catch { index = { stale: true, indexed: false }; }
  return { ...packet, memory: "all" as const, target: "remote" as const, root: "remote:all" as const, index };
}
