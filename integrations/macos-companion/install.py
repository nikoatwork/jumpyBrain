#!/usr/bin/env python3
"""Build/install this machine's optional companion. Never edits canonical memory."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import plistlib
import platform
import secrets
import shutil
import socket
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
LABEL = "local.jumpybrain.companion"


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def agent_plist(app, support):
    return {
        "Label": LABEL,
        "ProgramArguments": [str(app / "Contents/MacOS/jumpyBrain")],
        "RunAtLoad": True,
        "KeepAlive": False,  # Quit means quit until the next login/manual launch.
        "ProcessType": "Interactive",
        "LimitLoadToSessionType": "Aqua",
        "AssociatedBundleIdentifiers": [LABEL],
        "StandardOutPath": str(support / "companion.log"),
        "StandardErrorPath": str(support / "companion.log"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--memory-root", type=Path, default=Path.home() / ".jumpybrain/memory")
    parser.add_argument("--port", type=int, default=3787)
    parser.add_argument("--no-start", action="store_true", help="Install but do not launch now")
    parser.add_argument("--build-only", action="store_true", help="Build in .build without installing or enabling login")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("This prototype requires macOS and Xcode command-line tools.")
    if not 1024 <= args.port <= 65535:
        parser.error("Choose an unprivileged port (1024–65535).")
    memory = args.memory_root.expanduser().resolve()
    if not (memory / "jumpybrain.json").is_file():
        parser.error("Memory root is not initialized; initialize it explicitly with the CLI first.")
    node = shutil.which("node")
    qmd = shutil.which("qmd")
    if not node or not qmd:
        parser.error("node and qmd must be installed and on PATH before installing.")
    # Keep stable Homebrew symlink paths, not version-specific Cellar targets.
    run(node, "--version")
    run(qmd, "--version")
    run("xcrun", "--find", "swiftc", stdout=subprocess.DEVNULL)

    app = Path.home() / "Applications/jumpyBrain.app"
    support = Path.home() / "Library/Application Support/jumpyBrain Companion"
    agent = Path.home() / f"Library/LaunchAgents/{LABEL}.plist"
    build = HERE / ".build"
    built_app = build / "jumpyBrain.app"
    config = {
        "node": node, "qmd": qmd, "memoryRoot": str(memory),
        "supportDirectory": str(support), "launchAgent": str(agent),
        "label": LABEL, "port": args.port,
        "revision": subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, text=True).strip(),
    }
    if subprocess.check_output(["git", "diff", "--name-only"], cwd=REPO):
        config["revision"] += "+working-tree"

    lock = None
    existed = app.exists()
    if not args.build_only:
        # Refuse to overwrite unrelated apps/agents or replace a running companion.
        if existed:
            try:
                info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
                if info.get("CFBundleIdentifier") != LABEL:
                    raise ValueError("different bundle identifier")
            except Exception as error:
                parser.error(f"Refusing to replace {app}: {error}")
        if agent.exists() and plistlib.loads(agent.read_bytes()).get("Label") != LABEL:
            parser.error(f"Refusing to replace unrelated LaunchAgent {agent}")
        support.mkdir(parents=True, exist_ok=True, mode=0o700)
        support.chmod(0o700)
        lock = (support / "companion.lock").open("a")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error("Quit jumpyBrain from its menu-bar icon before reinstalling.")
        if not args.no_start:
            try:
                with socket.socket() as sock:
                    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    sock.bind(("127.0.0.1", args.port))
            except OSError:
                parser.error(f"Port {args.port} is occupied. Stop jbl-serve/the existing server first.")

    # Nothing in the running install is replaced unless compilation succeeds.
    run("npm", "run", "build", cwd=REPO)
    build.mkdir(exist_ok=True)
    if built_app.exists():
        shutil.rmtree(built_app)
    macos = built_app / "Contents/MacOS"
    resources = built_app / "Contents/Resources"
    macos.mkdir(parents=True)
    resources.mkdir()
    compiler = Path(subprocess.check_output(["xcrun", "--find", "swiftc"], text=True).strip())
    compiler_options = []
    headers = compiler.parent.parent / "include/swift"
    old_map, new_map = headers / "module.modulemap", headers / "bridging.modulemap"
    if all(p.exists() and "module SwiftBridging" in p.read_text() for p in [old_map, new_map]):
        # Some upgraded CLT installations retain the obsolete map alongside its
        # replacement. Hide it for this invocation only; never edit system tools.
        empty = build / "empty.modulemap"
        empty.write_text("// Obsolete duplicate SwiftBridging map hidden locally.\n")
        overlay = build / "swift-overlay.json"
        overlay.write_text(json.dumps({"version": 0, "case-sensitive": "false", "roots": [{
            "type": "file", "name": str(old_map), "external-contents": str(empty)
        }]}))
        compiler_options += ["-vfsoverlay", str(overlay)]
        print("Using a build-local overlay for duplicate CLT SwiftBridging maps.")
    sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
    run(compiler, "-swift-version", "5", "-O", "-sdk", sdk, "-target", f"{platform.machine()}-apple-macos13.0",
        "-module-cache-path", build / "module-cache", *compiler_options, "-framework", "AppKit",
        HERE / "Companion.swift", "-o", macos / "jumpyBrain")
    runtime = resources / "runtime"
    runtime.mkdir()
    shutil.copytree(REPO / "dist", runtime / "dist")
    shutil.copy2(REPO / "package.json", runtime / "package.json")
    # Current runtime imports only Node built-ins; no npm devDependencies shipped.
    shutil.copy2(HERE / "server-bootstrap.mjs", resources / "server-bootstrap.mjs")
    (resources / "Configuration.json").write_text(json.dumps(config, indent=2) + "\n")
    info = {
        "CFBundleExecutable": "jumpyBrain", "CFBundleIdentifier": LABEL,
        "CFBundleName": "jumpyBrain", "CFBundleDisplayName": "jumpyBrain",
        "CFBundlePackageType": "APPL", "CFBundleVersion": "1",
        "CFBundleShortVersionString": "0.1.0", "LSUIElement": True,
        "LSMinimumSystemVersion": "13.0", "NSHighResolutionCapable": True,
    }
    (built_app / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
    run("codesign", "--force", "--sign", "-", built_app)
    if args.build_only:
        print(f"Built {built_app}; nothing installed or started.")
        return

    # Dedicated persistent loopback key; not shared with remote/team credentials.
    key_file = support / "api-key"
    if not key_file.exists():
        fd = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(secrets.token_hex(32) + "\n")
    key_file.chmod(0o600)
    key = key_file.read_text().strip()
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        parser.error(f"Invalid existing key at {key_file}; refusing to overwrite it.")

    domain = f"gui/{os.getuid()}"
    # No app is running (lock held), but a stopped launchd job may remain registered.
    subprocess.run(["launchctl", "bootout", f"{domain}/{LABEL}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    app.parent.mkdir(exist_ok=True)
    previous = build / "previous.app"
    if previous.exists():
        shutil.rmtree(previous)
    if existed:
        shutil.move(str(app), previous)
    try:
        shutil.copytree(built_app, app)
    except Exception:
        if app.exists():
            shutil.rmtree(app)
        if previous.exists():
            shutil.move(str(previous), app)
        raise
    # Preserve a user's disabled-at-login choice across later reinstalls.
    login_enabled = agent.exists() or not existed
    if login_enabled:
        agent.parent.mkdir(parents=True, exist_ok=True)
        agent.write_bytes(plistlib.dumps(agent_plist(app, support)))
        agent.chmod(0o600)
    lock.close()
    print(f"Installed {app}\nMemory: {memory}\nStart at login: {'on' if login_enabled else 'off'}")
    if not args.no_start:
        if login_enabled:
            run("launchctl", "bootstrap", domain, agent)
        else:
            run("open", app)
        print(f"Started. Use the brain icon in the menu bar. Editor: http://127.0.0.1:{args.port}/")
    print("No Markdown memory, remote configuration, or global CLI installation was changed.")


if __name__ == "__main__":
    main()
