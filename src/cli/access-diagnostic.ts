import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ACCESS_CAPABILITIES, roleCapabilities, type AccessCapability, type AccessRole } from "../adapters/access-control/index.js";
import { brainKeyCandidates, brainUrlVariable, credentialsEnvFileDisplay, keyFingerprint, remoteKeyCandidates, type RemoteKey, type RemoteKeySource } from "../adapters/credentials/env-file.js";
import { probeRemoteAccess } from "../adapters/http-client/access.js";
import type { ParsedCliArgs } from "./args.js";
import { liveCompanion } from "./companion.js";
import { defaultCompanionDirectory } from "./connections.js";
import { loadRemoteAccessPolicy, remoteAccessPolicyConfigPath } from "./remote-access-policy.js";
import { resolveCliTarget } from "./targets.js";

// `access whoami`: one observational answer to "which brain, which key, what may
// it do, and what does this device block". It reads configuration, asks the
// server once about the key it would send, and asks a running app for its own
// view. It changes nothing, starts nothing and never prints a key, the app's
// control token, a response body or a remote error message: every remote value
// shown is a validated role, a known capability name or a bounded display name.

type Verdict = { allowed: boolean | null; blockedBy: Blocker[] };
/** Why a capability is not available. `unconfirmed` means the server could not be asked, so nothing is claimed. */
type Blocker = "server_role" | "unconfirmed" | "folder_unavailable" | "command_mode" | "origin_policy" | "policy_invalid";

/** The app's access shape (`/companion/state`), also used for the CLI side. A `null` role is unconfirmed, never reader. */
export interface AccessView {
  source: "local" | "server";
  role: AccessRole | null;
  capabilities: AccessCapability[];
  name?: string;
  credentialId?: string;
  /** Why the role is unconfirmed; absent when it is confirmed. */
  reason?: string;
  /** A finer fixed token for the reason, such as `timeout` or `no_key`. */
  detail?: string;
  httpStatus?: number;
  /** How the capability list was obtained when the role is confirmed by a server. */
  capabilitiesFrom?: "server" | "role";
}

interface KeySlot { source: RemoteKeySource; found: boolean | null; used: boolean; variable?: string; file?: string; length?: number; last4?: string; sameKeyAsUsed?: boolean }

export interface AccessWhoamiReport {
  cli: {
    target: { kind: "remote"; source: string; url: string; brain?: string } | { kind: "local"; source: string; root: string; state: "available" | "not_initialized" | "missing" | "unreadable"; brain?: string } | { kind: "none"; message: string };
    /** Remote targets only. `resolved` says whether the CLI has a key it can send. */
    credential?: { resolved: boolean; usable: boolean; candidates: KeySlot[]; keyFile: string; fileProblem?: string; fileProblemCode?: string; problem?: string; brain?: string; notUsed?: string[] };
    access: AccessView | null;
    restrictions: {
      /** Device read-only command mode: blocks every state-changing CLI command, for any target. */
      commandMode: { state: "read-only" | "off" | "invalid"; source?: "environment" | "policy-file" };
      /** Per-origin read-only policy for this remote target. */
      originPolicy: { state: "read-only" | "off" | "invalid" | "not-applicable"; origin?: string };
      policyFile: { path?: string; state: "absent" | "ok" | "invalid" };
    };
    effective: Record<AccessCapability, Verdict> | null;
  };
  app: { running: false } | { running: "unknown"; problem: string }
    | { running: true; selected: { id?: string; name?: string; kind: "local" | "remote"; root?: string; url?: string } | null; health?: string; access: AccessView | null; matchesCliTarget: boolean | null };
  notes: string[];
}

export interface AccessWhoamiOptions { env?: NodeJS.ProcessEnv; home?: string; fetchImpl?: typeof fetch; timeoutMs?: number }

const clean = (value: unknown, max = 200) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const knownCapabilities = (value: unknown): AccessCapability[] => Array.isArray(value) ? ACCESS_CAPABILITIES.filter(name => value.includes(name)) : [];
const unconfirmed = (reason: string, extra: Partial<AccessView> = {}): AccessView => ({ source: "server", role: null, capabilities: [], reason, ...extra });

/** A remote URL as shown and used: HTTP(S), no credentials, no query or fragment. Never echoes a rejected value. */
function remoteUrl(value: string, flag: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error(`--${flag} must be an HTTP(S) URL such as https://memory.example.com.`); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`--${flag} must be an HTTP(S) URL such as https://memory.example.com.`);
  if (url.username || url.password) throw new Error(`--${flag} must not contain a user name or password. Keys are read from JUMPYBRAIN_API_KEY or ${credentialsEnvFileDisplay()}.`);
  return url.origin + url.pathname.replace(/\/+$/, "");
}

async function localState(root: string): Promise<"available" | "not_initialized" | "missing" | "unreadable"> {
  try { if (!(await stat(root)).isDirectory()) return "missing"; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable"; }
  try { return (await lstat(path.join(root, "jumpybrain.json"))).isFile() ? "available" : "not_initialized"; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? "not_initialized" : "unreadable"; }
}

/** The three places the CLI looks for a remote key, in order; the first found is the one sent. */
function keySlots(keys: RemoteKey[], fileChecked: boolean, brain?: string): KeySlot[] {
  const used = keys[0];
  // A named brain has its own order and never uses JUMPYBRAIN_API_KEY.
  const order = brain ? ["brain-environment", "brain-env-file", "app-connection"] as const : ["environment", "app-connection", "env-file"] as const;
  return order.map((source) => {
    const key = keys.find(entry => entry.source === source);
    // A connection that refers to JUMPYBRAIN_API_KEY in the file is that same file key.
    const shared = source === "env-file" && !key ? keys.find(entry => entry.source === "app-connection" && entry.variable === "JUMPYBRAIN_API_KEY") : undefined;
    const found = key ?? shared;
    if (!found) return { source, found: source === "environment" || source === "brain-environment" || fileChecked ? false : null, used: false };
    return {
      source, found: true, used: found === used, variable: found.variable, ...(found.file ? { file: found.file } : {}), ...keyFingerprint(found.key),
      ...(found !== used && used ? { sameKeyAsUsed: found.key === used.key } : {}),
    };
  });
}

async function restrictions(origin: string | undefined, options: AccessWhoamiOptions): Promise<AccessWhoamiReport["cli"]["restrictions"]> {
  const env = options.env ?? process.env;
  const requested = env.JUMPYBRAIN_READ_ONLY_COMMANDS?.trim().toLowerCase();
  const forced = requested === "1" || requested === "true";
  const badVariable = Boolean(requested) && !forced && requested !== "0" && requested !== "false";
  let file: string | undefined, policy: Awaited<ReturnType<typeof loadRemoteAccessPolicy>> = null, invalid = false;
  // A broken policy is reported, never thrown: the reason text can quote the file's content.
  try { file = remoteAccessPolicyConfigPath(options); policy = await loadRemoteAccessPolicy(file); } catch { invalid = true; }
  return {
    commandMode: forced ? { state: "read-only", source: "environment" }
      : badVariable || invalid ? { state: "invalid" }
      : policy?.commands === "read-only" ? { state: "read-only", source: "policy-file" } : { state: "off" },
    originPolicy: origin === undefined ? { state: "not-applicable" }
      : invalid ? { state: "invalid", origin }
      : { state: policy?.remoteTargets.some(entry => entry.origin === origin) ? "read-only" : "off", origin },
    policyFile: { ...(file ? { path: file } : {}), state: invalid ? "invalid" : policy ? "ok" : "absent" },
  };
}

/**
 * What CLI commands may do right now: the server role (or the local folder),
 * narrowed by this device's guards. Local guards block regardless of the role;
 * an unconfirmed role is `null`, never an assumed reader or writer.
 */
function effective(access: AccessView, limits: AccessWhoamiReport["cli"]["restrictions"], remote: boolean): Record<AccessCapability, Verdict> {
  return Object.fromEntries(ACCESS_CAPABILITIES.map((capability) => {
    const blockedBy: Blocker[] = [];
    const change = capability !== "read";
    // An unreadable policy stops every remote command, and every state-changing one.
    if (limits.policyFile.state === "invalid" && (remote || change)) blockedBy.push("policy_invalid");
    else if (limits.commandMode.state === "invalid" && change) blockedBy.push("policy_invalid");
    if (change && limits.commandMode.state === "read-only") blockedBy.push("command_mode");
    if (change && limits.originPolicy.state === "read-only") blockedBy.push("origin_policy");
    if (access.role === null) blockedBy.push(access.source === "local" ? "folder_unavailable" : "unconfirmed");
    else if (!access.capabilities.includes(capability)) blockedBy.push("server_role");
    const local = blockedBy.some(item => item !== "unconfirmed");
    return [capability, { allowed: local ? false : access.role === null ? null : true, blockedBy }];
  })) as Record<AccessCapability, Verdict>;
}

async function cliSide(args: ParsedCliArgs, options: AccessWhoamiOptions, notes: string[]): Promise<AccessWhoamiReport["cli"]> {
  const selectors = ["root", "target-url", "remote-url"].filter(flag => args[flag] !== undefined);
  if (selectors.length > 1) throw new Error("Use only one target selector: --root, --target-url or --remote-url.");
  let target: ReturnType<typeof resolveCliTarget>;
  try { target = resolveCliTarget(args); }
  catch (error) {
    if (selectors.length) throw error;
    const text = error instanceof Error ? error.message : "";
    return {
      target: { kind: "none", message: text.startsWith("--root is required") ? "No brain is selected for CLI commands here. Pass --root <memory-root> or --target-url <url>, or set JUMPYBRAIN_MEMORY_ROOT." : text },
      access: null, restrictions: await restrictions(undefined, options), effective: null,
    };
  }
  const source = target.source ?? "flag";
  if (target.kind === "local") {
    const root = path.resolve(target.root!), state = await localState(root);
    const limits = await restrictions(undefined, options);
    // A local folder has no server role: whoever can change its files has full access.
    const access: AccessView = state === "available" ? { source: "local", role: "admin", capabilities: [...ACCESS_CAPABILITIES] }
      : { source: "local", role: null, capabilities: [], reason: "folder_unavailable", detail: state };
    return { target: { kind: "local", source, root, state, ...(target.brain ? { brain: target.brain } : {}) }, access, restrictions: limits, effective: effective(access, limits, false) };
  }

  const url = remoteUrl(target.url, selectors[0] ?? "target-url");
  const limits = await restrictions(new URL(url).origin, options);
  const { keys, fileProblem, fileProblemCode, mismatches = [] } = target.brain
    ? await brainKeyCandidates(target.brain, url, { env: options.env, home: options.home })
    : await remoteKeyCandidates(url, { env: options.env, home: options.home }) as Awaited<ReturnType<typeof remoteKeyCandidates>> & { mismatches?: string[] };
  const used = keys[0];
  // fetch cannot send these; the ordinary commands refuse such a key before any request.
  const unusable = used !== undefined && /[\u0000-\u001f\u007f]|[^\u0000-ÿ]/.test(used.key);
  const credential: NonNullable<AccessWhoamiReport["cli"]["credential"]> = {
    resolved: used !== undefined, usable: used !== undefined && !unusable, candidates: keySlots(keys, !fileProblem, target.brain),
    ...(target.brain ? { brain: target.brain } : {}), ...(mismatches.length ? { notUsed: mismatches } : {}),
    keyFile: credentialsEnvFileDisplay({ env: options.env, home: options.home }),
    ...(fileProblem ? { fileProblem, fileProblemCode } : {}),
    ...(unusable ? { problem: "The key contains characters an access key cannot have, such as smart quotes or a line break. Copy it again as plain text." } : {}),
  };
  let access: AccessView;
  // No usable key means no request: nothing is sent to the server.
  if (!used) access = unconfirmed("credential_unavailable", { detail: fileProblem ? "key_file_problem" : "no_key" });
  else if (unusable) access = unconfirmed("credential_unavailable", { detail: "invalid_characters" });
  else {
    const probe = await probeRemoteAccess({ url, apiKey: used.key, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
    if (probe.outcome === "authentication_failed") access = unconfirmed("authentication_failed", { httpStatus: probe.status });
    else if (probe.outcome !== "confirmed") access = unconfirmed(probe.outcome, { detail: probe.detail, ...(probe.status ? { httpStatus: probe.status } : {}) });
    else if (probe.capabilities === null) access = unconfirmed("unsupported", { detail: "malformed_capabilities" });
    else {
      const fixed = roleCapabilities(probe.role);
      // Never more than the fixed set of the confirmed role, whatever the list claims.
      const granted = probe.capabilities ? fixed.filter(name => probe.capabilities!.includes(name)) : [...fixed];
      if (probe.unknownCapabilities || (probe.capabilities && probe.capabilities.some(name => !fixed.includes(name)))) {
        notes.push(`The server listed capabilities this CLI does not recognize for the ${probe.role} role; they are not counted.`);
      }
      access = {
        source: "server", role: probe.role, capabilities: granted, capabilitiesFrom: probe.capabilities ? "server" : "role",
        ...(probe.name ? { name: probe.name } : {}), ...(probe.id ? { credentialId: probe.id } : {}),
      };
    }
  }
  return { target: { kind: "remote", source, url, ...(target.brain ? { brain: target.brain } : {}) }, credential, access, restrictions: limits, effective: effective(access, limits, true) };
}

/** A running app's own view of its selected connection. Shapes are re-validated; nothing is trusted to be safe to print. */
function appAccess(value: unknown): AccessView | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const { source, role, capabilities, name, reason } = value as Record<string, unknown>;
  if (source !== "local" && source !== "server") return null;
  const fixed = roleCapabilities(role);
  if (!fixed.length) {
    const token = typeof reason === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(reason) ? reason : "unsupported";
    return { source, role: null, capabilities: [], reason: token };
  }
  const shown = clean(name, 100);
  return { source, role: role as AccessRole, capabilities: knownCapabilities(capabilities).filter(item => fixed.includes(item)), ...(shown ? { name: shown } : {}) };
}

async function appSide(directory: string, cli: AccessWhoamiReport["cli"]): Promise<AccessWhoamiReport["app"]> {
  let companion: Awaited<ReturnType<typeof liveCompanion>>;
  try { companion = await liveCompanion(directory, "access check", AbortSignal.timeout(15_000)); }
  catch { return { running: "unknown", problem: "The app's private control files could not be read safely. Restart the app, then retry." }; }
  if (!companion) return { running: false };
  let state: any;
  try { state = await companion.request("/companion/state"); }
  catch (error) {
    const status = (error as { status?: unknown }).status;
    return { running: "unknown", problem: Number.isSafeInteger(status) ? `The app refused its control request (HTTP ${status}). Restart the app, then retry.` : "The app did not answer its control request. It may be starting or stopping; retry." };
  }
  const active = state?.active;
  if (active === null || typeof active !== "object" || (active.kind !== "local" && active.kind !== "remote")) {
    return { running: true, selected: null, access: null, matchesCliTarget: null };
  }
  const selected: { id?: string; name?: string; kind: "local" | "remote"; root?: string; url?: string } = { kind: active.kind };
  if (clean(active.id, 64)) selected.id = clean(active.id, 64);
  if (clean(active.name)) selected.name = clean(active.name);
  if (active.kind === "local" && clean(active.root, 1024)) selected.root = clean(active.root, 1024);
  if (active.kind === "remote") { try { selected.url = remoteUrl(String(active.url), "url"); } catch { /* an unusable URL is not shown */ } }
  let matchesCliTarget: boolean | null = null;
  if (cli.target.kind === "remote") matchesCliTarget = selected.kind === "remote" && selected.url === cli.target.url;
  else if (cli.target.kind === "local") {
    const real = async (folder: string) => realpath(folder).catch(() => path.resolve(folder));
    matchesCliTarget = selected.kind === "local" && selected.root !== undefined && await real(selected.root) === await real(cli.target.root);
  }
  const health = typeof state.health === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(state.health) ? state.health : undefined;
  return { running: true, selected, ...(health ? { health } : {}), access: appAccess(state.access), matchesCliTarget };
}

export async function accessWhoamiReport(args: ParsedCliArgs, options: AccessWhoamiOptions = {}): Promise<AccessWhoamiReport> {
  const notes: string[] = [];
  const cli = await cliSide(args, options, notes);
  const directory = path.resolve(typeof args.directory === "string" ? args.directory : defaultCompanionDirectory());
  const app = await appSide(directory, cli);
  if (app.running === true && app.selected) {
    if (cli.target.kind === "none") {
      notes.push(`The app's selection does not select a brain for CLI commands. To check the CLI against the same brain: jumpybrain access whoami ${app.selected.kind === "remote" ? `--target-url ${app.selected.url ?? "<url>"}` : "--root <that folder>"}`);
    } else if (app.matchesCliTarget === false) {
      notes.push("The app and the CLI point at different brains. Selecting a connection in the app never changes the CLI target.");
    } else if (app.matchesCliTarget && cli.access?.source === "server" && cli.access.role && app.access?.role && cli.access.role !== app.access.role) {
      notes.push(`The app and the CLI reach this brain with different access (app: ${app.access.role}, CLI: ${cli.access.role}). Each uses its own key: the app its saved connection key, the CLI the key marked used above.`);
    }
  }
  return { cli, app, notes };
}

const CAPABILITY_TEXT: Record<AccessCapability, string> = { read: "read", write: "write", manage_access: "manage access keys" };

function accessLine(access: AccessView | null, updateHint: string): string {
  if (!access) return `not reported${updateHint}`;
  if (access.source === "local") return access.role ? "local folder: no server role; whoever can change its files has full access" : "local folder is not available";
  if (access.role) return `${access.role}${access.capabilities.length ? ` (${access.capabilities.join(", ")})` : ""}${access.name ? ` as "${access.name}"` : ""}${access.capabilitiesFrom === "role" ? "; derived from the role, this server does not list capabilities" : ""}`;
  return `not confirmed: ${unconfirmedText(access)}`;
}

function unconfirmedText(access: AccessView): string {
  const status = access.httpStatus ? ` (HTTP ${access.httpStatus})` : "";
  switch (access.reason) {
    case "credential_unavailable": return access.detail === "no_key" ? "no access key was found, so nothing was sent"
      : access.detail === "key_file_problem" ? "the key file could not be used, so nothing was sent"
      : access.detail === "invalid_characters" ? "the key cannot be sent as it is, so nothing was sent" : "no usable saved key";
    case "authentication_failed": return `the server rejected the key${status}`;
    case "offline": return access.detail === "timeout" ? "the server did not answer in time" : `the server could not be reached${status}`;
    case "checking": return "the app is still checking";
    case "backend_version_mismatch": return "a backend from another build owns this brain";
    case "unsupported": return access.detail === "redirect" ? `the URL redirects${status}; use the server's final address`
      : access.detail === "unknown_role" ? "the server reported a role this CLI does not know"
      : access.detail === "malformed_capabilities" ? "the server's capability list could not be understood"
      : `the server did not report what this key may do${status}; it may be too old or not a jumpyBrain server`;
    default: return access.reason ?? "unknown";
  }
}

const BLOCKER_TEXT: Record<Blocker, string> = {
  server_role: "not in the server role", unconfirmed: "server role not confirmed", folder_unavailable: "the folder is not available", command_mode: "read-only command mode on this device",
  origin_policy: "this device marks the server read-only", policy_invalid: "the device policy cannot be read",
};

function slotLine(slot: KeySlot, index: number, file: string, brain?: string): string {
  const pair = brain ? `${slot.variable ?? `the ${brain} key`} bound by ${brainUrlVariable(brain)}` : "";
  const where = slot.source === "brain-environment" ? `${pair} in the environment`
    : slot.source === "brain-env-file" ? `${pair} in ${file}`
    : slot.source === "environment" ? "JUMPYBRAIN_API_KEY in the environment"
    : slot.source === "app-connection" ? `key the app saved for this URL in ${file}` : `JUMPYBRAIN_API_KEY in ${file}`;
  if (slot.found === null) return `    ${index + 1}. ${where}: not checked`;
  if (!slot.found) return `    ${index + 1}. ${where}: not set`;
  const print = `${slot.length} chars${slot.last4 ? `, ends …${slot.last4}` : ""}`;
  const variable = slot.source === "app-connection" && slot.variable ? `, ${slot.variable}` : "";
  return `    ${index + 1}. ${where}: found (${print}${variable})${slot.used ? " — used" : slot.sameKeyAsUsed ? " — not used (the same key)" : " — not used"}`;
}

export function formatAccessWhoami(report: AccessWhoamiReport): string {
  const { cli, app } = report;
  const lines = ["CLI (what jumpybrain commands here use):"];
  if (cli.target.kind === "none") lines.push(...cli.target.message.split("\n").map((line, index) => `  ${index ? "" : "target: none. "}${line}`));
  else if (cli.target.kind === "local") {
    const state = { available: "", not_initialized: " — not initialized (no jumpybrain.json)", missing: " — folder is missing", unreadable: " — folder cannot be read" }[cli.target.state];
    lines.push(`  target: local ${cli.target.root} (${cli.target.brain ? `brain ${cli.target.brain}` : cli.target.source})${state}`, "  key: none needed for a local folder");
  } else {
    lines.push(`  target: remote ${cli.target.url} (${cli.target.brain ? `brain ${cli.target.brain}` : cli.target.source})`, "  key (the first one found is sent):");
    cli.credential!.candidates.forEach((slot, index) => lines.push(slotLine(slot, index, cli.credential!.keyFile, cli.credential!.brain)));
    for (const mismatch of cli.credential!.notUsed ?? []) lines.push(`    Not used: ${mismatch}.`);
    if (cli.credential!.fileProblem) lines.push(`    Not checked: ${cli.credential!.fileProblem}`);
    if (cli.credential!.problem) lines.push(`    ${cli.credential!.problem}`);
    if (!cli.credential!.resolved) lines.push(cli.credential!.brain
      ? `    To set one: printf '%s' "$KEY" | jumpybrain brains key ${cli.credential!.brain} --key-stdin (JUMPYBRAIN_API_KEY is not used for a named brain).`
      : `    To set one: export JUMPYBRAIN_API_KEY, or save this connection in the jumpyBrain app (keys are shared via ${cli.credential!.keyFile}).`);
  }
  if (cli.access) lines.push(`  ${cli.access.source === "local" ? "access" : "server role"}: ${accessLine(cli.access, "")}`);
  const { commandMode, originPolicy, policyFile } = cli.restrictions;
  const mode = commandMode.state === "read-only" ? `read-only command mode ON (${commandMode.source === "environment" ? "JUMPYBRAIN_READ_ONLY_COMMANDS" : policyFile.path}); state-changing commands are blocked for every target`
    : commandMode.state === "invalid" ? "read-only command mode cannot be determined; state-changing commands fail closed" : "read-only command mode off";
  const origin = originPolicy.state === "read-only" ? `; ${originPolicy.origin} is marked read-only on this device`
    : originPolicy.state === "off" ? "; this server is not marked read-only on this device" : "";
  lines.push(`  this device: ${mode}${origin}`);
  if (policyFile.state === "invalid") lines.push(`  this device: the CLI policy${policyFile.path ? ` at ${policyFile.path}` : " (JUMPYBRAIN_CLI_CONFIG)"} is not valid; repair or remove it. Until then remote commands and state-changing commands are refused.`);
  else if (commandMode.state === "invalid") lines.push("  this device: JUMPYBRAIN_READ_ONLY_COMMANDS must be 1, true, 0 or false.");
  if (cli.effective) {
    lines.push(`  effective: ${ACCESS_CAPABILITIES.map((capability) => {
      const verdict = cli.effective![capability];
      const why = verdict.blockedBy.length ? ` (${verdict.blockedBy.map(item => BLOCKER_TEXT[item]).join("; ")})` : "";
      return `${CAPABILITY_TEXT[capability]} ${verdict.allowed === true ? "yes" : verdict.allowed === false ? "no" : "unknown"}${why}`;
    }).join("; ")}`);
  }
  lines.push("Mac app (its own selection; never the CLI target):");
  if (app.running === false) lines.push("  not running, so its selection and access are not shown");
  else if (app.running !== true) lines.push(`  unknown: ${app.problem}`);
  else if (!app.selected) lines.push("  running; no connection is selected");
  else {
    lines.push(`  selected: ${app.selected.name ?? "(unnamed)"} [${app.selected.kind}] ${app.selected.url ?? app.selected.root ?? ""}${app.health ? `; ${app.health}` : ""}`.trimEnd());
    lines.push(`  ${app.access?.source === "local" ? "access" : "server role"}: ${accessLine(app.access, " (update the app)")}`);
  }
  for (const note of report.notes) lines.push(`Note: ${note}`);
  return lines.join("\n");
}

export async function accessWhoamiCli(args: ParsedCliArgs): Promise<void> {
  const report = await accessWhoamiReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : formatAccessWhoami(report));
}
