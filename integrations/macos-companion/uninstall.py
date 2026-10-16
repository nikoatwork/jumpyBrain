#!/usr/bin/env python3
"""Remove an owned, stopped companion app/login item, preserving all user data."""
import argparse
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys

from lifecycle import LABEL, SafetyError, app_path, companion_lock, inspect_companion


def owned_loaded_job(app, agent):
    """launchctl's diagnostic format is not an ownership API: reject ambiguity.

    Only explicit service absence or exact top-level origin/program fields are
    accepted. Unknown command failures and changed output formats fail closed.
    """
    target = f"gui/{os.getuid()}/{LABEL}"
    result = subprocess.run(["launchctl", "print", target], capture_output=True, text=True,
                            env={**os.environ, "LC_ALL": "C"})
    if result.returncode:
        if (result.returncode == 113 and "Could not find service" in result.stderr
                and f'"{LABEL}"' in result.stderr):
            return None
        raise SafetyError("Cannot prove the loaded companion job's ownership; launchctl inspection failed")
    def field(name):
        return re.findall(r"^\t" + re.escape(name) + r" = (.*)$", result.stdout, re.MULTILINE)
    if (field("path") != [str(agent)] or field("program") != [str(app / "Contents/MacOS/jumpyBrain")]
            or field("type") != ["LaunchAgent"]):
        raise SafetyError("Refusing an unrelated or ambiguous loaded LaunchAgent")
    return target


def remove_companion(install_root, home):
    # Ownership only: a broken CLI/key must not prevent removing an owned app.
    config = inspect_companion(install_root, home)
    support = Path(config["supportDirectory"])
    with companion_lock(support):
        if inspect_companion(install_root, home) != config:
            raise SafetyError("Companion configuration changed during preflight; retry")
        app = app_path(home)
        agent = Path(config["launchAgent"])
        loaded = owned_loaded_job(app, agent)
        if loaded:
            result = subprocess.run(["launchctl", "bootout", loaded],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode:
                raise SafetyError("Could not unload the owned companion job; nothing was removed")
        agent.unlink(missing_ok=True)
        shutil.rmtree(app)
    return support


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path.home())
    parser.add_argument("--install-root", type=Path)
    args = parser.parse_args()
    home = args.home.expanduser().resolve()
    root = (args.install_root.expanduser() if args.install_root else home / ".jumpybrain").resolve()
    try:
        support = remove_companion(root, home)
    except (SafetyError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print("Removed the companion app and login item. Markdown, indexes, and the installed CLI are untouched.")
    print(f"Preserved local key/logs in {support}; remove that folder manually if no longer wanted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
