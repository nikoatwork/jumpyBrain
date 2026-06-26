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
    throw new Error(
      `Remote jumpyBrain target ${JSON.stringify(target.url)} is recognized but not implemented yet. Use --root <memory-root> for local memory.`,
    );
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
