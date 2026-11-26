"""Yerel test için 4 deneme taşeron kartı (ünvanları "[DENEME]" ile başlar).

Taşeron tablosunda iş yükü ve puan görünsün diye:
- açık "[DENEME]" iş emirlerinin bir kısmı taşeronlara atanır (açık iş emri, en yakın termin),
- tamamlanmış "[DENEME]" iş emirleri taşeronlara atanıp 1–5 puan verilir (ortalama puan),
- devam eden projelerin tamamlanmamış bir adımı taşerona atanır (devam eden proje; proje varsa).
Yalnız okur_erp_local veritabanında çalışır; deneme taşeronları zaten varsa hiçbir şey yapmaz.

    apps/backend/.venv/Scripts/python scripts/seed_test_subcontractors.py
"""

from __future__ import annotations

import random
import uuid
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "apps" / "backend" / ".env"
PREFIX = "[DENEME] "

# (ünvan, il, yetkili, görevi, telefon, e-posta, elle renk, puan eğilimi)
SUBCONTRACTORS = [
    ("Kuzey Soğutma Montaj Ltd. Şti.", "İstanbul / Ümraniye", "Ahmet Yılmaz", "Saha şefi", "0532 111 22 33", "info@kuzeysogutma.test", "yesil", (4, 5)),
    ("Ege Klima Teknik", "İzmir / Bornova", "Elif Kaya", "Kurucu ortak", "0533 222 33 44", "iletisim@egeklima.test", "yesil", (3, 5)),
    ("Marmara Elektrik ve Otomasyon", "Kocaeli / Gebze", "Mehmet Demir", "Proje sorumlusu", "0534 333 44 55", "teklif@marmaraelektrik.test", "sari", (2, 4)),
    ("Anadolu İzolasyon", "Ankara / Yenimahalle", "Zeynep Arslan", "Muhasebe", "0535 444 55 66", "anadolu@izolasyon.test", "kirmizi", (1, 3)),
]


def database_url() -> str:
    url = next(line.split("=", 1)[1] for line in ENV_FILE.read_text(encoding="utf-8").splitlines() if line.startswith("DATABASE_URL="))
    return url.replace("postgresql+psycopg2://", "postgresql://").replace("postgresql+asyncpg://", "postgresql://")


def main() -> None:
    rng = random.Random(20261126)
    with psycopg2.connect(database_url()) as conn, conn.cursor() as cur:
        cur.execute("select current_database()")
        if cur.fetchone()[0] != "okur_erp_local":
            raise SystemExit("Yalnızca okur_erp_local veritabanında çalışır.")
        cur.execute("select 1 from subcontractors where company_name like %s limit 1", (PREFIX + "%",))
        if cur.fetchone():
            raise SystemExit("Deneme taşeronları zaten var; tekrar eklenmedi.")

        # Firma: deneme iş emirlerinin firması, yoksa tek aktif firma.
        cur.execute("select tenant_id from work_orders where title like %s and tenant_id is not null limit 1", (PREFIX + "%",))
        row = cur.fetchone()
        if not row:
            cur.execute("select id from tenants where is_active = true limit 2")
            rows = cur.fetchall()
            if len(rows) != 1:
                raise SystemExit("Firma bulunamadı (deneme iş emri yok ve tek aktif firma değil).")
            row = rows[0]
        tenant_id = row[0]
        cur.execute("select id from users where tenant_id = %s and lower(coalesce(default_role, '')) in ('admin', 'manager') limit 1", (tenant_id,))
        manager = cur.fetchone()
        manager_id = manager[0] if manager else None

        ids = []
        for name, city, contact, title, phone, email, color, _ in SUBCONTRACTORS:
            sub_id = uuid.uuid4()
            cur.execute(
                "insert into subcontractors (id, tenant_id, company_name, city, contact_name, contact_title, contact_phone,"
                " contact_email, competency, notes, is_active, created_by, created_at, updated_at)"
                " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true, %s, now(), now())",
                (str(sub_id), str(tenant_id), PREFIX + name, city, contact, title, phone, email, color,
                 "Deneme amaçlı oluşturulmuş taşeron kartı.", manager_id),
            )
            ids.append(sub_id)

        # Açık deneme iş emirleri: iş yükü ve termin.
        cur.execute("select id from work_orders where tenant_id = %s and title like %s and status not in"
                    " ('completed', 'approved', 'cancelled', 'failed') and subcontractor_id is null order by created_at",
                    (tenant_id, PREFIX + "%"))
        open_orders = [r[0] for r in cur.fetchall()]
        weights = [4, 2, 5, 1]  # taşeron başına açık iş sayısı (varsa)
        index = 0
        for sub_id, count in zip(ids, weights):
            for wo_id in open_orders[index:index + count]:
                cur.execute("update work_orders set subcontractor_id = %s where id = %s", (str(sub_id), wo_id))
            index += count

        # Tamamlanmış deneme iş emirleri: puan.
        cur.execute("select id from work_orders where tenant_id = %s and title like %s and status in ('completed', 'approved')"
                    " and subcontractor_id is null order by completed_at nulls last", (tenant_id, PREFIX + "%"))
        done_orders = [r[0] for r in cur.fetchall()]
        rated = 0
        for position, wo_id in enumerate(done_orders):
            slot = position % len(ids)
            low, high = SUBCONTRACTORS[slot][7]
            cur.execute("update work_orders set subcontractor_id = %s where id = %s", (str(ids[slot]), wo_id))
            cur.execute(
                "insert into subcontractor_ratings (id, tenant_id, subcontractor_id, work_order_id, score, note, created_by, created_at, updated_at)"
                " values (%s, %s, %s, %s, %s, %s, %s, now(), now())",
                (str(uuid.uuid4()), str(tenant_id), str(ids[slot]), wo_id, rng.randint(low, high), "Deneme puanı", manager_id),
            )
            rated += 1

        # Devam eden projeler: tamamlanmamış ilk adım taşerona atanır.
        cur.execute(
            "select distinct on (s.project_id) s.id from installation_project_stages s"
            " join installation_projects p on p.id = s.project_id"
            " where p.tenant_id = %s and p.status = 'active' and s.status <> 'completed' and s.subcontractor_id is null"
            " order by s.project_id, s.stage_order", (tenant_id,))
        stages = [r[0] for r in cur.fetchall()]
        for position, stage_id in enumerate(stages[:6]):
            cur.execute("update installation_project_stages set subcontractor_id = %s where id = %s",
                        (str(ids[position % 3]), stage_id))

    print(f"4 deneme taşeron eklendi; {min(len(open_orders), sum(weights))} açık iş emri, {rated} puanlı iş emri,"
          f" {min(len(stages), 6)} proje adımı atandı.")


if __name__ == "__main__":
    main()
