// Access keys in the hosted browser dialog and in Mac-app Settings, against a
// production server and gateway with disposable roots and keys.
// Use existing dist (do not build here):
// npx --package=playwright node scripts/access-keys-smoke.mjs [--shots <directory>]
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv.includes("--shots") ? path.resolve(process.argv[process.argv.indexOf("--shots") + 1]) : null;
const setupKey = "disposable-setup-" + randomBytes(16).toString("hex");
const controlKey = randomBytes(32).toString("hex");
const errors = [];
let temporary, remote, gateway, browser, stage = "bootstrap";
const check = async (name, operation) => { stage = name; await operation(); console.log("  ok - " + name); };
const shot = async (page, name) => { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + ".png") }); } };
const text = (page, id) => page.locator("#" + id).textContent();

async function createKey(page, name, role) {
  await page.locator("#access-keys-name").fill(name);
  await page.locator("#access-keys-role").selectOption(role);
  await page.locator("#access-keys-create").click();
  await page.locator("#access-keys-new").waitFor();
  const token = await page.locator("#access-keys-secret").inputValue();
  assert.match(token, /^jb_/);
  return token;
}
const activeRow = (page, name) => page.locator("#access-keys-list .access-key").filter({ hasText: name });

try {
  temporary = await mkdtemp(path.join(os.tmpdir(), "jb-access-keys-smoke-"));
  const roots = { local: path.join(temporary, "local"), remote: path.join(temporary, "remote") };
  for (const root of Object.values(roots)) { await mkdir(root); await initializeMemoryRoot(root); }
  await mkdir(path.join(temporary, "support"), { mode: 0o700 });
  remote = await startJumpyBrainHttpServer({ root: roots.remote, apiKeys: [setupKey], host: "127.0.0.1", port: 0, autoIndex: false });
  const keys = new Map();
  gateway = await startCompanionGateway({ runtimeRoot, directory: path.join(temporary, "support"), initialRoot: roots.local, port: 0, controlKey,
    credentials: { get: async ref => keys.get(ref) ?? null, set: async (ref, key) => { keys.set(ref, key); }, delete: async ref => { keys.delete(ref); }, selectFolder: async () => roots.local },
    switchTimeoutMs: 10000, targetTimeoutMs: 5000, identityFile: path.join(temporary, "identity.json") });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  context.setDefaultTimeout(12000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));

  // Hosted browser: the person who set up the server opens its address.
  const hosted = await context.newPage();
  const openHosted = async () => { await hosted.locator("#open-connection").click(); await hosted.locator("#open-access-keys").click(); await hosted.locator("#access-keys-dialog[open]").waitFor(); };
  const connectAs = async key => {
    await hosted.locator("#open-connection").click(); await hosted.locator("#api-key").fill(key); await hosted.locator("#connection-submit").click();
    await hosted.waitForFunction(() => connectionStatus === "connected" && activeApiKey === "browser-session");
  };
  let adaKey, bobKey;
  await check("hosted: setup key creates an admin key, shown once and copyable", async () => {
    await hosted.goto(remote.url + "/#apiKey=" + setupKey);
    await hosted.waitForFunction(() => connectionStatus === "connected");
    await openHosted();
    await hosted.locator("#access-keys-form").waitFor();
    assert.match(await text(hosted, "access-keys-intro"), /setup key/);
    assert.match(await text(hosted, "access-keys-list"), /No keys yet/);
    assert.equal(await hosted.locator("#access-keys-create").isDisabled(), true, "a name is required");
    adaKey = await createKey(hosted, "Ada", "admin");
    await shot(hosted, "hosted-new-key");
    await hosted.locator("#access-keys-copy").click();
    assert.equal(await hosted.evaluate(() => navigator.clipboard.readText()), adaKey);
    await hosted.locator("#access-keys-copy-invite").click();
    const invite = await hosted.evaluate(() => navigator.clipboard.readText());
    assert.ok(invite.includes("Address: " + new URL(remote.url).origin) && invite.includes("Access key: " + adaKey));
    await hosted.locator("#access-keys-done").click();
    assert.equal(await hosted.locator("#access-keys-new").isHidden(), true);
    assert.equal(await hosted.locator("#access-keys-secret").inputValue(), "");
    assert.equal(await activeRow(hosted, "Ada").locator(".access-key-badge").first().textContent(), "Admin");
    assert.equal((await hosted.content()).includes(adaKey), false, "the secret leaves the page after Done");
  });
  await check("hosted: duplicate names are refused, keys are revoked after confirmation", async () => {
    bobKey = await createKey(hosted, "Bob", "reader");
    await hosted.locator("#access-keys-done").click();
    await hosted.locator("#access-keys-name").fill("bob"); await hosted.locator("#access-keys-create").click();
    assert.match(await text(hosted, "access-keys-message"), /already named/);
    await createKey(hosted, "Temp agent", "writer"); await hosted.locator("#access-keys-done").click();
    hosted.once("dialog", dialog => { assert.match(dialog.message(), /Revoke “Temp agent”/); dialog.dismiss(); });
    await activeRow(hosted, "Temp agent").getByRole("button", { name: "Revoke key Temp agent" }).click();
    assert.equal(await activeRow(hosted, "Temp agent").count(), 1, "dismissing keeps the key");
    hosted.once("dialog", dialog => dialog.accept());
    await activeRow(hosted, "Temp agent").getByRole("button", { name: "Revoke key Temp agent" }).click();
    await hosted.waitForFunction(() => /Revoked “Temp agent”/.test(document.getElementById("access-keys-message").textContent));
    assert.equal(await activeRow(hosted, "Temp agent").count(), 0);
    assert.match(await text(hosted, "access-keys-revoked-summary"), /\(1\)/);
    await shot(hosted, "hosted-list");
    await hosted.keyboard.press("Escape");
    assert.equal(await hosted.locator("#access-keys-dialog[open]").count(), 0);
  });
  await check("hosted: a personal admin key cannot revoke itself; a reader sees its own role only", async () => {
    await connectAs(adaKey);
    await openHosted(); await hosted.locator("#access-keys-form").waitFor();
    assert.doesNotMatch(await text(hosted, "access-keys-intro"), /setup key/);
    const own = activeRow(hosted, "Ada");
    assert.match(await own.textContent(), /This key/);
    assert.equal(await own.getByRole("button").isDisabled(), true);
    await hosted.locator("#access-keys-close").click();
    await connectAs(bobKey);
    await openHosted();
    await hosted.waitForFunction(() => /reader key named “Bob”/.test(document.getElementById("access-keys-intro").textContent));
    assert.equal(await hosted.locator("#access-keys-form").isHidden(), true);
    assert.equal(await hosted.evaluate(() => connectionStatus), "connected", "a non-admin never calls the admin route");
    await hosted.locator("#access-keys-close").click();
  });
  await check("hosted: narrow layout keeps the form usable", async () => {
    await connectAs(adaKey);
    await hosted.setViewportSize({ width: 390, height: 780 });
    await openHosted(); await hosted.locator("#access-keys-form").waitFor();
    assert.equal(await hosted.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await shot(hosted, "hosted-narrow");
    await hosted.locator("#access-keys-close").click();
  });

  // Mac app Settings through the production gateway.
  const native = async (route, body) => {
    const response = await fetch(gateway.url + route, { method: "POST", headers: { Authorization: "Bearer " + controlKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200, route + " " + await response.clone().text()); return response.json();
  };
  const settings = await context.newPage();
  const ready = () => settings.waitForFunction(() => companionRegistered && !companionFrozen && companionState.phase === "idle");
  let remoteId;
  await check("app: a local brain explains that no keys are needed", async () => {
    await settings.goto(gateway.url + "/settings?section=access#companion=" + controlKey); await ready();
    await settings.waitForFunction(() => /needs no access keys/.test(document.getElementById("access-keys-intro").textContent));
    assert.equal(await settings.locator("#access-keys-form").isHidden(), true);
    assert.equal(await text(settings, "settings-section-title"), "Access keys");
    await shot(settings, "app-local");
  });
  await check("app: a remote brain without editing approval lists keys but cannot change them", async () => {
    const saved = await native("/companion/profiles", { profile: { name: "Team brain", kind: "remote", url: remote.url, key: adaKey }, revision: gateway.state().revision });
    remoteId = saved.profiles.find(profile => profile.kind === "remote").id;
    await native("/companion/switch", { id: remoteId });
    await settings.waitForURL(url => url.searchParams.get("brain") === remoteId); await ready();
    await settings.locator('[data-settings-section="access"]').click();
    await settings.locator("#access-keys-list .access-key").first().waitFor();
    assert.match(await text(settings, "access-keys-message"), /Editing is turned off/);
    assert.equal(await settings.locator("#access-keys-name").isDisabled(), true);
    assert.equal(await activeRow(settings, "Bob").getByRole("button").isDisabled(), true);
  });
  await check("app: with editing approval an admin creates and revokes keys; leaving drops the secret", async () => {
    const profile = gateway.state().profiles.find(item => item.id === remoteId);
    await native("/companion/profiles", { profile: { id: remoteId, name: profile.name, kind: "remote", url: remote.url, allowWrites: true }, revision: gateway.state().revision });
    // The approval change starts a new generation; open tabs reload to Settings for that brain.
    await settings.waitForFunction(generation => companionRegistered && !companionFrozen && companionState.generation === generation, gateway.state().generation);
    await settings.locator('[data-settings-section="access"]').click();
    await settings.locator("#access-keys-form").waitFor();
    assert.match(await text(settings, "access-keys-intro"), new RegExp(new URL(remote.url).host));
    const token = await createKey(settings, "Laptop agent", "writer");
    await shot(settings, "app-new-key");
    const check = await fetch(remote.url + "/capabilities", { headers: { Authorization: "Bearer " + token } });
    assert.equal((await check.json()).principal.name, "Laptop agent");
    await settings.locator('[data-settings-section="appearance"]').click();
    await settings.waitForFunction(() => document.body.dataset.settingsPage === "appearance");
    assert.equal((await settings.content()).includes(token), false);
    await settings.locator('[data-settings-section="access"]').click();
    await activeRow(settings, "Laptop agent").waitFor();
    settings.once("dialog", dialog => dialog.accept());
    await activeRow(settings, "Laptop agent").getByRole("button").click();
    await settings.waitForFunction(() => /Revoked “Laptop agent”/.test(document.getElementById("access-keys-message").textContent));
    assert.equal((await fetch(remote.url + "/capabilities", { headers: { Authorization: "Bearer " + token } })).status, 401);
    await shot(settings, "app-list");
  });
  assert.deepEqual(errors, [], "page errors");
  console.log("PASS: access keys in the hosted dialog and app Settings.");
} catch (error) {
  console.error("FAIL at: " + stage); console.error(error); if (errors.length) console.error("page errors:", errors); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); await gateway?.close().catch(() => {}); await remote?.close().catch(() => {});
  if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
