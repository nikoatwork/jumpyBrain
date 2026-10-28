// Production shell + disposable Markdown root; no QMD index or personal memory needed.
// npm run build && npx --package=playwright node scripts/theme-smoke.mjs
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import { loadPlaywrightChromium, launchPlaywrightChromium } from "./playwright-runtime.mjs";
import { appendEditorText, editorMarkdown, editorSelection } from "./editor-smoke-helpers.mjs";

const id = "mem_a0000000-0000-4000-8000-000000000001";
const apiKey = "disposable-theme-smoke-key";
const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-theme-"));
const errors = [];
let browser, server;
const palettes = {
  light: { surface: "rgb(230, 218, 196)", control: "rgb(216, 204, 176)", hover: "rgb(206, 194, 168)", ink: "rgb(40, 36, 24)" },
  dark: { surface: "rgb(28, 27, 25)", control: "rgb(37, 36, 34)", hover: "rgb(46, 45, 42)", ink: "rgb(216, 208, 192)" },
};
async function assertPalette(page, theme) {
  await page.mouse.move(0, 0); // Compare resting palette, even immediately after toggling the icon.
  await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
  const palette = palettes[theme];
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
try {
  await initializeMemoryRoot(root);
  await mkdir(path.join(root, "notes"), { recursive: true });
  await writeFile(path.join(root, "notes/theme.md"), `---\nid: ${id}\ntype: note\ntitle: Ember fixture\ncreated: 2026-10-14\n---\nA calm place to write.\n`);
  server = await startJumpyBrainHttpServer({ root, apiKeys: [apiKey], port: 0, autoIndex: false });
  const chromium = await loadPlaywrightChromium();
  browser = await launchPlaywrightChromium({ chromium });
  for (const width of [1280, 390, 320]) {
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 850 }, colorScheme: scheme });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${server.url}/#apiKey=${apiKey}`);
      await page.locator("#recent-list a").waitFor();
      await assertPalette(page, scheme);
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
      for (const palette of ["ocean", "grove", "ember"]) {
        await page.evaluate(value => colorTheme.setPalette(value), palette);
        assert.equal(await page.locator("html").getAttribute("data-palette"), palette);
        assert.equal(await editorMarkdown(page), markdown, "palette keeps the draft");
        assert.deepEqual(await editorSelection(page), selection, "palette keeps the caret");
        assert.equal(await page.evaluate(() => richEditor === window.themeEditorBefore), true);
      }
      await page.locator("#graph-link").click();
      await page.waitForFunction(() => window.__jumpyBrainGraphReady === true);
      await assertPalette(page, opposite);
      await page.getByTestId("graph-node").first().waitFor();
      assert.equal(await page.locator(".graph-labels text").first().evaluate((el) => getComputedStyle(el).stroke), palettes[opposite].surface);
      if (process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR) {
        await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, `ember-${opposite}-${width}-map.png`) });
      }
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
  console.log("Ember light/dark production browser smoke: PASS (desktop + narrow, OS/manual/reload/cross-tab/storage/draft/dialog/map)");
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
