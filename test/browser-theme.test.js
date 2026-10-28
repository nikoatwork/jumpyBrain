import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { themeBootstrap, themeStyles } from "../dist/adapters/http-server/browser-theme.js";
import { builtInPalettes } from "../dist/adapters/http-server/browser-palettes.js";
import { graphPageHtml } from "../dist/adapters/http-server/graph-page.js";

function harness({ stored = null, palette = null, dark = false, blocked = false } = {}) {
  const listeners = {}, values = new Map(stored === null ? [] : [["jumpybrain.theme", stored]]);
  if (palette !== null) values.set("jumpybrain.palette", palette);
  const control = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }, root = { dataset: {} };
  const media = { matches: dark, addEventListener: (type, callback) => { listeners.media = callback; } };
  const context = vm.createContext({
    Event, window: { dispatchEvent() {}, matchMedia: () => media, addEventListener: (type, callback) => { listeners[type] = callback; } },
    document: { documentElement: root, getElementById: (id) => id === "color-theme" ? control : null },
    localStorage: {
      getItem(key) { if (blocked) throw Error("blocked"); return values.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error("blocked"); values.set(key, value); },
      removeItem(key) { if (blocked) throw Error("blocked"); values.delete(key); },
    },
  });
  vm.runInContext(themeBootstrap, context);
  return { root, control, values,
    palette: value => vm.runInContext(`colorTheme.setPalette(${JSON.stringify(value)})`, context),
    toggle: () => vm.runInContext("colorTheme.toggle()", context),
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
    assert.match(html, /<button id="color-theme" type="button" aria-label="Switch color theme"/);
    assert.match(html, /class="theme-sun"/);
    assert.match(html, /class="theme-moon"/);
    assert.doesNotMatch(html, /<select id="color-theme"/);
  }
  assert.match(themeStyles, /@media \(prefers-color-scheme: dark\)/, "CSS also follows the OS without JavaScript");
});

test("system theme follows live OS changes; explicit choices persist and override the OS", () => {
  const h = harness({ dark: true });
  assert.equal(h.root.dataset.theme, "dark");
  assert.equal(h.root.dataset.themePreference, "system");
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
  h.storage("jumpybrain.theme", "light"); assert.equal(h.root.dataset.themePreference, "light");
  h.storage(null, null); assert.equal(h.root.dataset.themePreference, "system");
  assert.equal(harness({ stored: "bad", dark: true }).root.dataset.theme, "dark");
  const blocked = harness({ blocked: true });
  assert.doesNotThrow(() => blocked.choose("dark"));
  assert.equal(blocked.root.dataset.theme, "dark");
  blocked.choose("invalid"); assert.equal(blocked.root.dataset.themePreference, "system");
});

test("icon activation exits System using the resolved appearance and updates its accessible action", () => {
  const h = harness({ dark: true });
  assert.equal(h.root.dataset.themePreference, "system");
  assert.equal(h.values.has("jumpybrain.theme"), false, "merely rendering System does not replace the preference");
  assert.equal(h.control.attributes["aria-label"], "Switch to light theme");
  h.toggle();
  assert.equal(h.root.dataset.theme, "light");
  assert.equal(h.root.dataset.themePreference, "light");
  assert.equal(h.values.get("jumpybrain.theme"), "light");
  assert.equal(h.control.title, "Switch to dark theme");
  h.os(true);
  assert.equal(h.root.dataset.theme, "light", "explicit toggle keeps the chosen appearance");
  h.toggle();
  assert.equal(h.root.dataset.theme, "dark");
  assert.equal(h.control.attributes["aria-label"], "Switch to light theme");
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
  const palettes = [themeStyles.split("@media")[0], themeStyles.split(':root[data-theme="dark"]')[1].split(':root[data-palette=')[0]];
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

test("palette preference is independent, survives reload, synchronizes and falls back safely", () => {
  const h = harness({ stored: "dark" });
  assert.equal(h.root.dataset.palette, "ember");
  h.palette("ocean");
  assert.equal(h.root.dataset.palette, "ocean");
  assert.equal(h.root.dataset.themePreference, "dark");
  assert.equal(h.values.get("jumpybrain.palette"), "ocean");
  assert.equal(harness({ palette: "grove" }).root.dataset.palette, "grove");
  h.storage("jumpybrain.palette", "grove");
  assert.equal(h.root.dataset.palette, "grove");
  assert.equal(h.root.dataset.themePreference, "dark");
  h.choose("system");
  assert.equal(h.root.dataset.palette, "grove");
  h.storage(null, null);
  assert.equal(h.root.dataset.palette, "ember");
  assert.equal(h.root.dataset.themePreference, "system");
  h.palette("unknown");
  assert.equal(h.values.has("jumpybrain.palette"), false);
  const blocked = harness({ blocked: true });
  blocked.palette("ocean"); assert.equal(blocked.root.dataset.palette, "ocean");
  assert.equal(harness({ palette: "invalid" }).root.dataset.palette, "ember");
});

test("all built-in alternative palettes retain AA text and visible focus contrast", () => {
  for (const [name, modes] of Object.entries(builtInPalettes)) for (const [mode, tokens] of Object.entries(modes)) {
    for (const ink of ["ink", "ink-soft", "ink-faint", "error-ink"]) for (const fill of ["surface", "control-fill", "surface-hover"]) {
      assert.ok(contrast(tokens[ink], tokens[fill]) >= 4.5, `${name}/${mode} ${ink} on ${fill}: ${contrast(tokens[ink], tokens[fill])}`);
    }
    assert.ok(contrast(tokens["focus-ring"], tokens.surface) >= 3, `${name}/${mode} focus`);
  }
});
