// Companion-only metadata. No CLI configuration, memory writes, or plaintext key storage.
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const FILE = "connections.json";
const MAX_BYTES = 128 * 1024;
const MAX_PROFILES = 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^jumpybrain-companion:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const queues = new Map();
const storeToken = Symbol("ConnectionStore");
const messages = {
  INVALID_INPUT: "Invalid connection details.",
  INVALID_ROOT: "Choose an existing memory folder with a regular jumpybrain.json file.",
  INVALID_URL: "Use an HTTPS origin, or an HTTP loopback origin, without credentials, paths, query, or fragment.",
  DUPLICATE_DESTINATION: "A connection already uses this destination.",
  PROFILE_LIMIT: "The connection limit has been reached.",
  NOT_FOUND: "Connection not found.",
  ACTIVE_PROFILE: "Switch away from the active connection before removing it.",
  REVISION_CONFLICT: "Connections changed. Reload before saving.",
  INVALID_STATE: "Connections data is invalid. Restore a valid private backup; it was not replaced.",
  UNSAFE_STORAGE: "Connections storage must be private, owned, and free of symbolic or hard links.",
  PERSISTENCE_FAILED: "Could not persist connections. No connection change was committed.",
  CREDENTIALS_UNAVAILABLE: "Credential storage is unavailable or access was denied.",
  MISSING_CREDENTIAL: "The remote credential is missing. Enter its API key again.",
};
class ConnectionError extends Error {
  constructor(code) { super(messages[code]); this.name = "ConnectionError"; this.code = code; }
}
const fail = (code) => { throw new ConnectionError(code); };
const clone = (value) => structuredClone(value);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const validKey = (value) => text(value, 4096) && value.trim().length > 0;
const fields = (value, allowed) => object(value) && Object.keys(value).every((key) => allowed.includes(key));
const absolute = (value) => text(value, 4096) && path.isAbsolute(value) && path.resolve(value) === value;
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const owner = (info) => typeof process.getuid === "function" && info.uid === process.getuid();

function serial(directory, operation) {
  const previous = queues.get(directory) || Promise.resolve();
  const result = previous.then(operation);
  const tail = result.catch(() => {});
  queues.set(directory, tail);
  void tail.then(() => { if (queues.get(directory) === tail) queues.delete(directory); });
  return result;
}
async function guarded(operation) {
  try { return await operation(); }
  catch (error) { if (error instanceof ConnectionError) throw error; fail("PERSISTENCE_FAILED"); }
}

// Check every component before creating missing directories. Never repair unsafe permissions.
async function storageDirectory(directory, create = false) {
  const components = directory.slice(path.parse(directory).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(directory).root;
  let info;
  for (let i = -1; i < components.length; i++) {
    if (i >= 0) current = path.join(current, components[i]);
    try { info = await lstat(current); }
    catch (error) {
      if (!create || error.code !== "ENOENT") throw error;
      try { await mkdir(current, { mode: 0o700 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      info = await lstat(current);
    }
    const final = current === directory;
    const trustedSticky = info.uid === 0 && (info.mode & 0o1000) !== 0;
    if (!info.isDirectory() || info.isSymbolicLink() || (!owner(info) && info.uid !== 0)
      || ((info.mode & 0o022) && !trustedSticky)
      || (final && (!owner(info) || (info.mode & 0o777) !== 0o700))) fail("UNSAFE_STORAGE");
  }
  return info;
}
function privateFile(info) {
  if (!info.isFile() || info.nlink !== 1 || !owner(info) || (info.mode & 0o777) !== 0o600) fail("UNSAFE_STORAGE");
}
async function readState(directory) {
  const filename = path.join(directory, FILE);
  let before;
  try { before = await lstat(filename); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  privateFile(before);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    privateFile(info);
    if (!sameFile(before, info)) fail("UNSAFE_STORAGE");
    if (info.size > MAX_BYTES) fail("INVALID_STATE");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_BYTES) fail("INVALID_STATE");
    let state;
    try { state = JSON.parse(buffer.subarray(0, size).toString("utf8")); }
    catch { fail("INVALID_STATE"); }
    validateState(state);
    const roots = new Set();
    for (const profile of state.profiles.filter((item) => item.kind === "local")) {
      const root = await realpath(profile.root).catch(() => profile.root);
      if (roots.has(root)) fail("INVALID_STATE");
      roots.add(root);
    }
    return state;
  } finally { await handle.close(); }
}

function remoteOrigin(value) {
  if (!text(value, 2048) || /[\s\\]/.test(value)) fail("INVALID_URL");
  const match = /^(https?):\/\/([^/?#]+)\/?$/i.exec(value);
  if (!match || /[@%]/.test(match[2])) fail("INVALID_URL");
  let url;
  try { url = new URL(value); } catch { fail("INVALID_URL"); }
  const authorityHost = match[2].startsWith("[")
    ? match[2].slice(0, match[2].indexOf("]") + 1).toLowerCase()
    : match[2].split(":")[0].toLowerCase();
  if (url.protocol !== "https:" && !(url.protocol === "http:"
    && ["127.0.0.1", "localhost", "[::1]"].includes(authorityHost))) fail("INVALID_URL");
  if (!url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== "/") fail("INVALID_URL");
  return url.origin;
}
function validateState(state) {
  const invalid = () => fail("INVALID_STATE");
  if (!fields(state, ["version", "revision", "activeId", "profiles"]) || Object.keys(state).length !== 4
    || state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0
    || !Array.isArray(state.profiles) || state.profiles.length > MAX_PROFILES) invalid();
  const ids = new Set(), destinations = new Set(), references = new Set();
  for (const profile of state.profiles) {
    if (!fields(profile, ["id", "name", "kind", "root", "url", "credentialRef", "allowWrites"])
      || typeof profile.id !== "string" || !UUID.test(profile.id) || ids.has(profile.id) || !text(profile.name, 128)
      || profile.name !== profile.name.trim() || typeof profile.allowWrites !== "boolean") invalid();
    let destination;
    if (profile.kind === "local") {
      if (Object.keys(profile).length !== 5 || !absolute(profile.root) || "url" in profile || "credentialRef" in profile) invalid();
      destination = `local:${profile.root}`;
    } else if (profile.kind === "remote") {
      if (Object.keys(profile).length !== 6 || "root" in profile || typeof profile.credentialRef !== "string"
        || !REFERENCE.test(profile.credentialRef) || references.has(profile.credentialRef)) invalid();
      try { if (remoteOrigin(profile.url) !== profile.url) invalid(); } catch { invalid(); }
      destination = `remote:${profile.url}`;
      references.add(profile.credentialRef);
    } else invalid();
    if (destinations.has(destination)) invalid();
    destinations.add(destination); ids.add(profile.id);
  }
  if (state.profiles.length ? !ids.has(state.activeId) : state.activeId !== null) invalid();
  return state;
}
async function localRoot(value, offlineSeed = false) {
  if (!text(value, 4096) || !path.isAbsolute(value)) fail("INVALID_ROOT");
  const normalized = path.resolve(value);
  let root;
  try { root = await realpath(normalized); }
  catch (error) {
    if (offlineSeed && ["ENOENT", "ENOTDIR"].includes(error.code)) return normalized;
    fail("INVALID_ROOT");
  }
  // Migration preserves even an existing-but-unavailable configured root. It
  // must not prevent opening Settings; ordinary additions still validate it.
  if (offlineSeed) return root;
  try {
    const folder = await lstat(root);
    const marker = await lstat(path.join(root, "jumpybrain.json"));
    if (!folder.isDirectory() || !marker.isFile() || marker.nlink !== 1) fail("INVALID_ROOT");
  } catch { fail("INVALID_ROOT"); }
  return root;
}

export class ConnectionStore {
  #directory; #directoryInfo; #credentials; #state;
  constructor(token, directory, directoryInfo, credentials, state) {
    if (token !== storeToken) fail("INVALID_INPUT");
    this.#directory = directory; this.#directoryInfo = directoryInfo;
    this.#credentials = credentials; this.#state = state;
  }
  static async open({ directory, initialRoot, credentials } = {}) {
    return guarded(async () => {
      if (!text(directory, 4096) || !path.isAbsolute(directory)) fail("INVALID_INPUT");
      directory = path.resolve(directory);
      return serial(directory, async () => {
        const info = await storageDirectory(directory, true);
        let state = await readState(directory);
        const store = new ConnectionStore(storeToken, directory, info, credentials, state);
        if (!state) {
          state = { version: 1, revision: 0, activeId: null, profiles: [] };
          if (initialRoot !== undefined) {
            const root = await localRoot(initialRoot, true);
            const id = randomUUID();
            state.profiles.push({ id, name: "Local brain", kind: "local", root, allowWrites: true });
            state.activeId = id;
          }
          await store.#persist(state, null);
          store.#state = state;
        }
        return store;
      });
    });
  }
  snapshot() { return clone(this.#state); }
  get(id) { return clone(this.#state.profiles.find((profile) => profile.id === id)); }

  async #checkDirectory() {
    const info = await storageDirectory(this.#directory);
    if (!sameFile(info, this.#directoryInfo)) fail("UNSAFE_STORAGE");
  }
  async #current(expectedRevision) {
    await this.#checkDirectory();
    const disk = await readState(this.#directory);
    if (!disk || JSON.stringify(disk) !== JSON.stringify(this.#state)
      || (expectedRevision !== undefined && expectedRevision !== this.#state.revision)) fail("REVISION_CONFLICT");
    return clone(this.#state);
  }
  async #persist(state, previous) {
    validateState(state);
    const content = JSON.stringify(state, null, 2) + "\n";
    if (Buffer.byteLength(content) > MAX_BYTES) fail("PROFILE_LIMIT");
    await this.#checkDirectory();
    const temporary = path.join(this.#directory, `.connections-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await handle.chmod(0o600);
      privateFile(await handle.stat());
      await handle.writeFile(content, "utf8");
      await handle.sync();
      const temporaryInfo = await handle.stat();
      privateFile(temporaryInfo);
      await handle.close(); handle = undefined;
      await this.#checkDirectory();
      const current = await readState(this.#directory);
      if (JSON.stringify(current) !== JSON.stringify(previous)) fail("REVISION_CONFLICT");
      // Rename is the commit point. Never throw after it: callers must not delete a committed key.
      const finalInfo = await lstat(temporary);
      privateFile(finalInfo);
      if (!sameFile(temporaryInfo, finalInfo)) fail("UNSAFE_STORAGE");
      await rename(temporary, path.join(this.#directory, FILE));
    } finally {
      if (handle) await handle.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
    // Best-effort directory fsync for durability; rename already committed even if fsync fails.
    try {
      const directory = await open(this.#directory, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { await directory.sync(); } finally { await directory.close(); }
    } catch {}
  }
  #mutate(operation) {
    return guarded(() => serial(this.#directory, operation));
  }
  #expected(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) fail("REVISION_CONFLICT");
  }
  #credentialAdapter() {
    const adapter = this.#credentials;
    if (!adapter || ["get", "set", "delete"].some((method) => typeof adapter[method] !== "function")) fail("CREDENTIALS_UNAVAILABLE");
    return adapter;
  }
  async #existingCredential(reference) {
    let key;
    const adapter = this.#credentialAdapter();
    try { key = await adapter.get(reference); } catch { fail("CREDENTIALS_UNAVAILABLE"); }
    if (key === null || key === undefined || key === "") fail("MISSING_CREDENTIAL");
    if (!validKey(key)) fail("CREDENTIALS_UNAVAILABLE");
  }
  async #deleteCredential(reference) {
    if (!reference) return;
    try { await this.#credentialAdapter().delete(reference); } catch {}
  }
  async save(input, expectedRevision) {
    // Copy immediately so callers cannot modify a queued request.
    let request;
    try { request = clone(input); } catch { fail("INVALID_INPUT"); }
    return this.#mutate(async () => {
      this.#expected(expectedRevision);
      const state = await this.#current(expectedRevision);
      if (!fields(request, ["id", "name", "kind", "root", "url", "key", "allowWrites"])
        || !text(request.name, 128) || !request.name.trim()
        || !["local", "remote"].includes(request.kind)
        || (request.allowWrites !== undefined && typeof request.allowWrites !== "boolean")) fail("INVALID_INPUT");
      const previous = request.id === undefined ? undefined : state.profiles.find((profile) => profile.id === request.id);
      if (request.id !== undefined && !previous) fail("NOT_FOUND");
      if (!previous && state.profiles.length >= MAX_PROFILES) fail("PROFILE_LIMIT");
      const profile = { id: previous?.id || randomUUID(), name: request.name.trim(), kind: request.kind };
      if (request.kind === "local") {
        if ("url" in request || "key" in request) fail("INVALID_INPUT");
        profile.root = await localRoot(request.root);
      } else {
        if ("root" in request || ("key" in request && !validKey(request.key))) fail("INVALID_INPUT");
        profile.url = remoteOrigin(request.url);
      }
      const sameDestination = previous?.kind === profile.kind
        && (profile.kind === "local" ? previous.root === profile.root : previous.url === profile.url);
      // A profile ID is also a browser-link destination identity. Replacing its
      // destination must never make an old bookmark valid on a different brain.
      if (previous && !sameDestination) profile.id = randomUUID();
      profile.allowWrites = request.allowWrites ?? (sameDestination ? previous.allowWrites : profile.kind === "local");
      for (const other of state.profiles) {
        if (other.id === profile.id || other.kind !== profile.kind) continue;
        if (profile.kind === "remote" && other.url === profile.url) fail("DUPLICATE_DESTINATION");
        if (profile.kind === "local") {
          const root = await realpath(other.root).catch(() => other.root);
          if (root === profile.root) fail("DUPLICATE_DESTINATION");
        }
      }
      let newReference;
      try {
        if (profile.kind === "remote") {
          if (request.key !== undefined) {
            const adapter = this.#credentialAdapter();
            newReference = `jumpybrain-companion:${randomUUID()}`;
            try { await adapter.set(newReference, request.key); }
            catch { fail("CREDENTIALS_UNAVAILABLE"); }
            profile.credentialRef = newReference;
          } else {
            if (!sameDestination) fail("MISSING_CREDENTIAL");
            await this.#existingCredential(previous.credentialRef);
            profile.credentialRef = previous.credentialRef;
          }
        }
        if (previous) state.profiles[state.profiles.findIndex((item) => item.id === previous.id)] = profile;
        else state.profiles.push(profile);
        if (state.activeId === null || state.activeId === previous?.id) state.activeId = profile.id;
        state.revision++;
        await this.#persist(state, this.#state);
        this.#state = state;
      } catch (error) {
        await this.#deleteCredential(newReference);
        throw error;
      }
      if (previous?.credentialRef !== profile.credentialRef) await this.#deleteCredential(previous?.credentialRef);
      return this.snapshot();
    });
  }
  async remove(id, expectedRevision) {
    return this.#mutate(async () => {
      this.#expected(expectedRevision);
      const state = await this.#current(expectedRevision);
      const profile = state.profiles.find((item) => item.id === id);
      if (!profile) fail("NOT_FOUND");
      if (state.activeId === id) fail("ACTIVE_PROFILE");
      state.profiles = state.profiles.filter((item) => item.id !== id);
      state.revision++;
      await this.#persist(state, this.#state);
      this.#state = state;
      await this.#deleteCredential(profile.credentialRef);
      return this.snapshot();
    });
  }
  async setActive(id) {
    return this.#mutate(async () => {
      const state = await this.#current();
      if (!state.profiles.some((profile) => profile.id === id)) fail("NOT_FOUND");
      if (state.activeId === id) return this.snapshot();
      state.activeId = id; state.revision++;
      await this.#persist(state, this.#state);
      this.#state = state;
      return this.snapshot();
    });
  }
}
