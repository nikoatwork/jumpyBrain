import { createRemoteMemoryTransport, type RemoteMemoryTransport } from "../adapters/http-client/index.js";
import type { ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport, SearchResult } from "./local-transport.js";
import { resolveCliTarget } from "./targets.js";
import { DEFAULT_ENV_FILE_DISPLAY, remoteKeyForUrl } from "../adapters/credentials/env-file.js";

export type CommandMemoryTarget =
  | { kind: "local"; root: string; source?: string }
  | { kind: "remote"; url: string; source?: string; memory: RemoteMemoryTransport };

export async function commandMemoryTarget(
  args: ParsedCliArgs,
  localMemory: LocalMemoryTransport,
  options: { allowDiscovery?: boolean } = {},
): Promise<CommandMemoryTarget> {
  const target = resolveCliTarget(args, { allowDiscovery: options.allowDiscovery });
  if (target.kind === "remote") return { ...target, memory: createRemoteMemoryTransport({ url: target.url, apiKey: await remoteApiKey(target.url) }) };
  const root = target.root ?? await localMemory.findMemoryRoot();
  return { ...target, root };
}

export async function remoteApiKey(url: string): Promise<string> {
  const apiKey = await remoteKeyForUrl(url);
  if (!apiKey) throw new Error(`No access key for ${url}. Set JUMPYBRAIN_API_KEY, or save this connection in the jumpyBrain app (keys are shared via ${DEFAULT_ENV_FILE_DISPLAY}).`);
  return apiKey;
}

export async function recallRelatedMemory(
  target: CommandMemoryTarget,
  localMemory: LocalMemoryTransport,
  topic: string,
  limit: number,
): Promise<{ skipped: false; query: string; results: SearchResult[] }> {
  const result = target.kind === "remote"
    ? await target.memory.searchMemory(topic, limit, { mode: "recall" })
    : await localMemory.searchMemory(target.root, topic, limit);
  return { skipped: false, query: result.query, results: result.results };
}
