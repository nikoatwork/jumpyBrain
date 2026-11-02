import { extensionsUsage } from "./usage.js";
import { parseBoardArgs } from "./board-args.js";
import { normalizeEvidenceDate } from "../core/writing/metadata.js";

export interface ParsedCliArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

export function parseArgs(argv: string[]): ParsedCliArgs {
  if (argv[0] === "identity") return parseIdentityArgs(argv);
  if (argv[0] === "board") return parseBoardArgs(argv);
  if (argv[0] === "feedback") return parseFeedbackArgs(argv);
  if (argv[0] === "doctor") return parseDoctorArgs(argv);
  if (argv[0] === "extensions") return parseExtensionsArgs(argv);
  if (argv[0] === "migrate") return parseMigrationArgs(argv);
  const operation = argv[0] === "run" ? argv[1]?.replace(/^memory:/u, "") : argv[0];
  if (operation === "dream" && argv.some(token => /^--(?:check-sources|draft|page-file|id)(?:=|$)/u.test(token))) return parseDreamSourceArgs(argv);
  if (operation === "remember") return parseRememberArgs(argv);
  if (operation === "delete") return parseDeleteArgs(argv);
  if (["expand", "recall", "search"].includes(operation)) {
    return parseBoundedReadArgs(argv, operation);
  }
  const strict = parseCommandFlags(argv, operation);
  if (strict) return strict;
  const args: ParsedCliArgs = { _: [] };
  const flags: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    if (operation === "dream" && Object.hasOwn(args, key)) throw new Error(`--${key} must not be repeated.`);
    flags.push(token);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    const current = args[key];
    flags.push(next);
    if (current === undefined) {
      args[key] = next;
    } else if (Array.isArray(current)) {
      current.push(next);
    } else {
      args[key] = [String(current), next];
    }
    index += 1;
  }
  // Preserve legacy flags-before-command spelling without letting it bypass
  // command-specific validation. The first pass only identifies positionals.
  return args._.length && argv[0] !== args._[0] ? parseArgs([...args._, ...flags]) : args;
}

// The remaining legacy command families share token validation only. Their
// handlers retain semantic validation, target policy and output ownership.
function parseCommandFlags(argv: string[], operation: string): ParsedCliArgs | undefined {
  const targets = ["root", "target-url", "remote-url"];
  const actor = ["actor", "actor-id", "actor-name"];
  const documentUpdate = argv[0] === "run" || argv.some(token => /^--(?:id|if-match|root|target-url|remote-url)(?:=|$)/u.test(token));
  const specs: Record<string, { values?: string[]; booleans?: string[]; optionalBooleans?: string[]; repeat?: string[]; positional?: number }> = {
    instructions: { values: ["topic"] },
    "agent-hint": { values: ["topic"] },
    status: { values: targets },
    index: { values: [...targets, "semantic-model"], booleans: ["rebuild", "lexical"] },
    tree: { values: [...targets, "limit"], booleans: ["connections", "show-files", "showFiles"] },
    overview: { values: [...targets, "limit"], booleans: ["connections", "show-files", "showFiles"] },
    show: { values: [...targets, "id"] },
    update: documentUpdate ? { values: [...targets, "id", "if-match", ...actor] }
      : { values: ["home", "install-root", "source", "ref"], booleans: ["dry-run"] },
    process: { values: [...targets, "mode", "topic", "since", "if-match", "limit"], booleans: ["preview"], optionalBooleans: ["apply"] },
    wrapup: { values: [...targets, "title", "topic", "limit", "tag"], repeat: ["tag"] },
    init: { values: ["root"], booleans: ["force"] },
    serve: { values: ["root", "host", "port", "api-key", "public-base-url"], booleans: ["init"], repeat: ["api-key"] },
    backend: { values: ["root"], positional: 2 },
    access: { values: ["root", "name", "role", "id"], positional: 2 },
    collaborate: { values: [...targets, "id", "start", "delete", "epoch", "base-revision", "client-id", "stream-id"], positional: 2 },
  };
  if (!Object.hasOwn(specs, operation)) return undefined;
  const spec = specs[operation]!;
  const positional = argv[0] === "run" ? 2 : spec.positional ?? 1;
  const args: ParsedCliArgs = { _: argv.slice(0, positional) };
  const values = new Set(spec.values), booleans = new Set(["json", ...(spec.booleans ?? [])]);
  const optionalBooleans = new Set(spec.optionalBooleans);
  for (let index = positional; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected ${operation} argument: ${token}. See jumpybrain ${operation} --help.`);
    const equal = token.indexOf("="), key = token.slice(2, equal < 0 ? undefined : equal);
    if (!values.has(key) && !booleans.has(key) && !optionalBooleans.has(key)) throw new Error(`Unknown ${operation} flag --${key}. See jumpybrain ${operation} --help.`);
    if (Object.hasOwn(args, key) && !spec.repeat?.includes(key)) throw new Error(`--${key} must not be repeated.`);
    if (booleans.has(key)) {
      if (equal >= 0) throw new Error(`--${key} is a boolean flag and takes no value.`);
      args[key] = true;
    } else if (optionalBooleans.has(key)) {
      let value = equal >= 0 ? token.slice(equal + 1) : undefined;
      if (value === undefined && argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("--")) value = argv[++index];
      if (value !== undefined && value !== "true" && value !== "false") throw new Error(`--${key} must be a boolean flag or true/false.`);
      args[key] = value === undefined ? true : value;
    } else {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (!value || value.startsWith("--") || !value.trim()) throw new Error(`--${key} requires a value.`);
      args[key] = spec.repeat?.includes(key) ? [...stringListArg(args, key), value] : value;
    }
  }
  if (operation === "process" && args.preview && (args.mode !== "lint" || args.apply !== undefined)) throw new Error("--preview requires --mode lint and cannot combine with --apply.");
  if (operation === "index" && args.lexical && args["semantic-model"] !== undefined) throw new Error("Use only one of --lexical or --semantic-model.");
  return args;
}

function parseIdentityArgs(argv: string[]): ParsedCliArgs {
  const args: ParsedCliArgs = { _: ["identity"] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!;
    const equal = token.indexOf("="), key = token.slice(2, equal < 0 ? undefined : equal);
    if (!token.startsWith("--") || !["name", "json", "help"].includes(key)) throw new Error("Use jumpybrain identity [--name <name>] [--json].");
    if (Object.hasOwn(args, key)) throw new Error(`--${key} must not be repeated.`);
    if (key === "name") {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (value === undefined || value.startsWith("--")) throw new Error("--name requires a value; use an empty string to clear it.");
      args.name = value;
    } else {
      if (equal >= 0) throw new Error(`--${key} takes no value.`);
      args[key] = true;
    }
  }
  return args;
}

function parseFeedbackArgs(argv: string[]): ParsedCliArgs {
  const args: ParsedCliArgs = { _: ["feedback"] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error("Unexpected feedback argument. Use --message or pipe text on stdin; boolean flags take no value.");
    const equal = token.indexOf("="), key = token.slice(2, equal < 0 ? undefined : equal);
    if (!["message", "id", "dry-run", "json", "help"].includes(key)) throw new Error(`Unknown feedback flag --${key}.`);
    if (Object.hasOwn(args, key)) throw new Error(`--${key} must not be repeated.`);
    if (key === "message" || key === "id") {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (!value || value.startsWith("--") || !value.trim()) throw new Error(`--${key} requires a non-empty value.`);
      args[key] = value;
    } else {
      if (equal >= 0) throw new Error(`--${key} is a boolean flag and takes no value.`);
      args[key] = true;
    }
  }
  if (typeof args.id === "string" && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(args.id)) throw new Error("--id must be a lowercase UUID v4 from a previous feedback attempt.");
  return args;
}

function parseDoctorArgs(argv: string[]): ParsedCliArgs {
  const args: ParsedCliArgs = { _: ["doctor"] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected doctor argument: ${token}. Boolean flags take no value.`);
    const equal = token.indexOf("="), key = token.slice(2, equal < 0 ? undefined : equal);
    if (!["root", "json", "check"].includes(key)) throw new Error(`Unknown doctor flag --${key}.`);
    if (Object.hasOwn(args, key)) throw new Error(`--${key} must not be repeated.`);
    if (key !== "root") {
      if (equal >= 0) throw new Error(`--${key} is a boolean flag and takes no value.`);
      args[key] = true;
    } else {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (!value || value.startsWith("--") || !value.trim()) throw new Error("--root requires a non-empty value.");
      args.root = value;
    }
  }
  return args;
}

function parseRememberArgs(argv: string[]): ParsedCliArgs {
  const positional = argv[0] === "run" ? 2 : 1;
  const args: ParsedCliArgs = { _: argv.slice(0, positional) };
  const values = new Set(["root", "target-url", "remote-url", "type", "title", "tag", "date", "actor", "actor-id", "actor-name"]);
  for (let index = positional; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected remember argument: ${token}.`);
    const equal = token.indexOf("=");
    const key = token.slice(2, equal < 0 ? undefined : equal);
    if (!values.has(key) && key !== "json" && key !== "dream") throw new Error(`Unknown remember flag --${key}.`);
    if (args[key] !== undefined && key !== "tag") throw new Error(`--${key} must not be repeated.`);
    if (key === "json") {
      if (equal >= 0) throw new Error("--json is a boolean flag and takes no value.");
      args[key] = true;
    } else if (key === "dream") {
      // Preserve the existing explicit true/false spellings as well as --dream.
      let value = equal >= 0 ? token.slice(equal + 1) : undefined;
      if (value === undefined && argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("--")) value = argv[++index];
      if (value !== undefined && value !== "true" && value !== "false") throw new Error("--dream must be a boolean flag or true/false.");
      args[key] = value ?? true;
    } else {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value.`);
      args[key] = key === "tag" ? [...stringListArg(args, key), value] : value;
    }
  }
  // Reject malformed metadata before target credentials, stdin or any writes.
  normalizeEvidenceDate(args.date);
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

// Scoped strict parsing prevents misspelled budgets/ranges silently becoming unbounded reads.
function parseBoundedReadArgs(argv: string[], operation: string): ParsedCliArgs {
  const positional = argv[0] === "run" ? 2 : 1;
  const args: ParsedCliArgs = { _: argv.slice(0, positional) };
  const booleans = new Set(operation === "expand" ? ["json"] : ["json", "compact", "diagnostics", "no-refresh", "read-only", "recognition"]);
  const values = new Set(["root", "target-url", "remote-url", "max-bytes", ...(operation === "expand"
    ? ["id", "if-match", "start-line", "end-line", "section-line"] : ["topic", "query", "limit", "depth", "from", "to", "reference-date", "order", "last-editor", "editor-id", "edited-from", "edited-to", "date-field", "time-zone", "sort", "offset"])]);
  for (let index = positional; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected bounded-read argument: ${token}.`);
    const equal = token.indexOf("=");
    const key = token.slice(2, equal < 0 ? undefined : equal);
    if (!booleans.has(key) && !values.has(key)) throw new Error(`Unknown bounded-read flag --${key}.`);
    if (args[key] !== undefined) throw new Error(`--${key} must not be repeated.`);
    if (booleans.has(key)) {
      if (equal >= 0) throw new Error(`--${key} is a boolean flag and takes no value.`);
      args[key] = true;
    } else {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value.`);
      args[key] = value;
    }
  }
  return args;
}

// Keep migration strict without changing legacy argument behavior for other commands.
function parseMigrationArgs(argv: string[]): ParsedCliArgs {
  if (argv.some((token) => /^--(?:target-url|remote-url)(?:=|$)/.test(token))) {
    throw new Error("Migration is local-only; --target-url and --remote-url are not supported. Use --source and --root.");
  }
  const args: ParsedCliArgs = { _: [] };
  const booleans = new Set(["apply", "fail-on-conflict", "json"]);
  const strings = new Set(["source", "root", "body-format"]);
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
  if (args._.length !== 2 || !["logseq", "obsidian"].includes(args._[1])) {
    throw new Error("Usage: jumpybrain migrate <logseq|obsidian> --source <vault> --root <memory-root> [--body-format readable|preserve] [--apply] [--fail-on-conflict] [--json]");
  }
  for (const key of ["source", "root"]) {
    if (typeof args[key] !== "string") throw new Error(`--${key} is required.`);
  }
  if (args._[1] === "obsidian" && args["body-format"] !== undefined) throw new Error("--body-format is Logseq-only; Obsidian always preserves source bytes.");
  if (args["body-format"] !== undefined && args["body-format"] !== "readable" && args["body-format"] !== "preserve") throw new Error("--body-format must be readable or preserve.");
  return args;
}

function parseDeleteArgs(argv: string[]): ParsedCliArgs {
  const positional = argv[0] === "run" ? 2 : 1;
  const args: ParsedCliArgs = { _: argv.slice(0, positional) };
  const flags = new Set(["root", "target-url", "remote-url", "id", "if-match", "apply", "json"]);
  for (let i = positional; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected delete argument: ${token}.`);
    const key = token.slice(2);
    if (!flags.has(key)) throw new Error(`Unknown delete flag --${key}.`);
    if (args[key] !== undefined) throw new Error(`--${key} must not be repeated.`);
    if (key === "apply" || key === "json") args[key] = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value.`);
      args[key] = value;
    }
  }
  if (!args.id) throw new Error("--id is required.");
  if (args.apply && !/^sha256:[0-9a-f]{64}$/.test(String(args["if-match"] ?? ""))) throw new Error("Deletion requires --if-match <contentHash> from a prior read.");
  return args;
}

function parseDreamSourceArgs(argv: string[]): ParsedCliArgs {
  const args: ParsedCliArgs = { _: [argv[0]!] };
  const values = new Set(["root", "target-url", "remote-url", "id", "page-file"]);
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error("Source checks accept flags only.");
    const equal = token.indexOf("="), key = token.slice(2, equal < 0 ? undefined : equal);
    if (Object.hasOwn(args, key)) throw new Error(`--${key} must not be repeated.`);
    if (["check-sources", "draft", "json"].includes(key)) {
      if (equal >= 0) throw new Error(`--${key} takes no value.`);
      args[key] = true;
    } else if (values.has(key)) {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value.`);
      args[key] = value;
    } else throw new Error(`Unknown source-check flag --${key}.`);
  }
  return args;
}

export function parseExtensionsArgs(argv: string[]): ParsedCliArgs {
  if (argv.some(token => /^--(?:target-url|remote-url)(?:=|$)/u.test(token))) {
    throw new Error("Extensions are desktop-local; --target-url and --remote-url are not supported.");
  }
  const command = argv[1];
  if (!command || command === "help" || command === "--help") {
    if (argv.length > (command ? 2 : 1)) throw new Error("Unexpected extension help argument.");
    return { _: ["extensions"], help: true };
  }
  if (!["check", "install", "link", "list", "enable", "disable", "remove", "reload"].includes(command)) throw new Error(`Unknown extensions command '${command}'.\n${extensionsUsage()}`);
  const args: ParsedCliArgs = { _: ["extensions", command] };
  const values = new Set(["directory", ...(["check", "install", "link"].includes(command) ? ["source"] : ["enable", "disable", "remove"].includes(command) ? ["id"] : [])]);
  for (let index = 2; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected extensions argument: ${token}.`);
    const equal = token.indexOf("="), key = token.slice(2, equal < 0 ? undefined : equal);
    if (Object.hasOwn(args, key)) throw new Error(`--${key} must not be repeated.`);
    if (["json", "help"].includes(key)) {
      if (equal >= 0) throw new Error(`--${key} takes no value.`);
      args[key] = true;
    } else if (values.has(key)) {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++index];
      if (!value || value.startsWith("--") || !value.trim()) throw new Error(`--${key} requires a value.`);
      args[key] = value;
    } else throw new Error(`Unknown extensions flag --${key}.`);
  }
  const required = ["check", "install", "link"].includes(command) ? "source" : ["enable", "disable", "remove"].includes(command) ? "id" : null;
  if (!args.help && required && !args[required]) throw new Error(`--${required} is required.`);
  if (args.id && (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(String(args.id)) || ["__proto__", "constructor", "prototype"].includes(String(args.id)))) throw new Error("Invalid extension ID.");
  return args;
}
