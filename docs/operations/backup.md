# Backup and restore

Use this to save BiletFlow's data and to bring it back, on the same machine or a new one. You need
Docker and a checkout of this repository. On Windows, run the commands in **Git Bash**, not
PowerShell, which corrupts binary data.

A backup is one file, `backups/biletflow-<UTC date>.tar`, containing:

| File | What it is |
|---|---|
| `db.dump` | The whole PostgreSQL database (`pg_dump` custom format) |
| `files.tar.gz` | Uploaded files (the `file_storage` volume) |
| `manifest.txt` | When the backup was made and from which commit |
| `SHA256SUMS` | Checksums, verified before a restore touches anything |

## Take a backup

The stack must be running (`docker compose up -d`). Users can stay connected.

```bash
bash tools/backup.sh
```

To write somewhere else, pass a folder: `bash tools/backup.sh /path/to/folder`.

Copy the file off this machine. A backup on the same disk won't survive losing that disk.

**Keep backups private.** They hold personal data and are not encrypted, and `backups/` is ignored
by Git so they can't be committed by accident. Store them only somewhere encrypted with restricted
access.

**Keep `.env` too, separately from the backups.** It isn't in the backup, and it holds
`CHALLENGE_SECRET` and `JWT_SECRET`. Restore with different secrets and existing ticket QR codes,
entry confirmations and sign-ins stop working.

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

## Check that it worked

```bash
docker compose ps
```

`api` and `worker` should say `healthy` or `running`. Then:

1. Open <http://localhost:8080> and sign in with an existing account.
2. Open an event you know existed and confirm its details and tickets are there.
3. Open something with an uploaded file, such as a ticket PDF or a support attachment.

Ticket PDFs and support attachments live in `file_storage`, so step 3 checks the files as well as
the database.

## If something goes wrong

| Message | What to do |
|---|---|
| `Not a BiletFlow backup` or a checksum failure | The file is damaged or incomplete. Nothing was changed. Use another copy. |
| `service "db" is not running` during a backup | Start the stack with `docker compose up -d`. |
| `service "api" is not running` during a backup | Same as above. |
| The restore stops partway | The data may be half restored. Fix the reported problem and run the same restore command again. It starts over from the backup. |

## How this is tested

The `Backup` GitHub workflow backs up a running stack, destroys its containers and volumes, restores
into a fresh stack, and checks that a user account and an uploaded file came back and that the app
can write to the restored database.
