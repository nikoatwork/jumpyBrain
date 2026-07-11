#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const INSTALLER_NAME = "jumpybrain-installer";
const MANIFEST_VERSION = 1;

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const home = path.resolve(options.home ?? process.env.HOME ?? os.homedir());
  const installRoot = path.resolve(expandHome(options.installRoot ?? path.join(home, ".jumpybrain"), home));
  const manifestPath = path.join(installRoot, "install-manifest.json");
  const manifest = await readManifest(manifestPath, { installRoot, home });
  if (options.deleteMemory && existsSync(manifest.memoryRoot)) await assertMemoryRootDeletable(manifest.memoryRoot);
  const removed = [];
  const missing = [];
  const preserved = [];
  const deletedMemory = [];

  if (manifest.cliConfigPath) {
    if (await removePath(manifest.cliConfigPath, { dryRun: options.dryRun })) removed.push(manifest.cliConfigPath);
    else missing.push(manifest.cliConfigPath);
  }

  for (const file of manifest.files ?? []) {
    if (await removePath(file, { dryRun: options.dryRun })) removed.push(file);
    else missing.push(file);
  }

  for (const dir of [manifest.appDir, manifest.binDir]) {
    if (await removePath(dir, { recursive: true, dryRun: options.dryRun })) removed.push(dir);
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

async function readManifest(manifestPath, { installRoot, home }) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    const fileError = error;
    if (fileError?.code === "ENOENT") throw new Error(`Refusing to uninstall: no ${manifestPath} exists to prove ownership.`);
    throw new Error(`Refusing to uninstall: ${manifestPath} is not valid JSON.`, { cause: error });
  }

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.installer !== INSTALLER_NAME) {
    throw new Error(`Refusing to uninstall: ${manifestPath} is not a ${INSTALLER_NAME} manifest.`);
  }
  if (manifest.version !== MANIFEST_VERSION) {
    throw new Error(`Refusing to uninstall: manifest version ${JSON.stringify(manifest.version)} is unsupported.`);
  }

  const expected = {
    installRoot,
    appDir: path.join(installRoot, "app"),
    binDir: path.join(installRoot, "bin"),
    cliPath: path.join(installRoot, "bin", process.platform === "win32" ? "jumpybrain.cmd" : "jumpybrain"),
    cliConfigPath: path.join(installRoot, "cli-config.json"),
  };
  for (const key of Object.keys(expected)) {
    if (typeof manifest[key] !== "string" || path.resolve(manifest[key]) !== expected[key]) {
      throw new Error(`Refusing to uninstall: manifest ${key} does not match ${expected[key]}.`);
    }
  }
  if (!isInside(manifest.appDir, installRoot) || !isInside(manifest.binDir, installRoot) || !isInside(manifest.cliConfigPath, installRoot)) {
    throw new Error("Refusing to uninstall: installer-owned app, bin, and CLI config paths must stay inside the selected install root.");
  }
  if (typeof manifest.memoryRoot !== "string" || !path.isAbsolute(manifest.memoryRoot)) {
    throw new Error("Refusing to uninstall: manifest memoryRoot must be an absolute path.");
  }
  if (!Array.isArray(manifest.integrations) || !Array.isArray(manifest.files)) {
    throw new Error("Refusing to uninstall: manifest integrations and files must be arrays.");
  }

  const integrationPaths = new Set();
  for (const integration of manifest.integrations) {
    if (!isValidIntegration(integration, home)) {
      throw new Error("Refusing to uninstall: manifest contains an invalid integration path.");
    }
    integrationPaths.add(path.resolve(integration.path));
  }
  const allowedFiles = new Set([expected.cliPath, ...integrationPaths]);
  const resolvedFiles = manifest.files.map((file) => {
    if (typeof file !== "string" || !path.isAbsolute(file)) {
      throw new Error("Refusing to uninstall: every manifest file must be an absolute path.");
    }
    return path.resolve(file);
  });
  if (resolvedFiles.some((file) => !allowedFiles.has(file))) {
    throw new Error("Refusing to uninstall: manifest files may contain only the recorded CLI and integration paths.");
  }
  if (!resolvedFiles.includes(expected.cliPath) || [...integrationPaths].some((file) => !resolvedFiles.includes(file))) {
    throw new Error("Refusing to uninstall: manifest files are inconsistent with the recorded CLI or integrations.");
  }

  return { ...manifest, files: resolvedFiles };
}

function isValidIntegration(integration, home) {
  if (!integration || typeof integration !== "object" || Array.isArray(integration) || typeof integration.path !== "string" || !path.isAbsolute(integration.path)) return false;
  const suffixes = {
    codex: path.join(".agents", "skills", "jumpybrain-memory", "SKILL.md"),
    claude: path.join(".claude", "skills", "jumpybrain-memory", "SKILL.md"),
    pi: path.join(".pi", "agent", "extensions", "jumpybrain-memory.ts"),
  };
  const suffix = suffixes[integration.kind];
  if (!suffix) return false;
  const resolved = path.resolve(integration.path);
  if (resolved === path.join(home, suffix)) return true;
  if (integration.kind === "pi" && resolved.endsWith(path.join(".pi", "extensions", "jumpybrain-memory.ts"))) return true;
  return resolved.endsWith(suffix);
}

async function removePath(target, options = {}) {
  if (!target || !existsSync(target)) return false;
  if (!options.dryRun) await rm(target, { recursive: Boolean(options.recursive), force: true });
  return true;
}

async function deleteMemoryRoot(memoryRoot, options = {}) {
  if (!memoryRoot || !existsSync(memoryRoot)) return false;
  const resolved = await assertMemoryRootDeletable(memoryRoot);
  if (!options.dryRun) await rm(resolved, { recursive: true, force: true });
  return true;
}

async function assertMemoryRootDeletable(memoryRoot) {
  const resolved = path.resolve(memoryRoot);
  if (isBroadPath(resolved)) throw new Error(`Refusing to delete broad path: ${resolved}`);
  const configPath = path.join(resolved, "jumpybrain.json");
  if (!existsSync(configPath)) throw new Error(`Refusing to delete ${resolved}: no jumpybrain.json found.`);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (config?.canonical !== "markdown" || !Array.isArray(config?.memoryDirs)) throw new Error(`Refusing to delete ${resolved}: jumpybrain.json does not look like a jumpyBrain memory root.`);
  return resolved;
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
