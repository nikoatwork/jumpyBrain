// Long-lived production shell/CLI probe. Explicit invocation; disposable brain only.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  cp,
  readdir,
  lstat,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
const { values } = parseArgs({
  options: {
    "duration-ms": { type: "string", default: "1800000" },
    "idle-ms": { type: "string", default: "15000" },
    out: { type: "string" },
  },
  strict: true,
});
const duration = Number(values["duration-ms"]),
  idle = Number(values["idle-ms"]);
assert.ok(
  Number.isInteger(duration) && duration >= 60000 && duration <= 5400000,
);
assert.ok(Number.isInteger(idle) && idle >= 1000 && idle <= 60000);
const repo = fileURLToPath(new URL("..", import.meta.url));
const output = path.resolve(
  values.out ?? path.join(repo, ".local-pack/ux-soak", Date.now().toString()),
);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const temporary = await mkdtemp(path.join(os.tmpdir(), "jb-ux-soak-")),
  artifact = path.join(temporary, "runtime"),
  root = path.join(temporary, "brain");
const sha = (value) => createHash("sha256").update(value).digest("hex"),
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = "disposable-soak-" + randomUUID(),
  draftId = "mem_41110000-1111-4111-8111-111111111111",
  briefId = "mem_41110000-1111-4111-8111-111111111112",
  logisticsId = "mem_41110000-1111-4111-8111-111111111113";
const config = path.join(temporary, "device.json");
const prefix = (id, title) =>
  `---\nid: ${id}\ntype: note\ntitle: ${title}\n---\n`;
let server, browser, producer;
const contexts = [];
async function inventory(directory) {
  const files = {};
  for (const file of (await readdir(directory, { recursive: true })).sort()) {
    const absolute = path.join(directory, file),
      entry = await lstat(absolute);
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isFile()) files[file] = sha(await readFile(absolute));
  }
  return sha(JSON.stringify(files));
}
function cli(args, input) {
  const child = spawn(
    process.execPath,
    [
      path.join(artifact, "dist/cli.js"),
      ...args,
      "--target-url",
      server.url,
      "--json",
    ],
    {
      env: {
        ...process.env,
        JUMPYBRAIN_API_KEY: key,
        JUMPYBRAIN_CLI_CONFIG: config,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (x) => (stdout += x));
  child.stderr.on("data", (x) => (stderr += x));
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
  if (input !== undefined) child.stdin.end(input);
  return { child, result };
}
async function command(args, input = "") {
  const result = await cli(args, input).result;
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}
async function until(operation, label, ms = 20000) {
  const end = Date.now() + ms;
  while (!(await operation())) {
    if (Date.now() > end) throw new Error("Deadline: " + label);
    await pause(250);
  }
}
async function saved(page) {
  await page.waitForFunction(
    () => state.editor?.collaboration?.state.status === "saved",
  );
}
async function typeIn(page, label, text) {
  await page.evaluate((label) => {
    const root = document.querySelector("#note-editor");
    root.focus();
    const paragraph = [...root.querySelectorAll("p")].find((element) =>
      element.textContent.startsWith(label),
    );
    if (!paragraph) throw new Error("Missing fixture paragraph");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, label);
  await page.keyboard.insertText(text);
  await saved(page);
}
const report = {
  schema: 1,
  startedAt: new Date().toISOString(),
  platform: { os: process.platform, arch: process.arch, node: process.version },
  requestedDurationMs: duration,
  idleMs: idle,
  head: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim(),
  passed: false,
  cycles: [],
  limits: [
    "Long-lived localhost Chromium/real CLI diagnostic; no native Mac, real-user timing or public VPS claim.",
    "Deliberate WebSocket disconnects affect only the fixture browser; no production/shared service is stopped.",
  ],
};
try {
  await mkdir(artifact);
  await cp(path.join(repo, "dist"), path.join(artifact, "dist"), {
    recursive: true,
  });
  await cp(
    path.join(repo, "package.json"),
    path.join(artifact, "package.json"),
  );
  report.runtimeSha256 = await inventory(path.join(artifact, "dist"));
  report.build = JSON.parse(
    await readFile(
      path.join(artifact, "dist/adapters/diagnostics/build-info.json"),
      "utf8",
    ),
  );
  report.scriptSha256 = sha(await readFile(fileURLToPath(import.meta.url)));
  await mkdir(path.join(output, "inputs"));
  await cp(
    fileURLToPath(import.meta.url),
    path.join(output, "inputs/ux-journey-soak.mjs"),
  );
  for (const file of [
    "playwright-runtime.mjs",
    "collaboration-smoke-transport.mjs",
  ])
    await cp(
      path.join(repo, "scripts", file),
      path.join(output, "inputs", file),
    );
  const runtime = await import(
      pathToFileURL(path.join(artifact, "dist/runtime/index.js")).href
    ),
    host = await import(
      pathToFileURL(path.join(artifact, "dist/server/index.js")).href
    );
  await runtime.initializeMemoryRoot(root);
  await writeFile(
    config,
    JSON.stringify({ schemaVersion: 1, remoteTargets: [] }),
  );
  await writeFile(
    path.join(root, "notes/draft.md"),
    prefix(draftId, "Soak coauthoring draft") +
      "Human observations: start.\n\nAgent output: ",
  );
  await writeFile(
    path.join(root, "notes/brief.md"),
    prefix(briefId, "Soak workshop brief") + "Peer observations: start.\n",
  );
  await writeFile(
    path.join(root, "notes/logistics.md"),
    prefix(logisticsId, "Soak workshop logistics") +
      "Logistics observations: start.\n",
  );
  await runtime.indexMemory(root, { indexing: { mode: "lexical" } });
  server = await host.startJumpyBrainHttpServer({
    root,
    apiKeys: [key],
    port: 0,
  });
  browser = await launchPlaywrightChromium({
    chromium: await loadPlaywrightChromium(),
  });
  const pages = [],
    transports = [],
    errors = [];
  for (const [index, id] of [draftId, briefId].entries()) {
    const context = await browser.newContext({
      viewport: { width: index ? 390 : 1280, height: 844 },
    });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (error) => errors.push(error.message));
    transports.push(await installCollaborationSmokeTransport(page));
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await saved(page);
    pages.push(page);
  }
  const start = Date.now(),
    end = start + duration,
    allDraftMarkers = [],
    allPeerMarkers = [];
  let cycle = 0;
  while (Date.now() < end) {
    cycle++;
    const at = new Date().toISOString(),
      marker = `soak-${cycle}-${randomUUID().slice(0, 8)}`,
      human = ` human-${marker}`,
      peer = ` peer-${marker}`,
      first = ` agent-first-${marker}`,
      second = ` agent-last-${marker}`,
      streamId = "stream-" + cycle;
    allDraftMarkers.push(human, first, second);
    allPeerMarkers.push(peer);
    producer = cli([
      "collaborate",
      "stream",
      "--id",
      draftId,
      "--client-id",
      "soak-agent",
      "--stream-id",
      streamId,
    ]);
    producer.child.stdin.write(first);
    await pages[0].waitForFunction(
      (marker) => richEditor.getMarkdown().includes(marker),
      first,
    );
    await pages[0].waitForFunction(() =>
      document
        .querySelector("#note-presence")
        .textContent.includes("generating"),
    );
    await Promise.all([
      typeIn(pages[0], "Human observations:", human),
      typeIn(pages[1], "Peer observations:", peer),
    ]);
    producer.child.stdin.write(second);
    await pages[0].waitForFunction(
      (marker) => richEditor.getMarkdown().includes(marker),
      second,
    );
    const cancelled = cycle % 3 === 0;
    if (cancelled)
      await command([
        "collaborate",
        "cancel",
        "--id",
        draftId,
        "--client-id",
        "soak-agent",
        "--stream-id",
        streamId,
      ]);
    producer.child.stdin.end();
    const receipt = await producer.result;
    assert.equal(receipt.code, 0, receipt.stderr);
    assert.equal(
      JSON.parse(receipt.stdout).stream.state,
      cancelled ? "cancelled" : "finished",
    );
    producer = undefined;
    await pages[0].waitForFunction(
      (text) =>
        document.querySelector("#note-generation-state").textContent === text,
      cancelled ? "Generation stopped" : "Generation finished",
    );
    await saved(pages[0]);
    const canonical = await command(["show", "--id", draftId]);
    for (const marker of allDraftMarkers)
      assert.equal(
        canonical.content.split(marker).length,
        2,
        "all accumulated contributions survive exactly once",
      );
    const peerCanonical = await command(["show", "--id", briefId]);
    for (const marker of allPeerMarkers)
      assert.equal(
        peerCanonical.content.split(marker).length,
        2,
        "all peer contributions survive exactly once",
      );
    const current = await pages[0].evaluate(() => ({
      url: location.href,
      body: richEditor.getMarkdown(),
      focus: document.activeElement?.id,
    }));
    const previous = await command(["show", "--id", logisticsId]);
    await command(
      ["update", "--id", logisticsId, "--if-match", previous.contentHash],
      previous.content + "\nLogistics " + marker + ".\n",
    );
    assert.deepEqual(
      await pages[0].evaluate(() => ({
        url: location.href,
        body: richEditor.getMarkdown(),
        focus: document.activeElement?.id,
      })),
      current,
      "off-note write preserves current scope/content/focus",
    );
    report.pendingCycle = {
      cycle,
      phase: "automatic publication",
      canonicalHash: canonical.contentHash,
    };
    // Poll observational status rather than repeatedly searching: foreground
    // queries may defer the production quiet window (up to its 30s maximum).
    await until(
      async () => {
        const status = await command(["status"]);
        report.pendingCycle.readiness = status.readiness;
        return status.readiness?.freshness === "fresh";
      },
      "automatic index publication",
      60000,
    );
    const found = await command(["search", "--query", marker, "--no-refresh"]);
    assert.ok(
      found.results.some(
        (result) => result.provenance.metadata?.id === logisticsId,
      ),
      "new evidence is independently indexed, not only in the tab cache",
    );
    await pages[0].locator("#open-search").click();
    await pages[0].locator("#note-search-input").fill(marker);
    await pages[0]
      .locator("#search-results [role=option]")
      .filter({ hasText: "Soak workshop logistics" })
      .first()
      .click();
    await pages[0].waitForURL(
      (url) => url.searchParams.get("note") === logisticsId,
    );
    await saved(pages[0]);
    await pages[0].locator("#navigate-back").click();
    await pages[0].waitForURL(
      (url) => url.searchParams.get("note") === draftId,
    );
    await saved(pages[0]);
    if (cycle % 4 === 0) {
      transports[0].disconnect();
      await pages[0].waitForFunction(() =>
        ["offline", "connecting"].includes(
          state.editor?.collaboration?.state.status,
        ),
      );
      await saved(pages[0]);
      assert.equal(
        await pages[0].locator("#note-generation-state").isVisible(),
        false,
        "reconnect never fabricates a terminal cue",
      );
    }
    if (cycle % 7 === 0) {
      await pages[0].reload();
      await saved(pages[0]);
    }
    assert.deepEqual(errors, []);
    assert.equal(
      await pages[0].evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    report.cycles.push({
      cycle,
      at,
      finishedAt: new Date().toISOString(),
      outcome: cancelled ? "cancelled" : "finished",
      canonicalHash: canonical.contentHash,
      peerHash: peerCanonical.contentHash,
      accumulatedDraftMarkers: allDraftMarkers.length,
      live: await pages[0].evaluate(() => ({
        epoch: state.editor.collaboration.snapshot.epoch,
        revision: state.editor.collaboration.snapshot.revision,
      })),
      searchDiscovery: true,
      offNoteStable: true,
      backReturned: true,
    });
    delete report.pendingCycle;
    await writeFile(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        cycle,
        elapsedMs: Date.now() - start,
        outcome: cancelled ? "cancelled" : "finished",
        checked:
          "canonical contributions, scope/focus, indexed search, Back and reconnect",
      }),
    );
    const remaining = end - Date.now();
    if (remaining > 0) await pause(Math.min(idle, remaining));
  }
  assert.equal(
    await inventory(path.join(artifact, "dist")),
    report.runtimeSha256,
    "the tested runtime is immutable",
  );
  report.passed = true;
  report.elapsedMs = Date.now() - start;
  report.finishedAt = new Date().toISOString();
} catch (error) {
  report.error = String(error.stack ?? error).replaceAll(key, "[fixture-key]");
  process.exitCode = 1;
} finally {
  if (producer?.child.exitCode === null) {
    producer.child.stdin.end();
    producer.child.kill("SIGTERM");
  }
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  await server?.close();
  await cp(path.join(root, "notes"), path.join(output, "canonical"), {
    recursive: true,
  }).catch(() => {});
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await rm(temporary, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 30,
  });
  console.log(
    JSON.stringify({
      passed: report.passed,
      cycles: report.cycles.length,
      error: report.error,
      report: path.join(output, "report.json"),
    }),
  );
}
