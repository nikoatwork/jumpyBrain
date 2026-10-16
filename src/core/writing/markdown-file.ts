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

export function slug(value: string, fallback: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}
