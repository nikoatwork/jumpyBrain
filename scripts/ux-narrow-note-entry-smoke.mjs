// Direct note destinations and breakpoint entry should leave room for their content.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
import { appendEditorText } from "./editor-smoke-helpers.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "jb-ux-narrow-entry-"));
const id = "mem_41440000-1111-4111-8111-111111111111",
  key = randomUUID();
const initial = `---\nid: ${id}\ntype: note\ntitle: Launch plan — a shared working document for the product, research and customer experience teams\n---\nStart writing here.\n`;
const output = path.resolve(".local-pack/ux-narrow-entry", Date.now().toString());
let server, browser;
const results = [];
try {
  await initializeMemoryRoot(root);
  const file = path.join(root, "notes/entry.md");
  await writeFile(file, initial);
  await mkdir(output, { recursive: true });
  server = await startJumpyBrainHttpServer({
    root,
    apiKeys: [key],
    port: 0,
    autoIndex: false,
  });
  browser = await launchPlaywrightChromium({
    chromium: await loadPlaywrightChromium(),
  });
  for (const width of [320, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
    });
    await context.addInitScript(() =>
      localStorage.setItem("jumpybrain.sidebarCollapsed", "false"),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const transport = await installCollaborationSmokeTransport(page);
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await page.waitForFunction(
      () => state.editor?.collaboration?.state.status === "saved",
    );
    await page.screenshot({ path: path.join(output, width + "-direct.png") });
    assert.equal(
      await page.locator("#app-sidebar").isVisible(),
      false,
      "a direct narrow note destination should show its content first",
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("jumpybrain.sidebarCollapsed"),
      ),
      "false",
      "automatic content space preserves the desktop preference",
    );
    assert.equal(
      await page.locator("#toggle-sidebar").getAttribute("aria-expanded"),
      "false",
    );
    assert.ok(
      (await page.locator("#note-panel").boundingBox()).height > 844 * 0.7,
    );
    assert.ok(
      (await page.locator("#note-editor p").first().boundingBox()).y < 844 - 44,
      "body text is reachable in the initial viewport",
    );
    await page.locator("#toggle-sidebar").click();
    assert.equal(await page.locator("#app-sidebar").isVisible(), true);
    assert.equal(
      await page.locator("#toggle-sidebar").getAttribute("aria-expanded"),
      "true",
    );
    await page.setViewportSize({ width: 1280, height: 844 });
    assert.equal(await page.locator("#app-sidebar").isVisible(), true);
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.locator("#app-sidebar").isVisible(),
      false,
      "entering the narrow breakpoint prioritizes the selected note",
    );
    await page.locator("#toggle-sidebar").click();
    const failed = transport.rejectNext("edit", { code: "fixture_failed" });
    await appendEditorText(page, " Private narrow draft.");
    await failed.arrived;
    await page.waitForFunction(
      () => state.editor.state.saveStatus === "failed",
    );
    await page.locator("#home-link").click();
    await page.waitForFunction(() => !state.editor.state.navigationPending);
    assert.equal(
      await page.locator("#app-sidebar").isVisible(),
      true,
      "failed departure keeps navigation available",
    );
    assert.equal(new URL(page.url()).searchParams.get("note"), id);
    assert.match(
      await page.locator("#note-editor").innerText(),
      /Private narrow draft/,
    );
    assert.equal(await readFile(file, "utf8"), initial);
    page.on("dialog", (dialog) => dialog.accept());
    await context.close();
    results.push(
      `${width}: direct note, breakpoint, toggle, preference and failed-departure continuity`,
    );
  }
  const home = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await home.goto(`${server.url}/#apiKey=${key}`);
  await home.locator("#home-new").waitFor();
  assert.equal(
    await home.locator("#app-sidebar").isVisible(),
    true,
    "initial Home keeps navigation discoverable",
  );
  console.log(
    JSON.stringify({
      passed: true,
      output,
      results,
      limits: [
        "Localhost Chromium route/layout diagnostic; not native or human discoverability scoring.",
      ],
    }),
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
