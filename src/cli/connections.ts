import os from "node:os";
import path from "node:path";
import { credentialsEnvFile, credentialsEnvFileDisplay, readCredentialsFile } from "../adapters/credentials/env-file.js";
import type { ParsedCliArgs } from "./args.js";
import { liveCompanion } from "./companion.js";
import { readStdin } from "./stdin.js";
import { commandMemoryTarget } from "./memory-target.js";
import type { LocalMemoryTransport } from "./local-transport.js";

export const defaultCompanionDirectory = () => path.join(os.homedir(), "Library/Application Support/jumpyBrain Companion");

// App profile control only. Never open the store offline or select a CLI memory target.
export async function connectionsCli(args: ParsedCliArgs): Promise<void> {
  const action = args._[1]!;
  const directory = path.resolve(typeof args.directory === "string" ? args.directory : defaultCompanionDirectory());
  // Read the key before contacting the app so a missing key changes nothing.
  const key = action === "add" && args.url !== undefined ? await remoteKeyFromArgs(args) : undefined;
  const companion = await liveCompanion(directory, "connection control");
  if (!companion) throw new Error("No running companion. Open the Mac app and retry. CLI-only installs use --root or JUMPYBRAIN_MEMORY_ROOT.");
  let result;
  try {
    if (action === "test") {
      const listed = await companion.request("/companion/connections");
      const profile = listed.profiles.find((item: { id: string }) => item.id === args.id);
      if (!profile) throw Object.assign(new Error("Connection not found. Run connections list for current IDs."), { status: 404 });
      const { health } = await companion.request("/companion/test", { id: args.id });
      result = { id: profile.id, name: profile.name, kind: profile.kind, ...(profile.kind === "remote" ? { url: profile.url } : { root: profile.root }), allowWrites: profile.allowWrites, health };
    } else {
      result = await companion.request("/companion/connections", action === "list" ? undefined : {
        action, revision: Number(args.revision),
        ...(action === "add" ? { profile: key === undefined
          ? { name: args.name, kind: "local", root: path.resolve(String(args.root)) }
          : { name: args.name, kind: "remote", url: args.url, key, allowWrites: args["allow-writes"] === true } } : { id: args.id }),
      });
    }
  } catch (error) {
    const { status, code } = error as { status?: number; code?: string };
    if (code === "ACTIVE_PROFILE") throw new Error("Switch away from the active app connection before removing it.");
    if (code === "DUPLICATE_DESTINATION") throw new Error("A connection already uses this canonical destination.");
    if (code === "INVALID_ROOT") throw new Error("Use a brain with a regular jumpybrain.json; add never initializes it.");
    if (code === "INVALID_URL") throw new Error("Use an HTTPS origin (or http://127.0.0.1 / localhost) without a path, query or credentials, e.g. https://memory.example.com.");
    if (code === "CREDENTIALS_UNAVAILABLE") throw new Error(`The app could not save the key in ${credentialsEnvFileDisplay()}. Check that the file is yours and private (chmod 600).`);
    if (code === "switch_busy") throw new Error("Another connection change is in progress in the app. Retry when it finishes.");
    if (status === 409) throw new Error("Revision changed or save/switch is blocked. Resolve drafts, run connections list, then retry deliberately.");
    throw error;
  }
  if (args.json) { console.log(JSON.stringify(result, null, 2)); return; }
  if (action === "test") {
    console.log(`${result.name} (${result.kind}, ${result.url ?? result.root}): ${healthText(result.health)}`);
    return;
  }
  console.log(`App connections (revision ${result.revision}; CLI target unchanged):`);
  console.log(JSON.stringify(result, null, 2));
  for (const profile of result.profiles ?? []) {
    if (profile.kind === "local" && profile.available === false) {
      console.log(`Warning: "${profile.name}" points at ${profile.root}, which is missing or no longer a brain. The app will not open or write it. Remove it with: jumpybrain connections remove --id ${profile.id} --revision ${result.revision}`);
    }
  }
}

const healthText = (health: string) => ({
  connected: "connected",
  available: "folder available (not opened; select it to start its engine)",
  offline: "unavailable",
  authentication_failed: "the server rejected the saved key",
  credential_unavailable: "no usable saved key; re-enter it",
  backend_version_mismatch: "a backend from another build owns this brain",
} as Record<string, string>)[health] ?? health;

/** The key for a new remote connection: stdin, or a named variable (environment first, then the key file). */
async function remoteKeyFromArgs(args: ParsedCliArgs): Promise<string> {
  let key: string | undefined;
  if (args["key-stdin"] === true) {
    key = readStdin().replace(/\r?\n$/, "");
    if (!key.trim()) throw new Error("--key-stdin read no key. Pipe it in, e.g. printf '%s' \"$KEY\" | jumpybrain connections add ... --key-stdin");
  } else {
    const variable = String(args["key-env"]);
    key = process.env[variable]?.trim();
    if (!key) key = (await readCredentialsFile(credentialsEnvFile()))?.get(variable)?.trim();
    if (!key) throw new Error(`${variable} is not set in the environment or in ${credentialsEnvFileDisplay()}.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(key) || key.length > 4096) throw new Error("The key contains line breaks or control characters, or is too long. Copy it again as plain text.");
  return key;
}

type Profile = { id: string; name: string; kind: "local" | "remote"; root?: string; url?: string; allowWrites: boolean; available?: boolean };
const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0]!;

/**
 * One read-only overview for agents: the CLI's target (and key source), the
 * Mac app's connections with health and write permission, and local
 * connections whose folder is gone. Changes no notes or connections; never prints a key.
 */
export async function statusAllCli(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<void> {
  let cli: Record<string, unknown>;
  try {
    const target = await commandMemoryTarget(args, localMemory);
    if (target.kind === "remote") {
      let reachable: Record<string, unknown>;
      try { const status = await target.memory.memoryRootStatus(); reachable = { health: "connected", compatible: status.compatible }; }
      catch (error) { const status = (error as { status?: number }).status; reachable = { health: status === 401 || status === 403 ? "authentication_failed" : "offline", error: message(error) }; }
      cli = { kind: "remote", source: target.source, url: target.url, credential: target.credential.summary, ...reachable };
    } else {
      const status = await localMemory.memoryRootStatus(target.root);
      cli = { kind: "local", source: target.source, root: status.root, initialized: status.initialized, compatible: status.compatible };
    }
  } catch (error) { cli = { error: message(error) }; }

  const directory = path.resolve(typeof args.directory === "string" ? args.directory : defaultCompanionDirectory());
  let app: Record<string, unknown>;
  const staleLocalRoots: { id: string; name: string; root: string }[] = [];
  try {
    const companion = await liveCompanion(directory, "status");
    if (!companion) app = { running: false };
    else {
      const listed = await companion.request("/companion/connections") as { revision: number; activeId: string | null; profiles: Profile[] };
      const profiles = [];
      for (const profile of listed.profiles) {
        let health: string;
        try { health = (await companion.request("/companion/test", { id: profile.id })).health; }
        catch (error) { health = (error as { code?: string }).code ?? "unknown"; }
        if (profile.kind === "local" && profile.available === false) staleLocalRoots.push({ id: profile.id, name: profile.name, root: profile.root! });
        profiles.push({ ...profile, active: profile.id === listed.activeId, health });
      }
      app = { running: true, revision: listed.revision, profiles };
    }
  } catch (error) { app = { running: "unknown", error: message(error) }; }

  const result = { cli, app, staleLocalRoots };
  if (args.json) { console.log(JSON.stringify(result, null, 2)); return; }
  const lines = ["CLI target:"];
  if ("error" in cli && !cli.kind) lines.push(`  none: ${cli.error}`);
  else if (cli.kind === "remote") {
    const key = cli.credential as { source: string; variable: string; length: number; last4?: string };
    lines.push(`  remote ${cli.url} (${cli.source}); ${cli.health}`, `  key: ${key.variable} via ${key.source} (${key.length} chars${key.last4 ? `, ends …${key.last4}` : ""})`);
  } else lines.push(`  local ${cli.root} (${cli.source}); ${cli.compatible ? "compatible" : cli.initialized ? "incompatible" : "not initialized"}`);
  lines.push("Mac app connections:");
  if (app.running === false) lines.push("  app not running");
  else if (app.running !== true) lines.push(`  unknown: ${app.error}`);
  else for (const profile of app.profiles as (Profile & { active: boolean; health: string })[]) {
    lines.push(`  ${profile.active ? "*" : " "} ${profile.name} [${profile.kind}] ${profile.url ?? profile.root}: ${profile.health}, ${profile.allowWrites ? "writes allowed" : "read only"} (id ${profile.id})`);
  }
  for (const stale of staleLocalRoots) lines.push(`Warning: "${stale.name}" points at ${stale.root}, which is missing. Remove it: jumpybrain connections list, then connections remove --id ${stale.id} --revision <n>`);
  console.log(lines.join("\n"));
}
