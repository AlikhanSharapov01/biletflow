"""Idempotent fictional venue/category seed: python -m app.seed."""

from datetime import timedelta
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.dialects.postgresql import insert

from .campaign_models import Campaign, PromoCode
from .campaign_service import link_token
from .catalog_models import (
    Category,
    Event,
    Layout,
    Organization,
    Seat,
    Section,
    TicketType,
    Venue,
    VenueRow,
)
from .config import Settings
from .db import database
from .models import User
from .security import digest, now


def seed_id(name):
    return uuid5(NAMESPACE_URL, "https://biletflow.example/seed/" + name)


def seed_catalog(factory):
    def add(db, model, seed_key, **values):
        identifier = seed_id(seed_key)
        db.execute(
            insert(model)
            .values(id=identifier, **values)
            .on_conflict_do_nothing(index_elements=[model.id])
        )
        return identifier

    with factory.begin() as db:
        add(
            db,
            Category,
            "category-community",
            code="community",
            name_en="Community",
            name_ru="Сообщество",
            name_kk="Қауымдастық",
        )
        add(
            db,
            Category,
            "category-concert",
            code="concert",
            name_en="Concert",
            name_ru="Концерт",
            name_kk="Концерт",
        )
        venue = add(
            db,
            Venue,
            "venue-campus",
            name="BiletFlow Demo Hall",
            city="Almaty",
            address="Fictional campus venue — demonstration only",
        )
        layout = add(
            db,
            Layout,
            "layout-campus",
            venue_id=venue,
            name="Demo 12 seats",
            version=1,
            canvas_width=800,
            canvas_height=400,
        )
        section = add(db, Section, "section-main", layout_id=layout, label="Main")
        for number, label in enumerate(["A", "B"]):
            row = add(
                db, VenueRow, "row-" + label, layout_id=layout, section_id=section, label=label
            )
            for seat in range(1, 7):
                add(
                    db,
                    Seat,
                    f"seat-{label}-{seat}",
                    layout_id=layout,
                    row_id=row,
                    label=str(seat),
                    price_category="premium" if label == "A" else "standard",
                    is_accessible=seat == 1,
                    x=100 * seat,
                    y=100 + 100 * number,
                )


def seed_demo_campaigns(factory, settings):
    """Fictional organizer, paid event and two campaigns for local demonstrations.

    Never runs in production. The organizer has no password: request a reset for
    demo-organizer@example.com and open the link from Mailpit. Paid sales still have to be
    activated for the event, which is part of the demonstrated flow.
    """
    if settings.environment == "production":
        return
    current = now()
    venue = seed_id("venue-campus")
    category = seed_id("category-concert")
    owner = seed_id("demo-organizer")
    org = seed_id("demo-organization")
    event = seed_id("demo-event")

    def add(db, model, identifier, **values):
        db.execute(
            insert(model)
            .values(id=identifier, **values)
            .on_conflict_do_nothing(index_elements=[model.id])
        )

    def campaign(db, key, name, code, limit, **discount):
        campaign_id, promo_id = seed_id(f"demo-campaign-{key}"), seed_id(f"demo-promo-{key}")
        add(
            db,
            Campaign,
            campaign_id,
            event_id=event,
            name=name,
            starts_at=current - timedelta(days=1),
            ends_at=current + timedelta(days=30),
            max_redemptions=limit,
            **discount,
        )
        add(
            db,
            PromoCode,
            promo_id,
            event_id=event,
            campaign_id=campaign_id,
            code_normalized=code,
            link_token_hash=digest(link_token(settings, promo_id)),
        )

    with factory.begin() as db:
        add(
            db,
            User,
            owner,
            email="demo-organizer@example.com",
            display_name="Demo Organizer",
            email_verified_at=current,
        )
        add(
            db,
            Organization,
            org,
            owner_user_id=owner,
            name="BiletFlow Demo Productions",
            contact_email="demo-organizer@example.com",
        )
        starts = current + timedelta(days=31)
        add(
            db,
            Event,
            event,
            organization_id=org,
            category_id=category,
            venue_id=venue,
            title="BiletFlow Demo Concert",
            description="Fictional event for demonstrating promo campaigns.",
            publication_state="published",
            capacity=200,
            starts_at=starts,
            ends_at=starts + timedelta(hours=2),
            registration_opens_at=current - timedelta(days=1),
            registration_closes_at=starts - timedelta(hours=1),
            admission_opens_at=starts - timedelta(hours=1),
            admission_closes_at=starts + timedelta(hours=1),
            refund_cutoff_at=starts - timedelta(days=1),
            calendar_uid="demo-event@biletflow",
        )
        add(
            db,
            TicketType,
            seed_id("demo-ticket-paid"),
            event_id=event,
            name="Standard",
            description="Demonstration ticket; no real money moves.",
            kind="paid",
            price_minor=1_000_000,
            quantity_limit=200,
            per_order_limit=5,
            sales_open_at=current - timedelta(days=1),
            sales_close_at=starts - timedelta(hours=1),
        )
    with factory.begin() as db:
        campaign(
            db,
            "percent",
            "Demo 10% off",
            "DEMO10",
            100,
            discount_kind="percentage",
            percentage_bps=1000,
        )
        campaign(
            db,
            "fixed",
            "Demo KZT 1,000 off",
            "DEMO1000",
            50,
            discount_kind="fixed",
            fixed_minor=100_000,
        )


def main():
    settings = Settings()
    engine, factory = database(settings.database_url.get_secret_value())
    try:
        seed_catalog(factory)
        seed_demo_campaigns(factory, settings)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
