#!/usr/bin/env node
// Copied to a private support-directory handoff before the app/runtime can be replaced.
import { spawn } from "node:child_process";
import { closeSync, openSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

export function validateRequest(value, directory) {
  if (!value || !Number.isSafeInteger(value.parentPid) || value.parentPid <= 1) throw new Error("Invalid companion PID.");
  for (const key of ["installRoot", "appPath", "home", "node", "qmd"]) {
    if (typeof value[key] !== "string" || !path.isAbsolute(value[key]) || /[\x00-\x1f]/.test(value[key])) throw new Error(`Invalid ${key}.`);
  }
  // The runner and its working directory must survive both replacement trees.
  for (const replaced of [path.join(value.installRoot, "app"), value.appPath]) {
    const relative = path.relative(replaced, directory);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Update handoff overlaps a replacement path.");
  }
  return value;
}

export function updateEnvironment(request) {
  return {
    HOME: request.home,
    PATH: `${path.dirname(request.node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    LANG: "en_US.UTF-8",
    JUMPYBRAIN_QMD_BIN: request.qmd,
    JUMPYBRAIN_CLI_CONFIG: path.join(request.installRoot, "cli-config.json"),
    JUMPYBRAIN_NO_UPDATE_CHECK: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/usr/bin/false",
    SSH_ASKPASS: "/usr/bin/false",
    GCM_INTERACTIVE: "never",
  };
}

export function runProcess(command, args, options, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", output);
    child.stderr.on("data", output);
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

export async function waitForExit(request, directory, { alive = processAlive, timeoutMs = 45000, pollMs = 100, signal } = {}) {
  const deadline = Date.now() + timeoutMs;
  let acknowledged = false;
  while (Date.now() < deadline) {
    let cancelled = signal?.aborted;
    try { await readFile(path.join(directory, "cancelled")); cancelled = true; } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (cancelled) throw new Error("Update cancelled before companion shutdown. No update was started.");
    let authorized = false;
    try { authorized = (await readFile(path.join(directory, "proceed"), "utf8")) === "update\n"; } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (authorized) {
      if (!acknowledged) {
        await writeFile(path.join(directory, "acknowledged"), JSON.stringify({ pid: process.pid, expires: deadline }), { flag: "wx", mode: 0o600 });
        acknowledged = true;
      }
      if (!alive(request.parentPid)) return;
    }
    await delay(pollMs);
  }
  throw new Error("Companion did not authorize and finish shutdown in time. No update was started.");
}

export async function runUpdate(requestPath, { run = runProcess, wait = waitForExit } = {}) {
  const directory = path.dirname(path.resolve(requestPath));
  const request = validateRequest(JSON.parse(await readFile(requestPath, "utf8")), directory);
  // Exclusive claim also prevents reopening the .command from running a second update.
  await mkdir(path.join(directory, "claimed"), { mode: 0o700 });
  const logPath = path.join(directory, "update.log");
  const log = openSync(logPath, "wx", 0o600);
  const output = (data) => { writeSync(log, data); process.stdout.write(data); };
  try {
    output("jumpyBrain update — Chrome stays open.\nWaiting for the companion to stop…\n");
    await writeFile(path.join(directory, "ready"), "ready\n", { flag: "wx", mode: 0o600 });
    const controller = new AbortController();
    const cancel = () => {
      // Revoke synchronously: the app polls independently and must not accept a
      // still-live PID/ack during the next polling delay after Ctrl-C/Terminal exit.
      controller.abort();
      try { writeFileSync(path.join(directory, "cancelled"), "cancelled\n", { mode: 0o600 }); } catch {}
      for (const name of ["ready", "acknowledged"]) {
        try { unlinkSync(path.join(directory, name)); } catch {}
      }
    };
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    try { await wait(request, directory, { signal: controller.signal }); }
    finally {
      process.removeListener("SIGINT", cancel);
      process.removeListener("SIGTERM", cancel);
    }
    const options = { cwd: directory, env: updateEnvironment(request) };
    output("Updating installed CLI and macOS app…\n");
    const result = await run(request.node, [path.join(request.installRoot, "app/dist/cli.js"), "update", "--install-root", request.installRoot, "--home", request.home], options, output);
    if (result.code !== 0) throw new Error(`Updater failed (${result.signal || (result.code ?? "unknown")}). Inspect the output above before reopening the app; do not remove installer locks while an updater is running.`);
    output("Update succeeded. Reopening jumpyBrain…\n");
    const reopened = await run("/usr/bin/open", [request.appPath], options, output);
    if (reopened.code !== 0) throw new Error("Update succeeded, but reopening failed. Open jumpyBrain from Applications manually.");
    output("Done. You can close this Terminal window. Chrome was not reloaded.\n");
    await writeFile(path.join(directory, "result.json"), JSON.stringify({ status: "success" }) + "\n", { mode: 0o600 });
    return 0;
  } catch (error) {
    output(`\n${error.message}\nLog: ${logPath}\n`);
    await writeFile(path.join(directory, "result.json"), JSON.stringify({ status: "failed" }) + "\n", { mode: 0o600 });
    return 1;
  } finally {
    closeSync(log);
    // Retain only logs/result/claim, not executable launchers or machine-path requests.
    for (const name of ["ready", "proceed", "acknowledged", "request.json", "update.command", "menu-update.mjs"]) {
      await unlink(path.join(directory, name)).catch(() => {});
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = await runUpdate(process.argv[2]); }
  catch (error) { console.error(`Could not start update: ${error.message}`); process.exitCode = 1; }
}
