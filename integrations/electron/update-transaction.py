#!/usr/bin/env python3
"""Private updater extraction and journaled publication. Never writes memory/settings."""
import hashlib
import ctypes
import fcntl
import stat
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import shutil
import subprocess
import sys
import tarfile

def atomic(file, value):
    temporary = file.with_suffix('.tmp')
    with open(temporary, 'w') as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream)
        stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, file)
    fd = os.open(file.parent, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)

def extract(archive, directory):
    with tarfile.open(archive, 'r:gz') as source:
        members, seen, size = [], set(), 0
        for member in source:
            members.append(member); size += member.size
            if len(members) > 20000 or size > 512 * 1024 * 1024:
                raise ValueError('Release expands beyond its supported limit.')
            parts = PurePosixPath(member.name).parts
            normalized = str(PurePosixPath(member.name))
            if not parts or parts[0] != 'package' or '..' in parts or '\\' in member.name or normalized in seen or not (member.isfile() or member.isdir()):
                raise ValueError('Release archive contains unsafe or duplicate entries.')
            seen.add(normalized)
        directory.mkdir(mode=0o700)
        for member in members:
            destination = directory.joinpath(*PurePosixPath(member.name).parts)
            if member.isdir(): destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as src, open(destination, 'xb') as dst: shutil.copyfileobj(src, dst)
                destination.chmod(0o755 if member.mode & 0o111 else 0o644)

def version(app):
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    if info.get('CFBundleIdentifier') != 'local.jumpybrain.desktop': raise ValueError('Unowned desktop application.')
    return info.get('CFBundleShortVersionString')

def swap(a, b):
    # macOS atomic exchange: Finder always has a complete app, even if power is
    # lost between the exchange and the journal update.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.renamex_np(os.fsencode(a), os.fsencode(b), 2) != 0:
        raise OSError(ctypes.get_errno(), 'Could not atomically exchange app bundles.')

def identity(file):
    value = file.lstat()
    return [value.st_dev, value.st_ino]

def rollback(directory):
    journal = directory / 'transaction.json'
    if not journal.exists(): return
    state = json.loads(journal.read_text())
    if state['phase'] in ('rolled-back', 'success'): return
    for exchange in reversed(state['exchanges']):
        left, right = Path(exchange['left']), Path(exchange['right'])
        current = [identity(left), identity(right)]
        expected = [exchange['leftIdentity'], exchange['rightIdentity']]
        if current == list(reversed(expected)): swap(left, right)
        elif current != expected: raise ValueError('Recovery paths changed. Backups retained; inspect transaction.json.')
    state['phase'] = 'rolled-back'; atomic(journal, state)

def guarded_rollback(directory):
    request = json.loads((directory / 'request.json').read_text())
    lock = Path(request['configuration']['supportDirectory']) / 'companion.lock'
    fd = os.open(lock, os.O_RDWR | os.O_NOFOLLOW)
    try:
        value = os.fstat(fd)
        if not stat.S_ISREG(value.st_mode) or value.st_uid != os.getuid() or value.st_nlink != 1:
            raise ValueError('Unsafe companion lock; recovery was not attempted.')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        commands = subprocess.check_output(['/bin/ps', '-axo', 'comm='], text=True).splitlines()
        executable = request['appPath'] + '/Contents/MacOS/'
        if any(command.strip().startswith(executable) for command in commands):
            raise ValueError('The app is still running. Recovery must wait for safe shutdown.')
        rollback(directory)
    finally: os.close(fd)

def publish(directory):
    request = json.loads((directory / 'request.json').read_text())
    app = Path(request['appPath']); staged = directory / 'built/jumpyBrain.app'
    root = Path(request['home']) / '.jumpybrain'
    source = directory / 'unpacked/package'
    # Reuse native ownership, process inspection, and advisory lock policy.
    sys.path.insert(0, str(source / 'integrations/macos-companion'))
    from lifecycle import companion_lock
    sys.path.insert(0, str(source / 'integrations/electron'))
    import importlib.util
    spec = importlib.util.spec_from_file_location('installer', source / 'integrations/electron/desktop-install.py')
    installer = importlib.util.module_from_spec(spec); spec.loader.exec_module(installer)
    if version(staged) != request['release']['version'] or version(app) != request['installed']['app']:
        raise ValueError('Application versions changed during preparation. Check again.')
    config = installer.configuration(Path(request['home']))
    if config != request['configuration']: raise ValueError('App configuration changed during preparation. Check again.')
    installer.private_support(Path(config['supportDirectory']))
    with companion_lock(Path(config['supportDirectory']), create=True):
        if installer.running_apps([app, staged]): raise ValueError('An application is still running; replacement is blocked.')
        subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(staged)], check=True, capture_output=True)
        state = dict(phase='publishing', exchanges=[])
        journal = directory / 'transaction.json'
        def exchange(a, b):
            state['exchanges'].append(dict(left=str(a), right=str(b), leftIdentity=identity(a), rightIdentity=identity(b)))
            atomic(journal, state)
            swap(a, b)
        try:
            if request['updateCLI']:
                manifest_file = root / 'install-manifest.json'
                if hashlib.sha256(manifest_file.read_bytes()).hexdigest() != request['cli']['manifestHash']:
                    raise ValueError('CLI configuration changed during preparation.')
                if hashlib.sha256((root / 'bin/jumpybrain').read_bytes()).hexdigest() != request['cli']['shimHash']:
                    raise ValueError('CLI executable changed during preparation.')
                manifest = json.loads(manifest_file.read_text())
                manifest.update(installedVersion=request['release']['version'], release=request['release'], updatedAt=request['preparedAt'])
                atomic(directory / 'new-manifest.json', manifest)
                exchange(root / 'app', source)
                exchange(manifest_file, directory / 'new-manifest.json')
            exchange(app, staged)
            state['phase'] = 'published'; atomic(journal, state)
        except BaseException:
            rollback(directory)
            raise

if __name__ == '__main__':
    operation, directory = sys.argv[1], Path(sys.argv[2])
    if operation == 'extract': extract(directory / 'release.tgz', directory / 'unpacked')
    elif operation == 'publish': publish(directory)
    elif operation == 'rollback': guarded_rollback(directory)
    else: raise ValueError('Unsupported update operation.')
