import type { CollaborationSnapshot } from "./collaboration-client.js";

export interface GenerationNotice { kind: "active" | "finished" | "stopped" | "interrupted"; text: string; }

/** Observe one note/connection scope. Presence loss is never completion evidence. */
export function createGenerationFeedback() {
  let epoch = "";
  const active = new Map<string, number>(), retired = new Set<string>();
  const bound = (entries: Set<string>) => { while (entries.size > 64) entries.delete(entries.values().next().value!); };
  function reset() { epoch = ""; active.clear(); retired.clear(); }
  function observe(snapshot: Pick<CollaborationSnapshot, "epoch" | "saved" | "stream">): GenerationNotice | null {
    if (snapshot.epoch !== epoch) { reset(); epoch = snapshot.epoch; }
    const stream = snapshot.stream;
    if (!snapshot.saved || !stream || typeof stream.actor !== "string" || !stream.actor || stream.actor.length > 1024 || typeof stream.streamId !== "string" || !stream.streamId || stream.streamId.length > 1024 || !Number.isSafeInteger(stream.sequence) || stream.sequence < 0) return null;
    const key = JSON.stringify([stream.actor, stream.streamId]);
    if (retired.has(key)) return null;
    if (stream.state === "active") {
      const previous = active.get(key);
      active.set(key, Math.max(previous ?? 0, stream.sequence));
      if (previous !== undefined) return null;
      while (active.size > 64) active.delete(active.keys().next().value!);
      return { kind: "active", text: "" };
    }
    if (!["finished", "cancelled"].includes(stream.state) || !active.has(key) || stream.sequence < active.get(key)!) return null;
    active.delete(key); retired.add(key); bound(retired);
    if (stream.state === "finished") return { kind: "finished", text: "Generation finished" };
    return stream.reason === "cancelled"
      ? { kind: "stopped", text: "Generation stopped" }
      : { kind: "interrupted", text: "Generation interrupted" };
  }
  return { observe, reset };
}
