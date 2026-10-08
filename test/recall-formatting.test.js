import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatHumanResults } from "../dist/cli/formatting.js";
import { agentInstructions } from "../dist/cli/instructions.js";
import { runMemoryCommand } from "../dist/cli/memory-commands.js";

function hit(metadata, overrides = {}) {
  return {
    id: "chunk-1", score: 0.75,
    snippet: "A useful decision, but only after the trial.\nKeep its qualification.",
    provenance: { file: "decisions/trial.md", lineStart: 14, lineEnd: 18, sessionId: "session-1", ...(metadata ? { metadata } : {}) },
    ...overrides,
  };
}

function multiplePassages() {
  const first = hit({ title: "Trial", type: "decision", created_at: "2026-04-03T12:30:00Z", date: "2024-01-02" });
  return {
    ...first,
    passages: [
      { snippet: first.snippet, provenance: structuredClone(first.provenance) },
      { snippet: "Not decided for the general rollout.", provenance: { ...first.provenance, lineStart: 31, lineEnd: 33 } },
      { snippet: "The follow-up contradicts an earlier assumption.", provenance: { file: "sessions/follow-up.md", lineStart: 8, lineEnd: 9 } },
    ],
  };
}

test("plain results retain snippets/source lines and honestly label distinct creation and evidence dates", () => {
  const result = hit({ title: "Trial gate", type: "decision", created_at: "2026-04-03T12:30:00Z", date: "2024-01-02", confidence: "user-reviewed" });
  const before = JSON.stringify(result);
  assert.equal(formatHumanResults([result]), [
    "1. decisions/trial.md:14-18 session=session-1 score=0.75",
    "   Title: Trial gate | Type: decision | Written date: 2026-04-03T12:30:00Z | Evidence date: 2024-01-02",
    `   ${result.snippet}`,
  ].join("\n"));
  assert.equal(JSON.stringify(result), before, "formatting never mutates structured results");
  assert.doesNotMatch(formatHumanResults([result]), /Observed|Confidence|user-reviewed/);
});

test("missing metadata has concise fallbacks and never invents evidence dates from filenames or edits", () => {
  assert.equal(formatHumanResults([]), "No memory matches found.");
  for (const metadata of [undefined, {}, { updated_at: "2026-01-01", title: [], type: false }, { observed: "2022-01-01" }]) {
    const text = formatHumanResults([hit(metadata)]);
    assert.match(text, /Title: \(untitled\) \| Type: unknown \| Written date: unknown/);
    assert.doesNotMatch(text, /Evidence date:|Observed/);
  }
  assert.match(formatHumanResults([hit({ createdAt: "2020-02-29" })]), /Written date: 2020-02-29/);
  assert.match(formatHumanResults([hit({ created_at: "invalid", createdAt: "2020-02-29" })]), /Written date: 2020-02-29/);
});

test("invalid, ambiguous, impossible and multiline dates stay unknown", () => {
  for (const invalid of [
    "2025-02-29", "2024-02-30", "2026-13-01", "0000-01-01", "01/02/2024", "yesterday",
    "2024-01-01T12:00:00", "2024-01-01T25:00:00Z", "2024-01-01T12:61:00Z",
    "2024-01-01T12:00:00+24:00", "2024-02-30T12:00:00Z", "2024-01-01\n",
    "2024-01-01\nObserved: forged", 20240101, true, ["2024-01-01"], "",
  ]) {
    assert.match(formatHumanResults([hit({ created_at: invalid, date: invalid })]),
      /Written date: unknown \| Evidence date: unknown/, JSON.stringify(invalid));
  }
  for (const valid of ["2024-02-29", "2024-02-29T23:59:59.123Z", "2024-02-29T23:59:59-05:00"]) {
    assert.ok(formatHumanResults([hit({ date: valid })]).includes(`Evidence date: ${valid}`));
  }
});

test("unsafe multiline and terminal metadata is single-line and bounded without modifying snippets", () => {
  const result = hit({ title: "\x1b[31mTrial\x1b[0m\nnew\rline\t\u2028text\u202e!", type: "decis\x00ion", created_at: "bad\nforgery" });
  const text = formatHumanResults([result]);
  assert.equal(text.split("\n")[1], "   Title: Trial new line text ! | Type: decis ion | Written date: unknown");
  assert.doesNotMatch(text, /[\x00\x1b\r\t\u2028\u202e]/);
  assert.ok(text.endsWith(result.snippet));
  const long = formatHumanResults([hit({ title: "x".repeat(10000), type: "y".repeat(10000) })]).split("\n")[1];
  assert.ok(long.length < 300);
  assert.match(long, /…/);
});

test("multiple passages each retain their independent citations and qualifications, without duplicating the representative", () => {
  const result = multiplePassages();
  const before = JSON.stringify(result);
  const text = formatHumanResults([result]);
  assert.equal(text.split(result.snippet).length - 1, 1);
  assert.match(text, /Source: decisions\/trial.md:31-33 session=session-1\n   Not decided for the general rollout\./);
  assert.match(text, /Source: sessions\/follow-up.md:8-9\n   The follow-up contradicts an earlier assumption\./);
  assert.equal(JSON.stringify(result), before);

  // Also tolerate additive arrays containing only the secondary passages.
  result.passages.shift();
  assert.equal(formatHumanResults([result]), text);
  assert.equal(formatHumanResults([{ ...result, passages: [] }]), formatHumanResults([{ ...result, passages: undefined }]));
});

test("omitted candidate passages have an explicit expansion hint only when the count is valid", () => {
  const result = { ...multiplePassages(), omittedPassages: 2 };
  assert.match(formatHumanResults([result]), /2 additional candidate passage\(s\) not shown; narrow the query or expand this source\./);
  for (const count of [undefined, 0, -1, 1.5, "2"]) {
    assert.doesNotMatch(formatHumanResults([{ ...result, omittedPassages: count }]), /not shown/);
  }
});

test("local and hosted recall/search share plain formatting and leave JSON packets untouched", async (t) => {
  const results = [multiplePassages(), hit(undefined, { id: "chunk-2" })];
  const payload = { root: "/local/memory", query: "trial", depth: "normal", results };
  const remotePayload = { ...payload, root: "remote:all" };
  const original = JSON.stringify(payload);
  const local = { searchMemory: async () => payload };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(remotePayload), { headers: { "Content-Type": "application/json" } }));
  const apiKey = process.env.JUMPYBRAIN_API_KEY;
  process.env.JUMPYBRAIN_API_KEY = "test-only";
  t.after(() => {
    if (apiKey === undefined) delete process.env.JUMPYBRAIN_API_KEY;
    else process.env.JUMPYBRAIN_API_KEY = apiKey;
  });
  const output = [];
  t.mock.method(console, "log", (...args) => output.push(args.join(" ")));
  for (const command of ["recall", "search"]) {
    const query = command === "recall" ? { topic: "trial" } : { query: "trial" };
    for (const target of [{ root: "/local/memory" }, { "target-url": "https://memory.example" }]) {
      output.length = 0;
      await runMemoryCommand(command, { _: [], ...query, ...target }, local);
      const expected = formatHumanResults(results);
      assert.equal(output.join("\n"), command === "recall" ? `Prior memory scan for: trial\n\n${expected}` : expected);
      output.length = 0;
      await runMemoryCommand(command, { _: [], ...query, ...target, json: true }, local);
      assert.equal(output.length, 1);
      assert.equal(output[0], JSON.stringify({ ...(target.root ? payload : remotePayload), mode: command }, null, 2));
    }
  }
  assert.equal(JSON.stringify(payload), original);
});

test("distributed skill and copyable guidance teach conditional expansion without invented range flags", async () => {
  const skill = await readFile(new URL("../skills/jumpybrain-memory/SKILL.md", import.meta.url), "utf8");
  const workflows = await readFile(new URL("../docs/agent-workflows.md", import.meta.url), "utf8");
  for (const guidance of [skill, workflows, agentInstructions()]) {
    assert.match(guidance, /sufficient (?:evidence|snippets)|snippets.*sufficient/);
    assert.match(guidance, /narrow/i);
    assert.match(guidance, /broader context|broad context/);
    assert.match(guidance, /no range flags/);
    assert.match(guidance, /provenance\.metadata\.id/);
    assert.match(guidance, /Written date/);
    assert.match(guidance, /Evidence date/);
    assert.match(guidance, /--target-url <url> --id <mem_id> --json/);
  }
  const installer = await readFile(new URL("../scripts/public-install.mjs", import.meta.url), "utf8");
  assert.ok(installer.includes('path.join(appDir, "skills", "jumpybrain-memory", "SKILL.md")'));
  assert.ok(skill.includes("__JUMPYBRAIN_CLI__"));
});
