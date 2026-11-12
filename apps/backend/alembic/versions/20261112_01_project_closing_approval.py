"""Proje kapanış onayı: aşama sorumlusu kapanışı yöneticiye onaya gönderir.

Revision ID: 20261112_01
Revises: 20261110_01
Create Date: 2026-11-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261112_01"
down_revision = "20261110_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("installation_project_stages", sa.Column("approval_requested_at", sa.DateTime(), nullable=True))
    op.add_column("installation_project_stages", sa.Column(
        "approval_requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("installation_project_stages", "approval_requested_by")
    op.drop_column("installation_project_stages", "approval_requested_at")
