// Disposable browser smoke for graph inline Markdown editing.
// Runs its own temporary memory root and never mutates a live deployment.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";

let chromium;
try {
  chromium = await loadPlaywrightChromium();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-graph-editor-smoke-"));
const documentId = "mem_e0000000-0000-4000-8000-000000000001";
const relativeFile = "notes/editor-smoke.md";
const apiKey = "editor-smoke-key";
let server;
let browser;

try {
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, "notes"), { recursive: true });
  await writeFile(path.join(root, relativeFile), [
    "---",
    `id: ${JSON.stringify(documentId)}`,
    'type: "note"',
    'title: "Editor smoke fixture"',
    'tags: ["graph", "smoke"]',
    'created_at: "2026-07-12T00:00:00.000Z"',
    "---",
    "",
    "# Editor smoke fixture",
    "",
    "Disposable initial body.",
    "",
  ].join("\n"), "utf8");

  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  browser = await chromium.launch();

  await editFixture({ name: "desktop", viewport: { width: 1280, height: 820 }, activation: "reader" });
  await editFixture({ name: "mobile", viewport: { width: 390, height: 844 }, activation: "keyboard" });

  const response = await fetch(`${server.url}/memories/all/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  assert.equal(response.status, 200);
  const persisted = await response.json();
  assert.match(persisted.content, /Saved from desktop browser smoke\./);
  assert.match(persisted.content, /Saved from mobile browser smoke\./);
  assert.match(persisted.content, new RegExp(`id: ["']?${documentId}`));
  console.log("graph editor browser smoke: PASS");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}

async function editFixture({ name, viewport, activation }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${server.url}/graph#apiKey=${encodeURIComponent(apiKey)}`);
    await page.getByTestId("graph-ready").waitFor({ state: "visible", timeout: 15_000 });
    const graphNode = page.locator(`[data-node-id="${relativeFile}"]`);
    await graphNode.focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("graph-note-edit").waitFor({ state: "visible", timeout: 15_000 });

    if (activation === "reader") {
      await page.getByTestId("graph-note-content").click();
    } else {
      await page.getByTestId("graph-note-edit").focus();
      await page.keyboard.press("Enter");
    }

    const editor = page.getByTestId("graph-note-editor");
    await editor.waitFor({ state: "visible" });
    const current = await editor.inputValue();
    await editor.fill(current.replace(/\n*$/, "\n\n") + `Saved from ${name} browser smoke.\n`);
    await page.getByTestId("graph-note-title").click();
    await page.getByTestId("graph-note-content").waitFor({ state: "visible" });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="graph-note-save-state"]')?.textContent === "Saved",
      null,
      { timeout: 15_000 },
    );
    assert.match(await page.getByTestId("graph-note-content").innerText(), new RegExp(`Saved from ${name} browser smoke\\.`));
    assert.deepEqual(consoleErrors, [], `${name} browser console errors`);
    console.log(`  ok - ${name} inline edit autosaved`);
  } finally {
    await context.close();
  }
}
