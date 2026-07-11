export interface ParsedCliArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

export function parseArgs(argv: string[]): ParsedCliArgs {
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
  return args;
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
