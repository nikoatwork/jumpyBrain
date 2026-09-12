// Disposable browser smoke for the minimal notes UI and graph regression.
// Builds a real QMD index under a temporary root and never mutates a live deployment.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { indexMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
const apiKey = "notes-ui-disposable-smoke-key";
const fixtures = {
  desktop: {
    id: "mem_e0000000-0000-4000-8000-000000000001",
    file: "notes/desktop-smoke.md",
    title: "Desktop LuminousOrchard Fixture",
    query: "velvetcircuit",
    marker: "VelvetCircuit appears only in this desktop note body.",
  },
  mobile: {
    id: "mem_e0000000-0000-4000-8000-000000000002",
    file: "notes/mobile-smoke.md",
    title: "Mobile MarigoldBeacon Fixture",
    query: "MarigoldBeacon",
    marker: "CobaltTrellis appears only in this mobile note body.",
  },
};

let chromium;
try {
  chromium = await loadPlaywrightChromium();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-notes-ui-smoke-"));
let server;
let browser;

try {
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, "notes"), { recursive: true });
  await writeFixture(root, fixtures.desktop, [
    fixtures.desktop.marker,
    "",
    "[Open mobile fixture](./mobile-smoke.md)",
    "",
    ...Array.from({ length: 90 }, (_, index) => `Long document line ${String(index + 1).padStart(2, "0")}: stable scrolling and caret regression fixture.`),
  ]);
  await writeFixture(root, fixtures.mobile, [fixtures.mobile.marker, "", "[Back to desktop fixture](./desktop-smoke.md)"]);

  const indexed = await indexMemory(root);
  assert.equal(indexed.documents, 2, "disposable QMD index should include both fixtures");

  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  browser = await launchBrowser(chromium);

  await validateDesktop();
  await validateMobile();
  await runGraphSmoke();

  const desktopMarkdown = await readFile(path.join(root, fixtures.desktop.file), "utf8");
  const mobileMarkdown = await readFile(path.join(root, fixtures.mobile.file), "utf8");
  assert.match(desktopMarkdown, /Saved from desktop notes UI smoke\./);
  assert.match(desktopMarkdown, /Recovered desktop draft after failed PUT\./);
  assert.match(mobileMarkdown, /Saved from mobile notes UI smoke\./);
  assertFrontmatterPreserved(desktopMarkdown, fixtures.desktop);
  assertFrontmatterPreserved(mobileMarkdown, fixtures.mobile);
  console.log("minimal notes + graph browser smoke: PASS");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}

async function validateDesktop() {
  const fixture = fixtures.desktop;
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();
  let allowedInjectedPutFailures = 0;
  let releaseDelayedPut = null;
  const browserErrors = collectBrowserErrors(page, (response) => {
    const request = response.request();
    const matches = allowedInjectedPutFailures > 0
      && response.status() === 500
      && request.method() === "PUT"
      && new URL(response.url()).pathname === `/memories/all/documents/${fixture.id}`;
    if (matches) allowedInjectedPutFailures -= 1;
    return matches;
  });
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));

  try {
    await openEmptyHome(page, "desktop");

    // Keep the ordinary entry path backed by the real disposable QMD index.
    await page.keyboard.press("Control+k");
    await searchAndOpen(page, fixture, { choose: "keyboard" });
    await assertFullPageEditor(page, fixture);

    const editor = page.getByTestId("graph-note-editor");
    const panel = page.getByTestId("graph-note-panel");
    const initialBody = await editor.inputValue();
    assert.ok(initialBody.length > 5_000, "desktop fixture should exercise a long document");

    // Hold a real PUT until a controlled stale=false search packet has rendered.
    // The completed local write must then make the still-open search visibly stale.
    let delayedPutPending = true;
    let resolvePutSeen;
    const putSeen = new Promise((resolve) => { resolvePutSeen = resolve; });
    const putRelease = new Promise((resolve) => { releaseDelayedPut = resolve; });
    const documentPattern = `**/memories/all/documents/${fixture.id}`;
    const delayedPutHandler = async (route) => {
      if (route.request().method() === "PUT" && delayedPutPending) {
        delayedPutPending = false;
        resolvePutSeen();
        await putRelease;
      }
      await route.continue();
    };
    await page.route(documentPattern, delayedPutHandler);

    const controlledQuery = "controlled-freshness-packet";
    const searchHandler = async (route) => {
      const request = route.request();
      const body = request.postDataJSON();
      if (request.method() !== "POST" || body?.query !== controlledQuery) {
        await route.continue();
        return;
      }
      const idless = Array.from({ length: 15 }, (_, index) => ({
        id: `legacy-hit-${index}`,
        snippet: `Unavailable legacy result ${index}`,
        provenance: { file: `legacy/idless-${index}.md`, metadata: { title: `Legacy result ${index}` } },
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [...idless, searchHit(fixture, "Controlled fresh search response")],
          index: { stale: false },
        }),
      });
    };
    await page.route("**/memories/all/search", searchHandler);

    const inserted = "\nSaved from desktop notes UI smoke.\n";
    await editor.focus();
    await editor.evaluate((element) => element.setSelectionRange(element.value.length, element.value.length));
    const scrollBefore = await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight;
      return element.scrollTop;
    });
    assert.ok(scrollBefore > 0, "long note should have an internal scroll range");
    await page.keyboard.insertText(inserted);
    const caretAfterInput = initialBody.length + inserted.length;
    assert.deepEqual(await editor.evaluate((element) => [element.selectionStart, element.selectionEnd]), [caretAfterInput, caretAfterInput]);
    assert.equal(await panel.evaluate((element) => element.scrollTop), scrollBefore, "autosizing should preserve long-note scroll");
    await putSeen;

    // Explicitly cover Command+K in addition to the Control+K entry path above.
    await page.keyboard.press("Meta+k");
    await page.locator("#note-search").waitFor({ state: "visible" });
    await page.locator("#note-search-input").fill(controlledQuery);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.querySelector("#note-search").contains(document.activeElement)), true,
        "native modal must constrain keyboard focus");
    }
    await page.locator("#note-search-input").focus();
    const controlledResult = page.locator("#search-results [role='option']").first();
    await controlledResult.waitFor({ state: "visible", timeout: 15_000 });
    assert.match(await controlledResult.innerText(), new RegExp(fixture.title));
    assert.equal(await controlledResult.getAttribute("aria-disabled"), "false", "usable result should lead ID-less hits");
    assert.equal(await page.locator("#search-results [role='option']").count(), 12, "ID-less hits may fill only the remaining result slots");
    assert.equal(await page.locator("#search-freshness").isVisible(), false, "controlled packet starts fresh");

    releaseDelayedPut();
    releaseDelayedPut = null;
    await waitForSaveState(page, "Saved");
    await page.locator("#search-freshness").waitFor({ state: "visible", timeout: 15_000 });
    await assertCanonicalBody(fixture, /Saved from desktop notes UI smoke\./);

    // Command+K toggles the modal closed and restores long-document focus,
    // caret, scroll, and the persistent textarea after save reconciliation.
    await page.keyboard.press("Meta+k");
    await page.locator("#note-search").waitFor({ state: "hidden" });
    assert.equal(await editor.evaluate((element) => document.activeElement === element), true, "search close should restore editor focus");
    assert.deepEqual(await editor.evaluate((element) => [element.selectionStart, element.selectionEnd]), [caretAfterInput, caretAfterInput]);
    assert.equal(await panel.evaluate((element) => element.scrollTop), scrollBefore, "modal close should restore long-note scroll");
    assert.equal(await editor.inputValue(), initialBody + inserted, "search and reconcile must not replace the draft");
    await page.unroute("**/memories/all/search", searchHandler);
    await page.unroute(documentPattern, delayedPutHandler);

    // The note URL is durable and reloads directly into raw-body editing.
    const savedDraft = await editor.inputValue();
    const noteUrl = `/?note=${encodeURIComponent(fixture.id)}`;
    assert.equal(currentShellUrl(page), noteUrl);
    await page.reload();
    await assertFullPageEditor(page, fixture);
    assert.equal(await editor.inputValue(), savedDraft);

    // A history traversal closes Connection and applies the destination view.
    await page.locator("#open-connection").click();
    await page.locator("#connection").waitFor({ state: "visible" });
    await page.evaluate(() => history.back());
    await expectHome(page);
    assert.equal(await page.locator("#connection").isVisible(), false, "Back should close Connection");
    assert.equal(await page.locator("body").getAttribute("data-view"), "home");
    assert.equal(currentShellUrl(page), "/");
    await page.goForward();
    await assertFullPageEditor(page, fixture);
    assert.equal(currentShellUrl(page), noteUrl);

    // Exercise both directions of SPA history through the shared save guard.
    await page.locator("#home-link").click();
    await expectHome(page);
    await page.goBack();
    await assertFullPageEditor(page, fixture);
    await page.goForward();
    await expectHome(page);
    await page.goBack();
    await assertFullPageEditor(page, fixture);

    // Fail exactly one PUT, then undo back to the previously saved body. The
    // response is still unconfirmed: navigation remains guarded until Retry.
    let failNextPut = true;
    const failedPutHandler = async (route) => {
      if (route.request().method() === "PUT" && failNextPut) {
        failNextPut = false;
        allowedInjectedPutFailures += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "smoke_injected_failure", message: "Controlled smoke PUT failure." } }),
        });
        return;
      }
      await route.continue();
    };
    await page.route(documentPattern, failedPutHandler);

    const failedDraft = appendLine(await editor.inputValue(), "Unconfirmed desktop draft after failed PUT.");
    await editor.fill(failedDraft);
    await waitForSaveState(page, "Save failed");
    assert.equal(failNextPut, false, "the controlled PUT failure should be consumed");
    await editor.fill(savedDraft);
    await waitForSaveState(page, "Save failed");
    assert.equal(await page.getByTestId("graph-note-retry").isVisible(), true, "undo must remain explicitly retryable");

    await page.evaluate(() => {
      window.__notesSmokePopUrls = [];
      window.addEventListener("popstate", () => window.__notesSmokePopUrls.push(location.pathname + location.search));
      history.back();
    });
    await page.waitForFunction((url) => {
      const editorElement = document.querySelector('[data-testid="graph-note-editor"]');
      return window.__notesSmokePopUrls?.length >= 2
        && location.pathname + location.search === url
        && editorElement && !editorElement.readOnly;
    }, noteUrl, { timeout: 15_000 });
    assert.ok((await page.evaluate(() => window.__notesSmokePopUrls)).some((url) => url === "/"),
      "failed popstate save should observe its Back target before restoration");
    assert.equal(await editor.inputValue(), savedDraft, "guarded navigation should retain the unconfirmed body");
    assert.equal(await page.getByTestId("graph-note-retry").isVisible(), true);

    await page.getByTestId("graph-note-retry").click();
    await waitForSaveState(page, "Saved");
    assert.equal(await editor.inputValue(), savedDraft);
    const confirmedMarkdown = await readFile(path.join(root, fixture.file), "utf8");
    assert.doesNotMatch(confirmedMarkdown, /Unconfirmed desktop draft after failed PUT\./,
      "Retry after undo should persist the original body, not the failed draft");

    const recoveredDraft = appendLine(savedDraft, "Recovered desktop draft after failed PUT.");
    await editor.fill(recoveredDraft);
    await waitForSaveState(page, "Saved");
    await assertCanonicalBody(fixture, /Recovered desktop draft after failed PUT\./);
    await capture(page, "notes-desktop.png");
    assert.equal(allowedInjectedPutFailures, 0, "exactly one controlled HTTP failure should be observed");
    assert.deepEqual(browserErrors, [], "desktop browser console errors");
    console.log("  ok - desktop search/freshness/long-note/history/failure recovery");
  } finally {
    if (releaseDelayedPut) releaseDelayedPut();
    await context.close();
  }
}
async function validateMobile() {
  const fixture = fixtures.mobile;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  let allowedAuthFailures = 0;
  const browserErrors = collectBrowserErrors(page, (response) => {
    const request = response.request();
    const matches = allowedAuthFailures > 0
      && response.status() === 401
      && request.method() === "PUT"
      && new URL(response.url()).pathname === `/memories/all/documents/${fixture.id}`;
    if (matches) allowedAuthFailures -= 1;
    return matches;
  });
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));

  try {
    await openEmptyHome(page, "mobile");
    await page.locator("#home-search").tap();
    await searchAndOpen(page, fixture, { choose: "tap" });
    await assertFullPageEditor(page, fixture);

    const editor = page.getByTestId("graph-note-editor");
    await setConnectionKey(page, "deliberately-wrong-mobile-key");
    allowedAuthFailures += 1;
    const mobileDraft = appendLine(await editor.inputValue(), "Saved from mobile notes UI smoke.");
    await editor.fill(mobileDraft);
    await waitForSaveState(page, "Save failed");
    assert.equal(allowedAuthFailures, 0, "mobile save should receive exactly one real auth failure");
    assert.match(await page.getByTestId("graph-note-save-state").getAttribute("aria-label"), /401|Unauthorized|Invalid API key/i);

    // Failure controls wrap without widening the document, and every nav action
    // remains on-screen and enabled at a narrow mobile viewport.
    await assertMobileLayout(page);
    await capture(page, "notes-mobile-save-failure.png");

    // Connect is itself one of the wrapped controls; correct credentials and
    // use the explicit Retry to preserve and persist the failed draft.
    await setConnectionKey(page, apiKey);
    assert.equal(await editor.inputValue(), mobileDraft, "auth recovery should retain the failed draft");
    await page.getByTestId("graph-note-retry").tap();
    await waitForSaveState(page, "Saved");
    await assertCanonicalBody(fixture, /Saved from mobile notes UI smoke\./);
    await assertMobileLayout(page, { includeRetry: false });

    await page.reload();
    await assertFullPageEditor(page, fixture);
    assert.equal(await editor.inputValue(), mobileDraft);
    await capture(page, "notes-mobile.png");
    assert.deepEqual(browserErrors, [], "mobile browser console errors");
    console.log("  ok - mobile failed-save layout/auth/retry/reload");
  } finally {
    await context.close();
  }
}
async function openEmptyHome(page, label) {
  const dataRequests = [];
  const listener = (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/memories\/all\/(?:graph\.json|documents\/)/.test(pathname)) dataRequests.push(`${request.method()} ${pathname}`);
  };
  page.on("request", listener);
  await page.goto(`${server.url}/#apiKey=${encodeURIComponent(apiKey)}`);
  await expectHome(page);
  await page.waitForLoadState("networkidle");
  page.off("request", listener);
  assert.deepEqual(dataRequests, [], `${label} home must not request graph or documents`);
  assert.equal(new URL(page.url()).hash, "", "API key fragment should be removed from the visible URL");
  assert.equal(await page.getByTestId("graph-svg").isVisible(), false);
  await capture(page, `notes-${label}-home.png`);
}

async function expectHome(page) {
  await page.waitForURL((value) => value.pathname === "/" && !value.searchParams.has("note"), { timeout: 15_000 });
  await page.locator("#home-search").waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("graph-note-panel").isVisible(), false);
}

async function searchAndOpen(page, fixture, { choose }) {
  const dialog = page.locator("#note-search");
  await dialog.waitFor({ state: "visible" });
  const input = page.locator("#note-search-input");
  await input.fill(fixture.query);
  const result = page.locator("#search-results [role='option']").filter({ hasText: fixture.title }).first();
  await result.waitFor({ state: "visible", timeout: 15_000 });
  assert.match(await result.innerText(), new RegExp(fixture.title));
  await capture(page, `notes-search-${choose}.png`);
  if (choose === "tap") await result.tap();
  else await page.keyboard.press("Enter");
  await page.waitForURL((value) => value.pathname === "/" && value.searchParams.get("note") === fixture.id, { timeout: 15_000 });
}

async function assertFullPageEditor(page, fixture) {
  await page.getByTestId("graph-note-editor").waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await page.getByTestId("graph-note-title").innerText(), fixture.title);
  const body = await page.getByTestId("graph-note-editor").inputValue();
  assert.match(body, new RegExp(fixture.marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(body, /^---(?:\r?\n|$)/);
  assert.doesNotMatch(body, new RegExp(`^id:\\s*${fixture.id}`, "m"));
  assert.equal(await page.getByTestId("graph-svg").isVisible(), false);
  assert.equal(await page.locator("#home-link").isVisible(), true);
  assert.equal(await page.locator("#graph-link").isVisible(), true);
}

async function setConnectionKey(page, key) {
  await page.locator("#open-connection").tap();
  const dialog = page.locator("#connection");
  await dialog.waitFor({ state: "visible" });
  await page.getByTestId("api-key").fill(key);
  await page.locator("#connection-form button[type='submit']").tap();
  await dialog.waitFor({ state: "hidden" });
}

async function assertMobileLayout(page, { includeRetry = true } = {}) {
  const layout = await page.evaluate((shouldIncludeRetry) => {
    const selectors = ["#home-link", "#open-search", "#graph-link", "#open-connection"];
    if (shouldIncludeRetry) selectors.splice(1, 0, "#note-retry");
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      controls: selectors.map((selector) => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        return {
          selector,
          hidden: !element || element.hidden,
          disabled: Boolean(element?.disabled),
          width: rect?.width || 0,
          height: rect?.height || 0,
          left: rect?.left ?? -1,
          right: rect?.right ?? -1,
        };
      }),
    };
  }, includeRetry);
  assert.ok(layout.documentWidth <= layout.viewportWidth,
    `document scrollWidth ${layout.documentWidth} must fit viewport ${layout.viewportWidth}`);
  assert.ok(layout.bodyWidth <= layout.viewportWidth,
    `body scrollWidth ${layout.bodyWidth} must fit viewport ${layout.viewportWidth}`);
  for (const control of layout.controls) {
    assert.equal(control.hidden, false, `${control.selector} should remain visible`);
    assert.equal(control.disabled, false, `${control.selector} should remain enabled`);
    assert.ok(control.width > 0 && control.height > 0, `${control.selector} should have a usable hit target`);
    assert.ok(control.left >= 0 && control.right <= layout.viewportWidth,
      `${control.selector} should stay inside the mobile viewport`);
  }
}

function currentShellUrl(page) {
  const url = new URL(page.url());
  return url.pathname + url.search;
}

function searchHit(fixture, snippet) {
  return {
    id: fixture.file,
    snippet,
    provenance: { file: fixture.file, metadata: { id: fixture.id, title: fixture.title } },
  };
}

async function waitForSaveState(page, text) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="graph-note-save-state"]')?.textContent === expected,
    text,
    { timeout: 15_000 },
  );
}

async function assertCanonicalBody(fixture, pattern) {
  const markdown = await readFile(path.join(root, fixture.file), "utf8");
  assert.match(markdown, pattern);
  assertFrontmatterPreserved(markdown, fixture);
}

function assertFrontmatterPreserved(markdown, fixture) {
  assert.match(markdown, new RegExp(`^---\\n[\\s\\S]*?id: ["']?${fixture.id}["']?[\\s\\S]*?\\n---\\n`));
  assert.match(markdown, new RegExp(`title: ["']${fixture.title}["']`));
}

async function writeFixture(memoryRoot, fixture, bodyLines) {
  await writeFile(path.join(memoryRoot, fixture.file), [
    "---",
    `id: ${JSON.stringify(fixture.id)}`,
    'type: "note"',
    `title: ${JSON.stringify(fixture.title)}`,
    'tags: ["browser-smoke", "graph"]',
    'created_at: "2026-07-22T00:00:00.000Z"',
    "---",
    "",
    `# ${fixture.title}`,
    "",
    ...bodyLines,
    "",
  ].join("\n"), "utf8");
}

function appendLine(body, line) {
  return String(body).replace(/\n*$/, "\n\n") + line + "\n";
}

function collectBrowserErrors(page, expectedHttpFailure = () => false) {
  const errors = [];
  page.on("console", (message) => {
    // Chromium mirrors HTTP failures to console without URL details. Response
    // events below retain enough provenance to allow only the injected PUT.
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText || "unknown"})`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !expectedHttpFailure(response)) {
      errors.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`);
    }
  });
  return errors;
}

async function capture(page, name) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: true });
}

async function runGraphSmoke() {
  const child = spawn(process.execPath, [path.join(scriptDir, "graph-ui-smoke.mjs")], {
    stdio: "inherit",
    env: {
      ...process.env,
      JUMPYBRAIN_GRAPH_SMOKE_URL: server.url,
      JUMPYBRAIN_GRAPH_SMOKE_API_KEY: apiKey,
      JUMPYBRAIN_GRAPH_SMOKE_NODE_ID: fixtures.desktop.file,
    },
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.equal(result.signal, null, `graph smoke terminated by ${result.signal}`);
  assert.equal(result.code, 0, `graph smoke exited with status ${result.code}`);
}

async function launchBrowser(browserType) {
  try {
    return await browserType.launch();
  } catch (error) {
    if (!String(error?.message || error).includes("Executable doesn't exist")) throw error;
    return browserType.launch({ channel: process.env.JUMPYBRAIN_PLAYWRIGHT_CHANNEL || "chrome" });
  }
}
