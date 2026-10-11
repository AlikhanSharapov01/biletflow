"""Operator command for platform-admin grants: python -m app.admin_cli grant|revoke EMAIL.

There is deliberately no HTTP endpoint for this: no API caller can grant itself privileges.
The account must already exist, be active and have a verified email address.
"""

import argparse
from uuid import uuid4

from sqlalchemy import select

from .admin_models import PlatformAdmin
from .config import Settings
from .db import database
from .models import AuditLog, User
from .security import now


def set_admin(factory, email, grant):
    """Returns 'granted', 'already_admin', 'revoked' or 'not_admin'; raises LookupError/ValueError."""
    email = email.strip().lower()
    with factory.begin() as db:
        user = db.scalar(select(User).where(User.email == email).with_for_update())
        if not user:
            raise LookupError("No account with that email address")
        row = db.scalar(select(PlatformAdmin).where(PlatformAdmin.user_id == user.id))
        if grant:
            if user.status != "active" or user.email_verified_at is None:
                raise ValueError("The account must be active and email-verified")
            if row and row.revoked_at is None:
                return "already_admin"
            if row:
                row.revoked_at = None
            else:
                row = PlatformAdmin(user_id=user.id)
                db.add(row)
                db.flush()
        else:
            if not row or row.revoked_at is not None:
                return "not_admin"
            row.revoked_at = now()
        db.add(
            AuditLog(
                service_actor="admin_cli",
                action="admin.granted" if grant else "admin.revoked",
                entity_type="platform_admin",
                entity_id=row.id,
                description="admin.granted" if grant else "admin.revoked",
                safe_change={"user_id": str(user.id)},
                correlation_id=uuid4(),
            )
        )
    return "granted" if grant else "revoked"


def main(argv=None):
    parser = argparse.ArgumentParser(description="Grant or revoke platform-admin access")
    parser.add_argument("action", choices=["grant", "revoke"])
    parser.add_argument("email")
    args = parser.parse_args(argv)
    engine, factory = database(Settings().database_url.get_secret_value())
    try:
        print(set_admin(factory, args.email, args.action == "grant"))
    except (LookupError, ValueError) as error:
        raise SystemExit(str(error)) from None
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
