import path from "node:path";

export interface CliArgs {
  [key: string]: string | boolean | string[] | undefined;
}

export interface LocalMemoryTarget {
  kind: "local";
  root?: string;
}

export interface RemoteMemoryTarget {
  kind: "remote";
  url: string;
}

export type CliMemoryTarget = LocalMemoryTarget | RemoteMemoryTarget;

export interface ResolveCliTargetOptions {
  allowDiscovery?: boolean;
}

const REMOTE_URL_FLAGS = ["target-url", "remote-url"] as const;

export function resolveCliTarget(args: CliArgs, options: ResolveCliTargetOptions = {}): CliMemoryTarget {
  for (const flag of REMOTE_URL_FLAGS) {
    const url = stringFlag(args, flag);
    if (url !== undefined) return { kind: "remote", url };
  }

  const root = stringFlag(args, "root");
  if (root !== undefined) return { kind: "local", root };
  if (options.allowDiscovery) return { kind: "local" };

  throw new Error("--root is required.");
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

function stringFlag(args: CliArgs, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`--${key} must not be empty.`);
    return trimmed;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    const trimmed = value[0].trim();
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
