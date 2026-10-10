"""documents: genel arşiv alanları eklendi

documents.project_id nullable yapıldı; is_archive, archive_status,
transferred_project_id, transferred_category, transferred_at eklendi.

Revision ID: 20260808_01
Revises: 20260714_02
Create Date: 2026-08-08
"""

from alembic import op
import sqlalchemy as sa

revision = "20260808_01"
down_revision = "20260714_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # project_id'yi nullable yap
    op.alter_column(
        "documents", "project_id",
        existing_type=sa.UUID(),
        nullable=True,
    )

    # Arşiv alanları
    op.add_column(
        "documents",
        sa.Column("is_archive", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "documents",
        sa.Column("archive_status", sa.String(length=20), nullable=False, server_default="archive"),
    )
    op.add_column(
        "documents",
        sa.Column("transferred_project_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("transferred_category", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("transferred_at", sa.DateTime(), nullable=True),
    )

    op.create_index("ix_documents_is_archive", "documents", ["is_archive"])
    op.create_index("ix_documents_archive_status", "documents", ["archive_status"])


def downgrade() -> None:
    op.drop_index("ix_documents_archive_status", "documents")
    op.drop_index("ix_documents_is_archive", "documents")
    op.drop_column("documents", "transferred_at")
    op.drop_column("documents", "transferred_category")
    op.drop_column("documents", "transferred_project_id")
    op.drop_column("documents", "archive_status")
    op.drop_column("documents", "is_archive")
    op.alter_column(
        "documents", "project_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
