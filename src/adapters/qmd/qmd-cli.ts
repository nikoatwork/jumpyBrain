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

export function resolveQmdBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.JUMPYBRAIN_QMD_BIN?.trim() || bundledQmdBinary() || "qmd";
}

/** The CLI and transactional SDK must come from the same explicitly supported installation. */
export function resolveQmdSdk(): string {
  const bin = resolveQmdBinary();
  const candidate = path.isAbsolute(bin) || bin.includes(path.sep) ? bin
    : (process.env.PATH ?? "").split(path.delimiter).map(dir => path.join(dir, bin)).find(file => existsSync(file));
  if (!candidate || !existsSync(candidate)) throw new Error("qmd CLI is required. Install with `npm install -g @tobilu/qmd@2.8.3` or set JUMPYBRAIN_QMD_BIN.");
  let dir = path.dirname(realpathSync(candidate));
  while (true) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      const info = JSON.parse(readFileSync(pkg, "utf8"));
      if (info.name === "@tobilu/qmd") {
        if (info.version !== SUPPORTED_QMD_VERSION) throw new Error("Unsupported QMD version; install @tobilu/qmd@2.8.3 before indexing or searching.");
        return path.join(dir, "dist", "index.js");
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("QMD indexing requires the @tobilu/qmd@2.8.3 package (CLI and SDK together); check JUMPYBRAIN_QMD_BIN.");
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
