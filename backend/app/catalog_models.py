"""Stage B tables, preserving the physical names and scoped FKs in the database atlas."""

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from .models import Base


class Organization(Base):
    __table__ = Table(
        "organization",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("owner_user_id", PGUUID, nullable=False),
        Column("name", Text, nullable=False),
        Column("contact_email", Text, nullable=False),
        Column("contact_phone", Text, nullable=True),
        Column("status", Text, nullable=False, server_default=text("'active'")),
        Column(
            "updated_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint("status IN ('active','suspended')", name="organization_ck1"),
        ForeignKeyConstraint(
            ["owner_user_id"],
            ["biletflow.app_user.id"],
            name="fk_organization_080",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Member(Base):
    __table__ = Table(
        "organization_member",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("organization_id", PGUUID, nullable=False),
        Column("user_id", PGUUID, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'active'")),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint("status IN ('active','revoked')", name="organization_member_ck1"),
        CheckConstraint(
            "(status = 'revoked') = (revoked_at IS NOT NULL)", name="organization_member_ck2"
        ),
        UniqueConstraint("organization_id", "user_id", name="organization_member_uq1"),
        UniqueConstraint("id", "organization_id", name="organization_member_uq2"),
        ForeignKeyConstraint(
            ["organization_id"],
            ["biletflow.organization.id"],
            name="fk_organization_member_002",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id"],
            ["biletflow.app_user.id"],
            name="fk_organization_member_081",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class MemberPermission(Base):
    __table__ = Table(
        "member_permission",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("member_id", PGUUID, nullable=False),
        Column("capability", Text, nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        CheckConstraint(
            "capability IN ('manage_profile','manage_staff','finance')",
            name="member_permission_ck1",
        ),
        UniqueConstraint("member_id", "capability", name="member_permission_uq1"),
        ForeignKeyConstraint(
            ["member_id"],
            ["biletflow.organization_member.id"],
            name="fk_member_permission_005",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Invitation(Base):
    __table__ = Table(
        "staff_invitation",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("organization_id", PGUUID, nullable=False),
        Column("email", Text, nullable=False),
        Column("invited_by_user_id", PGUUID, nullable=False),
        Column("token_hash", Text, nullable=False),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        Column("accepted_by_user_id", PGUUID, nullable=True),
        Column("accepted_at", DateTime(timezone=True), nullable=True),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint("email = lower(btrim(email))", name="staff_invitation_ck1"),
        CheckConstraint("expires_at > created_at", name="staff_invitation_ck2"),
        CheckConstraint(
            "(accepted_at IS NULL) = (accepted_by_user_id IS NULL)", name="staff_invitation_ck3"
        ),
        UniqueConstraint("token_hash", name="staff_invitation_uq1"),
        ForeignKeyConstraint(
            ["organization_id"],
            ["biletflow.organization.id"],
            name="fk_staff_invitation_082",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["invited_by_user_id"],
            ["biletflow.app_user.id"],
            name="fk_staff_invitation_083",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["accepted_by_user_id"],
            ["biletflow.app_user.id"],
            name="fk_staff_invitation_084",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class EventStaff(Base):
    __table__ = Table(
        "event_staff",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("event_id", PGUUID, nullable=False),
        Column("organization_id", PGUUID, nullable=False),
        Column("member_id", PGUUID, nullable=False),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        UniqueConstraint("event_id", "member_id", name="event_staff_uq1"),
        UniqueConstraint("id", "event_id", name="event_staff_uq2"),
        ForeignKeyConstraint(
            ["event_id", "organization_id"],
            ["biletflow.event.id", "biletflow.event.organization_id"],
            name="fk_event_staff_003",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["member_id", "organization_id"],
            ["biletflow.organization_member.id", "biletflow.organization_member.organization_id"],
            name="fk_event_staff_004",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class StaffPermission(Base):
    __table__ = Table(
        "staff_permission",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("event_staff_id", PGUUID, nullable=False),
        Column("capability", Text, nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        CheckConstraint(
            "capability IN ('event_edit','attendees','support','reports','refund','scan','reverse_checkin','staff')",
            name="staff_permission_ck1",
        ),
        UniqueConstraint("event_staff_id", "capability", name="staff_permission_uq1"),
        ForeignKeyConstraint(
            ["event_staff_id"],
            ["biletflow.event_staff.id"],
            name="fk_staff_permission_006",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Category(Base):
    __table__ = Table(
        "category",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("code", Text, nullable=False),
        Column("name_kk", Text, nullable=False),
        Column("name_ru", Text, nullable=False),
        Column("name_en", Text, nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        UniqueConstraint("code", name="category_uq1"),
    )


class Event(Base):
    __table__ = Table(
        "event",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("organization_id", PGUUID, nullable=False),
        Column("category_id", PGUUID, nullable=False),
        Column("venue_id", PGUUID, nullable=False),
        Column("venue_layout_id", PGUUID, nullable=True),
        Column("title", Text, nullable=False),
        Column("description", Text, nullable=False),
        Column("publication_state", Text, nullable=False, server_default=text("'draft'")),
        Column("moderation_state", Text, nullable=False, server_default=text("'normal'")),
        Column("visibility", Text, nullable=False, server_default=text("'public'")),
        Column("seating_mode", Text, nullable=False, server_default=text("'general'")),
        Column("capacity", Integer, nullable=False),
        Column("starts_at", DateTime(timezone=True), nullable=False),
        Column("ends_at", DateTime(timezone=True), nullable=False),
        Column("time_zone", Text, nullable=False, server_default=text("'Asia/Almaty'")),
        Column("registration_opens_at", DateTime(timezone=True), nullable=False),
        Column("registration_closes_at", DateTime(timezone=True), nullable=False),
        Column("admission_opens_at", DateTime(timezone=True), nullable=False),
        Column("admission_closes_at", DateTime(timezone=True), nullable=False),
        Column("refund_allowed", Boolean, nullable=False, server_default=text("true")),
        Column("refund_cutoff_at", DateTime(timezone=True), nullable=True),
        Column("calendar_uid", Text, nullable=False),
        Column("calendar_sequence", Integer, nullable=False, server_default=text("0")),
        Column("availability_version", BigInteger, nullable=False, server_default=text("0")),
        Column(
            "updated_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint(
            "publication_state IN ('draft','published','unpublished','cancelled')", name="event_ck1"
        ),
        CheckConstraint("moderation_state IN ('normal','suspended')", name="event_ck2"),
        CheckConstraint("visibility IN ('public','unlisted','private')", name="event_ck3"),
        CheckConstraint("seating_mode IN ('general','assigned')", name="event_ck4"),
        CheckConstraint("capacity >= 0", name="event_ck5"),
        CheckConstraint("ends_at > starts_at", name="event_ck6"),
        CheckConstraint(
            "registration_closes_at > registration_opens_at AND registration_closes_at <= ends_at",
            name="event_ck7",
        ),
        CheckConstraint("admission_closes_at > admission_opens_at", name="event_ck8"),
        CheckConstraint(
            "NOT refund_allowed OR (refund_cutoff_at IS NOT NULL AND refund_cutoff_at <= starts_at)",
            name="event_ck9",
        ),
        CheckConstraint(
            "(seating_mode = 'assigned') = (venue_layout_id IS NOT NULL)", name="event_ck10"
        ),
        CheckConstraint("calendar_sequence >= 0 AND availability_version >= 0", name="event_ck11"),
        UniqueConstraint("calendar_uid", name="event_uq1"),
        UniqueConstraint("id", "organization_id", name="event_uq2"),
        UniqueConstraint("id", "venue_layout_id", name="event_uq3"),
        ForeignKeyConstraint(
            ["venue_layout_id", "venue_id"],
            ["biletflow.venue_layout.id", "biletflow.venue_layout.venue_id"],
            name="fk_event_007",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["category_id"],
            ["biletflow.category.id"],
            name="fk_event_008",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["venue_id"],
            ["biletflow.venue.id"],
            name="fk_event_009",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["organization_id"],
            ["biletflow.organization.id"],
            name="fk_event_085",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class AccessGrant(Base):
    __table__ = Table(
        "event_access_grant",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("event_id", PGUUID, nullable=False),
        Column("user_id", PGUUID, nullable=False),
        Column("granted_by_user_id", PGUUID, nullable=False),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        UniqueConstraint("event_id", "user_id", name="event_access_grant_uq1"),
        ForeignKeyConstraint(
            ["event_id"],
            ["biletflow.event.id"],
            name="fk_event_access_grant_086",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["user_id"],
            ["biletflow.app_user.id"],
            name="fk_event_access_grant_087",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["granted_by_user_id"],
            ["biletflow.app_user.id"],
            name="fk_event_access_grant_088",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Venue(Base):
    __table__ = Table(
        "venue",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("name", Text, nullable=False),
        Column("address", Text, nullable=False),
        Column("city", Text, nullable=False),
        Column("country_code", Text, nullable=False, server_default=text("'KZ'")),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint("country_code = 'KZ'", name="venue_ck1"),
    )


class Layout(Base):
    __table__ = Table(
        "venue_layout",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("venue_id", PGUUID, nullable=False),
        Column("name", Text, nullable=False),
        Column("version", Integer, nullable=False, server_default=text("1")),
        Column("canvas_width", Integer, nullable=False),
        Column("canvas_height", Integer, nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint(
            "version > 0 AND canvas_width > 0 AND canvas_height > 0", name="venue_layout_ck1"
        ),
        UniqueConstraint("venue_id", "name", "version", name="venue_layout_uq1"),
        UniqueConstraint("id", "venue_id", name="venue_layout_uq2"),
        ForeignKeyConstraint(
            ["venue_id"],
            ["biletflow.venue.id"],
            name="fk_venue_layout_010",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Section(Base):
    __table__ = Table(
        "venue_section",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("layout_id", PGUUID, nullable=False),
        Column("label", Text, nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        UniqueConstraint("layout_id", "label", name="venue_section_uq1"),
        UniqueConstraint("id", "layout_id", name="venue_section_uq2"),
        ForeignKeyConstraint(
            ["layout_id"],
            ["biletflow.venue_layout.id"],
            name="fk_venue_section_011",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class VenueRow(Base):
    __table__ = Table(
        "venue_row",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("layout_id", PGUUID, nullable=False),
        Column("section_id", PGUUID, nullable=False),
        Column("label", Text, nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        UniqueConstraint("section_id", "label", name="venue_row_uq1"),
        UniqueConstraint("id", "layout_id", name="venue_row_uq2"),
        ForeignKeyConstraint(
            ["section_id", "layout_id"],
            ["biletflow.venue_section.id", "biletflow.venue_section.layout_id"],
            name="fk_venue_row_012",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Seat(Base):
    __table__ = Table(
        "venue_seat",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("layout_id", PGUUID, nullable=False),
        Column("row_id", PGUUID, nullable=False),
        Column("label", Text, nullable=False),
        Column("price_category", Text, nullable=False),
        Column("is_accessible", Boolean, nullable=False, server_default=text("false")),
        Column("x", Numeric(10, 2), nullable=False),
        Column("y", Numeric(10, 2), nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint("x >= 0 AND y >= 0", name="venue_seat_ck1"),
        UniqueConstraint("row_id", "label", name="venue_seat_uq1"),
        UniqueConstraint("id", "layout_id", name="venue_seat_uq2"),
        ForeignKeyConstraint(
            ["row_id", "layout_id"],
            ["biletflow.venue_row.id", "biletflow.venue_row.layout_id"],
            name="fk_venue_seat_013",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class TicketType(Base):
    __table__ = Table(
        "ticket_type",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("event_id", PGUUID, nullable=False),
        Column("name", Text, nullable=False),
        Column("description", Text, nullable=False),
        Column("kind", Text, nullable=False),
        Column("price_minor", BigInteger, nullable=False),
        Column("quantity_limit", Integer, nullable=False),
        Column("per_order_limit", Integer, nullable=False),
        Column("sales_open_at", DateTime(timezone=True), nullable=False),
        Column("sales_close_at", DateTime(timezone=True), nullable=False),
        Column("is_hidden", Boolean, nullable=False, server_default=text("false")),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint("kind IN ('free','paid')", name="ticket_type_ck1"),
        CheckConstraint(
            "(kind = 'free' AND price_minor = 0) OR (kind = 'paid' AND price_minor > 0)",
            name="ticket_type_ck2",
        ),
        CheckConstraint("quantity_limit >= 0 AND per_order_limit > 0", name="ticket_type_ck3"),
        CheckConstraint("sales_close_at > sales_open_at", name="ticket_type_ck4"),
        UniqueConstraint("id", "event_id", name="ticket_type_uq1"),
        ForeignKeyConstraint(
            ["event_id"],
            ["biletflow.event.id"],
            name="fk_ticket_type_091",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class EventSeat(Base):
    __table__ = Table(
        "event_seat",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("event_id", PGUUID, nullable=False),
        Column("layout_id", PGUUID, nullable=False),
        Column("venue_seat_id", PGUUID, nullable=False),
        Column("ticket_type_id", PGUUID, nullable=False),
        Column("section_label", Text, nullable=False),
        Column("row_label", Text, nullable=False),
        Column("seat_label", Text, nullable=False),
        Column("is_blocked", Boolean, nullable=False, server_default=text("false")),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        UniqueConstraint("event_id", "venue_seat_id", name="event_seat_uq1"),
        UniqueConstraint(
            "event_id", "section_label", "row_label", "seat_label", name="event_seat_uq2"
        ),
        UniqueConstraint("id", "event_id", "ticket_type_id", name="event_seat_uq3"),
        ForeignKeyConstraint(
            ["event_id", "layout_id"],
            ["biletflow.event.id", "biletflow.event.venue_layout_id"],
            name="fk_event_seat_014",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["venue_seat_id", "layout_id"],
            ["biletflow.venue_seat.id", "biletflow.venue_seat.layout_id"],
            name="fk_event_seat_015",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["ticket_type_id", "event_id"],
            ["biletflow.ticket_type.id", "biletflow.ticket_type.event_id"],
            name="fk_event_seat_016",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Hold(Base):
    __table__ = Table(
        "checkout_hold",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("event_id", PGUUID, nullable=False),
        Column("buyer_user_id", PGUUID, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'active'")),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        Column("closed_at", DateTime(timezone=True), nullable=True),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint(
            "status IN ('active','consumed','expired','released')", name="checkout_hold_ck1"
        ),
        CheckConstraint("expires_at > created_at", name="checkout_hold_ck2"),
        CheckConstraint("(status = 'active') = (closed_at IS NULL)", name="checkout_hold_ck3"),
        UniqueConstraint("id", "event_id", name="checkout_hold_uq1"),
        UniqueConstraint("id", "event_id", "buyer_user_id", name="checkout_hold_uq2"),
        ForeignKeyConstraint(
            ["event_id"],
            ["biletflow.event.id"],
            name="fk_checkout_hold_092",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["buyer_user_id"],
            ["biletflow.app_user.id"],
            name="fk_checkout_hold_093",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Allocation(Base):
    __table__ = Table(
        "inventory_allocation",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("event_id", PGUUID, nullable=False),
        Column("hold_id", PGUUID, nullable=False),
        Column("ticket_type_id", PGUUID, nullable=False),
        Column("event_seat_id", PGUUID, nullable=True),
        Column("state", Text, nullable=False, server_default=text("'held'")),
        Column("released_at", DateTime(timezone=True), nullable=True),
        Column("release_reason", Text, nullable=True),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint(
            "state IN ('held','sold','refund_quarantine','released')",
            name="inventory_allocation_ck1",
        ),
        CheckConstraint(
            "(state = 'released') = (released_at IS NOT NULL)", name="inventory_allocation_ck2"
        ),
        CheckConstraint(
            "(state = 'released') = (release_reason IS NOT NULL)", name="inventory_allocation_ck3"
        ),
        CheckConstraint(
            "release_reason IS NULL OR release_reason IN ('expired','abandoned','free_cancel','refund_succeeded')",
            name="inventory_allocation_ck4",
        ),
        UniqueConstraint(
            "id", "event_id", "hold_id", "ticket_type_id", name="inventory_allocation_uq1"
        ),
        ForeignKeyConstraint(
            ["hold_id", "event_id"],
            ["biletflow.checkout_hold.id", "biletflow.checkout_hold.event_id"],
            name="fk_inventory_allocation_017",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["ticket_type_id", "event_id"],
            ["biletflow.ticket_type.id", "biletflow.ticket_type.event_id"],
            name="fk_inventory_allocation_018",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["event_seat_id", "event_id", "ticket_type_id"],
            [
                "biletflow.event_seat.id",
                "biletflow.event_seat.event_id",
                "biletflow.event_seat.ticket_type_id",
            ],
            name="fk_inventory_allocation_019",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


Index(
    "uq_live_seat",
    Allocation.event_seat_id,
    unique=True,
    postgresql_where=Allocation.state.in_(["held", "sold", "refund_quarantine"]),
)
Index("ix_catalog_public", Event.publication_state, Event.visibility, Event.starts_at)
Index("ix_staff_invite_email", Invitation.organization_id, Invitation.email)
Index("ix_event_allocations", Allocation.event_id, Allocation.state)
