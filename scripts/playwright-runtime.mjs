import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function loadPlaywrightChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch {}

  // `npx --package=playwright node ...` adds the temporary package's .bin
  // directory to PATH, but does not add that package to Node's module lookup.
  for (const binDir of String(process.env.PATH || "").split(path.delimiter)) {
    const entry = path.resolve(binDir, "..", "playwright", "index.mjs");
    try {
      await access(entry);
      return (await import(pathToFileURL(entry).href)).chromium;
    } catch {}
  }

  throw new Error("playwright is not installed. Run: npx playwright install chromium");
}

// Preserve launch options in both attempts; fallback only for a missing executable.
// Supplying chromium allows focused tests and callers that already loaded Playwright.
export async function launchPlaywrightChromium({ chromium, launchOptions = {}, fallbackChannel = process.env.JUMPYBRAIN_PLAYWRIGHT_CHANNEL || "chrome" } = {}) {
  const browserType = chromium ?? await loadPlaywrightChromium();
  try {
    return await browserType.launch(launchOptions);
  } catch (error) {
    if (!String(error?.message || error).includes("Executable doesn't exist") || !fallbackChannel || launchOptions.channel) throw error;
    return browserType.launch({ ...launchOptions, channel: fallbackChannel });
  }
}
