"""Work orders: cep depo link and materials deducted when the job is completed.

Revision ID: 20261011_01
Revises: 20261010_01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261011_01"
down_revision = "20261010_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uid = postgresql.UUID(as_uuid=True)
    op.add_column("work_orders", sa.Column("stock_depot_id", uid, sa.ForeignKey("retail_depots.id"), nullable=True))
    op.create_index("ix_work_orders_stock_depot_id", "work_orders", ["stock_depot_id"])

    # A line is "planned" until the work order is completed; completion issues it
    # (movement_id/issued_at set) and deducts the cep depo atomically.
    op.create_table(
        "work_order_materials",
        sa.Column("id", uid, primary_key=True),
        sa.Column("tenant_id", uid, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("work_order_id", uid, sa.ForeignKey("work_orders.id"), nullable=False),
        sa.Column("depot_id", uid, sa.ForeignKey("retail_depots.id"), nullable=False),
        sa.Column("material_id", uid, sa.ForeignKey("retail_materials.id"), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("movement_id", uid, sa.ForeignKey("retail_movements.id"), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("work_order_id", "material_id", name="uq_work_order_material"),
        sa.CheckConstraint("quantity > 0", name="ck_work_order_material_positive"),
    )
    for column in ("tenant_id", "work_order_id", "depot_id", "material_id"):
        op.create_index(f"ix_work_order_materials_{column}", "work_order_materials", [column])
    op.create_index("ix_retail_movements_work_order_id", "retail_movements", ["work_order_id"])


def downgrade() -> None:
    op.drop_index("ix_retail_movements_work_order_id", table_name="retail_movements")
    op.drop_table("work_order_materials")
    op.drop_index("ix_work_orders_stock_depot_id", table_name="work_orders")
    op.drop_column("work_orders", "stock_depot_id")
