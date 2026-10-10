"""Hakkediş: sent_to_migros_by_name kolonu ekle, ready_for_invoice → invoice_stage

Revision ID: 20260628_02
Revises: 20260628_01
Create Date: 2026-06-28
"""

from alembic import op
import sqlalchemy as sa

revision = "20260628_02"
down_revision = "20260628_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {
        column["name"]
        for column in inspector.get_columns("store_progress_payments")
    }
    if "sent_to_migros_by_name" not in columns:
        op.add_column(
            "store_progress_payments",
            sa.Column("sent_to_migros_by_name", sa.String(255), nullable=True),
        )

    # ready_for_invoice → invoice_stage
    op.execute("""
        UPDATE store_progress_payments
        SET approval_status = 'invoice_stage'
        WHERE approval_status = 'ready_for_invoice'
    """)
    op.execute("""
        UPDATE store_approval_requests
        SET status = 'invoice_stage'
        WHERE status = 'ready_for_invoice'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE store_progress_payments
        SET approval_status = 'ready_for_invoice'
        WHERE approval_status = 'invoice_stage'
    """)
    op.execute("""
        UPDATE store_approval_requests
        SET status = 'ready_for_invoice'
        WHERE status = 'invoice_stage'
    """)
    op.drop_column("store_progress_payments", "sent_to_migros_by_name")
