#!/usr/bin/env python3
"""Build internal native assets; transactionally install one stopped Mac app."""
import argparse
from contextlib import ExitStack, contextmanager
import json
import os
from pathlib import Path
import plistlib
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import tarfile
import time

SOURCE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SOURCE / 'integrations/macos-companion'))
from lifecycle import SafetyError, companion_lock, inspect_companion, validate_manifest, regular, validate_key, overlaps
from install import build_app, build_workspace
from uninstall import owned_loaded_job

DESKTOP = 'local.jumpybrain.desktop'
LEGACY = 'local.jumpybrain.companion'

def info(app):
    if app.is_symlink() or not app.is_dir():
        raise SafetyError(f'Refusing an unrelated app path: {app}')
    return plistlib.loads(regular(app / 'Contents/Info.plist').read_bytes())

def private_support(support):
    if not support.exists():
        support.mkdir(parents=True, mode=0o700)
    value = support.lstat()
    if not stat.S_ISDIR(value.st_mode) or stat.S_ISLNK(value.st_mode) or value.st_uid != os.getuid() or value.st_mode & 0o077:
        raise SafetyError('The existing app support directory must be private and owned by your user.')
    key = support / 'api-key'
    if not os.path.lexists(key):
        fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(secrets.token_hex(32) + '\n')
    value = key.lstat()
    if not stat.S_ISREG(value.st_mode) or value.st_nlink != 1 or value.st_uid != os.getuid() or value.st_mode & 0o077:
        raise SafetyError('Refusing an unsafe app control key.')
    validate_key(support)

def configuration(home):
    target = home / 'Applications/jumpyBrain.app'
    root = home / '.jumpybrain'
    if target.exists():
        identity = info(target).get('CFBundleIdentifier')
        if identity == LEGACY:
            result = inspect_companion(root, home)
        elif identity == DESKTOP:
            result = json.loads(regular(target / 'Contents/Resources/native/jumpyBrain Host.app/Contents/Resources/Configuration.json').read_text())
        else:
            raise SafetyError('An unrelated app occupies ~/Applications/jumpyBrain.app.')
    else:
        manifest = validate_manifest(root)
        result = dict(node=shutil.which('node'), qmd=shutil.which('qmd'), memoryRoot=manifest['memoryRoot'],
                      supportDirectory=str(home / 'Library/Application Support/jumpyBrain Companion'), port=3787)
    for name in ('node', 'qmd', 'memoryRoot', 'supportDirectory'):
        if not isinstance(result.get(name), str) or not Path(result[name]).is_absolute():
            raise SafetyError(f'Missing or invalid {name}; repair the installation first.')
    if type(result.get('port')) is not int or not 1024 <= result['port'] <= 65535:
        raise SafetyError('Invalid local service port.')
    result['legacyLaunchAgent'] = result.get('legacyLaunchAgent', result.get('launchAgent', str(home / f'Library/LaunchAgents/{LEGACY}.plist')))
    result.update(label=LEGACY, launchAgent=str(home / 'Library/LaunchAgents/local.jumpybrain.desktop.plist'))
    return result

def copy_extension_compiler(source, runtime):
    """Snapshot only the lazy compiler and this Mac's binary, not development dependencies."""
    architecture = {'arm64': 'arm64', 'x86_64': 'x64'}.get(os.uname().machine)
    if not architecture:
        raise SafetyError('Unsupported Mac architecture for extension preparation.')
    # Existing released workers install only the incoming Electron lockfile before
    # calling install.mjs. Keep build prerequisites there, never in root node_modules.
    electron = source / 'integrations/electron'
    compiler = electron / 'node_modules/esbuild'
    native_name = f'@esbuild/darwin-{architecture}'
    native = electron / 'node_modules' / native_name
    metadata = json.loads(regular(compiler / 'package.json').read_text())
    platform_metadata = json.loads(regular(native / 'package.json').read_text())
    expected = json.loads(regular(source / 'package.json').read_text()).get('dependencies', {}).get('esbuild')
    build_version = json.loads(regular(electron / 'package.json').read_text()).get('devDependencies', {}).get('esbuild')
    if build_version != expected or metadata.get('name') != 'esbuild' or metadata.get('version') != expected or platform_metadata.get('name') != native_name or platform_metadata.get('version') != expected:
        raise SafetyError('Extension compiler dependencies do not match the pinned runtime version.')
    regular(compiler / 'lib/main.js')
    regular(native / 'bin/esbuild')
    target = runtime / 'node_modules/esbuild'
    target.mkdir(parents=True)
    shutil.copytree(compiler / 'lib', target / 'lib')
    for name in ('package.json', 'LICENSE.md'):
        shutil.copy2(regular(compiler / name), target / name)
    # lib/main.js resolves the optional platform package directly. Omit the duplicate
    # compiler/bin copy; there is one native executable in the runtime snapshot.
    platform_target = runtime / 'node_modules' / native_name
    platform_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(native, platform_target)

def prepare(bundle, home, source=SOURCE):
    config = configuration(home)
    resources = bundle / 'Contents/Resources'
    runtime = resources / 'runtime'
    runtime.mkdir()
    # Snapshot compiled code and the one lazy extension compiler. No CLI install,
    # memory, arbitrary node_modules tree, or credentials.
    shutil.copytree(source / 'dist', runtime / 'dist')
    shutil.copy2(source / 'package.json', runtime / 'package.json')
    copy_extension_compiler(source, runtime)
    native = runtime / 'integrations/macos-companion'
    native.mkdir(parents=True)
    for name in ('gateway.mjs', 'extensions-gateway.mjs', 'connections.mjs', 'switch-coordinator.mjs'):
        shutil.copy2(source / 'integrations/macos-companion' / name, native / name)
    config['runtimeRoot'] = str(runtime)
    with build_workspace() as scratch:
        previous = source / '.local-pack/desktop/jumpyBrain.app/Contents/Resources/native/jumpyBrain Host.app'
        built = build_app(source, scratch, config, previous_app=previous if previous.is_dir() else None)
        destination = resources / 'native/jumpyBrain Host.app'
        destination.parent.mkdir()
        shutil.copytree(built, destination)
    shutil.copy2(source / 'integrations/macos-companion/MenuBarBrain.png', resources / 'MenuBarBrain.png')
    (resources / 'desktop.json').write_text(json.dumps(dict(schema=1, supportDirectory=config['supportDirectory'],
        launchAgent=config['launchAgent'], port=config['port']), indent=2) + '\n')

def running_apps(apps):
    # Read-only process inspection; never signal processes found by name/PID.
    commands = subprocess.check_output(['/bin/ps', '-axo', 'comm='], text=True).splitlines()
    return any(command.strip().startswith(str(app / 'Contents/MacOS') + '/') for app in apps for command in commands)

def login_bytes(executable):
    # Generate exactly the same representation as Electron's guarded login writer.
    from xml.sax.saxutils import escape
    value = escape(str(executable), {'"': '&quot;', "'": '&apos;'})
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
        f'<plist version="1.0"><dict><key>Label</key><string>{DESKTOP}</string><key>ProgramArguments</key><array><string>{value}</string><string>--background</string></array>'
        '<key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>ProcessType</key><string>Interactive</string><key>LimitLoadToSessionType</key><string>Aqua</string></dict></plist>\n').encode()

def validate_agent(agent, label, executable, background=False):
    if not os.path.lexists(agent):
        return False
    value = plistlib.loads(regular(agent).read_bytes())
    if value.get('Label') != label or value.get('ProgramArguments') != [str(executable)] + (['--background'] if background else []):
        raise SafetyError(f'Refusing an unrelated login item: {agent}')
    return True

@contextmanager
def installation_lock(home):
    root = home / '.jumpybrain'
    root.mkdir(parents=True, exist_ok=True)
    if root.is_symlink(): raise SafetyError('Refusing a linked CLI install root.')
    lock = root / '.installer-lock'
    try: lock.mkdir(mode=0o700)
    except FileExistsError: raise SafetyError('Another CLI/app installer or GUI update is active. Wait for it to finish.')
    try: yield
    finally: lock.rmdir()

def install_bundle(built, home, *, inspect_running=running_apps, unload_legacy=True):
    with installation_lock(home):
        return _install_bundle(built, home, inspect_running=inspect_running, unload_legacy=unload_legacy)

def _install_bundle(built, home, *, inspect_running=running_apps, unload_legacy=True):
    target = home / 'Applications/jumpyBrain.app'
    if info(built).get('CFBundleIdentifier') != DESKTOP:
        raise SafetyError('The build is not a jumpyBrain desktop bundle.')
    expected = json.loads((built / 'Contents/Resources/desktop.json').read_text())
    current = configuration(home)
    if any(expected[key] != current[key] for key in ('supportDirectory', 'port', 'launchAgent')):
        raise SafetyError('App configuration changed while building. Retry setup.')
    apps = []
    for name, identities in [('jumpyBrain.app', {LEGACY, DESKTOP}), ('jumpyBrain Desktop.app', {DESKTOP}),
                             ('jumpyBrain Electron.app', {'local.jumpybrain.electron-prototype'})]:
        candidate = home / 'Applications' / name
        if os.path.lexists(candidate):
            if info(candidate).get('CFBundleIdentifier') not in identities:
                raise SafetyError(f'Refusing an unrelated application: {candidate}')
            apps.append(candidate)
    if inspect_running(apps):
        raise SafetyError('Quit jumpyBrain and its older Desktop/Electron windows, then rerun desktop setup. The built app and your data are retained.')
    support = Path(current['supportDirectory'])
    if any(overlaps(support, app) or overlaps(Path(current['memoryRoot']), app) for app in apps + [target]):
        raise SafetyError('App data overlaps the installation destination.')
    private_support(support)
    old_agent = Path(current['legacyLaunchAgent'])
    agent = Path(current['launchAgent'])
    executable = target / 'Contents/MacOS/jumpyBrain'
    had_old = validate_agent(old_agent, LEGACY, executable)
    had_new = validate_agent(agent, DESKTOP, executable, True)
    # A first installation starts only when explicitly launched; preserve an existing preference.
    login = had_old or had_new
    with companion_lock(support, create=True):
        if inspect_running(apps):
            raise SafetyError('An app started during installation. Quit it and retry.')
        # Stopped old LaunchAgent may still be registered with launchd. Validate
        # before unloading; an unknown job must never be removed.
        unloaded = None
        if unload_legacy and home == Path.home() and target in apps and info(target).get('CFBundleIdentifier') == LEGACY:
            unloaded = owned_loaded_job(target, old_agent)
            if unloaded:
                subprocess.run(['/bin/launchctl', 'bootout', unloaded], check=True, capture_output=True)
        target.parent.mkdir(parents=True, exist_ok=True)
        transaction = Path(tempfile.mkdtemp(prefix='.jumpybrain-install-', dir=target.parent))
        moves = []
        try:
            pending = transaction / 'new.app'
            shutil.copytree(built, pending, symlinks=True)
            subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(pending)], check=True, capture_output=True)
            for app in apps:
                backup = transaction / app.name
                app.rename(backup); moves.append((app, backup))
            for item in (old_agent, agent):
                if item.exists():
                    backup = transaction / item.name
                    item.rename(backup); moves.append((item, backup))
            pending.rename(target); moves.append((pending, target))
            if login:
                agent.parent.mkdir(parents=True, exist_ok=True)
                pending_agent = transaction / 'new-login.plist'
                pending_agent.write_bytes(login_bytes(executable)); pending_agent.chmod(0o600)
                pending_agent.rename(agent); moves.append((pending_agent, agent))
            # Keep recoverable older app bundles/login files outside normal app discovery.
            backup_root = home / 'Library/Application Support/jumpyBrain Backups'
            backup_root.mkdir(parents=True, exist_ok=True, mode=0o700)
            archived = backup_root / ('before-' + time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(3) + '.tar.gz')
            # Archive symlinks/modes without following them; backups must not
            # register as additional launchable apps in Spotlight/Launch Services.
            with tarfile.open(archived, 'w:gz', dereference=False) as archive:
                archive.add(transaction, arcname='previous-installation')
            archived.chmod(0o600)
            print(f'Installed {target}\nPrevious apps/login files: {archived}\nStart at login: {"on" if login else "off"}')
        except BaseException:
            for original, moved in reversed(moves):
                if moved.exists():
                    moved.rename(original)
            shutil.rmtree(transaction)
            # Do not bootstrap a restored job: rollback must not unexpectedly start an app.
            raise
        else:
            try: shutil.rmtree(transaction)
            except OSError: print(f'Installation succeeded; remove leftover build transaction when convenient: {transaction}', file=sys.stderr)
    return target

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['prepare', 'install'])
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--home', type=Path, default=Path.home())
    args = parser.parse_args()
    try:
        if args.operation == 'prepare': prepare(args.bundle.resolve(), args.home.resolve())
        else: install_bundle(args.bundle.resolve(), args.home.resolve())
    except (SafetyError, OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(1, str(error) + '\n')
if __name__ == '__main__': main()
