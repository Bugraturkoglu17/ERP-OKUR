"""Taşeron iş yükü ve puanlama.

1) work_orders.subcontractor_id ve installation_project_stages.subcontractor_id: işi yapan taşeron (isteğe bağlı).
   Taşeron kartındaki iş yükü (açık iş emri, devam eden proje, en yakın termin) bu bağlantılardan hesaplanır.
2) subcontractor_ratings: iş emri ya da proje adımı tamamlanınca yöneticinin verdiği 1–5 puan (iş başına tek puan).
   Kartta ortalama puan gösterilir; puanı olan taşeronun rengi ortalamadan hesaplanır.

Revision ID: 20261126_04
Revises: 20261126_03
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision = "20261126_04"
down_revision = "20261126_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("work_orders", "installation_project_stages"):
        op.add_column(table, sa.Column(
            "subcontractor_id", UUID(as_uuid=True), sa.ForeignKey("subcontractors.id", ondelete="SET NULL"), nullable=True))
        op.create_index(f"ix_{table}_subcontractor_id", table, ["subcontractor_id"])
    op.create_table(
        "subcontractor_ratings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("subcontractor_id", UUID(as_uuid=True), sa.ForeignKey("subcontractors.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("work_order_id", UUID(as_uuid=True), sa.ForeignKey("work_orders.id", ondelete="CASCADE"),
                  nullable=True, unique=True),
        sa.Column("stage_id", UUID(as_uuid=True), sa.ForeignKey("installation_project_stages.id", ondelete="CASCADE"),
                  nullable=True, unique=True),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("score BETWEEN 1 AND 5", name="ck_subcontractor_rating_score"),
        sa.CheckConstraint("(work_order_id IS NULL) <> (stage_id IS NULL)", name="ck_subcontractor_rating_target"),
    )


def downgrade() -> None:
    op.drop_table("subcontractor_ratings")
    for table in ("installation_project_stages", "work_orders"):
        op.drop_index(f"ix_{table}_subcontractor_id", table_name=table)
        op.drop_column(table, "subcontractor_id")
