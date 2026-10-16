export interface JumpyBrainServerConfig {
  root: string;
  host: string;
  port: number;
  apiKeys: string[];
  publicBaseUrl?: string;
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
  const timeout = (value: number | string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) throw new Error("Execution timeout must be a positive integer no larger than 2147483647 ms.");
    return parsed;
  };
  const searchTimeoutMs = timeout(input.searchTimeoutMs ?? env.JUMPYBRAIN_SEARCH_TIMEOUT_MS);
  const indexTimeoutMs = timeout(input.indexTimeoutMs ?? env.JUMPYBRAIN_INDEX_TIMEOUT_MS);
  return { root, host, port, apiKeys, publicBaseUrl,
    ...(searchTimeoutMs === undefined ? {} : { searchTimeoutMs }),
    ...(indexTimeoutMs === undefined ? {} : { indexTimeoutMs }),
  };
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
