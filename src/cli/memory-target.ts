import { createRemoteMemoryTransport, type RemoteMemoryTransport } from "../adapters/http-client/index.js";
import type { ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport, SearchResult } from "./local-transport.js";
import { resolveCliTarget } from "./targets.js";

export type CommandMemoryTarget =
  | { kind: "local"; root: string; source?: string }
  | { kind: "remote"; url: string; source?: string; memory: RemoteMemoryTransport };

export async function commandMemoryTarget(
  args: ParsedCliArgs,
  localMemory: LocalMemoryTransport,
  options: { allowDiscovery?: boolean } = {},
): Promise<CommandMemoryTarget> {
  const target = resolveCliTarget(args, { allowDiscovery: options.allowDiscovery });
  if (target.kind === "remote") return { ...target, memory: createRemoteMemoryTransport({ url: target.url, apiKey: remoteApiKey() }) };
  const root = target.root ?? await localMemory.findMemoryRoot();
  return { ...target, root };
}

function remoteApiKey(): string {
  const apiKey = process.env.JUMPYBRAIN_API_KEY?.trim();
  if (!apiKey) throw new Error("JUMPYBRAIN_API_KEY is required for remote jumpyBrain targets.");
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
