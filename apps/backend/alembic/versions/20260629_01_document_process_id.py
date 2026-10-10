"""Document: process_id alanı eklendi (tadilat süreci bağlantısı)

Revision ID: 20260629_01
Revises: 20260628_03
Create Date: 2026-06-29
"""

from alembic import op
import sqlalchemy as sa

revision = "20260629_01"
down_revision = "20260628_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("process_id", sa.UUID(), nullable=True),
    )
    op.create_index(
        "ix_documents_process_id",
        "documents",
        ["process_id"],
    )
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
    op.drop_index("ix_documents_process_id", "documents")
    op.drop_column("documents", "process_id")
