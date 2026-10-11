"""Isolated OKUR main/vehicle depot stock and immutable movement history.

Revision ID: 20261010_01
Revises: 20261003_01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261010_01"
down_revision = "20261003_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uid = postgresql.UUID(as_uuid=True)
    amount = sa.Numeric(14, 3)
    op.create_table(
        "retail_depots",
        sa.Column("id", uid, primary_key=True),
        sa.Column("tenant_id", uid, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("plate", sa.String(20), nullable=True),
        sa.Column("assigned_user_id", uid, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("tenant_id", "plate", name="uq_retail_depot_tenant_plate"),
        sa.CheckConstraint("kind IN ('main', 'vehicle')", name="ck_retail_depot_kind"),
        sa.CheckConstraint("(kind = 'main' AND plate IS NULL) OR (kind = 'vehicle' AND plate IS NOT NULL)", name="ck_retail_depot_plate"),
    )
    op.create_index("ix_retail_depots_tenant_id", "retail_depots", ["tenant_id"])
    op.create_index("ix_retail_depots_kind", "retail_depots", ["kind"])
    op.create_index("ix_retail_depots_assigned_user_id", "retail_depots", ["assigned_user_id"])
    op.create_index("uq_retail_depots_main_per_tenant", "retail_depots", ["tenant_id"], unique=True, postgresql_where=sa.text("kind = 'main'"))

    op.create_table(
        "retail_materials",
        sa.Column("id", uid, primary_key=True),
        sa.Column("tenant_id", uid, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("sku", sa.String(80), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("unit", sa.String(20), nullable=False, server_default="adet"),
        sa.Column("min_stock", amount, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("tenant_id", "sku", name="uq_retail_material_tenant_sku"),
        sa.CheckConstraint("min_stock >= 0", name="ck_retail_material_min_nonnegative"),
    )
    op.create_index("ix_retail_materials_tenant_id", "retail_materials", ["tenant_id"])
    op.create_index("ix_retail_materials_name", "retail_materials", ["name"])

    op.create_table(
        "retail_balances",
        sa.Column("depot_id", uid, sa.ForeignKey("retail_depots.id"), primary_key=True),
        sa.Column("material_id", uid, sa.ForeignKey("retail_materials.id"), primary_key=True),
        sa.Column("quantity", amount, nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("quantity >= 0", name="ck_retail_balance_nonnegative"),
    )

    op.create_table(
        "retail_movements",
        sa.Column("id", uid, primary_key=True),
        sa.Column("tenant_id", uid, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("material_id", uid, sa.ForeignKey("retail_materials.id"), nullable=False),
        sa.Column("source_depot_id", uid, sa.ForeignKey("retail_depots.id"), nullable=True),
        sa.Column("target_depot_id", uid, sa.ForeignKey("retail_depots.id"), nullable=True),
        sa.Column("branch_id", uid, sa.ForeignKey("branches.id"), nullable=True),
        sa.Column("work_order_id", uid, sa.ForeignKey("work_orders.id"), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("quantity", amount, nullable=False),
        sa.Column("reference_no", sa.String(80), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("performed_by", uid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("performed_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("quantity > 0", name="ck_retail_movement_positive"),
        sa.CheckConstraint("kind IN ('opening', 'load', 'use', 'return', 'count')", name="ck_retail_movement_kind"),
    )
    for column in ("tenant_id", "material_id", "source_depot_id", "target_depot_id", "branch_id", "kind", "performed_at"):
        op.create_index(f"ix_retail_movements_{column}", "retail_movements", [column])


def downgrade() -> None:
    op.drop_table("retail_movements")
    op.drop_table("retail_balances")
    op.drop_table("retail_materials")
    op.drop_table("retail_depots")
