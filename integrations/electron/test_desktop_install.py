import importlib.util
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import tarfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('desktop_install', Path(__file__).with_name('desktop-install.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='jb-desktop-install-test-')
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.app = self.home / 'Applications/jumpyBrain.app'
        self.support = self.home / 'support'
        self.support.mkdir(mode=0o700)
        (self.support / 'api-key').write_text('a' * 64)
        (self.support / 'api-key').chmod(0o600)
        self.memory = self.home / 'memory'; self.memory.mkdir()
        (self.memory / 'keep.md').write_text('canonical content')
        self.old_agent = self.home / 'Library/LaunchAgents/local.jumpybrain.companion.plist'
        self.agent = self.home / 'Library/LaunchAgents/local.jumpybrain.desktop.plist'
        self.config = dict(node='/usr/bin/node', qmd='/usr/bin/qmd', memoryRoot=str(self.memory),
            runtimeRoot=str(self.home / '.jumpybrain/app'), supportDirectory=str(self.support),
            launchAgent=str(self.old_agent), label=installer.LEGACY, port=3787, revision='0.3.1')
        self.bundle(self.app, installer.LEGACY)
        (self.app / 'Contents/Resources/Configuration.json').write_text(json.dumps(self.config))
        self.desktop = self.home / 'Applications/jumpyBrain Desktop.app'
        self.bundle(self.desktop, installer.DESKTOP)
        self.built = self.home / 'built.app'; self.bundle(self.built, installer.DESKTOP)
        (self.built / 'Contents/Resources/desktop.json').write_text(json.dumps(dict(schema=1,
            supportDirectory=str(self.support), launchAgent=str(self.agent), port=3787)))
        self.old_agent.parent.mkdir(parents=True)
        self.old_agent.write_bytes(plistlib.dumps(dict(Label=installer.LEGACY,
            ProgramArguments=[str(self.app / 'Contents/MacOS/jumpyBrain')], RunAtLoad=True)))
        self.processes = patch.object(installer.subprocess, 'run'); self.processes.start(); self.addCleanup(self.processes.stop)

    def bundle(self, app, identity):
        (app / 'Contents/Resources').mkdir(parents=True)
        (app / 'Contents/MacOS').mkdir()
        (app / 'Contents/MacOS/jumpyBrain').write_text('fixture')
        (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier=identity, CFBundleExecutable='jumpyBrain')))

    def install(self):
        return installer.install_bundle(self.built, self.home, inspect_running=lambda apps: False, unload_legacy=False)

    def test_migrates_two_apps_and_login_preserving_data_and_recovery(self):
        connections = self.support / 'connections.json'; connections.write_text('unchanged profiles')
        self.install()
        self.assertEqual(installer.info(self.app)['CFBundleIdentifier'], installer.DESKTOP)
        self.assertFalse(self.desktop.exists()); self.assertFalse(self.old_agent.exists())
        self.assertEqual(self.agent.read_bytes(), installer.login_bytes(self.app / 'Contents/MacOS/jumpyBrain'))
        self.assertEqual(connections.read_text(), 'unchanged profiles')
        self.assertEqual((self.memory / 'keep.md').read_text(), 'canonical content')
        backup = next((self.home / 'Library/Application Support/jumpyBrain Backups').iterdir())
        with tarfile.open(backup) as archive:
            self.assertIn('previous-installation/jumpyBrain Desktop.app', archive.getnames())
            data = archive.extractfile('previous-installation/jumpyBrain.app/Contents/Info.plist').read()
            self.assertEqual(plistlib.loads(data)['CFBundleIdentifier'], installer.LEGACY)

    def test_preserves_disabled_login(self):
        self.old_agent.unlink(); self.install(); self.assertFalse(self.agent.exists())

    def test_refuses_running_or_foreign_app_and_foreign_login(self):
        with self.assertRaisesRegex(installer.SafetyError, 'Quit'):
            installer.install_bundle(self.built, self.home, inspect_running=lambda apps: True)
        self.old_agent.write_bytes(plistlib.dumps(dict(Label='foreign', ProgramArguments=['foreign'])))
        with self.assertRaisesRegex(installer.SafetyError, 'unrelated (login|LaunchAgent)'):
            self.install()
        self.assertTrue(self.desktop.exists())

    def test_failure_after_backups_rolls_back_app_and_login(self):
        original = Path.rename
        def rename(source, destination):
            if source.name == 'new.app': raise OSError('simulated publication failure')
            return original(source, destination)
        with patch.object(Path, 'rename', rename), self.assertRaisesRegex(OSError, 'simulated'):
            self.install()
        self.assertEqual(installer.info(self.app)['CFBundleIdentifier'], installer.LEGACY)
        self.assertTrue(self.desktop.exists()); self.assertTrue(self.old_agent.exists()); self.assertFalse(self.agent.exists())

    def test_held_native_lock_blocks_replacement(self):
        with installer.companion_lock(self.support, create=True):
            with self.assertRaises(installer.SafetyError): self.install()
        self.assertEqual(installer.info(self.app)['CFBundleIdentifier'], installer.LEGACY)

    def test_gui_or_cli_installer_lock_blocks_desktop_publication(self):
        with installer.installation_lock(self.home):
            with self.assertRaisesRegex(installer.SafetyError, 'Another CLI/app'): self.install()
        self.assertEqual(installer.info(self.app)['CFBundleIdentifier'], installer.LEGACY)

@unittest.skipUnless(sys.platform == 'darwin', 'Mac compiler snapshot')
class CompilerSnapshotTests(unittest.TestCase):
    def test_snapshot_compiles_typescript_without_source_node_modules(self):
        # Exercise the actual relocated compiler/binary, not a manifest-only fixture.
        with tempfile.TemporaryDirectory(prefix='jb-extension-compiler-') as directory:
            runtime = Path(directory) / 'runtime'
            runtime.mkdir()
            (runtime / 'package.json').write_text('{"type":"module"}')
            installer.copy_extension_compiler(installer.SOURCE, runtime)
            packages = sorted(path.name for path in (runtime / 'node_modules').iterdir())
            self.assertEqual(packages, ['@esbuild', 'esbuild'])
            self.assertFalse((runtime / 'node_modules/esbuild/bin').exists())
            result = subprocess.run([shutil.which('node'), '--input-type=module', '-e',
                'import {transform,stop} from "esbuild"; '
                'try { const output=await transform("const value: number = 42",{loader:"ts"}); '
                'if(output.code.includes(": number") || !output.code.includes("42")) throw Error("TypeScript preparation failed"); '
                'console.log("relocated compiler passed"); } finally {stop();}'],
                cwd=runtime, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('relocated compiler passed', result.stdout)

    def test_incoming_distribution_needs_only_electron_build_dependencies(self):
        with tempfile.TemporaryDirectory(prefix='jb-incoming-compiler-') as directory:
            source = Path(directory) / 'package'; runtime = Path(directory) / 'runtime'
            source.mkdir(); runtime.mkdir()
            shutil.copy2(installer.SOURCE / 'package.json', source / 'package.json')
            electron = source / 'integrations/electron'; electron.mkdir(parents=True)
            shutil.copy2(installer.SOURCE / 'integrations/electron/package.json', electron / 'package.json')
            (electron / 'node_modules').symlink_to(installer.SOURCE / 'integrations/electron/node_modules', target_is_directory=True)
            self.assertFalse((source / 'node_modules').exists())
            installer.copy_extension_compiler(source, runtime)
            self.assertTrue((runtime / 'node_modules/esbuild/lib/main.js').is_file())
            # Missing production prerequisites must fail before replacement; do not
            # fetch packages or fall back to an unpinned root compiler here.
            (electron / 'node_modules').unlink()
            with self.assertRaises(installer.SafetyError):
                installer.copy_extension_compiler(source, Path(directory) / 'missing-runtime')

    def test_snapshot_rejects_a_different_pinned_compiler(self):
        with tempfile.TemporaryDirectory(prefix='jb-extension-compiler-version-') as directory:
            source = Path(directory) / 'source'; runtime = Path(directory) / 'runtime'
            source.mkdir(); runtime.mkdir()
            (source / 'package.json').write_text('{"dependencies":{"esbuild":"0.0.0"}}')
            (source / 'integrations').symlink_to(installer.SOURCE / 'integrations', target_is_directory=True)
            with self.assertRaisesRegex(installer.SafetyError, 'pinned runtime version'):
                installer.copy_extension_compiler(source, runtime)

if __name__ == '__main__': unittest.main()
