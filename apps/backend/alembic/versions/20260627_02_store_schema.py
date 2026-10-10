"""Create the store workflow tables missing from the initial migration.

Revision ID: 20260627_02
Revises: 20260627_01
Create Date: 2026-06-27
"""

from alembic import op
from sqlmodel import SQLModel

# Importing the models registers every table in SQLModel.metadata.
from app.db import models as _models  # noqa: F401


revision = "20260627_02"
down_revision = "20260627_01"
branch_labels = None
depends_on = None


def _store_tables():
    return [
        table
        for table in SQLModel.metadata.sorted_tables
        if table.name.startswith("store_")
    ]


def upgrade() -> None:
    bind = op.get_bind()
    for table in _store_tables():
        table.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for table in reversed(_store_tables()):
        table.drop(bind=bind, checkfirst=True)
