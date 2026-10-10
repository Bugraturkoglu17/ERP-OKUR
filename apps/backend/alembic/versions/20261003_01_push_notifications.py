"""Add push_subscriptions + system_settings (Web Push telefon bildirimleri).

Revision ID: 20261003_01
Revises: 20260910_02
Create Date: 2026-10-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261003_01"
down_revision = "20260910_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bir kullanıcının bildirim açtığı her cihaz/tarayıcı için bir satır.
    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=True),
        sa.Column("endpoint", sa.String(length=1000), nullable=False),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("panel", sa.String(length=20), nullable=False, server_default=""),
        sa.Column("user_agent", sa.String(length=400), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])
    op.create_index("ux_push_subscriptions_endpoint", "push_subscriptions", ["endpoint"], unique=True)

    # Sunucunun kendi ürettiği kalıcı değerler (şu an: VAPID anahtar çifti).
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("push_subscriptions")
