#!/usr/bin/env node
import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { requiredLocalPackFiles } from "./local-pack-manifest.mjs";

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

const packageRoot = path.join(targetRepo, "node_modules", ...latest.name.split("/"));
const requiredInstalledFiles = requiredLocalPackFiles.map((file) => path.join(packageRoot, file.replace(/^package\//, "")));
const binName = process.platform === "win32" ? "jumpybrain.cmd" : "jumpybrain";
const binPath = path.join(targetRepo, "node_modules", ".bin", binName);

try {
  await Promise.all([...requiredInstalledFiles, binPath].map((file) => access(file)));
} catch (error) {
  console.error(`Installed package is missing expected CLI/runtime files: ${error.message}`);
  process.exit(1);
}

console.log(`Installed ${latest.name}@${latest.version} into ${targetRepo}`);
console.log("Verified installed jumpybrain bin and runtime files.");
console.log("Verify with: npx jumpybrain --version");
