"""Add the explicit planned work-order status while preserving legacy draft rows.

Revision ID: 20260908_02
Revises: 20260908_01
Create Date: 2026-09-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260908_02"
down_revision = "20260908_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    labels = set(conn.execute(sa.text(
        "SELECT enumlabel FROM pg_enum "
        "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
        "WHERE typname='workorderstatus'"
    )).scalars())
    # The canonical Alembic schema stores work_orders.status as VARCHAR.
    # Some legacy/local databases were bootstrapped from SQLModel metadata and
    # therefore use a PostgreSQL enum. VARCHAR needs no schema change.
    if not labels:
        return
    if "PLANNED" in labels:
        return
    owner = conn.execute(sa.text("SELECT pg_get_userbyid(typowner) FROM pg_type WHERE typname='workorderstatus'")).scalar()
    current_user = conn.execute(sa.text("SELECT current_user")).scalar()
    if owner != current_user:
        raise RuntimeError(
            "workorderstatus enum must be migrated by its database owner; "
            f"current={current_user}, owner={owner}"
        )
    # SQLAlchemy persists Enum member names for this legacy column
    # (DRAFT, STARTED, ...), not the Python values.
    conn.execute(sa.text("ALTER TYPE workorderstatus ADD VALUE IF NOT EXISTS 'PLANNED'"))


def downgrade() -> None:
    pass
