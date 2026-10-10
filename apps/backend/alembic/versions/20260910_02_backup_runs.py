"""Add backup_runs table (local backup system audit/reminder log).

Revision ID: 20260910_02
Revises: 20260910_01
Create Date: 2026-09-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260910_02"
down_revision = "20260910_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backup_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=True),
        sa.Column("manager_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("manager_name", sa.String(length=255), nullable=False),
        sa.Column("backup_target_id", sa.String(length=64), nullable=False),
        sa.Column("backup_target_label", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("database_backed_up", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("r2_objects_new", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("r2_objects_changed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("r2_objects_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bytes_written", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.String(length=2000), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_backup_runs_tenant_id", "backup_runs", ["tenant_id"])
    op.create_index("ix_backup_runs_manager_user_id", "backup_runs", ["manager_user_id"])
    op.create_index("ix_backup_runs_backup_target_id", "backup_runs", ["backup_target_id"])
    op.create_index("ix_backup_runs_status", "backup_runs", ["status"])
    op.create_index("ix_backup_runs_started_at", "backup_runs", ["started_at"])
    # Yönetici panelinin "son başarılı yedek" hatırlatma sorgusu: tenant +
    # status + started_at DESC — en sık koşan sorgu bu.
    op.create_index("ix_backup_runs_tenant_status_started", "backup_runs", ["tenant_id", "status", "started_at"])


def downgrade() -> None:
    op.drop_table("backup_runs")
