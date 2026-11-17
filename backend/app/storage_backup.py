"""Object-store backup and restore for tools/backup.sh and tools/restore.sh (#77).

    python -m app.storage_backup export  > files.tar.gz   # every object of the bucket
    python -m app.storage_backup restore < files.tar.gz   # make the bucket equal the archive

Runs inside the api image with the app's own settings and bucket-scoped storage account, so the
operator tooling needs no other credentials. The archive is a gzipped tar whose member names are
the object keys, the same format `tar -czf - -C <STORAGE_ROOT> .` produced before #77, so older
backups restore into the bucket and tools/check_backup_consistency.py reads either.

`restore` writes every archived object first and only then deletes objects the archive lacks, so
an interrupted restore can simply be run again. Exit status: 0 done, 1 storage or archive error,
2 not configured for S3. Messages go to stderr; stdout carries only the archive.
"""

import argparse
import io
import sys
import tarfile
import time

from .config import Settings
from .storage import S3FileStorage, storage_from_settings

# LocalFileStorage's temporary upload files, which archives of the old file volume may hold.
TEMPORARY_PREFIX = ".upload-"


def configured_storage():
    return storage_from_settings(Settings())


def export(storage, stream):
    """Write every object to `stream` as files.tar.gz; return how many were archived."""
    count = 0
    with tarfile.open(fileobj=stream, mode="w|gz") as archive:
        for key in storage.keys():
            try:
                data = storage.get(key)
            except FileNotFoundError:
                continue  # deleted since the listing (only possible in an --online backup)
            info = tarfile.TarInfo(key)
            info.size, info.mtime, info.mode = len(data), int(time.time()), 0o600
            archive.addfile(info, io.BytesIO(data))
            count += 1
    return count


def restore(storage, stream):
    """Make the bucket hold exactly the archive's objects; return (restored, removed)."""
    restored = set()
    with tarfile.open(fileobj=stream, mode="r|gz") as archive:
        for member in archive:
            key = member.name.removeprefix("./")
            if not member.isfile() or key.rsplit("/", 1)[-1].startswith(TEMPORARY_PREFIX):
                continue
            storage.put(key, archive.extractfile(member).read())  # unsafe keys: ValueError
            restored.add(key)
    extra = [key for key in storage.keys() if key not in restored]
    for key in extra:
        storage.delete(key)
    return len(restored), len(extra)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m app.storage_backup", description=__doc__)
    parser.add_argument("command", choices=["export", "restore"])
    args = parser.parse_args(argv)
    storage = configured_storage()
    if not isinstance(storage, S3FileStorage):
        print("Object-store backup needs STORAGE_BACKEND=s3.", file=sys.stderr)
        return 2
    try:
        if args.command == "export":
            count = export(storage, sys.stdout.buffer)
            print(f"Archived {count} objects.", file=sys.stderr)
        else:
            restored, removed = restore(storage, sys.stdin.buffer)
            print(
                f"Restored {restored} objects; removed {removed} not in the backup.",
                file=sys.stderr,
            )
    except (OSError, ValueError, tarfile.TarError) as error:
        print(
            f"Object storage {args.command} failed: {type(error).__name__}: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
