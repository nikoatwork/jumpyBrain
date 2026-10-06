// Called by graph-editor-smoke.mjs against its disposable authenticated fixture.
// No server/browser ownership, CLI/model invocation, or fixture writes here.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function validateDreamHandoff({ browser, url, apiKey, screenshotDir }) {
  assert.ok(apiKey, "Dream smoke requires the disposable fixture API key");
  const origin = new URL(url).origin;
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 820 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [], blocked = [], requests = [];
    let quiet = false;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", (request) => { if (quiet) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    });
    page.on("requestfailed", (request) => errors.push(`Failed request: ${new URL(request.url()).pathname}`));
    // Fail safely if a shortcut regresses: never let a test create a note or run
    // maintenance. Real same-origin GETs supply the home and graph fixtures.
    await page.route("**/*", async (route) => {
      const request = route.request();
      const target = new URL(request.url());
      if (quiet || target.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
        blocked.push(`${request.method()} ${target.pathname}`);
        await route.abort();
      } else if (target.pathname === "/favicon.ico") {
        await route.fulfill({ status: 204, body: "" });
      } else {
        await route.continue();
      }
    });

    try {
      await page.goto(`${origin}/#apiKey=${encodeURIComponent(apiKey)}`);
      await page.locator("#home-search").waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle"); // Includes initial status/recent and favicon requests.
      assert.equal(new URL(page.url()).hash, "", "credentials should leave the address bar");
      assert.equal(await page.locator("#open-dream").isVisible(), false, "home has no visible Dream CTA");
      assert.equal(await page.locator("#dream-handoff").isVisible(), false);

      const graphResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/memories/all/graph.json");
      await page.locator("#graph-link").click();
      const response = await graphResponse;
      assert.equal(response.status(), 200, "graph must come from the real authenticated fixture");
      assert.equal(await response.request().headerValue("authorization"), `Bearer ${apiKey}`);
      const graph = await response.json();
      const nodes = graph.nodes.filter((node) => node.nodeKind === "document" && node.documentId);
      assert.ok(nodes.length > 0, "real graph needs canonical fixture documents");
      await readyGraph(page);

      // Read fixture evidence only to prove none is embedded in the handoff.
      // APIRequestContext requests are setup, before the browser quiet window.
      const privateText = [];
      for (const node of nodes.slice(0, 2)) {
        privateText.push(node.title, node.file, node.documentId);
        const document = await context.request.get(`${origin}/memories/all/documents/${encodeURIComponent(node.documentId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        assert.equal(document.status(), 200);
        const payload = await document.json();
        assert.equal(typeof payload.content, "string");
        const body = payload.content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
        const lines = body.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length >= 30);
        assert.ok(lines.length, "fixture must contain source prose to test non-disclosure");
        privateText.push(...lines);
      }

      // Make both filter and camera preservation non-vacuous before opening.
      const query = String(nodes[0].title || nodes[0].file).split(/\s+/)[0];
      await page.locator("#query").fill(query);
      const filtered = page.waitForResponse((item) => new URL(item.url()).pathname === "/memories/all/graph.json");
      await page.locator("#query").press("Tab"); // Commit change before measuring zero network.
      assert.equal((await filtered).status(), 200);
      await readyGraph(page);
      assert.ok(await page.getByTestId("graph-node").count() > 0, "filtered real graph remains behind dialog");
      const originalCamera = await page.locator("#viewport").getAttribute("transform");
      await page.locator("#zoom-in").click();
      assert.notEqual(await page.locator("#viewport").getAttribute("transform"), originalCamera);
      await page.waitForLoadState("networkidle");
      const graphState = await readGraphState(page);

      // Freeze only wall-clock dates, not timers or native dialog behavior.
      await page.evaluate(() => {
        const RealDate = window.Date;
        window.__dreamSmokeNow = RealDate.parse("2026-09-20T23:59:59Z");
        window.Date = class extends RealDate {
          constructor(...args) { super(...(args.length ? args : [window.__dreamSmokeNow])); }
          static now() { return window.__dreamSmokeNow; }
        };
      });
      await setClipboard(page, "delayed");
      quiet = true;
      await page.locator("#open-dream").focus();
      await page.keyboard.press("Enter");
      await assertOpen(page);
      await assertFocus(page, "dream-copy");
      assert.equal(await page.locator("#dream-content").evaluate((element) => element.scrollTop), 0, "opening shows scope and explanation from the top");
      assert.equal(await page.locator("#dream-preview").evaluate((element) => element.scrollTop), 0, "preview starts at the prompt's beginning");
      const preview = await assertPreview(page, { origin, apiKey, privateText, from: "2026-09-18", to: "2026-09-20" });
      assert.equal(await page.locator("#dream-feedback").getAttribute("role"), "status");
      assert.equal(await page.locator("#dream-feedback").getAttribute("aria-live"), "polite");
      assert.equal(await page.locator("#dream-feedback").innerText(), "");
      await assertLayout(page);

      // Explicit forward/backward boundary wraps, including readonly preview.
      await page.keyboard.press("Tab");
      await assertFocus(page, "dream-close");
      await page.keyboard.press("Tab");
      await assertFocus(page, "dream-preview");
      await page.keyboard.press("Shift+Tab");
      await assertFocus(page, "dream-close");
      await page.keyboard.press("Shift+Tab");
      await assertFocus(page, "dream-copy");
      await page.keyboard.press("Shift+Tab");
      await assertFocus(page, "dream-preview");
      const graphUrl = page.url();
      for (const shortcut of ["Control+k", "Meta+k", "Control+Enter", "Meta+Enter"]) {
        await page.keyboard.press(shortcut);
        await assertOpen(page);
        assert.equal(await page.locator("#note-search").isVisible(), false, `${shortcut} must not open search`);
        assert.equal(await page.getByTestId("graph-note-panel").isVisible(), false, `${shortcut} must not create/open a note`);
        assert.equal(page.url(), graphUrl);
        await assertFocus(page, "dream-preview");
      }

      await page.evaluate(() => { window.__dreamSmokeNow = Date.parse("2026-09-21T00:00:01Z"); });
      assert.equal(await assertPreview(page, { origin, apiKey, privateText, from: "2026-09-18", to: "2026-09-20" }), preview,
        "an open dialog keeps its original dates across UTC midnight");
      await page.locator("#dream-copy").click();
      await assertPending(page);
      assert.equal(await page.evaluate(() => window.__dreamSmokeClipboard.calls.at(-1)), preview,
        "clipboard argument must equal the entire displayed preview");
      await settleClipboard(page);
      await assertCopied(page);
      if (screenshotDir) {
        await mkdir(screenshotDir, { recursive: true });
        await page.screenshot({ path: path.join(screenshotDir, `dream-handoff-${width}.png`), fullPage: true });
      }
      await page.keyboard.press("Escape");
      await assertClosed(page);
      assert.deepEqual(await readGraphState(page), graphState, "Escape preserves camera and filters");

      for (const mode of ["rejected", "missing"]) {
        await setClipboard(page, mode);
        await page.locator("#open-dream").click();
        await assertOpen(page);
        await assertPreview(page, { origin, apiKey, privateText, from: "2026-09-19", to: "2026-09-21" });
        await page.locator("#dream-copy").click();
        await page.waitForFunction(() => document.querySelector("#dream-feedback").dataset.error === "true");
        assert.match(await page.locator("#dream-feedback").innerText(), /clipboard unavailable.*copy it manually/i);
        assert.equal(await page.locator("#dream-copy").isEnabled(), true);
        await assertFocus(page, "dream-preview");
        assert.equal(await page.locator("#dream-preview").evaluate((element) =>
          element.selectionStart === 0 && element.selectionEnd === element.value.length), true,
        `${mode} clipboard selects the full prompt for manual copying`);
        await page.locator("#dream-close").click();
        await assertClosed(page);
      }

      // A prior generation must not announce success/failure or enable the new
      // generation's Copy button, even while its own clipboard promise is pending.
      for (const outcome of ["resolve", "reject"]) {
        await setClipboard(page, "delayed");
        await page.locator("#open-dream").click();
        await page.locator("#dream-copy").click();
        await assertPending(page);
        await page.locator("#dream-close").click();
        await assertClosed(page);
        await page.locator("#open-dream").click();
        assert.equal(await page.locator("#dream-feedback").innerText(), "", "reopening clears old feedback");
        assert.equal(await page.locator("#dream-copy").isEnabled(), true);
        await page.locator("#dream-copy").click();
        await assertPending(page);
        await settleClipboard(page, outcome); // Old request, not the current one.
        await assertPending(page);
        await settleClipboard(page);
        await assertCopied(page);
        await page.locator("#dream-close").click();
        await assertClosed(page);
      }
      assert.deepEqual(await readGraphState(page), graphState, "all handoff operations preserve camera/filter state");
      await page.locator("#open-dream").click();
      await assertOpen(page);
      await page.waitForLoadState("networkidle");
      assert.deepEqual(requests, [], "opening, keyboard interaction, copying and closing send no network requests");
      assert.deepEqual(blocked, [], "no write/model/external request may be attempted");
      quiet = false; // Back legitimately reloads the home recent-note list.
      await page.goBack();
      await page.waitForURL((value) => value.pathname === "/");
      await page.locator("#home-search").waitFor({ state: "visible" });
      await page.locator("#dream-handoff").waitFor({ state: "hidden" });
      assert.equal(await page.locator("#dream-handoff").evaluate((element) => element.open), false, "Back closes the native dialog");
      assert.equal(await page.locator("#open-dream").isVisible(), false);
      await page.waitForLoadState("networkidle");
      assert.deepEqual(blocked, []);
      assert.deepEqual(errors, [], "Dream browser errors");
      console.log(`  ok - Dream handoff: real graph, clipboard, focus, history and zero network at ${width}px`);
    } finally {
      await context.close();
    }
  }
}

async function readyGraph(page) {
  await page.getByTestId("graph-ready").waitFor({ state: "visible" });
  await page.getByTestId("graph-error").waitFor({ state: "hidden" });
  await page.getByTestId("graph-svg").waitFor({ state: "visible" });
  assert.ok(Number(await page.getByTestId("graph-node-count").innerText()) > 0);
}

async function readGraphState(page) {
  return page.evaluate(() => ({
    camera: document.querySelector("#viewport").getAttribute("transform"),
    query: document.querySelector("#query").value,
    focus: document.querySelector("#focus").value,
    orphans: document.querySelector("#include-orphans").checked,
    unresolved: document.querySelector("#include-unresolved").checked,
    nodes: [...document.querySelectorAll('[data-testid="graph-node"]')].map((node) => node.getAttribute("data-node-id")),
  }));
}

async function assertOpen(page) {
  await page.locator("#dream-handoff").waitFor({ state: "visible" });
  assert.equal(await page.locator("#dream-handoff").evaluate((element) => element instanceof HTMLDialogElement && element.matches(":modal")), true);
  assert.equal(await page.getByTestId("graph-svg").isVisible(), true, "actual graph stays rendered behind modal");
  assert.ok(await page.getByTestId("graph-node").count() > 0);
}

async function assertClosed(page) {
  await page.locator("#dream-handoff").waitFor({ state: "hidden" });
  await assertFocus(page, "open-dream");
}

async function assertFocus(page, id) {
  assert.equal(await page.evaluate(() => document.activeElement?.id), id, `keyboard focus should be on #${id}`);
}

async function assertPreview(page, { origin, apiKey, privateText, from, to }) {
  assert.equal(await page.locator("#dream-target").innerText(), origin);
  assert.equal(await page.locator("#dream-window").innerText(), `${from} through ${to} (inclusive UTC)`);
  assert.equal(await page.locator("#dream-preview").evaluate((element) => element.readOnly), true);
  const preview = await page.locator("#dream-preview").inputValue();
  assert.ok(preview.includes(`on this exact target: ${origin}`));
  assert.ok(preview.includes(`Scope: ${from} through ${to}, inclusive UTC`));
  assert.ok(preview.includes(`--from ${to} --days 3`));
  const targets = [...preview.matchAll(/--target-url '([^']+)'/g)].map((match) => match[1]);
  assert.ok(targets.length > 0, "handoff contains explicit target recipes");
  assert.ok(targets.every((target) => target === origin), "all recipes use the displayed origin");
  for (const secret of [apiKey, ...privateText].filter(Boolean)) {
    assert.equal(preview.includes(secret), false, "preview must not contain credentials or fixture source text");
  }
  return preview;
}

async function assertLayout(page) {
  const layout = await page.locator("#dream-handoff").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
      dialogOverflow: element.scrollWidth > element.clientWidth };
  });
  assert.ok(layout.left >= 0 && layout.right <= layout.width, "dialog fits viewport width");
  assert.ok(layout.top >= 0 && layout.bottom <= layout.height, "dialog fits viewport height (internally scrollable)");
  assert.equal(layout.overflow, false);
  assert.equal(layout.dialogOverflow, false, "dialog must not require horizontal scrolling");
  for (const id of ["dream-heading", "dream-copy", "dream-close"]) {
    const rect = await page.locator(`#${id}`).boundingBox();
    assert.ok(rect && rect.y >= layout.top && rect.y + rect.height <= layout.bottom, `${id} stays visible without scrolling the dialog`);
  }
}

async function setClipboard(page, mode) {
  await page.evaluate((behavior) => {
    const driver = window.__dreamSmokeClipboard ||= { calls: [], pending: [] };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: behavior === "missing" ? undefined : {
        writeText(text) {
          driver.calls.push(text);
          if (behavior === "rejected") return Promise.reject(new DOMException("Denied by smoke", "NotAllowedError"));
          return new Promise((resolve, reject) => driver.pending.push({ resolve, reject }));
        },
      },
    });
  }, mode);
}

async function settleClipboard(page, outcome = "resolve") {
  await page.evaluate(async (result) => {
    const pending = window.__dreamSmokeClipboard.pending.shift();
    if (!pending) throw new Error("No clipboard promise to settle");
    if (result === "reject") pending.reject(new DOMException("Late denial", "NotAllowedError"));
    else pending.resolve();
    // Flush the feature's await/catch/finally before checking stale feedback.
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }, outcome);
}

async function assertPending(page) {
  assert.equal(await page.locator("#dream-copy").isDisabled(), true, "copy is disabled while clipboard is unresolved");
  assert.equal(await page.locator("#dream-feedback").innerText(), "Copying prompt…", "must not announce success before resolution");
  assert.equal(await page.locator("#dream-feedback").getAttribute("data-error"), "false");
}

async function assertCopied(page) {
  await page.waitForFunction(() => document.querySelector("#dream-feedback").textContent.startsWith("Prompt copied."));
  assert.equal(await page.locator("#dream-copy").isEnabled(), true);
  assert.equal(await page.locator("#dream-feedback").getAttribute("data-error"), "false");
  assert.equal(await page.evaluate(() => window.__dreamSmokeClipboard.calls.at(-1)), await page.locator("#dream-preview").inputValue());
}
