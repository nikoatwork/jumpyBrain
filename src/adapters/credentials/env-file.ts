import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Remote access keys live in one owner-only .env file shared by the Mac app
// and the CLI. The app writes a key/URL pair per remote connection; the CLI
// matches its --target-url against those URLs. Key values never appear in
// errors, logs or diagnostics: messages name the file, never its content.

export const DEFAULT_ENV_FILE_DISPLAY = "~/.config/jumpybrain/.env";
const HEADER = "# jumpyBrain remote access keys. Owner-only (chmod 600). Managed by the jumpyBrain app; hand edits are fine.";
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REFERENCE = /^jumpybrain-companion:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const MAX_FILE = 262144;

export class CredentialFileError extends Error {
  readonly code: "credential_file_insecure" | "credential_file_unreadable" | "credential_file_invalid";
  constructor(code: CredentialFileError["code"], message: string) { super(message); this.code = code; this.name = "CredentialFileError"; }
}

export interface EnvFileOptions { file?: string; env?: NodeJS.ProcessEnv; home?: string }

/** The app always uses the default path; JUMPYBRAIN_ENV_FILE is for the CLI and tests. */
export function credentialsEnvFile({ file, env = process.env, home = os.homedir() }: EnvFileOptions = {}): string {
  if (file) return path.resolve(file);
  const override = env.JUMPYBRAIN_ENV_FILE?.trim();
  return override ? path.resolve(override) : path.join(home, ".config", "jumpybrain", ".env");
}

function displayPath(file: string, home = os.homedir()): string {
  return file === path.join(home, ".config", "jumpybrain", ".env") ? DEFAULT_ENV_FILE_DISPLAY
    : file.startsWith(home + path.sep) ? "~" + file.slice(home.length) : file;
}

/** The key file the CLI reads, as shown to users (home as `~`). */
export const credentialsEnvFileDisplay = (options: EnvFileOptions = {}) => displayPath(credentialsEnvFile(options), options.home);

/** `jumpybrain-companion:<uuid>` → `<UUID_WITH_UNDERSCORES>` (env names cannot hold `-` or `:`). */
export function referenceSuffix(reference: string): string {
  const match = REFERENCE.exec(reference);
  if (!match) throw new CredentialFileError("credential_file_invalid", "Invalid connection credential reference.");
  return match[1].toUpperCase().replace(/-/g, "_");
}
export const keyVariable = (reference: string) => "JUMPYBRAIN_KEY_" + referenceSuffix(reference);
export const urlVariable = (reference: string) => "JUMPYBRAIN_URL_" + referenceSuffix(reference);

type Line = { raw: string; name?: string; value?: string };

function unquote(rest: string): string | undefined {
  const text = rest.trim();
  if (text.startsWith('"')) {
    let out = "";
    for (let index = 1; index < text.length; index++) {
      const char = text[index];
      if (char === "\\" && index + 1 < text.length) { const next = text[++index]; out += next === "n" ? "\n" : next; continue; }
      if (char === '"') return /^\s*(#.*)?$/.test(text.slice(index + 1)) ? out : undefined;
      out += char;
    }
    return undefined;
  }
  if (text.startsWith("'")) {
    const end = text.indexOf("'", 1);
    return end > 0 && /^\s*(#.*)?$/.test(text.slice(end + 1)) ? text.slice(1, end) : undefined;
  }
  return text.replace(/\s+#.*$/, "");
}

export function parseEnv(text: string): Line[] {
  return text.split(/\r?\n/).map((raw) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(raw);
    if (!match || /^\s*#/.test(raw)) return { raw };
    const value = unquote(match[2]);
    return value === undefined ? { raw } : { raw, name: match[1], value };
  });
}

function serialize(name: string, value: string): string {
  if (!NAME.test(name)) throw new CredentialFileError("credential_file_invalid", "Invalid variable name.");
  return /^[A-Za-z0-9_\-.:/+=~@]+$/.test(value) ? `${name}=${value}` : `${name}="${value.replace(/[\\"]/g, "\\$&")}"`;
}

function validValue(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Reads the file; `null` when it does not exist. Refuses files other users can read or own. */
export async function readCredentialsFile(file: string, { lenient = false } = {}): Promise<Map<string, string> | null> {
  let info;
  try { info = await lstat(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new CredentialFileError("credential_file_unreadable", `Cannot read ${displayPath(file)}.`);
  }
  if (info.isSymbolicLink()) {
    try { file = await realpath(file); info = await lstat(file); }
    catch { throw new CredentialFileError("credential_file_unreadable", `Cannot read ${displayPath(file)}.`); }
  }
  if (!info.isFile() || info.size > MAX_FILE) throw new CredentialFileError("credential_file_unreadable", `${displayPath(file)} is not a regular key file.`);
  if (!lenient && ((info.mode & 0o077) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid()))) {
    throw new CredentialFileError("credential_file_insecure", `${displayPath(file)} must be private to you. Run: chmod 600 ${displayPath(file)}`);
  }
  let text;
  try { text = await readFile(file, "utf8"); }
  catch { throw new CredentialFileError("credential_file_unreadable", `Cannot read ${displayPath(file)}.`); }
  const values = new Map<string, string>();
  for (const line of parseEnv(text)) if (line.name) values.set(line.name, line.value!);
  return values;
}

async function writeAtomically(file: string, text: string): Promise<void> {
  let target = file;
  try { if ((await lstat(file)).isSymbolicLink()) target = await realpath(file); } catch {}
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.env.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(text, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await chmod(temporary, 0o600); await rename(temporary, target); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

/** Credential adapter for the companion gateway: `get`/`set`/`delete` by connection reference. */
export function createEnvFileCredentials(options: EnvFileOptions = {}) {
  const file = credentialsEnvFile(options);
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => { const run = tail.then(task, task); tail = run.catch(() => {}); return run; };
  async function update(changes: Map<string, string | null>): Promise<void> {
    let text = "";
    try { text = (await readCredentialsFile(file, { lenient: true })) === null ? "" : await readFile(file, "utf8"); }
    catch (error) { throw error instanceof CredentialFileError ? error : new CredentialFileError("credential_file_unreadable", `Cannot read ${displayPath(file)}.`); }
    const pending = new Map(changes);
    const lines: string[] = [];
    for (const line of text ? parseEnv(text.replace(/\r?\n$/, "")) : []) {
      if (line.name && pending.has(line.name)) {
        const value = pending.get(line.name);
        pending.delete(line.name);
        if (value !== null && value !== undefined) lines.push(serialize(line.name, value));
        continue;
      }
      if (line.name && changes.has(line.name)) continue; // drop duplicate definitions of a changed name
      lines.push(line.raw);
    }
    if (!lines.length || !lines[0].startsWith("# jumpyBrain")) lines.unshift(HEADER);
    for (const [name, value] of pending) if (value !== null) lines.push(serialize(name, value));
    try { await writeAtomically(file, lines.join("\n") + "\n"); }
    catch { throw new CredentialFileError("credential_file_unreadable", `Cannot write ${displayPath(file)}.`); }
  }
  return {
    file,
    async get(reference: string): Promise<string | null> {
      const values = await readCredentialsFile(file);
      return values?.get(keyVariable(reference)) || null;
    },
    set(reference: string, key: string, meta: { url?: string } = {}): Promise<void> {
      if (!validValue(key, 8192)) return Promise.reject(new CredentialFileError("credential_file_invalid", "Invalid access key."));
      if (meta.url !== undefined && !validValue(meta.url, 2048)) return Promise.reject(new CredentialFileError("credential_file_invalid", "Invalid connection URL."));
      return serial(() => update(new Map([[keyVariable(reference), key], ...(meta.url ? [[urlVariable(reference), meta.url] as [string, string]] : [])])));
    },
    delete(reference: string): Promise<void> {
      return serial(async () => {
        if (await readCredentialsFile(file, { lenient: true }) === null) return;
        await update(new Map([[keyVariable(reference), null], [urlVariable(reference), null]]));
      });
    },
  };
}

const sameDestination = (left: string, right: string) => {
  try {
    const a = new URL(left), b = new URL(right);
    return a.origin === b.origin && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
  } catch { return false; }
};

/** Where the CLI found a remote key, in precedence order. */
export type RemoteKeySource = "environment" | "app-connection" | "env-file";
export interface RemoteKey {
  source: RemoteKeySource;
  /** The secret. Callers must never print it; use `keyFingerprint`. */
  key: string;
  /** Variable that held the key (the app's is `JUMPYBRAIN_KEY_<REF>`). */
  variable: string;
  /** Key file as shown to users (home as `~`); absent for the environment. */
  file?: string;
}

function fileKeys(values: Map<string, string>, url: string, file: string): RemoteKey[] {
  const keys: RemoteKey[] = [];
  for (const [name, value] of values) {
    if (!name.startsWith("JUMPYBRAIN_URL_") || !sameDestination(value, url)) continue;
    const variable = "JUMPYBRAIN_KEY_" + name.slice("JUMPYBRAIN_URL_".length);
    const key = values.get(variable)?.trim();
    if (key) { keys.push({ source: "app-connection", key, variable, file: displayPath(file) }); break; }
  }
  const fallback = values.get("JUMPYBRAIN_API_KEY")?.trim();
  if (fallback) keys.push({ source: "env-file", key: fallback, variable: "JUMPYBRAIN_API_KEY", file: displayPath(file) });
  return keys;
}

/**
 * CLI remote key: JUMPYBRAIN_API_KEY from the process environment, then the
 * key the app saved for this exact URL, then JUMPYBRAIN_API_KEY in the file.
 * The file is not read when the environment supplies a key.
 */
export async function resolveRemoteKey(url: string, options: EnvFileOptions = {}): Promise<RemoteKey | null> {
  const env = options.env ?? process.env;
  const direct = env.JUMPYBRAIN_API_KEY?.trim();
  if (direct) return { source: "environment", key: direct, variable: "JUMPYBRAIN_API_KEY" };
  const file = credentialsEnvFile(options);
  const values = await readCredentialsFile(file);
  return values ? fileKeys(values, url, file)[0] ?? null : null;
}

export async function remoteKeyForUrl(url: string, options: EnvFileOptions = {}): Promise<string | null> {
  return (await resolveRemoteKey(url, options))?.key ?? null;
}

/**
 * Every key the CLI could use for `url`, in precedence order, for diagnostics
 * after a rejection. Never throws: an unreadable or insecure file is reported
 * as `fileProblem` (its message names the file, never a key).
 */
export async function remoteKeyCandidates(url: string, options: EnvFileOptions = {}): Promise<{ keys: RemoteKey[]; fileProblem?: string }> {
  const env = options.env ?? process.env;
  const keys: RemoteKey[] = [];
  const direct = env.JUMPYBRAIN_API_KEY?.trim();
  if (direct) keys.push({ source: "environment", key: direct, variable: "JUMPYBRAIN_API_KEY" });
  const file = credentialsEnvFile(options);
  try {
    const values = await readCredentialsFile(file);
    if (values) keys.push(...fileKeys(values, url, file));
    return { keys };
  } catch (error) {
    return { keys, fileProblem: error instanceof CredentialFileError ? error.message : `Cannot read ${displayPath(file)}.` };
  }
}

/**
 * A non-secret way to tell keys apart: the length, plus the last four
 * characters only when the key is long enough (16+) that they reveal little.
 */
export function keyFingerprint(key: string): { length: number; last4?: string } {
  return key.length >= 16 ? { length: key.length, last4: key.slice(-4) } : { length: key.length };
}
