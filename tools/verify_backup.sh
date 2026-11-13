#!/usr/bin/env bash
# Checks a backup made by tools/backup.sh without touching the stack's data: restores its
# database into a temporary database and confirms that every file a row links to is in its file
# archive with the recorded checksum. Runbook: docs/operations/backup.md
#
# Usage: tools/verify_backup.sh backups/biletflow-<date>.tar
# Exit status: 0 consistent, 1 damaged or inconsistent, 2 usage error or the check could not run.

set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash would otherwise rewrite container paths

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "Usage: tools/verify_backup.sh backups/biletflow-<date>.tar" >&2
  exit 2
fi
backup="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")/.."

work="$(mktemp -d)"
scratch="biletflow_verify_$(date -u +%Y%m%d%H%M%S)_$$"
created=false
cleanup() {
  if [ "$created" = true ]; then
    docker compose exec -T db dropdb -U biletflow_owner --if-exists --force "$scratch" || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

tar -xf - -C "$work" <"$backup"
for part in db.dump files.tar.gz manifest.txt SHA256SUMS; do
  if [ ! -f "$work/$part" ]; then
    echo "Not a BiletFlow backup: $part is missing." >&2
    exit 1
  fi
done
(cd "$work" && sha256sum -c --quiet SHA256SUMS)
cat "$work/manifest.txt"

docker compose up -d --wait db
docker compose exec -T db createdb -U biletflow_owner "$scratch"
created=true
echo "Restoring the database into the temporary database $scratch..."
docker compose exec -T db pg_restore -U biletflow_owner -d "$scratch" --no-owner --no-privileges \
  --exit-on-error <"$work/db.dump"

echo "Checking linked files against the file archive..."
# The checker reads the archive from stdin, so no host folder is mounted into the container.
docker compose run --rm --no-deps -T api sh -c \
  'exec python -c "$1" --dsn "postgresql://biletflow_owner:${POSTGRES_PASSWORD}@db:5432/$2" \
     --storage-archive -' \
  check "$(cat tools/check_backup_consistency.py)" "$scratch" <"$work/files.tar.gz"
