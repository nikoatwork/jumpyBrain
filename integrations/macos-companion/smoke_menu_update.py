#!/usr/bin/env python3
"""Disposable native menu-update smoke (macOS GUI session + Swift tools required).

Runs the production menu action without Accessibility/AppleScript: only a COPY's
startup is instrumented to skip server/checks and call updateApp once on the main
run loop. Real NSWorkspace/Terminal, handshake, shutdown, and open are retained.
The cancellation fixture also instruments its bundled helper to emit SIGTERM just
after acknowledgement, exercising the production synchronous cancellation handler.
Terminal may leave completed fixture windows open; no Terminal windows are closed.
No installed runtime, notes, keys, or persistent login entries are modified.
"""
import json
import os
from pathlib import Path
import plistlib
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid

# Also avoid writing imported install/update bytecode into the checkout.
sys.dont_write_bytecode = True
from install import build_app

HERE = Path(__file__).resolve().parent


def run(*args, check=True):
    return subprocess.run([str(a) for a in args], check=check, capture_output=True, text=True)


def wait_for(check, description, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        time.sleep(0.05)
    raise AssertionError("Timed out: " + description)


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def processes():
    result = {}
    for line in run("/bin/ps", "-axo", "pid=,command=").stdout.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2:
            result[int(parts[0])] = parts[1]
    return result


def instrument(source):
    # Exact anchors fail closed if production startup changes. No modifications
    # to makeMenu, updateApp, waitForUpdater, or applicationShouldTerminate.
    old = """            startServer()
            healthTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.checkHealth() }
            checkForUpdates()
            updateTimer = Timer.scheduledTimer(withTimeInterval: 6 * 60 * 60, repeats: true) { [weak self] _ in self?.checkForUpdates() }"""
    new = r'''            let support = URL(fileURLWithPath: config.supportDirectory)
            let marker = support.appendingPathComponent("started.json")
            let restarted = FileManager.default.fileExists(atPath: marker.path)
            let event: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier,
                                       "ppid": getppid()]
            let destination = restarted ? support.appendingPathComponent("relaunched.json") : marker
            try JSONSerialization.data(withJSONObject: event).write(to: destination, options: .atomic)
            if !restarted {
                RunLoop.main.perform { self.updateApp() }
            }'''
    assert source.count(old) == 1, "Production startup changed; review instrumentation"
    return source.replace(old, new)


def instrument_cancellation(source):
    # Only the cancellation bundle's COPY changes. Emit synchronously at the ack
    # boundary, before waitForExit can check the parent; do not replace the actual
    # production SIGTERM handler or any native handoff/shutdown behavior.
    old = '''        await writeFile(path.join(directory, "acknowledged"), JSON.stringify({ pid: process.pid, expires: deadline }), { flag: "wx", mode: 0o600 });
        acknowledged = true;'''
    new = old.replace("        acknowledged = true;", '''        process.emit("SIGTERM");
        await writeFile(path.join(directory, "smoke-cancellation.json"), JSON.stringify({
          pid: process.pid, parentPid: request.parentPid, aborted: signal.aborted
        }), { flag: "wx", mode: 0o600 });
        acknowledged = true;''')
    assert source.count(old) == 1, "Production acknowledgement changed; review instrumentation"
    return source.replace(old, new)


def verify_cancellation(support, memory, started, executable, job):
    handoff = wait_for(lambda: next(support.glob("update-*"), None), "cancellation handoff")
    injected = wait_for(lambda: read_json(handoff / "smoke-cancellation.json"), "SIGTERM after ack")
    assert injected["parentPid"] == started["pid"] and injected["aborted"] is True, injected
    result = wait_for(lambda: read_json(handoff / "result.json"), "cancelled updater result")
    assert result["status"] == "failed", result
    assert (handoff / "cancelled").read_text() == "cancelled\n"
    wait_for(lambda: injected["pid"] not in processes(), "cancelled runner exit")
    # Allow several native polling turns, including its cancellation error alert.
    # No UI automation dismisses it: owned-process cleanup handles the modal app.
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        assert processes().get(started["pid"]) == executable, "Cancelled companion exited"
        for name in ("cli.json", "cli-finished", "relaunched.json"):
            assert not (support / name).exists(), "Cancellation unexpectedly created " + name
        time.sleep(0.05)
    job_state = run("/bin/launchctl", "print", job).stdout
    assert "state = running" in job_state and f"pid = {started['pid']}" in job_state, job_state
    log = (handoff / "update.log").read_text()
    assert "Update cancelled before companion shutdown. No update was started." in log
    assert "Updating installed CLI" not in log and "Reopening" not in log
    assert not list(memory.iterdir()), "Fixture memory unexpectedly changed"
    for name in ("request.json", "ready", "proceed", "acknowledged", "update.command", "menu-update.mjs"):
        assert not (handoff / name).exists(), "Helper did not remove " + name
    print("PASS [cancel-after-ack]: real Terminal runner emitted SIGTERM immediately after ack; "
          "production handler cancelled/revoked handoff; failed result, original native PID still alive; "
          "no fixture CLI or relaunch", flush=True)


FAKE_CLI = r'''import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const runtime = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settings = JSON.parse(fs.readFileSync(path.join(runtime, "smoke-settings.json")));
const support = settings.support;
const args = process.argv.slice(2);
if (args.length !== 5 || args[0] !== "update" || args[1] !== "--install-root" ||
    args[2] !== path.dirname(runtime) || args[3] !== "--home") {
  console.error("Fixture refuses every command except update of its own root");
  process.exit(98);
}
const dir = fs.readdirSync(support).filter(n => n.startsWith("update-"));
if (dir.length !== 1) process.exit(97);
const handoff = path.join(support, dir[0]);
const request = JSON.parse(fs.readFileSync(path.join(handoff, "request.json")));
const ack = JSON.parse(fs.readFileSync(path.join(handoff, "acknowledged")));
let parentAlive = true;
try { process.kill(request.parentPid, 0); } catch (e) {
  if (e.code !== "ESRCH") throw e;
  parentAlive = false;
}
process.kill(ack.pid, 0);
const evidence = {args, env: process.env, pid: process.pid, ppid: process.ppid,
  parentAlive, request, ack,
  ready: fs.readFileSync(path.join(handoff, "ready"), "utf8"),
  proceed: fs.readFileSync(path.join(handoff, "proceed"), "utf8")};
fs.writeFileSync(path.join(support, "cli.json"), JSON.stringify(evidence));
console.log("FIXTURE ONLY: update " + args[2] + "; no installer/server imported");
await new Promise(resolve => setTimeout(resolve, 2500));
fs.writeFileSync(path.join(support, "cli-finished"), String(settings.exitCode));
process.exit(settings.exitCode);
'''


def cleanup(jobs, executables, root, node):
    for job in jobs:
        run("/bin/launchctl", "bootout", job, check=False)

    def owned():
        matches = []
        for pid, command in processes().items():
            # Never signal Terminal, a user's app, or an unverified/reused PID.
            if command in executables or (
                command.startswith(node + " " + str(root) + "/") and
                ("/menu-update.mjs " in command or "/dist/cli.js update " in command)
            ):
                matches.append(pid)
        return matches

    for sig in (signal.SIGTERM, signal.SIGKILL):
        for pid in owned():
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 5
        while owned() and time.monotonic() < deadline:
            time.sleep(0.1)
    assert not owned(), "Fixture processes remain; refusing silent cleanup"
    for job in jobs:
        assert run("/bin/launchctl", "print", job, check=False).returncode != 0, "Fixture launchd job remains: " + job


def exercise(root, template, case, exit_code, node, jobs, executables, cancel_after_ack=False):
    directory = root / case
    directory.mkdir()
    support = directory / "support"
    support.mkdir(mode=0o700)
    # Synthetic key only; no user's key is read or copied.
    (support / "api-key").write_text("a" * 64 + "\n")
    (support / "api-key").chmod(0o600)
    runtime = directory / "install/app"
    (runtime / "dist").mkdir(parents=True)
    (runtime / "package.json").write_text(json.dumps({"type": "module"}))
    (runtime / "dist/cli.js").write_text(FAKE_CLI)
    (runtime / "smoke-settings.json").write_text(json.dumps({
        "support": str(support), "exitCode": exit_code}))
    (runtime.parent / "install-manifest.json").write_text("{}\n")
    memory = directory / "empty-memory"
    memory.mkdir()
    app = directory / "Fixture.app"
    shutil.copytree(template, app)
    identifier = "local.jumpybrain.menu-smoke." + uuid.uuid4().hex
    agent = directory / "fixture-agent.plist"  # NOT ~/Library/LaunchAgents
    resources = app / "Contents/Resources"
    if cancel_after_ack:
        helper = resources / "menu-update.mjs"
        helper.write_text(instrument_cancellation(helper.read_text()))
    # Re-sign below after ALL fixture-only resource/identity changes.
    config = json.loads((resources / "Configuration.json").read_text())
    config.update(runtimeRoot=str(runtime), memoryRoot=str(memory),
                  supportDirectory=str(support), launchAgent=str(agent), label=identifier)
    (resources / "Configuration.json").write_text(json.dumps(config))
    info_path = app / "Contents/Info.plist"
    info = plistlib.loads(info_path.read_bytes())
    info.update(CFBundleIdentifier=identifier, CFBundleName="Menu smoke " + case,
                CFBundleDisplayName="Menu smoke " + case)
    info_path.write_bytes(plistlib.dumps(info))
    run("/usr/bin/codesign", "--force", "--sign", "-", app)
    executable = str(app / "Contents/MacOS/jumpyBrain")
    executables.append(executable)
    agent.write_bytes(plistlib.dumps({
        "Label": identifier, "ProgramArguments": [executable], "RunAtLoad": True,
        "KeepAlive": False, "ProcessType": "Interactive", "LimitLoadToSessionType": "Aqua",
        "AssociatedBundleIdentifiers": [identifier],
        "StandardOutPath": str(support / "native.log"),
        "StandardErrorPath": str(support / "native.log"),
    }))
    job = f"gui/{os.getuid()}/{identifier}"
    jobs.append(job)
    run("/bin/launchctl", "bootstrap", f"gui/{os.getuid()}", agent)
    started = wait_for(lambda: read_json(support / "started.json"), case + " native startup")
    assert started["ppid"] == 1, "Fixture was not launched by launchd"
    if cancel_after_ack:
        verify_cancellation(support, memory, started, executable, job)
        return
    evidence = wait_for(lambda: read_json(support / "cli.json"), case + " Terminal handshake/CLI")
    request, ack = evidence["request"], evidence["ack"]
    assert request["parentPid"] == started["pid"]
    assert request["appPath"] == str(app)
    assert request["installRoot"] == str(runtime.parent)
    assert request["node"] == node and request["qmd"] == "/usr/bin/true"
    assert not evidence["parentAlive"]
    assert started["pid"] not in processes(), "Companion must exit before CLI starts"
    assert evidence["ready"] == "ready\n" and evidence["proceed"] == "update\n"
    assert ack["pid"] == evidence["ppid"] and ack["expires"] > time.time() * 1000
    assert ack["pid"] in processes(), "Terminal-owned runner died with launchd app"
    job_state = run("/bin/launchctl", "print", job).stdout
    assert "state = not running" in job_state and "last exit code = 0" in job_state, job_state
    assert evidence["args"] == ["update", "--install-root", str(runtime.parent), "--home", request["home"]]
    env = evidence["env"]
    assert env["JUMPYBRAIN_CLI_CONFIG"] == str(runtime.parent / "cli-config.json")
    assert env["JUMPYBRAIN_QMD_BIN"] == "/usr/bin/true" and env["HOME"] == request["home"]
    assert not any(k in env for k in ("JUMPYBRAIN_API_KEY", "JUMPYBRAIN_SERVER_API_KEYS"))
    handoff = next(support.glob("update-*"))
    assert (handoff / "menu-update.mjs").read_bytes() == (HERE / "menu-update.mjs").read_bytes()
    assert (handoff / "update.command").stat().st_mode & 0o777 == 0o700
    assert (handoff / "request.json").stat().st_mode & 0o777 == 0o600
    print(f"PASS [{case}]: production menu action → Terminal .command → ready/proceed/ack; "
          "launchd companion exited 0; independent runner called fixture CLI at correct root", flush=True)
    result = wait_for(lambda: read_json(handoff / "result.json"), case + " updater result")
    assert result["status"] == ("success" if exit_code == 0 else "failed"), result
    assert (support / "cli-finished").read_text() == str(exit_code)
    log = (handoff / "update.log").read_text()
    assert "FIXTURE ONLY: update " + str(runtime.parent) in log
    wait_for(lambda: ack["pid"] not in processes(), case + " runner exit")
    if exit_code == 0:
        reopened = wait_for(lambda: read_json(support / "relaunched.json"), "fixture relaunch")
        assert reopened["pid"] != started["pid"]
        assert processes().get(reopened["pid"]) == executable
        assert "Done. You can close this Terminal window." in log
        print("PASS [success]: /usr/bin/open reopened the uniquely identified fixture; "
              "startup marker prevented another update", flush=True)
    else:
        time.sleep(2)
        assert not (support / "relaunched.json").exists()
        assert executable not in processes().values()
        assert "Updater failed (23)" in log and "Reopening" not in log
        print("PASS [failure]: fixture CLI exit 23 retained failure result; app not reopened", flush=True)
    assert not list(memory.iterdir()), "Fixture memory unexpectedly changed"
    for name in ("request.json", "ready", "proceed", "acknowledged", "update.command", "menu-update.mjs"):
        assert not (handoff / name).exists(), "Helper did not remove " + name


def main():
    if sys.platform != "darwin":
        print("BLOCKED: this smoke requires macOS with a logged-in GUI session", file=sys.stderr)
        return 2
    node = shutil.which("node")
    if not node or run("/bin/launchctl", "print", f"gui/{os.getuid()}", check=False).returncode:
        print("BLOCKED: Node and a launchctl GUI domain are required", file=sys.stderr)
        return 2
    print("Real Terminal fixture windows may briefly open; existing windows will not be controlled.", flush=True)
    with tempfile.TemporaryDirectory(prefix="jumpybrain-menu-smoke-") as tmp:
        # A space also exercises production shell quoting of command/helper paths.
        root = Path(tmp).resolve() / "fixture space"
        root.mkdir()
        runtime = root / "build-runtime"
        source = runtime / "integrations/macos-companion"
        source.mkdir(parents=True)
        for name in ("Companion.swift", "server-bootstrap.mjs", "menu-update.mjs", "update-check.mjs"):
            shutil.copy2(HERE / name, source / name)
        (source / "Companion.swift").write_text(instrument((source / "Companion.swift").read_text()))
        (runtime / "dist").mkdir()
        (runtime / "dist/cli.js").write_text("throw new Error('Build-only runtime must never execute');\n")
        (runtime / "package.json").write_text(json.dumps({"name": "jumpybrain", "version": "0.0.0", "type": "module"}))
        build = root / "build"
        build.mkdir()
        jobs, executables = [], []
        try:
            template = build_app(runtime, build, {
                "node": node, "qmd": "/usr/bin/true", "runtimeRoot": str(runtime),
                "memoryRoot": str(root / "unused"), "supportDirectory": str(root / "unused"),
                "launchAgent": str(root / "unused.plist"), "label": "unused", "port": 3787,
            })
            exercise(root, template, "success", 0, node, jobs, executables)
            exercise(root, template, "failure", 23, node, jobs, executables)
            exercise(root, template, "cancel-after-ack", 0, node, jobs, executables, cancel_after_ack=True)
        except Exception as error:
            print(f"FAIL/BLOCKED: {error}", file=sys.stderr)
            for log in root.glob("*/support/*.log"):
                print(f"Diagnostic {log.name}: {log.read_text()[-4000:]}", file=sys.stderr)
            for log in root.glob("*/support/update-*/update.log"):
                print(f"Diagnostic updater: {log.read_text()[-4000:]}", file=sys.stderr)
            return 1
        finally:
            cleanup(jobs, executables, root, node)
    print("PASS: disposable jobs/processes/files cleaned; installed app/runtime/login entries untouched")
    print("LIMITS: programmatic menu action (not a physical click); fake CLI, no real update/server; "
          "cancellation uses synchronous SIGTERM emission in a copied helper, not closing Terminal; "
          "handoff timeout and logout/login not tested. Terminal may retain completed fixture windows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
