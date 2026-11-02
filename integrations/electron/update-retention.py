"""Protocol-1 owned update retention. Unknown/unfinished generations are never aged out."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat


def ordinary(file, directory=False):
    info = file.lstat()
    if info.st_uid != os.getuid() or not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1):
        raise ValueError('Unsafe retention path')
    return info


def packet(file):
    if ordinary(file).st_size > 131072: raise ValueError('Oversized retention record')
    return json.loads(file.read_text())


def alive(pid):
    if not isinstance(pid, int) or pid < 2: raise ValueError('Unknown process owner')
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False


def runtimes(directory):
    for relative in ['built/jumpyBrain.app/Contents/Resources/runtime', 'unpacked/package']:
        current = directory
        for part in Path(relative).parts:
            current = current / part
            try: ordinary(current, True)
            except FileNotFoundError: break
        else: yield current


def inventory(updates):
    ordinary(updates, True)
    records = []
    # Bounded inspection of this updater's immediate owned namespace only.
    names = sorted(updates.iterdir())
    if len(names) > 256: raise ValueError('Too many update entries; inspect manually')
    for directory in names:
        if not re.fullmatch(r'update-[\w-]+', directory.name): continue
        try:
            ordinary(directory, True)
            record = packet(directory / 'retention.json')
            state = packet(directory / 'state.json')
            if record != {'schema': 1, 'terminal': True} or state['phase'] not in ['success', 'recovered', 'failed']: continue
            if alive(state['pid']): continue
            journal = directory / 'transaction.json'
            if journal.exists() and packet(journal)['phase'] not in ['success', 'rolled-back']: continue
            child = directory / 'child.json'
            if child.exists() and alive(packet(child)['pid']): continue
            records.append((state['updatedAt'], directory))
        except (OSError, ValueError, KeyError, TypeError): continue
    return [directory for _, directory in sorted(records, reverse=True)[2:]]


def retire_runtimes(candidates):
    sentinels = []
    try:
        for runtime in candidates:
            if not ordinary(runtime, True).st_mode & 0o200: raise ValueError('Frozen runtime')
            # Old releases have no pin protocol: retain for explicit migration.
            ordinary(runtime / 'dist/adapters/backend-host/runtime-pins.js')
            sentinel = runtime / '.retiring'
            with sentinel.open('x') as stream: stream.write('retention\n')
            sentinels.append(sentinel)
            pins = runtime / '.backend-pins'
            if pins.exists():
                ordinary(pins, True)
                entries = list(pins.iterdir())
                if len(entries) > 256: raise ValueError('Too many runtime pins')
                for pin in entries:
                    if alive(packet(pin)['pid']): raise ValueError('Live runtime pin')
        return sentinels
    except BaseException:
        for sentinel in sentinels: sentinel.unlink(missing_ok=True)
        raise


def retire(directory):
    return retire_runtimes(runtimes(directory))


def size(directory):
    total = count = 0
    for parent, directories, files in os.walk(directory, followlinks=False):
        for name in directories + files:
            info = (Path(parent) / name).lstat()
            if info.st_uid != os.getuid(): raise ValueError('Foreign staging entry')
            total += info.st_size; count += 1
            if count > 100000: raise ValueError('Oversized staging tree')
    return total


def retain(updates, apply=False):
    ordinary(updates, True)
    lock = os.open(updates / '.retention.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        ordinary(updates / '.retention.lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = []
        for directory in inventory(updates):
            sentinels = []
            try:
                sentinels = retire(directory)
                result.append({'directory': str(directory), 'bytes': size(directory)})
                if apply: shutil.rmtree(directory)
            except (OSError, ValueError, KeyError, TypeError): pass
            finally:
                for sentinel in sentinels: sentinel.unlink(missing_ok=True)
        return result
    finally: os.close(lock)


if __name__ == '__main__':
    import sys
    args = sys.argv[1:]
    if '--help' in args or '-h' in args:
        print('Private updater helper: update-retention.py <owned-updates> [--apply] | --runtime <owned-previous-runtime>')
    elif len(args) == 2 and args[0] == '--runtime' and not args[1].startswith('--'):
        runtime = Path(args[1]); retire_runtimes([runtime])
        print(json.dumps({'runtime': str(runtime), 'bytes': size(runtime)}))
    elif len(args) in [1, 2] and not args[0].startswith('--') and (len(args) == 1 or args[1] == '--apply'):
        print(json.dumps(retain(Path(args[0]), apply=len(args) == 2)))
    else: raise ValueError('Use --help for the private retention helper syntax.')
