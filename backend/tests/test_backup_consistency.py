"""Backups whose database and files match (#69, AC-27).

Protocol tests run the real tools/backup.sh against a stand-in `docker` that logs every Compose
call and emulates api/worker as running or stopped. Its BACKUP_TEST_HOOK runs exactly between the
dump and the file archive and deletes an image's bytes the way the API does, but only while api
is running. They prove what the guarantee rests on: api and worker are stopped before the dump
and started only after the archive, also when a step fails or the script is interrupted, so a
deletion in that window cannot happen; with --online it does, and the archive loses the file.

Checker tests use the real API and test database: an image deleted after the database state is
read and before the files are (the online interleaving) is reported as missing.

The Compose path itself (real containers, restore into a fresh stack) runs in the Backup workflow.
"""

import importlib.util
import io
import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import psycopg
import pytest

from tests.test_event_images import upload

REPO = Path(__file__).resolve().parents[2]
BACKUP = REPO / "tools" / "backup.sh"
API = "/api/v1"

needs_shell = pytest.mark.skipif(
    not (shutil.which("bash") and shutil.which("sha256sum") and shutil.which("tar")),
    reason="needs bash, tar and sha256sum",
)

FAKE_DOCKER = r"""#!/usr/bin/env bash
[ "$1" = compose ] || exit 64
shift
echo "$*" >>"$FAKE_LOG"
case "$1" in
  ps) echo db; cat "$FAKE_STATE" ;;
  stop) shift; for s in "$@"; do grep -vx "$s" "$FAKE_STATE" >"$FAKE_STATE.new" || true
          mv "$FAKE_STATE.new" "$FAKE_STATE"; done ;;
  start) shift; for s in "$@"; do echo "$s" >>"$FAKE_STATE"; done ;;
  exec)
    case "$*" in
      *pg_isready*) ;;
      *pg_stat_activity*) echo "${FAKE_SESSIONS:-0}" ;;
      *pg_dump*) [ -z "${FAKE_FAIL_DUMP:-}" ] || exit 1; echo dump ;;
      *pg_restore*) cat >/dev/null ;;
      *) exit 65 ;;
    esac ;;
  run) tar -czf - -C "$FAKE_STORAGE" . ;;
  *) exit 66 ;;
esac
"""

# What DELETE /events/{id}/images/{image_id} does to storage, if the API is up to receive it.
DELETE_IF_API_RUNNING = (
    'if grep -qx api "$FAKE_STATE"; then rm "$FAKE_STORAGE/events/e/image.png"; '
    'echo hook: deleted >>"$FAKE_LOG"; else echo hook: refused >>"$FAKE_LOG"; fi'
)


@pytest.fixture
def stack(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "docker").write_text(FAKE_DOCKER)
    (bin_dir / "docker").chmod(0o755)
    storage = tmp_path / "volume"
    (storage / "events" / "e").mkdir(parents=True)
    (storage / "events" / "e" / "image.png").write_bytes(b"png bytes")
    state = tmp_path / "running"
    state.write_text("api\nworker\n")
    out = tmp_path / "out"
    env = {
        **os.environ,
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        "FAKE_LOG": str(tmp_path / "compose.log"),
        "FAKE_STATE": str(state),
        "FAKE_STORAGE": str(storage),
    }
    env.pop("BACKUP_TEST_HOOK", None)

    def run(*args, **extra):
        result = subprocess.run(
            ["bash", str(BACKUP), *args, str(out)],
            env={**env, **extra},
            capture_output=True,
            text=True,
            timeout=60,
        )
        log_file = Path(env["FAKE_LOG"])
        log = log_file.read_text().splitlines() if log_file.exists() else []
        backups = sorted(out.glob("biletflow-*.tar")) if out.exists() else []
        return result, log, backups, set(state.read_text().split())

    return run


def index(log, prefix):
    return next(i for i, line in enumerate(log) if line.startswith(prefix))


def archived(backup):
    """(manifest text, names in files.tar.gz) of a backup written by tools/backup.sh."""
    with tarfile.open(backup) as outer:
        manifest = outer.extractfile("./manifest.txt").read().decode()
        files = outer.extractfile("./files.tar.gz").read()
    with tarfile.open(fileobj=io.BytesIO(files), mode="r:gz") as inner:
        return manifest, {m.name.removeprefix("./") for m in inner.getmembers() if m.isfile()}


@needs_shell
def test_quiesced_backup_keeps_an_image_deleted_between_dump_and_archive(stack):
    result, log, backups, running = stack(BACKUP_TEST_HOOK=DELETE_IF_API_RUNNING)
    assert result.returncode == 0, result.stderr
    stop, dump = index(log, "stop api worker"), index(log, "exec -T db pg_dump")
    hook, archive = index(log, "hook:"), index(log, "run --rm --no-deps -T api tar")
    start = index(log, "start ")
    assert stop < dump < hook < archive < start
    assert index(log, "exec -T db psql") < dump  # waited for other sessions to close
    assert log[hook] == "hook: refused"
    assert sorted(log[start].split()[1:]) == ["api", "worker"]
    assert running == {"api", "worker"}
    manifest, names = archived(backups[0])
    assert "consistency=quiesced" in manifest.splitlines()
    assert "events/e/image.png" in names


@needs_shell
def test_online_backup_loses_an_image_deleted_between_dump_and_archive(stack):
    result, log, backups, running = stack("--online", BACKUP_TEST_HOOK=DELETE_IF_API_RUNNING)
    assert result.returncode == 0, result.stderr
    assert "WARNING: --online" in result.stderr
    assert not [line for line in log if line.startswith(("stop", "start"))]
    assert index(log, "exec -T db pg_dump") < index(log, "hook:") < index(log, "run ")
    assert "hook: deleted" in log
    manifest, names = archived(backups[0])
    assert "consistency=online" in manifest.splitlines()
    assert "events/e/image.png" not in names  # the dump still links it: the bug #69 describes


@needs_shell
def test_failed_dump_restarts_writers_and_writes_no_backup(stack):
    result, log, backups, running = stack(FAKE_FAIL_DUMP="1")
    assert result.returncode != 0
    assert "Backup FAILED" in result.stderr
    assert index(log, "stop api worker") < index(log, "start api worker")
    assert running == {"api", "worker"}
    assert backups == []


@needs_shell
def test_open_database_session_aborts_before_the_dump(stack):
    result, log, backups, running = stack(FAKE_SESSIONS="1", BACKUP_QUIESCE_TIMEOUT="0")
    assert result.returncode == 1
    assert "Other database sessions are still open" in result.stderr
    assert not [line for line in log if "pg_dump" in line]
    assert running == {"api", "worker"}
    assert backups == []


@needs_shell
def test_interrupted_backup_restarts_writers(stack):
    result, log, backups, running = stack(BACKUP_TEST_HOOK="kill -TERM $PPID")
    assert result.returncode == 143
    assert running == {"api", "worker"}
    assert backups == []


@needs_shell
def test_only_writers_that_were_running_are_started_again(stack, tmp_path):
    (tmp_path / "running").write_text("api\n")  # the worker was stopped on purpose
    result, log, backups, running = stack()
    assert result.returncode == 0, result.stderr
    assert "stop api worker" in log
    assert log[index(log, "start ")] == "start api"
    assert running == {"api"}


def checker():
    spec = importlib.util.spec_from_file_location(
        "check_backup_consistency", REPO / "tools" / "check_backup_consistency.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_checker_reports_an_image_deleted_between_dump_and_archive(client, setup, settings):
    check = checker()
    f = setup()
    image = upload(client, f)
    assert image.status_code == 201, image.text
    dsn = check.plain_dsn(settings.database_url.get_secret_value())
    storage = settings.storage_root
    with psycopg.connect(dsn) as connection:
        dumped = check.linked_files(connection)  # the database as the dump saw it
    assert [row[0] for row in dumped] == ["event_image"]
    keys = {dumped[0][2]}
    archive = Path(storage).parent / "files.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(storage, arcname=".")
    assert check.check(dumped, check.objects_in_directory(storage, keys)) == []
    assert check.check(dumped, check.objects_in_archive(str(archive), keys)) == []
    assert check.main(["--dsn", dsn, "--storage-archive", str(archive)]) == 0

    deleted = client.delete(
        API + f"/events/{f['event']['id']}/images/{image.json()['id']}", headers=f["headers"]
    )
    assert deleted.status_code == 204
    # Files archived after the deletion, against the dump taken before it: the restore of an
    # online backup would link an image whose bytes are gone.
    problems = check.check(dumped, check.objects_in_directory(storage, keys))
    assert problems == [f"MISSING event_image {dumped[0][2]} (stored_file {dumped[0][1]})"]
    # The live state is consistent again: the deletion unlinked the image.
    assert check.main(["--dsn", dsn, "--storage", storage]) == 0


def test_checker_reports_changed_bytes(client, setup, settings):
    check = checker()
    f = setup()
    assert upload(client, f).status_code == 201
    dsn = check.plain_dsn(settings.database_url.get_secret_value())
    with psycopg.connect(dsn) as connection:
        (row,) = check.linked_files(connection)
    (Path(settings.storage_root) / row[2]).write_bytes(b"something else")
    assert check.main(["--dsn", dsn, "--storage", settings.storage_root]) == 1
