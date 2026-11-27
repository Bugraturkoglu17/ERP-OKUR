"""İş emri listesi sunucu tarafı sayfalama indeksleri.

Listeler artık sekmeye / süzgece göre 50'şer kayıt çeker ve sayılar tek özet sorgusundan gelir;
bu sorgular firma + durum, firma + atanan + durum, termin ve güncellenme tarihiyle süzülür / sıralanır.

Revision ID: 20261127_03
Revises: 20261127_02
Create Date: 2026-11-27
"""

from alembic import op


revision = "20261127_03"
down_revision = "20261127_02"
branch_labels = None
depends_on = None

INDEXES = [
    ("ix_work_orders_tenant_status_created", "work_orders (tenant_id, status, created_at DESC)"),
    ("ix_work_orders_tenant_assignee_status", "work_orders (tenant_id, assigned_to_user_id, status)"),
    ("ix_work_orders_due_date", "work_orders (due_date)"),
    ("ix_work_orders_updated_at", "work_orders (updated_at DESC)"),
]


def upgrade() -> None:
    for name, target in INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {target}")


def downgrade() -> None:
    for name, _target in INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
