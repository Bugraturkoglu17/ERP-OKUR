"""work_orders — iş emri modülleri

Revision ID: 20260627_01
Revises: 9a98d4f3ee8f
Create Date: 2026-06-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260627_01"
down_revision = "9a98d4f3ee8f"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return inspector.has_table(table_name)


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    if not inspector.has_table(table_name):
        return False
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── work_orders ───────────────────────────────────────────────────────────
    if not _table_exists(inspector, "work_orders"):
        op.create_table(
            "work_orders",
            sa.Column("id",                sa.UUID(),    nullable=False, primary_key=True),
            sa.Column("tenant_id",         sa.UUID(),    nullable=True),
            sa.Column("project_id",        sa.UUID(),    nullable=False),
            sa.Column("work_type",         sa.String(30), nullable=False),
            sa.Column("title",             sa.String(255), nullable=False),
            sa.Column("description",       sa.Text(),    nullable=True),
            sa.Column("assigned_to_name",  sa.String(255), nullable=True),
            sa.Column("assigned_to_phone", sa.String(30),  nullable=True),
            sa.Column("priority",          sa.String(20),  nullable=False, server_default="normal"),
            sa.Column("status",            sa.String(30),  nullable=False, server_default="draft"),
            sa.Column("location_url",      sa.String(1000), nullable=True),
            sa.Column("due_date",          sa.DateTime(), nullable=True),
            sa.Column("created_by",        sa.UUID(),    nullable=True),
            sa.Column("created_by_name",   sa.String(255), nullable=True),
            sa.Column("sent_at",           sa.DateTime(), nullable=True),
            sa.Column("started_at",        sa.DateTime(), nullable=True),
            sa.Column("completed_at",      sa.DateTime(), nullable=True),
            sa.Column("completion_notes",  sa.Text(),    nullable=True),
            sa.Column("created_at",        sa.DateTime(), nullable=False),
            sa.Column("updated_at",        sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"],   ["tenants.id"],  ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["project_id"],  ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by"],  ["users.id"],    ondelete="SET NULL"),
        )
        op.create_index("ix_work_orders_tenant_id",   "work_orders", ["tenant_id"])
        op.create_index("ix_work_orders_project_id",  "work_orders", ["project_id"])
        op.create_index("ix_work_orders_status",      "work_orders", ["status"])
        op.create_index("ix_work_orders_work_type",   "work_orders", ["work_type"])
        op.create_index("ix_work_orders_priority",    "work_orders", ["priority"])

    # ── work_order_public_links ───────────────────────────────────────────────
    if not _table_exists(inspector, "work_order_public_links"):
        op.create_table(
            "work_order_public_links",
            sa.Column("id",            sa.UUID(),     nullable=False, primary_key=True),
            sa.Column("work_order_id", sa.UUID(),     nullable=False),
            sa.Column("token",         sa.String(128), nullable=False),
            sa.Column("expires_at",    sa.DateTime(), nullable=True),
            sa.Column("is_active",     sa.Boolean(),  nullable=False, server_default="true"),
            sa.Column("used_at",       sa.DateTime(), nullable=True),
            sa.Column("created_at",    sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_work_order_public_links_work_order_id", "work_order_public_links", ["work_order_id"])
        op.create_unique_constraint("uq_work_order_public_links_token", "work_order_public_links", ["token"])

    # ── work_order_photos ─────────────────────────────────────────────────────
    if not _table_exists(inspector, "work_order_photos"):
        op.create_table(
            "work_order_photos",
            sa.Column("id",               sa.UUID(),    nullable=False, primary_key=True),
            sa.Column("work_order_id",    sa.UUID(),    nullable=False),
            sa.Column("file_key",         sa.String(512), nullable=False),
            sa.Column("file_url",         sa.String(1000), nullable=True),
            sa.Column("file_name",        sa.String(255), nullable=True),
            sa.Column("file_size_bytes",  sa.Integer(), nullable=True),
            sa.Column("mime_type",        sa.String(128), nullable=True),
            sa.Column("photo_type",       sa.String(30), nullable=False, server_default="completion"),
            sa.Column("uploaded_by_name", sa.String(255), nullable=True),
            sa.Column("uploaded_at",      sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_work_order_photos_work_order_id", "work_order_photos", ["work_order_id"])

    # ── work_order_service_forms ──────────────────────────────────────────────
    if not _table_exists(inspector, "work_order_service_forms"):
        op.create_table(
            "work_order_service_forms",
            sa.Column("id",               sa.UUID(),    nullable=False, primary_key=True),
            sa.Column("work_order_id",    sa.UUID(),    nullable=False),
            sa.Column("project_id",       sa.UUID(),    nullable=False),
            sa.Column("year",             sa.Integer(), nullable=False),
            sa.Column("month",            sa.Integer(), nullable=False),
            sa.Column("file_key",         sa.String(512), nullable=False),
            sa.Column("file_url",         sa.String(1000), nullable=True),
            sa.Column("file_name",        sa.String(255), nullable=True),
            sa.Column("file_size_bytes",  sa.Integer(), nullable=True),
            sa.Column("uploaded_by_name", sa.String(255), nullable=True),
            sa.Column("uploaded_at",      sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["project_id"],    ["projects.id"],    ondelete="CASCADE"),
        )
        op.create_index("ix_work_order_service_forms_work_order_id", "work_order_service_forms", ["work_order_id"])
        op.create_index("ix_work_order_service_forms_project_id",    "work_order_service_forms", ["project_id"])

    # ── work_order_whatsapp_messages ──────────────────────────────────────────
    if not _table_exists(inspector, "work_order_whatsapp_messages"):
        op.create_table(
            "work_order_whatsapp_messages",
            sa.Column("id",                  sa.UUID(),    nullable=False, primary_key=True),
            sa.Column("work_order_id",       sa.UUID(),    nullable=False),
            sa.Column("to_phone",            sa.String(30), nullable=False),
            sa.Column("whatsapp_message_id", sa.String(255), nullable=True),
            sa.Column("status",              sa.String(30), nullable=False, server_default="queued"),
            sa.Column("error_message",       sa.String(1000), nullable=True),
            sa.Column("sent_at",             sa.DateTime(), nullable=True),
            sa.Column("updated_at",          sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_work_order_whatsapp_messages_work_order_id",       "work_order_whatsapp_messages", ["work_order_id"])
        op.create_index("ix_work_order_whatsapp_messages_whatsapp_message_id", "work_order_whatsapp_messages", ["whatsapp_message_id"])

    # ── work_order_activities ─────────────────────────────────────────────────
    if not _table_exists(inspector, "work_order_activities"):
        op.create_table(
            "work_order_activities",
            sa.Column("id",             sa.UUID(),    nullable=False, primary_key=True),
            sa.Column("work_order_id",  sa.UUID(),    nullable=False),
            sa.Column("project_id",     sa.UUID(),    nullable=False),
            sa.Column("activity_type",  sa.String(50), nullable=False),
            sa.Column("title",          sa.String(500), nullable=False),
            sa.Column("description",    sa.Text(),    nullable=True),
            sa.Column("created_at",     sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["project_id"],    ["projects.id"],    ondelete="CASCADE"),
        )
        op.create_index("ix_work_order_activities_work_order_id", "work_order_activities", ["work_order_id"])
        op.create_index("ix_work_order_activities_project_id",    "work_order_activities", ["project_id"])
        op.create_index("ix_work_order_activities_created_at",    "work_order_activities", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    for tbl in [
        "work_order_activities",
        "work_order_whatsapp_messages",
        "work_order_service_forms",
        "work_order_photos",
        "work_order_public_links",
        "work_orders",
    ]:
        if _table_exists(inspector, tbl):
            op.drop_table(tbl)
