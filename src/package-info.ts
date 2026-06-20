import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function packageVersion(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageJson = path.resolve(here, "..", "package.json");
  try {
    const parsed = JSON.parse(await readFile(packageJson, "utf8")) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
