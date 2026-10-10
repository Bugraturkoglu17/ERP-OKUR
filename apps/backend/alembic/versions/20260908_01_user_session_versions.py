"""Store JWT revocation versions outside the legacy users table.

Revision ID: 20260908_01
Revises: 20260907_01
Create Date: 2026-09-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260908_01"
down_revision = "20260907_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "user_session_versions" not in inspector.get_table_names():
        op.create_table(
            "user_session_versions",
            sa.Column("user_id", sa.UUID(), primary_key=True, nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("user_session_versions")
