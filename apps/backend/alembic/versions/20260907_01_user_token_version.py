"""Add token_version to users for server-side session revocation.

Revision ID: 20260907_01
Revises: 20260906_01
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260907_01"
down_revision = "20260906_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("users")}

    if "token_version" not in columns:
        owner = conn.execute(sa.text("SELECT tableowner FROM pg_tables WHERE schemaname=current_schema() AND tablename='users'")).scalar()
        current_user = conn.execute(sa.text("SELECT current_user")).scalar()
        # Bazı kurulumlarda tablo ilk bootstrap rolüne ait olabilir. Uygulama
        # rolü ALTER yetkisine sahip değilse dağıtımı düşürme; sonraki migration
        # oturum sürümünü uygulamanın sahibi olduğu ayrı tabloda tutar.
        if owner == current_user:
            op.add_column(
                "users",
                sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "token_version" in columns:
        owner = conn.execute(sa.text("SELECT tableowner FROM pg_tables WHERE schemaname=current_schema() AND tablename='users'")).scalar()
        current_user = conn.execute(sa.text("SELECT current_user")).scalar()
        if owner == current_user:
            op.drop_column("users", "token_version")
