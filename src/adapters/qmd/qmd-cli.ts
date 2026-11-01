import { AsyncLocalStorage } from "node:async_hooks";
import { spawnSync } from "node:child_process";
import { runQmdChild } from "./qmd-execution.js";
import { existsSync, realpathSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const QMD_COLLECTION = "jumpybrain";
export const QMD_DREAM_COLLECTION = "jumpybrain-dreams";
export const SUPPORTED_QMD_VERSION = "2.8.3";

export function derivedRoot(root: string): string { return path.join(root, ".jumpybrain"); }
export function manifestPath(root: string): string { return path.join(derivedRoot(root), "index.json"); }
export function databasePath(root: string): string { return path.join(derivedRoot(root), "qmd-cache", "qmd", "index.sqlite"); }

const selectedEngine = new AsyncLocalStorage<{binary: string | null}>();
/** An authenticated local owner may select its installed engine per operation. */
export function withQmdBinary<T>(binary: string | null, operation: () => T): T { return selectedEngine.run({binary}, operation); }
export function resolveQmdBinary(env: NodeJS.ProcessEnv = process.env): string {
  const selected = selectedEngine.getStore();
  return (selected ? selected.binary?.trim() : env.JUMPYBRAIN_QMD_BIN?.trim()) || bundledQmdBinary() || "qmd";
}

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
  const selected = selectedEngine.getStore();
  const override = selected ? selected.binary?.trim() : process.env.JUMPYBRAIN_QMD_BIN?.trim();
  return `${reason} ${override ? `Selected JUMPYBRAIN_QMD_BIN=${JSON.stringify(override)}. Correct this override or run \`unset JUMPYBRAIN_QMD_BIN\` to use normal resolution, then retry. ` : ""}If still unavailable, install with \`npm install -g @tobilu/qmd@2.8.3\` or set JUMPYBRAIN_QMD_BIN to its CLI.`;
}

export async function runQmd(root: string, args: string[], model?: string): Promise<{ stdout: string; stderr: string }> {
  const derived = derivedRoot(root);
  return runQmdChild(resolveQmdBinary(), [...args, "--index", "index"], {
    cwd: root, maxBytes: 20 * 1024 * 1024,
    env: {
      ...process.env,
      HOME: path.join(derived, "qmd-home"),
      XDG_CACHE_HOME: path.join(derived, "qmd-cache"),
      QMD_CONFIG_DIR: path.join(derived, "qmd-config"),
      INDEX_PATH: databasePath(root),
      QMD_EMBED_MODEL: model ?? "",
      QMD_SQLITE_BUSY_TIMEOUT: "5000",
      GGML_METAL_NO_RESIDENCY: process.env.QMD_METAL_KEEP_RESIDENCY ? process.env.GGML_METAL_NO_RESIDENCY : "1",
    },
  });
}

export function inspectLocalSearchEngine(): { ok: boolean; binary: string; message: string } {
  const binary = resolveQmdBinary();
  try {
    const sdk = resolveQmdSdk();
    if (!["index.js", "store.js", "llm.js"].every(file => existsSync(path.join(path.dirname(sdk), file)))) throw new Error("QMD SDK files are missing.");
    const probe = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 5000, maxBuffer: 65536 });
    const version = probe.status === 0 ? probe.stdout.trim().match(/^(?:qmd\s+)?v?(\d+\.\d+\.\d+)(?:\s+\([a-f0-9]+\))?$/i)?.[1] : undefined;
    if (version !== SUPPORTED_QMD_VERSION) throw new Error("QMD 2.8.3 version check failed.");
    return { ok: true, binary, message: "QMD 2.8.3 CLI and SDK are available; retrieval requires a separate check." };
  } catch { return { ok: false, binary, message: "The selected QMD must provide compatible @tobilu/qmd@2.8.3 CLI and SDK. Correct or unset JUMPYBRAIN_QMD_BIN, or rerun the installer." }; }
}

function bundledQmdBinary(): string | undefined {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [3, 2, 1].map(level => path.resolve(moduleDir, ...Array(level).fill(".."), "node_modules", ".bin", process.platform === "win32" ? "qmd.cmd" : "qmd"));
  return candidates.find(candidate => existsSync(candidate));
}

export function qmdVirtualPathToRelative(file: string, collection = QMD_COLLECTION): string | undefined {
  const prefix = `qmd://${collection}/`;
  if (!file.startsWith(prefix)) return undefined;
  return decodeURIComponent(file.slice(prefix.length));
}
export function normalizeQmdLookupPath(file: string): string { return file.toLowerCase().replace(/_/g, "-"); }
