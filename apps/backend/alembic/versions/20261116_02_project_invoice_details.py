"""Fatura bilgilerine KDV, fatura tutarı, vade ve fatura tarafı (unvan, vergi dairesi/no, adres) eklenir.

Revision ID: 20261116_02
Revises: 20261116_01
Create Date: 2026-11-16
"""

from alembic import op
import sqlalchemy as sa


revision = "20261116_02"
down_revision = "20261116_01"
branch_labels = None
depends_on = None

TABLE = "installation_projects"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("sale_price_includes_vat", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column(TABLE, sa.Column("vat_rate", sa.Numeric(5, 2), nullable=True))
    op.add_column(TABLE, sa.Column("invoice_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column(TABLE, sa.Column("invoice_due_date", sa.DateTime(), nullable=True))
    op.add_column(TABLE, sa.Column("invoice_title", sa.String(200), nullable=True))
    op.add_column(TABLE, sa.Column("invoice_tax_office", sa.String(100), nullable=True))
    op.add_column(TABLE, sa.Column("invoice_tax_no", sa.String(30), nullable=True))
    op.add_column(TABLE, sa.Column("invoice_address", sa.String(500), nullable=True))


def downgrade() -> None:
    for column in ("invoice_address", "invoice_tax_no", "invoice_tax_office", "invoice_title",
                   "invoice_due_date", "invoice_amount", "vat_rate", "sale_price_includes_vat"):
        op.drop_column(TABLE, column)
