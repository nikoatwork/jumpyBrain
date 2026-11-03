"""Optional release-native bytes; selection never replaces staging sign/readiness checks."""
import base64
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

MAX_ARTIFACT_BYTES = 4 * 1024 * 1024
ARCHITECTURES = {"arm64": "arm64", "x64": "x86_64", "x86_64": "x86_64"}


def artifact_fingerprint(source, architecture, recipe):
    inputs = {"schema": 2, "architecture": architecture,
              "source": hashlib.sha256((source / "Companion.swift").read_bytes()).hexdigest(),
              "recipe": hashlib.sha256(Path(recipe).read_bytes()).hexdigest(),
              "artifactLoader": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()


def load_native_artifact(artifact, executable, fingerprint, architecture, version):
    """A miss retains source-build fallback; only caller-owned scratch bytes change."""
    if not artifact:
        return None
    copied = False
    accepted = False
    try:
        artifact = Path(artifact)
        info = artifact.lstat()
        if not artifact.is_absolute() or not stat.S_ISREG(info.st_mode) or info.st_size > MAX_ARTIFACT_BYTES:
            return None
        record = json.loads(artifact.read_text())
        if (set(record) != {"schemaVersion", "version", "architecture", "artifactFingerprint", "executableDigest", "executableBase64"}
                or record["schemaVersion"] != 1 or record["version"] != version
                or record["architecture"] != architecture or record["artifactFingerprint"] != fingerprint):
            return None
        code = base64.b64decode(record["executableBase64"], validate=True)
        if (not 0 < len(code) <= 2 * 1024 * 1024 or code[:4] != b"\xcf\xfa\xed\xfe"
                or hashlib.sha256(code).hexdigest() != record["executableDigest"]):
            return None
        executable.write_bytes(code)
        executable.chmod(0o755)
        copied = True
        subprocess.run(["/usr/bin/lipo", str(executable), "-verify_arch", architecture], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        accepted = True
        return {"schemaVersion": 1, "fingerprint": None, "artifactFingerprint": fingerprint,
                "executableDigest": record["executableDigest"]}
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
        return None
    finally:
        # Failed validation must not leave a candidate mistaken for compiled code.
        if copied and not accepted and executable.exists():
            executable.unlink()
