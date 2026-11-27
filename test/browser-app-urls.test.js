// A hosted brain can be served under a path prefix that the reverse proxy strips
// (https://host/sherpa/ -> server sees /). Every app URL the browser builds must go
// through the shell's appUrl helper (browser-app-url.ts); see browser.docs.md#app-urls.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readdir, readFile } from "node:fs/promises";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";
import { appUrlScript } from "../dist/adapters/http-server/browser-app-url.js";

const sourceDir = new URL("../src/adapters/http-server/", import.meta.url);

function markupOutsideScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
}

test("the hosted shell carries its base path once and renders its own links under it", () => {
  const html = graphPageHtml("nonce", "home", { basePath: "/sherpa" });
  assert.equal(html.match(/const appBasePath = /g)?.length, 1);
  assert.match(html, /const appBasePath = "\/sherpa";/);
  assert.match(html, /<link rel="icon"[^>]*href="\/sherpa\/favicon\.svg"/);
  assert.match(html, /id="home-link"[^>]*href="\/sherpa\/"/);
  assert.match(html, /id="notes-link"[^>]*href="\/sherpa\/"/);
  assert.match(html, /id="graph-link"[^>]*href="\/sherpa\/graph"/);
  const rootLinks = [...markupOutsideScripts(html).matchAll(/\b(?:href|src|action)="(\/[^"]*)"/g)].map(match => match[1]);
  assert.ok(rootLinks.length >= 3);
  assert.deepEqual(rootLinks.filter(link => !link.startsWith("/sherpa/")), [], "every root-absolute markup link carries the base");

  const nested = graphPageHtml("nonce", "graph", { basePath: "/team/sherpa" });
  assert.match(nested, /const appBasePath = "\/team\/sherpa";/);
  assert.match(nested, /id="graph-link"[^>]*href="\/team\/sherpa\/graph"/);
});

test("without a base path the shell is unchanged, and invalid base paths are refused", () => {
  const html = graphPageHtml("nonce", "home");
  assert.equal(html, graphPageHtml("nonce", "home", { basePath: "" }));
  assert.match(html, /const appBasePath = "";/);
  assert.match(html, /<link rel="icon"[^>]*href="\/favicon\.svg"/);
  assert.match(html, /id="notes-link"[^>]*href="\/"/);
  assert.match(html, /id="graph-link"[^>]*href="\/graph"/);
  // The companion (Mac app) UI is served at the root of its local gateway.
  assert.match(graphPageHtml("nonce", "home", { companion: true }), /const appBasePath = "";/);
  assert.throws(() => graphPageHtml("nonce", "home", { companion: true, basePath: "/sherpa" }), /root/);
  for (const basePath of ["/", "sherpa", "/sherpa/", "//sherpa", "/a//b", "/a/../b", "/./a", "/..", '/a"b', "/a<b", "/a'b", "/a&b",
    "/a b", "/a?b", "/a#b", "/a\\b", "/</script>", 7]) {
    assert.throws(() => graphPageHtml("nonce", "home", { basePath }), /base path/, String(basePath));
  }
});

test("appUrl adds and appRoute removes the base for app routes only", () => {
  const helpers = (basePath) => {
    const context = vm.createContext({});
    vm.runInContext(appUrlScript(basePath) + "this.appUrl = appUrl; this.appRoute = appRoute;", context);
    return context;
  };
  const prefixed = helpers("/sherpa");
  assert.equal(prefixed.appUrl("/"), "/sherpa/");
  assert.equal(prefixed.appUrl("/memories/all/recent"), "/sherpa/memories/all/recent");
  assert.equal(prefixed.appUrl("/?note=mem_x"), "/sherpa/?note=mem_x");
  assert.equal(prefixed.appUrl("/ws"), "/sherpa/ws");
  for (const other of ["//evil.example/x", "https://evil.example/", "relative", ""]) assert.equal(prefixed.appUrl(other), other);
  assert.equal(prefixed.appRoute("/sherpa/"), "/");
  assert.equal(prefixed.appRoute("/sherpa"), "/", "a proxy that does not add the trailing slash still opens home");
  assert.equal(prefixed.appRoute("/sherpa/graph"), "/graph");
  assert.equal(prefixed.appRoute("/sherpa/?note=mem_x"), "/?note=mem_x");
  // App routes pass through: only the base followed by "/" is stripped.
  assert.equal(prefixed.appRoute("/graph?focus=a"), "/graph?focus=a");
  assert.equal(prefixed.appRoute("/sherpax/graph"), "/sherpax/graph");
  // "/graph" is the app's own Graph route, so it cannot be a base path.
  assert.throws(() => appUrlScript("/graph"), /base path/);
  const nested = helpers("/graph/team");
  assert.equal(nested.appRoute("/graph"), "/graph");
  assert.equal(nested.appRoute("/graph/team/graph"), "/graph");
  const root = helpers("");
  for (const value of ["/", "/graph", "/?note=x", "//x"]) {
    assert.equal(root.appUrl(value), value);
    assert.equal(root.appRoute(value), value);
  }
});

// Lines that look like app URLs but are not built by the browser for this app.
// Each entry needs the exact source text and a reason.
const allowed = [
  { file: "feedback.ts", text: 'event.filename?.startsWith(window.location.origin + "/")', reason: "classifies a script error as from the shell; no request" },
  { file: "notes-browser.ts", text: 'scope: location.origin + ":" + capabilities.brainId', reason: "live-session scope key; the brain ID keeps brains apart" },
  { file: "notes-browser.ts", text: "const requested = new URL(url, location.origin);", reason: "parses an app route to read its query; no request" },
  { file: "notes-browser.ts", text: "const target = new URL(url, location.origin);", reason: "parses an app route to read its path and query; no request" },
  { file: "drawing-frame-assets.ts", text: "new URL(url, location.href).origin === location.origin", reason: "keeps Excalidraw fonts on this origin; no app route" },
];
// Not scanned: server-side routing owned by the server (index.ts, routes.ts) and
// companion/desktop-only modules, whose UI is always served at "/" by the Mac gateway.
const notScanned = new Set(["index.ts", "routes.ts", "companion-browser.ts", "browser-settings.ts", "extensions-browser.ts", "extensions-view.ts"]);

const rules = [
  // A root-absolute literal handed straight to a URL sink.
  { name: "root-absolute literal URL", pattern: /\b(?:fetch|new WebSocket|new URL|new EventSource|window\.open|location\.assign|location\.replace)\(\s*["'`]\/(?!\/)/ },
  { name: "root-absolute href/src/action", pattern: /\b(?:href|src|action)\s*=\s*["'`]\/(?!\/)/ },
  { name: "root-absolute location.href", pattern: /\blocation\.href\s*=\s*["'`]\// },
  // Every direct fetch takes an appUrl(...) (member calls like options.fetch( and type signatures are not requests).
  { name: "fetch without appUrl", pattern: /(?<![.\w])fetch\(\s*(?!appUrl\()(?!\w+\??\s*:)(?!\))/ },
  // History entries are public URLs: appUrl(route) or the current public path.
  { name: "history without appUrl", pattern: /\b(?:pushState|replaceState)\(/, unless: /appUrl\(|location\.pathname \+ location\.search/ },
  // Callbacks that hand an app URL to a bundle module for an <a href>.
  { name: "href callback without appUrl", pattern: /\b(?:href|link|scopeUrl)\s*:\s*(?:\(\w*\)|\w+)\s*=>/, unless: /appUrl\(/ },
  // Public addresses (invite links, CLI targets) and same-app URL checks need the base.
  { name: "location.origin without base", pattern: /\blocation\.origin\b/, unless: /appUrl\(|appBasePath/ },
];

test("browser modules build app URLs only through appUrl", async () => {
  const files = (await readdir(sourceDir)).filter(name => name.endsWith(".ts") && !notScanned.has(name)).sort();
  assert.ok(files.includes("notes-browser.ts") && files.includes("graph-page.ts") && files.includes("drawings-view.ts"));
  const violations = [], used = new Set();
  for (const file of files) {
    const lines = (await readFile(new URL(file, sourceDir), "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (/^\s*\/\//.test(line)) return;
      for (const rule of rules) {
        if (!rule.pattern.test(line) || rule.unless?.test(line)) continue;
        const exception = allowed.find(entry => entry.file === file && line.includes(entry.text));
        if (exception) { used.add(exception); continue; }
        violations.push(`${file}:${index + 1} ${rule.name}: ${line.trim().slice(0, 160)}`);
      }
    });
  }
  assert.deepEqual(violations, [], "route these through appUrl(...) (browser.docs.md#app-urls) or add a reasoned exception");
  assert.deepEqual(allowed.filter(entry => !used.has(entry)), [], "remove stale exceptions");
});
