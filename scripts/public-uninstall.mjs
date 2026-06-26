#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const INSTALLER_NAME = "jumpybrain-installer";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const home = path.resolve(options.home ?? process.env.HOME ?? os.homedir());
  const installRoot = path.resolve(expandHome(options.installRoot ?? path.join(home, ".jumpybrain"), home));
  const manifestPath = path.join(installRoot, "install-manifest.json");
  const manifest = await readManifest(manifestPath, installRoot);
  const removed = [];
  const missing = [];
  const preserved = [];
  const deletedMemory = [];

  for (const file of manifest.files ?? []) {
    if (await removePath(file, { dryRun: options.dryRun })) removed.push(file);
    else missing.push(file);
  }

  for (const dir of [manifest.appDir, manifest.binDir]) {
    if (dir && isInside(dir, installRoot) && await removePath(dir, { recursive: true, dryRun: options.dryRun })) removed.push(dir);
  }

  if (options.deleteMemory) {
    if (await deleteMemoryRoot(manifest.memoryRoot, { dryRun: options.dryRun })) deletedMemory.push(manifest.memoryRoot);
  } else if (manifest.memoryRoot) {
    preserved.push(manifest.memoryRoot);
  }

  if (await removePath(manifestPath, { dryRun: options.dryRun })) removed.push(manifestPath);

  console.log("jumpyBrain uninstall complete.");
  if (removed.length > 0) {
    console.log("Removed:");
    for (const item of removed) console.log(`- ${item}`);
  }
  if (missing.length > 0) {
    console.log("Already absent:");
    for (const item of missing) console.log(`- ${item}`);
  }
  if (preserved.length > 0) {
    console.log("Memory preserved:");
    for (const item of preserved) console.log(`- ${item}`);
    console.log("Pass --delete-memory to remove configured jumpyBrain memory roots too.");
  }
  if (deletedMemory.length > 0) {
    console.log("Memory deleted:");
    for (const item of deletedMemory) console.log(`- ${item}`);
  }
}

function parseArgs(argv) {
  const options = { deleteMemory: false, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--delete-memory") options.deleteMemory = true;
    else if (token === "--dry-run") options.dryRun = true;
    else if (token === "--install-root") options.installRoot = requiredValue(argv, ++index, token);
    else if (token === "--home") options.home = requiredValue(argv, ++index, token);
    else throw new Error(`Unknown option ${token}.\n\n${usage()}`);
  }
  return options;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function usage() {
  return [
    "Usage: uninstall.sh [options]",
    "",
    "Options:",
    "  --install-root <path>  Install root to remove (default: ~/.jumpybrain)",
    "  --delete-memory        Also delete the configured jumpyBrain memory root",
    "  --dry-run              Print planned removals without deleting files",
  ].join("\n");
}

async function readManifest(manifestPath, installRoot) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.installer !== INSTALLER_NAME) throw new Error(`${manifestPath} is not a jumpyBrain installer manifest.`);
    return manifest;
  } catch (error) {
    const fileError = error;
    if (fileError?.code !== "ENOENT") throw error;
    return {
      installer: INSTALLER_NAME,
      installRoot,
      appDir: path.join(installRoot, "app"),
      binDir: path.join(installRoot, "bin"),
      memoryRoot: path.join(installRoot, "memory"),
      files: [path.join(installRoot, "bin", "jumpybrain")],
    };
  }
}

async function removePath(target, options = {}) {
  if (!target || !existsSync(target)) return false;
  if (!options.dryRun) await rm(target, { recursive: Boolean(options.recursive), force: true });
  return true;
}

async function deleteMemoryRoot(memoryRoot, options = {}) {
  if (!memoryRoot || !existsSync(memoryRoot)) return false;
  const resolved = path.resolve(memoryRoot);
  if (isBroadPath(resolved)) throw new Error(`Refusing to delete broad path: ${resolved}`);
  const configPath = path.join(resolved, "jumpybrain.json");
  if (!existsSync(configPath)) throw new Error(`Refusing to delete ${resolved}: no jumpybrain.json found.`);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (config?.canonical !== "markdown" || !Array.isArray(config?.memoryDirs)) throw new Error(`Refusing to delete ${resolved}: jumpybrain.json does not look like a jumpyBrain memory root.`);
  if (!options.dryRun) await rm(resolved, { recursive: true, force: true });
  return true;
}

function isBroadPath(target) {
  const parsed = path.parse(target);
  return target === parsed.root || target === os.homedir() || target === process.cwd() || target.split(path.sep).filter(Boolean).length < 2;
}

function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function expandHome(value, home) {
  return value === "~" || value.startsWith("~/") ? path.join(home, value.slice(2)) : value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
