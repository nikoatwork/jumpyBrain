import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
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

if __name__ == '__main__': unittest.main()
