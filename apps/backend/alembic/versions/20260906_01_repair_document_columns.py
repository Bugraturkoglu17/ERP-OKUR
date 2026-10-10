"""Repair document columns missing from a previously stamped database.

Revision ID: 20260906_01
Revises: 20260808_02
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa


revision = "20260906_01"
down_revision = "20260808_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"]: column for column in inspector.get_columns("documents")}

    if "process_id" not in columns:
        op.add_column("documents", sa.Column("process_id", sa.UUID(), nullable=True))
    if "vi_meta" not in columns:
        op.add_column("documents", sa.Column("vi_meta", sa.Text(), nullable=True))
    if "is_archive" not in columns:
        op.add_column(
            "documents",
            sa.Column("is_archive", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if "archive_status" not in columns:
        op.add_column(
            "documents",
            sa.Column("archive_status", sa.String(length=20), nullable=False, server_default="archive"),
        )
    if "transferred_project_id" not in columns:
        op.add_column("documents", sa.Column("transferred_project_id", sa.UUID(), nullable=True))
    if "transferred_category" not in columns:
        op.add_column("documents", sa.Column("transferred_category", sa.String(length=50), nullable=True))
    if "transferred_at" not in columns:
        op.add_column("documents", sa.Column("transferred_at", sa.DateTime(), nullable=True))

    project_column = columns.get("project_id")
    if project_column and not project_column["nullable"]:
        op.alter_column("documents", "project_id", existing_type=sa.UUID(), nullable=True)

    index_names = {index["name"] for index in inspector.get_indexes("documents")}
    if "ix_documents_process_id" not in index_names:
        op.create_index("ix_documents_process_id", "documents", ["process_id"])
    if "ix_documents_is_archive" not in index_names:
        op.create_index("ix_documents_is_archive", "documents", ["is_archive"])
    if "ix_documents_archive_status" not in index_names:
        op.create_index("ix_documents_archive_status", "documents", ["archive_status"])

    foreign_key_names = {key["name"] for key in inspector.get_foreign_keys("documents")}
    if inspector.has_table("store_processes") and "fk_documents_process_id" not in foreign_key_names:
        op.create_foreign_key(
            "fk_documents_process_id",
            "documents",
            "store_processes",
            ["process_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    op.drop_constraint("fk_documents_process_id", "documents", type_="foreignkey")
    op.drop_index("ix_documents_archive_status", table_name="documents")
    op.drop_index("ix_documents_is_archive", table_name="documents")
    op.drop_index("ix_documents_process_id", table_name="documents")
    op.drop_column("documents", "transferred_at")
    op.drop_column("documents", "transferred_category")
    op.drop_column("documents", "transferred_project_id")
    op.drop_column("documents", "archive_status")
    op.drop_column("documents", "is_archive")
    op.drop_column("documents", "vi_meta")
    op.drop_column("documents", "process_id")

