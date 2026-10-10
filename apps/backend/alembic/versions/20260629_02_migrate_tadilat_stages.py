"""Tadilat aşamaları yeni 7 aşamalı yapıya geçirildi

Revision ID: 20260629_02
Revises: 20260629_01
Create Date: 2026-06-29
"""

from alembic import op
from sqlalchemy import text

revision = "20260629_02"
down_revision = "20260629_01"
branch_labels = None
depends_on = None

# Eski aşama adları → yeni aşama adları
NAME_MAP = {
    "Keşif ve İhtiyaç Analizi":      "Keşif",
    "Revizyon Projesi":               "Proje Onayı",
    "Proje / Revizyon Hazırlığı":     "Proje Onayı",
    "Proje Hazırlığı":                "Proje Onayı",
    "Proje / Yerleşim Kontrolü":      "Proje Onayı",
    "Fiyat Teklifi":                  "Fiyat Onayı",
    "Fiyat Teklifi ve Onay":          "Fiyat Onayı",
    "Sipariş / İmalat":               "Malzeme Hazırlığı",
    "Sipariş ve İmalat Süreci":       "Malzeme Hazırlığı",
    "Malzeme / Sipariş":              "Malzeme Hazırlığı",
    "Malzeme Siparişi":               "Malzeme Hazırlığı",
    "İmalat / Hazırlık":              "Malzeme Hazırlığı",
    "Montaj":                         "Montaj / Uygulama",
    "Montaj Süreci":                  "Montaj / Uygulama",
    "Uygulama / Montaj":              "Montaj / Uygulama",
    "Montaj ve Uygulama":             "Montaj / Uygulama",
    "Kontrol / Test":                 "Test ve Kontrol",
    "Test, Kontrol ve Devreye Alma":  "Test ve Kontrol",
    "Devreye Alma":                   "Test ve Kontrol",
    "Hakkediş / Fatura":              "Hakediş / Fatura",
    "Hakediş ve Faturalandırma":      "Hakediş / Fatura",
}

TARGET_ORDER = [
    "Keşif",
    "Proje Onayı",
    "Fiyat Onayı",
    "Malzeme Hazırlığı",
    "Montaj / Uygulama",
    "Test ve Kontrol",
    "Hakediş / Fatura",
]


def _nullify_activities(bind, stage_ids_subquery: str, params: dict) -> None:
    """Silinecek aşamalara bağlı aktivitelerdeki FK'ı null yap."""
    bind.execute(
        text(f"""
            UPDATE store_activities
            SET related_stage_id = NULL
            WHERE related_stage_id IN ({stage_ids_subquery})
        """),
        params,
    )


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Aşama adlarını yeniden adlandır (sadece tadilat süreçleri)
    for old_name, new_name in NAME_MAP.items():
        bind.execute(
            text("""
                UPDATE store_process_stages s
                SET name = :new_name
                FROM store_processes p
                WHERE s.process_id = p.id
                  AND p.work_type = 'tadilat'
                  AND s.name = :old_name
            """),
            {"old_name": old_name, "new_name": new_name},
        )

    # 2. "Tamamlandı" aşamalarını sil (önce aktivite FK'larını temizle)
    _nullify_activities(
        bind,
        stage_ids_subquery="""
            SELECT s.id
            FROM store_process_stages s
            JOIN store_processes p ON s.process_id = p.id
            WHERE p.work_type = 'tadilat' AND s.name = 'Tamamlandı'
        """,
        params={},
    )
    bind.execute(
        text("""
            DELETE FROM store_process_stages s
            USING store_processes p
            WHERE s.process_id = p.id
              AND p.work_type = 'tadilat'
              AND s.name = 'Tamamlandı'
        """)
    )

    # 3. Aynı süreçte aynı adda birden fazla aşama varsa en ileri durumu olanı koru
    for stage_name in TARGET_ORDER:
        dup_subquery = """
            SELECT s.id
            FROM store_process_stages s
            JOIN store_processes p ON s.process_id = p.id
            WHERE p.work_type = 'tadilat'
              AND s.name = :stage_name
              AND s.process_id IN (
                  SELECT process_id FROM store_process_stages
                  WHERE name = :stage_name
                  GROUP BY process_id
                  HAVING COUNT(*) > 1
              )
              AND s.id NOT IN (
                  SELECT DISTINCT ON (process_id) id
                  FROM store_process_stages
                  WHERE name = :stage_name
                  ORDER BY process_id,
                    CASE status
                      WHEN 'completed'   THEN 3
                      WHEN 'in_progress' THEN 2
                      WHEN 'waiting'     THEN 1
                      WHEN 'pending'     THEN 1
                      WHEN 'delayed'     THEN 1
                      ELSE 0
                    END DESC,
                    order_index ASC
              )
        """
        _nullify_activities(bind, dup_subquery, {"stage_name": stage_name})
        bind.execute(
            text(f"DELETE FROM store_process_stages WHERE id IN ({dup_subquery})"),
            {"stage_name": stage_name},
        )

    # 4. Sıralamayı yeni 7 aşamalı yapıya göre düzenle
    for idx, stage_name in enumerate(TARGET_ORDER):
        bind.execute(
            text("""
                UPDATE store_process_stages s
                SET order_index = :idx
                FROM store_processes p
                WHERE s.process_id = p.id
                  AND p.work_type = 'tadilat'
                  AND s.name = :stage_name
            """),
            {"idx": idx, "stage_name": stage_name},
        )

    # 5. Tüm tadilat süreçlerinin ilerleme yüzdesini yeniden hesapla
    bind.execute(
        text("""
            UPDATE store_processes p
            SET progress_percent = (
                SELECT ROUND(
                    COUNT(*) FILTER (WHERE s.status = 'completed') * 100.0
                    / NULLIF(COUNT(*), 0)
                )
                FROM store_process_stages s
                WHERE s.process_id = p.id
            )
            WHERE p.work_type = 'tadilat'
        """)
    )


def downgrade() -> None:
    # Geri alma desteklenmiyor — eski isimleri kaydetmediğimiz için geri dönüş mümkün değil
    pass
