"""İş emri ↔ kurulum projesi isteğe bağlı köprüsü: bağlanma zamanı, bağlayan ve bağlandığı aşama.

İş emri projeye açılırken ya da sonradan bağlanabilir; arıza/bakım gibi tipini korur. Analiz için
bağın ne zaman, kim tarafından ve proje hangi aşamadayken kurulduğu saklanır. Bugüne kadar projenin
içinden açılmış iş emrinde bağ, iş emrinin açılış bilgisiyle doldurulur.

Revision ID: 20261126_01
Revises: 20261125_01
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision = "20261126_01"
down_revision = "20261125_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("work_orders", sa.Column("project_linked_at", sa.DateTime(), nullable=True))
    op.add_column("work_orders", sa.Column("project_linked_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("work_orders", sa.Column(
        "project_link_stage_id", UUID(as_uuid=True), sa.ForeignKey("installation_project_stages.id"), nullable=True))
    op.execute(
        """
        UPDATE work_orders
        SET project_linked_at = created_at, project_linked_by = created_by
        WHERE installation_project_id IS NOT NULL AND project_linked_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("work_orders", "project_link_stage_id")
    op.drop_column("work_orders", "project_linked_by")
    op.drop_column("work_orders", "project_linked_at")
