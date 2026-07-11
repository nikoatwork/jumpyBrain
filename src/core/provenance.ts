import type { Frontmatter, Provenance } from "../types.js";

export function sessionIdFromMetadata(metadata: Frontmatter): string | undefined {
  const value = metadata.session_id ?? metadata.sessionId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function withSessionAliases(provenance: Provenance): Provenance {
  const sessionId = provenance.sessionId ?? provenance.session_id ?? sessionIdFromMetadata(provenance.metadata ?? {});
  return { ...provenance, sessionId, session_id: sessionId };
}
