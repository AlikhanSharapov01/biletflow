"""Imports every model module so all tables are registered on Base.metadata.

Entry points that run outside create_app (the worker, operator CLIs) import this module so
SQLAlchemy can resolve cross-module foreign keys.
"""

from . import (  # noqa: F401
    admin_models,
    admission_models,
    catalog_models,
    checkout_models,
    models,
    notification_models,
    offline_models,
    support_models,
)
