"""Maliyette "Ek maliyetler" başlığı altında birden fazla kalem girilebilsin.

(proje, tür, kalem) tekilliği yalnızca sabit kalemler için kalır; 'ek' kaleminde
aynı projede istenen sayıda satır olabilir. Satırların sırası sort_order ile tutulur.

Revision ID: 20261115_01
Revises: 20261114_01
Create Date: 2026-11-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20261115_01"
down_revision = "20261114_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("installation_project_costs",
                  sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.drop_constraint("uq_installation_project_cost", "installation_project_costs", type_="unique")
    op.create_index("uq_installation_project_cost_fixed", "installation_project_costs",
                    ["project_id", "kind", "category"], unique=True,
                    postgresql_where=sa.text("category <> 'ek'"))


def downgrade() -> None:
    op.drop_index("uq_installation_project_cost_fixed", table_name="installation_project_costs")
    # Tek satıra dönüş: aynı (proje, tür) için birden fazla ek maliyet varsa tutarlar toplanır.
    op.execute("""
        WITH merged AS (
            SELECT project_id, kind, MIN(id::text)::uuid AS keep_id, SUM(amount) AS total,
                   LEFT(STRING_AGG(description, '; ' ORDER BY sort_order), 500) AS description
            FROM installation_project_costs WHERE category = 'ek' GROUP BY project_id, kind
        )
        UPDATE installation_project_costs c SET amount = m.total, description = m.description
        FROM merged m WHERE c.id = m.keep_id
    """)
    op.execute("""
        DELETE FROM installation_project_costs c WHERE c.category = 'ek' AND c.id NOT IN (
            SELECT MIN(id::text)::uuid FROM installation_project_costs WHERE category = 'ek' GROUP BY project_id, kind)
    """)
    op.create_unique_constraint("uq_installation_project_cost", "installation_project_costs",
                                ["project_id", "kind", "category"])
    op.drop_column("installation_project_costs", "sort_order")
