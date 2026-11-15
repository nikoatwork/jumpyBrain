// Disposable browser smoke for the minimal notes UI and graph regression.
// Builds a real QMD index under a temporary root and never mutates a live deployment.
import assert from "node:assert/strict";
import { validateDreamHandoff } from "./dream-handoff-smoke.mjs";
import { editorMarkdown, editorEnd, editorSelection, editorAtEnd, appendEditorText, undoEditor } from "./editor-smoke-helpers.mjs";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { indexMemory, initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { showSidebar } from "./editor-smoke-helpers.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";

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
  browser = await launchPlaywrightChromium({ chromium });

  await validateDesktop();
  await validateMobile();
  await validateSearchClicks();
  await validateDreamHandoff({ browser, url: server.url, apiKey, screenshotDir });
  await runGraphSmoke();

  const desktopMarkdown = await readFile(path.join(root, fixtures.desktop.file), "utf8");
  const mobileMarkdown = await readFile(path.join(root, fixtures.mobile.file), "utf8");
  assert.match(desktopMarkdown, /Saved from desktop notes UI smoke\./);
  assert.match(desktopMarkdown, /Recovered desktop draft after failed save\./);
  assert.match(mobileMarkdown, /Saved from mobile notes UI smoke\./);
  assertFrontmatterPreserved(desktopMarkdown, fixtures.desktop);
  assertFrontmatterPreserved(mobileMarkdown, fixtures.mobile);
  console.log("minimal notes + graph browser smoke: PASS");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}

async function validateSearchClicks() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();
  const transport = await installCollaborationSmokeTransport(page);
  let releaseSave;
  try {
    await openEmptyHome(page, "click");
    await page.locator("#home-search").click();
    await searchAndOpen(page, fixtures.desktop, { choose: "click" });
    await assertFullPageEditor(page, fixtures.desktop);

    // Hold the live edit (the autosave) while the result gesture is in flight.
    const heldSave = transport.holdNextRequest("edit");
    releaseSave = heldSave.release;
    await appendEditorLine(page, "Saved while choosing another search result.");
    await page.locator("#open-search").click();
    await heldSave.arrived;
    await page.locator("#note-search-input").fill(fixtures.mobile.query);
    const result = page.locator("#search-results [role='option']").filter({ hasText: fixtures.mobile.title }).first();
    await result.waitFor({ state: "visible", timeout: 15_000 });
    const box = await result.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    // Reproduce a freshness update between pointerdown and click: it must not
    // remove the row or detach its click handler while the gesture is in flight.
    releaseSave();
    releaseSave = null;
    await waitForSaveState(page, "Saved");
    await page.mouse.up();
    await page.waitForURL((url) => url.searchParams.get("note") === fixtures.mobile.id, { timeout: 5_000 });
    await assertFullPageEditor(page, fixtures.mobile);
    assert.equal(await page.locator("#note-search").isVisible(), false);
    console.log("  ok - mouse result click opens details, including autosave during click");
  } finally {
    if (releaseSave) releaseSave();
    await context.close();
  }
}

async function validateDesktop() {
  const fixture = fixtures.desktop;
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();
  // The shipped editor publishes body edits as live WebSocket source operations
  // (no body PUT autosave), so faults are injected on the real `/ws` frames.
  const transport = await installCollaborationSmokeTransport(page);
  let releaseDelayedEdit = null;
  const browserErrors = collectBrowserErrors(page);
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));

  try {
    await openEmptyHome(page, "desktop");

    // Keep the ordinary entry path backed by the real disposable QMD index.
    await page.keyboard.press("Control+k");
    await searchAndOpen(page, fixture, { choose: "keyboard" });
    await assertFullPageEditor(page, fixture);

    const editor = page.getByTestId("graph-note-editor");
    const panel = page.getByTestId("graph-note-panel");
    const initialBody = await editorMarkdown(page);
    assert.ok(initialBody.length > 5_000, "desktop fixture should exercise a long document");

    // Hold a real live edit until a controlled stale=false search packet has rendered.
    // The completed local write must then make the still-open search visibly stale.
    const delayedEdit = transport.holdNextRequest("edit");
    releaseDelayedEdit = delayedEdit.release;

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
          recognition: { version: 1, candidateLimit: 120, candidates: 16, matched: 16, partial: true, metadataUnavailable: 16 },
          // The open note is hidden from navigation search; another usable note leads.
          results: [...idless, searchHit(fixture, "Controlled fresh search response"), searchHit(fixtures.mobile, "Controlled fresh search response")],
          index: { stale: false },
        }),
      });
    };
    await page.route("**/memories/all/search", searchHandler);

    const inserted = "\nSaved from desktop notes UI smoke.\n";
    await editor.focus();
    await editorEnd(page);
    const scrollBefore = await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight;
      return element.scrollTop;
    });
    assert.ok(scrollBefore > 0, "long note should have an internal scroll range");
    await page.keyboard.insertText(inserted);
    const caretAfterInput = await editorSelection(page);
    assert.equal(await editorAtEnd(page), true, "typing leaves a collapsed caret at the end");
    const scrollAfterInput = await panel.evaluate((element) => element.scrollTop);
    assert.ok(Math.abs(scrollAfterInput - scrollBefore) < 150, "typing may reveal its caret but must not jump away from the end of a long note");
    await delayedEdit.arrived;

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
    assert.match(await controlledResult.innerText(), new RegExp(fixtures.mobile.title));
    assert.equal(await controlledResult.getAttribute("aria-disabled"), "false", "usable result should lead ID-less hits");
    assert.equal(await page.locator("#search-results [role='option']").count(), 16, "usable and legacy results fit within the current 24-result page");
    assert.equal(await page.locator("#search-results [role='option']").filter({ hasText: fixture.title }).count(), 0, "the open note is hidden from navigation search");
    assert.equal(await page.locator("#search-refresh-index").isVisible(), false, "controlled packet starts fresh");

    releaseDelayedEdit();
    releaseDelayedEdit = null;
    await waitForSaveState(page, "Saved");
    await page.locator("#search-refresh-index").waitFor({ state: "visible", timeout: 15_000 });
    await assertCanonicalBody(fixture, /Saved from desktop notes UI smoke\./);

    // Command+K toggles the modal closed and restores long-document focus,
    // caret, scroll, and the persistent contenteditable after save reconciliation.
    await page.keyboard.press("Meta+k");
    await page.locator("#note-search").waitFor({ state: "hidden" });
    assert.equal(await editor.evaluate((element) => document.activeElement === element), true, "search close should restore editor focus");
    assert.deepEqual(await editorSelection(page), caretAfterInput);
    assert.equal(await panel.evaluate((element) => element.scrollTop), scrollAfterInput, "modal close should restore long-note scroll");
    assert.equal(await editorMarkdown(page), initialBody + inserted, "search and reconcile must not replace the draft");
    await page.unroute("**/memories/all/search", searchHandler);

    // The note URL is durable and reloads directly into raw-body editing.
    const savedDraft = await editorMarkdown(page);
    const noteUrl = `/?note=${encodeURIComponent(fixture.id)}`;
    assert.equal(currentShellUrl(page), noteUrl);
    await page.reload();
    await assertFullPageEditor(page, fixture);
    assert.equal(await editorMarkdown(page), savedDraft);

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

    // Reject exactly one live edit. The private draft needs explicit review:
    // Undo cannot silently rewrite it and navigation stays guarded until a choice.
    const failedEdit = transport.rejectNext("edit", { code: "source_unavailable", message: "Controlled smoke live edit failure." });

    const beforeFailure = await readFile(path.join(root, fixture.file), "utf8");
    const failedDraft = appendLine(await editorMarkdown(page), "Unconfirmed desktop draft after failed save.");
    await appendEditorLine(page, "Unconfirmed desktop draft after failed save.");
    assert.equal(await editorMarkdown(page), failedDraft);
    await failedEdit.arrived;
    await waitForSaveState(page, "Changes need review");
    assert.equal(failedEdit.used, true, "the controlled live edit failure should be consumed");
    await undoEditor(page);
    await waitForSaveState(page, "Changes need review");
    assert.equal(await editorMarkdown(page), failedDraft, "undo must not discard a draft awaiting review");
    assert.equal(await page.locator("#note-recover").isVisible(), true, "the failed draft must remain explicitly reviewable");

    await page.evaluate(() => {
      window.__notesSmokePopUrls = [];
      window.addEventListener("popstate", () => window.__notesSmokePopUrls.push(location.pathname + location.search));
      history.back();
    });
    await page.waitForFunction((url) => {
      const editorElement = document.querySelector('[data-testid="graph-note-editor"]');
      return window.__notesSmokePopUrls?.length >= 2
        && location.pathname + location.search === url
        && editorElement?.isContentEditable;
    }, noteUrl, { timeout: 15_000 });
    assert.ok((await page.evaluate(() => window.__notesSmokePopUrls)).some((url) => url === "/"),
      "failed popstate save should observe its Back target before restoration");
    assert.equal(await editorMarkdown(page), failedDraft, "guarded navigation should retain the unconfirmed body");
    assert.equal(await page.locator("#note-recover").isVisible(), true);
    assert.equal(await readFile(path.join(root, fixture.file), "utf8"), beforeFailure, "a rejected edit is not published");

    await page.locator("#note-recover").click();
    await page.locator("#document-recovery").waitFor({ state: "visible" });
    await page.locator("#recovery-reload").click();
    await waitForSaveState(page, "Saved");
    assert.equal(await editorMarkdown(page), savedDraft);
    const confirmedMarkdown = await readFile(path.join(root, fixture.file), "utf8");
    assert.equal(confirmedMarkdown, beforeFailure, "choosing the saved version makes no canonical write");
    assert.doesNotMatch(confirmedMarkdown, /Unconfirmed desktop draft after failed save\./,
      "the saved version, not the failed draft, should remain canonical");

    const recoveredDraft = appendLine(savedDraft, "Recovered desktop draft after failed save.");
    await appendEditorLine(page, "Recovered desktop draft after failed save.");
    assert.equal(await editorMarkdown(page), recoveredDraft);
    await waitForSaveState(page, "Saved");
    await assertCanonicalBody(fixture, /Recovered desktop draft after failed save\./);
    await capture(page, "notes-desktop.png");
    assert.deepEqual(browserErrors, [], "desktop browser console errors");
    console.log("  ok - desktop search/freshness/long-note/history/failure recovery");
  } finally {
    if (releaseDelayedEdit) releaseDelayedEdit();
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
  const transport = await installCollaborationSmokeTransport(page);
  const wrongKey = "deliberately-wrong-mobile-key";
  // Reads made with the injected credential fail (document, sidebar, session,
  // capability and drawing reads); only GETs carrying that key are expected,
  // including late in-flight responses. Any rejected mutation stays an error.
  const rejectedKeyRead = (response) => response.status() === 401
    && response.request().method() === "GET"
    && response.request().headers().authorization === `Bearer ${wrongKey}`;
  const browserErrors = collectBrowserErrors(page, rejectedKeyRead);
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));

  try {
    await openEmptyHome(page, "mobile");
    await page.locator("#home-search").tap();
    await searchAndOpen(page, fixture, { choose: "tap" });
    await assertFullPageEditor(page, fixture);
    const beforeFailure = await readFile(path.join(root, fixture.file), "utf8");

    // A rejected key locks live editing with an explicit explanation and retry;
    // nothing is written and navigation (including Connect) stays usable.
    const connectionCheck = page.waitForResponse(rejectedKeyRead);
    await setConnectionKey(page, wrongKey);
    await connectionCheck;
    await page.locator("#note-load-retry").waitFor({ state: "visible" });
    assert.equal(await page.locator("#note-editor").getAttribute("contenteditable"), "false", "a rejected key cannot edit");
    assert.match(await page.locator("#connection-message").textContent(), /access key was not accepted/i);
    await assertMobileLayout(page, { failureControl: "#note-load-retry" });
    await capture(page, "notes-mobile-auth-failure.png");

    // Connect is itself one of the wrapped controls; the accepted key reopens editing.
    await setConnectionKey(page, apiKey);
    await page.waitForFunction(() => document.querySelector("#note-editor")?.isContentEditable === true);
    assert.equal(await readFile(path.join(root, fixture.file), "utf8"), beforeFailure, "auth failure makes no write");

    // A failed live save keeps the draft visible and reviewable within the phone layout.
    const rejected = transport.rejectNext("edit", { code: "source_unavailable", message: "Controlled mobile live edit failure." });
    const mobileDraft = appendLine(await editorMarkdown(page), "Saved from mobile notes UI smoke.");
    await appendEditorLine(page, "Saved from mobile notes UI smoke.");
    assert.equal(await editorMarkdown(page), mobileDraft);
    await rejected.arrived;
    await waitForSaveState(page, "Changes need review");
    assert.match(await page.getByTestId("graph-note-save-state").getAttribute("aria-label"), /haven't been saved/i);
    assert.equal(await readFile(path.join(root, fixture.file), "utf8"), beforeFailure, "a rejected edit is not published");
    await assertMobileLayout(page, { failureControl: "#note-recover" });
    await capture(page, "notes-mobile-save-failure.png");

    // Explicit review publishes the retained draft.
    await page.locator("#note-recover").tap();
    await page.locator("#document-recovery").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.getElementById("recovery-publish").disabled && !document.getElementById("recovery-publish").hidden);
    await page.locator("#recovery-publish").tap();
    await waitForSaveState(page, "Saved");
    assert.equal(await editorMarkdown(page), mobileDraft, "review should retain the failed draft");
    await assertCanonicalBody(fixture, /Saved from mobile notes UI smoke\./);
    await assertMobileLayout(page);

    await page.reload();
    await assertFullPageEditor(page, fixture);
    assert.equal(await editorMarkdown(page), mobileDraft);
    await capture(page, "notes-mobile.png");
    assert.deepEqual(browserErrors, [], "mobile browser console errors");
    console.log("  ok - mobile auth failure/live save review/recovery/reload");
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
  await assertSharedPalette(page);
  await capture(page, `notes-${label}-home.png`);
}

async function assertSharedPalette(page) {
  // The shell shares these tokens even when a view/dialog is not yet visible.
  for (const selector of ["body", "#graph-header", "#graph-wrap", ".map-options", "#note-editor", "#note-name", "#note-search", "#connection", "#dream-handoff", "#dream-preview"]) {
    assert.equal(await page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(230, 218, 196)", `${selector} uses the shared Ember Light surface`);
  }
  for (const selector of ["#home-new", "#zoom-in", "#connection-submit", "#dream-copy"]) {
    assert.equal(await page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(216, 204, 176)", `${selector} uses the shared Ember Light control fill`);
  }
  // Icon buttons (sidebar tools, map actions) are ghost at rest: no fill until hovered or on.
  for (const selector of ["#new-note", "#open-dream", "#reload", "#graph-filters summary"]) {
    assert.equal(await page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)", `${selector} is a ghost icon button`);
  }
  await page.locator("#home-new").focus();
  assert.equal(await page.locator("#home-new").evaluate((el) => getComputedStyle(el).outlineStyle), "solid", "keyboard focus stays visible");
  // Filled controls hover to --control-hover (quieter than the --surface-hover on-state).
  const controlHover = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement("div"));
    probe.style.background = "var(--control-hover)";
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  await page.locator("#home-new").hover();
  await page.waitForFunction((expected) => getComputedStyle(document.querySelector("#home-new")).backgroundColor === expected, controlHover);
  await page.mouse.move(0, 0);
  await page.locator("#home-new").evaluate((el) => el.blur());
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
  else if (choose === "click") await result.click();
  else await page.keyboard.press("Enter");
  await page.waitForURL((value) => value.pathname === "/" && value.searchParams.get("note") === fixture.id, { timeout: 15_000 });
}

async function assertFullPageEditor(page, fixture) {
  await page.getByTestId("graph-note-editor").waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await page.getByTestId("graph-note-title").innerText(), fixture.title);
  const body = await editorMarkdown(page);
  assert.match(body, new RegExp(fixture.marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(body, /^---(?:\r?\n|$)/);
  assert.doesNotMatch(body, new RegExp(`^id:\\s*${fixture.id}`, "m"));
  assert.equal(await page.getByTestId("graph-svg").isVisible(), false);
  if (page.viewportSize().width > 680) {
    assert.equal(await page.locator("#home-link").isVisible(), true);
    assert.equal(await page.locator("#graph-link").isVisible(), true);
  } else {
    // Narrow note entry dismisses the sidebar so the body is visible first;
    // navigation stays one explicit toggle away.
    assert.equal(await page.locator("#app-sidebar").isVisible(), false, "narrow note entry shows the note first");
    assert.equal(await page.locator("#toggle-sidebar").isVisible(), true, "navigation remains reachable");
  }
}

async function setConnectionKey(page, key) {
  await showSidebar(page);
  await page.locator("#open-connection").tap();
  const dialog = page.locator("#connection");
  await dialog.waitFor({ state: "visible" });
  await capture(page, "notes-connection.png");
  await page.getByTestId("api-key").fill(key);
  await page.locator("#connection-form button[type='submit']").tap();
  await dialog.waitFor({ state: "hidden" });
}

async function assertMobileLayout(page, { failureControl = null } = {}) {
  // Narrow note entry dismisses the sidebar; its navigation is one toggle away.
  await showSidebar(page);
  const layout = await page.evaluate((failureSelector) => {
    const selectors = ["#home-link", "#open-search", "#graph-link", "#open-connection"];
    if (failureSelector) selectors.splice(1, 0, failureSelector);
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
  }, failureControl);
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
    // events below retain enough provenance to allow only injected failures.
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    const code = request.failure()?.errorText || "unknown";
    // Navigation/scope refresh deliberately abort superseded metadata lists.
    // Keep unexpected transport failures and every mutation failure visible.
    if (request.method() === "GET" && code === "net::ERR_ABORTED"
        && ["/memories/all/recent", "/memories/all/attention"].includes(new URL(request.url()).pathname)) return;
    // Related-page discovery aborts superseded read-only searches on navigation.
    if (request.method() === "POST" && code === "net::ERR_ABORTED"
        && new URL(request.url()).pathname === "/memories/all/search") return;
    errors.push(`request failed: ${request.method()} ${request.url()} (${code})`);
  });
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
      JUMPYBRAIN_GRAPH_SMOKE_BODY_QUERY: fixtures.desktop.query,
    },
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.equal(result.signal, null, `graph smoke terminated by ${result.signal}`);
  assert.equal(result.code, 0, `graph smoke exited with status ${result.code}`);
}


async function appendEditorLine(page, line) {
  const body = await editorMarkdown(page);
  // Preserve the loaded rich blocks and their exact Markdown source.
  const trailing = body.match(/\n*$/)[0].length;
  assert.ok(trailing <= 2, "fixture has at most two trailing newlines");
  await appendEditorText(page, "\n".repeat(2 - trailing) + line + "\n");
}
