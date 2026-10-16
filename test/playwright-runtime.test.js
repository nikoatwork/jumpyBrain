import assert from "node:assert/strict";
import test from "node:test";
import { launchPlaywrightChromium } from "../scripts/playwright-runtime.mjs";

test("Chromium fallback preserves explicit launch options and configured channel", async () => {
  const calls = [];
  const chromium = { async launch(options) {
    calls.push(options);
    if (calls.length === 1) throw new Error("Executable doesn't exist at fixture");
    return "browser";
  } };
  assert.equal(await launchPlaywrightChromium({ chromium, launchOptions: { headless: false, args: ["--fixture"] }, fallbackChannel: "custom-chrome" }), "browser");
  assert.deepEqual(calls, [{ headless: false, args: ["--fixture"] }, { headless: false, args: ["--fixture"], channel: "custom-chrome" }]);
});

test("Chromium launch surfaces other errors and respects explicit channel or disabled fallback", async () => {
  for (const [message, options] of [["permission denied", {}], ["Executable doesn't exist", { launchOptions: { channel: "chromium" } }], ["Executable doesn't exist", { fallbackChannel: null }]]) {
    let calls = 0;
    const failure = new Error(message);
    await assert.rejects(launchPlaywrightChromium({ chromium: { async launch() { calls++; throw failure; } }, ...options }), error => error === failure);
    assert.equal(calls, 1);
  }
});
