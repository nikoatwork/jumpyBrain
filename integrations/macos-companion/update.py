#!/usr/bin/env python3
"""Read-only companion preflight and locked runtime/native-bundle update.

--detect exits 0 for a matching app, 3 for absent/unrelated ownership, 1 for
ambiguous/corrupt configuration. --check additionally validates the managed
runtime, credentials and existing singleton lock without creating any paths.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from lifecycle import (LABEL, QUIT_MESSAGE, SafetyError, NotOwned, absolute,
                       regular, read_json, app_path, validate_runtime, validate_manifest,
                       overlaps, inspect_companion, validate_key, companion_lock,
                       preflight, cleanup, build_workspace)


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
            built = build_app(staging, scratch, updated, previous_app=app_path(home))
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
