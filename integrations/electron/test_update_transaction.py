import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import hashlib
import plistlib
import sys
import contextlib
import types
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('transaction', Path(__file__).with_name('update-transaction.py'))
tx = importlib.util.module_from_spec(spec); spec.loader.exec_module(tx)

class Transactions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup); self.root = Path(self.temp.name)

    def test_extract_rejects_traversal_links_duplicates_and_devices_before_writing(self):
        for name, kind, duplicate in [('package/../../outside', tarfile.REGTYPE, False), ('package/link', tarfile.SYMTYPE, False),
                                      ('package/hard', tarfile.LNKTYPE, False), ('package/device', tarfile.CHRTYPE, False), ('package/same', tarfile.REGTYPE, True)]:
            archive = self.root / 'release.tgz'
            with tarfile.open(archive, 'w:gz') as tar:
                member = tarfile.TarInfo(name); member.type = kind; member.linkname = '/etc/passwd'; tar.addfile(member)
                if duplicate: tar.addfile(member)
            destination = self.root / 'unpacked'
            with self.assertRaises(ValueError): tx.extract(archive, destination)
            self.assertFalse(destination.exists())

    def test_atomic_exchanges_recover_from_every_interruption_and_repeat_recovery(self):
        pairs = []
        for name in ['cli', 'manifest', 'app']:
            left, right = self.root / name, self.root / ('new-' + name)
            left.write_text('old-' + name); right.write_text('new-' + name)
            pairs.append((left, right))
        for stop_after in range(4):
            exchanges = []
            for i, (left, right) in enumerate(pairs):
                exchanges.append(dict(left=str(left), right=str(right), leftIdentity=tx.identity(left), rightIdentity=tx.identity(right)))
                if i < stop_after: tx.swap(left, right)
            tx.atomic(self.root / 'transaction.json', dict(phase='publishing', exchanges=exchanges))
            tx.rollback(self.root); tx.rollback(self.root)
            for left, right in pairs:
                self.assertEqual(left.read_text(), 'old-' + left.name)
                self.assertEqual(right.read_text(), 'new-' + left.name)

    def test_recovery_itself_can_be_interrupted_and_retried(self):
        left, right = self.root / 'old', self.root / 'new'; left.write_text('old'); right.write_text('new')
        exchange = dict(left=str(left), right=str(right), leftIdentity=tx.identity(left), rightIdentity=tx.identity(right))
        tx.swap(left, right); tx.atomic(self.root / 'transaction.json', dict(phase='publishing', exchanges=[exchange]))
        with patch.object(tx, 'atomic', side_effect=OSError('disk full')), self.assertRaises(OSError): tx.rollback(self.root)
        tx.rollback(self.root); self.assertEqual(left.read_text(), 'old')

    def test_foreign_recovery_paths_are_never_replaced(self):
        left, right = self.root / 'old', self.root / 'new'; left.write_text('old'); right.write_text('new')
        exchange = dict(left=str(left), right=str(right), leftIdentity=tx.identity(left), rightIdentity=tx.identity(right))
        tx.atomic(self.root / 'transaction.json', dict(phase='publishing', exchanges=[exchange]))
        replacement = self.root / 'foreign'; replacement.write_text('foreign'); replacement.replace(left)
        with self.assertRaisesRegex(ValueError, 'changed'): tx.rollback(self.root)
        self.assertEqual(left.read_text(), 'foreign')

    def publication_fixture(self):
        home = self.root / 'home'; root = home / '.jumpybrain'; root.mkdir(parents=True)
        directory = self.root / 'update'; directory.mkdir()
        source = directory / 'unpacked/package'; electron = source / 'integrations/electron'; electron.mkdir(parents=True)
        (root / 'app').mkdir(); (root / 'app/old.txt').write_text('old CLI')
        (source / 'new.txt').write_text('new CLI')
        (root / 'bin').mkdir(); (root / 'bin/jumpybrain').write_text('owned shim')
        manifest = root / 'install-manifest.json'; manifest.write_text('{"source":"preserved","ref":"master"}')
        app = home / 'Applications/jumpyBrain.app'; staged = directory / 'built/jumpyBrain.app'
        for bundle, v in [(app, '0.3.3'), (staged, '0.3.4')]:
            (bundle / 'Contents').mkdir(parents=True)
            (bundle / 'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier='local.jumpybrain.desktop', CFBundleShortVersionString=v)))
        support = home / 'support'; support.mkdir(); (support / 'connections.json').write_text('preserved credentials references')
        memory = home / 'memory.md'; memory.write_text('canonical Markdown')
        config = dict(supportDirectory=str(support))
        (electron / 'desktop-install.py').write_text(f'configuration = lambda home: {config!r}\nprivate_support = lambda support: None\nrunning_apps = lambda apps: False\n')
        request = dict(home=str(home), appPath=str(app), release=dict(version='0.3.4'), installed=dict(app='0.3.3'), configuration=config,
                       updateCLI=True, preparedAt='test', cli=dict(manifestHash=hashlib.sha256(manifest.read_bytes()).hexdigest(), shimHash=hashlib.sha256((root/'bin/jumpybrain').read_bytes()).hexdigest()))
        tx.atomic(directory / 'request.json', request)
        return directory, root, app, support, memory

    def test_publication_failure_at_each_component_restores_every_component(self):
        directory, root, app, support, memory = self.publication_fixture()
        original = tx.swap
        for fail_at in [1, 2, 3]:
            calls = 0
            def fail(a, b):
                nonlocal calls
                calls += 1
                if calls == fail_at: raise OSError('simulated publication failure')
                original(a, b)
            with patch.dict(sys.modules, lifecycle=types.SimpleNamespace(companion_lock=lambda *a, **k: contextlib.nullcontext())), patch.object(tx.subprocess, 'run'), patch.object(tx, 'swap', side_effect=fail):
                with self.assertRaisesRegex(OSError, 'publication failure'): tx.publish(directory)
            self.assertEqual(tx.version(app), '0.3.3')
            self.assertTrue((root / 'app/old.txt').exists())
            self.assertEqual(json.loads((root/'install-manifest.json').read_text()), dict(source='preserved', ref='master'))
            self.assertEqual(memory.read_text(), 'canonical Markdown')
            self.assertEqual((support/'connections.json').read_text(), 'preserved credentials references')

    def test_successful_publication_retains_recoverable_versions_and_policy(self):
        directory, root, app, support, memory = self.publication_fixture()
        with patch.dict(sys.modules, lifecycle=types.SimpleNamespace(companion_lock=lambda *a, **k: contextlib.nullcontext())), patch.object(tx.subprocess, 'run'):
            tx.publish(directory)
        self.assertEqual(tx.version(app), '0.3.4'); self.assertTrue((root/'app/new.txt').exists())
        manifest = json.loads((root/'install-manifest.json').read_text())
        self.assertEqual(manifest['source'], 'preserved'); self.assertEqual(manifest['ref'], 'master'); self.assertEqual(manifest['installedVersion'], '0.3.4')
        tx.rollback(directory)
        self.assertEqual(tx.version(app), '0.3.3'); self.assertTrue((root/'app/old.txt').exists())

if __name__ == '__main__': unittest.main()
