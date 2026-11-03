"""Disposable release-native validation, no compiler, user app or memory."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import native_artifacts as native


class NativeArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        (self.source / 'Companion.swift').write_text('// native source')
        self.recipe = self.root / 'recipe.py'
        self.recipe.write_text('# build recipe')
        self.fingerprint = native.artifact_fingerprint(self.source, 'arm64', self.recipe)
        self.code = b'\xcf\xfa\xed\xfe' + b'fixture code'
        self.record = dict(schemaVersion=1, version='0.3.19', architecture='arm64',
                           artifactFingerprint=self.fingerprint, executableDigest=hashlib.sha256(self.code).hexdigest(),
                           executableBase64=base64.b64encode(self.code).decode())
        self.artifact = self.root / 'native.json'
        self.executable = self.root / 'helper'

    def load(self, change=None):
        self.artifact.write_text(json.dumps(dict(self.record, **(change or {}))))
        return native.load_native_artifact(self.artifact, self.executable, self.fingerprint, 'arm64', '0.3.19')

    def test_valid_bytes_require_architecture_check_and_return_unsigned_reuse_identity(self):
        with patch.object(native.subprocess, 'run') as run:
            result = self.load()
        self.assertEqual(self.executable.read_bytes(), self.code)
        self.assertEqual(self.executable.stat().st_mode & 0o777, 0o755)
        self.assertEqual(result['artifactFingerprint'], self.fingerprint)
        run.assert_called_once()
        self.assertEqual(run.call_args.args[0], ['/usr/bin/lipo', str(self.executable), '-verify_arch', 'arm64'])

    def test_mismatched_or_corrupt_records_are_misses_without_code_publication(self):
        for change in [dict(version='0.3.18'), dict(architecture='x86_64'), dict(artifactFingerprint='wrong'),
                       dict(executableDigest='0'*64), dict(executableBase64='invalid!'), dict(extra=True)]:
            with self.subTest(change=change), patch.object(native.subprocess, 'run') as run:
                self.assertIsNone(self.load(change))
                self.assertFalse(self.executable.exists())
                run.assert_not_called()

    def test_wrong_macho_architecture_removes_only_scratch_candidate(self):
        with patch.object(native.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'lipo')):
            self.assertIsNone(self.load())
        self.assertFalse(self.executable.exists())
        self.assertTrue(self.artifact.exists())

    def test_inputs_bind_source_recipe_and_architecture(self):
        self.assertNotEqual(native.artifact_fingerprint(self.source, 'x86_64', self.recipe), self.fingerprint)
        self.recipe.write_text('# changed recipe')
        self.assertNotEqual(native.artifact_fingerprint(self.source, 'arm64', self.recipe), self.fingerprint)
        self.recipe.write_text('# build recipe')
        (self.source / 'Companion.swift').write_text('// changed native source')
        self.assertNotEqual(native.artifact_fingerprint(self.source, 'arm64', self.recipe), self.fingerprint)

    def test_symlink_and_oversized_artifacts_are_not_read_as_native_code(self):
        self.artifact.symlink_to(self.root / 'missing')
        self.assertIsNone(native.load_native_artifact(self.artifact, self.executable, self.fingerprint, 'arm64', '0.3.19'))
        self.artifact.unlink()
        with self.artifact.open('wb') as stream:
            stream.truncate(native.MAX_ARTIFACT_BYTES + 1)
        self.assertIsNone(native.load_native_artifact(self.artifact, self.executable, self.fingerprint, 'arm64', '0.3.19'))


if __name__ == '__main__':
    unittest.main()
