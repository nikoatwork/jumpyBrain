// Production gateway + production Chromium shell + real CLI; disposable roots and key file only.
// A remote key entered in Settings lands in the owner-only .env file, survives a
// gateway restart (what an app update does), and the CLI reuses it with no
// JUMPYBRAIN_API_KEY. Use existing dist (do not build here):
// npx --package=playwright node scripts/companion-env-credentials-smoke.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstat, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { appCredentials, startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controlKey = randomBytes(32).toString("hex");
const remoteKey = "disposable-env-key-" + randomBytes(12).toString("hex");
const id = "mem_a0000000-0000-4000-8000-000000000001";
const errors = [];
let temporary, gateway, remote, browser;
async function until(predicate, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 30)); }
  throw new Error(message);
}
try {
  temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-env-credentials-smoke-")));
  const directory = path.join(temporary, "support"), file = path.join(temporary, "home", ".config", "jumpybrain", ".env");
  await mkdir(directory, { mode: 0o700 });
  const roots = { local: path.join(temporary, "local"), remote: path.join(temporary, "remote") };
  for (const [name, root] of Object.entries(roots)) {
    await createServerMemoryRuntime({ root }).initializeMemoryRoot();
    await writeFile(path.join(root, "notes", "fixture.md"), `---\nid: ${id}\ntype: note\ntitle: ${name} fixture\n---\nBody ${name}\n`);
  }
  remote = await startJumpyBrainHttpServer({ root: roots.remote, apiKeys: [remoteKey], host: "127.0.0.1", port: 0, autoIndex: false });
  const remoteUrl = remote.url ?? "http://127.0.0.1:" + remote.server.address().port;
  const native = { selectFolder: async () => null, close() {}, setDiagnosticReporter() {} };
  const start = async (port = 0) => startCompanionGateway({ runtimeRoot, directory, initialRoot: roots.local, port, controlKey,
    credentials: await appCredentials(runtimeRoot, native, { file }), identityFile: path.join(temporary, "identity.json") });
  gateway = await start();
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  const context = await browser.newContext();
  context.setDefaultTimeout(12000);
  const settings = await context.newPage();
  settings.on("pageerror", (error) => errors.push(error.message));
  await settings.goto(gateway.url + "/settings#companion=" + controlKey);
  await settings.waitForFunction(() => companionRegistered && !companionFrozen);

  await settings.locator("#companion-add").evaluate((item) => { item.open = true; });
  await settings.locator("#companion-kind").selectOption("remote");
  assert.match(await settings.locator("#companion-key-help").textContent(), /~\/\.config\/jumpybrain\/\.env/);
  assert.doesNotMatch(await settings.locator("#companion-settings").textContent(), /Keychain/);
  await settings.locator("#companion-name").fill("VPS brain");
  await settings.locator("#companion-url").fill(remoteUrl);
  await settings.locator("#companion-key").fill(remoteKey);
  const revision = gateway.state().revision;
  await settings.locator("#companion-form button[type=submit]").click();
  await until(() => gateway.state().revision > revision, "UI profile save did not commit");
  const profile = gateway.state().profiles.find((item) => item.name === "VPS brain");
  assert.ok(profile, "remote profile saved");
  const text = await readFile(file, "utf8");
  assert.match(text, new RegExp("^JUMPYBRAIN_KEY_[0-9A-F_]+=" + remoteKey + "$", "m"));
  assert.equal((await lstat(file)).mode & 0o777, 0o600);
  for (const name of await readdir(directory)) {
    const entry = path.join(directory, name);
    if ((await lstat(entry)).isFile()) assert.doesNotMatch(await readFile(entry, "utf8"), new RegExp(remoteKey));
  }
  assert.doesNotMatch(await settings.content(), new RegExp(remoteKey), "the key never returns to the page");

  // Restart the gateway on the same port with a fresh adapter: an app update.
  const port = Number(new URL(gateway.url).port);
  await gateway.close();
  gateway = await start(port);
  await settings.goto(gateway.url + "/settings#companion=" + controlKey);
  await settings.waitForFunction(() => companionRegistered && !companionFrozen);
  const test = await settings.evaluate(async (profileId) => (await fetch("/companion/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: profileId }) })).json(), profile.id);
  assert.equal(test.health, "connected", "the key is still readable after restart: " + JSON.stringify(test));

  // The CLI reuses the app's key for that URL with no JUMPYBRAIN_API_KEY.
  const cli = path.join(runtimeRoot, "dist/cli.js");
  const env = { ...process.env, JUMPYBRAIN_API_KEY: "", JUMPYBRAIN_ENV_FILE: file, JUMPYBRAIN_CLI_CONFIG: path.join(temporary, "no-policy.json") };
  const { stdout } = await promisify(execFile)(process.execPath, [cli, "status", "--target-url", remoteUrl, "--json"], { env, timeout: 20000 });
  const status = JSON.parse(stdout);
  assert.equal(status.memory, "all"); assert.equal(status.initialized, true, "CLI status authenticated to the remote brain");
  await assert.rejects(promisify(execFile)(process.execPath, [cli, "status", "--target-url", "http://127.0.0.1:9", "--json"], { env, timeout: 20000 }),
    (error) => /No access key for/.test(error.stderr) && !error.stderr.includes(remoteKey));
  // Upgrade from a Keychain build: the profile keeps its reference but the file has no key.
  // The connection reports the missing key, and re-entering it in Settings repairs it.
  await writeFile(file, (await readFile(file, "utf8")).replace(/^JUMPYBRAIN_(KEY|URL)_.*\n/gm, ""), { mode: 0o600 });
  const health = async () => (await settings.evaluate(async (profileId) => (await fetch("/companion/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: profileId }) })).json(), profile.id)).health;
  assert.equal(await health(), "credential_unavailable");
  const before = gateway.state().revision;
  await settings.locator(".companion-profile").filter({ hasText: "VPS brain" }).getByRole("button", { name: "Edit", exact: true }).click();
  await settings.locator("#companion-key").fill(remoteKey);
  await settings.locator("#companion-form button[type=submit]").click();
  await until(() => gateway.state().revision > before, "key repair did not commit");
  assert.equal(await health(), "connected", "re-entered key repairs the migrated connection");
  assert.equal((await readFile(file, "utf8")).match(/^JUMPYBRAIN_KEY_/gm).length, 1);
  assert.deepEqual(errors, [], "unexpected browser JavaScript errors");
  console.log("companion .env credentials smoke: PASS (Settings save → 0600 file, restart keeps key, CLI reuses it, Keychain-era profile repaired by re-entry, no key in page/support files)");
} catch (error) {
  console.error("companion .env credentials smoke: FAIL - " + (error.stack || error.message));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await gateway?.close().catch(() => {});
  await remote?.close().catch(() => {});
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
