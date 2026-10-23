// Production editor + real companion gateway/Markdown engine, disposable roots only.
// Build separately first; this runner deliberately never builds, installs or indexes.
// npx --package=playwright node scripts/missing-reference-pages-smoke.mjs
// Narrow touch Chromium is not physical Mac/IME/assistive-technology validation.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorEnd, editorMarkdown, editorSelection, replaceEditorText, selectEditorText } from "./editor-smoke-helpers.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const referenceSelector = "#note-editor [data-page-reference]";
const failures = [];
let browser, passed = 0;
async function until(predicate, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(30); }
  throw new Error(message || "condition timed out");
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function saved(page) { await page.waitForFunction(() => document.querySelector("#note-save-state")?.textContent === "Saved"); }
async function settle(page) { await page.waitForTimeout(1100); }
function endpoint(request, suffix) { return new URL(request.url()).pathname === "/memories/all/" + suffix; }
async function paste(page, text) {
  await editorEnd(page);
  await page.locator("#note-editor").evaluate((element, value) => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  }, text);
}
async function activate(page, title, mobile) {
  if (await page.locator("#note-editor").evaluate(element => element.isContentEditable)) {
    await selectEditorText(page, 0);
    await page.waitForFunction(() => richEditor.captureSelection()?.isCollapsed() === true);
  }
  await page.locator("[data-reference-autocomplete]").waitFor({ state: "hidden" });
  const reference = page.locator(referenceSelector).filter({ hasText: `[[${title}]]` }).first();
  if (mobile) { await page.waitForTimeout(550); await reference.tap(); }
  else await reference.click();
}

async function fixture(mobile) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-missing-reference-smoke-")));
  const root = path.join(temporary, "local"), remoteRoot = path.join(temporary, "remote"), directory = path.join(temporary, "support");
  const controlKey = randomBytes(32).toString("hex"), remoteKey = randomBytes(32).toString("hex"), keys = new Map();
  await mkdir(directory, { mode: 0o700 });
  for (const memoryRoot of [root, remoteRoot]) await createServerMemoryRuntime({ root: memoryRoot }).initializeMemoryRoot();
  const remote = await startJumpyBrainHttpServer({ root: remoteRoot, apiKeys: [remoteKey], port: 0, autoIndex: false });
  const gateway = await startCompanionGateway({ runtimeRoot, directory, initialRoot: root, port: 0, controlKey, switchTimeoutMs: 5000,
    credentials: { get: async ref => keys.get(ref) ?? null, set: async (ref, key) => { keys.set(ref, key); }, delete: async ref => { keys.delete(ref); } } });
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: mobile ? 844 : 900 }, hasTouch: mobile, isMobile: mobile });
  context.setDefaultTimeout(15000);
  const errors = [];
  context.on("page", page => { page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept()); });
  const native = (route, body, fenced = false) => fetch(gateway.url + route, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + controlKey, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(fenced ? { "X-Companion-Generation": String(gateway.coordinator.generation) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const initial = gateway.state().activeId;
  const profileResponse = await native("/companion/profiles", { profile: { name: "Read-only smoke", kind: "remote", url: remote.url, key: remoteKey }, revision: gateway.state().revision });
  assert.equal(profileResponse.status, 200);
  const remoteProfile = (await profileResponse.json()).profiles.find(profile => profile.kind === "remote");
  async function put(body, title = "Missing reference smoke source", targetRoot = root) {
    const id = "mem_" + randomUUID(), file = path.join(targetRoot, "notes", id + ".md");
    await writeFile(file, `---\nid: ${JSON.stringify(id)}\ntype: note\ntitle: ${JSON.stringify(title)}\n---\n${body}\n`);
    return { id, title, file };
  }
  async function open(source) {
    const page = await context.newPage();
    await page.goto(gateway.url + "/?note=" + source.id + "&brain=" + gateway.state().activeId + "#companion=" + controlKey);
    await page.locator("#note-editor").waitFor();
    await page.waitForFunction(title => companionRegistered && !companionFrozen && document.querySelector("#note-name")?.value === title, source.title);
    assert.equal(await page.locator("#reference-creation-retry").count(), 1, "rebuild dist: production missing-reference creation controls are required");
    return page;
  }
  async function resolve(title) {
    const response = await native("/memories/all/resolve-title", { title }, true);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  async function found(title) { let result; await until(async () => { result = await resolve(title); return result.status === "found"; }, "page was not created: " + title); return result; }
  async function count(title, targetRoot = root) {
    const files = await readdir(path.join(targetRoot, "pages"), { recursive: true });
    let matches = 0;
    for (const file of files.filter(file => file.endsWith(".md"))) {
      const content = await readFile(path.join(targetRoot, "pages", file), "utf8");
      const line = content.split(/\r?\n/).find(line => line.startsWith("title:"));
      if (line) {
        let value = line.slice(6).trim();
        try { value = JSON.parse(value); } catch { value = value.replace(/^'(.*)'$/, "$1").replace(/''/g, "'"); }
        if (value.trim().toLowerCase() === title.trim().toLowerCase()) matches++;
      }
    }
    return matches;
  }
  async function close(page) { await page.close(); await until(() => gateway.coordinator.tabs.size === 0, "scenario tab did not unregister"); }
  return { temporary, root, remoteRoot, gateway, context, errors, native, initial, remoteProfile, put, open, resolve, found, count, close,
    cleanup: async () => { await context.close(); await gateway.close(); await remote.close(); await rm(temporary, { recursive: true, force: true }); } };
}

async function activation(f, mobile) {
  const missing = "Activation blank " + randomUUID(), existingTitle = "Existing target " + randomUUID();
  const existing = await f.put("Existing body", existingTitle);
  const source = await f.put(`Source [[${existingTitle}]] and [[${missing}]]`);
  const page = await f.open(source);
  try {
    await settle(page);
    assert.equal((await f.resolve(missing)).status, "missing", "hydration must not create unresolved references");
    await activate(page, existingTitle, mobile);
    await page.waitForURL(url => url.searchParams.get("note") === existing.id);
    await page.goBack();
    await page.waitForFunction(title => document.querySelector("#note-name")?.value === title, source.title);
    await activate(page, missing, mobile);
    const target = await f.found(missing);
    await page.waitForURL(url => url.searchParams.get("note") === target.id);
    await page.waitForFunction(title => document.querySelector("#note-name")?.value === title, missing);
    assert.equal((await editorMarkdown(page)).trim(), `# ${missing}`, "new page contains only its title heading");
    await appendEditorText(page, "Blank page can be edited"); await saved(page);
    await page.reload();
    await page.waitForFunction(() => richEditor?.getMarkdown().includes("Blank page can be edited"));
    assert.equal(await f.count(missing), 1);
  } finally { await f.close(page); }
}

async function completed(f, mobile, method) {
  const old = "Hydrated old " + randomUUID(), title = method + " completed " + randomUUID();
  const source = await f.put(`Source [[${old}]]\n\nWork: `);
  const page = await f.open(source), requests = [];
  page.on("request", request => { if (endpoint(request, "ensure-title")) requests.push(request); });
  let release;
  try {
    await settle(page);
    const gate = deferred(); let saving = false;
    release = gate.resolve;
    await page.route("**/memories/all/documents/*", async route => {
      if (route.request().method() === "PUT") { saving = true; await gate.promise; }
      await route.continue();
    });
    await editorEnd(page);
    if (method === "typed") await page.keyboard.type(`[[${title}]]`);
    else await paste(page, `[[${title}]]`);
    const selection = await editorSelection(page), draft = await editorMarkdown(page);
    await until(() => saving, "completed reference did not trigger a source save");
    assert.equal(requests.length, 0, "target creation must wait for confirmed source save");
    assert.equal((await f.resolve(title)).status, "missing");
    release();
    const target = await f.found(title); await saved(page); await settle(page);
    assert.equal(new URL(page.url()).searchParams.get("note"), source.id, "completion remains in source");
    assert.equal(await editorMarkdown(page), draft);
    assert.deepEqual(await editorSelection(page), selection, "creation preserves the caret");
    assert.ok((await readFile(source.file, "utf8")).includes(`[[${title}]]`));
    assert.equal((await f.resolve(old)).status, "missing", "unrelated input must not materialize pre-existing references");
    await appendEditorText(page, `\nAgain [[${title}]]`); await saved(page); await settle(page);
    assert.equal((await f.resolve(title)).id, target.id);
    assert.equal(await f.count(title), 1, "repeated completion must reuse the page");
  } finally { release?.(); await f.close(page); }
}

async function inert(f) {
  const names = ["Inline", "Fenced", "Escaped", "Incomplete"].map(name => name + " inert " + randomUUID());
  const source = await f.put("Source paragraph");
  const page = await f.open(source), requests = [];
  page.on("request", request => { if (endpoint(request, "ensure-title")) requests.push(request); });
  try {
    await replaceEditorText(page, `Source paragraph\n\n\`[[${names[0]}]]\`\n\n\`\`\`text\n[[${names[1]}]]\n\`\`\`\n\n\\[[${names[2]}]]\n\n[[${names[3]}`);
    await saved(page); await settle(page);
    assert.equal(requests.length, 0, "code, escaped and unfinished references must not create pages");
    for (const title of names) assert.equal((await f.resolve(title)).status, "missing");
  } finally { await f.close(page); }
}

async function failedSave(f) {
  const title = "Failed save " + randomUUID(), source = await f.put("Source paragraph"), page = await f.open(source), requests = [];
  page.on("request", request => { if (endpoint(request, "ensure-title")) requests.push(request); });
  try {
    await page.route("**/memories/all/documents/*", route => route.request().method() === "PUT"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "smoke_save_failed", message: "Disposable save outage" } }) }) : route.continue());
    await appendEditorText(page, ` [[${title}]]`);
    await page.waitForFunction(() => document.querySelector("#note-save-state")?.textContent === "Save failed");
    await settle(page);
    assert.equal(requests.length, 0);
    assert.equal((await f.resolve(title)).status, "missing");
    assert.ok((await editorMarkdown(page)).includes(`[[${title}]]`), "failed save retains the draft");
    assert.ok(!(await readFile(source.file, "utf8")).includes(title));
    await page.unroute("**/memories/all/documents/*");
    await page.locator("#note-retry").click(); await saved(page); await f.found(title);
    assert.equal(await f.count(title), 1, "explicit source-save recovery creates the target once");
  } finally { await f.close(page); }
}

async function lostResponse(f) {
  const title = "Lost response " + randomUUID(), source = await f.put("Source paragraph"), page = await f.open(source);
  const responses = []; let lose = true;
  try {
    await page.route("**/memories/all/ensure-title", async route => {
      const response = await route.fetch(); responses.push(await response.json());
      if (lose) { lose = false; await route.abort("connectionreset"); }
      else await route.fulfill({ response });
    });
    await appendEditorText(page, ` [[${title}]]`); await saved(page);
    await page.locator("#reference-creation-retry").waitFor({ state: "visible" });
    assert.ok(await page.locator("#reference-creation-status").textContent());
    assert.equal(responses.length, 1, "uncertain creation must await an explicit retry");
    assert.equal(responses[0].created, true);
    const firstId = (await f.found(title)).id;
    await page.locator("#reference-creation-retry").click();
    await until(() => responses.length === 2, "explicit missing-page retry did not run");
    await page.locator("#reference-creation-retry").waitFor({ state: "hidden" });
    assert.equal(responses[1].id, firstId);
    assert.equal(responses[1].created, false);
    assert.equal(await f.count(title), 1);
    assert.equal(new URL(page.url()).searchParams.get("note"), source.id);
  } finally { await f.close(page); }
}

async function readOnly(f, mobile) {
  const title = "Read-only missing " + randomUUID(), source = await f.put(`Source [[${title}]]`, "Read-only source", f.remoteRoot);
  const switched = await f.native("/companion/switch", { id: f.remoteProfile.id }); assert.equal(switched.status, 200);
  const page = await f.open(source);
  try {
    assert.equal(await page.locator("#note-editor").getAttribute("contenteditable"), "false");
    await activate(page, title, mobile);
    await page.waitForFunction(() => /read.only|permission|no page|missing|not found/i.test(document.querySelector("#toast-message")?.textContent || ""));
    assert.equal(new URL(page.url()).searchParams.get("note"), source.id);
    const denied = await page.evaluate(async title => {
      const response = await fetch("/memories/all/ensure-title", { method: "POST", headers: { "Content-Type": "application/json", "X-Companion-Generation": String(companionState.generation), "X-Companion-Tab": companionTabId }, body: JSON.stringify({ title }) });
      return response.status;
    }, title);
    assert.equal(denied, 403);
    assert.equal((await f.resolve(title)).status, "missing");
    assert.equal(await f.count(title, f.remoteRoot), 0);
  } finally { await f.close(page); }
}

try {
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  for (const mobile of [false, true]) {
    const f = await fixture(mobile), prefix = mobile ? "touch-390" : "desktop-1280";
    try {
      for (const [name, operation] of [["hydrate-activate-edit-reload", activation], ["typed-after-confirmed-save", (f, mobile) => completed(f, mobile, "typed")],
        ["pasted-after-confirmed-save", (f, mobile) => completed(f, mobile, "pasted")], ["code-escape-incomplete-inert", inert], ["failed-save-recovery", failedSave],
        ["lost-creation-response-explicit-retry", lostResponse], ["read-only-no-creation", readOnly]]) {
        const label = `${prefix}-${name}`;
        try { await operation(f, mobile); passed++; console.log("  ok - " + label); }
        catch (error) { failures.push({ scenario: label, error: error.stack || String(error) }); console.error("  FAIL - " + label + ": " + error.message); }
      }
      assert.deepEqual(f.errors, [], "unexpected production-shell JavaScript errors");
    } finally { await f.cleanup(); }
  }
  console.log(`missing reference pages smoke: ${failures.length ? "FAIL" : "PASS"} (${passed} passed, ${failures.length} failed)`);
  if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
} finally { if (browser) await browser.close(); }
