"""Convert legacy work_orders enum columns (status/work_type/priority) to VARCHAR.

The ORM (app/db/models.py) maps these columns as plain String columns to
match the canonical VARCHAR schema. Databases bootstrapped early via
SQLModel.metadata.create_all() instead ended up with native Postgres enum
types for these columns, which asyncpg rejects when SQLAlchemy binds a
plain string parameter ("column is of type workorderstatus but expression
is of type text"). This migration is a no-op wherever the columns are
already VARCHAR (e.g. production/Neon).

Revision ID: 20260908_03
Revises: 20260908_02
Create Date: 2026-09-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260908_03"
down_revision = "20260908_02"
branch_labels = None
depends_on = None


_COLUMNS = [
    ("work_orders", "status", "workorderstatus", 30),
    ("work_orders", "work_type", "workordertype", 30),
    ("work_orders", "priority", "workorderpriority", 20),
    ("work_order_photos", "photo_type", "workorderphototype", 30),
    ("work_order_whatsapp_messages", "status", "workorderwhatsappstatus", 30),
]


def upgrade() -> None:
    conn = op.get_bind()
    for table, column, enum_name, length in _COLUMNS:
        udt = conn.execute(sa.text(
            "SELECT udt_name FROM information_schema.columns "
            "WHERE table_name = :table AND column_name = :column"
        ), {"table": table, "column": column}).scalar()
        if udt != enum_name:
            continue  # already VARCHAR (or table/column not present) — nothing to do
        conn.execute(sa.text(
            f'ALTER TABLE {table} ALTER COLUMN {column} '
            f'TYPE VARCHAR({length}) USING LOWER({column}::text)'
        ))


def downgrade() -> None:
    pass
