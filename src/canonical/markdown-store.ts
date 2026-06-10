import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { Frontmatter, FrontmatterValue, MarkdownDocument } from "../types.js";

const IGNORED_DIRS = new Set([
  ".git",
  ".jumpybrain",
  ".qmd",
  "node_modules",
  "dist",
  "build",
  "benchdata",
  "bench-results",
  ".bench-tmp",
]);

const IGNORED_FILE_PATTERNS = [/gold/i, /answer_session_ids/i];

export async function resolveMemoryRoot(rootArg: string): Promise<string> {
  if (!rootArg || typeof rootArg !== "string") {
    throw new Error("--root is required.");
  }

  const resolved = path.resolve(rootArg);
  return realpath(resolved);
}

export async function listMarkdownFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(absolute);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".md")) continue;

      const relative = normalizeRelative(root, absolute);
      if (IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(relative))) continue;
      results.push(absolute);
    }
  }

  await walk(root);
  return results;
}

export async function readMarkdownDocument(root: string, absolutePath: string): Promise<MarkdownDocument> {
  const content = await readFile(absolutePath, "utf8");
  const parsed = parseFrontmatter(content);
  return {
    absolutePath,
    relativePath: normalizeRelative(root, absolutePath),
    content,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    bodyStartLine: parsed.bodyStartLine,
  };
}

export async function readMarkdownDocuments(root: string): Promise<MarkdownDocument[]> {
  const files = await listMarkdownFiles(root);
  return Promise.all(files.map((file) => readMarkdownDocument(root, file)));
}

export function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string; bodyStartLine: number } {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: content, bodyStartLine: 1 };
  }

  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") {
      end = index;
      break;
    }
  }

  if (end === -1) {
    return { frontmatter: {}, body: content, bodyStartLine: 1 };
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
  };
}

function parseFrontmatterValue(raw: string): FrontmatterValue {
  const value = raw.trim();
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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function normalizeRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}
