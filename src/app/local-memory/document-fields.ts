import { loadManifest } from "../../adapters/qmd/index.js";
import type { Frontmatter } from "../../types.js";

/**
 * Shared frontmatter/bucket field extraction helpers used by overview and graph
 * assembly so neither module redefines its own copy.
 */

export async function tryLoadManifest(root: string) {
  try {
    return await loadManifest(root);
  } catch {
    return undefined;
  }
}

export function bucketFor(relativePath: string): string {
  return relativePath.split("/")[0] || ".";
}

export function tagsValue(frontmatter: Frontmatter): string[] {
  const tags = frontmatter.tags;
  if (Array.isArray(tags)) return tags.map(String).map((tag) => tag.trim()).filter(Boolean).sort();
  if (typeof tags === "string") return tags.split(",").map((tag) => tag.trim()).filter(Boolean).sort();
  return [];
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const string = typeof value === "string" ? value.trim() : "";
    if (string) return string;
  }
  return undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
