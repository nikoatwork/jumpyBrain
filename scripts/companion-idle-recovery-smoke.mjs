// Production gateway + production Chromium shell; disposable root only.
// A coordinator request lost at the network layer (as Chromium reports for
// requests suspended across laptop sleep) must freeze the tab, then recover the
// same tab automatically once reachable: no reload, no draft loss.
// Use existing dist (do not build here):
// npx --package=playwright node scripts/companion-idle-recovery-smoke.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCompanionGateway } from "../integrations/macos-companion/gateway.mjs";
import { createServerMemoryRuntime } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown, replaceEditorText } from "./editor-smoke-helpers.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controlKey = randomBytes(32).toString("hex");
const id = "mem_a0000000-0000-4000-8000-000000000001";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
let temporary, gateway, browser;
try {
  temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "jb-idle-recovery-smoke-")));
  const directory = path.join(temporary, "support"), root = path.join(temporary, "a");
  await mkdir(directory, { mode: 0o700 });
  await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  const file = path.join(root, "notes", "fixture.md");
  await writeFile(file, `---\nid: ${id}\ntype: note\ntitle: Idle fixture\n---\nBody\n`);
  gateway = await startCompanionGateway({ runtimeRoot, directory, initialRoot: root, port: 0, controlKey,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {} }, identityFile: path.join(temporary, "identity.json") });
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  const context = await browser.newContext();
  context.setDefaultTimeout(12000);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(gateway.url + "/?note=" + id + "&brain=" + gateway.state().activeId + "#companion=" + controlKey);
  await page.locator("#note-editor").waitFor();
  await page.waitForFunction(() => companionRegistered && !companionFrozen && state.editor?.collaboration?.state.status === "saved");
  await replaceEditorText(page, "Written before the laptop slept");
  await page.waitForFunction(() => document.getElementById("note-save-state").textContent === "Saved");
  const before = await page.evaluate(() => ({ tab: companionTabId, url: location.href }));

  let dropped = 0;
  await page.route(/\/companion\/(poll|state|register)$/, (route) => { dropped++; return route.abort("internetdisconnected"); });
  await page.locator("#toast-message").filter({ hasText: /Reconnecting to the app/ }).waitFor();
  assert.doesNotMatch(await page.locator("#toast-message").textContent(), /session ended/);
  assert.equal(await page.evaluate(() => companionFrozen), true, "an unreachable coordinator keeps the tab frozen");
  await pause(3500);
  assert.ok(dropped >= 2, "automatic retries continue while unreachable (" + dropped + " dropped)");
  assert.equal(await page.evaluate(() => companionSessionFailed), true);

  await page.unroute(/\/companion\/(poll|state|register)$/);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => !companionSessionFailed && !companionFrozen && companionRegistered, null, { timeout: 5000 });
  const after = await page.evaluate(() => ({ tab: companionTabId, url: location.href }));
  assert.deepEqual(after, before, "recovery keeps the same tab and page without reloading");
  assert.equal(await page.locator("#companion-recovery").isVisible(), false);
  assert.match(await editorMarkdown(page), /Written before the laptop slept/);
  await appendEditorText(page, " and resumed after waking");
  await page.waitForFunction(() => document.getElementById("note-save-state").textContent === "Saved");
  assert.match(await readFile(file, "utf8"), /Written before the laptop slept and resumed after waking/);
  assert.deepEqual(errors, [], "unexpected browser JavaScript errors");
  if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, "idle-recovered.png") });
  console.log("companion idle recovery smoke: PASS (" + dropped + " dropped coordinator requests, same tab recovered, edits persisted)");
} catch (error) {
  console.error("companion idle recovery smoke: FAIL - " + (error.stack || error.message));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await gateway?.close().catch(() => {});
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
