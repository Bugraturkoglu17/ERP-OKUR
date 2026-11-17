"""Kapanış aşaması faturalandırma bilgileri: proje satış fiyatı, fatura no, fatura tarihi.

Adres ve iletişim bilgileri mağaza kartından okunur; projede saklanmaz.

Revision ID: 20261116_01
Revises: 20261115_01
Create Date: 2026-11-16
"""

from alembic import op
import sqlalchemy as sa


revision = "20261116_01"
down_revision = "20261115_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("installation_projects", sa.Column("sale_price", sa.Numeric(14, 2), nullable=True))
    op.add_column("installation_projects", sa.Column("invoice_no", sa.String(40), nullable=True))
    op.add_column("installation_projects", sa.Column("invoice_date", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("installation_projects", "invoice_date")
    op.drop_column("installation_projects", "invoice_no")
    op.drop_column("installation_projects", "sale_price")
