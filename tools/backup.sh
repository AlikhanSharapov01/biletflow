#!/usr/bin/env bash
# Backs up PostgreSQL and the uploaded files of the running Compose stack into one
# dated archive in which the database and the files match. Runbook: docs/operations/backup.md
#
# Usage: tools/backup.sh [--online] [output-folder]    (default: backups/ in the repository)
#
# api and worker are the only writers of the database and the file volume. By default they are
# stopped for the dump and the file archive (a short maintenance window) and started again
# afterwards, also when the backup fails or is interrupted. With them stopped and no other
# database session open, nothing can upload or delete a file between the two steps, so every
# file a database row links to is in the archive.
#
# --online keeps them running: no downtime, but NO consistency guarantee. An image deleted or a
# file uploaded between the dump and the archive leaves the backup linking to a file it lacks
# (or holding one nothing links to). The manifest records which mode was used.
#
# BACKUP_QUIESCE_TIMEOUT  seconds to wait for other database sessions to close (default 30)
# BACKUP_TEST_HOOK        tests only: a command run after the dump and before the file archive

set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash would otherwise rewrite container paths

mode=quiesced
if [ "${1:-}" = "--online" ]; then
  mode=online
  shift
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/backups}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
cd "$root"

name="biletflow-$(date -u +%Y%m%d-%H%M%SZ)"
work="$(mktemp -d)"
stopped=() # writers this script stopped and must start again
restart_failed=false

start_writers() {
  if [ "${#stopped[@]}" -gt 0 ]; then
    echo "Starting ${stopped[*]} again..."
    if docker compose start "${stopped[@]}"; then
      echo "Maintenance window: $((SECONDS - stopped_at)) seconds."
    else
      echo "ERROR: could not start ${stopped[*]}. Start them with: docker compose up -d" >&2
      restart_failed=true
    fi
    stopped=()
  fi
}

finish() {
  local status=$?
  start_writers
  rm -rf "$work" "$out/$name.tar.part"
  if [ ! -f "$out/$name.tar" ]; then
    echo "Backup FAILED; no backup file was written." >&2
  fi
  if [ "$restart_failed" = true ] && [ "$status" -eq 0 ]; then
    status=1
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

psql_owner() {
  docker compose exec -T db psql -U biletflow_owner -d biletflow -v ON_ERROR_STOP=1 -tA "$@"
}

# Fails here, with Compose's "service db is not running", before anything is stopped.
docker compose exec -T db pg_isready -q -U biletflow_owner -d biletflow

if [ "$mode" = quiesced ]; then
  running="$(docker compose ps --status running --services)"
  for service in api worker; do
    if printf '%s\n' "$running" | grep -qx "$service"; then
      stopped+=("$service")
    fi
  done
  stopped_at=$SECONDS
  echo "Stopping api and worker; the site is unavailable until the backup is taken..."
  docker compose stop api worker

  # A one-off command (docker compose run ..., psql) could still write; wait for it to finish.
  others="SELECT count(*) FROM pg_stat_activity WHERE datname = 'biletflow'
    AND backend_type = 'client backend' AND pid <> pg_backend_pid()"
  deadline=$((SECONDS + ${BACKUP_QUIESCE_TIMEOUT:-30}))
  while [ "$(psql_owner -c "$others")" != 0 ]; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "Other database sessions are still open, so the backup could miss their writes:" >&2
      psql_owner -F ' | ' -c "SELECT usename, application_name, client_addr, state
        FROM pg_stat_activity WHERE datname = 'biletflow'
        AND backend_type = 'client backend' AND pid <> pg_backend_pid()" >&2
      echo "Close them (or wait for them to finish) and run the backup again." >&2
      exit 1
    fi
    sleep 1
  done
else
  echo "WARNING: --online backup. The database and files may not match (see the runbook)." >&2
fi

echo "Dumping PostgreSQL..."
docker compose exec -T db pg_dump -U biletflow_owner -d biletflow -Fc >"$work/db.dump"
docker compose exec -T db pg_restore --list <"$work/db.dump" >/dev/null

if [ -n "${BACKUP_TEST_HOOK:-}" ]; then
  echo "Running BACKUP_TEST_HOOK between the dump and the file archive..."
  bash -c "$BACKUP_TEST_HOOK"
fi

# A one-off container reads the volume, so this also works while api is stopped.
echo "Archiving uploaded files..."
docker compose run --rm --no-deps -T api tar -czf - -C /app/var/storage . >"$work/files.tar.gz"
start_writers
tar -tzf - <"$work/files.tar.gz" >/dev/null

{
  echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "git_commit=$(git rev-parse HEAD)"
  echo "consistency=$mode"
} >"$work/manifest.txt"
(cd "$work" && sha256sum db.dump files.tar.gz manifest.txt >SHA256SUMS)

tar -cf - -C "$work" . >"$out/$name.tar.part"
mv "$out/$name.tar.part" "$out/$name.tar"
echo "Backup written ($mode): $out/$name.tar"
