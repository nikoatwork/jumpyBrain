#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const roots = ["src", "test", "scripts"].map((dir) => path.join(repoRoot, dir));
const sourceExtensions = new Set([".ts", ".js", ".mjs"]);
const ignoredDirs = new Set(["node_modules", "dist", ".git", ".jumpybrain", ".local-pack"]);

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    if (ignoredDirs.has(entry.name)) return [];
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(absolute);
    return entry.isFile() && sourceExtensions.has(path.extname(entry.name)) ? [absolute] : [];
  }));
  return files.flat();
}

function repoRelative(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function exportedSymbols(text) {
  const names = new Set();
  for (const match of text.matchAll(/^export\s+(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z0-9_]+)/gm)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/^export\s+\{([^}]+)\}/gm)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/i).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names.size;
}

function formatTable(rows, columns) {
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => String(row[column]).length)));
  const header = columns.map((column, index) => column.padEnd(widths[index])).join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) => columns.map((column, index) => String(row[column]).padEnd(widths[index])).join("  ")).join("\n");
  return [header, separator, body].filter(Boolean).join("\n");
}

const files = (await Promise.all(roots.map(filesUnder))).flat();
const stats = await Promise.all(files.map(async (file) => {
  const text = await readFile(file, "utf8");
  const lines = text.split(/\r?\n/).length;
  return {
    file: repoRelative(file),
    lines,
    exports: exportedSymbols(text),
  };
}));

const largest = [...stats].sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file)).slice(0, 12);
const mostExports = [...stats].filter((row) => row.exports > 0).sort((a, b) => b.exports - a.exports || a.file.localeCompare(b.file)).slice(0, 12);

console.log("# jumpyBrain advisory code-quality report");
console.log("");
console.log("This report is informational: it highlights size/export hotspots for refactor review and does not fail validation.");
console.log("");
console.log("## Largest source/test/script files");
console.log("");
console.log(formatTable(largest, ["file", "lines", "exports"]));
console.log("");
console.log("## Files with the most exported symbols");
console.log("");
console.log(formatTable(mostExports, ["file", "exports", "lines"]));
