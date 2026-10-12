"""Material catalog: brand, spec (tip) and current unit price.

Revision ID: 20261012_01
Revises: 20261011_01
"""

from alembic import op
import sqlalchemy as sa


revision = "20261012_01"
down_revision = "20261011_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("retail_materials", sa.Column("brand", sa.String(200), nullable=True))
    op.add_column("retail_materials", sa.Column("spec", sa.String(255), nullable=True))
    op.add_column("retail_materials", sa.Column("unit_price", sa.Numeric(14, 4), nullable=True))
    op.create_check_constraint("ck_retail_material_price_nonnegative", "retail_materials", "unit_price IS NULL OR unit_price >= 0")


def downgrade() -> None:
    op.drop_constraint("ck_retail_material_price_nonnegative", "retail_materials", type_="check")
    op.drop_column("retail_materials", "unit_price")
    op.drop_column("retail_materials", "spec")
    op.drop_column("retail_materials", "brand")
