import path from "node:path";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface CliArgs {
  [key: string]: string | boolean | string[] | undefined;
}

export interface LocalMemoryTarget {
  kind: "local";
  root?: string;
  source?: string;
}

export interface RemoteMemoryTarget {
  kind: "remote";
  url: string;
  source?: string;
}

export type CliMemoryTarget = LocalMemoryTarget | RemoteMemoryTarget;

export interface ResolveCliTargetOptions {
  allowDiscovery?: boolean;
  fallbackRoot?: string;
}

export function resolveCliTarget(args: CliArgs, options: ResolveCliTargetOptions = {}): CliMemoryTarget {
  const selectors = ["root", "target-url", "remote-url"].filter(flag => args[flag] !== undefined);
  if (selectors.length > 1) throw new Error("Use only one target selector: --root, --target-url or --remote-url.");
  if (selectors.length) {
    const flag = selectors[0]!;
    const value = stringFlag(args, flag)!;
    return flag === "root" ? { kind: "local", root: value, source: "flag" } : { kind: "remote", url: value, source: "flag" };
  }
  if (process.env.JUMPYBRAIN_MEMORY_ROOT !== undefined) {
    const root = process.env.JUMPYBRAIN_MEMORY_ROOT.trim();
    if (!root) throw new Error("JUMPYBRAIN_MEMORY_ROOT must be a non-empty path when set.");
    return { kind: "local", root, source: "environment" };
  }
  const root = installedRoot();
  if (root) return { kind: "local", root, source: "install-manifest" };
  if (options.allowDiscovery) return { kind: "local", source: "recipe-discovery" };
  if (options.fallbackRoot) return { kind: "local", root: options.fallbackRoot, source: "personal-fallback" };
  throw new Error("--root is required. Set JUMPYBRAIN_MEMORY_ROOT for a configured CLI default.");
}

// Only the owning managed app's adjacent manifest is configuration. Never read cwd files.
function installedRoot(): string | undefined {
  const app = fileURLToPath(new URL("../../", import.meta.url));
  if (path.basename(path.resolve(app)) !== "app") return;
  const filename = path.resolve(app, "../install-manifest.json");
  try {
    const info = lstatSync(filename);
    if (!info.isFile() || info.nlink !== 1 || info.size > 131072) throw new Error();
    const manifest = JSON.parse(readFileSync(filename, "utf8"));
    if (manifest.installer !== "jumpybrain-installer" || (manifest.remoteOnly !== undefined && typeof manifest.remoteOnly !== "boolean") || (!manifest.remoteOnly && (typeof manifest.memoryRoot !== "string" || !path.isAbsolute(manifest.memoryRoot)))) throw new Error();
    return manifest.remoteOnly ? undefined : manifest.memoryRoot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error("Invalid owning install-manifest.json; repair the managed installation or pass --root explicitly.");
  }
}

export function requireLocalRoot(args: CliArgs, options?: { allowDiscovery?: false }): string;
export function requireLocalRoot(args: CliArgs, options: { allowDiscovery: true }): string | undefined;
export function requireLocalRoot(args: CliArgs, options: ResolveCliTargetOptions = {}): string | undefined {
  const target = resolveCliTarget(args, options);
  if (target.kind === "remote") {
    throw new Error(`This command only supports local memory roots. Use --root <memory-root>, not remote target ${JSON.stringify(target.url)}.`);
  }
  return target.root;
}

function stringFlag(args: CliArgs, key: string): string {
  const value = args[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`--${key} must not be empty.`);
    return trimmed;
  }
  throw new Error(`--${key} requires a value.`);
}

/** Only diagnose the selected root itself, never a missing configured index or source file. */
export function memoryRootInspectionMessage(error: unknown, root: string): string | undefined {
  const failure = error as NodeJS.ErrnoException;
  const resolved = path.resolve(root);
  if (failure?.syscall === "realpath" && failure.path === resolved && failure.code === "ENOENT") {
    const quoted = `'${resolved.replace(/'/gu, `'"'"'`)}'`;
    return `Memory root does not exist: ${JSON.stringify(resolved)}. Initialize this same root with: jumpybrain init --root ${quoted}`;
  }
  if (failure?.code === "EACCES" || failure?.code === "EPERM") return "Permission denied while inspecting memory root; check access to the selected folder.";
  // Core reads from the real root, which can differ from the requested symlink path.
  if (failure instanceof Error && /^Failed to read [\s\S]+[/\\]jumpybrain\.json:/u.test(failure.message)) {
    return /\b(?:EACCES|EPERM)\b/u.test(failure.message)
      ? "Permission denied reading jumpybrain.json in the selected memory root; check folder/config access."
      : "Unable to read or parse jumpybrain.json in the selected memory root; inspect and correct that config.";
  }
  return undefined;
}
