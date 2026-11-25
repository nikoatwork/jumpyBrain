import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { watchFile, unwatchFile } from "node:fs";
import { mkdir, lstat, open, readFile, realpath, rename, unlink, link, rmdir } from "node:fs/promises";
import path from "node:path";
import { AccessError, privateMode, privateStateDirectory, publishPrivateState, withPrivateStateLock } from "./state-files.js";
export { AccessError } from "./state-files.js";

export type AccessRole = "reader" | "writer" | "admin";
/** Named permissions. Roles are fixed sets of these; there are no custom roles. */
export type AccessCapability = "read" | "write" | "manage_access";
export const ACCESS_CAPABILITIES: readonly AccessCapability[] = Object.freeze(["read", "write", "manage_access"] as const);
export const ROLE_CAPABILITIES: Readonly<Record<AccessRole, readonly AccessCapability[]>> = Object.freeze({
  reader: Object.freeze(["read"] as const),
  writer: Object.freeze(["read", "write"] as const),
  admin: Object.freeze(["read", "write", "manage_access"] as const),
});
export interface Principal { id: string; name: string; role: AccessRole; }
export interface AccessCredential extends Principal { createdAt: string; revokedAt?: string; }
interface StoredCredential extends AccessCredential { tokenHash: string; }
interface AccessState { version: 1; generation: number; credentials: StoredCredential[]; }
export interface AccessStoreOptions { bootstrapKeys?: readonly string[]; bootstrapOwner?: {token: string; id: string}; }
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const validRole = (role: unknown): role is AccessRole => ["reader", "writer", "admin"].includes(String(role));
const safeName = (name: unknown): name is string => typeof name === "string" && name === name.trim() && name.length > 0 && name.length <= 100 && !/[\x00-\x1f\x7f]/.test(name) && Buffer.from(name).toString("utf8") === name;
const safeEqual = (left: string, right: string) => timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));


/** Persistent authorization state. This file is operational data, never an index/cache. */
export class AccessStore {
  private rootPromise?: Promise<string>;
  private rootArgument: string;
  private bootstrap: readonly string[];
  private bootstrapOwner?: {tokenHash: string; id: string};
  private listeners = new Set<() => void>();
  private watchedFile?: string;
  constructor(root: string, options: AccessStoreOptions = {}) {
    this.rootArgument = path.resolve(root);
    this.bootstrapOwner = options.bootstrapOwner ? {tokenHash: digest(options.bootstrapOwner.token), id: options.bootstrapOwner.id} : undefined;
    this.bootstrap = (options.bootstrapKeys ?? []).map(key => key.trim()).filter(Boolean);
  }
  private async paths() {
    const root = await (this.rootPromise ??= realpath(this.rootArgument)), directory = await privateStateDirectory(root);
    return { root, directory, file: path.join(directory, "access.json") };
  }
  private async load(): Promise<AccessState> {
    const { file } = await this.paths();
    let bytes: Buffer;
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !privateMode(stat.mode) || stat.size > 1024 * 1024)
        throw new AccessError("access_state_unsafe", "Access state must be a private regular file.");
      bytes = await readFile(file);
      if (bytes.length > 1024 * 1024) throw new AccessError("access_state_invalid", "Access state exceeds its bound.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, generation: 0, credentials: [] };
      throw error;
    }
    try {
      const state = JSON.parse(bytes.toString("utf8")) as AccessState;
      if (state.version !== 1 || !Number.isSafeInteger(state.generation) || state.generation < 0
        || !Array.isArray(state.credentials) || state.credentials.length > 1024) throw new Error();
      const ids = new Set<string>(), hashes = new Set<string>();
      for (const item of state.credentials) {
        if (!item || typeof item.id !== "string" || !/^[0-9a-f-]{36}$/.test(item.id) || ids.has(item.id)
          || !safeName(item.name) || !validRole(item.role) || !/^[0-9a-f]{64}$/.test(item.tokenHash)
          || hashes.has(item.tokenHash) || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))
          || (item.revokedAt !== undefined && (typeof item.revokedAt !== "string" || !Number.isFinite(Date.parse(item.revokedAt))))) throw new Error();
        ids.add(item.id); hashes.add(item.tokenHash);
      }
      return state;
    } catch { throw new AccessError("access_state_invalid", "Access state is malformed or unsupported; repair it explicitly."); }
  }
  async authenticate(token: string): Promise<Principal | undefined> {
    if (typeof token !== "string" || !token || token.length > 512) return undefined;
    const tokenHash = digest(token);
    for (const key of this.bootstrap) if (safeEqual(digest(key), tokenHash)) return this.bootstrapPrincipal(tokenHash);
    const state = await this.load();
    const item = state.credentials.find(entry => safeEqual(entry.tokenHash, tokenHash));
    return item && !item.revokedAt ? { id: item.id, name: item.name, role: item.role } : undefined;
  }
  private bootstrapPrincipal(tokenHash: string): Principal {
    return { id: this.bootstrapOwner && safeEqual(this.bootstrapOwner.tokenHash,tokenHash) ? this.bootstrapOwner.id : "bootstrap:" + tokenHash.slice(0, 16), name: "Brain operator", role: "admin" };
  }
  /** The current principal for a credential ID, read fresh like `authenticate`; revoked or unknown IDs have none.
   * Browser sessions reference their key by ID, so revoking the key ends them on the next request. */
  async authenticateId(id: string): Promise<Principal | undefined> {
    if (typeof id !== "string" || !id || id.length > 200) return undefined;
    for (const key of this.bootstrap) { const principal = this.bootstrapPrincipal(digest(key)); if (principal.id === id) return principal; }
    const item = (await this.load()).credentials.find(entry => entry.id === id);
    return item && !item.revokedAt ? { id: item.id, name: item.name, role: item.role } : undefined;
  }
  async list(): Promise<AccessCredential[]> {
    return (await this.load()).credentials.map(({ tokenHash: _secret, ...item }) => ({ ...item }));
  }
  private async mutate<T>(operation: (state: AccessState) => T): Promise<T> {
    const { directory, file } = await this.paths();
    return withPrivateStateLock(directory, "access", async () => {
      const state = await this.load(), result = operation(state);
      state.generation++;
      await publishPrivateState(directory, "access", file, state);
      for (const listener of this.listeners) { try { listener(); } catch {} }
      return result;
    });
  }
  async issue(input: { name: string; role: AccessRole }): Promise<{ credential: AccessCredential; token: string }> {
    if (!safeName(input?.name) || !validRole(input?.role)) throw new AccessError("invalid_credential", "Choose a nonempty name and reader, writer or admin role.");
    const token = "jb_" + randomBytes(32).toString("base64url");
    const credential: AccessCredential = { id: randomUUID(), name: input.name, role: input.role, createdAt: new Date().toISOString() };
    await this.mutate(state => {
      if (state.credentials.length >= 1024) throw new AccessError("credential_limit", "Access state has reached its credential bound.");
      state.credentials.push({ ...credential, tokenHash: digest(token) });
    });
    return { credential, token };
  }
  async revoke(id: string): Promise<boolean> {
    if (typeof id !== "string" || id.length > 100) throw new AccessError("invalid_credential", "A credential ID is required.");
    return this.mutate(state => {
      const credential = state.credentials.find(item => item.id === id);
      if (!credential || credential.revokedAt) return false;
      credential.revokedAt = new Date().toISOString(); return true;
    });
  }
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    void this.paths().then(({ file }) => {
      if (!this.listeners.size || this.watchedFile) return;
      this.watchedFile = file;
      watchFile(file, { persistent: false, interval: 500 }, () => { for (const item of this.listeners) { try { item(); } catch {} } });
    }).catch(() => { for (const item of this.listeners) { try { item(); } catch {} } });
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.watchedFile) { unwatchFile(this.watchedFile); this.watchedFile = undefined; }
    };
  }
  close() { this.listeners.clear(); if (this.watchedFile) unwatchFile(this.watchedFile); this.watchedFile = undefined; }
}
export function createAccessStore(root: string, options: AccessStoreOptions = {}): AccessStore { return new AccessStore(root, options); }
/** An unknown or missing role has no capabilities: callers fail closed. */
export function roleCapabilities(role: unknown): readonly AccessCapability[] {
  return typeof role === "string" && Object.hasOwn(ROLE_CAPABILITIES, role) ? ROLE_CAPABILITIES[role as AccessRole] : [];
}
export function hasCapability(principal: { role?: unknown } | undefined | null, capability: AccessCapability): boolean {
  return roleCapabilities(principal?.role).includes(capability);
}
export function canWrite(principal: Principal): boolean { return hasCapability(principal, "write"); }
export { BrowserSessionStore, browserDeviceLabel, SESSION_COOKIE_MAX_AGE_SECONDS, SESSION_INACTIVITY_MS, SESSION_RENEW_MS, INVITE_LIFETIME_MS } from "./sessions.js";
export type { BrowserSession, BrowserSessionStoreOptions, InviteGrant } from "./sessions.js";
