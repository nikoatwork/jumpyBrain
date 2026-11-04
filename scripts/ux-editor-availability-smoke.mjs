import { showSidebar } from './editor-smoke-helpers.mjs';
// Production-shell fault probes with disposable localhost Markdown only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "jb-ux-availability-"));
const id = "mem_46666666-6666-4666-8666-666666666666",
  fixtureKey = randomUUID();
const content = `---\nid: ${id}\ntype: note\ntitle: A note that exists\n---\nThis saved content remains available.\n`;
let server, browser;
const results = [];
try {
  await mkdir(path.join(root, "notes"));
  await writeFile(path.join(root, "notes/available.md"), content);
  server = await startJumpyBrainHttpServer({
    root,
    apiKeys: [fixtureKey],
    port: 0,
    autoIndex: false,
  });
  browser = await launchPlaywrightChromium({
    chromium: await loadPlaywrightChromium(),
  });
  for (const width of [1280, 390])
    for (const failure of [
      "missing-capabilities",
      "invalid-protocol",
      "server-error",
    ]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(10000);
      const writes = [];
      page.on("request", (request) => {
        if (["PUT", "PATCH", "DELETE"].includes(request.method()))
          writes.push(request.method());
      });
      await page.route("**/capabilities", (route) =>
        route.fulfill({
          status:
            failure === "missing-capabilities"
              ? 404
              : failure === "server-error"
                ? 503
                : 200,
          contentType: "application/json",
          body: JSON.stringify(
            failure === "invalid-protocol"
              ? { protocol: 1 }
              : {
                  error: {
                    code: "not_found",
                    message: "/private/technical-details",
                  },
                },
          ),
        }),
      );
      await page.goto(`${server.url}/?note=${id}#apiKey=${fixtureKey}`);
      await page.waitForFunction(
        () =>
          state.editor?.state.loaded &&
          document.querySelector("#note-load-retry").hidden === false,
      );
      assert.equal(
        await page.locator("#note-save-state").innerText(),
        "Editing unavailable",
        `${failure}: do not claim missing content or a failed save`,
      );
      assert.match(
        await page.locator("#note-save-state").getAttribute("aria-label"),
        /^Editing unavailable/,
      );
      assert.equal(
        await page.locator("#note-name").inputValue(),
        "A note that exists",
      );
      assert.equal(await page.locator("#note-editor").isVisible(), true);
      assert.match(
        await page.locator("#note-editor").innerText(),
        /This saved content remains available/,
      );
      assert.equal(
        await page.locator("#note-editor").getAttribute("contenteditable"),
        "false",
      );
      assert.equal(
        await page.locator("#note-name").getAttribute("readonly"),
        "",
      );
      assert.equal(
        await page.locator("#note-retry").isVisible(),
        false,
        "there was no failed save to retry",
      );
      assert.equal(
        await page.locator("#note-recover").isVisible(),
        false,
        "no private draft exists",
      );
      assert.equal(
        await page.locator("#note-load-retry").innerText(),
        "Retry editing",
      );
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /no longer available|Save failed|\/private\/technical-details/,
      );
      assert.equal(
        await readFile(path.join(root, "notes/available.md"), "utf8"),
        content,
      );
      assert.deepEqual(writes, []);
      await showSidebar(page);await page.locator("#home-link").click();
      await page.waitForFunction(() => state.view === "home");
      await page.goBack();
      await page.waitForFunction(
        () =>
          state.editor?.state.loaded &&
          document.querySelector("#note-load-retry").hidden === false,
      );
      await page.unroute("**/capabilities");
      await page.locator("#note-load-retry").click();
      await page.waitForFunction(
        () => state.editor?.collaboration?.state.status === "saved",
      );
      assert.equal(await page.locator("#note-load-retry").isVisible(), false);
      assert.equal(
        await page.locator("#note-editor").getAttribute("contenteditable"),
        "true",
      );
      assert.equal(
        await page.locator("#note-save-state").getAttribute("aria-label"),
        "Saved",
      );
      results.push(
        `${width}/${failure}: saved content, honest state, read-only protection and retry`,
      );
      await page.close();
    }
  const missing = await browser.newPage();
  await missing.goto(
    `${server.url}/?note=mem_40000000-0000-4000-8000-000000000000#apiKey=${fixtureKey}`,
  );
  await missing.waitForFunction(() =>
    document
      .querySelector("#note-message")
      .textContent.includes("no longer available"),
  );
  assert.equal(await missing.locator("#note-editor").isVisible(), false);
  results.push("actual missing document retains missing-note guidance");
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.setDefaultTimeout(10000);
    const transport = await installCollaborationSmokeTransport(page),
      writes = [];
    page.on("request", (request) => {
      if (["PUT", "PATCH", "DELETE"].includes(request.method()))
        writes.push(request.method());
    });
    let resume, arrived;
    const gate = new Promise((resolve) => (resume = resolve)),
      pending = new Promise((resolve) => (arrived = resolve));
    await page.route("**/capabilities", async (route) => {
      arrived();
      await gate;
      await route.continue();
    });
    const before = await readFile(
      path.join(root, "notes/available.md"),
      "utf8",
    );
    await page.goto(`${server.url}/?note=${id}#apiKey=${fixtureKey}`);
    await pending;
    await page.waitForFunction(
      () =>
        state.editor?.state.loaded &&
        state.editor.state.liveStatus === "connecting",
    );
    assert.equal(
      await page.locator("#note-editor").getAttribute("contenteditable"),
      "false",
      "unconfirmed permissions do not invite body edits",
    );
    assert.equal(await page.locator("#note-name").getAttribute("readonly"), "");
    assert.equal(await page.locator("#toggle-note-format").isVisible(), false);
    assert.equal(await page.locator("#note-editor-hint").isVisible(), false);
    const source = await editorMarkdown(page);
    await page.locator("#note-editor").click();
    await page.keyboard.insertText("Blocked before capabilities");
    await page.locator("#note-name").click();
    await page.keyboard.insertText("Blocked title");
    await page.waitForTimeout(850);
    assert.equal(await editorMarkdown(page), source);
    assert.equal(
      await readFile(path.join(root, "notes/available.md"), "utf8"),
      before,
    );
    assert.equal(
      transport.observed.filter((frame) =>
        ["edit", "title"].includes(frame.method),
      ).length,
      0,
    );
    assert.deepEqual(writes, []);
    resume();
    await page.waitForFunction(
      () => state.editor?.collaboration?.state.status === "saved",
    );
    const marker = " Confirmed after capabilities " + width;
    await appendEditorText(page, marker);
    await page.waitForFunction(
      () => state.editor?.collaboration?.state.status === "saved",
    );
    assert.equal(
      (await readFile(path.join(root, "notes/available.md"), "utf8")).split(
        marker,
      ).length,
      2,
    );
    assert.deepEqual(writes, [], "writing opens only on the live transport");
    results.push(
      `${width}: delayed permissions stay locked, then confirmed writer input saves once`,
    );
    await page.close();
  }
  console.log(
    JSON.stringify({
      passed: true,
      results,
      limitations: [
        "Fault-injected browser evidence; no claim to diagnose a live VPS proxy.",
      ],
    }),
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
