import { randomBytes, randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, open, readFile, realpath, rename, rmdir, unlink } from "node:fs/promises";
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
/** Names another variable in the same file that holds the key, instead of a second copy. */
export const keyReferenceVariable = (reference: string) => "JUMPYBRAIN_KEYREF_" + referenceSuffix(reference);
// New app connections do not reference CLI-managed variables. An older
// app's reference is honored only for the exact URL bound to that key.
const MANAGED = /^JUMPYBRAIN_(?:KEY|URL|KEYREF|BRAIN_KEY|BRAIN_URL)_/;

/** A connection's key by suffix: its own copy, else the variable its reference names. */
function connectionKey(values: Map<string, string>, suffix: string): { key: string; variable: string } | undefined {
  const own = values.get("JUMPYBRAIN_KEY_" + suffix)?.trim();
  if (own) return { key: own, variable: "JUMPYBRAIN_KEY_" + suffix };
  const target = values.get("JUMPYBRAIN_KEYREF_" + suffix)?.trim();
  if (!target || !NAME.test(target)) return;
  if (MANAGED.test(target)) {
    const brain = /^JUMPYBRAIN_BRAIN_KEY_([A-Z0-9_]+)$/u.exec(target)?.[1];
    if (!brain || !sameDestination(values.get("JUMPYBRAIN_BRAIN_URL_" + brain) ?? "", values.get("JUMPYBRAIN_URL_" + suffix) ?? "")) return;
  }
  const referenced = values.get(target)?.trim();
  return referenced ? { key: referenced, variable: target } : undefined;
}

/** An unmanaged variable already holding exactly this key; JUMPYBRAIN_API_KEY first. */
function existingKeyVariable(values: Map<string, string>, key: string): string | undefined {
  if (values.get("JUMPYBRAIN_API_KEY") === key) return "JUMPYBRAIN_API_KEY";
  for (const [name, value] of values) if (!MANAGED.test(name) && value === key) return name;
  return undefined;
}

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

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; } };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Cross-process lock for read-modify-write of the key file, shared by the app
 * gateway and every CLI process, so concurrent writers never drop each other's
 * lines. Same scheme as the access-control state lock (an infrastructure
 * adapter cannot import it): a complete PID/nonce candidate is published with an
 * exclusive hard link, and only a lock whose owner is confirmed dead is reaped.
 */
async function withEnvFileLock<T>(file: string, operation: () => Promise<T>): Promise<T> {
  let target = file;
  try { if ((await lstat(file)).isSymbolicLink()) target = await realpath(file); } catch {}
  const directory = path.dirname(target), base = path.basename(target);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, base + ".lock");
  const owner = { pid: process.pid, nonce: randomUUID() };
  const candidate = path.join(directory, `${base}.${owner.nonce}.candidate`);
  const handle = await open(candidate, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(owner)); await handle.sync(); } finally { await handle.close(); }
  const deadline = Date.now() + 10000;
  try {
    for (;;) {
      try { await link(candidate, lock); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new CredentialFileError("credential_file_unreadable", `${displayPath(file)} is busy (another jumpyBrain process is saving keys); no change was made. Retry, or remove ${displayPath(lock)} if no jumpyBrain process is running.`);
        try {
          const before = await lstat(lock);
          if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) !== 0 || before.size > 1024) throw new Error();
          const previous = JSON.parse(await readFile(lock, "utf8"));
          if (Number.isSafeInteger(previous.pid) && previous.pid > 0 && /^[a-f0-9-]{36}$/.test(previous.nonce) && !alive(previous.pid)) {
            const guard = `${lock}.reap.${previous.nonce}`;
            await mkdir(guard, { mode: 0o700 });
            try {
              const current = JSON.parse(await readFile(lock, "utf8"));
              if (current.nonce === previous.nonce && !alive(current.pid)) await unlink(lock);
            } finally { await rmdir(guard).catch(() => {}); }
          }
        } catch { /* unknown or live owner: wait */ }
        await pause(10 + Math.floor(Math.random() * 10));
      }
    }
  } finally { await unlink(candidate).catch(() => {}); }
  try { return await operation(); }
  finally { try { if (JSON.parse(await readFile(lock, "utf8")).nonce === owner.nonce) await unlink(lock); } catch {} }
}

/** Rewrites only the named variables (null removes), preserving every other line and comment. */
function updateEnvFile(file: string, changes: Map<string, string | null>): Promise<void> {
  return withEnvFileLock(file, () => rewriteEnvFile(file, changes));
}

async function rewriteEnvFile(file: string, changes: Map<string, string | null>): Promise<void> {
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

/** Credential adapter for the companion gateway: `get`/`set`/`delete` by connection reference. */
export function createEnvFileCredentials(options: EnvFileOptions = {}) {
  const file = credentialsEnvFile(options);
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => { const run = tail.then(task, task); tail = run.catch(() => {}); return run; };
  const update = (changes: Map<string, string | null>) => updateEnvFile(file, changes);
  return {
    file,
    async get(reference: string): Promise<string | null> {
      const values = await readCredentialsFile(file);
      return values ? connectionKey(values, referenceSuffix(reference))?.key ?? null : null;
    },
    /**
     * Saves a connection's key. When an unmanaged variable in the file (such as
     * JUMPYBRAIN_API_KEY) already holds exactly this key, the connection stores
     * a reference to that variable instead of a second copy of the secret.
     */
    set(reference: string, key: string, meta: { url?: string } = {}): Promise<void> {
      if (!validValue(key, 8192)) return Promise.reject(new CredentialFileError("credential_file_invalid", "Invalid access key."));
      if (meta.url !== undefined && !validValue(meta.url, 2048)) return Promise.reject(new CredentialFileError("credential_file_invalid", "Invalid connection URL."));
      // Choose copy vs reference under the same cross-process lock as the write.
      return serial(() => withEnvFileLock(file, async () => {
        let values: Map<string, string> | null = null;
        try { values = await readCredentialsFile(file, { lenient: true }); } catch { /* the rewrite reports the file problem */ }
        const existing = values ? existingKeyVariable(values, key) : undefined;
        await rewriteEnvFile(file, new Map<string, string | null>([
          [keyVariable(reference), existing ? null : key],
          [keyReferenceVariable(reference), existing ?? null],
          ...(meta.url ? [[urlVariable(reference), meta.url] as [string, string]] : []),
        ]));
      }));
    },
    delete(reference: string): Promise<void> {
      return serial(async () => {
        if (await readCredentialsFile(file, { lenient: true }) === null) return;
        await update(new Map([[keyVariable(reference), null], [keyReferenceVariable(reference), null], [urlVariable(reference), null]]));
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
export type RemoteKeySource = "environment" | "app-connection" | "env-file" | "brain-environment" | "brain-env-file";
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
    const found = connectionKey(values, name.slice("JUMPYBRAIN_URL_".length));
    if (found) { keys.push({ source: "app-connection", ...found, file: displayPath(file) }); break; }
  }
  const fallback = values.get("JUMPYBRAIN_API_KEY")?.trim();
  // A connection that references JUMPYBRAIN_API_KEY already lists that key.
  if (fallback && !keys.some(entry => entry.variable === "JUMPYBRAIN_API_KEY")) keys.push({ source: "env-file", key: fallback, variable: "JUMPYBRAIN_API_KEY", file: displayPath(file) });
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
 * as `fileProblem` (its message names the file, never a key) with its code.
 */
export async function remoteKeyCandidates(url: string, options: EnvFileOptions = {}): Promise<{ keys: RemoteKey[]; fileProblem?: string; fileProblemCode?: CredentialFileError["code"] }> {
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
    return error instanceof CredentialFileError ? { keys, fileProblem: error.message, fileProblemCode: error.code }
      : { keys, fileProblem: `Cannot read ${displayPath(file)}.`, fileProblemCode: "credential_file_unreadable" };
  }
}

/**
 * A non-secret way to tell keys apart: the length, plus the last four
 * characters only when the key is long enough (16+) that they reveal little.
 */
export function keyFingerprint(key: string): { length: number; last4?: string } {
  return key.length >= 16 ? { length: key.length, last4: key.slice(-4) } : { length: key.length };
}

// Named CLI brains (`--brain <name>`). A named remote brain only ever uses a key
// bound to its destination: the pair JUMPYBRAIN_BRAIN_KEY_<NAME> +
// JUMPYBRAIN_BRAIN_URL_<NAME> (environment, then the key file) whose URL is the
// brain's URL, else the key the app saved for that exact URL. A pair whose URL
// differs (a name re-pointed elsewhere, a half-finished change) is never sent.
// The generic JUMPYBRAIN_API_KEY is never sent to a named brain.

const BRAIN_NAME = /^[a-z][a-z0-9-]{0,31}$/;

function brainSuffix(name: string): string {
  if (!BRAIN_NAME.test(name)) throw new CredentialFileError("credential_file_invalid", "Invalid brain name.");
  return name.toUpperCase().replace(/-/g, "_");
}
/** `product-it` → `JUMPYBRAIN_BRAIN_KEY_PRODUCT_IT`. Names have no `_`, so the mapping is one-to-one. */
export const brainKeyVariable = (name: string) => "JUMPYBRAIN_BRAIN_KEY_" + brainSuffix(name);
/** The destination the key with the same suffix is bound to. */
export const brainUrlVariable = (name: string) => "JUMPYBRAIN_BRAIN_URL_" + brainSuffix(name);

/** A key pair for a named brain that exists but names another destination (or none). */
export class BrainKeyBindingError extends Error {
  readonly code = "credential_binding_mismatch";
  constructor(message: string) { super(message); this.name = "BrainKeyBindingError"; }
}

type PairSource = { source: "brain-environment" | "brain-env-file"; values: { get(name: string): string | undefined }; file?: string };

function brainPair(from: PairSource, name: string, url: string): { key?: RemoteKey; mismatch?: string } {
  const variable = brainKeyVariable(name), urlVariable = brainUrlVariable(name);
  const key = from.values.get(variable)?.trim();
  if (!key) return {};
  const bound = from.values.get(urlVariable)?.trim();
  const where = from.source === "brain-environment" ? "the environment" : displayPath(from.file!);
  if (!bound) return { mismatch: `${variable} in ${where} has no ${urlVariable}, so it is not bound to a server and was not sent` };
  if (!sameDestination(bound, url)) return { mismatch: `${variable} in ${where} is bound to another server (${urlVariable}), so it was not sent to this one` };
  return { key: { source: from.source, key, variable, ...(from.file ? { file: displayPath(from.file) } : {}) } };
}

function brainKeys(values: Map<string, string> | null, name: string, url: string, file: string, env: NodeJS.ProcessEnv): { keys: RemoteKey[]; mismatches: string[]; blocked?: boolean } {
  const keys: RemoteKey[] = [], mismatches: string[] = [];
  const sources: PairSource[] = [{ source: "brain-environment", values: { get: (key: string) => env[key] } }];
  if (values) sources.push({ source: "brain-env-file", values, file });
  for (const from of sources) {
    const pair = brainPair(from, name, url);
    if (pair.key) keys.push(pair.key);
    if (pair.mismatch) mismatches.push(pair.mismatch);
    // An explicit environment pair bound elsewhere stops resolution (as in
    // resolveBrainKey): no lower key is used, listed as usable or probed.
    if (from.source === "brain-environment" && pair.mismatch) return { keys: [], mismatches, blocked: true };
  }
  if (values) keys.push(...fileKeys(values, url, file).filter(entry => entry.source === "app-connection"));
  return { keys, mismatches };
}

/**
 * The key for named brain `name` at `url`: a destination-bound
 * JUMPYBRAIN_BRAIN_KEY_/URL_<NAME> pair from the environment, else from the key
 * file, else the app's key for this exact URL. Never JUMPYBRAIN_API_KEY.
 * An environment key bound elsewhere is an error, not a silent fallback.
 */
export async function resolveBrainKey(name: string, url: string, options: EnvFileOptions = {}): Promise<RemoteKey | null> {
  const env = options.env ?? process.env;
  const direct = brainPair({ source: "brain-environment", values: { get: (key: string) => env[key] } }, name, url);
  if (direct.key) return direct.key;
  if (direct.mismatch) throw new BrainKeyBindingError(direct.mismatch);
  const file = credentialsEnvFile(options);
  const { keys, mismatches } = brainKeys(await readCredentialsFile(file), name, url, file, {});
  if (!keys.length && mismatches.length) throw new BrainKeyBindingError(mismatches.join("; "));
  return keys[0] ?? null;
}

/** Every key named brain `name` could use, in order, for diagnostics. Never throws for file problems. */
export async function brainKeyCandidates(name: string, url: string, options: EnvFileOptions = {}): Promise<{ keys: RemoteKey[]; mismatches: string[]; blocked?: boolean; fileProblem?: string; fileProblemCode?: CredentialFileError["code"] }> {
  const env = options.env ?? process.env;
  const file = credentialsEnvFile(options);
  try { return brainKeys(await readCredentialsFile(file), name, url, file, env); }
  catch (error) {
    const found = brainKeys(null, name, url, file, env);
    return error instanceof CredentialFileError ? { ...found, fileProblem: error.message, fileProblemCode: error.code }
      : { ...found, fileProblem: `Cannot read ${displayPath(file)}.`, fileProblemCode: "credential_file_unreadable" };
  }
}

/**
 * Saves a named brain's key together with the URL it is bound to, in one atomic
 * write; `null` removes the pair. The file stays 0600.
 */
export async function setBrainKey(name: string, binding: { key: string; url: string } | null, options: EnvFileOptions = {}): Promise<void> {
  const variable = brainKeyVariable(name), urlVariable = brainUrlVariable(name);
  if (binding && !validValue(binding.key, 8192)) throw new CredentialFileError("credential_file_invalid", "Invalid access key.");
  if (binding && !validValue(binding.url, 2048)) throw new CredentialFileError("credential_file_invalid", "Invalid brain URL.");
  const file = credentialsEnvFile(options);
  await withEnvFileLock(file, async () => {
    const entries = await readCredentialsFile(file, { lenient: true });
    if (!binding && entries === null) return;
    const changes = new Map([[variable, binding?.key ?? null], [urlVariable, binding?.url ?? null]]);
    const prior = entries?.get(variable);
    if (entries && prior && prior !== binding?.key) {
      // An older app can reference this variable. Keep its existing key when
      // a newer CLI rotates or removes the named key.
      for (const [reference, value] of entries) {
        const suffix = /^JUMPYBRAIN_KEYREF_([A-Z0-9_]+)$/u.exec(reference)?.[1];
        if (!suffix || value !== variable) continue;
        const appKey = "JUMPYBRAIN_KEY_" + suffix;
        if (!entries.get(appKey)?.trim() &&
            sameDestination(entries.get(urlVariable) ?? "", entries.get("JUMPYBRAIN_URL_" + suffix) ?? "")) changes.set(appKey, prior);
        changes.set(reference, null);
      }
    }
    await rewriteEnvFile(file, changes);
  });
}
