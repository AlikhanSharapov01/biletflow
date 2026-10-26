# Part A (attendee + admission) — implementation plan for the `dauka-backend` increment

Date: 2026-10-26. Branch: `dauka-backend`. Target of the eventual PR: `main`.

This plan closes the attendee- and admission-side gaps that the per-area API guides in
`backend/*_API.md` list as "not yet implemented" and that `docs/BiletFlow_Backend_Requirements.md`
(sections BF-10, BF-11, BF-12, BF-16, BF-20) still require. It is deliberately disjoint from
Part B (commerce: BF-06 activation, BF-08 payments, BF-09 campaigns, BF-13 refunds, BF-14 finance,
BF-18/19 analytics), which a teammate implements in parallel from `main`.

## Global Constraints (binding for every task)

1. **Branch and merge safety.** Work only on `dauka-backend`. Never touch commerce code or tables:
   do not edit `app/checkout_service.py`, `app/checkout_models.py`, `app/catalog_models.py`,
   `app/catalog_service.py`, `app/event_api.py`, `app/organization_api.py`, `app/admin_*`,
   `app/notification_*`, `app/seed.py`, `app/bootstrap.py`, and do not change existing migrations.
   Shared files may receive **only additive, minimal edits**: `app/main.py` (one `include_router`
   line + its import), `app/all_models.py` and `migrations/env.py` (one module name each),
   `app/config.py` (new settings appended at the end of the class), `app/worker.py` (only what
   Task 2 states), `pyproject.toml`/`uv.lock` only if a task says so (no task does).
2. **One new migration for the whole increment:** `backend/migrations/versions/0009_files_admission.py`
   + `0009_files_admission.sql`, `revision = "0009_files_admission"`,
   `down_revision = "0008_support"`, same loader pattern as `0008_support.py`, `downgrade()` raises
   `RuntimeError` like the others. Task 1 creates the migration; later tasks **append** SQL to the
   same `.sql` file (they run on a fresh database in tests, so appending is safe within this branch).
   All tables live in schema `biletflow`, UUID `gen_random_uuid()` keys, `created_at timestamptz
   DEFAULT CURRENT_TIMESTAMP`, every FK `ON DELETE RESTRICT ON UPDATE RESTRICT`, CHECK/UNIQUE names
   follow `<table>_ckN` / `<table>_uqN` / `fk_<table>_<role>`.
3. **ORM models** for new tables go in a **new** module `app/file_models.py` (Task 1) and are registered
   in `app/all_models.py` and `migrations/env.py`. Use the `Row` mixin from `app/models.py` where a
   table has `id` + `created_at`.
4. **Errors**: `fail(code, status)` from `app/security.py`; stable snake_case codes; bodies are
   `{"detail": {"code": "..."}}` plus documented extra keys. Input models inherit the module's
   `Input` base (unknown fields rejected). 404 for anything the caller may not know exists; 403 only
   for a known-but-forbidden capability on a resource the caller is allowed to see.
5. **Authorization**: reuse `valid_session(db, *ids, lock=...)` from `app/service.py`,
   `event_guard(db, user, event_id, capability, lock=False)` from `app/catalog_service.py`,
   `case_roles(db, user, case)` from `app/support_service.py`. Knowing an ID never grants access.
6. **Audit**: business changes write an audit row in the same transaction via
   `catalog_audit(db, user, action, org, event, entity)` (`app/catalog_service.py`) or
   `support_audit(db, user, action, case, **change)` (`app/support_service.py`). No secrets, tokens,
   file bytes or message bodies in audit/outbox payloads.
7. **Time**: `now()` from `app/security.py`; timestamps returned with offsets.
8. **Tests**: real PostgreSQL only. `TEST_DATABASE_URL=postgresql+psycopg://biletflow_test:test@127.0.0.1:5432/biletflow_test`.
   Each task adds its own **new** test file under `backend/tests/` (never edit existing tests except
   `conftest.py` fixtures if truly needed, and then only additively). Reuse helpers
   `published`, `staff`, `free_ticket`, `scan` from `tests/test_admission.py` and `open_case`, `say`,
   `me` from `tests/test_support.py` by importing them. Before committing run from `backend/`:
   `uv run ruff check app tests migrations && uv run ruff format app tests migrations && uv run pytest -q tests/<your file> -p no:cacheprovider`
   and once per task the full suite `uv run pytest -q -p no:cacheprovider` (about 5 minutes).
9. **Style**: Python 3.12+, line length 100, ruff rules `E4,E7,E9,F,I` (imports sorted). Follow the
   existing code style: small module-level functions, SQLAlchemy 2.0 `select()`, no ORM relationships.
10. **Commits**: one or more conventional commits per task, e.g. `feat(support): BF-16 protected attachments`.
    Never commit `.env`, storage files or PDFs. Do not push; the controller pushes.

## Task 1: Protected file storage and support attachments (BF-16)

**Goal.** Attendees and staff can attach PNG/JPEG/PDF files to support messages. Files are
validated by content, stored privately through a storage abstraction, downloadable only by case
participants through short-lived signed links, and never public.

### Migration (create `0009_files_admission.py` + `.sql`)

```sql
-- 0009: protected file storage (stored_file), support attachments, admission history columns.
CREATE TABLE biletflow.stored_file (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	uploaded_by_user_id UUID,
	object_key TEXT NOT NULL,
	purpose TEXT NOT NULL,
	mime_type TEXT NOT NULL,
	size_bytes BIGINT NOT NULL,
	sha256 TEXT NOT NULL,
	status TEXT DEFAULT 'pending' NOT NULL,
	scanned_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT stored_file_uq1 UNIQUE (object_key),
	CONSTRAINT stored_file_ck1 CHECK (purpose IN ('event_image','ticket_pdf','support_attachment','offline_package')),
	CONSTRAINT stored_file_ck2 CHECK (status IN ('pending','quarantined','clean','rejected','deleted')),
	CONSTRAINT stored_file_ck3 CHECK (size_bytes >= 0),
	CONSTRAINT fk_stored_file_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_stored_file_uploader ON biletflow.stored_file (uploaded_by_user_id, created_at);

CREATE TABLE biletflow.support_attachment (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	case_id UUID NOT NULL,
	message_id UUID NOT NULL,
	file_id UUID NOT NULL,
	original_filename TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT support_attachment_uq1 UNIQUE (file_id),
	CONSTRAINT support_attachment_ck1 CHECK (length(btrim(original_filename)) > 0),
	CONSTRAINT fk_support_attachment_case FOREIGN KEY (case_id) REFERENCES biletflow.support_case (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_attachment_message FOREIGN KEY (message_id, case_id) REFERENCES biletflow.support_message (id, case_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_attachment_file FOREIGN KEY (file_id) REFERENCES biletflow.stored_file (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_support_attachment_message ON biletflow.support_attachment (message_id, created_at);
```

(`support_message` already has `UNIQUE (id, case_id)` = `support_message_uq2`.)

### Storage abstraction — new module `app/storage.py`

- `class FileStorage(Protocol)`: `put(key: str, data: bytes) -> None`, `get(key: str) -> bytes`
  (raise `FileNotFoundError` when missing), `delete(key: str) -> None` (idempotent).
- `class LocalFileStorage(FileStorage)`: root directory from settings; keys are `/`-separated
  relative paths; reject keys containing `..`, leading `/`, or empty segments (`ValueError`);
  write atomically (`tempfile` in the same directory + `os.replace`); create parent directories.
- `def storage_from_settings(settings) -> FileStorage` returning `LocalFileStorage(settings.storage_root)`.
  An S3 backend is explicitly out of scope; the docstring says this is the extension point.
- New settings in `app/config.py` (append): `storage_root: str = "var/storage"`,
  `attachment_max_bytes: int = Field(5 * 1024 * 1024, ge=1024)`,
  `attachment_max_per_message: int = Field(5, ge=1, le=20)`,
  `attachment_link_seconds: int = Field(300, ge=30, le=3600)`.
- `create_app` in `app/main.py` must expose the storage as `app.state.storage = storage_from_settings(settings)`
  (one line) and pass it to the support router: change the support `include_router` call to pass
  `storage=app.state.storage` (keyword argument added to `support_api.router`). This is the one
  permitted edit to `main.py` in this task.
- Add `var/` to `backend/.gitignore`.

### ORM — new module `app/file_models.py`

`StoredFile` (`stored_file`) and `SupportAttachment` (`support_attachment`) mirroring the SQL
above (use `Row` + `mapped_column`, same style as `app/support_models.py`). Register in
`app/all_models.py` and `migrations/env.py`.

### Service — new module `app/attachment_service.py`

- `ALLOWED_TYPES = {"image/png": (b"\x89PNG\r\n\x1a\n",), "image/jpeg": (b"\xff\xd8\xff",), "application/pdf": (b"%PDF-",)}`.
- `sniff(content_type, data) -> str`: declared type must be in `ALLOWED_TYPES` and the bytes must start
  with one of its signatures; otherwise record a `stored_file` row with `status='rejected'`,
  `size_bytes=len(data)`, the real sha256 and an `object_key` of `support/{case_id}/{file_id}` (no
  bytes are written for rejected files) **in its own short committed transaction** (a `fail()` inside
  the main `factory.begin()` block would roll the row back), then `fail("attachment_rejected", 422)`.
- `upload_attachment(db, storage, settings, user, case_id, filename, content_type, data) -> StoredFile`:
  - `get_case(db, user, case_id)` (404 `case_not_found` for outsiders, as the existing support code does);
    only users with a non-empty `case_roles` may upload; a `resolved` case still accepts uploads
    (a reply reopens it).
  - `filename` is the client's display name: strip, require 1..200 chars, replace path separators and
    control characters with `_`; store it later as `original_filename`.
  - size check: `len(data) > settings.attachment_max_bytes` → `fail("attachment_too_large", 413)`
    (no row written). Empty body → `fail("attachment_empty", 422)`.
  - insert `StoredFile(purpose="support_attachment", status="pending", uploaded_by_user_id=user.id, object_key=f"support/{case_id}/{file_id}", mime_type, size_bytes, sha256)`,
    `db.flush()`, then `storage.put(object_key, data)` **outside any row lock**, then set `status="clean"`,
    `scanned_at=now()`. (Validation is synchronous; the `pending`→`clean` transition is kept so a future
    asynchronous scanner can sit between them.) Write `support_audit(db, user, "support.attachment_uploaded", case, file_id=str(file.id), size_bytes=..., mime_type=...)`.
  - Returns the row; the API returns `201 {file_id, mime_type, size_bytes, sha256, status, expires_at}`
    where `expires_at = created_at + 1 hour` (the window in which it can be linked to a message).
- `attach_files(db, user, case, message, file_ids: list[UUID]) -> list[SupportAttachment]` called by
  `post_message`/`open_case` inside the existing transaction, after the message row is flushed:
  - at most `settings.attachment_max_per_message` ids, no duplicates (422 `invalid_input` via pydantic
    validator in the schema);
  - every id must be a `stored_file` with `purpose='support_attachment'`, `status='clean'`,
    `uploaded_by_user_id == user.id`, `object_key` starting with `support/{case.id}/`, created less
    than 1 hour ago and not yet referenced by `support_attachment` → otherwise `fail("attachment_not_available", 409)`
    with extra key `file_id`. Lock the `stored_file` rows `FOR UPDATE` so two concurrent messages cannot
    both link one file (the UNIQUE constraint is the backstop; map `IntegrityError` to the same 409).
  - inserts `SupportAttachment(case_id, message_id, file_id, original_filename)`.
- `download_link(db, settings, user, case_id, attachment_id) -> dict`: participant check via
  `case_roles`; attachment must belong to the case and its file must be `clean` (else 404
  `attachment_not_found`); returns `{"url": f"{api_prefix}/support/attachments/{attachment_id}/content?token=...", "expires_at": ...}`
  where the token is produced by `app/signing.py`-style HMAC: implement `make_download_token(settings, attachment_id, user_id, expires_at)`
  and `read_download_token(settings, token)` in `attachment_service.py` using `hmac.new(settings.challenge_secret, ..., sha256)`
  over the canonical string `f"support_attachment:{attachment_id}:{user_id}:{int(expires_at.timestamp())}"`,
  token format `base64url(payload).base64url(signature)` without padding. Expiry = `now() + attachment_link_seconds`.
- `download_content(db, storage, settings, token, attachment_id) -> tuple[bytes, mime_type, original_filename]`:
  verify signature + expiry (`fail("download_link_invalid", 401)` / `fail("download_link_expired", 401)`),
  the token's attachment id must equal the path id, re-load the user and **re-authorize** with
  `case_roles` and `valid user status/active` (a user who lost access gets 404 `attachment_not_found`),
  the file must still be `clean`, then `storage.get(object_key)`; a missing object → 404 `attachment_not_found`.
  Response headers: `Content-Type` = stored mime type, `Content-Disposition: attachment; filename="..."`
  (ASCII-sanitised, `filename*` UTF-8 form also set), `Cache-Control: private, no-store`,
  `X-Content-Type-Options: nosniff`.

### API — extend `app/support_api.py` (router signature becomes `router(factory, settings, principal, storage)`)

- `POST /support/cases/{case_id}/attachments?filename=<name>` — raw body upload. Read the body with
  `await request.stream()` in an **async** endpoint, aborting with 413 `attachment_too_large` once more
  than `attachment_max_bytes` have been received; `Content-Type` header is the declared type
  (`fail("unsupported_media_type", 415)` when it is not one of the allowed types *before* reading
  the body). Run the blocking DB/storage work in `run_in_threadpool`. Rate limit: reuse
  `rate_limit(...)` from `app/service.py` the way `ticket_document_api.py` does, 20 uploads per
  minute per account.
- `POST /support/cases/{case_id}/messages` and `POST /support/cases` gain an optional field
  `attachment_ids: list[UUID] = []` on `MessageCreate` and `CaseCreate` (`support_schemas.py`).
  Idempotent replay with the same `client_message_id` but different `attachment_ids` must fail the
  way a different body does today (check how `same_creation` / `post_message` compare and extend the comparison).
- `MessageView` gains `attachments: list[AttachmentView]` with
  `AttachmentView {id, file_id, original_filename, mime_type, size_bytes, created_at}`. Populate it
  in `message_views` with one query for all messages (no N+1). Items delivered via `/updates` and the
  WebSocket reuse `message_views`, so they get attachments automatically — verify and test it.
- `GET /support/cases/{case_id}/attachments/{attachment_id}/download-link` → `{url, expires_at}`.
- `GET /support/attachments/{attachment_id}/content?token=` → bytes (no bearer header required; the
  token is the credential). Document that clients open this URL directly.

### Tests — new `tests/test_support_attachments.py`

Use `tmp_path` for the storage root (override `app.state.storage` with `LocalFileStorage(tmp_path)`
through a fixture; the router captures the storage object, so build the app with the override via a
fixture that monkeypatches `Settings.storage_root` before `create_app`, or set `settings.storage_root`
in a `settings`-derived copy — pick what works with `conftest.py` and explain in the report).
Cover at least:
1. PNG upload + message with attachment → message view lists it; `/updates` item carries it; download
   link works and returns identical bytes with the right headers; the raw `object_key` is never in any response.
2. Declared `image/png` with JPEG bytes → 422 `attachment_rejected`, a `stored_file` row with status
   `rejected`, and no file on disk.
3. Oversize body → 413 and no row; `text/plain` → 415.
4. Linking a file uploaded by another participant, or to another case, or twice → 409
   `attachment_not_available`; more than max per message → 422.
5. A stranger cannot upload, cannot get a download link, and a forged/expired token → 401; a valid
   token for user A used after A's staff permission is revoked → 404.
6. `LocalFileStorage` rejects `../` keys and writes/reads/deletes round-trip.

### Docs

Update `backend/SUPPORT_API.md`: replace the "Attachments are not implemented" statements with the
new endpoint contract, limits, token semantics and storage configuration (`STORAGE_ROOT`,
`ATTACHMENT_*`), and update the "Not implemented" list (keep: asynchronous malware scanning).

## Task 2: Stored ticket PDFs and PDF email attachment (BF-10)

**Goal.** The delivery email carries the ticket PDF, the rendered PDF is stored once in
`stored_file` (purpose `ticket_pdf`) and re-served from storage; refunded/cancelled tickets still
never get a document.

### Migration (append to `0009_files_admission.sql`)

```sql
ALTER TABLE biletflow.ticket
	ADD COLUMN pdf_file_id UUID,
	ADD CONSTRAINT fk_ticket_pdf_file FOREIGN KEY (pdf_file_id) REFERENCES biletflow.stored_file (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
```

Add `pdf_file_id: Mapped[UUID | None]` to the `Ticket` model — **exception to constraint 1**: this is
the single permitted edit to `app/checkout_models.py`, one column, no other change. (Part B adds its
own columns in its own migration; two `ADD COLUMN` statements in different migrations do not conflict.)

### Service — new module `app/ticket_file_service.py`

- `ensure_ticket_pdf(factory, settings, storage, ticket_id) -> tuple[bytes, str] | None`: used by the
  worker **outside** the outbox lease transaction. Steps: short read TX to load ticket/item/order
  (`ticket_rows` from `app/checkout_service.py` is importable; do not modify it); return `None` unless
  `ticket.status in ("valid", "checked_in")`; if `ticket.pdf_file_id` is set and the stored file is
  `clean` → `storage.get(key)` and return it (re-render and re-store if the object is missing);
  otherwise render with `render_ticket_pdf(...)` exactly as `ticket_document_service.ticket_pdf` does,
  `storage.put(f"tickets/{ticket_id}/{file_id}.pdf", data)`, then in a short TX lock the ticket row
  `FOR UPDATE`; if `pdf_file_id` is still null insert `StoredFile(purpose="ticket_pdf", status="clean", scanned_at=now(), uploaded_by_user_id=None, ...)`
  and set it; if another worker won the race, `storage.delete` the orphan key and use the winner's file.
  Filename for the attachment: `biletflow-ticket-{ticket_id}.pdf`.
- `stored_ticket_pdf(db, storage, ticket) -> bytes | None` for the API: returns the stored bytes when
  `pdf_file_id` points at a `clean` file whose object exists, else `None` (caller renders on request).

### Worker — `app/worker.py` (minimal edit)

- `ticket_message(db, settings, identifier, ticket_id, pdf=None)`: when `pdf` is given, add it with
  `message.add_attachment(data, maintype="application", subtype="pdf", filename=...)` and add one line
  to the text: "Your printable ticket is attached (A4, grayscale-safe)."
- In `deliver_once`, for `kind == "ticket_delivery_email"` call `ensure_ticket_pdf(factory, settings, storage, ticket_id)`
  before building the message. The storage comes from `storage_from_settings(settings)` created once
  in `main()`/passed into `deliver_once(factory, settings, send=None, storage=None)` (default: build
  from settings). A PDF failure must **not** block the email: catch exceptions from `ensure_ticket_pdf`,
  log nothing sensitive, and send the email without attachment (the ticket link still works).

### API — `app/ticket_document_api.py` / `ticket_document_service.py`

`GET /tickets/{ticket_id}/pdf` serves `stored_ticket_pdf(...)` when present, else renders as today.
The router needs the storage: pass `storage=app.state.storage` in `main.py` (second permitted
`main.py` edit; keep it one keyword argument). Response is byte-identical for stored vs rendered only
in content type and headers (PDF bytes may differ by timestamp; tests compare text content via
`pypdf`, as the existing `tests/test_ticket_documents.py` does).

### Tests — new `tests/test_ticket_files.py`

1. Run `deliver_once(factory, settings, send=capture, storage=LocalFileStorage(tmp_path))` for a fresh
   free ticket: the captured email has one `application/pdf` attachment whose text (pypdf) contains
   the ticket id; `ticket.pdf_file_id` is set; the `stored_file` row is `clean` with purpose
   `ticket_pdf` and the sha256 of the bytes on disk; a second delivery (resend) reuses the same file id.
2. `GET /tickets/{id}/pdf` after delivery returns the stored bytes (sha256 equal to the stored row).
3. Delete the object from disk, then deliver again → `ensure_ticket_pdf` re-renders and overwrites
   the **same** key, inserts no new `stored_file` row, and the email still carries a PDF.
4. Ticket with status `refunded` (set directly in SQL) → `ticket_message` returns `None` as today:
   assert that no email is sent, no stored file is created and `pdf_file_id` stays null.
5. Storage failure (storage stub whose `put` raises) → email is still sent without attachment and the
   job completes.

### Docs

Update `backend/TICKET_PDF_API.md` ("Not covered" section) and the handoff note for the web client.

## Task 3: Scanner read-only verification preview and conflict-review reversal (BF-11/BF-12)

**Goal.** A scanner can check what a check-in *would* do without admitting or consuming the
attendee's confirmation, and an organizer resolving an offline sync conflict can reverse the
conflicting admission in the same action.

### Verification preview — `app/admission_service.py` + `app/admission_api.py` + `admission_schemas.py`

- `POST /scanner/events/{event_id}/verifications` with body `VerificationInput` = the same fields as
  `CheckInInput` **minus** `operation_id` (one of `qr_payload` | `ticket_id`; optional
  `entry_confirmation` | `entry_code`; optional `device_id`). Capability `scan` via `event_guard`.
- Behaviour: run every validation `check_in` runs — event admission window
  (`admission_open`), ticket lookup (`payload_ticket` / `ticket_by_id`), `wrong_event`, device,
  ticket status (`ticket_unclaimed`, `ticket_not_valid`, `already_checked_in` with `checked_in_at`),
  and the confirmation checks — **but never write**: no `CheckIn` row, no `consumed_at` update, no
  ticket status change. Factor the read-only confirmation checks out of
  `entry_service.consume_confirmation` into `inspect_confirmation(db, settings, ticket, token, code) -> EntryConfirmation`
  (same failure codes, same order, no UPDATE) and have `consume_confirmation` call it before its
  conditional UPDATE, so the two paths cannot drift. Read the `admit()` function to mirror the
  status checks in the same order; extract shared read-only checks into a helper rather than
  duplicating the block.
- Response `200 VerificationResult {result: "would_admit" | "rejected", code: str | None, ticket_id, event_id, attendee_name, ticket_type_name, seat, ticket_status, checked_in_at: datetime | None, confirmation: "valid" | "not_required" | "missing" | "expired" | "used" | "invalid" | "sign_in_required", checked_at: datetime}`.
  For rejections the HTTP status is still 200 and `code` carries the check-in error code that a real
  check-in would return (e.g. `already_checked_in`); only `event_not_found`/`permission_denied`/
  `ticket_not_found`/`not_a_ticket_qr`/`device_*` keep their 4xx behaviour. The docstring states that
  a preview never guarantees a later admission.
- Preview writes no audit row and is rate limited with the existing `rate_limit` helper at
  60/minute per account.

### Conflict-review reversal — `app/offline_service.py` + `offline_api.py` + `offline_schemas.py`

- `ResolveInput` gains `reverse_existing_check_in: bool = False` and `reversal_reason: str | None = None`
  (1..500 chars, required when the flag is true → otherwise 422 via validator).
- When the flag is true: the conflict must have `existing_check_in_id` (else 409
  `no_admission_to_reverse`), the user needs `reverse_checkin` on the event (else 403
  `permission_denied` — they already passed the `attendees` check so 403 is correct here), and the
  reversal uses `apply_reversal(db, user, event, check_in_id, reason)` from `app/admission_service.py`
  in the same transaction as the conflict resolution. If the check-in is already reversed → 409
  `already_reversed` (existing code). Response adds `reversed_check_in_id: UUID | None`.

### Tests — new `tests/test_admission_preview.py`

1. Valid ticket + valid confirmation → `would_admit`, confirmation `valid`; afterwards the real
   check-in with the same confirmation succeeds (nothing was consumed) and `check_in` count is 1.
2. Already checked in → `rejected` with `code=already_checked_in` and `checked_in_at`.
3. Unclaimed ticket → `rejected`/`ticket_unclaimed`; missing confirmation (flag on) → `rejected`,
   `confirmation=missing`, `code=sign_in_required`; with `no_entry_confirmation` fixture → `confirmation=not_required`.
4. Campaign QR → 422 `not_a_ticket_qr`; wrong event → `rejected`/`wrong_event`; staff without `scan` → 403; stranger → 404.
5. Conflict reversal: create a sync conflict the way `tests/test_offline.py` does (import its
   helpers), resolve with `reverse_existing_check_in=true` → check-in reversed, ticket back to
   `valid`, `reversed_check_in_id` set, audit rows `admission.reversed` and
   `admission.sync_conflict_resolved` exist; without `reverse_checkin` → 403; flag without reason → 422.

### Docs

`backend/ADMISSION_API.md`: add the verification endpoint (and that it is a preview) and the
conflict-review reversal; remove the matching "Not yet implemented" bullet.

## Task 4: Organizer admission history and CSV export; attendee check-in status (BF-20/BF-11)

**Goal.** Organizer staff with `attendees` see a deterministic, filterable check-in log for an
event and can export it; attendees see whether their own ticket was admitted.

### API — new module `app/admission_history_api.py` + `app/admission_history_service.py`

Register the router in `app/main.py` (one import + one `include_router` line; prefix `/api/v1`, tag
`admission`).

- `GET /events/{event_id}/check-ins` — capability `attendees`. Query: `from_: datetime | None`
  (alias `from`), `to: datetime | None`, `source: Literal["online","offline_sync"] | None`,
  `state: Literal["current","reversed"] | None`, `ticket_type_id: UUID | None`, `q: str | None`
  (2..100 chars, partial attendee name using the escaping helper `like_escape` from
  `app/entry_service.py`), `limit: int = Query(50, ge=1, le=200)`, `offset: int = Query(0, ge=0)`.
  Order: `accepted_at ASC, id ASC` (deterministic). Response `{items, total, limit, offset}` with
  `CheckInHistoryItem {check_in_id, ticket_id, attendee_name, ticket_type_name, seat, source, accepted_at, captured_at, scanner: {id, display_name}, device_label: str | null, operation_id, reversed_at, reversal: {reason, actor: {id, display_name}, created_at} | null}`.
  Join `check_in` → `ticket` → `order_item` for names/snapshots, `app_user` for scanner and
  reversal actor, `scanner_device` for the label, `check_in_reversal` for the reversal. No N+1: one
  query for the page, one for `total`.
- `GET /events/{event_id}/check-ins.csv` — same filters, no pagination, hard cap 10 000 rows
  (`fail("export_too_large", 413)` beyond it; the message tells the caller to narrow the range).
  UTF-8 with BOM, `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="check-ins-{event_id}.csv"`,
  columns: `check_in_id,ticket_id,attendee_name,ticket_type,seat,source,accepted_at,captured_at,scanner,device,reversed_at,reversal_reason,reversed_by`.
  Use `csv.writer` with `QUOTE_ALL`; neutralise formula injection by prefixing a `'` to any cell starting
  with `=`, `+`, `-`, `@` (follow `app/admin_service.py`'s CSV export if it already has such a helper — reuse it by import, do not copy).
  Write an audit row `admission.history_exported` (`catalog_audit`) in the request transaction.
- `GET /tickets/{ticket_id}/admission` — buyer or claimed recipient (reuse
  `delivery_ticket` from `app/ticket_document_service.py`): `{ticket_id, status, checked_in_at: datetime | None, reversed_at: datetime | None, admission_window: {opens_at, closes_at}}`
  where `checked_in_at` comes from the current (non-reversed) check-in and `reversed_at` from the most
  recent reversed one when there is no current admission.

### Tests — new `tests/test_admission_history.py`

1. Two check-ins (one later reversed) → list shows both with correct `reversed_at`/`reversal`, total 2,
   deterministic order; `state=current` returns 1; `state=reversed` returns 1; `source=offline_sync`
   returns 0; `q=` partial name filters; `from`/`to` bound by `accepted_at`.
2. Staff with `attendees` but not `scan` can read; staff with only `scan` get 403; stranger 404.
3. CSV: header + rows, BOM present, a recipient named `=HYPERLINK("x")` is escaped, audit row exists.
4. `GET /tickets/{id}/admission` for buyer, recipient (200) and stranger (404); reflects check-in and reversal.

### Docs

`backend/ADMISSION_API.md`: add the three endpoints under an "Organizer admission history" heading.

## Task 5: Documentation, configuration and handoff for the increment

- `backend/README.md`: the "Database relations and transactions" paragraph: 46 → 48 tables, add
  `0009_files_admission` to the migration list; mention `STORAGE_ROOT` and that bootstrap must be re-run
  after upgrading (it grants on all tables). Mention the new test files in the "Tests" paragraph.
- `backend/.env.example`: add `STORAGE_ROOT=var/storage`, `ATTACHMENT_MAX_BYTES=5242880`,
  `ATTACHMENT_MAX_PER_MESSAGE=5`, `ATTACHMENT_LINK_SECONDS=300`.
- Root `docker-compose.yml`: add a named volume `file_storage` mounted at `/app/var/storage` for
  both `api` and `worker` and set `STORAGE_ROOT=/app/var/storage` in their `environment` (check the
  Dockerfile's `WORKDIR` first and use the real path).
- `docs/CLIENT_HANDOFF_NOTES.md`: a new dated section "Increment 2 (2026-10-26)" listing for Adil the
  verification preview and for Yershuak attachments (upload → message → download-link flow), the
  check-in history/CSV, `GET /tickets/{id}/admission`, and the PDF now attached to the email.
- `docs/BiletFlow_Backend_Requirements.md`: add/extend the "Current implementation" notes of BF-10,
  BF-11, BF-12, BF-16 and BF-20 with one or two sentences each pointing at the guides (no other edits).
- `docs/parallel-work/PART_A_IMPLEMENTATION_PLAN.md`: append a "Status" section listing each task
  as done with its commit SHAs, and a "Merge notes for Part B" section: Part B must use migration
  numbers from `0010_` and set `down_revision` to the newest migration on `main` when its PR is
  rebased/merged; Part B must not edit `stored_file` (it may reference it for event images via its
  own migration); shared files (`main.py`, `all_models.py`, `env.py`, `config.py`, `worker.py`,
  `README.md`) will conflict trivially (additive lines) and should be resolved by keeping both sides.
- Run the whole quality gate once more: ruff check, ruff format --check, full pytest.
