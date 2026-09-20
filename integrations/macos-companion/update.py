#!/usr/bin/env python3
"""Read-only companion preflight and locked runtime/native-bundle update.

--detect exits 0 for a matching app, 3 for absent/unrelated ownership, 1 for
ambiguous/corrupt configuration. --check additionally validates the managed
runtime, credentials and existing singleton lock without creating any paths.
"""
import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import plistlib
import shutil
import stat
import subprocess
import sys
import tempfile

LABEL = "local.jumpybrain.companion"
QUIT_MESSAGE = 'Wait for “Saved” in Chrome, then Quit jumpyBrain from its menu-bar icon and retry. The updater never quits it for you.'


class SafetyError(RuntimeError):
    pass


class NotOwned(SafetyError):
    pass


def absolute(value, name):
    if not isinstance(value, str) or not value or not Path(value).is_absolute():
        raise SafetyError(f"{name} must be an absolute path")
    return Path(os.path.abspath(value))


def regular(path):
    if path.is_symlink() or not path.is_file():
        raise SafetyError(f"Expected a regular, non-symlink file: {path}")
    return path


def read_json(path):
    try:
        value = json.loads(regular(path).read_text())
    except (OSError, ValueError) as error:
        raise SafetyError(f"Cannot safely read {path}: {error}") from error
    if not isinstance(value, dict):
        raise SafetyError(f"Expected an object in {path}")
    return value


def app_path(home):
    return home / "Applications/jumpyBrain.app"


def validate_runtime(runtime, require_companion_source=True):
    if runtime.is_symlink() or not runtime.is_dir():
        raise SafetyError(f"Runtime must be a real directory: {runtime}")
    regular(runtime / "dist/cli.js")
    package = read_json(runtime / "package.json")
    if package.get("name") != "jumpybrain" or not isinstance(package.get("version"), str) or not package["version"]:
        raise SafetyError(f"Not a compiled jumpybrain runtime: {runtime}")
    if require_companion_source:
        source = runtime / "integrations/macos-companion"
        regular(source / "Companion.swift")
        regular(source / "server-bootstrap.mjs")
    return package


def validate_manifest(install_root):
    manifest = read_json(install_root / "install-manifest.json")
    if manifest.get("installer") != "jumpybrain-installer" or (type(manifest.get("version")) is not int or manifest["version"] != 1):
        raise SafetyError("Refusing an unowned or unsupported install-manifest.json")
    expected = {"installRoot": install_root, "appDir": install_root / "app",
                "binDir": install_root / "bin", "cliPath": install_root / "bin/jumpybrain"}
    if "cliConfigPath" in manifest:
        expected["cliConfigPath"] = install_root / "cli-config.json"
    for key, path in expected.items():
        if absolute(manifest.get(key), f"manifest {key}") != path:
            raise SafetyError(f"Manifest {key} does not match {path}; refusing replacement")
    # A managed CLI installed before the companion existed is still a valid
    # migration source. Only the new staged runtime must contain native sources.
    validate_runtime(install_root / "app", require_companion_source=False)
    return manifest


def overlaps(left, right):
    left, right = left.resolve(), right.resolve()
    return left == right or left in right.parents or right in left.parents


def inspect_companion(install_root, home):
    """Read-only ownership detection. A custom root never claims a legacy app."""
    app = app_path(home)
    if not os.path.lexists(app):
        raise NotOwned(f"No companion at {app}")
    if app.is_symlink() or not app.is_dir():
        raise SafetyError(f"Refusing non-directory/symlink companion {app}")
    try:
        info = plistlib.loads(regular(app / "Contents/Info.plist").read_bytes())
    except (OSError, ValueError, plistlib.InvalidFileException) as error:
        raise SafetyError(f"Cannot validate companion bundle: {error}") from error
    if not isinstance(info, dict) or info.get("CFBundleIdentifier") != LABEL:
        raise NotOwned(f"Unrelated app at {app}")
    config = read_json(app / "Contents/Resources/Configuration.json")
    # A valid explicit runtime binding takes precedence over all legacy heuristics.
    if "runtimeRoot" in config:
        runtime = absolute(config["runtimeRoot"], "runtimeRoot")
        if runtime != install_root / "app":
            raise NotOwned(f"Companion belongs to a different runtime: {runtime}")
    else:
        if install_root != home / ".jumpybrain":
            raise NotOwned("Legacy companion migration is only allowed for the default ~/.jumpybrain install")
        snapshot = app / "Contents/Resources/runtime"
        regular(snapshot / "dist/cli.js")
        if read_json(snapshot / "package.json").get("name") != "jumpybrain":
            raise SafetyError("Legacy companion snapshot is not a jumpybrain runtime")
    if config.get("label") != LABEL or info.get("CFBundleExecutable") != "jumpyBrain":
        raise SafetyError("Companion bundle/config ownership is ambiguous")
    regular(app / "Contents/MacOS/jumpyBrain")
    for key in ("node", "qmd", "memoryRoot", "supportDirectory", "launchAgent"):
        absolute(config.get(key), key)
    if type(config.get("port")) is not int or not 1024 <= config["port"] <= 65535:
        raise SafetyError("Companion port must be an integer between 1024 and 65535")
    if not isinstance(config.get("revision"), str):
        raise SafetyError("Companion revision is missing or invalid")
    for key in ("memoryRoot", "supportDirectory", "launchAgent"):
        if any(overlaps(Path(config[key]), target) for target in (app, install_root / "app")):
            raise SafetyError(f"Companion {key} overlaps a replacement path; refusing update")
    support = Path(config["supportDirectory"])
    if support.is_symlink():
        raise SafetyError(f"Refusing symlink support directory: {support}")
    agent = Path(config["launchAgent"])
    if os.path.lexists(agent):
        try:
            job = plistlib.loads(regular(agent).read_bytes())
        except (OSError, ValueError, plistlib.InvalidFileException) as error:
            raise SafetyError(f"Cannot validate LaunchAgent {agent}: {error}") from error
        if not isinstance(job, dict) or job.get("Label") != LABEL or job.get("ProgramArguments") != [str(app / "Contents/MacOS/jumpyBrain")]:
            raise SafetyError(f"Refusing unrelated LaunchAgent {agent}")
    return config


def validate_key(support):
    key_file = regular(support / "api-key")
    key = key_file.read_text().strip()
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        raise SafetyError(f"Invalid existing key at {key_file}; refusing to overwrite it")


@contextmanager
def companion_lock(support, create=False):
    """Never unlink/replace the lock inode, including on failures or fresh installs."""
    path = support / "companion.lock"
    flags = os.O_RDWR if create else os.O_RDONLY
    flags |= os.O_CLOEXEC | os.O_NOFOLLOW
    if create:
        flags |= os.O_CREAT
    try:
        fd = os.open(path, flags, 0o600)
    except FileNotFoundError as error:
        raise SafetyError(f"Missing existing companion lock: {path}. Cannot prove the app is stopped; {QUIT_MESSAGE} If already stopped, launch it once and Quit to restore its lock.") from error
    except OSError as error:
        raise SafetyError(f"Cannot safely open companion lock {path}: {error}") from error
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1:
            raise SafetyError(f"Companion lock is not an exclusive regular file: {path}")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise SafetyError(QUIT_MESSAGE) from error
        current = os.stat(path, follow_symlinks=False)
        if (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino):
            raise SafetyError("Companion lock changed while acquiring it; retry after quitting")
        yield
    finally:
        os.close(fd)


def preflight(install_root, home):
    config = inspect_companion(install_root, home)
    validate_manifest(install_root)
    validate_key(Path(config["supportDirectory"]))
    return config


def cleanup(path):
    try:
        shutil.rmtree(path)
    except OSError as error:
        # Replacement is committed. Cleanup failures must not masquerade as rollback.
        print(f"Warning: could not remove transaction residue {path}: {error}", file=sys.stderr)


@contextmanager
def build_workspace():
    scratch = Path(tempfile.mkdtemp(prefix="jumpybrain-companion-build-"))
    try:
        yield scratch
    finally:
        cleanup(scratch)


def replace_pair(staged_runtime, built_app, install_root, home):
    """Caller holds singleton lock. Prepare same-volume GUI before any rename.

    Undo each successful rename in reverse order on any catchable failure. Backup
    containers are deliberately retained if rollback itself fails.
    """
    runtime, app = install_root / "app", app_path(home)
    runtime_backup = Path(tempfile.mkdtemp(prefix=".companion-runtime-", dir=install_root))
    gui_transaction = None
    moves = []
    try:
        gui_transaction = Path(tempfile.mkdtemp(prefix=".companion-app-", dir=app.parent))
        pending = gui_transaction / "new.app"
        shutil.copytree(built_app, pending)
        for source, target in ((runtime, runtime_backup / "old"), (staged_runtime, runtime),
                               (app, gui_transaction / "old.app"), (pending, app)):
            os.rename(source, target)
            moves.append((source, target))
    except BaseException as error:
        failures = []
        for source, target in reversed(moves):
            try:
                os.rename(target, source)
            except OSError as rollback_error:
                failures.append(str(rollback_error))
                # Earlier reverse renames may overwrite this unrecovered version.
                break
        if failures:
            raise SafetyError(f"Update failed ({error}); rollback needs manual recovery. Preserve {runtime_backup} and {gui_transaction}. {'; '.join(failures)}") from error
        cleanup(runtime_backup)
        if gui_transaction is not None:
            cleanup(gui_transaction)
        raise
    cleanup(runtime_backup)
    cleanup(gui_transaction)


def commit(staging, install_root, home):
    config = preflight(install_root, home)
    staging = Path(os.path.abspath(staging))
    if staging.is_symlink() or overlaps(staging, install_root / "app") or overlaps(staging, app_path(home)):
        raise SafetyError("Staged runtime must be a separate, non-symlink directory")
    for key in ("memoryRoot", "supportDirectory", "launchAgent"):
        if overlaps(staging, Path(config[key])):
            raise SafetyError(f"Staged runtime overlaps preserved {key}")
    validate_runtime(staging)
    if staging.stat().st_dev != install_root.stat().st_dev:
        raise SafetyError("Stage the runtime on the same filesystem as --install-root for atomic renames")
    with companion_lock(Path(config["supportDirectory"])):
        if preflight(install_root, home) != config:
            raise SafetyError("Companion configuration changed during preflight; retry")
        # Import only after validation; build source comes exclusively from staging.
        from install import build_app
        updated = dict(config, runtimeRoot=str(install_root / "app"))
        with build_workspace() as scratch:
            built = build_app(staging, scratch, updated)
            if preflight(install_root, home) != config:
                raise SafetyError("Companion configuration changed during build; retry")
            replace_pair(staging, built, install_root, home)
    print(f"Updated runtime and companion. Reopen {app_path(home)} when ready. Nothing was started.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--detect", action="store_true")
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--staged-runtime", type=Path)
    parser.add_argument("--install-root", type=Path)
    parser.add_argument("--home", type=Path, default=Path.home())
    args = parser.parse_args()
    home = args.home.expanduser().resolve()
    root = (args.install_root.expanduser() if args.install_root else home / ".jumpybrain").resolve()
    try:
        if args.detect:
            inspect_companion(root, home)
            print("Matching jumpyBrain companion")
        elif args.check:
            config = preflight(root, home)
            with companion_lock(Path(config["supportDirectory"])):
                pass
            print("Companion eligible for update; nothing changed")
        else:
            if sys.platform != "darwin":
                raise SafetyError("Native companion updates require macOS and Xcode command-line tools")
            commit(args.staged_runtime, root, home)
    except NotOwned as error:
        print(str(error), file=sys.stderr)
        return 3 if args.detect else 1
    except (SafetyError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
