import { AsyncLocalStorage } from "node:async_hooks";
import { spawnSync } from "node:child_process";
import { runQmdChild } from "./qmd-execution.js";
import { createHash } from "node:crypto";
import { existsSync, realpathSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const QMD_COLLECTION = "jumpybrain";
export const QMD_DREAM_COLLECTION = "jumpybrain-dreams";
export const SUPPORTED_QMD_VERSION = "2.8.3";

export function derivedRoot(root: string): string { return path.join(root, ".jumpybrain"); }
/**
 * Root directory of the rebuildable index state: published manifest, QMD
 * SQLite/cache/config homes, publication lock and diagnostics. Setting
 * JUMPYBRAIN_INDEX_DIR keeps it on a separate local disk instead of inside
 * the memory root. A per-root key makes one directory per memory root, so two
 * roots cannot share one index by accident. All writes still assume the
 * existing supported local-filesystem contract; the destination needs no
 * cross-resource hardlinks or locks because canonical files stay with the root.
 */
export function indexStateRoot(root: string, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JUMPYBRAIN_INDEX_DIR?.trim();
  if (!configured) return derivedRoot(root);
  if (configured.includes("\0")) throw new Error("JUMPYBRAIN_INDEX_DIR must not contain null bytes.");
  const key = createHash("sha256").update(path.resolve(root)).digest("hex");
  return path.join(path.resolve(configured), "index", key);
}
export function manifestPath(root: string): string { return path.join(indexStateRoot(root), "index.json"); }
export function databasePath(root: string): string { return path.join(indexStateRoot(root), "qmd-cache", "qmd", "index.sqlite"); }

const selectedEngine = new AsyncLocalStorage<{binary: string | null}>();
/** An authenticated local owner may select its installed engine per operation. */
export function withQmdBinary<T>(binary: string | null, operation: () => T): T { return selectedEngine.run({binary}, operation); }
/** Where the selected engine came from: an explicit override, a package installed beside jumpyBrain, or PATH. */
export type QmdEngineSource = "override" | "package" | "path";
export function selectQmdEngine(env: NodeJS.ProcessEnv = process.env): { binary: string; source: QmdEngineSource } {
  const selected = selectedEngine.getStore();
  const override = selected ? selected.binary?.trim() : env.JUMPYBRAIN_QMD_BIN?.trim();
  if (override) return { binary: override, source: "override" };
  const installed = packageQmdBinary();
  return installed ? { binary: installed, source: "package" } : { binary: "qmd", source: "path" };
}
export function resolveQmdBinary(env: NodeJS.ProcessEnv = process.env): string { return selectQmdEngine(env).binary; }

/** The CLI and transactional SDK must come from the same explicitly supported installation. */
export function resolveQmdSdk(): string {
  const bin = resolveQmdBinary();
  const candidate = path.isAbsolute(bin) || bin.includes(path.sep) ? bin
    : (process.env.PATH ?? "").split(path.delimiter).map(dir => path.join(dir, bin)).find(file => existsSync(file));
  if (!candidate || !existsSync(candidate)) throw new Error(qmdSetupMessage("qmd CLI is required."));
  let dir = path.dirname(realpathSync(candidate));
  while (true) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      const info = JSON.parse(readFileSync(pkg, "utf8"));
      if (info.name === "@tobilu/qmd") {
        if (info.version !== SUPPORTED_QMD_VERSION) throw new Error(qmdSetupMessage("Unsupported QMD version; @tobilu/qmd@2.8.3 is required before indexing or searching."));
        return path.join(dir, "dist", "index.js");
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(qmdSetupMessage("QMD indexing requires the @tobilu/qmd@2.8.3 package (CLI and SDK together)."));
}

function qmdSetupMessage(reason: string): string {
  // A CLI forwards whichever engine it resolved to a shared backend; that request's engine wins over
  // the backend's own startup environment, and it is not necessarily an override.
  const forwarded = selectedEngine.getStore()?.binary?.trim();
  const override = forwarded === undefined ? process.env.JUMPYBRAIN_QMD_BIN?.trim() : undefined;
  return `${reason} ${forwarded ? `Selected engine: ${JSON.stringify(forwarded)} (from JUMPYBRAIN_QMD_BIN, a package beside jumpyBrain, or PATH). Correct or unset JUMPYBRAIN_QMD_BIN if it is set, then retry. `
    : override ? `Selected JUMPYBRAIN_QMD_BIN=${JSON.stringify(override)}. Correct this override or run \`unset JUMPYBRAIN_QMD_BIN\` to use normal resolution, then retry. ` : ""}If still unavailable, install \`@tobilu/qmd@2.8.3\` in the project that depends on jumpyBrain (\`npm install @tobilu/qmd@2.8.3\`) or globally (\`npm install -g @tobilu/qmd@2.8.3\`), or set JUMPYBRAIN_QMD_BIN to its CLI.`;
}

/** Root-isolated QMD environment shared by one-shot CLI queries and the warm smart-search worker. */
export function qmdQueryEnv(root: string, model?: string): NodeJS.ProcessEnv {
  const derived = indexStateRoot(root);
  return {
    ...process.env,
    HOME: path.join(derived, "qmd-home"),
    XDG_CACHE_HOME: path.join(derived, "qmd-cache"),
    QMD_CONFIG_DIR: path.join(derived, "qmd-config"),
    INDEX_PATH: databasePath(root),
    QMD_EMBED_MODEL: model ?? "",
    QMD_SQLITE_BUSY_TIMEOUT: "5000",
    GGML_METAL_NO_RESIDENCY: process.env.QMD_METAL_KEEP_RESIDENCY ? process.env.GGML_METAL_NO_RESIDENCY : "1",
  };
}

export async function runQmd(root: string, args: string[], model?: string): Promise<{ stdout: string; stderr: string }> {
  return runQmdChild(resolveQmdBinary(), [...args, "--index", "index"], { cwd: root, maxBytes: 20 * 1024 * 1024, env: qmdQueryEnv(root, model) });
}

export function inspectLocalSearchEngine(): { ok: boolean; binary: string; source: QmdEngineSource; message: string } {
  const { binary, source } = selectQmdEngine();
  try {
    const sdk = resolveQmdSdk();
    if (!["index.js", "store.js", "llm.js"].every(file => existsSync(path.join(path.dirname(sdk), file)))) throw new Error("QMD SDK files are missing.");
    const probe = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 5000, maxBuffer: 65536 });
    const version = probe.status === 0 ? probe.stdout.trim().match(/^(?:qmd\s+)?v?(\d+\.\d+\.\d+)(?:\s+\([a-f0-9]+\))?$/i)?.[1] : undefined;
    if (version !== SUPPORTED_QMD_VERSION) throw new Error("QMD 2.8.3 version check failed.");
    return { ok: true, binary, source, message: "QMD 2.8.3 CLI and SDK are available; retrieval requires a separate check." };
  } catch { return { ok: false, binary, source, message: "The selected QMD must provide compatible @tobilu/qmd@2.8.3 CLI and SDK. Correct or unset JUMPYBRAIN_QMD_BIN, or rerun the installer." }; }
}

/**
 * Node's own package lookup: the nearest `node_modules/@tobilu/qmd` in this
 * installation's ancestor directories, so a QMD installed beside jumpyBrain in a
 * consuming project is found at any nesting depth. It starts from jumpyBrain's
 * real location, never from the current directory, so an untrusted checkout
 * cannot supply the engine. The nearest package wins even when it has the wrong
 * version; the SDK check then fails instead of silently choosing another copy.
 */
export function packageQmdBinary(start = realpathSync(path.dirname(fileURLToPath(import.meta.url)))): string | undefined {
  for (let dir = start; ; dir = path.dirname(dir)) {
    const modules = path.join(dir, "node_modules");
    const manifest = path.join(modules, "@tobilu", "qmd", "package.json");
    if (existsSync(manifest)) {
      if (process.platform === "win32") return path.join(modules, ".bin", "qmd.cmd");
      // A broken nearest package stays selected so its check fails visibly instead of falling through to PATH.
      let relative: unknown = "bin/qmd";
      try { const bin = JSON.parse(readFileSync(manifest, "utf8")).bin; relative = typeof bin === "string" ? bin : bin?.qmd ?? relative; } catch { /* reported by the SDK check */ }
      return path.join(path.dirname(manifest), typeof relative === "string" ? relative : "bin/qmd");
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}

export function qmdVirtualPathToRelative(file: string, collection = QMD_COLLECTION): string | undefined {
  const prefix = `qmd://${collection}/`;
  if (!file.startsWith(prefix)) return undefined;
  return decodeURIComponent(file.slice(prefix.length));
}
export function normalizeQmdLookupPath(file: string): string { return file.toLowerCase().replace(/_/g, "-"); }
