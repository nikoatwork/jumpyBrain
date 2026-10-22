"""Extract a verified release into an empty private staging directory, without links."""
from pathlib import Path, PurePosixPath
import sys
import tarfile


def extract(archive, destination):
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        if len(members) > 20000 or sum(item.size for item in members) > 256 * 1024 * 1024:
            raise ValueError('Release archive is too large.')
        seen = set()
        for item in members:
            name = PurePosixPath(item.name)
            if (name.is_absolute() or '..' in name.parts or not name.parts or name.parts[0] != 'package'
                    or '\\' in item.name or not (item.isfile() or item.isdir()) or name in seen):
                raise ValueError('Unsafe release archive.')
            seen.add(name)
        for item in members:
            target = destination / item.name
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as output, source.extractfile(item) as content:
                    while chunk := content.read(1024 * 1024):
                        output.write(chunk)
                target.chmod(0o700 if item.mode & 0o111 else 0o600)


if __name__ == '__main__':
    extract(Path(sys.argv[1]), Path(sys.argv[2]))
