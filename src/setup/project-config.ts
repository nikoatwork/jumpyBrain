import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { packageVersion } from "../package-info.js";
import type { MemoryRootConfig, MemoryRootInitResult, MemoryRootStatus } from "../types.js";

export const CURRENT_MEMORY_SCHEMA_VERSION = 1;
export const MEMORY_CONFIG_FILE = "jumpybrain.json";
export const DERIVED_DIR = ".jumpybrain";
export const DEFAULT_MEMORY_DIRS = ["notes", "sessions", "findings", "decisions", "preferences", "pages"] as const;

interface LoadedConfig {
  config: MemoryRootConfig;
  configFile: string;
}

export async function initializeMemoryRoot(rootArg: string, options: { force?: boolean } = {}): Promise<MemoryRootInitResult> {
  if (!rootArg || typeof rootArg !== "string") throw new Error("--root is required.");

  const requestedRoot = path.resolve(rootArg);
  await mkdir(requestedRoot, { recursive: true });
  const root = await realpath(requestedRoot);

  for (const dir of DEFAULT_MEMORY_DIRS) {
    await mkdir(path.join(root, dir), { recursive: true });
  }

  const existing = options.force ? undefined : await readConfigIfPresent(root);
  const configFile = path.join(root, MEMORY_CONFIG_FILE);
  let config = existing?.config;
  let configCreated = false;

  if (!config || options.force) {
    config = await defaultConfig();
    await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    configCreated = true;
  }

  const gitignoreUpdated = await ensureDerivedDirIgnored(root);
  const status = compatibilityStatus(root, config);
  if (!status.compatible) throw new Error(status.message ?? "Memory root is not compatible with this jumpyBrain CLI.");

  return {
    root,
    configFile: MEMORY_CONFIG_FILE,
    schemaVersion: config.schemaVersion,
    configCreated,
    memoryDirs: [...DEFAULT_MEMORY_DIRS],
    gitignoreUpdated,
  };
}

export async function memoryRootStatus(rootArg: string): Promise<MemoryRootStatus> {
  if (!rootArg || typeof rootArg !== "string") throw new Error("--root is required.");

  const root = await realpath(path.resolve(rootArg));
  const loaded = await readConfigIfPresent(root);
  if (!loaded) {
    return {
      root,
      initialized: false,
      compatible: true,
      message: `No ${MEMORY_CONFIG_FILE} found. This is allowed for legacy/manual roots; run jumpybrain init --root ${JSON.stringify(root)} to pin setup metadata.`,
    };
  }

  return compatibilityStatus(root, loaded.config, loaded.configFile);
}

export async function assertCompatibleMemoryRoot(root: string): Promise<void> {
  const loaded = await readConfigIfPresent(root);
  if (!loaded) return;

  const status = compatibilityStatus(root, loaded.config, loaded.configFile);
  if (!status.compatible) throw new Error(status.message ?? "Memory root is not compatible with this jumpyBrain CLI.");
}

export async function resolveIndexRoot(memoryRoot: string): Promise<string> {
  const loaded = await readConfigIfPresent(memoryRoot);
  const configured = loaded?.config.indexRoot;
  if (!configured) return memoryRoot;

  if (typeof configured !== "string") throw new Error(`${MEMORY_CONFIG_FILE} indexRoot must be a string when provided.`);
  const resolved = path.resolve(memoryRoot, configured);
  return realpath(resolved);
}

export async function findMemoryRoot(startArg?: string): Promise<string> {
  const start = path.resolve(startArg ?? process.cwd());
  let dir = await realpath(start);

  while (true) {
    if (existsSync(path.join(dir, MEMORY_CONFIG_FILE))) return dir;
    const childMemory = path.join(dir, "memory");
    if (existsSync(path.join(childMemory, MEMORY_CONFIG_FILE))) return await realpath(childMemory);

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(`Could not find a jumpyBrain memory root from ${JSON.stringify(start)}. Run jumpybrain init --root memory or pass --root <memory-root>.`);
}

async function defaultConfig(): Promise<MemoryRootConfig> {
  return {
    schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION,
    canonical: "markdown",
    derivedDir: DERIVED_DIR,
    memoryDirs: [...DEFAULT_MEMORY_DIRS],
    createdAt: new Date().toISOString(),
    createdBy: {
      package: "jumpybrain",
      version: await packageVersion(),
    },
  };
}

async function readConfigIfPresent(root: string): Promise<LoadedConfig | undefined> {
  const configFile = path.join(root, MEMORY_CONFIG_FILE);
  try {
    const raw = await readFile(configFile, "utf8");
    const parsed = JSON.parse(raw) as MemoryRootConfig;
    return { config: parsed, configFile: MEMORY_CONFIG_FILE };
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") return undefined;
    throw new Error(`Failed to read ${configFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function compatibilityStatus(root: string, config: MemoryRootConfig, configFile = MEMORY_CONFIG_FILE): MemoryRootStatus {
  const schemaVersion = Number(config.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return {
      root,
      configFile,
      initialized: true,
      schemaVersion: config.schemaVersion,
      compatible: false,
      message: `${configFile} has invalid schemaVersion ${JSON.stringify(config.schemaVersion)}.`,
    };
  }

  if (schemaVersion > CURRENT_MEMORY_SCHEMA_VERSION) {
    return {
      root,
      configFile,
      initialized: true,
      schemaVersion: config.schemaVersion,
      compatible: false,
      message: `${configFile} uses memory schema v${schemaVersion}, but this jumpyBrain CLI only supports up to v${CURRENT_MEMORY_SCHEMA_VERSION}. Update the CLI before writing or indexing this memory root.`,
    };
  }

  return {
    root,
    configFile,
    initialized: true,
    schemaVersion: config.schemaVersion,
    compatible: true,
    message: `Memory root is compatible with schema v${schemaVersion}.`,
  };
}

async function ensureDerivedDirIgnored(root: string): Promise<boolean> {
  const gitignore = path.join(root, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignore, "utf8");
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code !== "ENOENT") throw error;
  }

  const alreadyIgnored = existing.split(/\r?\n/).some((line) => line.trim() === DERIVED_DIR || line.trim() === `${DERIVED_DIR}/`);
  if (alreadyIgnored) return false;

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  const addition = `${prefix}# jumpyBrain derived state\n${DERIVED_DIR}/\n`;
  await writeFile(gitignore, `${existing}${addition}`, "utf8");
  return true;
}

