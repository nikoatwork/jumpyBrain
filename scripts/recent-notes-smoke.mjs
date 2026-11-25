// Disposable browser test: no QMD, real memory, or stored credentials required.
// npm run build && npx --package=playwright node scripts/recent-notes-smoke.mjs
import assert from "node:assert/strict";
import { replaceEditorText, showSidebar } from "./editor-smoke-helpers.mjs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-recent-smoke-"));
const key = "disposable-recent-key";
let server, browser;
// The connection control is icon-only; its accessible name carries the state.
const connectionName = (page) => page.locator("#open-connection").getAttribute("aria-label");
// Hosted browser credentials live only in an HttpOnly session cookie, never in JavaScript storage.
const sessionCookies = async (page) => (await page.context().cookies()).filter((cookie) => cookie.name.startsWith("jumpybrain_session_v3_"));
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
  browser = await launchPlaywrightChromium({ chromium });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    page.setDefaultTimeout(15_000);
    const errors = [], requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    // Editor saves publish over the live WebSocket; inject failures there.
    const liveTransport = await installCollaborationSmokeTransport(page);
    await page.goto(server.url);
    await page.locator("#recent-connect").waitFor({ state: "visible" });
    assert.equal(await connectionName(page), "Connect · Connection settings");
    await page.locator("#recent-connect").click();
    await page.locator("#api-key").fill("wrong-key");
    await page.locator('#connection-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector("#connection-message").textContent === "The access key was not accepted. Check it and try again.");
    await page.locator("#close-connection").click();
    await page.locator("#recent-connect").waitFor({ state: "visible" });
    assert.equal(await connectionName(page), "Connect · Connection settings");
    await page.locator("#open-connection").click();
    await page.locator("#api-key").fill(key);
    await page.locator('#connection-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelectorAll(".recent-link").length === 8);
    assert.equal(await connectionName(page), "Connected · Connection settings");
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#open-connection").getAttribute("aria-label") === "Connected · Connection settings");
    assert.equal((await sessionCookies(page)).every((cookie) => cookie.httpOnly), true);
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).then((stored) => stored.includes(key)), false, "the key never enters JavaScript storage");
    await page.locator("#open-connection").click();
    assert.equal(await page.locator("#api-key").getAttribute("type"), "password");
    assert.equal(await page.locator("#api-key").inputValue(), "", "a cookie session never re-exposes the key");
    await page.locator("#api-key").fill("canceled-edit");
    await page.locator("#toggle-api-key").click();
    assert.equal(await page.locator("#api-key").getAttribute("type"), "text");
    await page.keyboard.press("Escape");
    await page.locator("#open-connection").click();
    assert.equal(await page.locator("#api-key").getAttribute("type"), "password", "reopening masks the field");
    assert.equal(await page.locator("#api-key").inputValue(), "", "canceled edits are discarded");
    await page.locator("#close-connection").click();
    assert.equal(requests.some((url) => /graph\.json|\/documents\//.test(url)), false);
    assert.equal(await page.locator("#recent-list img").count(), 0);
    assert.match(await page.locator(".recent-link").first().innerText(), /<img src=x/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator(".recent-link").last().scrollIntoViewIfNeeded();
    await page.locator(".recent-link").last().click();
    await page.locator("#note-editor").waitFor({ state: "visible" });
    const editedBody = `Edited from recent notes at ${width}px.`;
    await replaceEditorText(page, editedBody);
    // Narrow note routes dismiss the sidebar transiently; reopening it is explicit.
    await showSidebar(page);
    await page.locator("#home-link").click();
    await page.waitForFunction(() => document.querySelector(".recent-link span")?.textContent === "Note 3");
    await page.locator(".recent-link").first().focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction((body) => richEditor.getMarkdown() === body, editedBody);
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
    // Disconnect must not discard a draft if saving fails.
    await page.locator(".recent-link").first().click();
    await page.locator("#note-editor").waitFor({ state: "visible" });
    const failedEdit = liveTransport.rejectNext("edit", { code: "source_unavailable" });
    const pendingBody = `Pending disconnect draft ${width}`;
    await replaceEditorText(page, pendingBody);
    await failedEdit.arrived;
    await showSidebar(page);
    await page.locator("#open-connection").click();
    await page.locator("#disconnect").click();
    await page.waitForFunction(() => document.querySelector("#connection-message").textContent.includes("Could not sign out"));
    assert.equal((await sessionCookies(page)).length, 1, "failed disconnect keeps the session");
    assert.equal(await connectionName(page), "Connected · Connection settings");
    await page.locator("#close-connection").click();
    // A rejected live save requires explicit review before publishing the draft.
    await page.locator("#note-recover").click();
    await page.waitForFunction(() => document.getElementById("document-recovery").open && !document.getElementById("recovery-publish").disabled);
    await page.locator("#recovery-publish").click();
    await page.waitForFunction(() => document.querySelector("#note-save-state").textContent === "Saved");
    assert.ok((await readFile(path.join(root, "notes/3.md"), "utf8")).includes(pendingBody));
    await replaceEditorText(page, pendingBody + " saved on disconnect");
    await showSidebar(page);
    await page.locator("#open-connection").click();
    await page.locator("#disconnect").click();
    await page.locator("#connection").waitFor({ state: "hidden" });
    await page.locator("#recent-connect").waitFor({ state: "visible" });
    assert.equal(await connectionName(page), "Connect · Connection settings");
    assert.equal((await sessionCookies(page)).length, 0, "disconnect clears the session cookie");
    assert.equal(await page.locator(".recent-link").count(), 0);
    assert.ok((await readFile(path.join(root, "notes/3.md"), "utf8")).includes(pendingBody + " saved on disconnect"), "disconnect saves the pending note first");
    await page.reload();
    await page.locator("#recent-connect").waitFor({ state: "visible" });
    assert.equal(await connectionName(page), "Connect · Connection settings");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS recent notes browser ${width}px`);
    // Restore ordering for the next viewport.
    const original = path.join(root, "notes/3.md");
    await writeFile(original, (await readFile(original, "utf8")).replace(/^updated_at:.*$/m, 'updated_at: "2024-01-03T00:00:00Z"'));
  }
  // Metadata-only activity: real filesystem changes, with no index or history.
  await rm(path.join(root, "notes"), { recursive: true });
  await mkdir(path.join(root, "notes"));
  for (const width of [1280, 390]) {
    const paths = ["updated", "created", "unknown"].map((name) => path.join(root, "notes", name + ".md"));
    const contents = [
      'updated_at: "2024-03-02"',
      'created_at: "2024-02-01"\ndate: "1990-01-01"',
      'date: "2099-01-01"',
    ].map((metadata, n) => ["---", `id: mem_80000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
      `title: Activity ${n + 1}`, metadata, "type: note", "---", "Current body.", ""].join("\n"));
    for (let n = 0; n < paths.length; n++) await writeFile(paths[n], contents[n]);
    const page = await browser.newPage({ viewport: { width, height: 820 }, timezoneId: "America/Los_Angeles" });
    await page.goto(`${server.url}/#apiKey=${key}`);
    await page.locator(".recent-link").nth(2).waitFor();
    assert.equal(await page.locator("#recent-title").innerText(), "Recent activity");
    assert.deepEqual(await page.locator(".recent-date").allTextContents(), ["Updated Mar 2, 2024", "Created Feb 1, 2024", "Date unknown"]);
    assert.deepEqual(await page.locator(".recent-link > span:first-child").allTextContents(), ["Activity 1", "Activity 2", "Activity 3"]);
    // Leaving timestamp metadata unchanged must not invent a new edit time.
    await writeFile(paths[2], contents[2].replace("Activity 3", "Externally renamed"));
    await page.getByRole("button", { name: "Refresh recent activity", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".recent-link > span:first-child")[2]?.textContent === "Externally renamed");
    assert.equal(await page.locator(".recent-date").last().innerText(), "Date unknown");
    // A metadata update moves the same file to the top, without another row.
    await writeFile(paths[2], contents[2].replace('date: "2099-01-01"', 'date: "1990-01-01"\nupdated_at: "2024-04-01"'));
    await page.locator("#recent-refresh").click();
    await page.waitForFunction(() => document.querySelector(".recent-link > span")?.textContent === "Activity 3");
    assert.equal(await page.locator(".recent-link").count(), 3);
    assert.equal(await page.locator(".recent-date").first().innerText(), "Updated Apr 1, 2024");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `activity-${width}.png`) });
    }
    await rm(paths[2]);
    await page.locator("#recent-refresh").click();
    await page.waitForFunction(() => document.querySelectorAll(".recent-link").length === 2);
    await rm(paths[0]); await rm(paths[1]);
    await page.locator("#recent-refresh").click();
    await page.waitForFunction(() => document.querySelector("#recent-message").textContent.startsWith("No notes yet."));
    assert.equal(await page.locator(".recent-link").count(), 0);
    await page.close();
    console.log(`PASS metadata-only activity ${width}px`);
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
