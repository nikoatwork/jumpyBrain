import path from "node:path";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { discoverMemoryRoot } from "../core/memory-root/index.js";
import { trustedProject } from "./project-trust.js";
import { BRAIN_SELECTION, type NamedBrain } from "./named-brains.js";

export interface CliArgs {
  [key: string]: string | boolean | string[] | undefined;
  [BRAIN_SELECTION]?: NamedBrain;
}

export interface LocalMemoryTarget {
  kind: "local";
  root?: string;
  source?: string;
  /** Set when `--brain <name>` chose this folder. */
  brain?: string;
}

export interface RemoteMemoryTarget {
  kind: "remote";
  url: string;
  source?: string;
  /** Set when `--brain <name>` chose this server; its key is then bound to that name. */
  brain?: string;
}

export type CliMemoryTarget = LocalMemoryTarget | RemoteMemoryTarget;

export interface ResolveCliTargetOptions {
  allowDiscovery?: boolean;
  fallbackRoot?: string;
}

export function resolveCliTarget(args: CliArgs, options: ResolveCliTargetOptions = {}): CliMemoryTarget {
  const selectors = ["root", "target-url", "remote-url"].filter(flag => args[flag] !== undefined);
  if (selectors.length > 1) throw new Error(`Use only one target selector: ${args[BRAIN_SELECTION] ? "--brain, " : ""}--root, --target-url or --remote-url.`);
  if (selectors.length) {
    const flag = selectors[0]!;
    const value = stringFlag(args, flag)!;
    const brain = args[BRAIN_SELECTION];
    // `--brain` was expanded into this flag; report and bind it by name.
    if (brain && (brain.kind === "local" ? flag === "root" && value === brain.root : flag !== "root" && value === brain.url)) {
      return brain.kind === "local" ? { kind: "local", root: value, source: "brain", brain: brain.name } : { kind: "remote", url: value, source: "brain", brain: brain.name };
    }
    return flag === "root" ? { kind: "local", root: value, source: "flag" } : { kind: "remote", url: value, source: "flag" };
  }
  if (process.env.JUMPYBRAIN_MEMORY_ROOT !== undefined) {
    const root = process.env.JUMPYBRAIN_MEMORY_ROOT.trim();
    if (!root) throw new Error("JUMPYBRAIN_MEMORY_ROOT must be a non-empty path when set.");
    return { kind: "local", root, source: "environment" };
  }
  const root = installedRoot();
  // Doctor reports instead of stopping. Legacy recipe discovery may still use the
  // project itself, but only when no personal brain could be chosen in its place.
  const mayIgnoreProject = Boolean(options.fallbackRoot) || Boolean(options.allowDiscovery && !root);
  let project: string | undefined;
  try { project = discoverProject(root); }
  catch (error) {
    if (!mayIgnoreProject) throw new Error(`Could not check this directory for project memory (${(error as NodeJS.ErrnoException).code ?? "unreadable"}). Pass --root <memory-root> or set JUMPYBRAIN_MEMORY_ROOT.`, { cause: error });
  }
  if (project) {
    if (trustedProject(project)) return { kind: "local", root: project, source: "trusted-project" };
    // Never quietly use the personal brain while an unapproved project memory sits right here.
    if (!mayIgnoreProject) throw untrustedProjectError(project);
  }
  if (root) return { kind: "local", root, source: "install-manifest" };
  if (options.allowDiscovery) return { kind: "local", source: "recipe-discovery" };
  if (options.fallbackRoot) return { kind: "local", root: options.fallbackRoot, source: "personal-fallback" };
  throw new Error("--root is required. Set JUMPYBRAIN_MEMORY_ROOT for a configured CLI default.");
}

/**
 * The nearest initialized memory root from the current directory, unless it is
 * the configured personal root itself. Only existence is checked here; trust
 * comes from the device-local approvals, never from the repository.
 */
export function discoverProject(personalRoot = installedRoot(), cwd = process.cwd()): string | undefined {
  const found = discoverMemoryRoot(cwd);
  if (!found) return undefined;
  if (personalRoot) {
    try { if (realpathSync(personalRoot) === found) return undefined; } catch { /* a missing personal root is reported by the command */ }
  }
  return found;
}

export function untrustedProjectError(root: string): Error {
  const quoted = `'${root.replace(/'/gu, `'"'"'`)}'`;
  return new Error([
    `Found project memory at ${JSON.stringify(root)} that is not approved on this device.`,
    `To use it for commands run here, the user runs: jumpybrain project trust --root ${quoted}`,
    "Or choose a brain explicitly with --root <memory-root> or JUMPYBRAIN_MEMORY_ROOT. See: jumpybrain project status",
  ].join("\n"));
}

// Only the owning managed app's adjacent manifest is configuration.
export function installedRoot(): string | undefined {
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
