import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ExtensionManifest, Json } from "../../extensions/index.js";

export class ExtensionPackageError extends Error {
  readonly code: "extension_invalid" | "extension_permission_denied" | "extension_stale" | "extension_failed";
  constructor(message: string, options?: ErrorOptions & { code?: ExtensionPackageError["code"] }) {
    super(message, options); this.name = "ExtensionPackageError"; this.code = options?.code ?? "extension_invalid";
  }
}
export const validId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(id) && ![".", "..", "__proto__", "constructor", "prototype"].includes(id);
export function assertId(id: unknown): asserts id is string {
  if (!validId(id)) throw new ExtensionPackageError("Invalid extension or contribution ID.");
}
export function text(value: unknown, label: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new ExtensionPackageError(`Invalid ${label}.`);
  return value;
}
export function entryPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 512 || path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..") || !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(value)) {
    throw new ExtensionPackageError("Entries must be package-relative TypeScript or JavaScript files without traversal.");
  }
  return value;
}
export function validateManifest(value: unknown): ExtensionManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ExtensionPackageError("Invalid extension manifest.");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !["apiVersion", "id", "name", "version", "main", "ui", "capabilities"].includes(key))) throw new ExtensionPackageError("Unknown extension manifest field.");
  if (item.apiVersion !== 1) throw new ExtensionPackageError("Unsupported extension API version; this host requires apiVersion 1.");
  assertId(item.id);
  const name = text(item.name, "extension name");
  if (typeof item.version !== "string" || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(item.version) || item.version.length > 80) throw new ExtensionPackageError("Extension version must be a numeric package version (for example 1.0.0).");
  const capabilities = item.capabilities ?? [];
  if (!Array.isArray(capabilities) || capabilities.some((value) => value !== "memory.read" && value !== "memory.write") || new Set(capabilities).size !== capabilities.length) throw new ExtensionPackageError("Invalid or duplicate extension capabilities.");
  return { apiVersion: 1, id: item.id, name, version: item.version, main: entryPath(item.main), ...(item.ui === undefined ? {} : { ui: entryPath(item.ui) }), capabilities: [...capabilities] };
}
export function contained(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export async function checkedFile(root: string, relative: string): Promise<string> {
  let file: string;
  try { file = await realpath(path.join(root, relative)); } catch { throw new ExtensionPackageError("Extension entry or manifest is missing."); }
  if (!contained(root, file)) throw new ExtensionPackageError("Extension path escapes its package directory.");
  if (!(await stat(file)).isFile()) throw new ExtensionPackageError("Extension entry must be a regular file.");
  return file;
}
/** Clone JSON at the boundary, rejecting cyclic, non-JSON and excessively large values. */
export function jsonValue(value: unknown, maxBytes = 262144): Json {
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): void {
    if (depth > 32) throw new ExtensionPackageError("Extension JSON is too deeply nested.");
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (!item || typeof item !== "object" || ancestors.has(item) || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)) throw new ExtensionPackageError("Extension value must be JSON.");
    ancestors.add(item);
    for (const child of Array.isArray(item) ? item : Object.values(item)) visit(child, depth + 1);
    ancestors.delete(item);
  }
  visit(value, 0);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > maxBytes) throw new ExtensionPackageError("Extension JSON exceeds its size limit.");
  return JSON.parse(serialized) as Json;
}
