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
