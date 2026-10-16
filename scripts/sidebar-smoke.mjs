// Production shell, disposable memory, and real navigation/persistence; no QMD required.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-sidebar-"));
const apiKey = "disposable-sidebar-key";
const titles = ["Project direction", "Decisions and tradeoffs", "A deliberately long page title that should truncate gracefully in the sidebar", "Release notes", "Working notes", "Product ideas", "Research", "Team rituals", "Next steps", "<img src=x onerror=alert(1)>"];
const ids = titles.map((_, i) => `mem_a0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const errors = [];
let browser, server;
try {
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, "pages"), { recursive: true });
  for (let i = 0; i < ids.length; i++) await writeFile(path.join(root, `pages/page-${i}.md`), `---\nid: ${ids[i]}\ntype: note\ntitle: ${JSON.stringify(titles[i])}\ncreated: 2026-10-16\n---\nA quiet place for useful context.\n`);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.url}/?note=${ids[0]}#apiKey=${apiKey}`);
  await page.locator("#note-editor").waitFor();
  await page.locator("#pin-current-page").click();
  assert.equal(await page.locator("#sidebar-pinned a").innerText(), titles[0]);
  assert.equal(await page.locator("#sidebar-recent a").count(), 0);
  for (let i = 1; i < ids.length; i++) {
    await page.evaluate((id) => navigation.navigate("/?note=" + id), ids[i]);
    await page.waitForFunction((title) => document.querySelector("#note-name").value === title, titles[i]);
  }
  assert.equal(await page.locator("#sidebar-recent a").count(), 8);
  assert.equal(await page.locator("#sidebar-recent a").first().innerText(), titles.at(-1));
  assert.equal(await page.locator("#sidebar-recent img").count(), 0);
  await page.locator("#sidebar-pinned a").click();
  await page.waitForFunction((title) => document.querySelector("#note-name").value === title, titles[0]);
  assert.equal(await page.locator('#sidebar-pinned [aria-current="page"]').count(), 1);
  await page.locator("#note-name").fill("Project direction, refined");
  await page.waitForFunction(() => document.querySelector("#sidebar-pinned a").textContent === "Project direction, refined");
  // Cross-tab unpin is reflected without disturbing the open editor.
  const second = await context.newPage();
  await second.goto(server.url);
  await second.locator("#sidebar-pinned button").click();
  await page.waitForFunction(() => document.querySelectorAll("#sidebar-pinned a").length === 0);
  await second.close();
  await page.locator("#pin-current-page").click();
  await page.reload();
  await page.locator("#note-editor").waitFor();
  assert.equal(await page.locator("#pin-current-page").getAttribute("aria-pressed"), "true");
  // A failed save blocks page-row navigation and retains the draft and current row.
  await page.route("**/memories/all/documents/**", async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"message":"Fixture save unavailable"}}' });
    else await route.continue();
  });
  await appendEditorText(page, " Keep this draft.");
  const draft = await editorMarkdown(page);
  await page.locator("#sidebar-recent a").first().click();
  await page.waitForFunction(() => document.querySelector("#note-save-state").dataset.state === "failed");
  assert.equal(new URL(page.url()).searchParams.get("note"), ids[0]);
  assert.equal(await editorMarkdown(page), draft);
  await page.unroute("**/memories/all/documents/**");
  await page.locator("#note-retry").click();
  await page.waitForFunction(() => document.querySelector("#note-save-state").dataset.state === "saved");
  const graph = await page.locator("#graph-link").boundingBox();
  const recent = await page.locator("#sidebar-recent").boundingBox();
  assert.ok(graph.y > recent.y + recent.height, "Graph sits below the page lists");
  const screenshotDir = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.locator("#color-theme").selectOption(theme);
    if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `sidebar-${theme}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 850 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "narrow navigation fits");
  assert.equal(await page.locator("#sidebar-pinned a").isVisible(), true);
  const areas = await page.locator(".nav-library, #open-connection, #open-feedback, .nav-appearance").evaluateAll((elements) => elements.map((el) => {
    const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height };
  }));
  for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
    const a = areas[i], b = areas[j];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, "narrow sidebar controls do not overlap");
  }
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "sidebar-narrow.png") });
  await context.close();
  assert.deepEqual(errors, []);
  console.log("Sidebar smoke: PASS (visited order, pins, rename, reload, cross-tab, failed-save guard, themes, narrow layout)");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
