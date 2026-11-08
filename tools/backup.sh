#!/usr/bin/env bash
# Backs up PostgreSQL and the uploaded files of the running Compose stack into one
# dated archive. Runbook: docs/operations/backup.md
#
# Usage: tools/backup.sh [output-folder]    (default: backups/ in the repository)

set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash would otherwise rewrite container paths

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/backups}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
cd "$root"

name="biletflow-$(date -u +%Y%m%d-%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work" "$out/$name.tar.part"' EXIT

echo "Dumping PostgreSQL..."
docker compose exec -T db pg_dump -U biletflow_owner -d biletflow -Fc >"$work/db.dump"
docker compose exec -T db pg_restore --list <"$work/db.dump" >/dev/null

# After the database, so every file a database row points to is in the archive.
echo "Archiving uploaded files..."
docker compose exec -T api tar -czf - -C /app/var/storage . >"$work/files.tar.gz"
tar -tzf - <"$work/files.tar.gz" >/dev/null

{
  echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "git_commit=$(git rev-parse HEAD)"
} >"$work/manifest.txt"
(cd "$work" && sha256sum db.dump files.tar.gz manifest.txt >SHA256SUMS)

tar -cf - -C "$work" . >"$out/$name.tar.part"
mv "$out/$name.tar.part" "$out/$name.tar"
echo "Backup written: $out/$name.tar"
