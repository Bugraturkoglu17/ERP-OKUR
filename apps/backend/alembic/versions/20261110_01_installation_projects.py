"""Kurulum projeleri ("Proje" iş tipi): proje, aşama, kontrol listesi, belge, malzeme listesi.

Depo türlerine 'project' (proje/şantiye deposu) eklenir; iş emrine bağlı proje alanı eklenir.
Var olan kayıtlara dokunmaz, yalnızca ekleme yapar.

Revision ID: 20261110_01
Revises: 20261012_01
Create Date: 2026-11-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261110_01"
down_revision = "20261012_01"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.drop_constraint("ck_retail_depot_kind", "retail_depots", type_="check")
    op.drop_constraint("ck_retail_depot_plate", "retail_depots", type_="check")
    op.create_check_constraint("ck_retail_depot_kind", "retail_depots", "kind IN ('main', 'vehicle', 'project')")
    op.create_check_constraint(
        "ck_retail_depot_plate", "retail_depots",
        "(kind IN ('main', 'project') AND plate IS NULL) OR (kind = 'vehicle' AND plate IS NOT NULL)",
    )

    op.create_table(
        "installation_projects",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("store_id", UUID, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("depot_id", UUID, sa.ForeignKey("retail_depots.id"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("manager_user_id", UUID, sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("start_date", sa.DateTime(), nullable=True),
        sa.Column("target_date", sa.DateTime(), nullable=True),
        sa.Column("budget", sa.Numeric(14, 2), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active", index=True),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("status IN ('active', 'completed', 'cancelled')", name="ck_installation_project_status"),
    )
    op.create_table(
        "installation_project_stages",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("installation_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("stage_order", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="planned"),
        sa.Column("responsible_user_id", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("planned_end", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("overdue_notified_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("project_id", "stage_order", name="uq_installation_stage_order"),
        sa.CheckConstraint("status IN ('planned', 'in_progress', 'completed')", name="ck_installation_stage_status"),
    )
    op.create_table(
        "installation_project_checklist_items",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("stage_id", UUID, sa.ForeignKey("installation_project_stages.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("done_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("done_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "installation_project_documents",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("installation_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("stage_id", UUID, sa.ForeignKey("installation_project_stages.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("doc_type", sa.String(32), nullable=False, index=True),
        sa.Column("file_key", sa.String(500), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(120), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uploaded_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("uploaded_by_name", sa.String(255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "installation_project_materials",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("installation_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("material_id", UUID, sa.ForeignKey("retail_materials.id"), nullable=False, index=True),
        sa.Column("planned_quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.UniqueConstraint("project_id", "material_id", name="uq_installation_project_material"),
        sa.CheckConstraint("planned_quantity > 0", name="ck_installation_material_positive"),
    )
    op.add_column("work_orders", sa.Column("installation_project_id", UUID, sa.ForeignKey("installation_projects.id"), nullable=True))
    op.create_index("ix_work_orders_installation_project_id", "work_orders", ["installation_project_id"])


def downgrade() -> None:
    op.drop_index("ix_work_orders_installation_project_id", table_name="work_orders")
    op.drop_column("work_orders", "installation_project_id")
    op.drop_table("installation_project_materials")
    op.drop_table("installation_project_documents")
    op.drop_table("installation_project_checklist_items")
    op.drop_table("installation_project_stages")
    op.drop_table("installation_projects")
    op.execute("DELETE FROM retail_depots WHERE kind = 'project'")
    op.drop_constraint("ck_retail_depot_plate", "retail_depots", type_="check")
    op.drop_constraint("ck_retail_depot_kind", "retail_depots", type_="check")
    op.create_check_constraint("ck_retail_depot_kind", "retail_depots", "kind IN ('main', 'vehicle')")
    op.create_check_constraint(
        "ck_retail_depot_plate", "retail_depots",
        "(kind = 'main' AND plate IS NULL) OR (kind = 'vehicle' AND plate IS NOT NULL)",
    )
