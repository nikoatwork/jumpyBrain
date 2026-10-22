import type { Frontmatter } from "../types.js";
import { metadataDate } from "./canonical/metadata-date.js";

export type MemoryAttentionAction = { action: "settle" } | { action: "reactivate" } | { action: "snooze"; until: string };
export interface MemoryAttentionState {
  state: "active" | "snoozed" | "settled";
  attentionAt?: string;
  invalid?: true;
}

export function firstAttentionDate(...values: unknown[]): string | undefined {
  for (const value of values) {
    const date = metadataDate(value);
    if (date) return date;
  }
  return undefined;
}

export function attentionTimestamp(value: unknown): string | undefined {
  return typeof value === "string" && value.includes("T") ? metadataDate(value) : undefined;
}

/** No filesystem recency: explicit overrides survive content edits and index rebuilds. */
export function resolveMemoryAttention(metadata: Frontmatter, now: number): MemoryAttentionState {
  const hasOverride = Object.hasOwn(metadata, "attention_at");
  if (hasOverride && metadata.attention_at === null) return { state: "settled" };
  const override = hasOverride ? attentionTimestamp(metadata.attention_at) : undefined;
  const attentionAt = override ?? firstAttentionDate(metadata.updated_at, metadata.updatedAt, metadata.created_at, metadata.createdAt);
  return {
    state: override && Date.parse(override) > now ? "snoozed" : "active",
    ...(attentionAt ? { attentionAt } : {}),
    ...(hasOverride && !override ? { invalid: true } : {}),
  };
}

export function validateMemoryAttentionAction(value: unknown, now: number): MemoryAttentionAction | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  if (body.action === "settle" || body.action === "reactivate") {
    return Object.keys(body).length === 1 ? { action: body.action } : undefined;
  }
  if (body.action !== "snooze" || Object.keys(body).some(key => key !== "action" && key !== "until")) return undefined;
  const until = attentionTimestamp(body.until);
  if (!until || Date.parse(until) <= now) return undefined;
  return { action: "snooze", until: new Date(until).toISOString() };
}

/** Change only matching header lines; body, other metadata, comments and line endings remain byte-exact. */
export function patchMemoryAttention(content: string, mutation: MemoryAttentionAction): string {
  const lines = content.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? [];
  if (lines[0]?.trim() !== "---") throw new Error("Canonical document has no frontmatter header.");
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) throw new Error("Canonical document has no closed frontmatter header.");
  const newline = lines[0]!.endsWith("\r\n") ? "\r\n" : "\n";
  const header = lines.slice(1, end).filter(line => !/^attention_at:\s*/.test(line));
  if (mutation.action !== "reactivate") {
    header.push(`attention_at: ${mutation.action === "settle" ? "null" : JSON.stringify(mutation.until)}${newline}`);
  }
  return [lines[0], ...header, ...lines.slice(end)].join("");
}
