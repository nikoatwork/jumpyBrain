// Production shell + disposable Markdown root; no QMD index or personal memory needed.
// npm run build && npx --package=playwright node scripts/theme-smoke.mjs
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { builtInPalettes } from "../dist/adapters/http-server/browser-palettes.js";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown, editorSelection } from "./editor-smoke-helpers.mjs";

const id = "mem_a0000000-0000-4000-8000-000000000001";
const apiKey = "disposable-theme-smoke-key";
const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-theme-"));
const errors = [];
let browser, server;
const emberColors = {
  light: { surface: "rgb(230, 218, 196)", control: "rgb(216, 204, 176)", hover: "rgb(206, 194, 168)", ink: "rgb(40, 36, 24)" },
  dark: { surface: "rgb(28, 27, 25)", control: "rgb(37, 36, 34)", hover: "rgb(46, 45, 42)", ink: "rgb(216, 208, 192)" },
};
async function assertPalette(page, theme) {
  await page.mouse.move(0, 0); // Compare resting palette, even immediately after toggling the icon.
  await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
  const name = await page.locator("html").getAttribute("data-palette");
  const hexRgb = hex => "rgb(" + hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16)).join(", ") + ")";
  const tokens = builtInPalettes[name]?.[theme];
  const sidebarBackground = await page.locator("#app-sidebar").evaluate(el => getComputedStyle(el).backgroundImage);
  assert.equal(sidebarBackground.includes("linear-gradient"), name === "pride", "Pride wash is scoped to its sidebar");
  const palette = tokens ? { surface: hexRgb(tokens.surface), control: hexRgb(tokens["control-fill"]), ink: hexRgb(tokens.ink) } : emberColors[theme];
  for (const selector of ["body", "#graph-header", "#graph-wrap", ".map-options", "#note-editor", "#note-name", "#note-search", "#connection", "#dream-handoff", "#dream-preview"]) {
    assert.equal(await page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor), palette.surface, `${selector}: ${theme}`);
  }
  for (const selector of ["#home-new", "#new-note", "#zoom-in", "#connection-submit", "#dream-copy", "#color-theme"]) {
    assert.equal(await page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor), palette.control, `${selector}: ${theme}`);
  }
  assert.equal(await page.locator("body").evaluate((el) => getComputedStyle(el).color), palette.ink);
  assert.equal(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme), theme);
  const roles = await page.locator("#notes-link, #graph-link, #open-connection, #open-feedback").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight, leading: style.lineHeight };
  }));
  for (const role of roles) assert.deepEqual(role, roles[0], "ordinary sidebar destinations share one typography role");
  assert.equal(roles[0].weight, "400");
  assert.equal(roles[0].size, "13px");
  assert.equal(await page.locator("#sidebar-pinned-empty").count(), 0, "Pinned has no helper text");
  for (const [selector, name] of [["#new-note", "New note"], ["#open-search", "Search notes"]]) {
    assert.equal(await page.locator(selector).getAttribute("aria-label"), name);
    assert.equal(await page.locator(selector).innerText(), selector === "#open-search" ? "Search" : "", "Search is labeled and compose stays compact");
    assert.equal(await page.locator(selector + " svg").count(), 1);
  }
  const create = await page.locator("#new-note").boundingBox(), search = await page.locator("#open-search").boundingBox();
  assert.equal(create.y, search.y, "Search and New note occupy one row");
  assert.ok(create.x + create.width <= search.x, "Search follows compose without overlap");
  const themeAction = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  assert.equal(await page.locator("#color-theme").getAttribute("aria-label"), themeAction);
  assert.equal(await page.locator("#color-theme .theme-sun").isVisible(), theme === "dark");
  assert.equal(await page.locator("#color-theme .theme-moon").isVisible(), theme === "light");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "navigation fits viewport");
}
async function capture(page, name) {
  const [palette, scheme] = name.split("-");
  assert.equal(await page.locator("html").getAttribute("data-palette"), palette, name + " palette identity");
  assert.equal(await page.locator("html").getAttribute("data-theme"), scheme, name + " scheme identity");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + " viewport overflow");
  for (const dialog of await page.locator("dialog[open]").all()) {
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, name + " dialog bounds");
  }
  if (!process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) return;
  await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, name + ".png"), animations: "disabled" });
}
try {
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, "notes"), { recursive: true });
  await writeFile(path.join(root, "notes/theme.md"), `---\nid: ${id}\ntype: note\ntitle: A calmer way to work\ncreated_at: 2026-10-14T08:00:00Z\n---\n## Make room for what matters\nA good workspace helps you **think clearly** and keep useful context close. Start with a small plan, then follow the next meaningful step.\n\n### Today’s focus\n- [x] Gather the important ideas\n- [ ] Leave space for new connections\n\nRead [[Design principles]] and keep a steady [[Release rhythm]]. Use \`explicit recall\` when you need a little more context.\n\n| Keep | Let go |\n| --- | --- |\n| Clear decisions | Repeated explanations |\n| Small steps | Unnecessary noise |\n\n`);
  for (const [i, title, type, body] of [[2, "Design principles", "page", "Quiet defaults, clear focus, and familiar controls. [[A calmer way to work]]"], [3, "Release rhythm", "decision", "Small, tested improvements. [[Design principles]]"], [4, "Research notebook", "finding", "Keep evidence close to the decision. [[A calmer way to work]]"]]) {
    await writeFile(path.join(root, `notes/linked-${i}.md`), `---\nid: mem_a0000000-0000-4000-8000-${String(i).padStart(12, "0")}\ntype: ${type}\ntitle: ${title}\nupdated_at: 2026-10-28T08:00:00Z\n---\n${body}\n`);
  }
  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  const originalNote = await readFile(path.join(root, "notes/theme.md"), "utf8");
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  for (const width of [1280, 390, 320]) {
    for (const paletteName of ["ember", "ocean", "mono", "pride"]) for (const scheme of ["light", "dark"]) {
      await writeFile(path.join(root, "notes/theme.md"), originalNote);
      const context = await browser.newContext({ viewport: { width, height: 850 }, colorScheme: scheme });
      await context.addInitScript(name => { if (name !== "ember") localStorage.setItem("jumpybrain.palette", name); }, paletteName);
      const page = await context.newPage();
      await page.route("**/memories/all/search*", route => route.fulfill({ json: {
        results: [{ provenance: { file: "notes/theme.md", metadata: { id, title: "A calmer way to work", updated_at: "2026-10-28T08:00:00Z" } }, snippet: "A good workspace helps you think clearly and keep useful context close." },
          { provenance: { file: "notes/linked-2.md", metadata: { id: "mem_a0000000-0000-4000-8000-000000000002", title: "Design principles" } }, snippet: "Quiet defaults, clear focus, and familiar controls." }], recognition: { version: 1, candidateLimit: 120, candidates: 2, matched: 2, partial: true, metadataUnavailable: 2 }, index: { stale: false }
      } }));
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${server.url}/#apiKey=${apiKey}`);
      await page.locator("#recent-list a").first().waitFor();
      await assertPalette(page, scheme);
      await capture(page, `${paletteName}-${scheme}-${width}-home`);
      const opposite = scheme === "dark" ? "light" : "dark";
      await page.emulateMedia({ colorScheme: opposite });
      await assertPalette(page, opposite);
      await page.locator("#color-theme").click();
      await assertPalette(page, scheme);
      await page.reload();
      await assertPalette(page, scheme);
      assert.equal(await page.locator("html").getAttribute("data-theme-preference"), scheme);
      // The preference synchronizes across tabs, including returning to System.
      const second = await context.newPage();
      await second.goto(server.url);
      await second.locator("#color-theme").click();
      await assertPalette(page, opposite);
      await second.evaluate(() => localStorage.removeItem("jumpybrain.theme"));
      await page.waitForFunction(() => document.documentElement.dataset.themePreference === "system");
      await second.close();
      await assertPalette(page, opposite);
      await page.locator("#color-theme").focus();
      assert.equal(await page.locator("#color-theme").evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
      await page.locator("#home-new").focus();
      assert.equal(await page.locator("#home-new").evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
      assert.ok(await page.locator("#color-theme").evaluate((el) => el.getBoundingClientRect().right <= innerWidth), "theme control fits narrow navigation");
      // Dialog state survives a live system-theme change.
      await page.locator("#home-search").click();
      await page.locator("#note-search").waitFor();
      await page.emulateMedia({ colorScheme: scheme });
      await assertPalette(page, scheme);
      assert.equal(await page.locator("#note-search").evaluate((el) => el.open), true);
      await page.locator("#close-search").click();
      // Change appearance without rebuilding the rich editor or losing a draft/caret.
      await page.goto(`${server.url}/?note=${id}`);
      await page.locator("#note-editor").waitFor();
      await appendEditorText(page, " Theme changes keep this draft.");
      const markdown = await editorMarkdown(page), selection = await editorSelection(page);
      await page.evaluate(() => { window.themeEditorBefore = richEditor; });
      await page.emulateMedia({ colorScheme: opposite });
      await assertPalette(page, opposite);
      assert.equal(await editorMarkdown(page), markdown);
      assert.deepEqual(await editorSelection(page), selection);
      assert.equal(await page.evaluate(() => richEditor === window.themeEditorBefore), true);
      for (const palette of ["ocean", "mono", "ember", paletteName]) {
        await page.evaluate(value => colorTheme.setPalette(value), palette);
        assert.equal(await page.locator("html").getAttribute("data-palette"), palette);
        assert.equal(await editorMarkdown(page), markdown, "palette keeps the draft");
        assert.deepEqual(await editorSelection(page), selection, "palette keeps the caret");
        assert.equal(await page.evaluate(() => richEditor === window.themeEditorBefore), true);
      }
      await page.evaluate(value => colorTheme.setPreference(value), scheme);
      await assertPalette(page, scheme);
      await page.locator("#note-panel").evaluate(el => { el.scrollTop = 0; });
      await capture(page, `${paletteName}-${scheme}-${width}-note`);
      await page.locator("#open-search").click();
      await page.locator("#note-search-input").fill("calm");
      await page.locator("#search-results [role=option]").first().waitFor({ timeout: 6000 }).catch(async error => {
        console.error("Search fixture:", await page.locator("#search-message").textContent());
        throw error;
      });
      await capture(page, `${paletteName}-${scheme}-${width}-search`);
      await page.locator("#close-search").click();
      await page.locator("#open-feedback").click();
      await page.locator("#feedback-message").fill("A quiet place for a clearer thought.");
      await capture(page, `${paletteName}-${scheme}-${width}-feedback`);
      await page.locator("#feedback-message").press("Escape");
      await page.locator("#graph-link").click();
      await page.waitForFunction(() => window.__jumpyBrainGraphReady === true);
      await assertPalette(page, scheme);
      await page.getByTestId("graph-node").first().waitFor();
      assert.equal(await page.locator(".graph-labels text").first().evaluate((el) => getComputedStyle(el).stroke), await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor));
      await capture(page, `${paletteName}-${scheme}-${width}-map`);
      await context.close();
    }
  }
  // Unavailable storage must not prevent boot or in-tab theme selection.
  const context = await browser.newContext({ colorScheme: "dark" });
  await context.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("storage disabled"); } }); });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.url);
  await assertPalette(page, "dark");
  await page.locator("#color-theme").click();
  await assertPalette(page, "light");
  await context.close();
  assert.deepEqual(errors, []);
  console.log("All-theme browser smoke: PASS (4 palettes × 2 schemes × 3 widths; Home/note/search/feedback/map, OS/manual/reload/cross-tab/storage/draft/caret/contrast surfaces)");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
