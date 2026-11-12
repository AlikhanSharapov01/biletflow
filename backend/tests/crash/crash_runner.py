"""Child process for the crash-recovery harness: the real worker loop or the real API server.

Usage: python crash_runner.py {worker|api} CONFIG_JSON

The parent test starts this file as a separate OS process. An optional kill point is installed
by wrapping one real function at a side-effect boundary. When the boundary is reached the child
writes `<marker_dir>/<point>.json` and then either dies with os._exit(137) (no cleanup, no
`finally`, no rollback beyond what PostgreSQL does for a lost connection) or stops itself with
SIGSTOP so the parent can expire its lease and later SIGKILL or SIGCONT it.

Nothing here changes application behaviour when no kill point is configured.
"""

import json
import os
import signal
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))

CONFIG = json.loads(Path(sys.argv[2]).read_text())
KILL = CONFIG.get("kill") or {}


def reached(info=None):
    """Record that the kill point was hit, then die or stall as configured."""
    marker = Path(CONFIG["marker_dir"]) / f"{KILL['point']}.json"
    marker.write_text(json.dumps({"pid": os.getpid(), **(info or {})}))
    if KILL.get("action", "exit") == "stop":
        os.kill(os.getpid(), signal.SIGSTOP)
        # Resumed by SIGCONT: carry on exactly as a slow worker would.
        return
    os._exit(137)


def install_kill_point():
    point = KILL.get("point")
    if not point:
        return
    fired = {"done": False}

    def once():
        if fired["done"]:
            return False
        fired["done"] = True
        return True

    if point == "fanout_after_commit":
        # Die right after the fan-out transaction (notification rows) commits, before the
        # outbox job is acknowledged as done.
        from sqlalchemy import event
        from sqlalchemy.orm import Session

        from app import notification_service

        real_expand = notification_service.expand
        armed = {"value": False}

        def expand(db, payload):
            real_expand(db, payload)
            if payload.get("notice") == KILL.get("notice") and once():
                armed["value"] = True

        def after_commit(session):
            if armed["value"]:
                reached({"notice": KILL.get("notice")})

        notification_service.expand = expand
        event.listen(Session, "after_commit", after_commit)

    elif point in ("pdf_after_reserve", "pdf_after_put", "pdf_after_commit"):
        # pdf_after_reserve: the pending stored_file write intent is committed, no object yet.
        # pdf_after_put: the object is in storage; its write intent is committed but still
        # pending (not finalized, not referenced by the ticket).
        # pdf_after_commit: the stored_file row is clean and ticket.pdf_file_id is committed, the
        # email has not been sent and the outbox job is still leased.
        from app import ticket_file_service

        real_reserve = ticket_file_service.reserve
        real_write_row = ticket_file_service.write_row

        def reserve(factory, ticket_id, file_id, key, data):
            real_reserve(factory, ticket_id, file_id, key, data)
            if point == "pdf_after_reserve" and once():
                reached({"key": key, "ticket_id": str(ticket_id), "file_id": str(file_id)})

        def write_row(factory, storage, ticket_id, file_id, key, data, previous_id=None):
            if point == "pdf_after_put" and once():
                reached({"key": key, "ticket_id": str(ticket_id), "file_id": str(file_id)})
            result = real_write_row(factory, storage, ticket_id, file_id, key, data, previous_id)
            if point == "pdf_after_commit" and once():
                reached({"key": key, "ticket_id": str(ticket_id), "file_id": str(file_id)})
            return result

        ticket_file_service.reserve = reserve
        ticket_file_service.write_row = write_row

    elif point in ("smtp_after_send", "smtp_before_send"):
        # The SMTP server has (or has not yet) accepted the message; the delivery is not yet
        # acknowledged in the database. `message` selects outbox or notification email.
        import smtplib

        real_send = smtplib.SMTP.send_message
        prefix = "<notification-" if KILL.get("message") == "notification" else None

        def matches(message):
            message_id = message["Message-ID"] or ""
            if prefix:
                return message_id.startswith(prefix)
            return not message_id.startswith("<notification-")

        def send_message(self, message, *args, **kwargs):
            hit = matches(message) and once()
            if hit and point == "smtp_before_send":
                reached({"message_id": message["Message-ID"]})
            result = real_send(self, message, *args, **kwargs)
            if hit and point == "smtp_after_send":
                reached({"message_id": message["Message-ID"]})
            return result

        smtplib.SMTP.send_message = send_message

    elif point == "job_before_commit":
        # Die inside a worker transaction after its business rows are flushed but before
        # COMMIT: PostgreSQL must discard the whole transaction.
        from sqlalchemy.orm import object_session

        from app import payments_service

        real_finish = payments_service.finish

        def finish(job):
            if job.kind == KILL.get("job_kind") and once():
                # Send the pending INSERT/UPDATE statements to PostgreSQL, uncommitted.
                object_session(job).flush()
                reached({"job_id": str(job.id), "kind": job.kind})
            real_finish(job)

        payments_service.finish = finish

    elif point in ("api_after_inbox_commit", "api_after_apply_commit"):
        # The provider notification is committed to the inbox (before) or fully applied and
        # committed (after), but the HTTP response never reaches the provider.
        from app import payments_service

        real_process = payments_service.process

        def process(factory, settings, inbox_id):
            if point == "api_after_inbox_commit" and once():
                reached({"inbox_id": str(inbox_id)})
            result = real_process(factory, settings, inbox_id)
            if point == "api_after_apply_commit" and once():
                reached({"inbox_id": str(inbox_id)})
            return result

        payments_service.process = process

    else:
        raise SystemExit(f"unknown kill point {point}")


def environment():
    os.environ.update(
        DATABASE_URL=CONFIG["database_url"],
        JWT_SECRET="j" * 48,
        CHALLENGE_SECRET="c" * 48,
        ENVIRONMENT="test",
        COOKIE_SECURE="false",
        STORAGE_ROOT=CONFIG["storage_root"],
        SMTP_HOST="127.0.0.1",
        SMTP_PORT=str(CONFIG["smtp_port"]),
        RATE_IP_LIMIT="1000",
        RATE_IDENTITY_LIMIT="1000",
        ALLOWED_ORIGINS='["http://testserver"]',
    )


def run_worker():
    from app import worker

    worker.HEARTBEAT_FILE = Path(CONFIG["marker_dir"]) / "heartbeat"
    install_kill_point()
    worker.main()


def run_api():
    import uvicorn

    from app.config import Settings
    from app.main import create_app

    install_kill_point()
    app = create_app(Settings(_env_file=None))
    uvicorn.run(app, host="127.0.0.1", port=CONFIG["port"], log_level="warning")


if __name__ == "__main__":
    environment()
    try:
        {"worker": run_worker, "api": run_api}[sys.argv[1]]()
    except KeyboardInterrupt:
        pass
