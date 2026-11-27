"""Sık sorgular için eksik indeksler.

- retail_movements.work_order_id: "bu iş emrinin stoğu düşüldü mü" (her bağlama / devir / tamamlamada),
  bağlanabilir iş emri listesi ve bağlı iş emri maliyeti bu sütunla aranır.
- installation_project_stages.responsible_user_id: "Proje Görevlerim" (saha kullanıcısının adımları).
- installation_project_checklist_items.template_item_id: şablon kaydında açık adımların eşitlenmesi.

Revision ID: 20261127_01
Revises: 20261126_04
Create Date: 2026-11-27
"""

from alembic import op


revision = "20261127_01"
down_revision = "20261126_04"
branch_labels = None
depends_on = None

INDEXES = [
    ("ix_retail_movements_work_order_id", "retail_movements", "work_order_id"),
    ("ix_installation_project_stages_responsible_user_id", "installation_project_stages", "responsible_user_id"),
    ("ix_installation_project_checklist_items_template_item_id", "installation_project_checklist_items", "template_item_id"),
]


def upgrade() -> None:
    for name, table, column in INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})")


def downgrade() -> None:
    for name, _table, _column in INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
