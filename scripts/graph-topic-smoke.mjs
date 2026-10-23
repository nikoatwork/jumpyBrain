// Real disposable lexical brain; shared search, Canvas/SVG, automatic maintenance.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot, indexMemory } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "jumpybrain-topic-"));
let browser, server;
const id = (i) =>
  "mem_" + i.toString(16).padStart(8, "0") + "-0000-4000-8000-000000000001";
const title = (i) =>
  i === 0
    ? "Health and sleep"
    : i % 100 === 0
      ? "Health topic " + i
      : "Journal " + i;
const note = (i) =>
  "---\nid: " +
  id(i) +
  "\ntype: note\ntitle: " +
  JSON.stringify(title(i)) +
  "\n---\n\n" +
  (i % 100 === 0 && i + 1 < 1650 ? "[[" + title(i + 1) + "]]" : "") +
  (i === 0 ? "\n[[Health topic 100]]" : "") +
  "\nCanonical evidence " +
  i +
  ".\n";
try {
  await initializeMemoryRoot(root);
  for (let base = 0; base < 1650; base += 100)
    await Promise.all(
      Array.from({ length: Math.min(100, 1650 - base) }, (_, j) =>
        writeFile(
          path.join(root, "notes", String(base + j) + ".md"),
          note(base + j),
        ),
      ),
    );
  await indexMemory(root, { indexing: { mode: "lexical" } });
  server = await startJumpyBrainHttpServer({
    root,
    apiKeys: ["topic-disposable"],
    port: 0,
    autoIndex: {
      quietMs: 50,
      maxDeferralMs: 200,
      startupMs: 10,
      intervalMs: 500,
    },
  });
  browser = await launchPlaywrightChromium({
    chromium: await loadPlaywrightChromium(),
  });
  const shots = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR;
  if (shots) await mkdir(shots, { recursive: true });
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(server.url + "/graph#apiKey=topic-disposable");
    await ready(page);
    assert.equal(await page.locator("#graph-node-count").innerText(), "1650");
    assert.ok(await page.locator("#graph-canvas").isVisible());
    assert.ok(
      (await page.locator("#viewport").locator("*").count()) < 1500,
      "dense view keeps DOM bounded",
    );
    // Controlled semantic packet through the production browser search/graph seams.
    const semanticHandler = async route => {
      const request = route.request().postDataJSON();
      if (request.query !== "rest recovery") return route.continue();
      const results = [0, 100, 200, ...Array.from({ length: 117 }, (_, n) => n + 1)]
        .map((i, rank) => ({ id: String(i), score: rank < 3 ? 1 : 10,
          scoreBreakdown: { qmdScore: rank < 3 ? [.95, .9, .82][rank] : .6 },
          snippet: "A paraphrase", provenance: { file: "notes/" + i + ".md", metadata: { id: id(i), title: title(i) } } }));
      await route.fulfill({ json: { results, index: { stale: false }, readiness: { freshness: "fresh" } } });
    };
    await page.route("**/memories/all/search", semanticHandler);
    const query = page.locator("#query");
    await query.fill("rest recovery");
    await ready(page);
    assert.equal(await page.locator("#graph-node-count").innerText(), "3", "three strong semantic notes survive 117 weak hits");
    assert.equal(await page.locator(".match-context").count(), 0);
    assert.equal(await page.locator('[data-testid="graph-edge"]').count(), 1);
    await page.unroute("**/memories/all/search", semanticHandler);
    await query.fill("h");
    assert.equal(
      await page.locator("#graph").getAttribute("aria-busy"),
      "true",
    );
    await ready(page);
    await query.fill("he");
    await ready(page);
    await query.fill("health");
    await ready(page);
    assert.ok(
      (await page.locator(".match-direct").count()) === 12,
      "graph caps strong topic matches at twelve",
    );
    assert.ok(
      (await page.locator(".match-context").count()) === 0,
      "nonmatching neighbors stay out of search",
    );
    assert.ok(await page.locator('[data-testid="graph-edge"]').count() > 0, "links between retained matches remain visible");
    assert.equal(
      await query.evaluate((n) => n === document.activeElement),
      true,
    );
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await query.fill("Health and sleep");
      await ready(page);
      await page.waitForFunction(
        () => document.querySelectorAll(".graph-title").length >= 1,
      );
      assert.equal(await page.locator("#graph-node-count").innerText(), "1");
      const labels = await page
        .locator(".graph-title")
        .evaluateAll((ns) =>
          ns.map((n) => ({
            title: n.getAttribute("aria-label"),
            font: getComputedStyle(n).fontSize,
            box: n.getBoundingClientRect().toJSON(),
          })),
        );
      assert.ok(labels.some((n) => n.title === "Health and sleep"));
      assert.ok(labels.every((n) => n.font === "12px"));
      await page.locator("#zoom-in").click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".graph-title")].every(
          (n) => getComputedStyle(n).fontSize === "12px",
        ),
      );
      if (shots)
        await page.screenshot({
          path: path.join(shots, `topic-${width}-${theme}.png`),
        });
      const camera = await page.evaluate(() => ({
        scale: state.scale,
        pan: { ...state.pan },
      }));
      await query.fill("health");
      await ready(page);
      assert.deepEqual(
        await page.evaluate(() => ({
          scale: state.scale,
          pan: { ...state.pan },
        })),
        camera,
        "manual camera survives query changes",
      );
      await page.locator("#reset-view").click();
    }
    await query.fill("Health and sleep");
    await ready(page);
    await page.locator('.graph-title[aria-label="Health and sleep"]').click();
    await page.waitForURL((u) => u.searchParams.get("note") === id(0));
    await page.locator("#note-editor").waitFor({ state: "visible" });
    await page.goBack();
    await ready(page);
    assert.equal(await query.inputValue(), "Health and sleep");
    await query.fill("");
    await ready(page);
    assert.equal(await page.locator("#graph-node-count").innerText(), "1650");
    assert.deepEqual(
      await page.evaluate(() => ({
        scale: state.scale,
        pan: { ...state.pan },
      })),
      { scale: 1, pan: { x: 0, y: 0 } },
      "clear restores automatic overview camera",
    );
    // External writer, host refresh, then status publication updates the CURRENT query.
    await page.evaluate(() => searchMaintenance.check());
    await query.fill("freshbodyneedle");
    await ready(page);
    assert.equal(await page.locator("#graph-node-count").innerText(), "0");
    await writeFile(
      path.join(root, "notes", "0.md"),
      note(0) + "\nfreshbodyneedle\n",
    );
    await page.waitForFunction(
      async () => {
        await searchMaintenance.check();
        return document.querySelector("#graph-node-count").textContent === "1"
          && document.querySelector("#graph").getAttribute("aria-busy") === "false";
      },
      {},
      { timeout: 15000, polling: 200 },
    );
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /Search results may be incomplete|Search index is out of date/,
    );
    // A cancelled touch stream or right click cannot open a note.
    const url = page.url();
    await page
      .locator("#graph")
      .dispatchEvent("pointercancel", { pointerId: 77 });
    await page
      .locator("#graph")
      .dispatchEvent("pointerup", {
        pointerId: 77,
        clientX: 100,
        clientY: 100,
      });
    assert.equal(page.url(), url);
    await page.locator("#graph").dispatchEvent("pointerdown", { pointerId: 78, button: 2, clientX: 100, clientY: 100 });
    await page.locator("#graph").dispatchEvent("pointerup", { pointerId: 78, button: 2, clientX: 100, clientY: 100 });
    assert.equal(page.url(), url, "right clicks cannot activate a graph target");
    await page.locator("#home-link").click();
    await page.waitForURL(
      (u) => u.pathname === "/" && !u.searchParams.has("note"),
    );
    assert.equal(await page.locator("#viewport").locator("*").count(), 0);
    assert.equal(
      await page.locator("#graph-canvas").evaluate((n) => n.width),
      0,
    );
    assert.deepEqual(errors, []);
    await page.close();
    // Leave the next pass with a body that does not match the publication test.
    await writeFile(path.join(root, "notes", "0.md"), note(0));
    await server.autoIndex.tick();
    console.log(
      `PASS ${width}px:1650notes, conservative semantic selection, fixed labels/themes, camera/history, external refresh, cancellation, hidden cleanup`,
    );
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(root, { recursive: true, force: true });
}
async function ready(page) {
  await page.locator("#ready").waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      document.querySelector("#graph").getAttribute("aria-busy") === "false",
  );
}
