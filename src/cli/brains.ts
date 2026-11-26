import { statSync, lstatSync } from "node:fs";
import path from "node:path";
import { brainKeyCandidates, brainKeyVariable, brainUrlVariable, credentialsEnvFile, credentialsEnvFileDisplay, keyFingerprint, readCredentialsFile, setBrainKey } from "../adapters/credentials/env-file.js";
import { stringArg, type ParsedCliArgs } from "./args.js";
import { brainsFile, brainsFileDisplay, loadBrains, normalizeBrainUrl, saveBrains, validBrainName, type NamedBrain } from "./named-brains.js";
import { readStdin } from "./stdin.js";
import { withPrivateStateLock } from "../adapters/access-control/state-files.js";

// `jumpybrain brains`: CLI-only aliases for `--brain`; no app needed. Keys come
// from stdin or a named variable, are stored bound to the URL, never printed.

export async function brainsCli(args: ParsedCliArgs): Promise<void> {
  const action = args._[1] ?? "list";
  if (action === "list") return listBrains(args);
  const name = args._[2]!;
  if (!validBrainName(name)) throw new Error(`Invalid brain name ${JSON.stringify(name)}: use 1-32 lowercase letters, digits or '-', starting with a letter (e.g. work, product-it).`);
  const change = action === "add" ? addBrain : action === "key" ? keyBrain : action === "remove" ? removeBrain : undefined;
  if (change) {
    // Read the key before waiting for the lock: stdin is not part of the critical section.
    const key = action !== "remove" && keyFlag(args) && !(action === "add" && args.root !== undefined) ? await readKey(args, name) : undefined;
    return withBrainsLock(() => change(args, name, key));
  }
  throw new Error("Use jumpybrain brains list|add|key|remove. See jumpybrain brains --help.");
}

/** One `brains` change at a time across processes (list read, key write, list save); then the key file's own lock. */
async function withBrainsLock<T>(operation: () => Promise<T>): Promise<T> {
  const file = brainsFile();
  try { return await withPrivateStateLock(path.dirname(file), path.basename(file), operation); }
  catch (error) {
    if ((error as { code?: string }).code === "access_busy") throw new Error(`${brainsFileDisplay()} is busy (another jumpybrain brains change is running); no change was made. Retry.`);
    throw error;
  }
}

function keyFlag(args: ParsedCliArgs): "stdin" | "env" | undefined {
  if (args["key-stdin"] === true && args["key-env"] !== undefined) throw new Error("Use one of --key-stdin or --key-env <VARIABLE>.");
  return args["key-stdin"] === true ? "stdin" : args["key-env"] !== undefined ? "env" : undefined;
}

/** The key from stdin or a named variable (environment first, then the key file). Never an argument. */
async function readKey(args: ParsedCliArgs, name: string): Promise<string> {
  let key: string | undefined;
  if (args["key-stdin"] === true) {
    key = readStdin().replace(/\r?\n$/, "");
    if (!key.trim()) throw new Error(`--key-stdin read no key. Pipe it in, e.g. printf '%s' "$KEY" | jumpybrain brains key ${name} --key-stdin`);
  } else {
    const variable = stringArg(args, "key-env");
    key = process.env[variable]?.trim();
    if (!key) key = (await readCredentialsFile(credentialsEnvFile()))?.get(variable)?.trim();
    if (!key) throw new Error(`${variable} is not set in the environment or in ${credentialsEnvFileDisplay()}.`);
  }
  if (/[\u0000-\u001f\u007f]|[^\u0000-ÿ]/.test(key) || key.length > 4096) throw new Error("The key contains line breaks, smart quotes or other characters an access key cannot have, or is too long. Copy it again as plain text.");
  return key;
}

function folderState(root: string): "available" | "not_initialized" | "missing" {
  try { if (!statSync(root).isDirectory()) return "missing"; } catch { return "missing"; }
  try { return lstatSync(path.join(root, "jumpybrain.json")).isFile() ? "available" : "not_initialized"; } catch { return "not_initialized"; }
}

async function describe(brain: NamedBrain) {
  if (brain.kind === "local") return { name: brain.name, kind: brain.kind, root: brain.root, state: folderState(brain.root) };
  const { keys, mismatches, fileProblem } = await brainKeyCandidates(brain.name, brain.url);
  const used = keys[0];
  const credential = used
    ? { found: true, source: used.source, variable: used.variable, ...(used.file ? { file: used.file } : {}), ...keyFingerprint(used.key) }
    : { found: false, ...(mismatches.length ? { notUsed: mismatches } : {}), ...(fileProblem ? { fileProblem } : {}) };
  return { name: brain.name, kind: brain.kind, url: brain.url, credential };
}

async function listBrains(args: ParsedCliArgs): Promise<void> {
  const { brains } = loadBrains();
  const result = { file: brainsFileDisplay(), brains: await Promise.all(brains.map(describe)) };
  if (args.json) { console.log(JSON.stringify(result, null, 2)); return; }
  if (!result.brains.length) {
    console.log(`No named brains in ${result.file}. Add one: jumpybrain brains add <name> --root <folder> | --target-url <url> --key-stdin`);
    return;
  }
  console.log(`Named brains (${result.file}); use with --brain <name>:`);
  for (const brain of result.brains) console.log(`  ${line(brain)}`);
}

function line(brain: Awaited<ReturnType<typeof describe>>): string {
  if (brain.kind === "local") {
    const state = { available: "", not_initialized: " (not initialized: run jumpybrain init --root <folder>)", missing: " (folder is missing)" }[brain.state];
    return `${brain.name}: local ${brain.root}${state}`;
  }
  const credential = brain.credential as { found: boolean; source?: string; variable?: string; length?: number; last4?: string; notUsed?: string[]; fileProblem?: string };
  const key = credential.found
    ? `key: ${credential.variable} via ${credential.source} (${credential.length} chars${credential.last4 ? `, ends …${credential.last4}` : ""})`
    : `no usable key${credential.notUsed ? ` (${credential.notUsed.join("; ")})` : ""}${credential.fileProblem ? ` (${credential.fileProblem})` : ""}; set one: jumpybrain brains key ${brain.name} --key-stdin`;
  return `${brain.name}: remote ${brain.url}; ${key}`;
}

async function addBrain(args: ParsedCliArgs, name: string, key?: string): Promise<void> {
  const hasRoot = args.root !== undefined, hasUrl = args["target-url"] !== undefined;
  if (hasRoot === hasUrl) throw new Error(`jumpybrain brains add ${name} needs exactly one of --root <folder> or --target-url <url>.`);
  const { brains } = loadBrains();
  if (brains.some(entry => entry.name === name)) throw new Error(`Brain ${JSON.stringify(name)} already exists. To point it elsewhere: jumpybrain brains remove ${name}, then add it again.`);
  let brain: NamedBrain;
  if (hasRoot) {
    if (keyFlag(args)) throw new Error("A local folder needs no access key; drop --key-stdin/--key-env.");
    const root = path.resolve(stringArg(args, "root"));
    if (folderState(root) === "missing") throw new Error(`No folder at ${JSON.stringify(root)}. Create the brain first: jumpybrain init --root '${root.replace(/'/gu, `'"'"'`)}'`);
    brain = { name, kind: "local", root };
  } else {
    brain = { name, kind: "remote", url: normalizeBrainUrl(stringArg(args, "target-url")) };
  }
  const same = brains.find(entry => entry.kind === brain.kind && (entry.kind === "local" ? entry.root === (brain as { root: string }).root : entry.url === (brain as { url: string }).url));
  if (same) throw new Error(`Brain ${JSON.stringify(same.name)} already names this ${brain.kind === "local" ? "folder" : "URL"}; use --brain ${same.name}.`);
  // The key is stored bound to this URL first: if the list update then fails,
  // the pair can only ever be sent to the same destination.
  if (key !== undefined && brain.kind === "remote") await setBrainKey(name, { key, url: brain.url });
  else if (brain.kind === "remote") await setBrainKey(name, null); // never inherit a leftover pair under this name
  await saveBrains([...brains, brain]);
  const described = await describe(brain);
  if (args.json) { console.log(JSON.stringify({ added: described }, null, 2)); return; }
  console.log(`Added ${line(described)}`);
  console.log(`Use it with: jumpybrain status --brain ${name}`);
}

async function keyBrain(args: ParsedCliArgs, name: string, key?: string): Promise<void> {
  if (!keyFlag(args)) throw new Error(`Pass the key on stdin or by variable name: printf '%s' "$KEY" | jumpybrain brains key ${name} --key-stdin`);
  const brain = loadBrains().brains.find(entry => entry.name === name);
  if (!brain) throw new Error(`Unknown brain ${JSON.stringify(name)}. See: jumpybrain brains list`);
  if (brain.kind !== "remote") throw new Error(`Brain ${JSON.stringify(name)} is a local folder and needs no access key.`);
  await setBrainKey(name, { key: key!, url: brain.url });
  const described = await describe(brain);
  if (args.json) { console.log(JSON.stringify({ updated: described }, null, 2)); return; }
  console.log(`Saved the key for ${line(described)}`);
}

async function removeBrain(args: ParsedCliArgs, name: string): Promise<void> {
  const { brains } = loadBrains();
  const brain = brains.find(entry => entry.name === name);
  if (!brain) throw new Error(`Unknown brain ${JSON.stringify(name)}. See: jumpybrain brains list`);
  // The name goes first; a stored pair left behind stays bound to the old URL and is never sent elsewhere.
  await saveBrains(brains.filter(entry => entry !== brain));
  let keyRemoved = false;
  if (brain.kind === "remote") { await setBrainKey(name, null); keyRemoved = true; }
  const result = { removed: brain.kind === "local" ? { name, kind: brain.kind, root: brain.root } : { name, kind: brain.kind, url: brain.url }, keyRemoved };
  if (args.json) { console.log(JSON.stringify(result, null, 2)); return; }
  console.log(`Removed brain ${JSON.stringify(name)}${keyRemoved ? ` and its saved key (${brainKeyVariable(name)}/${brainUrlVariable(name)} in ${credentialsEnvFileDisplay()})` : ""}. The ${brain.kind === "local" ? "folder and its notes are" : "server and its notes are"} unchanged.`);
}
