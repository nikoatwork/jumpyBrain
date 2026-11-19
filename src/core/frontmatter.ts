import type { Frontmatter, FrontmatterValue } from "../types.js";

export interface ParsedFrontmatter {
  frontmatter: Frontmatter;
  body: string;
  bodyStartLine: number;
  lineEnding: string;
}

/**
 * The exact Markdown body after a leading frontmatter block: every byte after
 * the closing `---` line and its line ending. Without frontmatter, the whole
 * content. Unlike `parseFrontmatter().body`, line endings are preserved.
 */
export function exactMarkdownBody(content: string): string {
  const opening = /^[ \t]*---[ \t]*\r?\n/.exec(content);
  if (!opening) return content;
  const closing = /^[ \t]*---[ \t]*(?:\r?\n|$)/m; // same delimiter rule as parseFrontmatter
  let offset = opening[0].length;
  while (offset <= content.length) {
    const match = closing.exec(content.slice(offset));
    if (!match) return content;
    const at = offset + match.index;
    if (at === offset || content[at - 1] === "\n") return content.slice(at + match[0].length);
    offset = at + 1;
  }
  return content;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: content, bodyStartLine: 1, lineEnding };
  }

  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") {
      end = index;
      break;
    }
  }

  if (end === -1) {
    return { frontmatter: {}, body: content, bodyStartLine: 1, lineEnding };
  }

  const frontmatter: Frontmatter = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1]] = parseFrontmatterValue(match[2] ?? "");
  }

  return {
    frontmatter,
    body: lines.slice(end + 1).join("\n"),
    bodyStartLine: end + 2,
    lineEnding,
  };
}

function parseFrontmatterValue(raw: string): FrontmatterValue {
  const value = raw.trim();
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.slice(1, -1).split(",").map((item) => stripQuotes(item.trim())).filter(Boolean);
    }
  }

  return stripQuotes(value);
}

function stripQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch { /* Preserve forgiving handling of legacy non-JSON quoted scalars. */ }
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
