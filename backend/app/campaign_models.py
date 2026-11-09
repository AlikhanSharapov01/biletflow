"""SRS 4.14 tables: promo campaigns, codes, reservations and immutable redemptions.

Follows campaign / promo_code / promo_reservation / promo_redemption from docs/database, with
two deliberate differences: a code is unique per event rather than platform-wide (one organizer
must not be able to squat or probe another organizer's codes), and max_redemptions may be NULL
for an unlimited campaign, which the organizer form offers.
"""

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
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


def _id():
    return Column(
        "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
    )


def _created():
    return Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class Campaign(Base):
    __table__ = Table(
        "campaign",
        Base.metadata,
        _id(),
        Column("event_id", PGUUID, nullable=False),
        Column("name", Text, nullable=False),
        Column("discount_kind", Text, nullable=False),
        Column("percentage_bps", Integer, nullable=True),
        Column("fixed_minor", BigInteger, nullable=True),
        Column("starts_at", DateTime(timezone=True), nullable=False),
        Column("ends_at", DateTime(timezone=True), nullable=False),
        Column("max_redemptions", Integer, nullable=True),
        Column("is_enabled", Boolean, nullable=False, server_default=text("true")),
        Column("all_ticket_types", Boolean, nullable=False, server_default=text("true")),
        _created(),
        UniqueConstraint("id", "event_id", name="campaign_uq1"),
        CheckConstraint(
            "(discount_kind = 'percentage' AND percentage_bps BETWEEN 1 AND 10000 "
            "AND fixed_minor IS NULL) OR "
            "(discount_kind = 'fixed' AND fixed_minor > 0 AND percentage_bps IS NULL)",
            name="campaign_ck1",
        ),
        CheckConstraint(
            "ends_at > starts_at AND (max_redemptions IS NULL OR max_redemptions > 0)",
            name="campaign_ck2",
        ),
        ForeignKeyConstraint(
            ["event_id"],
            ["biletflow.event.id"],
            name="fk_campaign_event",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class CampaignTicketType(Base):
    __table__ = Table(
        "campaign_ticket_type",
        Base.metadata,
        _id(),
        Column("event_id", PGUUID, nullable=False),
        Column("campaign_id", PGUUID, nullable=False),
        Column("ticket_type_id", PGUUID, nullable=False),
        _created(),
        UniqueConstraint("campaign_id", "ticket_type_id", name="campaign_ticket_type_uq1"),
        ForeignKeyConstraint(
            ["campaign_id", "event_id"],
            ["biletflow.campaign.id", "biletflow.campaign.event_id"],
            name="fk_campaign_ticket_type_campaign",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["ticket_type_id", "event_id"],
            ["biletflow.ticket_type.id", "biletflow.ticket_type.event_id"],
            name="fk_campaign_ticket_type_type",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class PromoCode(Base):
    __table__ = Table(
        "promo_code",
        Base.metadata,
        _id(),
        Column("event_id", PGUUID, nullable=False),
        Column("campaign_id", PGUUID, nullable=False),
        Column("code_normalized", Text, nullable=False),
        Column("link_token_hash", Text, nullable=False),
        Column("is_enabled", Boolean, nullable=False, server_default=text("true")),
        _created(),
        UniqueConstraint("event_id", "code_normalized", name="promo_code_uq1"),
        UniqueConstraint("link_token_hash", name="promo_code_uq2"),
        UniqueConstraint("id", "event_id", "campaign_id", name="promo_code_uq3"),
        UniqueConstraint("campaign_id", name="promo_code_uq4"),
        CheckConstraint("code_normalized = upper(btrim(code_normalized))", name="promo_code_ck1"),
        ForeignKeyConstraint(
            ["campaign_id", "event_id"],
            ["biletflow.campaign.id", "biletflow.campaign.event_id"],
            name="fk_promo_code_campaign",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class PromoReservation(Base):
    __table__ = Table(
        "promo_reservation",
        Base.metadata,
        _id(),
        Column("event_id", PGUUID, nullable=False),
        Column("campaign_id", PGUUID, nullable=False),
        Column("promo_code_id", PGUUID, nullable=False),
        Column("hold_id", PGUUID, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'active'")),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        Column("discount_snapshot", JSONB, nullable=False),
        _created(),
        UniqueConstraint("id", "event_id", "campaign_id", name="promo_reservation_uq1"),
        CheckConstraint("status IN ('active','consumed','released')", name="promo_reservation_ck1"),
        CheckConstraint("expires_at > created_at", name="promo_reservation_ck2"),
        CheckConstraint("jsonb_typeof(discount_snapshot) = 'object'", name="promo_reservation_ck3"),
        ForeignKeyConstraint(
            ["campaign_id", "event_id"],
            ["biletflow.campaign.id", "biletflow.campaign.event_id"],
            name="fk_promo_reservation_campaign",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["promo_code_id", "event_id", "campaign_id"],
            [
                "biletflow.promo_code.id",
                "biletflow.promo_code.event_id",
                "biletflow.promo_code.campaign_id",
            ],
            name="fk_promo_reservation_code",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["hold_id", "event_id"],
            ["biletflow.checkout_hold.id", "biletflow.checkout_hold.event_id"],
            name="fk_promo_reservation_hold",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class PromoRedemption(Base):
    __table__ = Table(
        "promo_redemption",
        Base.metadata,
        _id(),
        Column("event_id", PGUUID, nullable=False),
        Column("campaign_id", PGUUID, nullable=False),
        Column("reservation_id", PGUUID, nullable=False),
        Column("order_id", PGUUID, nullable=False),
        Column("discount_minor", BigInteger, nullable=False),
        _created(),
        UniqueConstraint("order_id", name="promo_redemption_uq1"),
        UniqueConstraint("reservation_id", name="promo_redemption_uq2"),
        CheckConstraint("discount_minor >= 0", name="promo_redemption_ck1"),
        ForeignKeyConstraint(
            ["campaign_id", "event_id"],
            ["biletflow.campaign.id", "biletflow.campaign.event_id"],
            name="fk_promo_redemption_campaign",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["reservation_id", "event_id", "campaign_id"],
            [
                "biletflow.promo_reservation.id",
                "biletflow.promo_reservation.event_id",
                "biletflow.promo_reservation.campaign_id",
            ],
            name="fk_promo_redemption_reservation",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["order_id", "event_id"],
            ["biletflow.ticket_order.id", "biletflow.ticket_order.event_id"],
            name="fk_promo_redemption_order",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


Index(
    "uq_active_promo_hold",
    PromoReservation.hold_id,
    unique=True,
    postgresql_where=text("status = 'active'"),
)
Index("ix_promo_reservation_campaign", PromoReservation.campaign_id, PromoReservation.status)
Index("ix_promo_redemption_campaign", PromoRedemption.campaign_id)
Index("ix_campaign_event", Campaign.event_id, Campaign.created_at)
