import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { AccessRole, Principal } from "./index.js";
import { AccessError, privateMode, privateStateDirectory, publishPrivateState, withPrivateStateLock } from "./state-files.js";

// Browser sign-in state: opaque sessions and single-use invite codes. Both reference an
// access key by its ID and store only hashes of their secrets. Authorization still comes
// from the key, read fresh on every use, so revoking the key ends its sessions at once.

const DAY_MS = 24 * 60 * 60 * 1000;
/** Browsers cap cookie lifetimes at 400 days (RFC 6265bis, enforced by Chrome). */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
/** A session unused for this long ends. It matches the cookie lifetime, which renews with it. */
export const SESSION_INACTIVITY_MS = 400 * DAY_MS;
/** Last use is recorded, and the cookie re-issued, at most this often. */
export const SESSION_RENEW_MS = DAY_MS;
export const INVITE_LIFETIME_MS = 7 * DAY_MS;
const MAX_SESSIONS = 4096, MAX_SESSIONS_PER_KEY = 32, MAX_INVITES = 1024, MAX_STATE_BYTES = 4 * 1024 * 1024;

/** What lists show. `id` is a public handle for ending the session, never its secret. */
export interface BrowserSession { id: string; keyId: string; role: AccessRole; label: string; createdAt: string; lastSeenAt: string; }
interface StoredSession extends BrowserSession { secretHash: string; }
interface StoredInvite { id: string; codeHash: string; keyId: string; createdAt: string; expiresAt: string; usedAt?: string; }
interface SessionState { version: 1; sessions: StoredSession[]; invites: StoredInvite[]; }
export interface InviteGrant { code: string; keyId: string; expiresAt: string; }
export interface BrowserSessionStoreOptions { now?: () => number; }

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = (prefix: string) => prefix + randomBytes(32).toString("base64url");
const SECRET = /^jbs_[A-Za-z0-9_-]{43}$/, CODE = /^jbi_[A-Za-z0-9_-]{43}$/;
const KEY_ID = /^(?:[0-9a-f-]{36}|bootstrap:[0-9a-f]{16}|local-owner:[A-Za-z0-9_.:-]{1,160})$/;
const validRole = (role: unknown): role is AccessRole => role === "reader" || role === "writer" || role === "admin";
const validTime = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const validLabel = (value: unknown) => typeof value === "string" && value.length <= 80 && !/[\x00-\x1f\x7f]/.test(value);

/** A short, non-identifying device description from a User-Agent, e.g. "Safari on iPhone". */
export function browserDeviceLabel(userAgent: unknown): string {
  const agent = typeof userAgent === "string" ? userAgent.slice(0, 512) : "";
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /(Chrome|CriOS)\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const system = /iPhone/.test(agent) ? "iPhone" : /iPad/.test(agent) ? "iPad" : /Android/.test(agent) ? "Android" : /Mac OS X|Macintosh/.test(agent) ? "macOS"
    : /Windows/.test(agent) ? "Windows" : /CrOS/.test(agent) ? "ChromeOS" : /Linux/.test(agent) ? "Linux" : "";
  return system ? browser + " on " + system : browser;
}

/** Persistent browser sessions and invites in private `<root>/.jumpybrain/sessions.json`. Operational state, not memory. */
export class BrowserSessionStore {
  private rootPromise?: Promise<string>;
  private readonly rootArgument: string;
  private readonly now: () => number;
  private cache?: { stamp: string; state: SessionState; bySecret: Map<string, StoredSession> };
  constructor(root: string, options: BrowserSessionStoreOptions = {}) {
    this.rootArgument = path.resolve(root);
    this.now = options.now ?? Date.now;
  }
  private async paths() {
    const root = await (this.rootPromise ??= realpath(this.rootArgument)), directory = await privateStateDirectory(root);
    return { directory, file: path.join(directory, "sessions.json") };
  }
  private async load(useCache: boolean): Promise<{ state: SessionState; bySecret: Map<string, StoredSession> }> {
    const { file } = await this.paths();
    let bytes: Buffer, stamp: string;
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !privateMode(stat.mode) || stat.size > MAX_STATE_BYTES)
        throw new AccessError("session_state_unsafe", "Session state must be a private regular file.");
      stamp = [stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
      if (useCache && this.cache?.stamp === stamp) return this.cache;
      bytes = await readFile(file);
      if (bytes.length > MAX_STATE_BYTES) throw new AccessError("session_state_invalid", "Session state exceeds its bound.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") { this.cache = undefined; return { state: { version: 1, sessions: [], invites: [] }, bySecret: new Map() }; }
      throw error;
    }
    let state: SessionState;
    try {
      state = JSON.parse(bytes.toString("utf8"));
      if (!state || state.version !== 1 || !Array.isArray(state.sessions) || !Array.isArray(state.invites)
        || state.sessions.length > MAX_SESSIONS || state.invites.length > MAX_INVITES) throw new Error();
      const ids = new Set<string>(), hashes = new Set<string>();
      for (const item of state.sessions) {
        if (!item || typeof item.id !== "string" || !/^[0-9a-f-]{36}$/.test(item.id) || ids.has(item.id) || typeof item.secretHash !== "string"
          || !/^[0-9a-f]{64}$/.test(item.secretHash) || hashes.has(item.secretHash) || typeof item.keyId !== "string" || !KEY_ID.test(item.keyId)
          || !validRole(item.role) || !validLabel(item.label) || !validTime(item.createdAt) || !validTime(item.lastSeenAt)) throw new Error();
        ids.add(item.id); hashes.add(item.secretHash);
      }
      for (const item of state.invites) {
        if (!item || typeof item.id !== "string" || !/^[0-9a-f-]{36}$/.test(item.id) || ids.has(item.id) || typeof item.codeHash !== "string"
          || !/^[0-9a-f]{64}$/.test(item.codeHash) || hashes.has(item.codeHash) || typeof item.keyId !== "string" || !KEY_ID.test(item.keyId)
          || !validTime(item.createdAt) || !validTime(item.expiresAt) || (item.usedAt !== undefined && !validTime(item.usedAt))) throw new Error();
        ids.add(item.id); hashes.add(item.codeHash);
      }
    } catch { throw new AccessError("session_state_invalid", "Session state is malformed or unsupported; repair it explicitly."); }
    const loaded = { state, bySecret: new Map(state.sessions.map(item => [item.secretHash, item] as const)) };
    if (useCache) this.cache = { stamp, ...loaded };
    return loaded;
  }
  private active(session: StoredSession) { return this.now() - Date.parse(session.lastSeenAt) < SESSION_INACTIVITY_MS; }
  private async mutate<T>(operation: (state: SessionState) => T | Promise<T>): Promise<T> {
    const { directory, file } = await this.paths();
    return withPrivateStateLock(directory, "sessions", async () => {
      const { state } = await this.load(false), before = JSON.stringify(state);
      const result = await operation(state);
      const now = this.now();
      // Prune what can never be used again: inactive sessions and expired invites.
      state.sessions = state.sessions.filter(item => this.active(item));
      state.invites = state.invites.filter(item => Date.parse(item.expiresAt) > now);
      // A change that changed nothing (a lost renewal race, a spent code) writes nothing.
      if (JSON.stringify(state) !== before) { await publishPrivateState(directory, "sessions", file, state); this.cache = undefined; }
      return result;
    });
  }
  private async newSession(state: SessionState, input: { keyId: string; role: AccessRole; label: string; replacing?: string; keyActive?: (keyId: string) => Promise<boolean> }) {
    const value = secret("jbs_"), time = new Date(this.now()).toISOString();
    const session: StoredSession = { id: randomUUID(), keyId: input.keyId, role: input.role, label: validLabel(input.label) ? input.label : "Browser", createdAt: time, lastSeenAt: time, secretHash: digest(value) };
    // The browser's previous session ends in the same change that starts its successor.
    const replaced = typeof input.replacing === "string" && SECRET.test(input.replacing) ? digest(input.replacing) : undefined;
    state.sessions = state.sessions.filter(item => this.active(item) && item.secretHash !== replaced);
    // Bounded per key: that key's least recently used session gives way, never another key's.
    const own = state.sessions.filter(item => item.keyId === input.keyId).sort((a, b) => Date.parse(a.lastSeenAt) - Date.parse(b.lastSeenAt));
    const evict = new Set(own.slice(0, Math.max(0, own.length - (MAX_SESSIONS_PER_KEY - 1))));
    if (evict.size) state.sessions = state.sessions.filter(item => !evict.has(item));
    if (state.sessions.length >= MAX_SESSIONS && input.keyActive) {
      // At capacity, sessions of keys revoked elsewhere (for example on the host) give way first.
      const live = new Map<string, boolean>();
      for (const id of new Set(state.sessions.map(item => item.keyId))) live.set(id, await input.keyActive(id));
      state.sessions = state.sessions.filter(item => live.get(item.keyId));
    }
    if (state.sessions.length >= MAX_SESSIONS) throw new AccessError("session_limit", "This brain has reached its browser session limit.");
    state.sessions.push(session);
    return { secret: value, session: publicSession(session) };
  }
  /** Start a session for a key that the caller has just authenticated, ending `replacing` (this browser's previous secret). */
  async create(input: { keyId: string; role: AccessRole; label: string; replacing?: string; keyActive?: (keyId: string) => Promise<boolean> }): Promise<{ secret: string; session: BrowserSession }> {
    if (!KEY_ID.test(input?.keyId ?? "") || !validRole(input?.role)) throw new AccessError("invalid_session", "A key ID and role are required.");
    return this.mutate(state => this.newSession(state, input));
  }
  /** The session for a cookie secret, unless it is unknown or inactive. `renew` asks the caller to record use. */
  async resolve(value: string): Promise<{ session: BrowserSession; renew: boolean } | undefined> {
    if (typeof value !== "string" || !SECRET.test(value)) return undefined;
    const item = (await this.load(true)).bySecret.get(digest(value));
    if (!item || !this.active(item)) return undefined;
    return { session: publicSession(item), renew: this.now() - Date.parse(item.lastSeenAt) >= SESSION_RENEW_MS };
  }
  /** Record use, at most once per renewal interval. True only for the call that renewed it. */
  async touch(id: string): Promise<boolean> {
    return this.mutate(state => {
      const item = state.sessions.find(entry => entry.id === id);
      if (!item || !this.active(item) || this.now() - Date.parse(item.lastSeenAt) < SESSION_RENEW_MS) return false;
      item.lastSeenAt = new Date(this.now()).toISOString();
      return true;
    });
  }
  /** Sign out the session holding this secret. */
  async end(value: string): Promise<boolean> {
    if (typeof value !== "string" || !SECRET.test(value)) return false;
    const hash = digest(value);
    if (!(await this.load(true)).bySecret.has(hash)) return false;
    return this.mutate(state => { const before = state.sessions.length; state.sessions = state.sessions.filter(item => item.secretHash !== hash); return state.sessions.length < before; });
  }
  /** End one session by its public handle; returns it so callers can check whose it was. */
  async endById(id: string): Promise<BrowserSession | undefined> {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return undefined;
    return this.mutate(state => {
      const item = state.sessions.find(entry => entry.id === id);
      state.sessions = state.sessions.filter(entry => entry.id !== id);
      return item ? publicSession(item) : undefined;
    });
  }
  /** Sign out everywhere for a key: every session and every unused invite for it ends. */
  async endForKey(keyId: string): Promise<number> {
    if (typeof keyId !== "string" || !KEY_ID.test(keyId)) return 0;
    return this.mutate(state => {
      const before = state.sessions.length;
      state.sessions = state.sessions.filter(item => item.keyId !== keyId);
      state.invites = state.invites.filter(item => item.keyId !== keyId);
      return before - state.sessions.length;
    });
  }
  /** Active sessions, most recently used first. */
  async list(): Promise<BrowserSession[]> {
    return (await this.load(true)).state.sessions.filter(item => this.active(item))
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)).map(publicSession);
  }
  /** A single-use invite code for one key, valid for seven days. Only its hash is kept. */
  async createInvite(keyId: string): Promise<InviteGrant> {
    if (typeof keyId !== "string" || !KEY_ID.test(keyId)) throw new AccessError("invalid_session", "A key ID is required.");
    const code = secret("jbi_"), now = this.now(), expiresAt = new Date(now + INVITE_LIFETIME_MS).toISOString();
    await this.mutate(state => {
      state.invites = state.invites.filter(item => Date.parse(item.expiresAt) > now);
      if (state.invites.length >= MAX_INVITES) throw new AccessError("invite_limit", "Too many open invite links; wait for some to expire.");
      state.invites.push({ id: randomUUID(), codeHash: digest(code), keyId, createdAt: new Date(now).toISOString(), expiresAt });
    });
    return { code, keyId, expiresAt };
  }
  /** Exchange an unused, unexpired invite for a session. `principal` re-checks the key inside the
   * same locked change, so a revoked key yields nothing; the code is spent either way. */
  async redeemInvite(code: string, input: { label: string; replacing?: string; principal: (keyId: string) => Promise<Principal | undefined>; keyActive?: (keyId: string) => Promise<boolean> }):
    Promise<{ secret: string; session: BrowserSession; principal: Principal } | undefined> {
    if (typeof code !== "string" || !CODE.test(code)) return undefined;
    const hash = digest(code), usable = (item: StoredInvite | undefined) => item && !item.usedAt && Date.parse(item.expiresAt) > this.now();
    // Unknown, spent and expired codes are refused without taking the lock.
    if (!usable((await this.load(true)).state.invites.find(item => item.codeHash === hash))) return undefined;
    return this.mutate(async state => {
      const invite = state.invites.find(item => item.codeHash === hash);
      if (!invite || !usable(invite)) return undefined;
      // Spent codes leave at once, so they never hold a place under the open-invite limit.
      state.invites = state.invites.filter(item => item !== invite);
      const principal = await input.principal(invite.keyId);
      if (!principal || principal.id !== invite.keyId) return undefined;
      return { ...await this.newSession(state, { keyId: principal.id, role: principal.role, label: input.label, replacing: input.replacing, keyActive: input.keyActive }), principal };
    });
  }
}

function publicSession({ secretHash: _secret, ...session }: StoredSession): BrowserSession { return { ...session }; }
