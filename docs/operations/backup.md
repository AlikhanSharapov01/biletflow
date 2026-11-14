# Backup and restore

Use this to save BiletFlow's data and to bring it back, on the same machine or a new one. You need
Docker and a checkout of this repository. On Windows, run the commands in **Git Bash**, not
PowerShell, which corrupts binary data.

A backup is one file, `backups/biletflow-<UTC date>.tar`, containing:

| File | What it is |
|---|---|
| `db.dump` | The whole PostgreSQL database (`pg_dump` custom format) |
| `files.tar.gz` | Uploaded files (the `file_storage` volume): event images, support attachments, stored ticket PDFs |
| `manifest.txt` | When the backup was made, from which commit, and `consistency=quiesced` or `online` |
| `SHA256SUMS` | Checksums, verified before a restore touches anything |

## Take a backup

The stack must be running (`docker compose up -d`).

```bash
bash tools/backup.sh
```

To write somewhere else, pass a folder: `bash tools/backup.sh /path/to/folder`.

**This is a short maintenance window.** The script stops `api` and `worker`, dumps the database,
archives the files and starts them again. While they are stopped the web pages still load but every
API call fails (`502`), so sign-ins, purchases, check-ins and uploads are unavailable; the script
prints how long that took (seconds on demo data, growing with the database and file sizes). Take
backups outside sales and admission times. Requests in progress when the API stops get up to 10
seconds to finish; a purchase interrupted there is rolled back as a whole and can be retried.

`api` and `worker` are started again even when the backup fails or you press Ctrl+C. Only those
that were running before are started, so a worker you stopped on purpose stays stopped.

The backup waits up to 30 seconds for **other database sessions** to close, such as `psql`, a
database GUI on port 5433, or a `docker compose run` command (admin CLI, demo reset), because they
could still write. If any stay open it lists them, starts the app again and stops without writing a
backup. Close them and run it again. `BACKUP_QUIESCE_TIMEOUT=<seconds>` changes the wait.

Copy the file off this machine. A backup on the same disk won't survive losing that disk.

**Keep backups private.** They hold personal data and are not encrypted, and `backups/` is ignored
by Git so they can't be committed by accident. Store them only somewhere encrypted with restricted
access.

**Keep `.env` too, separately from the backups.** It isn't in the backup, and it holds
`CHALLENGE_SECRET` and `JWT_SECRET`. Restore with different secrets and existing ticket QR codes,
entry confirmations and sign-ins stop working.

### What a backup guarantees

Only `api` and `worker` change the database and the uploaded files. With both stopped and no other
database session open, nothing can change either of them between the dump and the file archive, so
the backup is one consistent point in time:

- Every file a database row links to (event gallery images, support attachments, stored ticket
  PDFs) is in `files.tar.gz` with the size and SHA-256 the database recorded. `tools/verify_backup.sh`
  and the restore check this.
- Orders, tickets (including their QR token hashes), payments, refunds, audit rows and queued work
  (`outbox_job`) are exactly as committed when the API stopped. Object keys, ids and idempotency
  keys are unchanged, so links, QR codes and retries keep working after a restore.
- Queued work that had not run yet is in the backup as `pending` and the worker does it after a
  restore. Work is at-least-once: an email being sent at the moment the worker stopped can be sent
  again after a restore.
- The archive may hold a file nothing links to, for example from an upload interrupted by the
  stop. It is harmless: nothing serves a file without its database row.

Not covered: anything changed after the backup is lost by a restore, so the backup interval is the
most data you can lose. `.env`, Mailpit's mailbox and anything outside the database and the
`file_storage` volume are not in the backup.

### Online backups (no downtime, no guarantee)

```bash
bash tools/backup.sh --online
```

This keeps `api` and `worker` running. It does **not** guarantee that the database and the files
match: an image deleted between the dump and the archive leaves a backup whose database still shows
the image but whose archive lacks it, and a file uploaded in between is archived without its row.
The manifest says `consistency=online`, and a restore warns and checks it (see below). Backups made
before this mode existed were all online. Prefer a normal backup; if you take an online one, check
it with `tools/verify_backup.sh` and take a normal one at the next quiet moment.

## Check a backup without restoring it

```bash
bash tools/verify_backup.sh backups/biletflow-<UTC date>.tar
```

It verifies the checksums, restores the database into a temporary database (deleted afterwards)
and checks that every linked file is in the archive with the recorded checksum. It does not touch
the stack's data and the app keeps running. It prints `OK: ...` or one `MISSING`/`DIFFERS` line per
problem and exits with status 1.

## Restore a backup

**A restore deletes the stack's current database and uploaded files.** If they might still matter,
run `bash tools/backup.sh` first.

1. Check out the repository, at the same commit as the backup or newer. `manifest.txt` names it, and
   the restore prints it.
2. Make sure the original `.env` is in the repository root. On a brand-new machine, copy it there.
3. Run the restore and type `restore` when asked:

   ```bash
   bash tools/restore.sh backups/biletflow-<UTC date>.tar
   ```

   This works on a brand-new stack with no containers or volumes as well as on a running one. It
   leaves the whole stack running, and takes a few minutes the first time because images are built.
   Automation can pass `--yes` to skip the question.

At the end the restore checks that every file the restored database links to is present with the
recorded checksum, and prints `Restore finished.` If any is missing it lists them and exits with
status 3 (see below); the stack is running either way. The worker then does the queued work that
was pending in the backup.

## Check that it worked

```bash
docker compose ps
```

`api` and `worker` should say `healthy` or `running`. Then:

1. Open <http://localhost:8080> and sign in with an existing account.
2. Open an event you know existed and confirm its details, images and tickets are there.
3. Open something with an uploaded file, such as a ticket PDF or a support attachment.

## If something goes wrong

| Message | What to do |
|---|---|
| `Not a BiletFlow backup` or a checksum failure | The file is damaged or incomplete. Nothing was changed. Use another copy. |
| `service "db" is not running` during a backup | Start the stack with `docker compose up -d`. Nothing was stopped. |
| `Other database sessions are still open` | Close the listed sessions (or wait for them) and run the backup again. The app was started again and no backup was written. |
| `Backup FAILED; no backup file was written.` | Fix the error printed above it and run the backup again. `api` and `worker` were started again. |
| `ERROR: could not start api worker` | The backup may be fine, but the app is down: run `docker compose up -d` and check `docker compose ps`. |
| The backup's terminal or machine was killed mid-backup | The script could not restart the app. Run `docker compose up -d`. Any partial file ends in `.tar.part`; delete it. |
| The restore stops partway | The data may be half restored. Fix the reported problem and run the same restore command again. It starts over from the backup. |
| The restore exits with status 3 | See below. |

### Missing files after a restore

The database links to files the backup does not contain, which happens with an online backup or a
damaged archive. The app keeps working: a missing gallery image answers `404 image_not_found`, a
missing support attachment `404 attachment_not_found`, and a missing stored ticket PDF is
re-rendered on the next download. Either restore a different backup made without `--online`, or
keep this one and ask the organizers to upload the listed event images again.

## How this is tested

The `Backup` GitHub workflow runs the drill for acceptance criterion AC-27 on a real Compose stack
(`tools/backup_drill.py`):

1. It creates an order and ticket with a stored PDF, three event images, a support case with an
   attachment, and their audit rows.
2. Negative control: an `--online` backup deletes image `c` through the API exactly between the
   dump and the archive (`BACKUP_TEST_HOOK`), and `tools/verify_backup.sh` must report it missing.
3. With the worker stopped it queues an email (a pending outbox job) and records the keys the
   restore must bring back.
4. A normal backup tries the same deletion of image `b` in the same place; the API is stopped, so
   it must fail to connect, and `tools/verify_backup.sh` must pass. Image `b` is then deleted.
5. It destroys the stack, restores into a fresh one (including the restore's file check) and checks
   that orders, tickets, QR token hashes, object keys and checksums, audit rows and outbox keys are
   as recorded, that images `a` and `b`, the ticket PDF and the attachment read back unchanged,
   that the QR payload is the same, that the worker completes the pending job, and that the app
   can write.

`backend/tests/test_backup_consistency.py` checks the script's ordering without Docker: the
writers stop before the dump and start after the archive, also after a failure, an open database
session or an interruption, and the consistency check reports an image deleted between the two
steps.
