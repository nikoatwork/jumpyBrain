// `smart-search status|on|off` and the plain search wording in status/doctor,
// in a disposable home with the fake engine. No model is ever downloaded.
import { stopRootBackend } from "../dist/app/backend-host/index.js";
import { SEMANTIC_MODEL, removeLocalModel, localModelFile } from "../dist/adapters/qmd/model-setup.js";
import { SMART_SEARCH_MODEL } from "../scripts/install-profiles.mjs";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { installFakeQmd } from "./fake-qmd-helper.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(repo, "dist/cli.js");

async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-smart-search-"));
  const home = path.join(temp, "home"), root = path.join(temp, "brain");
  await mkdir(home);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:JUMPYBRAIN_|QMD_|XDG_)/u.test(key)));
  Object.assign(env, { HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_CACHE_HOME: path.join(home, "cache") });
  const run = (args, more = {}) => spawnSync(process.execPath, [cli, ...args], { cwd: temp, encoding: "utf8", timeout: 30000, env: { ...env, ...more } });
  const ok = (args, more) => { const result = run(args, more); assert.equal(result.status, 0, result.stderr + result.stdout); return result; };
  t.after(async () => {
    if (existsSync(path.join(root, ".jumpybrain/backend/owner.json"))) await stopRootBackend(root);
    await rm(temp, { recursive: true, force: true });
  });
  ok(["init", "--root", root]);
  const { bin } = await installFakeQmd(root);
  const query = await readFile(new URL("./fixtures/fake-qmd-lifecycle/bin/qmd", import.meta.url), "utf8");
  const executable = path.join(path.dirname(bin), "qmd");
  await writeFile(executable, query.replace('const args = process.argv.slice(2);', 'if (process.argv[2] === "--version") { console.log("qmd 2.8.3"); process.exit(0); }\nconst args = process.argv.slice(2);'));
  await chmod(executable, 0o700);
  env.JUMPYBRAIN_QMD_BIN = executable;
  const model = path.join(home, ".jumpybrain/models", `${SEMANTIC_MODEL.sha256}.gguf`);
  // Pretend smart search was set up earlier: the policy plus a planted (unverified) model file.
  const enableSmartSearch = async () => {
    const config = JSON.parse(await readFile(path.join(root, "jumpybrain.json"), "utf8"));
    await writeFile(path.join(root, "jumpybrain.json"), JSON.stringify({ ...config, indexing: { mode: "semantic", modelId: `sha256:${SEMANTIC_MODEL.sha256}`, modelHash: SEMANTIC_MODEL.sha256 } }, null, 2));
    await mkdir(path.dirname(model), { recursive: true });
    await writeFile(model, "planted model bytes");
  };
  return { temp, home, root, run, ok, model, enableSmartSearch, policy: async () => JSON.parse(await readFile(path.join(root, "jumpybrain.json"), "utf8")).indexing };
}

test("a remote brain's search wording names the server and never a local-only command", async () => {
  const { formatSearchLine, remoteSemanticSetup } = await import("../dist/cli/search-mode.js");
  const localHint = "Restore the device-local model with smart-search on --download-model";
  assert.equal(remoteSemanticSetup({ state: "lexical", nextAction: "Optional: smart-search on with the same local root" }).nextAction, undefined);
  assert.equal(remoteSemanticSetup({ state: "ready" }).nextAction, undefined);
  const missing = remoteSemanticSetup({ state: "unavailable", modelId: "sha256:x", nextAction: localHint });
  assert.equal(missing.modelId, "sha256:x");
  assert.match(missing.nextAction, /server's operator/);
  assert.equal(formatSearchLine({ state: "lexical" }, "remote"), "Search: keyword search (smart search is off on the server)");
  const line = formatSearchLine(missing, "remote");
  assert.match(line, /model is missing on the server/);
  assert.doesNotMatch(line, /this computer|--download-model|smart-search on/);
  assert.match(formatSearchLine({ state: "lexical" }), /jumpybrain smart-search explains/, "local wording is unchanged");
});

test("the installer's pinned smart-search model is the CLI's model", () => {
  assert.equal(SMART_SEARCH_MODEL.sha256, SEMANTIC_MODEL.sha256);
  assert.equal(SMART_SEARCH_MODEL.bytes, SEMANTIC_MODEL.bytes);
});

test("a keyword-search brain says so in plain words; turning smart search on explains first and downloads nothing", async t => {
  const f = await fixture(t);
  const status = JSON.parse(f.ok(["smart-search", "--root", f.root, "--json"]).stdout);
  assert.equal(status.search, "keyword");
  assert.equal(status.model.present, false);
  const text = f.ok(["smart-search", "status", "--root", f.root]).stdout;
  assert.match(text, /Search: keyword search/);
  assert.match(text, /334 MB language model/);
  assert.match(text, /Turn it on: jumpybrain smart-search on/);

  assert.match(f.ok(["status", "--root", f.root]).stdout, /^Search: keyword search/m);
  assert.equal(JSON.parse(f.ok(["status", "--root", f.root, "--json"]).stdout).search, "keyword");
  assert.match(f.ok(["doctor", "--root", f.root]).stdout, /^- Search: keyword search/m);
  assert.equal(JSON.parse(f.ok(["doctor", "--root", f.root, "--json"]).stdout).memoryRoot.search, "keyword");

  const consent = f.ok(["smart-search", "on", "--root", f.root]);
  assert.match(consent.stdout, /Nothing was downloaded/);
  assert.match(consent.stdout, /--download-model/);
  assert.equal(JSON.parse(f.ok(["smart-search", "on", "--root", f.root, "--json"]).stdout).state, "consent_required");
  assert.equal(existsSync(path.join(f.home, ".jumpybrain/models")), false, "no model directory without consent");
  assert.equal((await f.policy())?.mode ?? "lexical", "lexical");
});

test("smart search off returns to keyword search, keeps the model unless asked, and --remove-model frees it", async t => {
  const f = await fixture(t);
  await f.enableSmartSearch();
  const before = JSON.parse(f.ok(["smart-search", "--root", f.root, "--json"]).stdout);
  assert.equal(before.search, "smart");
  assert.equal(before.ready, false, "a planted model with no semantic index is not ready");
  assert.match(f.ok(["doctor", "--root", f.root]).stdout, /^- Search: smart search is on but/m);

  const off = f.ok(["smart-search", "off", "--root", f.root]);
  assert.match(off.stdout, /Smart search is off/);
  assert.match(off.stdout, /--remove-model/);
  assert.equal((await f.policy()).mode, "lexical");
  assert.equal(existsSync(f.model), true, "the model stays for other brains by default");
  assert.equal(JSON.parse(f.ok(["smart-search", "--root", f.root, "--json"]).stdout).search, "keyword");

  const removed = JSON.parse(f.ok(["smart-search", "off", "--root", f.root, "--remove-model", "--json"]).stdout);
  assert.equal(removed.modelRemoved, true);
  assert.equal(existsSync(f.model), false);
  assert.match(f.ok(["smart-search", "off", "--root", f.root, "--remove-model"]).stdout, /No downloaded model was found/);
});

test("old index flags keep working beside smart-search", async t => {
  const f = await fixture(t);
  await f.enableSmartSearch();
  f.ok(["index", "--root", f.root, "--lexical"]);
  assert.equal((await f.policy()).mode, "lexical");
  await rm(f.model);
  assert.equal(JSON.parse(f.ok(["index", "--root", f.root, "--setup-semantic", "--json"]).stdout).status, "consent_required");
});

test("smart-search validates flags, stays local and respects read-only command mode", async t => {
  const f = await fixture(t);
  for (const args of [["maybe"], ["on", "--remove-model"], ["off", "--download-model"], ["status", "--download-model"], ["on", "--model-file", "relative.gguf"], ["on", "--download-model", "--model-file", "/abs/model.gguf"]]) {
    const result = f.run(["smart-search", ...args, "--root", f.root]);
    assert.equal(result.status, 1, args.join(" "));
  }
  assert.match(f.run(["smart-search", "--target-url", "https://brain.example"]).stderr, /computer that holds the brain/);
  const blocked = f.run(["smart-search", "off", "--root", f.root], { JUMPYBRAIN_READ_ONLY_COMMANDS: "1" });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /JUMPYBRAIN_READ_ONLY_COMMANDS/);
  f.ok(["smart-search", "status", "--root", f.root], { JUMPYBRAIN_READ_ONLY_COMMANDS: "1" });
  assert.match(f.ok(["smart-search", "--help"]).stdout, /Usage: jumpybrain smart-search/);
  assert.match(f.ok(["--help"]).stdout, /smart-search/);
});

test("model removal touches only the managed file named by its identity", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-model-remove-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const id = `sha256:${"a".repeat(64)}`, file = path.join(directory, `${"a".repeat(64)}.gguf`), other = path.join(directory, "user-selected.gguf");
  await writeFile(file, "x".repeat(10)); await writeFile(other, "keep");
  assert.deepEqual(await localModelFile(id, { directory }), { path: file, present: true, bytes: 10 });
  assert.deepEqual(await removeLocalModel(id, { directory }), { path: file, removed: true, bytes: 10 });
  assert.deepEqual(await removeLocalModel(id, { directory }), { path: file, removed: false, bytes: 0 });
  // A linked model directory is never followed to a same-named file elsewhere.
  const elsewhere = path.join(directory, "elsewhere"), linked = path.join(directory, "linked");
  await mkdir(elsewhere); await writeFile(path.join(elsewhere, `${"a".repeat(64)}.gguf`), "outside"); await symlink(elsewhere, linked);
  await assert.rejects(removeLocalModel(id, { directory: linked }), /plain directory/);
  assert.equal(await readFile(path.join(elsewhere, `${"a".repeat(64)}.gguf`), "utf8"), "outside");
  assert.equal(await readFile(other, "utf8"), "keep");
  await assert.rejects(removeLocalModel("../escape", { directory }), /Invalid device-local model identity/);
});
