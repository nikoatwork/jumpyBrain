import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
