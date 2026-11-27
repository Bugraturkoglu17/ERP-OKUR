"""Projenin deposu olmaz (kullanıcı kararı, 27.11.2026).

- Projeye bağlı iş emri malzemesi atanan çalışanın cep deposundan düşer.
- Projenin "Üretim ve Montaj" malzeme listesi proje kapanınca ana depodan düşer; düşülen hareket
  `retail_movements.installation_project_id` ile projeye bağlanır (maliyet bu bağla hesaplanır).
- Yetersiz stokta yönetici "yine de kapat" diyebilir: ana depo eksiye düşebilir. Bu yüzden
  bakiye >= 0 veritabanı kuralı kaldırılır; cep depoların eksiye düşmemesi kodda (decrease) korunur.
- Mevcut proje depoları pasife alınır (bakiye/hareket yok); proje deposuna bağlı açık iş emri
  atanan çalışanın tek aktif cep deposuna taşınır.

Revision ID: 20261127_02
Revises: 20261127_01
Create Date: 2026-11-27
"""

from alembic import op


revision = "20261127_02"
down_revision = "20261127_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE retail_movements ADD COLUMN IF NOT EXISTS installation_project_id UUID "
               "REFERENCES installation_projects(id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retail_movements_installation_project_id "
               "ON retail_movements (installation_project_id)")
    op.execute("ALTER TABLE installation_projects ALTER COLUMN depot_id DROP NOT NULL")
    op.execute("ALTER TABLE retail_balances DROP CONSTRAINT IF EXISTS ck_retail_balance_nonnegative")

    # Açık iş emirleri proje deposundan çalışanın tek aktif cep deposuna (birden çok/yoksa dokunulmaz).
    op.execute("""
        WITH target AS (
            SELECT w.id AS wo_id, MIN(v.id::text)::uuid AS depot_id
            FROM work_orders w
            JOIN retail_depots p ON p.id = w.stock_depot_id AND p.kind = 'project'
            JOIN retail_depots v ON v.kind = 'vehicle' AND v.is_active AND v.assigned_user_id = w.assigned_to_user_id
            WHERE w.status NOT IN ('completed', 'approved', 'cancelled', 'failed')
            GROUP BY w.id
            HAVING COUNT(v.id) = 1
        )
        UPDATE work_order_materials m SET depot_id = t.depot_id
        FROM target t WHERE m.work_order_id = t.wo_id AND m.movement_id IS NULL
    """)
    op.execute("""
        UPDATE work_orders w SET stock_depot_id = t.depot_id
        FROM (
            SELECT w2.id AS wo_id, MIN(v.id::text)::uuid AS depot_id
            FROM work_orders w2
            JOIN retail_depots p ON p.id = w2.stock_depot_id AND p.kind = 'project'
            JOIN retail_depots v ON v.kind = 'vehicle' AND v.is_active AND v.assigned_user_id = w2.assigned_to_user_id
            WHERE w2.status NOT IN ('completed', 'approved', 'cancelled', 'failed')
            GROUP BY w2.id
            HAVING COUNT(v.id) = 1
        ) t
        WHERE w.id = t.wo_id
    """)
    op.execute("UPDATE retail_depots SET is_active = false WHERE kind = 'project'")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_retail_movements_installation_project_id")
    op.execute("ALTER TABLE retail_movements DROP COLUMN IF EXISTS installation_project_id")
