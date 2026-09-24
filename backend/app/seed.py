"""Idempotent fictional venue/category seed: python -m app.seed."""

from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.dialects.postgresql import insert

from .catalog_models import Category, Layout, Seat, Section, Venue, VenueRow
from .config import Settings
from .db import database


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


def main():
    settings = Settings()
    engine, factory = database(settings.database_url.get_secret_value())
    try:
        seed_catalog(factory)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
