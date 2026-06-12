import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

export async function writeUniqueMarkdownFile(dir: string, baseName: string, markdown: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const candidates = [
    path.join(dir, `${baseName}.md`),
    ...Array.from({ length: 20 }, (_, index) => path.join(dir, `${baseName}-${Date.now()}-${index + 1}.md`)),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      await writeFile(candidate, markdown, { encoding: "utf8", flag: "wx" });
      return candidate;
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code !== "EEXIST") throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to create unique Markdown file.");
}

export function slug(value: string, fallback: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}
