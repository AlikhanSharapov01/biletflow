#!/usr/bin/env bash
# Replaces the database and uploaded files of this Compose stack with a backup made
# by tools/backup.sh. Runbook: docs/operations/backup.md
#
# Usage: tools/restore.sh [--yes] backups/biletflow-<date>.tar

set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash would otherwise rewrite container paths

assume_yes=false
if [ "${1:-}" = "--yes" ]; then
  assume_yes=true
  shift
fi
if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "Usage: tools/restore.sh [--yes] backups/biletflow-<date>.tar" >&2
  exit 2
fi
backup="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")/.."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Everything that can reject the backup happens before any data is touched.
tar -xf - -C "$work" <"$backup"
for part in db.dump files.tar.gz manifest.txt SHA256SUMS; do
  if [ ! -f "$work/$part" ]; then
    echo "Not a BiletFlow backup: $part is missing." >&2
    exit 1
  fi
done
(cd "$work" && sha256sum -c --quiet SHA256SUMS)
cat "$work/manifest.txt"

if [ "$assume_yes" != true ]; then
  echo "This DELETES the current database and uploaded files of this stack."
  read -r -p "Type restore to continue: " answer
  if [ "$answer" != "restore" ]; then
    echo "Cancelled. Nothing was changed."
    exit 1
  fi
fi

echo "Preparing the stack..."
docker compose stop api worker proxy
docker compose up -d --wait db
# A restore that failed after dropping the database must still be able to run again.
exists="$(docker compose exec -T db psql -U biletflow_owner -d postgres -tA \
  -c "SELECT 1 FROM pg_database WHERE datname = 'biletflow'")"
if [ "$exists" != "1" ]; then
  docker compose exec -T db createdb -U biletflow_owner biletflow
fi
# On a fresh stack, this creates the role the backup's grants name.
docker compose run --rm migrate
docker compose exec -T db pg_restore --list <"$work/db.dump" >/dev/null

echo "Restoring PostgreSQL..."
docker compose exec -T db psql -U biletflow_owner -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS biletflow WITH (FORCE)"
docker compose exec -T db pg_restore -U biletflow_owner -d postgres --create --exit-on-error <"$work/db.dump"

echo "Restoring uploaded files..."
docker compose run --rm --no-deps -T api sh -c \
  'find /app/var/storage -mindepth 1 -delete && tar -xzf - -C /app/var/storage' <"$work/files.tar.gz"

# Runs migrate again, which upgrades a backup taken on an older schema.
echo "Starting the stack..."
docker compose up -d
echo "Restore finished."
