import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { themeBootstrap, themeStyles } from "../dist/adapters/http-server/browser-theme.js";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";

function harness({ stored = null, dark = false, blocked = false } = {}) {
  const listeners = {}, values = new Map(stored === null ? [] : [["jumpybrain.theme", stored]]);
  const control = { value: "system" }, root = { dataset: {} };
  const media = { matches: dark, addEventListener: (type, callback) => { listeners.media = callback; } };
  const context = vm.createContext({
    window: { matchMedia: () => media, addEventListener: (type, callback) => { listeners[type] = callback; } },
    document: { documentElement: root, getElementById: () => control },
    localStorage: {
      getItem(key) { if (blocked) throw Error("blocked"); return values.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error("blocked"); values.set(key, value); },
      removeItem(key) { if (blocked) throw Error("blocked"); values.delete(key); },
    },
  });
  vm.runInContext(themeBootstrap, context);
  return { root, control, values,
    choose: (value) => vm.runInContext(`colorTheme.setPreference(${JSON.stringify(value)})`, context),
    os(value) { media.matches = value; listeners.media(); },
    storage(key, newValue) { listeners.storage({ key, newValue }); },
  };
}

test("theme resolves before visible content and every script retains the CSP nonce", () => {
  for (const companion of [false, true]) {
    const html = graphPageHtml("themenonce", "home", { companion });
    assert.ok(html.indexOf(themeBootstrap) < html.indexOf("<body"));
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      assert.equal(script[1], ' nonce="themenonce"');
      assert.doesNotThrow(() => new vm.Script(script[2]));
    }
    assert.match(html, /id="color-theme" aria-label="Color theme"/);
    assert.match(html, /value="system">System/);
    assert.match(html, /value="light">Light/);
    assert.match(html, /value="dark">Dark/);
  }
  assert.match(themeStyles, /@media \(prefers-color-scheme: dark\)/, "CSS also follows the OS without JavaScript");
});

test("system theme follows live OS changes; explicit choices persist and override the OS", () => {
  const h = harness({ dark: true });
  assert.equal(h.root.dataset.theme, "dark");
  assert.equal(h.control.value, "system");
  h.os(false); assert.equal(h.root.dataset.theme, "light");
  h.choose("dark"); h.os(false);
  assert.equal(h.root.dataset.theme, "dark");
  assert.equal(h.values.get("jumpybrain.theme"), "dark");
  assert.equal(harness({ stored: "dark" }).root.dataset.theme, "dark", "reload restores choice");
  h.choose("light"); h.os(true);
  assert.equal(h.root.dataset.theme, "light");
  h.choose("system");
  assert.equal(h.root.dataset.theme, "dark");
  assert.equal(h.values.has("jumpybrain.theme"), false);
  h.os(false); assert.equal(h.root.dataset.theme, "light");
});

test("cross-tab changes, clearing storage, malformed preferences and blocked storage are safe", () => {
  const h = harness({ stored: "dark" });
  h.storage("unrelated", "light"); assert.equal(h.root.dataset.theme, "dark");
  h.storage("jumpybrain.theme", "light"); assert.equal(h.control.value, "light");
  h.storage(null, null); assert.equal(h.control.value, "system");
  assert.equal(harness({ stored: "bad", dark: true }).root.dataset.theme, "dark");
  const blocked = harness({ blocked: true });
  assert.doesNotThrow(() => blocked.choose("dark"));
  assert.equal(blocked.root.dataset.theme, "dark");
  blocked.choose("invalid"); assert.equal(blocked.control.value, "system");
});

function contrast(a, b) {
  const luminance = (hex) => {
    const rgb = hex.match(/[\da-f]{2}/gi).map((part) => parseInt(part, 16) / 255)
      .map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return rgb.reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test("both palettes retain AA text contrast on surfaces, controls and selected rows", () => {
  const palettes = [themeStyles.split("@media")[0], themeStyles.split(':root[data-theme="dark"]')[1]];
  for (const palette of palettes) {
    const tokens = Object.fromEntries([...palette.matchAll(/(--[\w-]+): (#[\da-f]{6});/g)].map((m) => [m[1], m[2]]));
    for (const ink of ["--ink", "--ink-soft", "--ink-faint", "--error-ink"]) {
      for (const fill of ["--surface", "--control-fill", "--surface-hover"]) {
        assert.ok(contrast(tokens[ink], tokens[fill]) >= 4.5, `${ink} on ${fill}: ${contrast(tokens[ink], tokens[fill])}`);
      }
    }
    assert.ok(contrast(tokens["--focus-ring"], tokens["--surface"]) >= 3);
  }
});
