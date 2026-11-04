// Actual authentication versus authorization failures, plus visible key repair.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/adapters/http-server/index.js";
import { AccessStore } from "../dist/adapters/access-control/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "jb-ux-create-permission-"));
let server, browser, access;
const results = [];
try {
  await initializeMemoryRoot(root);
  access = new AccessStore(root);
  const reader = await access.issue({ name: "Reader fixture", role: "reader" }),
    writer = await access.issue({ name: "Writer fixture", role: "writer" });
  server = await startJumpyBrainHttpServer({
    root,
    apiKeys: [],
    accessStore: access,
    port: 0,
    autoIndex: false,
  });
  browser = await launchPlaywrightChromium({
    chromium: await loadPlaywrightChromium(),
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(`${server.url}/#apiKey=${reader.token}`);
  await page.locator("#home-new").waitFor();
  const rejected = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/memories/all/notes"),
  );
  await page.locator("#home-new").click();
  assert.equal((await rejected).status(), 403);
  await page.waitForFunction(
    () => document.querySelector("#capture-message").dataset.error === "true",
  );
  assert.match(
    await page.locator("#capture-message").innerText(),
    /write access/,
    "an accepted reader key needs authorization, not another login",
  );
  assert.doesNotMatch(
    await page.locator("#capture-message").innerText(),
    /Connect with an access key/,
  );
  assert.equal(
    (await readdir(path.join(root, "notes"))).filter((file) =>
      file.endsWith(".md"),
    ).length,
    0,
  );
  results.push("valid reader: honest permission guidance and no creation");
  await page.locator("#open-connection").click();
  await page.locator("#api-key").fill(writer.token);
  await page.locator("#connection-submit").click();
  await page.locator("#connection-submit").waitFor({ state: "hidden" });
  await page.locator("#home-new").click();
  await page.waitForFunction(
    () => state.editor?.collaboration?.state.status === "saved",
  );
  assert.equal(
    (await readdir(path.join(root, "notes"))).filter((file) =>
      file.endsWith(".md"),
    ).length,
    1,
  );
  results.push(
    "visible writer-key repair: one creation and confirmed edit session",
  );
  const invalid = await browser.newPage();
  await invalid.goto(`${server.url}/#apiKey=invalid-fixture-key`);
  await invalid.locator("#home-new").waitFor();
  const unauthorized = invalid.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/memories/all/notes"),
  );
  await invalid.locator("#home-new").click();
  assert.equal((await unauthorized).status(), 401);
  await invalid.waitForFunction(
    () => document.querySelector("#capture-message").dataset.error === "true",
  );
  assert.match(
    await invalid.locator("#capture-message").innerText(),
    /Connect with an access key/,
  );
  assert.equal(
    (await readdir(path.join(root, "notes"))).filter((file) =>
      file.endsWith(".md"),
    ).length,
    1,
  );
  results.push("invalid key: authentication guidance remains distinct");
  console.log(
    JSON.stringify({
      passed: true,
      results,
      limits: [
        "Localhost hosted-browser fixture; no live access keys or permission changes.",
      ],
    }),
  );
} finally {
  await browser?.close();
  await server?.close();
  access?.close();
  await rm(root, { recursive: true, force: true });
}
