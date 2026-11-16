"""Optional GA4 integration tables (migration 0020_ga4_analytics).

None of these rows is financial truth: orders, refunds and attribution stay in the commerce
tables. A connection belongs to one organization; exports and cached aggregates carry the
organization so composite keys keep them inside the connected organization's events.
"""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from .models import Base

MEASUREMENTS = ("campaign_landing", "event_view", "checkout_start", "purchase", "refund")


def identifier():
    return Column("id", PGUUID, primary_key=True, server_default=text("gen_random_uuid()"))


def stamp(name):
    return Column(
        name, DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )


def fk(columns, targets, name):
    return ForeignKeyConstraint(
        columns, targets, name=name, ondelete="RESTRICT", onupdate="RESTRICT"
    )


class GA4Connection(Base):
    __table__ = Table(
        "ga4_connection",
        Base.metadata,
        identifier(),
        Column("organization_id", PGUUID, nullable=False),
        Column("property_id", Text, nullable=False),
        Column("secret_reference", Text, nullable=False, server_default=text("'environment'")),
        Column("is_enabled", Boolean, nullable=False, server_default=text("false")),
        Column("enabled_at", DateTime(timezone=True)),
        stamp("updated_at"),
        stamp("created_at"),
        UniqueConstraint("organization_id", name="ga4_connection_uq1"),
        UniqueConstraint("id", "organization_id", name="ga4_connection_uq2"),
        CheckConstraint("property_id ~ '^[0-9]+$'", name="ga4_connection_ck1"),
        CheckConstraint("secret_reference = 'environment'", name="ga4_connection_ck2"),
        CheckConstraint("NOT is_enabled OR enabled_at IS NOT NULL", name="ga4_connection_ck3"),
        fk(["organization_id"], ["biletflow.organization.id"], "fk_ga4_connection_org"),
    )


class AnalyticsExport(Base):
    __table__ = Table(
        "analytics_export",
        Base.metadata,
        identifier(),
        Column("connection_id", PGUUID, nullable=False),
        Column("organization_id", PGUUID, nullable=False),
        Column("event_id", PGUUID, nullable=False),
        Column("order_id", PGUUID),
        Column("refund_id", PGUUID),
        Column("measurement_kind", Text, nullable=False),
        Column("analytics_event_id", PGUUID, nullable=False),
        Column("safe_payload", JSONB, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'pending'")),
        Column("attempt_count", Integer, nullable=False, server_default=text("0")),
        stamp("available_at"),
        Column("sent_at", DateTime(timezone=True)),
        Column("last_error", Text),
        stamp("created_at"),
        UniqueConstraint("analytics_event_id", name="analytics_export_uq1"),
        UniqueConstraint(
            "connection_id", "order_id", "measurement_kind", name="analytics_export_uq2"
        ),
        UniqueConstraint(
            "connection_id", "refund_id", "measurement_kind", name="analytics_export_uq3"
        ),
        CheckConstraint(
            "status IN ('pending','sent','skipped','failed')", name="analytics_export_ck1"
        ),
        CheckConstraint("jsonb_typeof(safe_payload) = 'object'", name="analytics_export_ck2"),
        CheckConstraint(
            "measurement_kind IN ('campaign_landing','event_view','checkout_start','purchase','refund')",
            name="analytics_export_ck3",
        ),
        CheckConstraint(
            "(order_id IS NOT NULL) = (measurement_kind IN ('purchase','refund')) "
            "AND (refund_id IS NOT NULL) = (measurement_kind = 'refund')",
            name="analytics_export_ck4",
        ),
        CheckConstraint("(status = 'sent') = (sent_at IS NOT NULL)", name="analytics_export_ck5"),
        CheckConstraint("attempt_count >= 0", name="analytics_export_ck6"),
        fk(
            ["connection_id", "organization_id"],
            ["biletflow.ga4_connection.id", "biletflow.ga4_connection.organization_id"],
            "fk_analytics_export_connection",
        ),
        fk(
            ["event_id", "organization_id"],
            ["biletflow.event.id", "biletflow.event.organization_id"],
            "fk_analytics_export_event",
        ),
        fk(
            ["order_id", "event_id"],
            ["biletflow.ticket_order.id", "biletflow.ticket_order.event_id"],
            "fk_analytics_export_order",
        ),
        fk(
            ["refund_id", "event_id"],
            ["biletflow.refund.id", "biletflow.refund.event_id"],
            "fk_analytics_export_refund",
        ),
        Index(
            "ix_analytics_export_pending",
            "available_at",
            "id",
            postgresql_where=text("status = 'pending'"),
        ),
    )


class GA4Cache(Base):
    __table__ = Table(
        "ga4_cache",
        Base.metadata,
        identifier(),
        Column("connection_id", PGUUID, nullable=False),
        Column("organization_id", PGUUID, nullable=False),
        Column("event_id", PGUUID, nullable=False),
        Column("query_hash", Text, nullable=False),
        Column("range_start", Date, nullable=False),
        Column("range_end", Date, nullable=False),
        Column("metrics", JSONB, nullable=False),
        Column("fetched_at", DateTime(timezone=True), nullable=False),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        stamp("created_at"),
        UniqueConstraint("connection_id", "event_id", "query_hash", name="ga4_cache_uq1"),
        CheckConstraint("range_end > range_start", name="ga4_cache_ck1"),
        CheckConstraint("expires_at > fetched_at", name="ga4_cache_ck2"),
        CheckConstraint("jsonb_typeof(metrics) = 'object'", name="ga4_cache_ck3"),
        fk(
            ["connection_id", "organization_id"],
            ["biletflow.ga4_connection.id", "biletflow.ga4_connection.organization_id"],
            "fk_ga4_cache_connection",
        ),
        fk(
            ["event_id", "organization_id"],
            ["biletflow.event.id", "biletflow.event.organization_id"],
            "fk_ga4_cache_event",
        ),
    )
