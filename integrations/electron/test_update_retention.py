import importlib.util
import json
import os
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('retention', Path(__file__).with_name('update-retention.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

class Retention(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.updates = Path(self.temp.name) / 'updates'; self.updates.mkdir()

    def stage(self, number, phase='success', journal='success', pins=True):
        directory = self.updates / ('update-' + str(number)); directory.mkdir()
        (directory / 'retention.json').write_text(json.dumps(dict(schema=1, terminal=True)))
        (directory / 'state.json').write_text(json.dumps(dict(phase=phase, pid=99999999, updatedAt=number)))
        (directory / 'transaction.json').write_text(json.dumps(dict(phase=journal)))
        runtime = directory / 'unpacked/package'; runtime.mkdir(parents=True)
        (runtime / 'protected.md').write_text('canonical fixture')
        if pins:
            (runtime / 'dist/adapters/backend-host').mkdir(parents=True)
            (runtime / 'dist/adapters/backend-host/runtime-pins.js').write_text('protocol 1 fixture')
        return directory, runtime

    def test_help_and_invalid_flags_do_no_work(self):
        script = str(Path(__file__).with_name('update-retention.py'))
        for args in [['--runtime', str(self.updates), '--help'], [str(self.updates), '--help']]:
            result = subprocess.run([sys.executable, '-B', script, *args], capture_output=True)
            self.assertEqual(result.returncode, 0)
        result = subprocess.run([sys.executable, '-B', script, str(self.updates), '--unknown'], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(self.updates.iterdir()), [])

    def test_preview_repeat_success_and_latest_rollback_are_bounded(self):
        paths = [self.stage(i)[0] for i in range(5)]
        preview = r.retain(self.updates)
        self.assertEqual(len(preview), 3); self.assertTrue(all(x['bytes'] > 0 for x in preview))
        self.assertTrue(all(x.exists() for x in paths))
        self.assertEqual(r.retain(self.updates, True), preview)
        self.assertEqual(r.retain(self.updates, True), [])
        self.assertEqual([x.exists() for x in paths], [False, False, False, True, True])

    def test_live_pins_unknown_legacy_and_interrupted_journal_are_never_removed(self):
        live, runtime = self.stage(0)
        pins = runtime / '.backend-pins'; pins.mkdir(mode=0o700)
        (pins / 'live.json').write_text(json.dumps(dict(pid=os.getpid())))
        legacy, _ = self.stage(1, pins=False)
        interrupted, _ = self.stage(2, journal='publishing')
        failed, _ = self.stage(3, phase='failed', journal='rolled-back')
        self.stage(4); self.stage(5)
        r.retain(self.updates, True)
        for directory in [live, legacy, interrupted]: self.assertTrue(directory.exists())
        self.assertFalse(failed.exists()); self.assertFalse((runtime / '.retiring').exists())
        (pins / 'live.json').write_text(json.dumps(dict(pid=99999999)))
        r.retain(self.updates, True); self.assertFalse(live.exists())

    def test_bundle_cleanup_uses_external_generation_state_and_retains_legacy_bundles(self):
        directory, cli = self.stage(0)
        bundle = directory / 'built/jumpyBrain.app/Contents/Resources/runtime'
        backend = bundle / 'dist/adapters/backend-host'; backend.mkdir(parents=True)
        protocol = backend / 'runtime-pins.js'; protocol.write_text('export const BUNDLE_PIN_PROTOCOL=1;')
        self.stage(1); self.stage(2)
        owner = bundle.stat()
        base = Path(self.temp.name) / '.jumpybrain-runtime-pins'
        state = base / f'{owner.st_dev}-{owner.st_ino}'
        pins = state / '.backend-pins'; pins.mkdir(parents=True, mode=0o700)
        base.chmod(0o700); state.chmod(0o700)
        live = pins / 'live.json'; live.write_text(json.dumps(dict(pid=os.getpid())))
        with patch.object(Path, 'home', return_value=Path(self.temp.name)):
            self.assertEqual(r.retain(self.updates, True), [])
            self.assertFalse((state / '.retiring').exists())
            self.assertFalse((cli / '.retiring').exists(), 'earlier runtime fences unwind when the bundle is live')
            live.write_text(json.dumps(dict(pid=99999999)))
            protocol.write_text('legacy fixture')
            self.assertEqual(r.retain(self.updates, True), [])
            protocol.write_text('export const BUNDLE_PIN_PROTOCOL = 1;')
            live.write_text('invalid')
            self.assertEqual(r.retain(self.updates, True), [])
            live.write_text(json.dumps(dict(pid=99999999)))
            pins.chmod(0o755)
            self.assertEqual(r.retain(self.updates, True), [])
            pins.chmod(0o700)
            self.assertEqual(len(r.retain(self.updates, True)), 1)
        self.assertFalse(directory.exists()); self.assertFalse((state / '.retiring').exists())

    def test_symlinks_foreign_entries_and_concurrent_cleanup_fail_closed(self):
        directory, runtime = self.stage(0)
        foreign = Path(self.temp.name) / 'foreign'; foreign.mkdir(); (foreign / 'keep').write_bytes(b'keep')
        (runtime / '.backend-pins').symlink_to(foreign, target_is_directory=True)
        (self.updates / 'update-link').symlink_to(foreign, target_is_directory=True)
        self.stage(1); self.stage(2)
        self.assertEqual(r.retain(self.updates, True), [])
        self.assertEqual((foreign / 'keep').read_bytes(), b'keep')
        self.assertTrue(directory.exists())
        lock = os.open(self.updates / '.retention.lock', os.O_RDWR)
        try:
            r.fcntl.flock(lock, r.fcntl.LOCK_EX | r.fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError): r.retain(self.updates, True)
        finally: os.close(lock)
        self.assertTrue(directory.exists())
        (runtime / '.backend-pins').unlink()
        with patch.object(r, 'size', side_effect=OSError('interrupted inventory')):
            self.assertEqual(r.retain(self.updates, True), [])
        self.assertFalse((runtime / '.retiring').exists())

if __name__ == '__main__': unittest.main()
