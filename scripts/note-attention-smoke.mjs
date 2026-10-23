// Production shell and canonical HTTP lifecycle against disposable Markdown only.
// Run against an existing build: npx --package=playwright node scripts/note-attention-smoke.mjs
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown, editorSelection, selectEditorText } from "./editor-smoke-helpers.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-attention-"));
const screenshots = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || "/tmp/jumpybrain-attention-qa";
const key = "disposable-note-attention-key";
const ids = [1, 2, 3].map(n => `mem_99000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const titles = ["Attention lifecycle fixture", "Other working note", "Snoozed note returns automatically"];
const body = "First paragraph stays intact.\n\nA second paragraph for a stable caret.\n";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const errors = [], patches = [];
let server, browser, page;
const documentPath = id => `/memories/all/documents/${id}`;
const row = (id, section = "recent") => page.locator(`#sidebar-${section} a[data-page-link="${id}"]`);
async function json(route, options = {}) {
  const response = await fetch(server.url + route, { ...options, headers: { ...headers, ...options.headers } });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function saved() {
  await page.waitForFunction(() => state.editor?.state.loaded && !state.editor.state.navigationPending && !state.editor.state.dirty && state.editor.state.saveStatus === "saved");
}
async function settled() {
  await page.waitForFunction(() => !state.editor?.state.navigationPending && state.editor?.state.frontmatterPrefix.includes("attention_at: null"));
}
async function bringBack() {
  // Reset fixture state after testing persistence; the removed toolbar has no reactivation action.
  const current = await json(documentPath(ids[0]));
  await json(documentPath(ids[0]), { method: "PATCH", headers: { "If-Match": current.contentHash }, body: JSON.stringify({ action: "reactivate" }) });
  await page.reload(); await page.locator("#note-editor").waitFor();
}
async function sidebarAction(action) {
  await page.locator(`[data-page-link="${ids[0]}"]`).hover();
  await page.locator(`[data-page-action="${ids[0]}:${action}"]`).click();
}
async function pin() {
  await page.locator(`[data-page-link="${ids[0]}"]`).hover();
  await page.locator(`[data-page-pin="${ids[0]}"]`).click();
}
async function assertFits(label) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(sizes.document <= sizes.viewport && sizes.body <= sizes.viewport, `${label}: no horizontal page overflow ${JSON.stringify(sizes)}`);
  const toast = page.locator("#app-toast");
  if (await toast.isVisible()) {
    const box = await toast.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, `${label}: toast fits width`);
  }
  const dialog = page.locator("#note-snooze");
  if (await dialog.isVisible()) {
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${label}: snooze dialog fits width`);
    assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1, `${label}: snooze dialog fits height`);
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), `${label}: snooze dialog has no horizontal overflow`);
  }
}
try {
  await initializeMemoryRoot(root);
  await mkdir(screenshots, { recursive: true });
  for (let n = 0; n < ids.length; n++) {
    await writeFile(path.join(root, "notes", `${n}.md`), `---\nid: ${ids[n]}\ntype: note\ntitle: ${JSON.stringify(titles[n])}\nupdated_at: 2026-10-22T12:00:0${n}Z\n---\n${body}`);
  }
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, timezoneId: "Europe/Berlin" });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.method() === "PATCH") patches.push({ url: request.url(), body: request.postDataJSON() }); });
  await page.goto(`${server.url}/?note=${ids[0]}#apiKey=${key}`);
  await page.locator("#note-editor").waitFor();
  await row(ids[0]).waitFor();
  const before = await json(documentPath(ids[0]));
  const surface = await page.locator("#note-editor").elementHandle();
  await selectEditorText(page, 6);
  const caret = await editorSelection(page);
  await row(ids[0]).hover();
  await page.locator(`[data-page-action="${ids[0]}:settle"]`).focus();
  await page.keyboard.press("Enter");
  await settled();
  await row(ids[0]).waitFor({ state: "detached" });
  assert.equal(await editorMarkdown(page), body, "settling preserves editor body");
  assert.deepEqual(await editorSelection(page), caret, "settling preserves the editor caret");
  assert.equal(await surface.evaluate(el => el === document.querySelector("#note-editor")), true, "metadata publication keeps the editor DOM");
  const confirmed = await json(documentPath(ids[0]));
  assert.equal(confirmed.frontmatter.attention_at, null);
  assert.equal(confirmed.frontmatter.updated_at, before.frontmatter.updated_at, "attention does not pretend content was edited");
  assert.notEqual(confirmed.contentHash, before.contentHash);

  // A direct URL continues to open a settled note after a full browser reload.
  await page.reload();
  await page.locator("#note-editor").waitFor();
  await settled();
  assert.equal(await page.locator("#note-name").inputValue(), titles[0]);
  await bringBack();
  await row(ids[0]).waitFor();
  assert.equal(Object.hasOwn((await json(documentPath(ids[0]))).frontmatter, "attention_at"), false);

  // Pins are scope-local navigation, independent of canonical attention state.
  await pin();
  await row(ids[0], "pinned").waitFor();
  await sidebarAction("settle");
  await settled();
  assert.equal(await row(ids[0], "pinned").count(), 1);
  assert.equal(await row(ids[0]).count(), 0);
  await page.reload(); await page.locator("#note-editor").waitFor(); await settled();
  assert.equal(await row(ids[0], "pinned").count(), 1, "pin and settled state both survive reload");
  await pin();
  assert.equal(await row(ids[0], "pinned").count(), 0);
  assert.equal(await row(ids[0]).count(), 0, "unpinning does not reactivate settled notes");
  await bringBack(); await row(ids[0]).waitFor();

  // Real menu choices publish the exact displayed local-time instants.
  for (const label of ["In 1 hour", "In 3 hours", "Tomorrow", "Next week"]) {
    await sidebarAction("snooze");
    await page.locator("#note-snooze").waitFor();
    assert.deepEqual(await page.locator("#snooze-options button span").allTextContents(), ["In 1 hour", "In 3 hours", "Tomorrow", "Next week", "Custom…"]);
    const choice = page.getByRole("menuitem", { name: new RegExp(`^${label}`) });
    const until = await choice.locator("time").getAttribute("datetime");
    assert.ok(await choice.locator("time").innerText(), "menu shows the local return time");
    await choice.click();
    await page.waitForFunction(() => !state.editor?.state.navigationPending && state.editor?.state.frontmatterPrefix.includes("attention_at:") && !state.editor.state.frontmatterPrefix.includes("attention_at: null"));
    await row(ids[0]).waitFor({ state: "detached" });
    assert.equal((await json(documentPath(ids[0]))).frontmatter.attention_at, until);
    assert.equal(await editorMarkdown(page), body);
    await bringBack(); await row(ids[0]).waitFor();
  }

  await sidebarAction("snooze");
  await page.getByRole("menuitem", { name: "Custom…", exact: true }).click();
  await page.locator("#snooze-datetime").fill("2020-01-01T10:00");
  const patchCount = patches.length;
  await page.locator('#snooze-custom button[type="submit"]').click();
  await page.locator("#snooze-error").filter({ hasText: "future" }).waitFor();
  assert.equal(patches.length, patchCount, "invalid custom time never writes");
  const custom = await page.evaluate(() => {
    const date = new Date(); date.setDate(date.getDate() + 2); date.setHours(14, 30, 0, 0);
    const local = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-") + "T14:30";
    return { local, iso: date.toISOString() };
  });
  await page.locator("#snooze-datetime").fill(custom.local);
  await page.locator('#snooze-custom button[type="submit"]').click();
  await page.waitForFunction(() => !state.editor?.state.navigationPending && state.editor?.state.frontmatterPrefix.includes("attention_at:") && !state.editor.state.frontmatterPrefix.includes("attention_at: null"));
  assert.equal((await json(documentPath(ids[0]))).frontmatter.attention_at, custom.iso);
  await bringBack();

  // A note never visited by this browser returns from the canonical wake deadline.
  const wakeNote = await json(documentPath(ids[2]));
  const until = new Date(Date.now() + 5_000).toISOString();
  await json(documentPath(ids[2]), { method: "PATCH", headers: { "If-Match": wakeNote.contentHash }, body: JSON.stringify({ action: "snooze", until }) });
  await page.reload(); await page.locator("#note-editor").waitFor();
  await page.waitForFunction(id => ![...document.querySelectorAll("#sidebar-recent a")].some(el => el.dataset.pageLink === id), ids[2]);
  assert.equal((await json("/memories/all/attention")).nextWakeAt, until);
  await selectEditorText(page, 7);
  const wakeCaret = await editorSelection(page);
  await row(ids[2]).waitFor({ timeout: 10_000 });
  assert.equal(new URL(page.url()).searchParams.get("note"), ids[0], "deadline refresh does not navigate");
  assert.equal(await editorMarkdown(page), body);
  assert.deepEqual(await editorSelection(page), wakeCaret, "deadline refresh does not move caret");

  // Keep the current note open through expiry: list and toolbar resolve the same deadline.
  const currentNote = await json(documentPath(ids[0]));
  const currentUntil = new Date(Date.now() + 5_000).toISOString();
  await json(documentPath(ids[0]), { method: "PATCH", headers: { "If-Match": currentNote.contentHash }, body: JSON.stringify({ action: "snooze", until: currentUntil }) });
  await page.reload(); await page.locator("#note-editor").waitFor();
  await page.waitForFunction(() => state.editor?.state.frontmatterPrefix.includes("attention_at:") && !state.editor.state.frontmatterPrefix.includes("attention_at: null"));
  assert.equal(await page.locator("#note-attention-controls, #pin-current-page").count(), 0);
  await row(ids[0]).waitFor({ state: "detached" });
  await selectEditorText(page, 9);
  const currentCaret = await editorSelection(page);
  await row(ids[0]).waitFor({ timeout: 10_000 });
  assert.equal(await editorMarkdown(page), body, "current-note expiry preserves body");
  assert.deepEqual(await editorSelection(page), currentCaret, "current-note expiry preserves caret");
  assert.equal((await json(documentPath(ids[0]))).frontmatter.attention_at, currentUntil, "expiry is observational rather than a metadata rewrite");
  // The next failed-mutation assertion starts from the ordinary absent override.
  const dueCurrent = await json(documentPath(ids[0]));
  await json(documentPath(ids[0]), { method: "PATCH", headers: { "If-Match": dueCurrent.contentHash }, body: JSON.stringify({ action: "reactivate" }) });
  await page.reload(); await page.locator("#note-editor").waitFor();

  // Failed content publication blocks the metadata mutation and retains the draft.
  await page.route("**/memories/all/documents/**", async route => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"message":"Disposable save failure"}}' });
    else await route.continue();
  });
  await appendEditorText(page, " Keep this unsaved draft.");
  const draft = await editorMarkdown(page), beforeFailed = patches.length;
  await sidebarAction("settle");
  await page.waitForFunction(() => !state.editor?.state.navigationPending && state.editor.state.saveStatus === "failed");
  assert.equal(patches.length, beforeFailed, "failed save prevents attention PATCH");
  assert.equal(await editorMarkdown(page), draft);
  assert.equal(Object.hasOwn((await json(documentPath(ids[0]))).frontmatter, "attention_at"), false);
  await page.unroute("**/memories/all/documents/**");
  await page.locator("#note-retry").click(); await saved();
  await page.waitForFunction(() => document.querySelector("#app-toast").hidden);
  await sidebarAction("settle"); await settled();
  assert.equal(await editorMarkdown(page), draft, "recovered attention mutation retains the saved draft");
  await page.locator("#toast-action").click();
  await row(ids[0]).waitFor();
  assert.equal(Object.hasOwn((await json(documentPath(ids[0]))).frontmatter, "attention_at"), false, "Undo removes the settled override");
  assert.equal(await editorMarkdown(page), draft, "Undo retains recovered writing");

  // Real action confirmations must expire without another navigation or action.
  for (const [id, label] of [["copy-note-draft", "Copy draft"], ["delete-note", "Delete note"], ["insert-reference", "Insert page reference"]]) {
    assert.equal(await page.locator("#" + id).textContent(), "");
    assert.equal(await page.locator("#" + id).getAttribute("aria-label"), label);
  }
  await sidebarAction("snooze");
  await page.getByRole("menuitem", { name: /^In 1 hour/ }).click();
  await page.waitForFunction(() => document.querySelector("#toast-message").textContent.startsWith("Snoozed until"));
  await page.locator("#note-name").focus(); await page.mouse.move(1, 1);
  await page.locator("#app-toast").waitFor({ state: "hidden", timeout: 10_000 });
  assert.equal(await page.locator("#toast-action").isVisible(), false, "expired Undo disappears too");
  await bringBack(); await row(ids[0]).waitFor();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.copiedFixtureDraft = text; } } }));
  await page.locator("#copy-note-draft").click();
  await page.waitForFunction(() => document.querySelector("#toast-message").textContent === "Draft copied.");
  assert.equal(await page.evaluate(() => window.copiedFixtureDraft), titles[0] + "\n\n" + draft);
  await page.mouse.move(1, 1);
  await page.locator("#app-toast").waitFor({ state: "hidden", timeout: 6_000 });

  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator("#color-theme").click();
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      await page.evaluate(() => toast.show("layout", "Snoozed until 24/10/2026, 09:00. Pinned pages stay visible.", { action: { label: "Undo", run() {} } }));
      await assertFits(`${theme} ${width}`);
      await page.screenshot({ path: path.join(screenshots, `attention-${theme}-${width}.png`), fullPage: true });
      await sidebarAction("snooze");
      await assertFits(`${theme} ${width} presets`);
      await page.screenshot({ path: path.join(screenshots, `snooze-${theme}-${width}.png`), fullPage: true });
      await page.getByRole("menuitem", { name: "Custom…", exact: true }).click();
      await assertFits(`${theme} ${width} custom`);
      await page.locator("#snooze-close").click();
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: "PASS", checks: "settle/direct-link/reactivate, exact metadata/body/caret, independent persistent pins, snooze presets/custom, unvisited/current-note deadline wake, sidebar keyboard focus recovery, failed-save draft guard/recovery, icon labels, real snooze/copy toast expiry, two themes, desktop/390/320 layout", patches: patches.length, screenshots }));
} catch (error) {
  console.error("attention failure", page?.url(), errors, await page?.evaluate(() => ({ view: state.view, focus: document.activeElement?.id, hash: state.editor?.state.contentHash })).catch(() => null));
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(screenshots, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
