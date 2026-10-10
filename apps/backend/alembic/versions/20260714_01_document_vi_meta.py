"""Document: vi_meta alanı eklendi (görsel envanter metadata)

Revision ID: 20260714_01
Revises: 20260629_02
Create Date: 2026-07-14
"""

from alembic import op
import sqlalchemy as sa

revision = "20260714_01"
down_revision = "20260629_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("vi_meta", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "vi_meta")
