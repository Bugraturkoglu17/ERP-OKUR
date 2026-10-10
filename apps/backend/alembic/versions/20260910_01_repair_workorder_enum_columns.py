"""Repair legacy work-order enum columns that survived an earlier stamp.

Revision ID: 20260910_01
Revises: 20260908_04
Create Date: 2026-09-10
"""

from alembic import op
import sqlalchemy as sa


revision = "20260910_01"
down_revision = "20260908_04"
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
        udt = conn.execute(
            sa.text(
                "SELECT udt_name FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = :table AND column_name = :column"
            ),
            {"table": table, "column": column},
        ).scalar()
        if udt != enum_name:
            continue
        conn.execute(
            sa.text(
                f'ALTER TABLE "{table}" ALTER COLUMN "{column}" '
                f'TYPE VARCHAR({length}) USING LOWER("{column}"::text)'
            )
        )


def downgrade() -> None:
    # The application contract is VARCHAR. Recreating legacy enum types would
    # make writes fail again and is intentionally unsupported.
    pass
