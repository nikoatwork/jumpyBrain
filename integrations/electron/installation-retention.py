"""Installation-scoped software ownership and retention, protocol 1.

No memory traversal. Producers register exact containers before replacement and
publish rollback references only after verification. Unknown state fails closed.
Lock order is installer directory lock, then this module's advisory lock.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import socket
import stat
import sys
import time

spec = importlib.util.spec_from_file_location('runtime_retention', Path(__file__).with_name('update-retention.py'))
runtime_policy = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime_policy)
MAX_RECORDS = 256
HISTORY = 20
SOFT_BUDGET = 2 * 1024 ** 3
MAX_FILES = 200000
MAX_DEPTH = 64


def ordinary(file, directory=False):
    value = runtime_policy.ordinary(file, directory)
    return value


def identity(file):
    value = file.lstat()
    return [value.st_dev, value.st_ino]


def digest(file):
    if ordinary(file).st_size > SOFT_BUDGET: raise ValueError('Payload exceeds bounded hash verification; inspect manually')
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): value.update(chunk)
    return value.hexdigest()


def read(file, limit=1024 * 1024):
    if ordinary(file).st_size > limit: raise ValueError('Oversized ownership record')
    with file.open() as stream: return json.load(stream)


def atomic(file, value):
    temporary = file.with_name(file.name + '.' + secrets.token_hex(8) + '.tmp')
    try:
        with temporary.open('x') as stream:
            os.chmod(temporary, 0o600)
            json.dump(value, stream); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, file)
        fd = os.open(file.parent, os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally: temporary.unlink(missing_ok=True)


def overlap(a, b):
    return a == b or a in b.parents or b in a.parents


def remove_owned(name, parent, expected):
    """Descriptor-relative removal; retirement fences are the last children.

    An interrupted runtime keeps its fence until all executable files are gone.
    Symlinks are unlinked, never followed, including substituted directories.
    """
    info = os.stat(name, dir_fd=parent, follow_symlinks=False)
    if [info.st_dev, info.st_ino] != expected or info.st_uid != os.getuid(): raise ValueError('Deletion generation changed')
    if not stat.S_ISDIR(info.st_mode):
        if stat.S_ISREG(info.st_mode) and info.st_nlink != 1: raise ValueError('Hardlinked deletion entry')
        if not (stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode)): raise ValueError('Special deletion entry')
        os.unlink(name, dir_fd=parent); return
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        current = os.fstat(fd)
        if [current.st_dev, current.st_ino] != expected: raise ValueError('Deletion directory changed')
        with os.scandir(fd) as entries:
            children = []
            for child in entries:
                if len(children) >= MAX_FILES: raise ValueError('Deletion bound reached')
                stamp = child.stat(follow_symlinks=False)
                children.append((child.name, [stamp.st_dev, stamp.st_ino]))
        for child, stamp in sorted(children, key=lambda item: item[0] == '.retiring'):
            remove_owned(child, fd, stamp)
        final = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if [final.st_dev, final.st_ino] != expected: raise ValueError('Deletion directory moved')
        os.rmdir(name, dir_fd=parent)
    finally: os.close(fd)


class Store:
    def __init__(self, root, home):
        self.root = Path(os.path.abspath(root))
        self.home = Path(os.path.abspath(home))
        self.file = self.root / 'software-retention.json'
        self.lock = self.root / '.installer-lock'

    def load(self):
        if not os.path.lexists(self.file):
            return dict(schema=1, installation=secrets.token_hex(16), root=str(self.root), rootIdentity=identity(self.root), records=[], rollback={}, history=[])
        value = read(self.file)
        if ordinary(self.file).st_mode & 0o077: raise ValueError('Ownership ledger must be private')
        if value.get('schema') != 1 or value.get('root') != str(self.root) or value.get('rootIdentity') != identity(self.root) or not re.fullmatch(r'[a-f0-9]{32}', value.get('installation', '')):
            raise ValueError('Unknown installation ownership ledger')
        if not isinstance(value.get('records'), list) or len(value['records']) > MAX_RECORDS or len(value.get('history', [])) > HISTORY:
            raise ValueError('Unbounded ownership ledger')
        ids = [record['id'] for record in value['records']]
        if len(set(ids)) != len(ids) or any(not re.fullmatch(r'[a-f0-9]{32}', key) for key in ids): raise ValueError('Invalid generation identities')
        allowed = {'source-cli': ['app'], 'updater': ['unpacked/package', 'built/jumpyBrain.app/Contents/Resources/runtime'],
                   'dogfood': ['unpacked/package', 'built/jumpyBrain.app/Contents/Resources/runtime'],
                   'desktop': [name + '/Contents/Resources/runtime' for name in ['jumpyBrain.app', 'jumpyBrain Desktop.app', 'jumpyBrain Electron.app']],
                   'legacy-companion': ['old', 'old.app/Contents/Resources/runtime']}
        for record in value['records']:
            if record.get('producer') not in allowed or record.get('phase') not in ['preparing', 'terminal', 'recovery']:
                raise ValueError('Unknown generation contract')
            if not isinstance(record.get('components'), list) or set(record['components']) - {'cli', 'desktop'}:
                raise ValueError('Unknown rollback components')
            if not isinstance(record.get('payloads'), list) or len(record['payloads']) > 4: raise ValueError('Unbounded generation payloads')
            for payload in record['payloads']:
                if not isinstance(payload.get('runtimes'), list) or len(payload['runtimes']) > 4 or any(p not in allowed[record['producer']] for p in payload['runtimes']):
                    raise ValueError('Unknown runtime ownership reference')
                if not isinstance(payload.get('identity'), list) or len(payload['identity']) != 2 or any(type(n) is not int or n < 0 for n in payload['identity']):
                    raise ValueError('Unknown payload generation')
                if record['phase'] == 'terminal':
                    generations = payload.get('runtimeIdentities', [])
                    if len(generations) != len(payload['runtimes']) or any(not isinstance(g, list) or len(g) != 2 or any(type(n) is not int or n < 0 for n in g) for g in generations):
                        raise ValueError('Uncertain terminal runtime generations')
        if not isinstance(value.get('rollback'), dict) or set(value['rollback']) - {'cli', 'desktop'} or any(key not in ids for key in value['rollback'].values()):
            raise ValueError('Dangling rollback references; inspect ownership ledger')
        return value

    def save(self, value):
        if len(json.dumps(value).encode()) > 1024 * 1024: raise ValueError('Ownership ledger is full; inspect retained generations')
        atomic(self.file, value)

    @contextmanager
    def locked(self, owner=None):
        ordinary(self.root, True)
        if self.root.is_symlink(): raise ValueError('Linked installation root')
        acquired = False
        if owner is None:
            self.lock.mkdir(mode=0o700); acquired = True
            atomic(self.lock / 'owner.json', dict(pid=os.getpid(), host=socket.gethostname()))
        else:
            ordinary(self.lock, True)
            if self.lock.stat().st_mode & 0o077: raise ValueError('Unsafe installer lock')
            packet = None
            for name in ['owner.json', 'desktop.json']:
                if os.path.lexists(self.lock / name):
                    candidate = read(self.lock / name)
                    if candidate.get('pid') == owner: packet = candidate; break
            if packet is None or not runtime_policy.alive(owner) or ('host' in packet and packet['host'] != socket.gethostname()):
                raise ValueError('Installer lock handoff changed')
        fd = None
        try:
            lockfile = self.root / '.software-retention.lock'
            fd = os.open(lockfile, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            locked = ordinary(lockfile)
            if (os.fstat(fd).st_dev, os.fstat(fd).st_ino) != (locked.st_dev, locked.st_ino): raise ValueError('Retention lock changed')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield
        finally:
            if fd is not None: os.close(fd)
            if acquired:
                (self.lock / 'owner.json').unlink(); self.lock.rmdir()

    def namespaces(self):
        result = [(self.root, r'app\.(?:previous|installing)-[\w-]+|\.companion-runtime-[\w-]+')]
        if self.root == self.home / '.jumpybrain':
            result += [(self.root / 'dogfood', r'candidate-[\w-]+'),
                       (self.home / 'Applications', r'\.jumpybrain-install-[\w-]+|\.companion-app-[\w-]+'),
                       (self.home / 'Library/Application Support/jumpyBrain Updates', r'update-[\w-]+'),
                       (self.home / 'Library/Application Support/jumpyBrain Backups', r'before-[\w-]+\.tar\.gz')]
        return result

    def safe_path(self, file):
        file = Path(file)
        if not file.is_absolute() or '..' in file.parts: raise ValueError('Noncanonical payload path')
        for parent, pattern in self.namespaces():
            if file.parent != parent or not re.fullmatch(pattern, file.name): continue
            # Never follow a substituted store directory, including linked ancestors.
            anchor = self.root if self.root in file.parents else self.home
            ordinary(anchor, True)
            current = anchor
            for part in file.relative_to(anchor).parts[:-1]:
                current /= part; ordinary(current, True)
            return file
        raise ValueError('Payload is outside a producer-owned namespace')

    def preserved(self):
        paths = [self.root / name for name in ['app', 'bin', 'engines', 'memory', 'cli-config.json', 'install-manifest.json']]
        paths += [self.home / 'Applications/jumpyBrain.app', self.home / '.jumpybrain-runtime-pins']
        manifests = [self.root / 'install-manifest.json']
        if self.root == self.home / '.jumpybrain':
            manifests += [self.home / 'Applications/jumpyBrain.app/Contents/Resources/native/jumpyBrain Host.app/Contents/Resources/Configuration.json']
        for file in manifests:
            if not os.path.lexists(file): continue
            # Unsafe/malformed configuration blocks pruning rather than discarding its exclusions.
            packet = read(file)
            for key in ['memoryRoot', 'supportDirectory', 'node', 'qmd', 'launchAgent', 'legacyLaunchAgent']:
                if packet.get(key):
                    p = Path(packet[key])
                    if not p.is_absolute(): raise ValueError('Uncertain protected path')
                    paths.append(p)
        return [p.resolve() for p in paths]

    def payload(self, file, role='rollback', runtimes=()):
        file = self.safe_path(file)
        value = file.lstat()
        ordinary(file, stat.S_ISDIR(value.st_mode))
        if any(overlap(file.resolve(), p) for p in self.preserved()): raise ValueError('Software overlaps protected data')
        return dict(path=str(file), identity=identity(file), directory=stat.S_ISDIR(value.st_mode), role=role,
                    runtimes=[str(p) for p in runtimes])

    def begin(self, producer, payloads, components):
        ledger = self.load()
        if len(ledger['records']) >= MAX_RECORDS: raise ValueError('Too many retained software generations')
        if producer not in ['updater', 'desktop', 'source-cli', 'dogfood', 'legacy-companion']: raise ValueError('Unknown software producer')
        if set(components) - {'cli', 'desktop'}: raise ValueError('Unknown rollback component')
        record = dict(id=secrets.token_hex(16), producer=producer, phase='preparing', pid=os.getpid(), createdAt=time.time(),
                      components=list(components), payloads=payloads)
        for payload in payloads:
            if any(overlap(Path(payload['path']), Path(other['path'])) for r in ledger['records'] for other in r['payloads']):
                raise ValueError('Software already belongs to a generation')
        ledger['records'].append(record); self.save(ledger)
        return record['id']

    def finish(self, key, *, outcome='success', payloads=None, versions=None):
        ledger = self.load()
        record = next(r for r in ledger['records'] if r['id'] == key)
        if outcome not in ['success', 'failed', 'rolled-back', 'recovery']: raise ValueError('Unknown terminal outcome')
        # A lost finish response may be inspected/repeated, but a stale repeat
        # must never re-select an older generation after a later installation.
        if record['phase'] == 'terminal':
            if record.get('outcome') == outcome: return key
            raise ValueError('Reopen recovery before changing a terminal outcome')
        if payloads is not None: record['payloads'] = payloads
        for payload in record['payloads']:
            file = self.safe_path(payload['path'])
            if identity(file) != payload['identity']: raise ValueError('Software generation changed')
            if not payload['directory']: payload['sha256'] = digest(file)
            payload['runtimeIdentities'] = []
            payload['runtimeVersions'] = []
            for relative in payload['runtimes']:
                runtime = file / relative
                if not runtime.is_relative_to(file) or '..' in Path(relative).parts: raise ValueError('Unsafe runtime path')
                current = file
                for part in Path(relative).parts:
                    current /= part; ordinary(current, True)
                payload['runtimeIdentities'].append(identity(runtime))
                package = read(runtime / 'package.json')
                if package.get('name') != 'jumpybrain' or not isinstance(package.get('version'), str): raise ValueError('Unverified rollback runtime')
                ordinary(runtime / 'dist/cli.js')
                payload['runtimeVersions'].append(package['version'])
        record.update(phase='terminal' if outcome != 'recovery' else 'recovery', outcome=outcome, finishedAt=time.time(), versions=versions or {})
        if outcome in ['success', 'rolled-back']:
            for component in record['components']: ledger['rollback'][component] = key
        self.save(ledger)
        if self.root == self.home / '.jumpybrain':
            current = self.root / 'dogfood/current.json'
            if os.path.lexists(current):
                receipt = read(current)
                if receipt.get('generation') and receipt['generation'] not in ledger['rollback'].values() and receipt.get('phase') == 'installed':
                    atomic(current, {**receipt, 'phase': 'superseded', 'directory': None})
        return key

    def recover(self, key):
        ledger = self.load()
        record = next(r for r in ledger['records'] if r['id'] == key)
        record['phase'] = 'recovery'; self.save(ledger)

    def inspect_payload(self, payload, preserved, *, installed=False):
        if payload.get('role') not in ['rollback', 'temporary'] or type(payload.get('directory')) is not bool: raise ValueError('Unknown payload ownership schema')
        file = Path(payload['path']) if installed else self.safe_path(payload['path'])
        ordinary(file, payload['directory'])
        if identity(file) != payload['identity']: raise ValueError('Software path/generation changed')
        if not installed and any(overlap(file.resolve(), p) for p in preserved): raise ValueError('Software overlaps protected data')
        total = allocated = count = 0
        stack = [(file, 0)]
        while stack:
            current, depth = stack.pop()
            info = current.lstat(); count += 1
            if count > MAX_FILES or depth > MAX_DEPTH: raise ValueError('Software inventory bound reached')
            if info.st_uid != os.getuid(): raise ValueError('Foreign software entry')
            if not installed and stat.S_ISREG(info.st_mode) and info.st_nlink != 1: raise ValueError('Hardlinked software entry')
            if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode)): raise ValueError('Special software entry')
            # Internal bundle/npm symlinks may be unlinked, never traversed.
            if not installed and stat.S_ISLNK(info.st_mode) and (current == file or not current.resolve().is_relative_to(file)):
                raise ValueError('External software symlink')
            total += info.st_size; allocated += getattr(info, 'st_blocks', 0) * 512
            if stat.S_ISDIR(info.st_mode):
                with os.scandir(current) as entries:
                    for entry in entries:
                        stack.append((Path(entry.path), depth + 1))
                        if len(stack) + count > MAX_FILES: raise ValueError('Software inventory bound reached')
        if identity(file) != payload['identity']: raise ValueError('Software changed during inventory')
        if not payload['directory'] and payload.get('sha256') and digest(file) != payload['sha256']:
            raise ValueError('Verified software archive changed')
        return dict(logicalBytes=total, allocatedBytes=allocated, files=count)

    def installed_footprint(self):
        paths = []
        manifest_file = self.root / 'install-manifest.json'
        if os.path.lexists(manifest_file):
            manifest = read(manifest_file)
            if manifest.get('installer') == 'jumpybrain-installer' and manifest.get('appDir') == str(self.root / 'app'):
                paths.append(self.root / 'app')
        if self.root == self.home / '.jumpybrain':
            app = self.home / 'Applications/jumpyBrain.app'
            if os.path.lexists(app):
                import plistlib
                info = app / 'Contents/Info.plist'
                ordinary(app, True); ordinary(info)
                if info.stat().st_size > 131072: raise ValueError('Oversized application identity')
                if plistlib.loads(info.read_bytes()).get('CFBundleIdentifier') in ['local.jumpybrain.desktop', 'local.jumpybrain.companion']:
                    paths.append(app)
        entries = []
        for file in paths:
            item = dict(path=str(file), status='protected', reason='Current installation', logicalBytes=0, allocatedBytes=0)
            try:
                item.update(self.inspect_payload(dict(path=str(file), identity=identity(file), directory=True, role='rollback'), [], installed=True))
            except (OSError, ValueError): item.update(status='unknown', reason='Current software size unavailable; inspect installation')
            entries.append(item)
        return entries

    def runtime_check(self, payload):
        file = Path(payload['path'])
        if payload.get('deletion'):
            fences = payload['deletion']['fences']
            if len(fences) != len(payload['runtimes']): raise ValueError('Uncertain interrupted runtime fences')
            for relative, generation, fence in zip(payload['runtimes'], payload.get('runtimeIdentities', []), fences):
                runtime = file / relative
                if os.path.lexists(runtime):
                    ordinary(runtime, True)
                    if identity(runtime) != generation: raise ValueError('Interrupted runtime generation changed')
                bundled = runtime.name == 'runtime' and runtime.parent.name == 'Resources' and runtime.parent.parent.name == 'Contents' and runtime.parents[2].name.endswith('.app')
                expected = (self.home / '.jumpybrain-runtime-pins' / f'{generation[0]}-{generation[1]}' if bundled else runtime) / '.retiring'
                if fence['path'] != str(expected): raise ValueError('Interrupted runtime fence moved')
            for fence in payload['deletion']['fences']:
                path = Path(fence['path'])
                if os.path.lexists(path):
                    ordinary(path)
                    if identity(path) != fence['identity']: raise ValueError('Interrupted retirement fence changed')
                elif path.parent.exists() and any(path.parent.iterdir()):
                    raise ValueError('Interrupted runtime lost its retirement fence')
            return
        expected = payload.get('runtimeIdentities', [])
        if len(expected) != len(payload['runtimes']): raise ValueError('Unverified runtime generations')
        for relative, generation in zip(payload['runtimes'], expected):
            runtime_policy.inspect_runtime(file / relative, home=self.home, expected=generation)

    def inventory(self, ledger):
        preserved = self.preserved()
        entries = []
        for record in ledger['records']:
            for payload in record['payloads']:
                item = dict(generation=record['id'], producer=record['producer'], path=payload['path'], status='protected', reason='', logicalBytes=0, allocatedBytes=0)
                try:
                    size = self.inspect_payload(payload, preserved); item.update(size)
                    if record['phase'] != 'terminal': raise ValueError('Incomplete transaction/recovery')
                    current = self.root / 'dogfood/current.json'
                    if os.path.lexists(current):
                        receipt = read(current)
                        if receipt.get('phase') == 'installed' and receipt.get('directory') == payload['path']:
                            raise ValueError('Current dogfood rollback receipt')
                    if payload['role'] == 'rollback' and record['id'] in ledger['rollback'].values():
                        for relative, generation, version in zip(payload['runtimes'], payload.get('runtimeIdentities', []), payload.get('runtimeVersions', [])):
                            runtime = Path(payload['path']) / relative
                            if identity(runtime) != generation or read(runtime / 'package.json').get('version') != version: raise ValueError('Selected rollback changed; inspect before recovery')
                            ordinary(runtime / 'dist/cli.js')
                        raise ValueError('Selected verified rollback')
                    # The shared installer lock protects active writers. Terminal
                    # workers can have a child still draining; their receipts do not override pins.
                    directory = Path(payload['path'])
                    for name in ['state.json', 'child.json'] if payload['directory'] else []:
                        if os.path.lexists(directory / name) and runtime_policy.alive(read(directory / name)['pid']): raise ValueError('Active worker/child')
                    if os.path.lexists(directory / 'transaction.json') and payload['directory']:
                        if read(directory / 'transaction.json')['phase'] not in ['success', 'rolled-back']: raise ValueError('Incomplete transaction journal')
                    self.runtime_check(payload)
                    item.update(status='reclaimable', reason='Superseded owned software' if payload['role'] == 'rollback' else 'Terminal disposable payload')
                except FileNotFoundError:
                    if os.path.lexists(payload['path']) or record['id'] in ledger['rollback'].values(): item.update(status='unknown', reason='Damaged software tree or selected rollback')
                    else: item.update(status='missing', reason='Payload already removed')
                except (OSError, ValueError, KeyError, TypeError) as error:
                    item['reason'] = str(error)[:200] or type(error).__name__
                entries.append(item)
        known = {p['path'] for r in ledger['records'] for p in r['payloads']}
        for parent, pattern in self.namespaces():
            if not os.path.lexists(parent): continue
            ordinary(parent, True)
            # Inspect at most 256 entries, without sorting/materializing an arbitrary folder.
            with os.scandir(parent) as children:
                for number, child in enumerate(children):
                    if number >= MAX_RECORDS:
                        entries.append(dict(path=str(parent), status='unknown', reason='Namespace inventory truncated', logicalBytes=0, allocatedBytes=0)); break
                    if re.fullmatch(pattern, child.name) and child.path not in known:
                        entries.append(dict(path=child.path, status='unknown', reason='No verified ownership receipt', logicalBytes=0, allocatedBytes=0))
        return entries

    def report(self, ledger, entries, removed=()):
        total = sum(e['logicalBytes'] for e in entries if e['status'] != 'removed')
        current = self.installed_footprint()
        return dict(schema=1, installation=ledger['installation'], accounting='lstat logical bytes; allocated st_blocks*512, no APFS reclaim guarantee; unknown trees unmeasured',
                    softBudgetBytes=SOFT_BUDGET, overBudget=total > SOFT_BUDGET, ownedLogicalBytes=total,
                    installedLogicalBytes=sum(e['logicalBytes'] for e in current), ownedSoftwareBytes=total + sum(e['logicalBytes'] for e in current), current=current,
                    footprintComplete=len(entries) <= 768 and not any(e['status'] == 'unknown' for e in entries + current),
                    eligibleBytes=sum(e['logicalBytes'] for e in entries if e['status'] == 'reclaimable'),
                    protectedBytes=sum(e['logicalBytes'] for e in entries if e['status'] == 'protected'),
                    rollback=ledger['rollback'], rollbackDetails={component: dict(generation=key, producer=next(r['producer'] for r in ledger['records'] if r['id'] == key), versions=next(r.get('versions', {}) for r in ledger['records'] if r['id'] == key),
                        paths=[p['path'] for r in ledger['records'] if r['id'] == key for p in r['payloads'] if p['role'] == 'rollback']) for component, key in ledger['rollback'].items()},
                    entries=entries[:768], entriesTruncated=max(0, len(entries) - 768), removed=list(removed)[:256], removedCount=len(removed), lastCleanup=ledger.get('lastCleanup'),
                    retry='Next verified installation or managed app startup; installation-storage --apply retries now',
                    guidance='Protected software may exceed the soft budget. Inspect listed reasons; do not remove live/recovery copies.' if total > SOFT_BUDGET else None)

    def cleanup(self, apply=False):
        ledger = self.load(); entries = self.inventory(ledger)
        if not apply: return self.report(ledger, entries)
        for record in list(ledger['records']):
            if record['phase'] == 'terminal' and not record['payloads'] and record['id'] not in ledger['rollback'].values():
                ledger['records'].remove(record)
                ledger['history'] = (ledger['history'] + [dict(generation=record['id'], producer=record['producer'], outcome=record.get('outcome'), removedAt=time.time())])[-HISTORY:]
        self.save(ledger)
        removed = []
        for item in entries:
            if item['status'] not in ['reclaimable', 'missing']: continue
            record = next(r for r in ledger['records'] if r['id'] == item['generation'])
            payload = next(p for p in record['payloads'] if p['path'] == item['path'])
            sentinels = []
            try:
                if item['status'] != 'missing':
                    self.inspect_payload(payload, self.preserved())
                    # Re-read references immediately before fencing/deletion.
                    fresh = self.load()
                    if fresh != ledger: raise ValueError('Ownership plan changed')
                    if payload.get('deletion'):
                        self.runtime_check(payload)
                        sentinels = [Path(f['path']) for f in payload['deletion']['fences'] if os.path.lexists(f['path'])]
                    else:
                        paths = [Path(payload['path']) / relative for relative in payload['runtimes']]
                        sentinels = runtime_policy.retire_runtimes(paths, home=self.home, expected=payload.get('runtimeIdentities', []))
                        payload['deletion'] = dict(fences=[dict(path=str(p), identity=identity(p)) for p in sentinels])
                        self.save(ledger)
                    self.inspect_payload(payload, self.preserved())
                    # fd-safe rmtree never follows a replacement symlink. Its root
                    # identity is checked again with the parent descriptor held.
                    file = Path(payload['path'])
                    parent = os.open(file.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                    try:
                        info = os.stat(file.name, dir_fd=parent, follow_symlinks=False)
                        if [info.st_dev, info.st_ino] != payload['identity']: raise ValueError('Deletion generation changed')
                        remove_owned(file.name, parent, payload['identity'])
                    finally: os.close(parent)
                    removed.append(dict(path=item['path'], logicalBytes=item['logicalBytes'], allocatedBytes=item['allocatedBytes']))
                    item.update(status='removed', reason='Removed owned payload')
                record['payloads'].remove(payload)
                if not record['payloads'] and record['id'] not in ledger['rollback'].values():
                    ledger['records'].remove(record)
                    ledger['history'] = (ledger['history'] + [dict(generation=record['id'], producer=record['producer'], outcome=record.get('outcome'), removedAt=time.time())])[-HISTORY:]
                self.save(ledger)
            except (OSError, ValueError, KeyError, TypeError) as error:
                item.update(status='protected', reason='Cleanup deferred: ' + (str(error)[:180] or type(error).__name__))
            finally:
                # Interrupted deletion keeps durable fences. A retry verifies
                # their identities; a missing/changed fence fails closed.
                if not os.path.lexists(payload['path']):
                    for sentinel in sentinels: sentinel.unlink(missing_ok=True)
        ledger['lastCleanup'] = dict(at=time.time(), removed=removed[:256], deferred=sum(e['status'] in ['protected', 'unknown'] for e in entries))
        self.save(ledger)
        return self.report(ledger, entries, removed)


def main():
    # JSON stdin keeps paths and lock handoffs out of shell interpolation.
    args = json.load(sys.stdin)
    store = Store(args['root'], args['home'])
    operation = args['operation']
    if operation == 'preview': result = store.cleanup()
    else:
        with store.locked(args.get('owner')):
            if operation == 'begin':
                payloads = [store.payload(p['path'], p.get('role', 'rollback'), p.get('runtimes', [])) for p in args['payloads']]
                result = store.begin(args['producer'], payloads, args.get('components', []))
            elif operation == 'finish':
                payloads = None if 'payloads' not in args else [store.payload(p['path'], p.get('role', 'rollback'), p.get('runtimes', [])) for p in args['payloads']]
                result = store.finish(args['generation'], outcome=args.get('outcome', 'success'), payloads=payloads, versions=args.get('versions'))
            elif operation == 'apply': result = store.cleanup(True)
            elif operation == 'recover': result = store.recover(args['generation'])
            else: raise ValueError('Unknown storage operation')
    print(json.dumps(result))


if __name__ == '__main__': main()
