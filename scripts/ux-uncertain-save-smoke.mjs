import { showSidebar } from "./editor-smoke-helpers.mjs";
// Lost acknowledgments and concurrent peer edits on disposable hosted notes.
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  cp,
  readdir,
  lstat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { initializeMemoryRoot } from "../dist/runtime/index.js";
import { startJumpyBrainHttpServer } from "../dist/server/index.js";
import {
  loadPlaywrightChromium,
  launchPlaywrightChromium,
} from "./playwright-runtime.mjs";
import { installCollaborationSmokeTransport } from "./collaboration-smoke-transport.mjs";
import { appendEditorText, editorMarkdown } from "./editor-smoke-helpers.mjs";

const { values } = parseArgs({
  options: {
    "idle-ms": { type: "string", default: "0" },
    "peer-edits": { type: "string", default: "1" },
    kind: { type: "string" },
    width: { type: "string" },
    out: { type: "string" },
  },
  strict: true,
});
const idleMs = Number(values["idle-ms"]),
  peerEdits = Number(values["peer-edits"]);
assert.ok(Number.isSafeInteger(idleMs) && idleMs >= 0 && idleMs <= 3600000);
assert.ok(
  Number.isSafeInteger(peerEdits) && peerEdits >= 1 && peerEdits <= 140,
);
const kinds = values.kind
    ? [values.kind]
    : ["accepted-body", "accepted-title", "rejected-body"],
  widths = values.width ? [Number(values.width)] : [1280, 390];
assert.ok(
  kinds.every((kind) =>
    ["accepted-body", "accepted-title", "rejected-body"].includes(kind),
  ),
);
assert.ok(widths.every((width) => [1280, 390].includes(width)));
assert.ok(idleMs === 0 || widths.length * kinds.length === 1, "Idle observation requires one explicit kind and width; total observation stays bounded.");
const output = values.out ? path.resolve(values.out) : null;
if (output) {
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output);
  await mkdir(path.join(output, "inputs"));
  for (const name of [
    "ux-uncertain-save-smoke.mjs",
    "editor-smoke-helpers.mjs",
    "collaboration-smoke-transport.mjs",
    "playwright-runtime.mjs",
  ])
    await cp(new URL(name, import.meta.url), path.join(output, "inputs", name));
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function runtimeHash() {
  const directory = new URL("../dist/", import.meta.url),
    entries = {};
  for (const name of (await readdir(directory, { recursive: true })).sort()) {
    const file = new URL(name, directory),
      entry = await lstat(file);
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isFile()) entries[name] = digest(await readFile(file));
  }
  return digest(JSON.stringify(entries));
}
const report = {
  schema: 1,
  startedAt: new Date().toISOString(),
  passed: false,
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  build: JSON.parse(
    await readFile(
      new URL("../dist/adapters/diagnostics/build-info.json", import.meta.url),
      "utf8",
    ),
  ),
  runtimeSha256: await runtimeHash(),
  scriptSha256: digest(
    await readFile(new URL("ux-uncertain-save-smoke.mjs", import.meta.url)),
  ),
  selection: { widths, kinds, idleMs, peerEdits },
  observations: [],
};
const checkpoint = async () => {
  if (output)
    await writeFile(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
};
const root = await mkdtemp(path.join(os.tmpdir(), "jb-ux-uncertain-"));
const key = "disposable-uncertain-save-key",
  results = [];
let server, browser;
const saved = (page) =>
  page.waitForFunction(
    () => state.editor?.collaboration?.state.status === "saved",
  );
try {
  await initializeMemoryRoot(root);
  server = await startJumpyBrainHttpServer({
    root,
    apiKeys: [key],
    port: 0,
    autoIndex: false,
  });
  browser = await launchPlaywrightChromium({
    chromium: await loadPlaywrightChromium(),
  });
  let sequence = 0;
  for (const width of widths)
    for (const kind of kinds) {
      sequence++;
      const id =
        "mem_41220000-1111-4111-8111-" + String(sequence).padStart(12, "0");
      const file = path.join(root, "notes", sequence + ".md");
      const initial = `---\nid: ${id}\ntype: note\ntitle: Uncertain fixture ${sequence}\n---\nHuman baseline ${sequence}.\n`;
      await writeFile(file, initial);
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const transport = await installCollaborationSmokeTransport(page);
      await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
      await saved(page);
      const peer = await browser.newPage();
      await peer.goto(`${server.url}/?note=${id}#apiKey=${key}`);
      await saved(peer);
      const marker = ` unique human ${sequence}`;
      // Title broadcasts have no operation ID. Hold that independent evidence
      // too, so the test genuinely loses both confirmation channels.
      const titleEvent =
        kind === "accepted-title"
          ? transport.holdNextEvent(
              id,
              (snapshot) => snapshot.title === "Private title " + sequence,
            )
          : null;
      const fault =
        kind === "rejected-body"
          ? transport.rejectNext("edit", { code: "fixture_failed" })
          : transport.dropNextReply(
              kind === "accepted-title" ? "title" : "edit",
            );
      if (kind === "accepted-title")
        await page.locator("#note-name").fill("Private title " + sequence);
      else await appendEditorText(page, marker);
      await fault.arrived;
      if (titleEvent) {
        await titleEvent.arrived;
        titleEvent.release();
      }
      await page.waitForFunction(
        () => state.editor?.state.saveStatus === "failed",
      );
      const privateDraft = await editorMarkdown(page),
        privateTitle = await page.locator("#note-name").inputValue();
      if (kind !== "rejected-body")
        assert.equal(
          await page.evaluate(() => state.editor.state.unconfirmedSave),
          true,
          `${width}/${kind}: actual unconfirmed-save state`,
        );
      const accepted = await readFile(file, "utf8");
      if (kind === "rejected-body")
        assert.doesNotMatch(accepted, new RegExp(marker));
      else
        assert.ok(
          accepted.includes(kind === "accepted-title" ? privateTitle : marker),
        );
      await saved(peer);
      if (kind === "accepted-body")
        await peer.waitForFunction(
          (text) => richEditor.getMarkdown().includes(text),
          marker,
        );
      if (kind === "accepted-title")
        await peer.waitForFunction(
          (text) => document.querySelector("#note-name").value === text,
          privateTitle,
        );
      const peerMarker = " confirmed peer " + sequence;
      await appendEditorText(peer, peerMarker);
      await saved(peer);
      const peerMarkers = [peerMarker];
      for (let round = 1; round < peerEdits; round++) {
        const text = ` <peer-${sequence}-${String(round).padStart(3, "0")}>`;
        peerMarkers.push(text);
        await appendEditorText(peer, text);
        await saved(peer);
      }
      const afterPeer = await readFile(file, "utf8");
      for (const text of peerMarkers)
        assert.equal(
          afterPeer.split(text).length,
          2,
          "all peer edits are canonical exactly once",
        );
      const peerRevision = await peer.evaluate(
          () => state.editor.collaboration.snapshot.revision,
        ),
        idleStart = Date.now(),
        idleDeadline = idleStart + idleMs;
      while (Date.now() < idleDeadline) {
        assert.equal(
          await editorMarkdown(page),
          privateDraft,
          "idle keeps the uncertain private draft visible",
        );
        assert.equal(
          await page.locator("#note-name").inputValue(),
          privateTitle,
        );
        assert.equal(
          await page.evaluate(() => state.editor.state.saveStatus),
          "failed",
        );
        assert.equal(new URL(page.url()).searchParams.get("note"), id);
        assert.equal(
          await readFile(file, "utf8"),
          afterPeer,
          "idle never replays an uncertain edit",
        );
        const observation = {
          width,
          kind,
          elapsedMs: Date.now() - idleStart,
          peerRevision,
          peerEdits,
        };
        report.observations.push(observation);
        await checkpoint();
        console.log(
          JSON.stringify({ phase: "idle private draft", ...observation }),
        );
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(30000, Math.max(1, idleDeadline - Date.now())),
          ),
        );
      }

      assert.ok(afterPeer.includes(peerMarker));
      assert.equal(
        await editorMarkdown(page),
        privateDraft,
        "a failed/uncertain draft stays visible through peer updates",
      );
      assert.equal(await page.locator("#note-name").inputValue(), privateTitle);
      await showSidebar(page);
      await page.locator("#home-link").click();
      await page.waitForFunction(() => !state.editor.state.navigationPending);
      assert.equal(
        new URL(page.url()).searchParams.get("note"),
        id,
        "failed drafts keep the navigation barrier",
      );
      await page.locator("#note-recover").click();
      if (!await page.locator("#recovery-options").evaluate(element => element.open)) await page.locator("#recovery-options > summary").click();
      await page.waitForFunction(
        (text) =>
          document.querySelector("#recovery-saved").value.includes(text),
        peerMarker,
      );
      assert.equal(
        await page.locator("#recovery-draft").inputValue(),
        privateTitle + "\n\n" + privateDraft,
      );
      await page.locator("#recovery-copy").click();
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        privateTitle + "\n\n" + privateDraft,
      );
      assert.equal(
        await readFile(file, "utf8"),
        afterPeer,
        "review/copy do not publish or replay an uncertain edit",
      );
      await page.locator("#recovery-reload").click();
      await saved(page);
      assert.equal(await page.locator("#document-recovery").isVisible(), false);
      assert.match(await editorMarkdown(page), new RegExp(peerMarker));
      assert.equal(
        await readFile(file, "utf8"),
        afterPeer,
        "accepting saved content makes no canonical write",
      );
      if (kind === "accepted-body")
        assert.equal(
          afterPeer.split(marker).length,
          2,
          "accepted edit is present exactly once",
        );
      if (kind === "rejected-body")
        assert.doesNotMatch(await editorMarkdown(page), new RegExp(marker));
      await page.reload();
      await saved(page);
      assert.match(await editorMarkdown(page), new RegExp(peerMarker));
      assert.equal(await readFile(file, "utf8"), afterPeer);
      results.push(
        `${width}/${kind}: uncertain/private draft, peer preservation, guarded navigation, copy and explicit saved acceptance`,
      );
      console.log(JSON.stringify({ checkpoint: results.at(-1) }));
      await peer.close();
      await context.close();
    }
  assert.equal(
    await runtimeHash(),
    report.runtimeSha256,
    "the tested runtime stayed immutable",
  );
  report.passed = true;
  report.results = results;
  report.finishedAt = new Date().toISOString();
  console.log(
    JSON.stringify({
      passed: true,
      selection: report.selection,
      output,
      results,
      limits: [
        "Localhost Chromium fault injection; no native-client or real remote-brain claim.",
      ],
    }),
  );
} catch (error) {
  report.error = String(error.stack ?? error).replaceAll(key, "[fixture-key]");
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  if (output)
    await cp(path.join(root, "notes"), path.join(output, "canonical"), {
      recursive: true,
    });
  await checkpoint();
  await rm(root, { recursive: true, force: true });
}
