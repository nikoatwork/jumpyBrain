export interface ParsedCliArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

export function parseArgs(argv: string[]): ParsedCliArgs {
  if (argv[0] === "migrate") return parseMigrationArgs(argv);
  const args: ParsedCliArgs = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    const current = args[key];
    if (current === undefined) {
      args[key] = next;
    } else if (Array.isArray(current)) {
      current.push(next);
    } else {
      args[key] = [String(current), next];
    }
    index += 1;
  }
  return args._[0] === "migrate" ? parseMigrationArgs(argv) : args;
}

export function stringArg(args: ParsedCliArgs, key: string, fallback?: string | false): string {
  const value = args[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return String(value[0]);
  if (fallback !== undefined && fallback !== false) return fallback;
  if (fallback === false) return "";
  throw new Error(`--${key} is required.`);
}

export function numberArg(args: ParsedCliArgs, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${key} must be a positive integer.`);
  return parsed;
}

export function stringListArg(args: ParsedCliArgs, key: string): string[] {
  const value = args[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map(String);
  return [];
}

// Keep migration strict without changing legacy argument behavior for other commands.
function parseMigrationArgs(argv: string[]): ParsedCliArgs {
  if (argv.some((token) => /^--(?:target-url|remote-url)(?:=|$)/.test(token))) {
    throw new Error("Logseq migration is local-only; --target-url and --remote-url are not supported. Use --source and --root.");
  }
  const args: ParsedCliArgs = { _: [] };
  const booleans = new Set(["apply", "fail-on-conflict", "json"]);
  const strings = new Set(["source", "root"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const equal = token.indexOf("=");
    const key = token.slice(2, equal < 0 ? undefined : equal);
    if (!booleans.has(key) && !strings.has(key)) throw new Error(`Unknown migration flag --${key}.`);
    if (args[key] !== undefined) throw new Error(`--${key} must not be repeated.`);
    let value = equal < 0 ? undefined : token.slice(equal + 1);
    const next = argv[index + 1];
    if (value === undefined && next !== undefined && !next.startsWith("-")) {
      value = next;
      index += 1;
    }
    if (booleans.has(key)) {
      if (value !== undefined && value !== "true" && value !== "false") {
        throw new Error(`--${key} must be a boolean flag or true/false.`);
      }
      args[key] = value !== "false";
    } else {
      if (value === undefined || !value.trim()) throw new Error(`--${key} requires a non-empty path value.`);
      args[key] = value;
    }
  }
  if (args._.length !== 2 || args._[1] !== "logseq") {
    throw new Error("Usage: jumpybrain migrate logseq --source <vault> --root <memory-root> [--apply] [--fail-on-conflict] [--json]");
  }
  for (const key of strings) {
    if (typeof args[key] !== "string") throw new Error(`--${key} is required.`);
  }
  return args;
}
