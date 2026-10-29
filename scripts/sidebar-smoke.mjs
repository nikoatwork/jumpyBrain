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
const titles = ["Project direction", "Decisions and tradeoffs", "A deliberately long page title that should truncate gracefully in the sidebar", "Release notes", "Working notes", "Product ideas", "Research", "Team rituals", "Next steps", "<img src=x onerror=alert(1)>", "Snoozed and due", "Freshly edited"];
const ids = titles.map((_, i) => `mem_a0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const errors = [];
let browser, server;
try {
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, "pages"), { recursive: true });
  for (let i = 0; i < ids.length; i++) {
    // Notes 10 and 11 carry clock-relative dates so age assertions stay deterministic.
    const updatedAt = i >= 10 ? new Date(Date.now() - 3 * 86400000).toISOString() : `2026-10-16T00:00:${String(i === 0 ? 59 : i).padStart(2, "0")}Z`;
    const attentionAt = i === 10 ? `\nattention_at: ${JSON.stringify(new Date(Date.now() - 3600000).toISOString())}` : "";
    await writeFile(path.join(root, `pages/page-${i}.md`), `---\nid: ${ids[i]}\ntype: note\ntitle: ${JSON.stringify(titles[i])}\nupdated_at: ${updatedAt}${attentionAt}\n---\nA quiet place for useful context.\n`);
  }
  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.url}/?note=${ids[0]}#apiKey=${apiKey}`);
  await page.locator("#note-editor").waitFor();
  await page.locator("#toggle-sidebar").click();
  assert.equal(await page.locator("#app-sidebar").isVisible(), false);
  await page.reload(); await page.locator("#note-editor").waitFor();
  assert.equal(await page.locator("#app-sidebar").isVisible(), false, "collapsed sidebar preference survives reload");
  await page.locator("#toggle-sidebar").click();
  assert.equal(await page.locator("#app-sidebar").isVisible(), true);
  await page.locator("#sidebar-resize").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#sidebar-resize").getAttribute("aria-valuenow"), "296");
  const grip = await page.locator("#sidebar-resize").boundingBox();
  await page.mouse.move(grip.x + 2, grip.y + grip.height / 2);
  await page.mouse.down(); await page.mouse.move(340, grip.y + grip.height / 2); await page.mouse.up();
  assert.equal(await page.locator("#sidebar-resize").getAttribute("aria-valuenow"), "340");
  assert.equal(await page.evaluate(() => localStorage.getItem("jumpybrain.sidebarWidth")), "340");
  await page.evaluate(() => { window.sidebarEditor = richEditor; });
  await page.locator("#toggle-sidebar").click(); await page.locator("#toggle-sidebar").click();
  assert.equal(await page.evaluate(() => window.sidebarEditor === richEditor), true, "sidebar toggle preserves editor instance");
  await page.locator(`[data-page-link="${ids[0]}"]`).hover();
  await page.locator(`[data-page-pin="${ids[0]}"]`).click();
  assert.equal(await page.locator("#sidebar-pinned .sidebar-page-title").innerText(), titles[0]);
  await page.waitForFunction(() => document.querySelectorAll("#sidebar-recent a").length === 8);
  for (let i = 1; i < ids.length; i++) {
    await page.evaluate((id) => navigation.navigate("/?note=" + id), ids[i]);
    await page.waitForFunction((title) => document.querySelector("#note-name").value === title, titles[i]);
  }
  assert.equal(await page.locator("#sidebar-recent a").count(), 8);
  const recentTitles = page.locator("#sidebar-recent .sidebar-page-title");
  const recentAges = page.locator("#sidebar-recent .sidebar-page-age");
  assert.equal(await recentTitles.first().innerText(), titles[10], "explicit due override sorts first");
  assert.equal(await recentAges.first().innerText(), "due 1h ago");
  assert.match(await recentAges.first().getAttribute("title"), /^Due /, "due rows keep the exact tooltip");
  assert.equal(await recentTitles.nth(1).innerText(), titles[11]);
  assert.equal(await recentAges.nth(1).innerText(), "3d ago", "edit ages read as explicit relative forms");
  assert.match(await recentAges.nth(1).getAttribute("title"), /^Last edited /);
  assert.equal(await recentTitles.nth(2).innerText(), titles[9]);
  assert.equal(await page.locator("#sidebar-recent img").count(), 0);
  await page.locator("#sidebar-pinned a").click();
  await page.waitForFunction((title) => document.querySelector("#note-name").value === title, titles[0]);
  assert.equal(await page.locator('#sidebar-pinned [aria-current="page"]').count(), 1);
  await page.locator("#note-name").fill("Project direction, refined");
  await page.waitForFunction(() => document.querySelector("#sidebar-pinned .sidebar-page-title").textContent === "Project direction, refined");
  // Body-only autosaves must not replace a sidebar row under a pointer/focus.
  await page.evaluate(() => { window.savedSidebarRow = document.querySelector("#sidebar-pinned li"); });
  await appendEditorText(page, " Body-only sidebar check.");
  await page.waitForFunction(() => state.editor?.state.saveStatus === "saved" && !state.editor.state.dirty);
  assert.equal(await page.evaluate(() => window.savedSidebarRow === document.querySelector("#sidebar-pinned li")), true);
  // Cross-tab unpin is reflected without disturbing the open editor.
  const second = await context.newPage();
  await second.goto(server.url);
  await second.locator("#sidebar-pinned a").hover();
  await second.locator("#sidebar-pinned [data-page-pin]").click();
  await page.waitForFunction(() => document.querySelectorAll("#sidebar-pinned a").length === 0);
  await second.close();
  await page.locator(`[data-page-link="${ids[0]}"]`).hover();
  await page.locator(`[data-page-pin="${ids[0]}"]`).click();
  await page.reload();
  await page.locator("#note-editor").waitFor();
  assert.equal(await page.locator(`#sidebar-pinned [data-page-pin="${ids[0]}"]`).getAttribute("aria-pressed"), "true");
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
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator("#color-theme").click();
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
  console.log("Sidebar smoke: PASS (canonical attention order, due/relative ages, pins, rename, reload, cross-tab, failed-save guard, themes, narrow layout)");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
