import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { IndexingPolicy, MemoryRootConfig, MemoryRootInitResult, MemoryRootStatus } from "../../types.js";

export const CURRENT_MEMORY_SCHEMA_VERSION = 1;
export const MEMORY_CONFIG_FILE = "jumpybrain.json";
export const DERIVED_DIR = ".jumpybrain";
export const DEFAULT_MEMORY_DIRS = ["notes", "sessions", "findings", "decisions", "preferences", "pages"] as const;

interface LoadedConfig {
  config: MemoryRootConfig;
  configFile: string;
}

export async function initializeMemoryRoot(rootArg: string, options: { force?: boolean; packageVersion?: string } = {}): Promise<MemoryRootInitResult> {
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
    config = defaultConfig(options.packageVersion);
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

/** Persist policy outside disposable state. An existing choice always wins over legacy env. */
export async function indexingPolicy(root: string, requested?: IndexingPolicy, legacy?: IndexingPolicy): Promise<IndexingPolicy> {
  await assertCompatibleMemoryRoot(root);
  const loaded = await readConfigIfPresent(root);
  const policy = requested ?? loaded?.config.indexing ?? legacy ?? { mode: "lexical" };
  validateIndexingPolicy(policy);
  if (requested || !loaded?.config.indexing) {
    const config = { ...(loaded?.config ?? defaultConfig()), indexing: policy };
    const file = path.join(root, MEMORY_CONFIG_FILE);
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await rename(temporary, file);
  }
  return policy;
}

/** Automatic derived-state repair never persists policy or migrates legacy environment choices. */
export async function automaticIndexingPolicy(root: string): Promise<IndexingPolicy> {
  await assertCompatibleMemoryRoot(root);
  return await configuredIndexingPolicy(root) ?? { mode: "lexical" };
}

export async function configuredIndexingPolicy(root: string): Promise<IndexingPolicy | undefined> {
  const policy = (await readConfigIfPresent(root))?.config.indexing;
  if (policy) validateIndexingPolicy(policy);
  return policy;
}

export function indexingPolicyMatches(configured: IndexingPolicy | undefined, indexed: IndexingPolicy | undefined, modelHash?: string): boolean {
  return !configured || (configured.mode === indexed?.mode && configured.model === indexed?.model
    && (!configured.modelHash || configured.modelHash.toLowerCase() === modelHash));
}

function validateIndexingPolicy(policy: IndexingPolicy): void {
  if (policy?.modelHash !== undefined && (typeof policy.modelHash !== "string" || !/^[a-f0-9]{64}$/i.test(policy.modelHash))) throw new Error("Invalid indexing modelHash: expected SHA-256.");
  if (!policy || !["lexical", "semantic"].includes(policy.mode)) throw new Error("Invalid indexing policy: use lexical or semantic.");
  if (policy.mode === "semantic" && (typeof policy.model !== "string" || !path.isAbsolute(policy.model))) {
    throw new Error("Semantic indexing requires a provisioned absolute local GGUF model path; set indexing.model or use index --semantic-model.");
  }
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

function defaultConfig(version = "0.0.0"): MemoryRootConfig {
  return {
    schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION,
    canonical: "markdown",
    derivedDir: DERIVED_DIR,
    memoryDirs: [...DEFAULT_MEMORY_DIRS],
    createdAt: new Date().toISOString(),
    createdBy: {
      package: "jumpybrain",
      version,
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

  if (config.indexing !== undefined) {
    try { validateIndexingPolicy(config.indexing); }
    catch { return { root, configFile, initialized: true, schemaVersion, compatible: false, message: "Invalid indexing policy in jumpybrain.json." }; }
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

