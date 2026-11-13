import { normalizedDocumentTitle } from "../document-title.js";

export type FrontmatterField = [key: string, value: unknown];

export function renderMarkdownDocument(frontmatter: FrontmatterField[], body: string): string {
  const content = body.trimEnd();
  const lines = [
    "---",
    ...frontmatter
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    // A blank body (blank quick notes, reference pages) ends at the closing fence.
    ...(content ? ["", content] : []),
    "",
  ];
  return lines.join("\n");
}

/**
 * Body of a newly created note. The frontmatter `title` is canonical and the
 * editor shows it as the page heading, so writers never add a `# <title>` H1.
 * When the trimmed authored body opens with an ATX H1 whose text equals the
 * title (exact-title normalization, collapsed whitespace, optional closing
 * `#`s), that line and the blank lines after it are dropped and the rest is
 * kept verbatim. Any other body (a different H1, `##`, setext, prose) is
 * returned unchanged. Creation-only; never applied to existing files.
 */
export function bodyWithoutTitleHeading(title: string, body: string): string {
  const trimmed = body.trim();
  if (!opensWithTitleHeading(title, trimmed)) return body;
  const lineEnd = trimmed.search(/\r?\n/);
  if (lineEnd < 0) return "";
  return trimmed.slice(lineEnd).replace(/^\r?\n/, "").replace(/^(?:[ \t]*\r?\n)+/, "");
}

/** True when the trimmed body's first line is an ATX H1 repeating `title`. */
export function opensWithTitleHeading(title: string, body: string): boolean {
  const authored = leadingH1Text(body.trim());
  return authored !== undefined && sameHeadingText(authored, title);
}

function leadingH1Text(body: string): string | undefined {
  const match = (body.split(/\r?\n/, 1)[0] ?? "").match(/^#(?:[ \t]+(.*))?$/);
  if (!match) return undefined;
  return (match[1] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim();
}

function sameHeadingText(left: string, right: string): boolean {
  const normalize = (value: string) => normalizedDocumentTitle(value).replace(/\s+/g, " ");
  const normalized = normalize(left);
  return normalized !== "" && normalized === normalize(right);
}

export function slug(value: string, fallback: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}
