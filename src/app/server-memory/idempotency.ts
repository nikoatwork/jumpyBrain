import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface IdempotencyRecord<T> {
  version: 1;
  keyHash: string;
  requestHash: string;
  method: string;
  path: string;
  result: T;
  createdAt: string;
}

export type IdempotencyResult<T> =
  | { kind: "created"; result: T }
  | { kind: "replayed"; result: T }
  | { kind: "missing-key" }
  | { kind: "conflict" };

export async function withIdempotency<T>(options: {
  root: string;
  key?: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  create: () => Promise<T>;
}): Promise<IdempotencyResult<T>> {
  const key = options.key?.trim();
  if (!key) return { kind: "missing-key" };

  const keyHashHex = sha256(key);
  const keyHash = `sha256:${keyHashHex}`;
  const requestHash = `sha256:${sha256(stableStringify({ method: options.method, path: options.path, body: options.body }))}`;
  const recordFile = path.join(options.root, ".jumpybrain", "remote", "idempotency", `${keyHashHex}.json`);

  const existing = await readRecord<T>(recordFile);
  if (existing) {
    if (existing.requestHash === requestHash) return { kind: "replayed", result: existing.result };
    return { kind: "conflict" };
  }

  const result = await options.create();
  const record: IdempotencyRecord<T> = {
    version: 1,
    keyHash,
    requestHash,
    method: options.method,
    path: options.path,
    result,
    createdAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(recordFile), { recursive: true });
  await writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return { kind: "created", result };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readRecord<T>(recordFile: string): Promise<IdempotencyRecord<T> | undefined> {
  try {
    return JSON.parse(await readFile(recordFile, "utf8")) as IdempotencyRecord<T>;
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") return undefined;
    throw error;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
