"""Platform settings in force, and the allowlist that is safe to show to every client.

Settings are append-only versions with an effective time (see ``admin_service.change_setting``).
New holds, quotes and activations read the value in force when they are created and save it;
records that already exist never read a setting again.
"""

from sqlalchemy import select, text

from .admin_models import SettingVersion
from .admin_schemas import SETTINGS
from .security import now

# The only settings exposed without admin rights: clients need them to show countdowns, fee
# estimates and upload limits. History, pending versions, authors and reasons stay admin-only.
PUBLIC_SETTINGS = ("hold_minutes", "processing_rate_bps", "activation_fee_minor")


def setting_lock_key(key):
    return {"key": "setting:" + key}


def effective_setting(db, key, at=None):
    """Value in force at `at` (default now). Other modules call this when they start a new
    hold, quote or activation; stored orders and activations keep their own snapshots."""
    row = db.scalar(
        select(SettingVersion.value)
        .where(SettingVersion.setting_key == key, SettingVersion.effective_at <= (at or now()))
        .order_by(SettingVersion.version.desc())
        .limit(1)
    )
    return SETTINGS[key][0] if row is None else row


def settings_now(db, *keys):
    """The time to stamp a new record with, and the settings in force at that time.

    A shared lock on each key waits for an uncommitted change (which takes the exclusive lock
    before it reads the clock), so a change can never become effective at a moment before
    this record's own timestamp without being visible to it.
    """
    for key in sorted(keys):
        db.execute(
            text("SELECT pg_advisory_xact_lock_shared(hashtextextended(:key, 3))"),
            setting_lock_key(key),
        )
    at = now()
    return at, {key: effective_setting(db, key, at) for key in keys}


def upload_limit(db, settings):
    """Bytes allowed for one upload: the admin setting, never above the deployment cap."""
    return min(settings.attachment_max_bytes, effective_setting(db, "upload_max_mb") * 1024 * 1024)


def public_settings(db, settings):
    values = {key: effective_setting(db, key) for key in PUBLIC_SETTINGS}
    return values | {"upload_max_bytes": upload_limit(db, settings), "currency": "KZT"}
