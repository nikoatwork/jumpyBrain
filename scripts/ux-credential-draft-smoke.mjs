import { showSidebar } from './editor-smoke-helpers.mjs';
// Same-origin credential changes must retain private drafts without publishing them.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { AccessStore } from "../dist/adapters/access-control/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
import { appendEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "jb-ux-credential-draft-"));
const id = "mem_41330000-1111-4111-8111-111111111111";
const initial = `---\nid: ${id}\ntype: note\ntitle: Credential draft fixture\n---\nSaved shared text.\n`;
let server, browser, access;
const results = [];
try {
  await initializeMemoryRoot(root);
  const file = path.join(root, "notes/shared.md");
  await writeFile(file, initial);
  access = new AccessStore(root);
  const writer = await access.issue({
    name: "Original writer fixture",
    role: "writer",
  });
  const reader = await access.issue({
    name: "New reader fixture",
    role: "reader",
  });
  server = await startJumpyBrainHttpServer({
    root,
    apiKeys: [],
    accessStore: access,
    port: 0,
    autoIndex: false,
  });
  browser = await launchPlaywrightChromium({
    chromium: await loadPlaywrightChromium(),
  });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const transport = await installCollaborationSmokeTransport(page);
    await page.goto(`${server.url}/?note=${id}#apiKey=${writer.token}`);
    await page.waitForFunction(
      () => state.editor?.collaboration?.state.status === "saved",
    );
    const other = await context.newPage();
    await other.goto(`${server.url}/#apiKey=${writer.token}`);
    await other.locator("#home-new").waitFor();
    const rejected = transport.rejectNext("edit", { code: "fixture_failed" });
    const privateMarker = ` Private writer draft ${width}.`;
    await appendEditorText(page, privateMarker);
    await rejected.arrived;
    await page.waitForFunction(
      () => state.editor.state.saveStatus === "failed",
    );
    const draft = await editorMarkdown(page);
    await showSidebar(page);await page.locator("#open-connection").click();
    await page.locator("#api-key").fill(reader.token);
    await page.locator("#connection-submit").click();
    await page
      .locator("#connection-message")
      .filter({ hasText: "pending draft" })
      .waitFor();
    assert.equal(await page.locator("#connection").isVisible(), true);
    assert.equal(await editorMarkdown(page), draft);
    assert.equal(await readFile(file, "utf8"), initial);
    await page.locator("#close-connection").click();
    await other.locator("#open-connection").click();
    await other.locator("#api-key").fill(reader.token);
    await other.locator("#connection-submit").click();
    await other.locator("#connection-submit").waitFor({ state: "hidden" });
    await page.waitForFunction(
      () => state.editor.state.liveStatus === "blocked",
    );
    assert.equal(await editorMarkdown(page), draft);
    assert.equal(
      await page.locator("#note-editor").getAttribute("contenteditable"),
      "false",
    );
    const mutationsBeforeReview = transport.observed.filter((frame) =>
      ["edit", "title"].includes(frame.method),
    ).length;
    await page.locator("#note-recover").click();
    if (!await page.locator("#recovery-options").evaluate(element => element.open)) await page.locator("#recovery-options > summary").click();
    await page.locator("#recovery-saved").filter({ visible: true }).waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector("#recovery-saved")
        .value.includes("Saved shared text."),
    );
    assert.equal(await page.locator("#recovery-publish").isVisible(), false);
    await page.locator("#recovery-copy").click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "Credential draft fixture\n\n" + draft,
    );
    assert.equal(await readFile(file, "utf8"), initial);
    await page.locator("#recovery-reload").click();
    await page.waitForFunction(
      () => state.editor?.collaboration?.state.status === "readonly",
    );
    assert.doesNotMatch(await editorMarkdown(page), new RegExp(privateMarker));
    assert.equal(await readFile(file, "utf8"), initial);
    assert.equal(
      transport.observed.filter((frame) =>
        ["edit", "title"].includes(frame.method),
      ).length,
      mutationsBeforeReview,
    );
    const retained = await page.evaluate(
      (marker) =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith("jumpybrain.collaboration.draft.v2:"))
          .some((key) => {
            try {
              return JSON.parse(localStorage.getItem(key)).body.includes(
                marker,
              );
            } catch {
              return false;
            }
          }),
      privateMarker,
    );
    assert.equal(
      retained,
      true,
      "the original identity retains its private recovery record",
    );
    assert.equal(
      await page.locator("#note-recover").isVisible(),
      false,
      "the reader does not adopt the old writer draft",
    );
    await showSidebar(page);await page.locator("#home-link").click();
    await page.waitForFunction(() => state.view === "home");
    results.push(
      `${width}: guarded same-tab identity change, cross-tab private copy, explicit reader reopen and no canonical publication`,
    );
    await context.close();
  }
  console.log(
    JSON.stringify({
      passed: true,
      results,
      limits: [
        "Disposable same-origin browser credentials; no real accounts or remote memory.",
      ],
    }),
  );
} finally {
  await browser?.close();
  await server?.close();
  access?.close();
  await rm(root, { recursive: true, force: true });
}
