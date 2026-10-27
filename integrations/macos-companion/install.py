#!/usr/bin/env python3
"""Build/install the optional native GUI against an existing managed CLI runtime.

Never builds the CLI, bundles a runtime snapshot, or edits canonical memory.
An explicit --runtime-root is allowed only with --build-only for development.
"""
import argparse
from contextlib import contextmanager, nullcontext
import hashlib
import json
import os
from pathlib import Path
import plistlib
import platform
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import time

from lifecycle import (LABEL, SafetyError, app_path, build_workspace, cleanup, companion_lock,
                    absolute, overlaps, preflight, regular, validate_key,
                    validate_manifest, validate_runtime, read_json)


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


@contextmanager
def build_timing(stage):
    """Fixed stage names only; captured by the updater's private bounded log."""
    started = time.monotonic()
    outcome = "failed"
    try:
        yield
        outcome = "ok"
    finally:
        print("[build-timing] " + json.dumps(dict(schema=1, stage=stage,
              durationMs=round((time.monotonic() - started) * 1000), outcome=outcome)), flush=True)


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


NATIVE_BUILD_RECORD = "NativeBuild.json"


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def tree_digest(root, seen=None):
    """Hash actual SDK/toolchain bytes, names, modes and symlink destinations.

    No persistent cache or timestamp-only hits: a same-size/mtime edit must miss.
    Internal symlink targets are already covered by the tree; external targets
    are included separately. Dangling links are recorded, not silently followed.
    """
    root = root.resolve()
    if not root.is_dir():
        raise SafetyError(f"Missing native build input directory: {root}")
    seen = set() if seen is None else seen
    if root in seen:
        return "already-covered:" + str(root)
    seen.add(root)
    digest = hashlib.sha256()
    external = set()
    def walk_error(error):
        raise error

    for base, directories, files in os.walk(root, onerror=walk_error):
        directories.sort()
        for name in sorted(directories + files):
            path = Path(base) / name
            mode = path.lstat().st_mode
            entry = [str(path.relative_to(root)), mode]
            if stat.S_ISLNK(mode):
                target = path.resolve()
                entry += [os.readlink(path), str(target)]
                if root != target and root not in target.parents:
                    external.add(target)
            elif stat.S_ISREG(mode):
                entry.append(file_digest(path))
            elif not stat.S_ISDIR(mode):
                raise SafetyError(f"Unsupported native build input: {path}")
            digest.update(json.dumps(entry).encode())
    for target in sorted(external):
        value = tree_digest(target, seen) if target.is_dir() else file_digest(target) if target.is_file() else "missing"
        digest.update(json.dumps([str(target), value]).encode())
    return digest.hexdigest()


def native_fingerprint(source, compiler, sdk, options, environment):
    """Native-only inputs; runtime helpers/config/version are always refreshed."""
    inputs = {
        "schemaVersion": 1,
        "source": file_digest(regular(source)),
        "recipe": file_digest(Path(__file__)),
        "compiler": str(compiler.resolve()),
        "compilerVersion": subprocess.check_output([str(compiler), "--version"], text=True, env=environment, stderr=subprocess.STDOUT, timeout=5).strip(),
        "toolchain": tree_digest(compiler.parent.parent),
        "sdk": str(Path(sdk).resolve()), "sdkContents": tree_digest(Path(sdk)),
        "system": [platform.system(), platform.release(), platform.version(), platform.machine()],
        "options": options,
        # HOME/TMPDIR are isolated scratch paths, never semantic build inputs.
        "environment": {k: v for k, v in environment.items() if k not in ("HOME", "TMPDIR")},
    }
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()


def reuse_native(previous_app, executable, fingerprint, *, field="fingerprint"):
    """Copy/validate only; any absent, corrupt or unverifiable record is a miss.

    Strip signatures only on the scratch copy. The digest describes unsigned
    code, avoiding a circular digest inside the newly signed bundle's resources.
    """
    if previous_app is None or fingerprint is None:
        return False
    try:
        record = read_json(previous_app / "Contents/Resources" / NATIVE_BUILD_RECORD)
        if (record.get("schemaVersion") != 1 or record.get(field) != fingerprint
                or not isinstance(record.get("executableDigest"), str)):
            return False
        regular(previous_app / "Contents/MacOS/jumpyBrain")
        run("codesign", "--verify", "--strict", previous_app, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.copy2(previous_app / "Contents/MacOS/jumpyBrain", executable)
        run("codesign", "--remove-signature", executable, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if file_digest(executable) != record["executableDigest"] or not os.access(executable, os.X_OK):
            raise SafetyError("Cached native executable digest/mode mismatch")
        print("Reusing unchanged native companion executable (verified build inputs).", flush=True)
        return True
    except (SafetyError, OSError, ValueError, subprocess.CalledProcessError):
        if executable.exists():
            executable.unlink()
        return False


def build_app(runtime, build, config, previous_app=None, *, reuse_artifact=False):
    """Build only native assets in caller-owned scratch space; config targets final runtime."""
    package = validate_runtime(runtime)
    source = runtime / "integrations/macos-companion"
    # Keep stable Homebrew symlink paths, not version-specific Cellar targets.
    with build_timing("native-prerequisites"):
        run(config["node"], "--version", stdout=subprocess.DEVNULL)
        run(config["node"], runtime / "scripts/qmd-install-check.mjs", config["qmd"])
    if not shutil.which("codesign"):
        raise SafetyError("codesign must be installed before building the companion")
    config = dict(config, revision=package["version"])
    built_app = build / "jumpyBrain.app"
    macos = built_app / "Contents/MacOS"
    resources = built_app / "Contents/Resources"
    macos.mkdir(parents=True)
    resources.mkdir()
    native_source = build / "Companion.swift"
    shutil.copy2(regular(source / "Companion.swift"), native_source)
    executable = macos / "jumpyBrain"
    artifact_fingerprint = None
    if reuse_artifact:
        # An already working signed binary needs no compiler/SDK revalidation.
        # Source, recipe and target architecture govern reuse, like a distributed
        # native artifact. Toolchain updates alone do not require recompilation.
        artifact_fingerprint = hashlib.sha256(json.dumps({
            "schema": 1, "source": file_digest(native_source),
            "recipe": file_digest(Path(__file__)), "architecture": platform.machine(),
        }, sort_keys=True).encode()).hexdigest()
    with build_timing("native-reuse-verify"):
        artifact_reused = reuse_native(previous_app, executable, artifact_fingerprint, field="artifactFingerprint")
    if artifact_reused:
        record = read_json(previous_app / "Contents/Resources" / NATIVE_BUILD_RECORD)
        (resources / NATIVE_BUILD_RECORD).write_text(json.dumps(record, indent=2) + "\n")
    else:
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
        options = ["-swift-version", "5", "-O", "-sdk", sdk, "-target", f"{platform.machine()}-apple-macos13.0",
                   "-framework", "AppKit", "-framework", "Security", "-framework", "LocalAuthentication"]
        # Make compiler inputs explicit rather than trusting arbitrary shell flags.
        environment = {"PATH": f"{compiler.parent}:/usr/bin:/bin:/usr/sbin:/sbin", "LANG": "C",
                       "HOME": str(build), "TMPDIR": str(build)}
        for key in ("DEVELOPER_DIR", "TOOLCHAINS"):
            if key in os.environ:
                environment[key] = os.environ[key]
        # Compile a snapshot, not a source that can change underneath this build.
        fingerprint = None
        if not reuse_artifact:
            try:
                print("Checking native companion build inputs…", flush=True)
                fingerprint = native_fingerprint(native_source, compiler, sdk,
                                                 options + ["duplicateBridgingOverlay=" + str(bool(compiler_options))], environment)
            except (SafetyError, OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
                print(f"Native build inputs could not be verified; rebuilding without reuse: {error}", flush=True)
        reused = reuse_native(previous_app, executable, fingerprint)
        if not reused:
            print("Compiling native companion (Swift; a fresh module cache can take a while)…", flush=True)
            with build_timing("native-compile"):
                run(compiler, *options, "-module-cache-path", build / "module-cache", *compiler_options,
                    native_source, "-o", executable, env=environment)
            # Normalize codesign's Mach-O allocation before recording unsigned bytes.
            # The linker signature has a different __LINKEDIT allocation; simply
            # removing it would make the first subsequent bundle sign a false miss.
            with build_timing("native-normalize-signature"):
                run("codesign", "--force", "--sign", "-", executable)
                run("codesign", "--remove-signature", executable)
            if fingerprint is not None:
                try:
                    confirmed = native_fingerprint(native_source, compiler, sdk,
                                                   options + ["duplicateBridgingOverlay=" + str(bool(compiler_options))], environment)
                    if confirmed != fingerprint:
                        fingerprint = None
                        print("Native build inputs changed during compilation; not recording a reuse hit.", flush=True)
                except (SafetyError, OSError, ValueError, RuntimeError, subprocess.SubprocessError):
                    fingerprint = None
        if fingerprint is not None or artifact_fingerprint is not None:
            (resources / NATIVE_BUILD_RECORD).write_text(json.dumps({
                "schemaVersion": 1, "fingerprint": fingerprint, "artifactFingerprint": artifact_fingerprint,
                "executableDigest": file_digest(executable),
            }, indent=2) + "\n")
    for helper in ("menu-update.mjs", "update-check.mjs"):
        shutil.copy2(source / helper, resources / helper)
    icon = source / "MenuBarBrain.png"
    if icon.is_file():
        shutil.copy2(regular(icon), resources / "MenuBarBrain.png")
    (resources / "Configuration.json").write_text(json.dumps(config, indent=2) + "\n")
    info = {
        "CFBundleExecutable": "jumpyBrain", "CFBundleIdentifier": LABEL,
        "CFBundleName": "jumpyBrain", "CFBundleDisplayName": "jumpyBrain",
        "CFBundlePackageType": "APPL", "CFBundleVersion": "1",
        "CFBundleShortVersionString": package["version"], "LSUIElement": True,
        "LSMinimumSystemVersion": "13.0", "NSHighResolutionCapable": True,
    }
    (built_app / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
    with build_timing("native-sign"):
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
            raise SafetyError("node and @tobilu/qmd@2.8.3 (CLI + SDK) must be installed and on PATH before installing")
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
                built = build_app(runtime, scratch, config, previous_app=app if existed else None)
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
                    # Private loopback CONTROL token only; remote keys live in Keychain.
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
