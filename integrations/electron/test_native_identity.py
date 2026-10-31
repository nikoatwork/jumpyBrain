"""Packaging-path regression; disposable bundles, no real Keychain operations."""
import importlib.util
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('desktop_native_identity', Path(__file__).with_name('desktop-install.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class NativeIdentityTests(unittest.TestCase):
    def test_different_packaging_paths_preserve_native_configuration_and_identity(self):
        with tempfile.TemporaryDirectory(prefix='jb-native-identity-') as temporary:
            root = Path(temporary)
            home = root / 'home'
            source = root / 'source'
            (source / 'dist').mkdir(parents=True)
            (source / 'dist/cli.js').write_text('// fixture runtime\n')
            (source / 'package.json').write_text('{"version":"0.3.13"}')
            native = source / 'integrations/macos-companion'
            native.mkdir(parents=True)
            for name in ('gateway.mjs', 'extensions-gateway.mjs', 'connections.mjs', 'switch-coordinator.mjs', 'MenuBarBrain.png'):
                (native / name).write_text('fixture')
            config = dict(runtimeRoot=str(home / '.jumpybrain/app'), memoryRoot=str(home / 'notes'),
                          supportDirectory=str(home / 'support'), launchAgent=str(home / 'agent.plist'),
                          port=3787, node='/usr/bin/node', qmd='/usr/bin/qmd')
            signing = sys.platform == 'darwin' and shutil.which('codesign') is not None

            def native_fixture(_source, scratch, native_config, **_options):
                # Keep the native executable and resources identical except for
                # the real prepare() configuration. Do not compile or run a host.
                app = scratch / 'fixture.app'
                resources = app / 'Contents/Resources'
                resources.mkdir(parents=True)
                (resources / 'Configuration.json').write_text(json.dumps(native_config, indent=2) + '\n')
                (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(dict(
                    CFBundleIdentifier='local.jumpybrain.identity-fixture', CFBundleExecutable='fixture')))
                executable = app / 'Contents/MacOS/fixture'
                executable.parent.mkdir()
                if signing:
                    # Copy only a system utility into disposable storage; signing
                    # changes the fixture copy and never accesses user's Keychain.
                    shutil.copyfile('/usr/bin/true', executable)
                    executable.chmod(0o755)
                    subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', str(app)],
                                   check=True, capture_output=True)
                else:
                    executable.write_bytes(b'identical fixture executable')
                return app

            prepared = []
            with patch.object(installer, 'configuration', return_value=config.copy()), \
                    patch.object(installer, 'copy_extension_compiler'), \
                    patch.object(installer, 'build_app', side_effect=native_fixture):
                for dirname in ('package-random-one', 'another-random-package'):
                    bundle = root / dirname / 'jumpyBrain.app'
                    (bundle / 'Contents/Resources').mkdir(parents=True)
                    installer.prepare(bundle, home, source)
                    prepared.append(bundle / 'Contents/Resources/native/jumpyBrain Host.app')

            configurations = [(app / 'Contents/Resources/Configuration.json').read_bytes() for app in prepared]
            self.assertEqual(configurations[0], configurations[1], 'Packaging paths must not change signed helper resources')
            saved = json.loads(configurations[0])
            self.assertEqual(saved['runtimeRoot'], str(home / 'Applications/jumpyBrain.app/Contents/Resources/runtime'))
            for key in ('memoryRoot', 'supportDirectory', 'port', 'launchAgent'):
                self.assertEqual(saved[key], config[key])
            if signing:
                identities = []
                for app in prepared:
                    result = subprocess.run(['/usr/bin/codesign', '-d', '-r-', '--verbose=4', str(app)],
                                            check=True, capture_output=True, text=True)
                    lines = (result.stdout + result.stderr).splitlines()
                    identities.append(([line for line in lines if line.startswith('CDHash=')],
                                       [line for line in lines if 'designated =>' in line]))
                self.assertTrue(identities[0][0])
                self.assertTrue(identities[0][1])
                self.assertEqual(identities[0], identities[1], 'Identical helper inputs must retain their ad-hoc identity')
            for app in prepared:
                self.assertTrue((app / 'Contents/MacOS/fixture').exists())


if __name__ == '__main__':
    unittest.main()
