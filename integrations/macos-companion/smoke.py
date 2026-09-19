#!/usr/bin/env python3
"""Exercise the native app against disposable memory, never the user's notes."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
BUILT = HERE / ".build/jumpyBrain.app"
KEY = "a" * 64


def wait_for(check, description, seconds=15):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.15)
    raise AssertionError(f"Timed out: {description}")


def request(port, path, auth=False, data=None):
    headers = {"Authorization": f"Bearer {KEY}"} if auth else {}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", headers=headers,
                                 data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=2) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def port_free(port):
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


def main():
    assert BUILT.exists(), "Run install.py --build-only first"
    with tempfile.TemporaryDirectory(prefix="jumpybrain-companion-smoke-") as tmp:
        root = Path(tmp)
        app = root / "jumpyBrain.app"
        shutil.copytree(BUILT, app)
        resources = app / "Contents/Resources"
        config = json.loads((resources / "Configuration.json").read_text())
        node = config["node"]
        cli = resources / "runtime/dist/cli.js"
        memory = root / "memory"
        support = root / "support"
        support.mkdir(mode=0o700)
        (support / "api-key").write_text(KEY + "\n")
        (support / "api-key").chmod(0o600)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        config.update(memoryRoot=str(memory), supportDirectory=str(support),
                      launchAgent=str(root / "test-agent.plist"), port=port)
        (resources / "Configuration.json").write_text(json.dumps(config))
        subprocess.run(["codesign", "--force", "--sign", "-", str(app)], check=True, capture_output=True)
        env = {**os.environ, "JUMPYBRAIN_QMD_BIN": config["qmd"]}
        subprocess.run([node, str(cli), "init", "--root", str(memory)], check=True, capture_output=True, env=env)
        subprocess.run([node, str(cli), "remember", "--root", str(memory), "--type", "note", "--title", "Companion fixture"],
                       input="CompanionFixture test body.\n", text=True, check=True, capture_output=True, env=env)
        subprocess.run([node, str(cli), "index", "--root", str(memory)], check=True, capture_output=True, env=env)
        before = {str(p.relative_to(memory)): p.read_bytes() for p in memory.rglob("*.md")}
        executable = str(app / "Contents/MacOS/jumpyBrain")
        children = []
        native_log = (root / "native.log").open("w")

        def start():
            child = subprocess.Popen([executable], stdout=native_log, stderr=native_log)
            children.append(child)
            return child

        def running():
            return (support / "server.log").exists() and "Running · Local memory" in (support / "server.log").read_text()

        try:
            child = start()
            wait_for(lambda: request(port, "/health")[0] == 200, "server health")
            wait_for(running, "native menu healthy state")
            assert request(port, "/")[0] == 200
            assert b"note-editor" in request(port, "/")[1]
            assert request(port, "/graph")[0] == 200
            assert request(port, "/memories/all/status")[0] == 401
            assert request(port, "/memories/all/status", True)[0] == 200
            code, body = request(port, "/memories/all/search", True, {"query": "CompanionFixture", "limit": 5})
            assert code == 200 and b"Companion fixture" in body, (code, body)
            print("PASS: native app + bundled server, home/graph, auth, real indexed search")

            duplicate = start()
            assert duplicate.wait(timeout=5) == 0
            assert child.poll() is None and request(port, "/health")[0] == 200
            print("PASS: duplicate app cannot take over or stop the existing server")

            child.terminate()
            assert child.wait(timeout=12) == 0
            wait_for(lambda: port_free(port), "graceful quit releases port")
            print("PASS: graceful shutdown cleans up the owned server")

            # An unrelated listener is neither killed nor adopted.
            with socket.socket() as busy:
                busy.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                busy.bind(("127.0.0.1", port))
                busy.listen()
                conflict = start()
                wait_for(lambda: "is busy" in (support / "server.log").read_text(), "port-conflict menu state")
                assert conflict.poll() is None
                conflict.terminate()
                assert conflict.wait(timeout=5) == 0
                assert busy.getsockname()[1] == port
            print("PASS: occupied port is reported; unrelated listener survives")

            crashed = start()
            wait_for(lambda: request(port, "/health")[0] == 200, "server after relaunch")
            crashed.kill()
            crashed.wait(timeout=5)
            wait_for(lambda: port_free(port), "orphan watchdog releases port", seconds=10)
            print("PASS: app crash does not leave an orphan server")
            after = {str(p.relative_to(memory)): p.read_bytes() for p in memory.rglob("*.md")}
            assert before == after
            print("PASS: canonical Markdown unchanged throughout lifecycle tests")
        finally:
            if any(child.poll() is None for child in children):
                print("Lifecycle diagnostic:\n" + (support / "server.log").read_text())
                print("Native diagnostic:\n" + (root / "native.log").read_text())
                subprocess.run(["ps", "-o", "pid,ppid,state,command", "-p", ",".join(str(c.pid) for c in children)])
            for child in children:
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=12)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait()
            native_log.close()


if __name__ == "__main__":
    main()
