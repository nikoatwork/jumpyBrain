#!/usr/bin/env python3
"""Build/install the optional native GUI against an existing managed CLI runtime.

Never builds the CLI, bundles a runtime snapshot, or edits canonical memory.
An explicit --runtime-root is allowed only with --build-only for development.
"""
import argparse
from contextlib import nullcontext
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
import tempfile

from update import (LABEL, SafetyError, app_path, build_workspace, cleanup, companion_lock,
                    absolute, overlaps, preflight, regular, validate_key,
                    validate_manifest, validate_runtime)


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def agent_plist(app, support):
    return {
        "Label": LABEL,
        "ProgramArguments": [str(app / "Contents/MacOS/jumpyBrain")],
        "RunAtLoad": True, "KeepAlive": False,
        "ProcessType": "Interactive", "LimitLoadToSessionType": "Aqua",
        "AssociatedBundleIdentifiers": [LABEL],
        "StandardOutPath": str(support / "companion.log"),
        "StandardErrorPath": str(support / "companion.log"),
    }


def build_app(runtime, build, config):
    """Build only native assets in caller-owned scratch space; config targets final runtime."""
    package = validate_runtime(runtime)
    source = runtime / "integrations/macos-companion"
    # Keep stable Homebrew symlink paths, not version-specific Cellar targets.
    for key in ("node", "qmd"):
        run(config[key], "--version", stdout=subprocess.DEVNULL)
    run("xcrun", "--find", "swiftc", stdout=subprocess.DEVNULL)
    if not shutil.which("codesign"):
        raise SafetyError("codesign must be installed before building the companion")
    config = dict(config, revision=package["version"])
    built_app = build / "jumpyBrain.app"
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
        source / "Companion.swift", "-o", macos / "jumpyBrain")
    shutil.copy2(source / "server-bootstrap.mjs", resources / "server-bootstrap.mjs")
    (resources / "Configuration.json").write_text(json.dumps(config, indent=2) + "\n")
    info = {
        "CFBundleExecutable": "jumpyBrain", "CFBundleIdentifier": LABEL,
        "CFBundleName": "jumpyBrain", "CFBundleDisplayName": "jumpyBrain",
        "CFBundlePackageType": "APPL", "CFBundleVersion": "1",
        "CFBundleShortVersionString": package["version"], "LSUIElement": True,
        "LSMinimumSystemVersion": "13.0", "NSHighResolutionCapable": True,
    }
    (built_app / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
    run("codesign", "--force", "--sign", "-", built_app)
    return built_app


def install_bundle(built, app, agent, support, existed):
    """Same-volume preparation, rollback app/first-login item together on errors."""
    app.parent.mkdir(parents=True, exist_ok=True)
    transaction = Path(tempfile.mkdtemp(prefix=".companion-install-", dir=app.parent))
    pending_agent = None
    moves = []
    try:
        pending = transaction / "new.app"
        shutil.copytree(built, pending)
        if not existed:
            if os.path.lexists(agent):
                raise SafetyError(f"Refusing to replace pre-existing LaunchAgent {agent}")
            agent.parent.mkdir(parents=True, exist_ok=True)
            fd, name = tempfile.mkstemp(prefix=".companion-agent-", dir=agent.parent)
            pending_agent = Path(name)
            with os.fdopen(fd, "wb") as stream:
                stream.write(plistlib.dumps(agent_plist(app, support)))
        operations = ([(app, transaction / "old.app")] if existed else [])
        operations += [(pending, app)]
        if pending_agent is not None:
            operations += [(pending_agent, agent)]
        for source, target in operations:
            os.rename(source, target)
            moves.append((source, target))
    except BaseException as error:
        for source, target in reversed(moves):
            try:
                os.rename(target, source)
            except OSError as rollback_error:
                raise SafetyError(f"Install failed ({error}); manual recovery required. Preserve {transaction}: {rollback_error}") from error
        cleanup(transaction)
        raise
    else:
        cleanup(transaction)
    finally:
        if pending_agent is not None and pending_agent.exists():
            pending_agent.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path.home())
    parser.add_argument("--install-root", type=Path)
    parser.add_argument("--runtime-root", type=Path, help="Explicit compiled fixture/development runtime; build-only only")
    parser.add_argument("--memory-root", type=Path, help="Explicit override; otherwise preserve installed companion setting")
    parser.add_argument("--port", type=int, help="Explicit override; otherwise preserve installed companion setting")
    parser.add_argument("--no-start", action="store_true", help="Do not launch a fresh installation (updates never launch)")
    parser.add_argument("--build-only", action="store_true", help="Build in temporary space without installing or enabling login")
    parser.add_argument("--output", type=Path, help="Build-only output .app path (must not exist); default is a temporary directory")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("The companion requires macOS and Xcode command-line tools.")
    if args.runtime_root and not args.build_only:
        parser.error("--runtime-root is only allowed with --build-only; install the managed CLI first.")
    if args.output and not args.build_only:
        parser.error("--output is only allowed with --build-only")
    home = args.home.expanduser().resolve()
    root = (args.install_root.expanduser() if args.install_root else home / ".jumpybrain").resolve()
    runtime = args.runtime_root.expanduser().resolve() if args.runtime_root else root / "app"
    try:
        manifest = None if args.runtime_root else validate_manifest(root)
        validate_runtime(runtime)
        app = app_path(home)
        existed = not args.build_only and os.path.lexists(app)
        config = preflight(root, home) if existed else {
            "node": shutil.which("node"), "qmd": shutil.which("qmd"),
            "memoryRoot": str(manifest.get("memoryRoot", root / "memory") if manifest else root / "memory"),
            "supportDirectory": str(home / "Library/Application Support/jumpyBrain Companion"),
            "launchAgent": str(home / f"Library/LaunchAgents/{LABEL}.plist"),
            "label": LABEL, "port": 3787,
        }
        original = dict(config) if existed else None
        config = dict(config, runtimeRoot=str(runtime))
        if args.memory_root is not None:
            config["memoryRoot"] = str(args.memory_root.expanduser().resolve())
        if args.port is not None:
            config["port"] = args.port
        if not config["node"] or not config["qmd"]:
            raise SafetyError("node and qmd must be installed and on PATH before installing")
        if type(config["port"]) is not int or not 1024 <= config["port"] <= 65535:
            raise SafetyError("Choose an unprivileged port (1024–65535)")
        memory = absolute(config["memoryRoot"], "memoryRoot")
        if any(overlaps(memory, target) for target in (runtime, app)):
            raise SafetyError("Memory root overlaps runtime/app; refusing installation")
        support, agent = Path(config["supportDirectory"]), Path(config["launchAgent"])
        if not args.build_only:
            regular(memory / "jumpybrain.json")
            if support.is_symlink():
                raise SafetyError(f"Refusing symlink support directory {support}")
            if not existed:
                if os.path.lexists(agent):
                    raise SafetyError(f"Refusing pre-existing LaunchAgent {agent}")
                support.mkdir(parents=True, exist_ok=True, mode=0o700)
            if not existed and not args.no_start:
                if home != Path.home().resolve():
                    raise SafetyError("Use --no-start when installing for an explicit different --home")
                with socket.socket() as sock:
                    sock.bind(("127.0.0.1", config["port"]))
        lock = nullcontext() if args.build_only else companion_lock(support, create=not existed)
        with lock:
            if existed and preflight(root, home) != original:
                raise SafetyError("Companion configuration changed while acquiring its lock; retry")
            with build_workspace() as scratch:
                built = build_app(runtime, scratch, config)
                if args.build_only:
                    output = args.output.expanduser().absolute() if args.output else Path(tempfile.mkdtemp(prefix="jumpybrain-companion-output-")) / "jumpyBrain.app"
                    if os.path.lexists(output):
                        raise SafetyError(f"Refusing to replace build output {output}")
                    shutil.copytree(built, output)
                    print(f"Built {output}; nothing installed or started.")
                    return 0
                if existed:
                    if preflight(root, home) != original:
                        raise SafetyError("Companion configuration changed during build; retry")
                else:
                    if os.path.lexists(app):
                        raise SafetyError("An app appeared during build; refusing replacement")
                    key_file = support / "api-key"
                    if not os.path.lexists(key_file):
                        fd = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                        with os.fdopen(fd, "w") as stream:
                            stream.write(secrets.token_hex(32) + "\n")
                    validate_key(support)
                install_bundle(built, app, agent, support, existed)
        print(f"Installed {app}\nMemory: {memory}\nStart at login: {'on' if agent.exists() else 'off'}")
        if not existed and not args.no_start:
            run("launchctl", "bootstrap", f"gui/{os.getuid()}", agent)
            print(f"Started. Editor: http://127.0.0.1:{config['port']}/")
        else:
            print(f"Reopen {app} when ready. Nothing was started.")
        print("No Markdown memory, remote configuration, or CLI installation was changed.")
        return 0
    except (SafetyError, OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    sys.exit(main())
