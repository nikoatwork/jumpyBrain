// Real hosted role credentials, empty-note guidance and reconnect affordances.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot, indexMemory } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
import { AccessStore } from "../dist/adapters/access-control/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "jb-ux-reader-")),
  id = "mem_40002222-1111-4111-8111-111111111111",
  referenceId = "mem_40002222-1111-4111-8111-111111111112";
const content = `---\nid: ${id}\ntype: note\ntitle: Empty reader note\n---\n\n`;
let server, browser, access;
const results = [];
try {
  await initializeMemoryRoot(root);
  await writeFile(path.join(root, "notes/empty.md"), content);
  await writeFile(
    path.join(root, "notes/reference.md"),
    `---\nid: ${referenceId}\ntype: note\ntitle: Available reference\n---\nA useful reference remains readable.\n`,
  );
  await indexMemory(root, { indexing: { mode: "lexical" } });
  access = new AccessStore(root);
  const reader = await access.issue({ name: "Fixture reader", role: "reader" }),
    writer = await access.issue({ name: "Fixture writer", role: "writer" });
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
      }),
      page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(`${server.url}/?note=${id}#apiKey=${reader.token}`);
    await page.waitForFunction(
      () => state.editor?.collaboration?.state.status === "readonly",
    );
    assert.equal(
      await page.locator("#note-editor").getAttribute("contenteditable"),
      "false",
    );
    assert.equal(
      await page.locator("#note-editor-hint").isHidden(),
      true,
      "a hosted reader must not be invited to start writing",
    );
    assert.equal(
      await page.locator("#toggle-note-format").isHidden(),
      true,
      "formatting follows the actual note lock",
    );
    assert.equal(
      await page.locator("#note-save-state").innerText(),
      "Read only",
    );
    assert.equal(
      await page.locator("#note-save-state").getAttribute("aria-label"),
      "Read only",
    );
    await page.locator("#toggle-page-details").click();
    await page.locator("#copy-note-draft").click();
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /Empty reader note/,
    );
    // Exercise the visible manual-copy fallback with a real reader role.
    await page.evaluate(() => {
      window.fixtureClipboardWrite = navigator.clipboard.writeText.bind(
        navigator.clipboard,
      );
      navigator.clipboard.writeText = async () => {
        throw new DOMException("Fixture clipboard denial", "NotAllowedError");
      };
    });
    await page.locator("#copy-note-draft").click();
    await page.locator("#document-recovery").waitFor();
    await page
      .locator("#recovery-message")
      .filter({ hasText: "Select and copy" })
      .waitFor();
    assert.equal(
      await page.locator("#recovery-publish").isVisible(),
      false,
      "reader manual-copy fallback must not offer publication",
    );
    assert.match(
      await page.locator("#recovery-draft").inputValue(),
      /Empty reader note/,
    );
    await page.locator("#recovery-close").click();
    await page.evaluate(() => {
      navigator.clipboard.writeText = window.fixtureClipboardWrite;
      delete window.fixtureClipboardWrite;
    });

    await page.locator("#open-search").click();
    await page.locator("#note-search-input").fill("Available reference");
    await page
      .locator("#search-results [role=option]")
      .filter({ hasText: "Available reference" })
      .first()
      .click();
    await page.waitForURL(
      (url) => url.searchParams.get("note") === referenceId,
    );
    await page.waitForFunction(
      () => state.editor?.collaboration?.state.status === "readonly",
    );
    await page.locator("#navigate-back").click();
    await page.waitForURL((url) => url.searchParams.get("note") === id);
    await page.waitForFunction(
      () => state.editor?.collaboration?.state.status === "readonly",
    );
    assert.equal(await page.locator("#note-editor-hint").isHidden(), true);
    results.push(`${width}: reader guidance, copy/search and Back`);
    await context.close();
  }
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  const transport = await installCollaborationSmokeTransport(page);
  await page.goto(`${server.url}/?note=${id}#apiKey=${writer.token}`);
  await page.waitForFunction(
    () => state.editor?.collaboration?.state.status === "saved",
  );
  assert.equal(await page.locator("#note-editor-hint").isVisible(), true);
  assert.equal(await page.locator("#toggle-note-format").isVisible(), true);
  const held = transport.holdNextReply("open");
  transport.disconnect();
  await held.arrived;
  assert.equal(
    await page.locator("#note-editor").getAttribute("contenteditable"),
    "true",
  );
  assert.equal(
    await page.locator("#toggle-note-format").isVisible(),
    true,
    "reconnecting writers retain private-editing affordances",
  );
  held.release();
  await page.waitForFunction(
    () => state.editor?.collaboration?.state.status === "saved",
  );
  assert.equal(
    await readFile(path.join(root, "notes/empty.md"), "utf8"),
    content,
  );
  results.push("writer guidance and reconnect remain available");
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new DOMException("Fixture clipboard denial", "NotAllowedError");
    };
  });
  await page.locator("#toggle-page-details").click();
  await page.locator("#copy-note-draft").click();
  await page.locator("#document-recovery").waitFor();
  await page.waitForFunction(
    () => !document.querySelector("#recovery-publish").disabled,
  );
  assert.equal(
    await page.locator("#recovery-publish").isVisible(),
    true,
    "known writers retain reviewed publication",
  );
  await access.revoke(writer.credential.id);
  await page.waitForFunction(
    () => state.editor?.collaboration?.state.status === "blocked",
  );
  assert.equal(
    await page.locator("#recovery-publish").isVisible(),
    false,
    "an open recovery dialog follows capability loss",
  );
  const beforeDeniedClick = transport.observed.filter((message) =>
    ["edit", "title"].includes(message.method),
  ).length;
  await page.locator("#recovery-publish").dispatchEvent("click");
  assert.equal(
    transport.observed.filter((message) =>
      ["edit", "title"].includes(message.method),
    ).length,
    beforeDeniedClick,
  );
  assert.equal(
    await readFile(path.join(root, "notes/empty.md"), "utf8"),
    content,
  );
  results.push(
    "open recovery follows revoked writer capability without publication",
  );

  console.log(
    JSON.stringify({
      passed: true,
      results,
      limits: [
        "Hosted fixture browser evidence; not a native Mac accessibility audit.",
      ],
    }),
  );
} finally {
  await browser?.close();
  await server?.close();
  access?.close();
  await rm(root, { recursive: true, force: true });
}
