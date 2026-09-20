// Disposable browser test: no QMD, real memory, or stored credentials required.
// npm run build && npx --package=playwright node scripts/recent-notes-smoke.mjs
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium } from "./playwright-runtime.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-recent-smoke-"));
const key = "disposable-recent-key";
let server, browser;
try {
  await mkdir(path.join(root, "notes"));
  for (let n = 1; n <= 10; n++) {
    await writeFile(path.join(root, "notes", `${n}.md`), ["---",
      `id: mem_80000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      `title: ${JSON.stringify(n === 10 ? '<img src=x onerror="alert(1)"> A long literal title for the most recently edited note' : `Note ${n}`)}`,
      `updated_at: 2024-01-${String(n).padStart(2, "0")}T00:00:00Z`,
      "type: note", "---", "", "Original body.", ""].join("\n"));
  }
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  const chromium = await loadPlaywrightChromium();
  try { browser = await chromium.launch(); }
  catch (error) {
    if (!String(error.message).includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ channel: "chrome" });
  }
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    page.setDefaultTimeout(15_000);
    const errors = [], requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(server.url);
    await page.locator("#recent-connect").waitFor({ state: "visible" });
    await page.locator("#recent-connect").click();
    await page.locator("#api-key").fill(key);
    await page.locator('#connection-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".recent-link").length === 8);
    assert.equal(requests.some((url) => /graph\.json|\/documents\//.test(url)), false);
    assert.equal(await page.locator("#recent-list img").count(), 0);
    assert.match(await page.locator(".recent-link").first().innerText(), /<img src=x/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator(".recent-link").last().scrollIntoViewIfNeeded();
    await page.locator(".recent-link").last().click();
    await page.locator("#note-editor").waitFor({ state: "visible" });
    const editedBody = `Edited from recent notes at ${width}px.`;
    await page.locator("#note-editor").fill(editedBody);
    await page.locator("#home-link").click();
    await page.waitForFunction(() => document.querySelector(".recent-link span")?.textContent === "Note 3");
    await page.locator(".recent-link").first().focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction((body) => document.querySelector("#note-editor").value === body, editedBody);
    await page.goBack();
    await page.locator(".recent-link").first().waitFor({ state: "visible" });
    // Failed loads stay small and recover through the visible retry action.
    await page.route("**/memories/all/recent", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{}' }));
    await page.reload();
    await page.locator("#recent-retry").waitFor({ state: "visible" });
    await page.unroute("**/memories/all/recent");
    await page.locator("#recent-retry").click();
    await page.waitForFunction(() => document.querySelectorAll(".recent-link").length === 8);
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
      await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `recent-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS recent notes browser ${width}px`);
    // Restore ordering for the next viewport.
    const original = path.join(root, "notes/3.md");
    await writeFile(original, (await readFile(original, "utf8")).replace(/^updated_at:.*$/m, 'updated_at: "2024-01-03T00:00:00Z"'));
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
