"""WorkOrderPhoto: is_added_to_inventory + vi_doc_id alanları eklendi

Revision ID: 20260714_02
Revises: 20260714_01
Create Date: 2026-07-14
"""

from alembic import op
import sqlalchemy as sa

revision = "20260714_02"
down_revision = "20260714_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "work_order_photos",
        sa.Column("is_added_to_inventory", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index(
        "ix_work_order_photos_is_added_to_inventory",
        "work_order_photos",
        ["is_added_to_inventory"],
    )
    op.add_column(
        "work_order_photos",
        sa.Column("vi_doc_id", sa.UUID(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("work_order_photos", "vi_doc_id")
    op.drop_index("ix_work_order_photos_is_added_to_inventory", "work_order_photos")
    op.drop_column("work_order_photos", "is_added_to_inventory")
