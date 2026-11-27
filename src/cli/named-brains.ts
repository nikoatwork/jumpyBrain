import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { chmod, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

// Named CLI brains: optional device-local aliases for a folder or hosted URL,
// chosen with `--brain <name>`; never read without it. Keys live in the
// credentials adapter, bound to the brain's URL.

const BRAINS_SCHEMA_VERSION = 1;
const DEFAULT_BRAINS_FILE_DISPLAY = "~/.config/jumpybrain/brains.json";
const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_FILE = 65536;

export type NamedBrain = { name: string; kind: "local"; root: string } | { name: string; kind: "remote"; url: string };

/** Marks parsed args whose target came from `--brain`; survives object spread, invisible to flag validation. */
export const BRAIN_SELECTION: unique symbol = Symbol("jumpybrain.brain");

export interface BrainsFileOptions { env?: NodeJS.ProcessEnv; home?: string }

export function brainsFile({ env = process.env, home = os.homedir() }: BrainsFileOptions = {}): string {
  const override = env.JUMPYBRAIN_BRAINS_FILE;
  if (override !== undefined) {
    if (!override.trim()) throw new Error("JUMPYBRAIN_BRAINS_FILE must be a non-empty path when set.");
    return path.resolve(override.trim());
  }
  return path.join(home, ".config", "jumpybrain", "brains.json");
}

export function brainsFileDisplay(options: BrainsFileOptions = {}): string {
  const file = brainsFile(options), home = options.home ?? os.homedir();
  return file === path.join(home, ".config", "jumpybrain", "brains.json") ? DEFAULT_BRAINS_FILE_DISPLAY
    : file.startsWith(home + path.sep) ? "~" + file.slice(home.length) : file;
}

export function validBrainName(name: string): boolean { return NAME.test(name); }

function nameError(name: string): Error {
  return new Error(`Invalid brain name ${JSON.stringify(name)}: use 1-32 lowercase letters, digits or '-', starting with a letter (e.g. work, product-it).`);
}

const PREFIX_SEGMENT = /^[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/;
const URL_EXAMPLE = "e.g. https://memory.example.com or https://brains.example.com/team";

/**
 * HTTPS (HTTP on loopback) origin, optionally with a path prefix that a reverse
 * proxy strips (`https://host/team`). Stored as the origin, or the origin plus
 * the prefix without a trailing slash. Prefix segments are plain names, so one
 * URL cannot be spelled two ways (no `.`/`..`, empty segments or escapes).
 */
export function normalizeBrainUrl(value: string): string {
  const raw = value.trim();
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`Invalid brain URL ${JSON.stringify(value)}; use an HTTPS URL, ${URL_EXAMPLE}.`); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback))) throw new Error("A brain URL must use HTTPS (plain HTTP only for 127.0.0.1, localhost or [::1]).");
  if (url.username || url.password) throw new Error("A brain URL must not contain credentials; store the key with jumpybrain brains key.");
  if (url.search || url.hash || /[?#]/.test(raw)) throw new Error(`A brain URL must not contain a query or fragment, ${URL_EXAMPLE}.`);
  // Read the path as typed: the URL parser silently resolves `..`, `.` and backslashes.
  const typed = /^https?:\/\/[^/\\]*(.*)$/i.exec(raw)?.[1] ?? "";
  const prefix = typed.replace(/\/$/, "");
  if (prefix && (typed.includes("\\") || !prefix.slice(1).split("/").every(segment => PREFIX_SEGMENT.test(segment)) || url.pathname.replace(/\/$/, "") !== prefix)) {
    throw new Error(`A brain URL path must be plain names separated by single '/', without '.', '..' or escapes, ${URL_EXAMPLE}.`);
  }
  return url.origin + prefix;
}

interface BrainsConfig { file: string; brains: NamedBrain[] }

export function validateBrainsConfig(value: unknown): NamedBrain[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("the file must hold a JSON object");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== BRAINS_SCHEMA_VERSION) throw new Error(`schemaVersion ${JSON.stringify(record.schemaVersion)} is unsupported (expected ${BRAINS_SCHEMA_VERSION})`);
  if (!Array.isArray(record.brains)) throw new Error("brains must be an array");
  const names = new Set<string>(), destinations = new Map<string, string>();
  return record.brains.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`brains[${index}] must be an object`);
    const { name, root, url, ...rest } = entry as Record<string, unknown>;
    if (Object.keys(rest).length) throw new Error(`brains[${index}] has unknown field ${JSON.stringify(Object.keys(rest)[0])}`);
    if (typeof name !== "string" || !NAME.test(name)) throw new Error(`brains[${index}].name must be 1-32 lowercase letters, digits or '-', starting with a letter`);
    if (names.has(name)) throw new Error(`brain name ${JSON.stringify(name)} is listed twice`);
    names.add(name);
    if ((root === undefined) === (url === undefined)) throw new Error(`brain ${JSON.stringify(name)} needs exactly one of root or url`);
    let brain: NamedBrain;
    if (root !== undefined) {
      if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error(`brain ${JSON.stringify(name)}: root must be an absolute path`);
      brain = { name, kind: "local", root: path.resolve(root) };
    } else {
      if (typeof url !== "string") throw new Error(`brain ${JSON.stringify(name)}: url must be a string`);
      try { brain = { name, kind: "remote", url: normalizeBrainUrl(url) }; }
      catch (error) { throw new Error(`brain ${JSON.stringify(name)}: ${(error as Error).message}`); }
    }
    const destination = brain.kind === "local" ? `root:${brain.root}` : `url:${brain.url}`;
    const other = destinations.get(destination);
    if (other) throw new Error(`brains ${JSON.stringify(other)} and ${JSON.stringify(name)} name the same ${brain.kind === "local" ? "folder" : "URL"}`);
    destinations.set(destination, name);
    return brain;
  });
}

/** Missing file = no brains. It decides where named keys go, so it must be ours and not group/other-writable. */
export function loadBrains(options: BrainsFileOptions = {}): BrainsConfig {
  const file = brainsFile(options), shown = brainsFileDisplay(options);
  let info;
  try { info = lstatSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { file, brains: [] };
    throw new Error(`Cannot read ${shown}.`);
  }
  let real = file;
  if (info.isSymbolicLink()) {
    try { real = realpathSync(file); info = lstatSync(real); } catch { throw new Error(`Cannot read ${shown}.`); }
  }
  if (!info.isFile() || info.size > MAX_FILE) throw new Error(`${shown} is not a regular brain list file.`);
  if ((info.mode & 0o022) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    throw new Error(`${shown} must be yours and not writable by others, because it decides where access keys are sent. Run: chmod 600 ${shown}`);
  }
  let value: unknown;
  try { value = JSON.parse(readFileSync(real, "utf8")); }
  catch { throw new Error(`Invalid brain list ${shown}: the file is not valid JSON. Repair it, or list brains again with jumpybrain brains add.`); }
  try { return { file, brains: validateBrainsConfig(value) }; }
  catch (error) { throw new Error(`Invalid brain list ${shown}: ${(error as Error).message}. Named brains are unavailable until it is repaired; --root, --target-url and defaults still work.`); }
}

export async function saveBrains(brains: NamedBrain[], options: BrainsFileOptions = {}): Promise<void> {
  validateBrainsConfig({ schemaVersion: BRAINS_SCHEMA_VERSION, brains: brains.map(serializeBrain) });
  const file = brainsFile(options);
  let target = file;
  try { if ((await lstat(file)).isSymbolicLink()) target = realpathSync(file); } catch {}
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.brains.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify({ schemaVersion: BRAINS_SCHEMA_VERSION, brains: brains.map(serializeBrain) }, null, 2) + "\n", "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await chmod(temporary, 0o600); await rename(temporary, target); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

const serializeBrain = (brain: NamedBrain) => brain.kind === "local" ? { name: brain.name, root: brain.root } : { name: brain.name, url: brain.url };

function findBrain(name: string, options: BrainsFileOptions = {}): NamedBrain {
  if (!NAME.test(name)) throw nameError(name);
  const { brains } = loadBrains(options);
  const brain = brains.find(entry => entry.name === name);
  if (!brain) {
    const known = brains.map(entry => entry.name);
    throw new Error(`Unknown brain ${JSON.stringify(name)}. ${known.length ? `Named brains: ${known.join(", ")}.` : `No brains are named in ${brainsFileDisplay(options)}.`} See: jumpybrain brains list; add one with jumpybrain brains add <name> --root <folder> | --target-url <url>.`);
  }
  return brain;
}

// Commands that take no brain selector, or must keep naming their own target.
const UNSUPPORTED = new Set(["init", "serve", "backend", "connections", "project", "identity", "extensions", "feedback", "version", "help", "instructions", "agent-hint", "brains"]);
const SELECTOR = /^--(?:root|target-url|remote-url)(?:=|$)/u;

function brainTokens(argv: string[]): { index: number; width: number; value: string | undefined }[] {
  const found = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!;
    if (token === "--brain") { const next = argv[index + 1]; found.push({ index, width: next === undefined || next.startsWith("--") ? 1 : 2, value: next === undefined || next.startsWith("--") ? undefined : next }); }
    else if (token.startsWith("--brain=")) found.push({ index, width: 1, value: token.slice("--brain=".length) });
  }
  return found;
}

export const brainRequested = (argv: string[]) => brainTokens(argv).length > 0;

/** argv without any --brain selector, for classifying a failed invocation. */
export function withoutBrainArgv(argv: string[]): string[] {
  const tokens = brainTokens(argv);
  return argv.filter((_, index) => !tokens.some(token => index >= token.index && index < token.index + token.width));
}

/** `--brain <name>` → the brain's --root/--target-url, so commands keep their own validation and policy. Fails before credential/network work. */
export function expandBrainSelector(argv: string[], options: BrainsFileOptions = {}): { argv: string[]; brain?: NamedBrain } {
  const tokens = brainTokens(argv);
  if (!tokens.length) return { argv };
  if (tokens.length > 1) throw new Error("--brain must not be repeated.");
  const { index, width, value } = tokens[0]!;
  if (value === undefined || !value.trim()) throw new Error("--brain requires a name. See: jumpybrain brains list");
  const rest = [...argv.slice(0, index), ...argv.slice(index + width)];
  // Normally the command leads; legacy spelling may put flags first.
  const positionals = rest[0] !== undefined && !rest[0].startsWith("-") ? rest : rest.filter(token => !token.startsWith("-"));
  const command = positionals[0] ?? "";
  const sub = positionals[1] ?? "";
  const crossTarget = command === "diff" || (command === "migrate" && sub === "remote");
  const installUpdate = command === "update" && !rest.some(token => /^--(?:id|if-match)(?:=|$)/u.test(token));
  if (!command || UNSUPPORTED.has(command) || (command === "migrate" && !crossTarget) || installUpdate) {
    throw new Error(`--brain is not supported by jumpybrain ${command || "without a command"}${command === "init" || command === "serve" || command === "backend" || command === "migrate" ? "; name the folder with --root" : ""}.`);
  }
  const conflicting = rest.filter(token => SELECTOR.test(token) && !(crossTarget && /^--root(?:=|$)/u.test(token)));
  if (conflicting.length) {
    throw new Error(crossTarget
      ? `Use only one server selector: --brain, --target-url or --remote-url. jumpybrain ${command === "diff" ? "diff" : "migrate remote"} takes --root <local-brain> --brain <remote-name>.`
      : "Use only one target selector: --brain, --root, --target-url or --remote-url.");
  }
  if (crossTarget && !rest.some(token => /^--root(?:=|$)/u.test(token))) {
    throw new Error(`jumpybrain ${command === "diff" ? "diff" : "migrate remote"} needs --root <local-brain> --brain <remote-name>.`);
  }
  const brain = findBrain(value.trim(), options);
  if (crossTarget && brain.kind !== "remote") throw new Error(`Brain ${JSON.stringify(brain.name)} is a local folder; jumpybrain ${command === "diff" ? "diff" : "migrate remote"} needs --root <local-brain> --brain <remote-name>.`);
  if (command === "doctor" && brain.kind !== "local") throw new Error(`doctor checks local brains only; brain ${JSON.stringify(brain.name)} is hosted. Use: jumpybrain status --brain ${brain.name}`);
  if (command === "smart-search" && brain.kind !== "local") throw new Error(`smart-search runs on the computer that holds the brain; brain ${JSON.stringify(brain.name)} is hosted.`);
  if (brain.kind === "local") {
    let directory = false;
    try { directory = statSync(brain.root).isDirectory(); } catch {}
    if (!directory) throw new Error(`Brain ${JSON.stringify(brain.name)} points at ${JSON.stringify(brain.root)}, which is missing or not a folder. Restore the folder, or re-add it: jumpybrain brains remove ${brain.name}, then jumpybrain brains add ${brain.name} --root <folder>.`);
  }
  const replacement = brain.kind === "local" ? ["--root", brain.root] : ["--target-url", brain.url];
  return { argv: [...argv.slice(0, index), ...replacement, ...argv.slice(index + width)], brain };
}
