import { readFileSync } from "node:fs";
export function readDiagnosticBuildInfo(): { version: string; build: string } {
  try {
    const info = JSON.parse(readFileSync(new URL("./build-info.json", import.meta.url), "utf8"));
    return { version: typeof info.version === "string" && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(info.version) ? info.version.slice(0, 50) : "unavailable",
      build: typeof info.build === "string" && /^[a-f0-9]{16}$/.test(info.build) ? info.build : "unavailable" };
  } catch { return { version: "unavailable", build: "unavailable" }; }
}
