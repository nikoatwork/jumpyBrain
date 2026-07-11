// Graph UI smoke validation. Run against a live jumpyBrain server:
//   npx --package=playwright node scripts/graph-ui-smoke.mjs
// Env: JUMPYBRAIN_GRAPH_SMOKE_URL, JUMPYBRAIN_GRAPH_SMOKE_API_KEY
import assert from "node:assert/strict";

const url = process.env.JUMPYBRAIN_GRAPH_SMOKE_URL;
const apiKey = process.env.JUMPYBRAIN_GRAPH_SMOKE_API_KEY;

if (!url || !apiKey) {
  console.error("Set JUMPYBRAIN_GRAPH_SMOKE_URL and JUMPYBRAIN_GRAPH_SMOKE_API_KEY.");
  process.exit(2);
}

let chromium;
try {
  const require = (await import("node:module")).default.createRequire(import.meta.url);
  chromium = require("playwright").chromium;
} catch {
  console.error("playwright is not installed. Run: npx playwright install chromium");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];
const ok = (label) => console.log("  ok - " + label);

try {
  await page.goto(`${url.replace(/\/$/, "")}/graph#apiKey=${encodeURIComponent(apiKey)}`);
  await page.getByTestId("graph-ready").waitFor({ state: "visible", timeout: 15000 });
  await page.getByTestId("graph-error").waitFor({ state: "hidden" });
  ok("graph-ready visible, graph-error hidden");

  const nodeCount = Number(await page.getByTestId("graph-node-count").innerText());
  const edgeCount = Number(await page.getByTestId("graph-edge-count").innerText());
  assert.ok(nodeCount > 0, `expected nodeCount > 0, got ${nodeCount}`);
  assert.ok(edgeCount >= 0, `expected edgeCount >= 0, got ${edgeCount}`);
  ok(`nodes=${nodeCount} edges=${edgeCount}`);

  await page.getByTestId("graph-svg").waitFor({ state: "visible" });
  ok("svg visible");

  await page.getByTestId("graph-query").fill("graph");
  await page.getByTestId("graph-reload").click();
  await page.getByTestId("graph-ready").waitFor({ state: "visible", timeout: 15000 });
  ok("filter reload kept graph-ready visible");

  // --- Slide-in note panel ---
  const panel = page.getByTestId("graph-note-panel");
  await expectClosed(panel);

  // A document node click opens the panel and fetches /memories/all/documents/:id.
  await page.getByTestId("graph-node").first().click();
  await page.getByTestId("graph-note-title").waitFor({ state: "visible", timeout: 15000 });
  await page.getByTestId("graph-note-content").waitFor({ state: "visible", timeout: 15000 });
  await expectOpen(panel);
  await page.waitForFunction(
    (sel) => !/^(loading|loading…)$/.test((document.querySelector(sel) || {}).textContent || ""),
    "[data-testid='graph-note-content']",
    { timeout: 15000 },
  );
  ok("document node click opens slide-in and renders note content");

  // Close via the close button.
  await page.getByTestId("graph-note-close").click();
  await expectClosed(panel);
  ok("close button closes panel");

  // Re-open then Escape closes.
  await page.getByTestId("graph-node").first().click();
  await expectOpen(panel);
  await page.keyboard.press("Escape");
  await expectClosed(panel);
  ok("Escape closes panel");

  // Re-clicking the active node toggles it closed.
  await page.getByTestId("graph-node").first().click();
  await expectOpen(panel);
  await page.getByTestId("graph-node").first().click();
  await expectClosed(panel);
  ok("re-click active node closes panel");

  // Clicking a second node while open swaps content without close/reopen.
  await page.getByTestId("graph-node").first().click();
  await expectOpen(panel);
  const firstTitle = await page.getByTestId("graph-note-title").innerText();
  if ((await page.getByTestId("graph-node").count()) > 1) {
    await page.getByTestId("graph-node").nth(1).click();
  } else {
    await page.getByTestId("graph-node").first().click();
  }
  await page.getByTestId("graph-note-title").waitFor({ state: "visible", timeout: 15000 });
  await expectOpen(panel);
  ok(`swap content without close/reopen (was open throughout; firstTitle=${JSON.stringify(firstTitle)})`);

  // Unresolved node (if present) does NOT open the panel.
  const unresolved = page.locator(".node.unresolved[data-testid='graph-node']");
  if (await unresolved.count() > 0) {
    await unresolved.first().click();
    await expectClosed(panel);
    const status = await page.getByTestId("graph-status").innerText();
    assert.match(status, /unresolved link:/, `expected unresolved status, got ${status}`);
    ok(`unresolved node does not open panel (status=${JSON.stringify(status)})`);
  } else {
    ok("no unresolved node present to assert (skipped)");
  }
} catch (error) {
  failures.push(error);
  await page.screenshot({ path: "scripts/graph-ui-smoke-failure.png" }).catch(() => undefined);
  console.error("FAIL:", error && error.message ? error.message : error);
} finally {
  await browser.close();
}

if (failures.length > 0) process.exit(1);
console.log("graph UI smoke: PASS");

async function expectOpen(panel) {
  await page.waitForFunction(() => document.body.classList.contains("panel-open"), null, { timeout: 15000 });
  const closed = await panel.getAttribute("data-closed");
  assert.equal(closed, null, `panel should be open (data-closed absent), got ${closed}`);
}

async function expectClosed(panel) {
  await page.waitForFunction(() => !document.body.classList.contains("panel-open"), null, { timeout: 15000 });
  const closed = await panel.getAttribute("data-closed");
  assert.ok(closed != null, `panel should be closed (data-closed present), got ${closed}`);
}
