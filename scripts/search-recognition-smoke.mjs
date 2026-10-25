// Real disposable Markdown/QMD/server/browser QA. No installed brain is modified.
// npm run build && npx --package=playwright node scripts/search-recognition-smoke.mjs
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { initializeMemoryRoot, indexMemory, searchMemory } from "../dist/runtime/index.js";
import { stampMemoryActor } from "../dist/core/contribution.js";
import { indexServerMemory } from "../dist/app/server-memory/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { replaceEditorText } from "./editor-smoke-helpers.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-recognition-smoke-"));
const output = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || "/tmp/jumpybrain-search-qa";
const actorId = "browser:11111111-1111-4111-8111-111111111111", key = "disposable-search-key";
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(16, 42, 0, 0);
const notes = [], errors = [];
let browser, server;
try {
  await initializeMemoryRoot(root);
  await mkdir(output, { recursive: true });
  for (let n = 1; n <= 36; n++) {
    const title = n === 1 ? "Mistral — Product Manager, Studio" : n === 2 ? "Mistral Product Sidebar To-Do List Analysis" : n === 3 ? "Mistral — Agent Platform role and latest hiring context" : n < 6 ? "Mistral duplicate title" : `Mistral research note ${String(n).padStart(2, "0")}`;
    const id = `mem_98000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const file = `${n === 3 ? "pages" : "notes"}/${n}.md`;
    const body = `# ${title}\n\n## Current status\n\n- **Application:** Product manager, Studio.\n- Reviewed the profile and invited Niko to an introductory call.\n\nC# and C++ stay readable. <img src=x onerror="window.searchUnsafe=true">\n`;
    let content = ["---", `id: ${id}`, `title: ${JSON.stringify(title)}`, "type: note", "created_at: 2026-10-01", ...(n === 6 ? [] : [`updated_at: ${yesterday.toISOString()}`]), "---", "", body].join("\n");
    if (n !== 6) content = stampMemoryActor(content, n === 1 ? { kind: "human", id: actorId } : { kind: "agent", name: "Research agent" }, true);
    await writeFile(path.join(root, file), content);
    notes.push({ id, file, title, content });
  }
  await indexMemory(root, { indexing: { mode: "lexical" } });
  await indexServerMemory({ root });
  const readOnly = await searchMemory(root, "mistral", 24, { recognition: { editor: "human" }, readOnly: true });
  assert.equal(readOnly.retrieval.warnings.includes("read_only_index"), true);
  assert.equal(readOnly.results[0].recognition.editor.id, actorId);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [key], port: 0, autoIndex: false });
  if (process.env.JUMPYBRAIN_SEARCH_QA_SERVE === "1") {
    console.log(JSON.stringify({ url: server.url, key, actorId, root, output }));
    await new Promise(resolve => { process.on("SIGINT", resolve); process.on("SIGTERM", resolve); });
  } else {
    browser = await launchPlaywrightChromium({ chromium: await loadPlaywrightChromium() });
    for (const width of [1280, 390, 320]) for (const theme of ["dark", "light"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: "Europe/Berlin" });
      page.setDefaultTimeout(20000);
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(({ actorId, key, theme }) => { localStorage.setItem("jumpybrain.editor-id", actorId); localStorage.setItem("jumpybrain.graph.apiKey", key); localStorage.setItem("jumpybrain.theme", theme); }, { actorId, key, theme });
      await page.goto(server.url);
      assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
      // Use the product's connection flow if its key storage schema changes.
      if (await page.locator("#recent-connect").isVisible()) {
        await page.locator("#recent-connect").click(); await page.locator("#api-key").fill(key); await page.locator("#connection-submit").click();
      }
      await page.locator("#home-search").click();
      await page.locator("#note-search-input").fill("mistral");
      await page.waitForFunction(() => document.querySelectorAll("#search-results li").length === 24);
      assert.match(await page.locator("#search-coverage").innerText(), /Other matches may exist/);
      assert.equal(await page.locator("#search-results img, #search-results script").count(), 0);
      assert.equal(await page.evaluate(() => window.searchUnsafe), undefined);
      const preview = await page.locator("#search-results .search-result-preview").first().innerText();
      assert.doesNotMatch(preview, /(?:^|\s)#{1,6} |\*\*|^- /);
      const layout = await page.locator("#search-results li").filter({ has: page.locator(".search-result-age") }).first().evaluate(row => {
        const icon = row.querySelector(".search-result-icon"), content = row.querySelector(".search-result-content"), title = row.querySelector("strong"), age = row.querySelector(".search-result-age"), preview = row.querySelector(".search-result-preview");
        const style = getComputedStyle(preview), bounds = row.getBoundingClientRect(), ageBounds = age.getBoundingClientRect();
        return { age: age.textContent, ageRight: ageBounds.right, ageCenter: ageBounds.y + ageBounds.height / 2, rowCenter: bounds.y + bounds.height / 2, iconRight: icon.getBoundingClientRect().right, contentLeft: content.getBoundingClientRect().left, rowRight: bounds.right, titleRight: title.getBoundingClientRect().right,
          previewHeight: preview.clientHeight, lineHeight: parseFloat(style.lineHeight), nowrap: style.whiteSpace, ellipsis: style.textOverflow, overflow: row.scrollWidth > row.clientWidth };
      });
      assert.equal(layout.age, "1d");
      assert.ok(layout.ageRight > layout.titleRight && layout.rowRight - layout.ageRight <= 13, "edit age stays at the right edge");
      assert.ok(Math.abs(layout.ageCenter - layout.rowCenter) < 1, "edit age is centered in its own column");
      assert.ok(layout.iconRight < layout.contentLeft, "note icon has a separate left column");
      assert.equal(layout.nowrap, "nowrap"); assert.equal(layout.ellipsis, "ellipsis");
      assert.ok(layout.previewHeight <= layout.lineHeight + 1, "preview occupies one line");
      assert.equal(layout.overflow, false, "long titles and paths do not overflow the row");
      assert.equal(await page.locator("#note-search select, #search-custom-dates, .search-result-editor").count(), 0, "search has no filter controls or author metadata");
      const unknown = page.locator("#search-results li").filter({ has: page.getByText("Mistral research note 06", { exact: true }) });
      assert.equal(await unknown.locator(".search-result-age").count(), 0);
      assert.doesNotMatch(await unknown.innerText(), /Editor unknown|Edit date unknown/);
      await page.screenshot({ path: path.join(output, `search-${width}-${theme}.png`) });
      const nextBox = await page.locator("#search-next").boundingBox(), dialogBox = await page.locator("#note-search").boundingBox();
      assert.ok(nextBox.y + nextBox.height <= dialogBox.y + dialogBox.height, "paging remains visible inside the dialog");
      await page.locator("#search-next").click();
      await page.waitForFunction(() => document.querySelector("#search-previous")?.hidden === false && document.querySelectorAll("#search-results li").length > 0 && document.querySelectorAll("#search-results li").length < 24);
      await page.locator("#search-previous").click();
      await page.waitForFunction(() => document.querySelectorAll("#search-results li").length === 24);
      await page.locator("#note-search-input").fill(notes[0].title);
      await page.waitForFunction(title => document.querySelector("#search-results strong")?.textContent === title, notes[0].title);
      await page.locator("#note-search-input").press("ArrowDown");
      await page.locator("#note-search-input").press("ArrowUp");
      await page.locator("#note-search-input").press("Enter");
      await page.locator("#note-editor").waitFor({ state: "visible" });
      assert.equal(await page.locator("#note-name").inputValue(), notes[0].title);
      assert.equal(await readFile(path.join(root, notes[0].file), "utf8"), notes[0].content, "searching/opening never writes notes");
      if (width === 1280 && theme === "dark") {
        await replaceEditorText(page, "Mistral freshly edited personal application note");
        await page.waitForFunction(() => document.querySelector("#note-save-state")?.textContent === "Saved");
        await page.locator("#open-search").click();
        await page.locator("#note-search-input").fill("freshly edited personal");
        await page.waitForFunction(() => [...document.querySelectorAll(".search-result-preview")].some(node => node.textContent.includes("freshly edited personal")));
        const savedRow = page.locator("#search-results li").filter({ hasText: "freshly edited personal" });
        assert.match(await savedRow.locator(".search-result-age").innerText(), /^(?:now|\d+[mh])$/);
        assert.match(await page.locator("#search-results").innerText(), /freshly edited personal/);
        // Reset the fixture and refresh the index for the next layout.
        await writeFile(path.join(root, notes[0].file), notes[0].content);
        await indexServerMemory({ root });
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "controls stay within narrow viewport");
      await page.close();
      console.log(`PASS search recognition ${width}px ${theme}`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS real immutable-read search, bounded paging, keyboard opening, filter-free search, plain-text previews, confirmed-save freshness. Screenshots: ${output}`);
  }
} finally { await browser?.close(); await server?.close(); await rm(root, { recursive: true, force: true }); }
