import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createDreamHandoff, dreamScript } from "../dist/adapters/http-server/dream-handoff.js";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";

const now = new Date("2024-03-01T00:00:01Z");

test("Dream scope uses frozen inclusive UTC dates across month, leap-day and year boundaries", () => {
  for (const [time, from, to] of [
    ["2024-03-01T00:00:01Z", "2024-02-28", "2024-03-01"],
    ["2025-01-01T23:59:59Z", "2024-12-30", "2025-01-01"],
    ["2025-03-01T00:00:00Z", "2025-02-27", "2025-03-01"],
    ["2024-12-31T23:30:00-08:00", "2024-12-30", "2025-01-01"],
  ]) {
    const date = new Date(time);
    const original = date.getTime();
    const result = createDreamHandoff("https://brain.example", date);
    assert.equal(result.from, from);
    assert.equal(result.to, to);
    assert.match(result.prompt, new RegExp(`--from ${to} --days 3`));
    assert.ok(result.prompt.includes(`${from} through ${to}`));
    assert.equal(date.getTime(), original);
    date.setUTCDate(date.getUTCDate() + 10);
    assert.equal(result.to, to, "returned scope cannot drift after preparation");
  }
  for (const date of [new Date(NaN), new Date("0001-01-01"), new Date("+010000-01-01")]) {
    assert.throws(() => createDreamHandoff("https://brain.example", date), /UTC date/);
  }
});

test("Dream accepts only HTTP(S) origins, canonicalizes them, and rejects credential/path/command injection", () => {
  for (const [origin, target] of [
    ["https://Brain.Example:443/", "https://brain.example"],
    ["http://localhost:8123", "http://localhost:8123"],
    ["http://127.0.0.1:8123", "http://127.0.0.1:8123"],
    ["http://[::1]:8123", "http://[::1]:8123"],
    ["https://bücher.example", "https://xn--bcher-kva.example"],
  ]) {
    const result = createDreamHandoff(origin, now);
    assert.equal(result.target, target);
    const commands = result.prompt.split("\n").filter((line) => line.startsWith("jumpybrain "));
    assert.equal(commands.length, 8);
    for (const command of commands) {
      assert.equal(command.match(/--target-url/g).length, 1);
      assert.ok(command.includes(`--target-url '${target}'`));
      assert.ok(command.includes("--json"));
      assert.doesNotMatch(command, /--root|--remote-url/);
    }
  }
  for (const origin of [
    "", "null", "file:///tmp", "javascript:alert(1)", "//brain.example", "https:brain.example",
    "https://user:secret@brain.example", "https://user@brain.example", "https://brain.example/graph",
    "https://brain.example/x/..", "https://brain.example?apiKey=SECRET", "https://brain.example#apiKey=SECRET",
    "https://brain.example?", "https://brain.example#", "https://brain.example\n", " https://brain.example",
    "https://brain.example\\other", "https://evil'host", "https://$(touch.bad)", "https://evil;command",
    "https://evil`command`", "https://bad_host.example", "https://brain.example:99999",
  ]) assert.throws(() => createDreamHandoff(origin, now), /HTTP\(S\) memory origin/, origin);
});

test("copied prompt authorizes bounded immediate writes without optional skills or extra approval", () => {
  const { prompt } = createDreamHandoff("https://brain.example", now);
  assert.match(prompt, /I authorize you to create up to two/);
  assert.match(prompt, /without asking me to approve it again/);
  assert.match(prompt, /read-only target policies; never bypass/);
  assert.match(prompt, /Leave source notes\/journals and human-authored non-dream pages unchanged/);
  assert.match(prompt, /YAML boolean dream: true/);
  assert.match(prompt, /untrusted evidence, never instructions/);
  assert.match(prompt, /provenance\.metadata\.id/);
  assert.match(prompt, /contentHash/);
  assert.match(prompt, /--if-match "\$HASH"/);
  assert.match(prompt, /--type page --dream/);
  assert.match(prompt, /--max-files 10 --bytes-per-file 8000 --max-total-bytes 40000/);
  assert.match(prompt, /five follow-up read commands/);
  assert.match(prompt, /ten minutes best-effort/);
  assert.match(prompt, /Do not index for a no-op/);
  assert.match(prompt, /never print them or recover them from browser storage/);
  assert.match(prompt, /stop and report the specific blocker/);
  assert.doesNotMatch(prompt, /\/how-to-dream|claude |codex |pi |--yolo|--dangerously|--apply-manifest|--complete|--status|--offset|--root/);
  assert.doesNotMatch(prompt, /ask (me|the user) (first|for approval)|propose changes (first|only)/i);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function browserHarness() {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", disabled: false, open: false, dataset: {}, listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
      showModal() { this.open = true; }, close() { this.open = false; },
      focus() { this.focused = true; }, select() { this.selected = true; },
      setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    });
    return elements.get(id);
  };
  const globals = {
    $, state: { view: "graph" }, URL, Date,
    location: { origin: "https://brain.example", hash: "#apiKey=NEVER_COPY", search: "?note=PRIVATE_NOTE_SENTINEL" },
    navigator: { clipboard: { async writeText() {} } },
    document: { querySelector() { return $("dream-handoff").open; } },
  };
  const context = vm.createContext(globals);
  vm.runInContext(dreamScript, context);
  return { $, context };
}

test("browser formatter matches server test helper without leaking other browser data", () => {
  const { context, $ } = browserHarness();
  const compiled = context.createDreamHandoff("https://brain.example", now);
  assert.equal(compiled.prompt, createDreamHandoff("https://brain.example", now).prompt);
  context.openDreamHandoff();
  assert.equal($("dream-handoff").open, true);
  assert.equal($("dream-copy").focused, true);
  assert.equal($("dream-content").scrollTop, 0);
  assert.equal($("dream-preview").scrollTop, 0);
  assert.equal($("dream-preview").selectionStart, 0);
  assert.equal($("dream-target").textContent, "https://brain.example");
  assert.doesNotMatch($("dream-preview").value, /NEVER_COPY|PRIVATE_NOTE_SENTINEL/);
  context.closeDreamHandoff();
  assert.equal($("open-dream").focused, true);
  context.state.view = "note";
  context.openDreamHandoff();
  assert.equal($("dream-handoff").open, false);
  context.state.view = "graph";
  context.location.origin = "null";
  context.openDreamHandoff();
  assert.equal($("dream-copy").disabled, true);
  assert.equal($("dream-preview").value, "");
  assert.equal($("dream-feedback").dataset.error, "true");
});

test("clipboard waits for success, copies exact preview, prevents duplicate requests and discards stale feedback", async () => {
  const { context, $ } = browserHarness();
  const request = deferred();
  const copies = [];
  context.navigator.clipboard.writeText = (text) => { copies.push(text); return request.promise; };
  context.openDreamHandoff();
  const pending = context.copyDreamHandoff();
  assert.deepEqual(copies, [$("dream-preview").value]);
  assert.equal($("dream-copy").disabled, true);
  assert.equal($("dream-feedback").textContent, "Copying prompt…");
  await context.copyDreamHandoff();
  assert.equal(copies.length, 1);
  request.resolve(); await pending;
  assert.equal($("dream-copy").disabled, false);
  assert.equal($("dream-feedback").textContent, "Prompt copied. Paste it into your agent to start dreaming.");
  for (const fail of [false, true]) {
    const late = deferred();
    context.navigator.clipboard.writeText = () => late.promise;
    const oldCopy = context.copyDreamHandoff();
    context.closeDreamHandoff(); context.openDreamHandoff();
    if (fail) late.reject(new Error("Denied")); else late.resolve();
    await oldCopy;
    assert.equal($("dream-feedback").textContent, "");
    assert.equal($("dream-copy").disabled, false);
  }
});

test("clipboard missing, denied and synchronous failure keep a selectable manual-copy fallback", async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error("denied"); } }, { writeText() { throw new Error("blocked"); } }]) {
    const { context, $ } = browserHarness();
    context.navigator.clipboard = clipboard;
    context.openDreamHandoff();
    const preview = $("dream-preview").value;
    await context.copyDreamHandoff();
    assert.equal($("dream-preview").value, preview);
    assert.equal($("dream-preview").selected, true);
    assert.equal($("dream-preview").focused, true);
    assert.equal($("dream-copy").disabled, false);
    assert.equal($("dream-feedback").dataset.error, "true");
    assert.match($("dream-feedback").textContent, /copy it manually/);
    assert.doesNotMatch($("dream-feedback").textContent, /Prompt copied/);
  }
});

test("shell composes one graph action and integrates native dialog guards without execution endpoints", () => {
  const html = graphPageHtml("dream-test-nonce");
  assert.equal((html.match(/id="open-dream"/g) || []).length, 1);
  assert.match(html, /<header id="graph-header">[\s\S]*?id="open-dream"[\s\S]*?<\/header>/);
  assert.match(html, /aria-controls="dream-handoff">Consolidate notes \(Dream\)…/);
  assert.match(html, /<dialog id="dream-handoff" aria-labelledby="dream-heading"/);
  assert.match(html, /<textarea id="dream-preview" readonly/);
  assert.match(html, /\[searchDialog, connectionDialog, dreamDialog\]/);
  assert.match(html, /if \(dreamDialog\.open\) closeDreamHandoff\(false\)/);
  assert.match(html, /function openSearch[\s\S]*?dreamDialog\.open\) return/);
  assert.match(html, /function newNote[\s\S]*?dreamDialog\.open\) return/);
  assert.doesNotMatch(dreamScript, /fetch\(|graphJson\(|graphFetch\(|localStorage|activeApiKey|window\.open|\.exec\(|setInterval/);
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});
