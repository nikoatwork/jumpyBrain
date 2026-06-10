#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [scriptPath, ...scriptArgs] = process.argv.slice(2);

if (!scriptPath) {
  console.error("Usage: node benchmarks/longmemeval/run-script.mjs <script.ts> [...args]");
  process.exit(2);
}

const absoluteScriptPath = path.resolve(scriptPath);
const source = await readFile(absoluteScriptPath, "utf8");
const buildDir = path.resolve(".bench-tmp/longmemeval/modules");
await mkdir(buildDir, { recursive: true });

const moduleName = `${path.basename(scriptPath, ".ts")}-${process.pid}-${Date.now()}.mjs`;
const modulePath = path.join(buildDir, moduleName);
await writeFile(modulePath, source, "utf8");

const moduleUrl = pathToFileURL(modulePath).href;
const mod = await import(moduleUrl);

if (typeof mod.main !== "function") {
  console.error(`${scriptPath} must export async function main(argv)`);
  process.exit(2);
}

try {
  await mod.main(scriptArgs);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
