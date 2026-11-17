"""Proje türü, projeye çoklu kişi atama, Üretim aşaması + üretim no, maliyet kalemleri, taşeron kartları.

Var olan projelerde 4 ve sonrası aşamalar bir kaydırılır ve 4. sıraya "Üretim" aşaması
eklenir (Müşteri onayı ile Malzeme hazırlığı arasına). Malzeme hazırlığına çoktan
geçmiş projelerde Üretim aşaması tamamlanmış sayılır; akışları bozulmaz.

Revision ID: 20261114_01
Revises: 20261112_01
Create Date: 2026-11-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261114_01"
down_revision = "20261112_01"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("installation_projects", sa.Column("project_type", sa.String(16), nullable=False, server_default="sogutma"))
    op.create_index("ix_installation_projects_project_type", "installation_projects", ["project_type"])
    op.create_check_constraint("ck_installation_project_type", "installation_projects",
                               "project_type IN ('market', 'soguk_oda', 'sogutma')")

    op.create_table(
        "installation_project_members",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("installation_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("added_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("added_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("project_id", "user_id", name="uq_installation_project_member"),
    )
    op.create_table(
        "installation_project_production_numbers",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("installation_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("number", sa.String(80), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("project_id", "number", name="uq_installation_production_number"),
    )
    op.create_table(
        "installation_project_costs",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("project_id", UUID, sa.ForeignKey("installation_projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("project_id", "kind", "category", name="uq_installation_project_cost"),
        sa.CheckConstraint("kind IN ('target', 'actual')", name="ck_installation_cost_kind"),
        sa.CheckConstraint("category IN ('montaj_iscilik', 'nakliye', 'urun', 'ek')", name="ck_installation_cost_category"),
        sa.CheckConstraint("amount >= 0", name="ck_installation_cost_amount"),
    )
    op.create_table(
        "subcontractors",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("tax_office", sa.String(120), nullable=True),
        sa.Column("tax_number", sa.String(32), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("city", sa.String(80), nullable=True),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("iban", sa.String(40), nullable=True),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("contact_title", sa.String(120), nullable=True),
        sa.Column("contact_phone", sa.String(40), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("competency", sa.String(16), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("competency IS NULL OR competency IN ('yesil', 'sari', 'kirmizi')", name="ck_subcontractor_competency"),
    )

    # Var olan projeler: 4 ve sonrası aşamaları bir kaydır, araya "Üretim" ekle.
    # (project_id, stage_order) tekil olduğu için kaydırma iki adımda yapılır.
    op.execute("UPDATE installation_project_stages SET stage_order = stage_order + 100 WHERE stage_order >= 4")
    op.execute("UPDATE installation_project_stages SET stage_order = stage_order - 99 WHERE stage_order >= 104")
    op.execute("""
        INSERT INTO installation_project_stages
            (id, project_id, stage_order, code, name, status, responsible_user_id, started_at, completed_at)
        SELECT gen_random_uuid(), p.id, 4, 'uretim', 'Üretim',
               CASE WHEN m.status = 'planned' THEN 'planned' ELSE 'completed' END,
               p.manager_user_id,
               CASE WHEN m.status <> 'planned' THEN COALESCE(m.started_at, now()) END,
               CASE WHEN m.status <> 'planned' THEN COALESCE(m.started_at, now()) END
        FROM installation_projects p
        JOIN installation_project_stages m ON m.project_id = p.id AND m.code = 'malzeme'
        WHERE NOT EXISTS (SELECT 1 FROM installation_project_stages u WHERE u.project_id = p.id AND u.code = 'uretim')
    """)


def downgrade() -> None:
    op.execute("DELETE FROM installation_project_stages WHERE code = 'uretim'")
    op.execute("UPDATE installation_project_stages SET stage_order = stage_order + 100 WHERE stage_order >= 5")
    op.execute("UPDATE installation_project_stages SET stage_order = stage_order - 101 WHERE stage_order >= 105")
    op.drop_table("subcontractors")
    op.drop_table("installation_project_costs")
    op.drop_table("installation_project_production_numbers")
    op.drop_table("installation_project_members")
    op.drop_constraint("ck_installation_project_type", "installation_projects", type_="check")
    op.drop_index("ix_installation_projects_project_type", table_name="installation_projects")
    op.drop_column("installation_projects", "project_type")
