"""Import-safe native ownership, validation, locks and scratch lifecycle.

Ownership inspection is independent of runtime/key health; callers choose
whether a healthy runtime is needed for the requested operation.
"""
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import plistlib
import shutil
import stat
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
        for helper in ("Companion.swift", "gateway.mjs", "connections.mjs", "switch-coordinator.mjs",
                       "menu-update.mjs", "update-check.mjs", "install.py", "update.py", "uninstall.py", "lifecycle.py"):
            regular(source / helper)
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


