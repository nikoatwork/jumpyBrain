#!/usr/bin/env python3
"""Remove only the optional companion app/login item, never Markdown or the CLI."""
import fcntl
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

LABEL = "local.jumpybrain.companion"
home = Path.home()
app = home / "Applications/jumpyBrain.app"
agent = home / f"Library/LaunchAgents/{LABEL}.plist"
support = home / "Library/Application Support/jumpyBrain Companion"

if app.exists():
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    if info.get("CFBundleIdentifier") != LABEL:
        raise SystemExit(f"Refusing to remove unrelated app: {app}")
if agent.exists() and plistlib.loads(agent.read_bytes()).get("Label") != LABEL:
    raise SystemExit(f"Refusing to remove unrelated LaunchAgent: {agent}")
lock = None
if support.exists():
    lock = (support / "companion.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("Wait for Saved in Chrome, then Quit jumpyBrain from the menu bar and retry.")
subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"],
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
agent.unlink(missing_ok=True)
if app.exists():
    shutil.rmtree(app)
print("Removed the companion app and login item. Markdown, indexes, and the installed CLI are untouched.")
print(f"Preserved local key/logs in {support}; remove that folder manually if no longer wanted.")
