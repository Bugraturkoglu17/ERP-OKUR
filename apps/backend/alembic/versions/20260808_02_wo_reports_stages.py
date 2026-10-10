"""work_orders: rapor, rapor fotoğraf ve aşama tabloları; assigned_to_user_id

Revision ID: 20260808_02
Revises: 20260808_01
Create Date: 2026-08-08
"""

from alembic import op
import sqlalchemy as sa

revision = "20260808_02"
down_revision = "20260808_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── work_order_reports (tablolar zaten varsa atla) ─────────────────────────
    if not conn.dialect.has_table(conn, "work_order_reports"):
        op.create_table(
            "work_order_reports",
            sa.Column("id",              sa.UUID(),      nullable=False),
            sa.Column("work_order_id",   sa.UUID(),      nullable=False),
            sa.Column("title",           sa.String(255), nullable=False),
            sa.Column("description",     sa.Text(),      nullable=True),
            sa.Column("severity",        sa.String(20),  nullable=False, server_default="normal"),
            sa.Column("created_by_name", sa.String(255), nullable=True),
            sa.Column("created_by",      sa.UUID(),      nullable=True),
            sa.Column("created_at",      sa.DateTime(),  nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by"],    ["users.id"],       ondelete="SET NULL"),
        )
        op.create_index("ix_work_order_reports_work_order_id", "work_order_reports", ["work_order_id"])

    if not conn.dialect.has_table(conn, "work_order_report_photos"):
        op.create_table(
            "work_order_report_photos",
            sa.Column("id",               sa.UUID(),      nullable=False),
            sa.Column("report_id",        sa.UUID(),      nullable=False),
            sa.Column("work_order_id",    sa.UUID(),      nullable=False),
            sa.Column("file_key",         sa.String(512), nullable=False),
            sa.Column("file_url",         sa.String(1000),nullable=True),
            sa.Column("file_name",        sa.String(255), nullable=True),
            sa.Column("file_size_bytes",  sa.Integer(),   nullable=True),
            sa.Column("mime_type",        sa.String(128), nullable=True),
            sa.Column("uploaded_by_name", sa.String(255), nullable=True),
            sa.Column("uploaded_at",      sa.DateTime(),  nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["report_id"],     ["work_order_reports.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"],        ondelete="CASCADE"),
        )
        op.create_index("ix_wo_report_photos_report_id",     "work_order_report_photos", ["report_id"])
        op.create_index("ix_wo_report_photos_work_order_id", "work_order_report_photos", ["work_order_id"])

    if not conn.dialect.has_table(conn, "work_order_stages"):
        op.create_table(
            "work_order_stages",
            sa.Column("id",               sa.UUID(),      nullable=False),
            sa.Column("work_order_id",    sa.UUID(),      nullable=False),
            sa.Column("stage_order",      sa.Integer(),   nullable=False),
            sa.Column("stage_name",       sa.String(100), nullable=False),
            sa.Column("status",           sa.String(20),  nullable=False, server_default="planned"),
            sa.Column("description",      sa.Text(),      nullable=True),
            sa.Column("updated_at",       sa.DateTime(),  nullable=True),
            sa.Column("updated_by_name",  sa.String(255), nullable=True),
            sa.Column("created_at",       sa.DateTime(),  nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_work_order_stages_work_order_id", "work_order_stages", ["work_order_id"])
        op.create_index("ix_work_order_stages_stage_order",   "work_order_stages", ["stage_order"])

    # ── work_orders: assigned_to_user_id (kolon yoksa ekle) ───────────────────
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='work_orders' AND column_name='assigned_to_user_id'"
    ))
    if result.fetchone() is None:
        op.add_column(
            "work_orders",
            sa.Column("assigned_to_user_id", sa.UUID(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("work_orders", "assigned_to_user_id")
    op.drop_table("work_order_stages")
    op.drop_table("work_order_report_photos")
    op.drop_table("work_order_reports")
