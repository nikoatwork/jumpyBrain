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
        let local = BrainProfile(id: "local", name: "Local fixture", kind: "local",
                                 root: directory, url: nil, allowWrites: true)
        let remote = BrainProfile(id: "remote", name: "Remote\nfixture", kind: "remote",
                                  root: nil, url: "https://fixture.invalid", allowWrites: false)
        func check(_ value: Bool, _ message: String) {
            if !value { fputs("Menu assertion: " + message + "\n", stderr); exit(1) }
        }
        func show(_ active: BrainProfile, _ health: String, _ phase: String = "idle") {
            present(CompanionState(profiles: [local, remote], activeId: active.id,
                generation: 3, phase: phase, health: health, active: active))
            check(profilesItem.submenu?.items.filter { $0.state == .on }.count == 1,
                  "exactly one selected item")
            check(profilesItem.submenu?.items.first { $0.state == .on }?.representedObject as? String == active.id,
                  "menu follows active identity")
        }
        show(local, "connected")
        check(memoryItem.isEnabled && indexItem.isEnabled, "local folder/index available")
        show(remote, "connected")
        check(!memoryItem.isEnabled && !indexItem.isEnabled, "remote read-only has no folder/index")
        check(!statusLine.title.contains("\n"), "active label sanitizes newline")
        let writable = BrainProfile(id: remote.id, name: remote.name, kind: remote.kind,
                                   root: nil, url: remote.url, allowWrites: true)
        show(writable, "connected")
        check(indexItem.isEnabled, "authorized connected remote can index")
        for health in ["offline", "credential_unavailable", "authentication_failed"] {
            show(writable, health)
            check(openItem.isEnabled && settingsItem.isEnabled && profilesItem.isEnabled,
                  "offline target retains recovery controls")
            check(!memoryItem.isEnabled && !indexItem.isEnabled, "offline remote disables index/folder")
            check(connectionState?.activeId == remote.id, "offline does not select fallback")
        }
        show(writable, "credential_unavailable")
        check(statusLine.title.contains("Keychain unavailable"), "credential status")
        show(local, "connected", "preparing")
        check(!profilesItem.isEnabled && !memoryItem.isEnabled && !indexItem.isEnabled && !restartItem.isEnabled,
              "switch preparation disables competing target actions")
        switchInFlight = true
        show(local, "connected")
        check(!profilesItem.isEnabled && !indexItem.isEnabled, "native in-flight guard")
        switchInFlight = false
        stopping = true
        show(local, "connected")
        check(!openItem.isEnabled && !settingsItem.isEnabled, "stopping disables controls")
        stopping = false
        updating = true
        show(local, "connected")
        check(!profilesItem.isEnabled && !indexItem.isEnabled && !openItem.isEnabled, "updating disables actions")
        print("PASS menu: target identity, permissions, offline recovery, switching/stopping/updating")
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
