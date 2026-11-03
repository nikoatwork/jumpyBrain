"""Cheap repeated software cycles and adversarial ownership fixtures; no user home."""
from contextlib import redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('software_retention', Path(__file__).with_name('installation-retention.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)


class SoftwareRetention(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.root = self.home / '.jumpybrain'; self.root.mkdir()
        self.store = r.Store(self.root, self.home)
        self.memory = self.home / 'brain'; self.memory.mkdir()
        (self.memory / 'keep.md').write_bytes(b'canonical\x00fixture\n')
        (self.root / 'install-manifest.json').write_text(json.dumps(dict(memoryRoot=str(self.memory))))

    def runtime(self, file):
        backend = file / 'dist/adapters/backend-host'; backend.mkdir(parents=True)
        (backend / 'runtime-pins.js').write_text('export const BUNDLE_PIN_PROTOCOL = 1;')
        (file / 'package.json').write_text('{"name":"jumpybrain","version":"0.3.19"}')
        (file / 'dist/cli.js').write_text('console.log("0.3.19")')
        (file / 'payload').write_bytes(b'x' * 16384)
        return file

    def generation(self, producer='source-cli', number=0, components=('cli',), terminal=True):
        base, prefix = {
            'source-cli': (self.root, 'app.previous-'),
            'updater': (self.home / 'Library/Application Support/jumpyBrain Updates', 'update-'),
            'dogfood': (self.root / 'dogfood', 'candidate-'),
        }[producer]
        base.mkdir(parents=True, exist_ok=True)
        directory = base / (prefix + str(number)); directory.mkdir()
        relative = 'app' if producer == 'source-cli' else 'unpacked/package'
        runtime = self.runtime(directory / relative)
        with self.store.locked():
            key = self.store.begin(producer, [self.store.payload(directory, runtimes=[relative])], components)
            if terminal: self.store.finish(key)
        return key, directory, runtime

    def apply(self):
        with self.store.locked(): return self.store.cleanup(True)

    def test_twenty_cycles_for_each_producer_and_mixed_entry_points_plateau(self):
        measurements = {}
        for producer in ['source-cli', 'updater', 'dogfood', 'mixed']:
            sizes = []
            for i in range(20):
                actual = ['source-cli', 'updater', 'dogfood'][i % 3] if producer == 'mixed' else producer
                self.generation(actual, f'{producer}-{i}', ('cli', 'desktop'))
                report = self.apply()
                self.assertEqual(len(self.store.load()['records']), 1)
                self.assertEqual(len(set(report['rollback'].values())), 1)
                sizes.append(report['ownedLogicalBytes'])
            if producer == 'mixed': self.assertEqual(sizes[3:], sizes[:-3], (producer, sizes))
            else: self.assertEqual(len(set(sizes[2:])), 1, (producer, sizes))
            # A separate unpruned control measures the same 20 synthetic trees.
            for i in range(20):
                actual = ['source-cli', 'updater', 'dogfood'][i % 3] if producer == 'mixed' else producer
                self.generation(actual, f'control-{producer}-{i}', ('cli', 'desktop'))
                if i == 0: self.apply()
            before = self.store.cleanup()['ownedLogicalBytes']
            self.assertEqual(len(self.store.load()['records']), 20)
            after = self.apply()['ownedLogicalBytes']
            self.assertEqual(len(self.store.load()['records']), 1)
            measurements[producer] = dict(cycles=20, retainedGenerations=1, logicalBytes=after, unprunedControlBytes=before)
        self.assertLessEqual(len(self.store.load()['history']), r.HISTORY)
        self.assertEqual((self.memory / 'keep.md').read_bytes(), b'canonical\x00fixture\n')
        print('Repeated software fixture:', json.dumps(measurements, sort_keys=True))

    def test_live_runtime_then_lifecycle_retry_reclaims_previous_deferral(self):
        _, old, runtime = self.generation(number=0)
        pins = runtime / '.backend-pins'; pins.mkdir(mode=0o700)
        pin = pins / 'live.json'; pin.write_text(json.dumps(dict(pid=os.getpid())))
        for i in range(1, 5): self.generation(number=i); self.apply()
        self.assertTrue(old.exists()); self.assertEqual((runtime / 'payload').read_bytes(), b'x' * 16384)
        self.assertIn('Live runtime pin', [e['reason'] for e in self.store.cleanup()['entries']])
        pin.write_text(json.dumps(dict(pid=99999999)))
        report = self.apply()
        self.assertFalse(old.exists()); self.assertTrue(any(e['path'] == str(old) for e in report['removed']))
        self.assertEqual(len(self.store.load()['records']), 1)

    def test_preview_does_not_write_any_file_or_retirement_state(self):
        self.generation(number=0); self.generation(number=1)
        before = {str(p): p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        report = self.store.cleanup()
        self.assertGreater(report['eligibleBytes'], 0)
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.home.rglob('*') if p.is_file()})
        self.assertFalse((self.home / '.jumpybrain-runtime-pins').exists())
        empty = self.home / 'empty'; empty.mkdir()
        self.assertEqual(r.Store(empty, self.home).cleanup()['entries'], [])
        self.assertEqual(list(empty.iterdir()), [])

    def test_failed_operations_keep_compact_history_and_no_bulky_payloads(self):
        good, rollback, _ = self.generation()
        for i in range(25):
            key, directory, _ = self.generation(number=i + 1, terminal=False)
            with self.store.locked(): self.store.finish(key, outcome='failed')
            self.apply(); self.assertFalse(directory.exists())
        ledger = self.store.load()
        self.assertEqual(ledger['rollback'], dict(cli=good)); self.assertTrue(rollback.exists())
        self.assertEqual(len(ledger['history']), 20); self.assertEqual(len(ledger['records']), 1)

    def test_incomplete_journal_worker_child_and_uncertain_pid_protect(self):
        _, unfinished, _ = self.generation(number=0, terminal=False)
        _, journal, _ = self.generation(number=1)
        (journal / 'transaction.json').write_text('{"phase":"publishing"}')
        _, worker, _ = self.generation(number=2)
        (worker / 'state.json').write_text(json.dumps(dict(pid=os.getpid())))
        _, child, _ = self.generation(number=3)
        (child / 'child.json').write_text(json.dumps(dict(pid=os.getpid())))
        _, uncertain, runtime = self.generation(number=4)
        pins = runtime / '.backend-pins'; pins.mkdir(mode=0o700)
        (pins / 'unknown').write_text('{"pid":null}')
        self.generation(number=5); self.apply()
        for file in [unfinished, journal, worker, child, uncertain]: self.assertTrue(file.exists())
        self.assertIn('Unknown process owner', [e['reason'] for e in self.store.cleanup()['entries']])

    def test_partial_component_updates_share_references_and_replace_dogfood_receipt(self):
        key, candidate, _ = self.generation('dogfood', 0, ('cli', 'desktop'))
        receipt = self.root / 'dogfood/current.json'
        r.atomic(receipt, dict(phase='installed', generation=key, directory=str(candidate)))
        cli, _, _ = self.generation(number=1)
        self.apply(); self.assertTrue(candidate.exists())
        self.assertEqual(self.store.load()['rollback'], dict(cli=cli, desktop=key))
        # A later complete replacement retires the old dogfood rollback in one
        # atomic ledger publication before deleting its software.
        both, _, _ = self.generation('updater', 2, ('cli', 'desktop'))
        self.assertEqual(json.loads(receipt.read_text())['phase'], 'superseded')
        self.assertIsNone(json.loads(receipt.read_text())['directory'])
        self.apply(); self.assertFalse(candidate.exists())
        self.assertEqual(self.store.load()['rollback'], dict(cli=both, desktop=both))

    def test_unknown_legacy_damaged_ledger_and_symlink_stores_are_not_adopted(self):
        unknown = self.root / 'app.previous-legacy'; unknown.mkdir(); (unknown / 'keep').write_text('keep')
        report = self.apply()
        self.assertTrue(unknown.exists()); self.assertEqual(report['entries'][0]['status'], 'unknown')
        self.store.file.write_text('{broken')
        with self.assertRaises(ValueError): self.apply()
        self.assertTrue(unknown.exists())
        self.store.file.unlink()
        outside = self.home / 'outside'; outside.mkdir()
        (self.root / 'dogfood').symlink_to(outside)
        with self.assertRaises(ValueError): self.store.cleanup()
        self.assertEqual(list(outside.iterdir()), [])

    def test_protected_root_overlap_foreign_hardlinks_and_external_links(self):
        _, directory, runtime = self.generation(number=0)
        self.generation(number=1)
        outside = self.home / 'outside'; outside.write_text('secret')
        (runtime / 'linked').symlink_to(outside)
        self.apply(); self.assertTrue(directory.exists()); self.assertEqual(outside.read_text(), 'secret')
        (runtime / 'linked').unlink(); os.link(outside, runtime / 'hardlink')
        self.apply(); self.assertTrue(directory.exists())
        (runtime / 'hardlink').unlink()
        original = Path.lstat
        def foreign_owner(file, *args, **kwargs):
            info = original(file, *args, **kwargs)
            if file == runtime / 'payload':
                values = list(info); values[4] = info.st_uid + 1
                return os.stat_result(values)
            return info
        with patch.object(Path, 'lstat', foreign_owner):
            report = self.apply()
        self.assertTrue(directory.exists()); self.assertIn('Foreign software entry', [e['reason'] for e in report['entries']])
        (self.root / 'install-manifest.json').write_text(json.dumps(dict(memoryRoot=str(runtime))))
        self.apply(); self.assertTrue(directory.exists())
        self.assertIn('Software overlaps protected data', [e['reason'] for e in self.store.cleanup()['entries']])

    def test_generation_replacement_after_preview_and_during_retirement_is_retained(self):
        _, directory, _ = self.generation(number=0); self.generation(number=1)
        self.assertGreater(self.store.cleanup()['eligibleBytes'], 0)
        moved = self.home / 'moved'; directory.rename(moved); directory.mkdir(); (directory / 'keep').write_text('replacement')
        self.apply(); self.assertEqual((directory / 'keep').read_text(), 'replacement'); self.assertTrue(moved.exists())

    def test_lost_finish_response_does_not_republish_stale_rollback(self):
        old, _, _ = self.generation(number=0)
        current, _, _ = self.generation(number=1)
        with self.store.locked(): self.store.finish(old)
        self.assertEqual(self.store.load()['rollback'], dict(cli=current))

    def test_runtime_exchange_during_retirement_does_not_delete_either_generation(self):
        _, directory, runtime = self.generation(number=0); self.generation(number=1)
        original = r.runtime_policy.retire_runtimes
        moved = directory / 'moved-runtime'
        def exchange(paths, **options):
            runtime.rename(moved); self.runtime(runtime)
            return original(paths, **options)
        with patch.object(r.runtime_policy, 'retire_runtimes', exchange): self.apply()
        self.assertTrue(directory.exists()); self.assertTrue(moved.exists()); self.assertTrue(runtime.exists())
        self.assertFalse((runtime / '.retiring').exists())

    def test_pin_published_during_retirement_is_observed_before_deletion(self):
        _, directory, runtime = self.generation(number=0); self.generation(number=1)
        original = r.runtime_policy.inspect_runtime
        def publish(runtime_path, **options):
            result = original(runtime_path, **options)
            pins = runtime_path / '.backend-pins'; pins.mkdir(mode=0o700, exist_ok=True)
            (pins / 'racing.json').write_text(json.dumps(dict(pid=os.getpid())))
            return result
        with patch.object(r.runtime_policy, 'inspect_runtime', publish): self.apply()
        self.assertTrue(directory.exists()); self.assertFalse((runtime / '.retiring').exists())

    def test_damaged_runtime_reference_cannot_fence_an_unrelated_runtime(self):
        key, _, _ = self.generation(number=0)
        other = self.runtime(self.home / 'other-runtime')
        ledger = self.store.load(); ledger['records'][0]['payloads'][0]['runtimes'] = [str(other)]
        self.store.save(ledger)
        with self.assertRaisesRegex(ValueError, 'Unknown runtime ownership'): self.apply()
        self.assertFalse((other / '.retiring').exists())

    def test_installer_lock_handoff_and_cleanup_lock_contention(self):
        self.generation(number=0)
        with self.store.locked():
            with self.assertRaises(FileExistsError):
                with self.store.locked(): self.fail('must not enter')
            with self.assertRaises(BlockingIOError):
                with self.store.locked(os.getpid()): self.fail('must not enter')
        self.store.lock.mkdir(mode=0o700)
        r.atomic(self.store.lock / 'owner.json', dict(pid=os.getpid(), host=r.socket.gethostname()))
        try:
            with self.store.locked(os.getpid()): self.store.cleanup(True)
            self.assertTrue(self.store.lock.exists())
            with self.assertRaises(ValueError):
                with self.store.locked(99999999): self.fail('must not enter')
        finally:
            (self.store.lock / 'owner.json').unlink(); self.store.lock.rmdir()

    def test_interrupted_deletion_of_terminal_build_is_idempotent(self):
        directory = self.root / 'dogfood/candidate-failed'; directory.mkdir(parents=True)
        (directory / 'one').write_text('one'); (directory / 'two').write_text('two')
        with self.store.locked():
            key = self.store.begin('dogfood', [self.store.payload(directory)], [])
            self.store.finish(key, outcome='failed')
        def interrupt(*args, **kwargs):
            (directory / 'one').unlink(); raise OSError('interrupted deletion')
        with patch.object(r, 'remove_owned', interrupt):
            report = self.apply()
        self.assertEqual(report['removed'], []); self.assertTrue(directory.exists())
        self.assertIn('interrupted deletion', report['entries'][0]['reason'])
        self.apply(); self.assertFalse(directory.exists())

    def test_interrupted_runtime_deletion_retains_fence_and_can_resume(self):
        _, old, runtime = self.generation(number=0); self.generation(number=1)
        original = r.remove_owned
        def interrupt(name, parent, expected):
            if name == 'payload': raise OSError('power loss fixture')
            return original(name, parent, expected)
        with patch.object(r, 'remove_owned', interrupt): self.apply()
        self.assertTrue((runtime / '.retiring').exists())
        self.assertTrue(self.store.load()['records'][0]['payloads'][0]['deletion'])
        self.apply(); self.assertFalse(old.exists())

    def test_soft_budget_retains_recovery_and_reports_no_hard_cap(self):
        self.generation(terminal=False)
        with patch.object(r, 'SOFT_BUDGET', 1): report = self.apply()
        self.assertTrue(report['overBudget']); self.assertGreater(report['protectedBytes'], 0)
        self.assertEqual(report['removed'], []); self.assertIn('Next verified installation', report['retry'])

    def test_custom_installation_is_independent_of_default_rollback(self):
        original, _, _ = self.generation()
        root = self.home / 'custom-cli'; root.mkdir()
        custom = r.Store(root, self.home)
        copies = []
        for i in range(2):
            directory = root / f'app.previous-{i}'; directory.mkdir(); self.runtime(directory / 'app')
            with custom.locked():
                key = custom.begin('source-cli', [custom.payload(directory, runtimes=['app'])], ['cli'])
                custom.finish(key)
            copies.append(directory)
        self.apply(); self.assertTrue(all(p.exists() for p in copies))
        with custom.locked(): custom.cleanup(True)
        self.assertFalse(copies[0].exists()); self.assertTrue(copies[1].exists())
        self.assertEqual(self.store.load()['rollback'], dict(cli=original))


class DirectDesktopCycles(unittest.TestCase):
    def test_twenty_actual_desktop_install_calls_keep_one_archive_and_usable_rollback(self):
        spec = importlib.util.spec_from_file_location('desktop_cycle', Path(__file__).with_name('desktop-install.py'))
        desktop = importlib.util.module_from_spec(spec); spec.loader.exec_module(desktop)
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary); root = home / '.jumpybrain'; root.mkdir()
            memory = home / 'brain'; memory.mkdir(); (memory / 'keep.md').write_text('unchanged')
            support = home / 'support'
            config = dict(memoryRoot=str(memory), supportDirectory=str(support), port=3787,
                          launchAgent=str(home / 'Library/LaunchAgents/local.jumpybrain.desktop.plist'),
                          legacyLaunchAgent=str(home / 'Library/LaunchAgents/local.jumpybrain.companion.plist'))
            (root / 'install-manifest.json').write_text(json.dumps(config))
            built = home / 'built.app'
            (built / 'Contents/Resources').mkdir(parents=True); (built / 'Contents/MacOS').mkdir()
            (built / 'Contents/MacOS/jumpyBrain').write_text('working executable')
            (built / 'Contents/Resources/desktop.json').write_text(json.dumps(config))
            (built / 'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier=desktop.DESKTOP, CFBundleShortVersionString='0.3.19')))
            sizes = []
            with patch.object(desktop, 'configuration', return_value=config), patch.object(desktop.subprocess, 'run'), redirect_stdout(io.StringIO()):
                for i in range(20):
                    desktop.install_bundle(built, home, inspect_running=lambda apps: False, unload_legacy=False)
                    archives = list((home / 'Library/Application Support/jumpyBrain Backups').glob('before-*.tar.gz'))
                    self.assertEqual(len(archives), 0 if i == 0 else 1)
                    self.assertEqual(list((home / 'Applications').glob('.jumpybrain-install-*')), [])
                    sizes.append(sum(p.stat().st_size for p in archives))
            self.assertLess(max(sizes[2:]) - min(sizes[2:]), 100, sizes)
            import tarfile
            with tarfile.open(archives[0]) as archive:
                self.assertEqual(archive.extractfile('previous-installation/jumpyBrain.app/Contents/MacOS/jumpyBrain').read(), b'working executable')
            self.assertEqual((memory / 'keep.md').read_text(), 'unchanged')
            print('Direct desktop fixture:', json.dumps(dict(cycles=20, retainedArchives=len(archives), compressedBytes=sizes[-1])))


if __name__ == '__main__': unittest.main()
