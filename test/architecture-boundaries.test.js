import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const srcRoot = path.join(repoRoot, "src");

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
  }));
  return files.flat();
}

async function importsIn(relativeDir) {
  const dir = path.join(srcRoot, relativeDir);
  const files = await sourceFiles(dir);
  const imports = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) {
      imports.push({ file: path.relative(repoRoot, file), specifier: match[1] });
    }
  }
  return imports;
}

test("architecture import boundaries stay explicit", async () => {
  const writingImports = await importsIn("writing");
  assert.deepEqual(
    writingImports.filter((item) => item.specifier.includes("retrieval")),
    [],
    "writing modules must not import retrieval/QMD modules",
  );

  const retrievalImports = await importsIn("retrieval");
  assert.deepEqual(
    retrievalImports.filter((item) => item.specifier.includes("writing")),
    [],
    "retrieval modules must not import writing modules",
  );

  const canonicalImports = await importsIn("canonical");
  assert.deepEqual(
    canonicalImports.filter((item) => item.specifier.includes("retrieval") || item.specifier.includes("writing") || item.specifier.includes("qmd")),
    [],
    "canonical modules must stay backend- and writer-agnostic",
  );
});
