#!/usr/bin/env python3
"""Disposable macOS native connection regressions; no app install or login changes.

Compile a COPY of Companion.swift, replacing only its top-level app entrypoint
and Keychain service with a UUID test namespace. Production bridge, credential,
and menu methods remain intact. A cold Swift module cache can take minutes.
Default coverage uses temporary items in the current user's default Keychain;
it never locks/unlocks it or allows authentication prompts. --skip-keychain is
available for locked/headless environments (and explicitly reports the omission).
"""
import argparse
import json
import os
from pathlib import Path
import platform
import selectors
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

HERE = Path(__file__).resolve().parent

HARNESS = r'''
extension NativeBridge {
    static func fixtureCleanup() -> Bool {
        SecKeychainSetUserInteractionAllowed(false)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: service]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

extension Companion {
    func fixtureMenu(_ directory: String) {
        config = Configuration(node: "/unused", qmd: "/unused", memoryRoot: directory,
            runtimeRoot: directory, supportDirectory: directory,
            launchAgent: directory + "/never-created.plist", label: "fixture", port: 3787,
            revision: "fixture")
        makeMenu()
        defer { NSStatusBar.system.removeStatusItem(statusItem) }
        func check(_ value: Bool, _ message: String) {
            if !value { fputs("Menu assertion: " + message + "\n", stderr); exit(1) }
        }
        guard let menu = statusItem.menu,
              let appMenu = menu.items.first(where: { $0.title == "App" })?.submenu,
              let troubleshootingMenu = menu.items.first(where: { $0.title == "Troubleshooting" })?.submenu else {
            check(false, "required submenus exist"); return
        }
        func titles(_ menu: NSMenu) -> [String] {
            menu.items.map { $0.isSeparatorItem ? "---" : $0.title }
        }
        check(titles(menu) == ["Starting…", "---", "Open Editor in Chrome", "Settings…", "---",
                               "App", "Troubleshooting", "---", "Quit jumpyBrain"], "compact top-level order")
        check(titles(appMenu) == ["Start at Login", "Updates: not checked", "Check for Updates",
                                  "Update jumpyBrain…", "Version fixture (beta)"], "App submenu order")
        check(titles(troubleshootingMenu) == ["Restart Server…", "Open Memory Folder", "Show Logs"],
              "Troubleshooting submenu order")
        check(!menu.autoenablesItems && !appMenu.autoenablesItems && !troubleshootingMenu.autoenablesItems,
              "explicit enabled state on every menu")
        let build = appMenu.items.last!
        let logs = troubleshootingMenu.items.last!
        let quitItem = menu.items.last!
        let actions: [(NSMenuItem, Selector, String)] = [
            (openItem, #selector(openEditor), "o"), (settingsItem, #selector(openSettings), ","),
            (loginItem, #selector(toggleLogin), ""), (checkUpdateItem, #selector(checkForUpdates), ""),
            (updateItem, #selector(updateApp), ""), (restartItem, #selector(restartServer), ""),
            (memoryItem, #selector(openMemory), ""), (logs, #selector(showLogs), ""),
            (quitItem, #selector(quit), "q")]
        for (item, action, key) in actions {
            check(item.action == action && item.target as? Companion === self && item.keyEquivalent == key,
                  "action target/shortcut: " + item.title)
        }
        let allItems = menu.items + appMenu.items + troubleshootingMenu.items
        check(!allItems.contains { $0.title.contains("127.0.0.1") || $0.title.contains("localhost") ||
                                   $0.title == "Brain Connections" || $0.title.contains("Refresh Search Index") },
              "no loopback address or obsolete native controls")
        check(loginItem.state == .off, "absent fixture login item is unchecked")

        // Decode production-shaped payloads: write approval is browser/gateway policy,
        // not a reason to hide any of the remaining native recovery controls.
        func state(_ kind: String?, _ health: String, _ phase: String = "idle", _ allowWrites: Bool = true) -> CompanionState {
            var object: [String: Any] = ["phase": phase, "health": health, "generation": 3,
                                       "profiles": [], "activeId": kind as Any? ?? NSNull()]
            if let kind = kind {
                var active: [String: Any] = ["id": kind, "kind": kind, "allowWrites": allowWrites,
                    "name": kind == "local" ? "Local fixture" : "Remote\nfixture"]
                if kind == "local" { active["root"] = directory }
                else { active["url"] = "https://fixture.invalid" }
                object["active"] = active
            } else { object["active"] = NSNull() }
            return try! JSONDecoder().decode(CompanionState.self, from: JSONSerialization.data(withJSONObject: object))
        }
        func controls(_ browser: Bool, _ folder: Bool, _ restart: Bool, _ maintenance: Bool, _ canCheck: Bool? = nil) {
            check(openItem.isEnabled == browser && settingsItem.isEnabled == browser, "editor/settings availability")
            check(memoryItem.isEnabled == folder, "selected local folder availability")
            check(restartItem.isEnabled == restart, "restart availability")
            check(loginItem.isEnabled == maintenance && updateItem.isEnabled == maintenance, "login/update availability")
            check(checkUpdateItem.isEnabled == (canCheck ?? maintenance), "update check availability")
            check(logs.isEnabled && quitItem.isEnabled, "logs/quit remain available")
            check(menu.items.first { $0.title == "App" }!.isEnabled &&
                  menu.items.first { $0.title == "Troubleshooting" }!.isEnabled, "submenus remain accessible")
            check(!statusLine.isEnabled && !updateStatus.isEnabled && !build.isEnabled,
                  "status and build rows are informational")
        }
        controls(false, false, true, true) // Gateway starting: recovery and maintenance remain available.
        present(state("local", "connected"))
        controls(true, true, true, true)
        check(connectionState?.active?.root == directory && statusLine.title == "Local fixture · Connected",
              "local status/folder follow selected target")
        for allowWrites in [false, true] {
            present(state("remote", "connected", "idle", allowWrites))
            controls(true, false, true, true)
            check(!statusLine.title.contains("\n"), "active label sanitizes newline")
            for health in ["offline", "credential_unavailable", "authentication_failed"] {
                present(state("remote", health, "idle", allowWrites))
                controls(true, false, true, true)
                check(connectionState?.active?.kind == "remote" && connectionState?.active?.root == nil,
                      "offline does not select a local fallback")
                check(statusLine.title.contains(health == "credential_unavailable" ? "Keychain unavailable" : "Offline"),
                      "offline/credential status")
            }
        }
        present(state("local", "offline"))
        controls(true, true, true, true) // A local folder remains useful even with its engine offline.
        present(state(nil, "offline"))
        controls(true, false, true, true)
        check(statusLine.title == "Selected brain · Offline", "no selected target status")
        for kind in ["local", "remote"] {
            present(state(kind, "connected", "preparing"))
            controls(true, false, false, true)
            check(statusLine.title.contains("Switching…"), "browser switch status")
        }
        present(state("local", "connected"))
        controls(true, true, true, true) // Browser switch completion restores controls.
        setStatus("Server not responding — see logs", healthy: false)
        controls(false, false, true, true)
        present(state("local", "connected"))
        updateCheck = Process() // No process is launched; exercise only the in-flight indicator guard.
        setStatus(statusLine.title, healthy: true)
        controls(true, true, true, true, false)
        updateCheck = nil
        for kind in ["local", "remote"] {
            stopping = true
            present(state(kind, "connected"))
            controls(false, false, false, false)
            stopping = false
            updating = true
            present(state(kind, "connected"))
            controls(false, false, false, false)
            updating = false
        }
        present(state("local", "connected"))
        controls(true, true, true, true)
        print("PASS menu: compact structure/actions, local folder, offline recovery, switching/stopping/updating, update checks")
    }
}

signal(SIGPIPE, SIG_IGN)
let mode = CommandLine.arguments[1]
if mode == "--cleanup" {
    exit(NativeBridge.fixtureCleanup() ? 0 : 1)
} else if mode == "--menu" {
    let application = NSApplication.shared
    application.setActivationPolicy(.accessory)
    let fixture = Companion()
    fixture.fixtureMenu(CommandLine.arguments[2])
    exit(0)
} else {
    let bridge = NativeBridge(reader: .standardInput, writer: .standardOutput) { exit(70) }
    bridge.start()
    dispatchMain()
}
'''


def build(directory, service):
    source = (HERE / "Companion.swift").read_text()
    for obsolete in ("profilesItem", "switchBrain", "switchInFlight", "indexItem", "indexer", "refreshIndex",
                     '"/companion/switch"', '"/memories/all/index"', '"X-Companion-Generation"'):
        assert obsolete not in source, "Obsolete native action/state remains: " + obsolete
    entry = "let app = NSApplication.shared\n"
    namespace = 'private static let service = "local.jumpybrain.companion.connections"'
    assert source.count(entry) == 1 and source.count(namespace) == 1, "Production anchors changed; review extraction"
    source = source.split(entry)[0].replace(namespace, 'private static let service = ' + json.dumps(service)) + HARNESS
    swift = directory / "Fixture.swift"
    swift.write_text(source)
    compiler = Path(subprocess.check_output(["xcrun", "--find", "swiftc"], text=True).strip())
    headers = compiler.parent.parent / "include/swift"
    old, new = headers / "module.modulemap", headers / "bridging.modulemap"
    options = []
    if all(p.exists() and "module SwiftBridging" in p.read_text() for p in (old, new)):
        empty = directory / "empty.modulemap"
        empty.write_text("// Hide obsolete duplicate locally.\n")
        overlay = directory / "overlay.json"
        overlay.write_text(json.dumps({"version": 0, "case-sensitive": "false", "roots": [
            {"type": "file", "name": str(old), "external-contents": str(empty)}]}))
        options = ["-vfsoverlay", str(overlay)]
    sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
    binary = directory / "native-fixture"
    print("Compiling disposable native fixture (cold Swift cache can take minutes)...", flush=True)
    subprocess.run([str(compiler), "-swift-version", "5", "-O", "-sdk", sdk,
        "-target", platform.machine() + "-apple-macos13.0", "-module-cache-path", str(directory / "cache"),
        *options, "-framework", "AppKit", "-framework", "Security", "-framework", "LocalAuthentication",
        str(swift), "-o", str(binary)], check=True, timeout=600)
    subprocess.run(["codesign", "--force", "--sign", "-", str(binary)], check=True, capture_output=True)
    return binary


class RPC:
    def __init__(self, binary):
        self.process = subprocess.Popen([str(binary), "--rpc"], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.buffer = b""

    def send(self, packet):
        data = json.dumps(packet).encode() + b"\n"
        self.process.stdin.write(data)
        self.process.stdin.flush()

    def receive(self):
        deadline = time.monotonic() + 15
        with selectors.DefaultSelector() as selector:
            selector.register(self.process.stdout, selectors.EVENT_READ)
            while b"\n" not in self.buffer:
                assert selector.select(max(0, deadline - time.monotonic())), "Native reply timed out (prompts must stay disabled)"
                data = os.read(self.process.stdout.fileno(), 65536)
                assert data, "Native bridge closed unexpectedly"
                self.buffer += data
        line, self.buffer = self.buffer.split(b"\n", 1)
        return json.loads(line)

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            stream.close()


def crud(binary):
    rpc = RPC(binary)
    reference = "fixture-" + uuid.uuid4().hex
    try:
        def call(identifier, operation, **fields):
            rpc.send(dict(id=identifier, operation=operation, reference=reference, **fields))
            reply = rpc.receive()
            assert reply.get("id") == identifier, "RPC correlation failed"
            assert "error" not in reply, "Keychain unavailable: use an unlocked default Keychain or explicitly --skip-keychain"
            return reply["result"]
        # Exercise real incremental framing, without completing the first write.
        fragment = json.dumps(dict(id="fragmented", operation="get", reference=reference)).encode() + b"\n"
        rpc.process.stdin.write(fragment[:11])
        rpc.process.stdin.flush()
        time.sleep(0.03)
        rpc.process.stdin.write(fragment[11:])
        rpc.process.stdin.flush()
        assert rpc.receive() == {"id": "fragmented", "result": None}
        assert call("missing", "get") is None
        assert call(1, "set", key="temporary-fixture-key-α") is None
        assert call("read", "get") == "temporary-fixture-key-α"
        assert call(2, "set", key="updated-fixture-key") is None
        assert call("updated", "get") == "updated-fixture-key"
        assert call("delete", "delete") is None
        assert call("deleted", "get") is None
        assert call("idempotent", "delete") is None
        for i, fields in enumerate(({"reference": ""}, {"reference": "bad\nreference"},
                                    {"reference": "r" * 257}, {"key": ""}, {"key": "k" * 8193})):
            rpc.send(dict(id="invalid-" + str(i), operation="set", reference=reference,
                          key="fixture-only") | fields)
            assert rpc.receive() == {"id": "invalid-" + str(i), "error": "credential_unavailable"}
        assert call("still-open", "get") is None
    finally:
        rpc.close()
    print("PASS Keychain: missing, create, read, update, delete, idempotent delete, invalid input")


def malformed(binary):
    def frame(**fields):
        return json.dumps(dict(id="a", operation="get", reference="fixture-only") | fields).encode() + b"\n"
    cases = {
        "invalid JSON": b"not-json-fixture-secret\n",
        "non-object": b"[]\n",
        "boolean id": frame(id=True),
        "empty id": frame(id=""),
        "overlong id": frame(id="i" * 129),
        "fractional id": frame(id=1.5),
        "unsafe integer": frame(id=9007199254740992),
        "unknown operation": frame(operation="invalid"),
        "overlong frame": b'{"id":"a","operation":"get","reference":"' + b"r" * 16400 + b'"}\n',
        "bounded unfinished input": b"x" * 32769,
        "duplicate pending id": frame() + frame(),
        "pending-work limit": b"".join(frame(id=str(i)) for i in range(33)),
        "EOF": b"",
    }
    for name, data in cases.items():
        process = subprocess.Popen([str(binary), "--rpc"], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            # Keep stdin open: malformed input must close promptly without waiting for EOF.
            if data:
                process.stdin.write(data)
                process.stdin.flush()
            else:
                process.stdin.close()
            assert process.wait(timeout=5) == 70, "Expected protocol failure: " + name
            assert process.stdout.read() == b"", "Malformed request produced output: " + name
            diagnostics = process.stderr.read()
            allowed = {b"Native connection bridge failed: invalid_frame", b"Native connection bridge failed: read_error", b"Native connection bridge failed: pipe_eof"}
            assert all(line in allowed for line in diagnostics.splitlines()), "Malformed request leaked non-static diagnostics: " + name
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()
    print("PASS RPC: " + str(len(cases)) + " malformed/EOF cases fail closed within 5s with static reason codes only")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-keychain", action="store_true")
    parser.add_argument("--skip-menu", action="store_true", help="No Aqua GUI session; report menu coverage skipped")
    args = parser.parse_args()
    if sys.platform != "darwin" or not shutil.which("xcrun"):
        parser.error("Requires macOS 13+ and Xcode command-line tools")
    service = "local.jumpybrain.native-test." + uuid.uuid4().hex
    with tempfile.TemporaryDirectory(prefix="jumpybrain-native-connections-") as scratch:
        directory = Path(scratch)
        binary = build(directory, service)
        try:
            malformed(binary)
            if args.skip_keychain:
                print("SKIP Keychain CRUD (explicit --skip-keychain)")
            else:
                crud(binary)
            if args.skip_menu:
                print("SKIP menu state (explicit --skip-menu)")
            else:
                subprocess.run([str(binary), "--menu", str(directory)], check=True, timeout=30)
            assert not (directory / "never-created.plist").exists(), "Fixture changed login state"
        finally:
            # Same signed executable performs service-scoped deletion, even on assertion failure.
            # Never enumerate/delete production items or change Keychain lock/default settings.
            result = None if args.skip_keychain else subprocess.run(
                [str(binary), "--cleanup"], timeout=15, capture_output=True)
            if result is not None and result.returncode:
                raise RuntimeError("Fixture Keychain cleanup failed. Remove ONLY test service " + service)
    print("PASS disposable native regressions; temporary build and Keychain items removed")


if __name__ == "__main__":
    main()
