import { memoryExecutionDeadlineMs, smartSearchIdleMs } from "../core/execution-limits.js";
export interface JumpyBrainServerConfig {
  root: string;
  host: string;
  port: number;
  apiKeys: string[];
  publicBaseUrl?: string;
  /** Public path prefix from publicBaseUrl (e.g. "/sherpa"); absent when the brain is served at "/". */
  basePath?: string;
  searchTimeoutMs?: number;
  indexTimeoutMs?: number;
}

export interface ResolveServerConfigInput {
  root?: string;
  host?: string;
  port?: string | number;
  apiKeys?: string | string[];
  publicBaseUrl?: string;
  searchTimeoutMs?: number;
  indexTimeoutMs?: number;
}

export function resolveServerConfig(input: ResolveServerConfigInput = {}, env: NodeJS.ProcessEnv = process.env): JumpyBrainServerConfig {
  const root = firstNonEmpty(input.root, env.JUMPYBRAIN_SERVER_ROOT);
  if (!root) throw new Error("Server memory root is required. Pass --root or set JUMPYBRAIN_SERVER_ROOT.");

  const host = firstNonEmpty(input.host, env.JUMPYBRAIN_SERVER_HOST) ?? "127.0.0.1";
  const port = parsePort(input.port ?? env.JUMPYBRAIN_SERVER_PORT ?? 3787);
  const apiKeys = parseApiKeys(input.apiKeys ?? env.JUMPYBRAIN_SERVER_API_KEYS);
  if (apiKeys.length === 0) throw new Error("At least one server API key is required. Set JUMPYBRAIN_SERVER_API_KEYS.");

  const publicBaseUrl = firstNonEmpty(input.publicBaseUrl, env.JUMPYBRAIN_PUBLIC_BASE_URL);
  const basePath = publicBaseUrl ? publicBasePath(publicBaseUrl) : "";
  const timeout = (value: number | string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    return memoryExecutionDeadlineMs("index", Number(value));
  };
  const searchTimeoutMs = timeout(input.searchTimeoutMs ?? env.JUMPYBRAIN_SEARCH_TIMEOUT_MS);
  const indexTimeoutMs = timeout(input.indexTimeoutMs ?? env.JUMPYBRAIN_INDEX_TIMEOUT_MS);
  // Read again by the QMD adapter at each smart search; fail fast at bootstrap.
  smartSearchIdleMs(env.JUMPYBRAIN_SMART_SEARCH_IDLE_MS);
  return { root, host, port, apiKeys, publicBaseUrl,
    ...(basePath ? { basePath } : {}),
    ...(searchTimeoutMs === undefined ? {} : { searchTimeoutMs }),
    ...(indexTimeoutMs === undefined ? {} : { indexTimeoutMs }),
  };
}

/**
 * The path a reverse proxy serves this brain under, e.g. https://brain.example.com/sherpa -> "/sherpa".
 * The proxy strips it before forwarding; the server uses it only for URLs the browser builds and the cookie Path.
 */
export function publicBasePath(publicBaseUrl: string): string {
  const value = publicBaseUrl.trim();
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Invalid public base URL ${JSON.stringify(publicBaseUrl)}; use e.g. https://brain.example.com or https://brain.example.com/sherpa.`); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("The public base URL must use http or https.");
  if (url.username || url.password || url.search || url.hash) throw new Error("The public base URL must not contain credentials, a query or a fragment.");
  // Check the path as typed (URL parsing resolves `..`), with the same segment rule as CLI and Mac connections.
  const typed = /^https?:\/\/[^/?#\\]+(\/[^?#]*)?$/i.exec(value.replace(/[?#].*$/, ""));
  if (!typed) throw new Error(`Invalid public base URL ${JSON.stringify(publicBaseUrl)}; use e.g. https://brain.example.com or https://brain.example.com/sherpa.`);
  const basePath = (typed[1] ?? "").replace(/\/$/, "");
  if (basePath && !/^(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+$/.test(basePath))
    throw new Error("The public base URL path must be plain segments such as /sherpa or /team/sherpa.");
  // The browser UI's own Graph route.
  if (basePath === "/graph") throw new Error("The public base URL path cannot be /graph; choose another prefix.");
  return basePath;
}

function parsePort(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error("Server port must be an integer from 0 to 65535.");
  }
  return parsed;
}

function parseApiKeys(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return raw
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
