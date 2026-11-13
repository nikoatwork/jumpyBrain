import { createRemoteMemoryTransport, type RemoteMemoryTransport } from "../adapters/http-client/index.js";
import type { ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport, SearchResult } from "./local-transport.js";
import { resolveCliTarget } from "./targets.js";
import { describeRemoteKey, remoteCredential, remoteKeySummary } from "./remote-credentials.js";

export type CommandMemoryTarget =
  | { kind: "local"; root: string; source?: string }
  | {
    kind: "remote"; url: string; source?: string; memory: RemoteMemoryTransport;
    /** Where the key came from, with a non-secret fingerprint; never the key. */
    credential: { summary: ReturnType<typeof remoteKeySummary>; description: string };
  };

export async function commandMemoryTarget(
  args: ParsedCliArgs,
  localMemory: LocalMemoryTransport,
  options: { allowDiscovery?: boolean } = {},
): Promise<CommandMemoryTarget> {
  const target = resolveCliTarget(args, { allowDiscovery: options.allowDiscovery });
  if (target.kind === "remote") {
    const key = await remoteCredential(target.url);
    return {
      ...target,
      memory: createRemoteMemoryTransport({ url: target.url, apiKey: key.key }),
      credential: { summary: remoteKeySummary(key), description: describeRemoteKey(key) },
    };
  }
  const root = target.root ?? await localMemory.findMemoryRoot();
  return { ...target, root };
}

export async function remoteApiKey(url: string): Promise<string> {
  return (await remoteCredential(url)).key;
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
