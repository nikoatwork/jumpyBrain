#!/usr/bin/env node
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetArg = process.argv[2];

if (!targetArg) {
  console.error("Usage: npm run cli:install:local -- <target-repo>");
  process.exit(1);
}

const targetRepo = await realpath(path.resolve(targetArg));
const latest = JSON.parse(await readFile(path.join(repoRoot, ".local-pack", "latest.json"), "utf8"));

const result = spawnSync("npm", ["install", "-D", latest.tarballPath], {
  cwd: targetRepo,
  encoding: "utf8",
  stdio: "inherit",
});

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Installed ${latest.name}@${latest.version} into ${targetRepo}`);
console.log("Verify with: npx jumpybrain --version");
