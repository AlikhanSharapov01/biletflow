from alembic import context
from sqlalchemy import create_engine

from app import catalog_models  # noqa: F401 — register the new module's tables
from app.config import Settings
from app.models import Base

settings = Settings()
url = settings.database_url.get_secret_value()
if context.is_offline_mode():
    context.configure(
        url=url, target_metadata=Base.metadata, literal_binds=True, include_schemas=True
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=Base.metadata, include_schemas=True
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
