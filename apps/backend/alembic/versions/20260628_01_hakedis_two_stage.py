"""Hakkediş iki aşamalı onay: yeni kolonlar ve status migration

Revision ID: 20260628_01
Revises: 20260627_02
Create Date: 2026-06-28
"""

from alembic import op
import sqlalchemy as sa

revision = "20260628_01"
down_revision = "20260627_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {
        column["name"]
        for column in inspector.get_columns("store_progress_payments")
    }

    # Yeni zaman damgası kolonları
    additions = (
        sa.Column("internal_approved_by_name", sa.String(255), nullable=True),
        sa.Column("internal_approved_at", sa.DateTime(), nullable=True),
        sa.Column("sent_to_migros_at", sa.DateTime(), nullable=True),
        sa.Column("migros_approved_by_name", sa.String(255), nullable=True),
        sa.Column("migros_approved_at", sa.DateTime(), nullable=True),
        sa.Column("invoiced_at", sa.DateTime(), nullable=True),
    )
    for column in additions:
        if column.name not in columns:
            op.add_column("store_progress_payments", column)

    # store_progress_payments.approval_status migration
    op.execute("""
        UPDATE store_progress_payments
        SET approval_status = CASE approval_status
            WHEN 'pending'    THEN 'internal_pending'
            WHEN 'onaylandi'  THEN 'internal_approved'
            WHEN 'reddedildi' THEN 'rejected'
            WHEN 'revizyon'   THEN 'revision_requested'
            ELSE approval_status
        END
    """)

    # store_approval_requests.status migration
    op.execute("""
        UPDATE store_approval_requests
        SET status = CASE status
            WHEN 'bekliyor'   THEN 'internal_pending'
            WHEN 'onaylandi'  THEN 'internal_approved'
            WHEN 'reddedildi' THEN 'rejected'
            WHEN 'revizyon'   THEN 'revision_requested'
            ELSE status
        END
    """)


def downgrade() -> None:
    # Status değerlerini geri al
    op.execute("""
        UPDATE store_progress_payments
        SET approval_status = CASE approval_status
            WHEN 'internal_pending'    THEN 'pending'
            WHEN 'internal_approved'   THEN 'onaylandi'
            WHEN 'rejected'            THEN 'reddedildi'
            WHEN 'revision_requested'  THEN 'revizyon'
            ELSE approval_status
        END
    """)

    op.execute("""
        UPDATE store_approval_requests
        SET status = CASE status
            WHEN 'internal_pending'    THEN 'bekliyor'
            WHEN 'internal_approved'   THEN 'onaylandi'
            WHEN 'rejected'            THEN 'reddedildi'
            WHEN 'revision_requested'  THEN 'revizyon'
            ELSE status
        END
    """)

    op.drop_column("store_progress_payments", "invoiced_at")
    op.drop_column("store_progress_payments", "migros_approved_at")
    op.drop_column("store_progress_payments", "migros_approved_by_name")
    op.drop_column("store_progress_payments", "sent_to_migros_at")
    op.drop_column("store_progress_payments", "internal_approved_at")
    op.drop_column("store_progress_payments", "internal_approved_by_name")
