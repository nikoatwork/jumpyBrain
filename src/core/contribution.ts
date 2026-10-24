import { createHash } from "node:crypto";
import { parseFrontmatter } from "./frontmatter.js";
import type { Frontmatter, MemoryActor } from "../types.js";

export const ATTRIBUTION_KEYS = ["creator_kind", "creator_id", "creator_name", "last_editor_kind", "last_editor_id", "last_editor_name", "last_editor_hash"] as const;

/** Declared provenance, never authentication or a permission. Omission means unknown. */
export function normalizeMemoryActor(value: unknown): MemoryActor | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidActor();
  const actor = value as Record<string, unknown>;
  if (Object.keys(actor).some(key => !["kind", "id", "name"].includes(key)) || (typeof actor.kind !== "string" || !["human", "agent"].includes(actor.kind))) return invalidActor();
  for (const key of ["id", "name"]) {
    if (actor[key] !== undefined && (typeof actor[key] !== "string" || !(actor[key] as string).trim() || (actor[key] as string).length > 120 || /[\u0000-\u001f\u007f]/u.test(actor[key] as string))) return invalidActor();
  }
  return { kind: actor.kind as MemoryActor["kind"], ...(actor.id ? { id: actor.id as string } : {}), ...(actor.name ? { name: actor.name as string } : {}) };
}
function invalidActor(): never { throw Object.assign(new Error("actor requires kind human or agent and optional short id/name strings."), { code: "invalid_actor" }); }

/** Semantic frontmatter plus body; attention-only publication does not change authorship. */
export function attributionHash(content: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const metadata = Object.entries(frontmatter).filter(([key]) => key !== "attention_at" && !(ATTRIBUTION_KEYS as readonly string[]).includes(key)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return "sha256:" + createHash("sha256").update(JSON.stringify([metadata, body])).digest("hex");
}

export function currentMemoryEditor(content: string): MemoryActor | undefined {
  const { frontmatter: metadata } = parseFrontmatter(content);
  if (metadata.last_editor_hash !== attributionHash(content)) return undefined;
  try { return normalizeMemoryActor({ kind: metadata.last_editor_kind, ...(metadata.last_editor_id ? { id: metadata.last_editor_id } : {}), ...(metadata.last_editor_name ? { name: metadata.last_editor_name } : {}) }); }
  catch { return undefined; }
}

/** Called only by supported writers. Preserve declared creator, replace last editor. */
export function stampMemoryActor(content: string, input?: MemoryActor, creation = false): string {
  const actor = normalizeMemoryActor(input);
  const parsed = parseFrontmatter(content);
  if (parsed.bodyStartLine === 1) throw new Error("Attribution requires canonical frontmatter.");
  const lines = content.split(/\r?\n/);
  const header = lines.slice(1, parsed.bodyStartLine - 2).filter(line => !/^last_editor_(?:kind|id|name|hash):/.test(line) && !(creation && /^creator_(?:kind|id|name):/.test(line)));
  const fields: Frontmatter = {};
  if (actor) {
    for (const prefix of creation ? ["creator", "last_editor"] : ["last_editor"]) {
      fields[prefix + "_kind"] = actor.kind;
      if (actor.id) fields[prefix + "_id"] = actor.id;
      if (actor.name) fields[prefix + "_name"] = actor.name;
    }
    fields.last_editor_hash = attributionHash(content);
  }
  return ["---", ...header, ...Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`), "---", ...lines.slice(parsed.bodyStartLine - 1)].join(parsed.lineEnding);
}
