import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Installer boundary only. Python owns native bundle validation and the shared
// singleton lock; no process-name/PID killing or browser save assumptions here.
export function companionUpdatePlan({ installRoot, home, platform = process.platform }) {
  if (platform !== "darwin" || !existsSync(path.join(home, "Applications", "jumpyBrain.app"))) return null;
  const plan = { installRoot, home };
  const detected = invoke(plan, sourceRoot, ["--detect"], true);
  if (detected.status === 3) return null; // Absent, unrelated app, or another runtime.
  assertSuccess(detected);
  return plan;
}

export function checkCompanionUpdate(plan) {
  assertSuccess(invoke(plan, sourceRoot, ["--check"], true));
}

export function commitCompanionUpdate(plan, stagingDir) {
  // Build native code from the SAME fetched source as the new CLI, not from the
  // updater's older source or an unrelated development checkout.
  assertSuccess(invoke(plan, stagingDir, ["--staged-runtime", stagingDir]));
}

function invoke(plan, root, args, capture = false) {
  const helper = path.join(root, "integrations", "macos-companion", "update.py");
  if (!existsSync(helper)) throw new Error(`Cannot update the installed macOS companion: ${helper} is missing. Refusing to replace its runtime.`);
  return spawnSync("python3", [helper, ...args, "--install-root", plan.installRoot, "--home", plan.home], {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
}

function assertSuccess(result) {
  if (result.error) throw new Error(`macOS companion update requires Python 3: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `macOS companion update failed (${result.status ?? result.signal ?? "unknown"}). Installed versions were not intentionally advanced; see the transaction diagnostic above.`);
}
