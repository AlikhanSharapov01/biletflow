"""Checks that every stored file the database links to has its bytes in file storage.

Linked files are event gallery images (`event_media`), support attachments
(`support_attachment`) and stored ticket PDFs (`ticket.pdf_file_id`). Each linked file whose
`stored_file` row is `clean` must exist under its `object_key` with the recorded size and SHA-256.
Unlinked, pending, rejected and deleted files are not required to have bytes.

    python check_backup_consistency.py                        # DATABASE_URL and STORAGE_ROOT
    python check_backup_consistency.py --dsn URL --storage DIR
    python check_backup_consistency.py --dsn URL --storage-archive files.tar.gz   # "-" = stdin

Exit status: 0 consistent, 1 a linked file is missing or differs, 2 could not check (usage,
database or archive error). Read-only. Needs
only psycopg, which the backend image has, so tools/restore.sh and tools/verify_backup.sh run it
inside the api container. Runbook: docs/operations/backup.md
"""

import argparse
import hashlib
import os
import sys
import tarfile
from pathlib import Path, PurePosixPath

import psycopg

# (table, file id column, label), in the order the schema gained them.
LINKS = (
    ("ticket", "pdf_file_id", "ticket_pdf"),
    ("support_attachment", "file_id", "support_attachment"),
    ("event_media", "file_id", "event_image"),
)


def plain_dsn(url):
    """SQLAlchemy URLs (postgresql+psycopg://) also name the driver; psycopg wants libpq's form."""
    scheme, separator, rest = url.partition("://")
    return scheme.split("+", 1)[0] + separator + rest if separator else url


def linked_files(connection):
    """[(label, file_id, object_key, size_bytes, sha256, status)] for every existing link."""
    parts = []
    for table, column, label in LINKS:
        present = connection.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'biletflow' AND table_name = %s AND column_name = %s",
            (table, column),
        ).fetchone()
        if present:
            parts.append(
                f"SELECT '{label}' AS label, {column} AS file_id FROM biletflow.{table} "
                f"WHERE {column} IS NOT NULL"
            )
    if not parts:
        return []
    return connection.execute(
        "SELECT l.label, f.id, f.object_key, f.size_bytes, f.sha256, f.status FROM ("
        + " UNION ".join(parts)
        + ") l JOIN biletflow.stored_file f ON f.id = l.file_id ORDER BY l.label, f.object_key"
    ).fetchall()


def digest(stream):
    hasher, size = hashlib.sha256(), 0
    for chunk in iter(lambda: stream.read(1 << 20), b""):
        hasher.update(chunk)
        size += len(chunk)
    return size, hasher.hexdigest()


def safe_key(key):
    parts = PurePosixPath(key).parts
    return bool(key) and not key.startswith("/") and ".." not in parts and "\\" not in key


def objects_in_directory(root, keys):
    found = {}
    for key in keys:
        path = Path(root, *key.split("/"))
        if safe_key(key) and path.is_file():
            with path.open("rb") as handle:
                found[key] = digest(handle)
    return found


def objects_in_archive(source, keys):
    found = {}
    stream = sys.stdin.buffer if source == "-" else open(source, "rb")
    with stream, tarfile.open(fileobj=stream, mode="r|gz") as archive:
        for member in archive:
            key = member.name.removeprefix("./")
            if member.isfile() and key in keys:
                found[key] = digest(archive.extractfile(member))
    return found


def check(rows, found):
    """Problems as printable lines; an empty list means consistent."""
    problems = []
    for label, file_id, key, size, sha256, status in rows:
        if status != "clean":
            continue
        if key not in found:
            problems.append(f"MISSING {label} {key} (stored_file {file_id})")
        elif found[key] != (size, sha256):
            problems.append(f"DIFFERS {label} {key} (stored_file {file_id})")
    return problems


def main(argv=None):
    parser = argparse.ArgumentParser(prog="check_backup_consistency", description=__doc__)
    parser.add_argument("--dsn", default=os.environ.get("DATABASE_URL"))
    where = parser.add_mutually_exclusive_group()
    where.add_argument("--storage", default=os.environ.get("STORAGE_ROOT"))
    where.add_argument("--storage-archive")
    args = parser.parse_args(argv)
    if not args.dsn or not (args.storage or args.storage_archive):
        parser.error("set --dsn and --storage/--storage-archive (or DATABASE_URL, STORAGE_ROOT)")

    try:
        with psycopg.connect(plain_dsn(args.dsn)) as connection:
            connection.read_only = True
            rows = linked_files(connection)
        keys = {row[2] for row in rows if row[5] == "clean"}
        if args.storage_archive:
            found = objects_in_archive(args.storage_archive, keys)
        else:
            found = objects_in_directory(args.storage, keys)
    except (psycopg.Error, OSError, tarfile.TarError) as error:
        print(f"Could not check the files: {type(error).__name__}: {error}", file=sys.stderr)
        return 2

    problems = check(rows, found)
    for line in problems:
        print(line)
    counts = {}
    for row in rows:
        if row[5] == "clean":
            counts[row[0]] = counts.get(row[0], 0) + 1
    summary = ", ".join(f"{count} {label}" for label, count in sorted(counts.items())) or "none"
    if problems:
        print(f"INCONSISTENT: {len(problems)} of {len(keys)} linked files are missing or differ.")
        return 1
    print(f"OK: every linked file is present and matches its checksum ({summary}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
