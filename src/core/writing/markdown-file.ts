import { normalizedDocumentTitle } from "../document-title.js";

export type FrontmatterField = [key: string, value: unknown];

export function renderMarkdownDocument(frontmatter: FrontmatterField[], body: string): string {
  const lines = [
    "---",
    ...frontmatter
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    "",
    body.trimEnd(),
    "",
  ];
  return lines.join("\n");
}

/**
 * Body of a newly created note under its writer-supplied heading. When the
 * authored body already opens with an ATX H1 of the same text (exact-title
 * normalization, collapsed whitespace, optional closing `#`s), it is kept as
 * authored instead of being repeated. A different leading heading stays below
 * the writer heading. Creation-only; never applied to existing files.
 */
export function bodyWithTitleHeading(heading: string, body: string): string {
  const authored = leadingH1Text(body.trim());
  if (authored !== undefined && sameHeadingText(authored, heading)) return body.trim();
  return [`# ${heading}`, "", body].join("\n");
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
