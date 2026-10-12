"""Yerel geliştirme verisini `data/` klasöründen otomatik yükler.

`git pull` sonrası API açılırken (yalnızca ENV=development, yalnızca izole
`okur_erp_local` veritabanı) şunlar yapılır; hepsi tekrar çalıştırmaya güvenlidir:

1. Veritabanı migrasyonları `alembic upgrade head` ile güncellenir.
2. Firma + mağaza kartları (müşteri/bölge/şube/proje) boşsa yüklenir.
3. Stok kartları (katalog) kod bazında eklenir/güncellenir.
4. Ana depo + deneme açılış stoğu, depo ve hareket yoksa ve bir yönetici
   kullanıcı varsa yüklenir (hareketin bir kullanıcısı olmak zorundadır).

Hata uygulamayı durdurmaz; yalnızca günlüğe yazılır. Kullanıcı ve parola
yüklenmez; yönetici hesabı `scripts/create_local_admin.py` ile oluşturulur.
"""

from __future__ import annotations

import gzip
import json
import logging
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import psycopg2
from psycopg2.extras import execute_values

from app.core.config import settings

logger = logging.getLogger("okur.local_seed")

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR.parents[1] / "data"
STORE_TABLES = ("customers", "regions", "branches", "projects")
EXCEL_NAME = "STOK-VE-MAGAZA-LISTESI.xlsx"


def _sync_url() -> str:
    return str(settings.DATABASE_URL).replace("+asyncpg", "").replace("+psycopg2", "")


def migrate() -> bool:
    """Alembic'i ayrı süreçte çalıştırır (günlük ayarlarını bozmaması için)."""
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR, capture_output=True, text=True, timeout=600,
    )
    if result.returncode != 0:
        logger.error("Veritabanı migrasyonu başarısız:\n%s", (result.stderr or result.stdout)[-1500:])
        return False
    return True


def _read_json(name: str):
    path = DATA_DIR / name
    if not path.exists():
        return None
    opener = gzip.open if name.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def _columns(cursor, table: str) -> set[str]:
    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
    return {row[0] for row in cursor.fetchall()}


def _ensure_tenant(cursor, tenant: dict):
    cursor.execute("SELECT id FROM tenants WHERE code = %s OR name = %s ORDER BY created_at LIMIT 1", (tenant["code"], tenant["name"]))
    row = cursor.fetchone()
    if row:
        return row[0]
    cursor.execute(
        "INSERT INTO tenants (id, name, code, status, is_active, created_at) VALUES (%s, %s, %s, %s, %s, now())",
        (tenant["id"], tenant["name"], tenant["code"], tenant["status"], tenant["is_active"]),
    )
    return tenant["id"]


def _seed_stores(cursor, tenant_id, stores: dict) -> str:
    cursor.execute("SELECT count(*) FROM projects WHERE tenant_id = %s", (str(tenant_id),))
    if cursor.fetchone()[0]:
        return "mağazalar zaten var"
    for table in STORE_TABLES:
        rows = stores.get(table) or []
        if not rows:
            continue
        known = _columns(cursor, table)
        names = [name for name in rows[0] if name in known]
        columns = ["tenant_id", *names]
        execute_values(
            cursor,
            f'INSERT INTO {table} ({", ".join(columns)}) VALUES %s ON CONFLICT (id) DO NOTHING',
            [(str(tenant_id), *(row.get(name) for name in names)) for row in rows],
            page_size=500,
        )
    return f"{len(stores.get('projects') or [])} mağaza yüklendi"


def _load_catalog() -> tuple[list[dict] | None, str]:
    """Stok kartları: önce Excel (kaynak), okunamazsa önceden üretilmiş JSON."""
    excel = DATA_DIR / EXCEL_NAME
    if excel.exists():
        try:
            from app.services.material_catalog import read_catalog
            items, _ = read_catalog(excel)
            return items, "Excel"
        except ImportError:
            logger.warning("openpyxl kurulu değil; Excel yerine data/okur-catalog.json kullanılıyor "
                           "(Excel değişikliklerini işlemek için: pip install -r requirements.txt)")
        except Exception as error:  # noqa: BLE001
            logger.warning("Excel okunamadı (%s); data/okur-catalog.json kullanılıyor", error)
    catalog = _read_json("okur-catalog.json")
    return catalog, "JSON"


def _seed_catalog(cursor, tenant_id, catalog: list[dict], source: str) -> str:
    execute_values(
        cursor,
        """INSERT INTO retail_materials (id, tenant_id, sku, name, category, unit, brand, spec, unit_price, min_stock, is_active, created_at)
           VALUES %s
           ON CONFLICT (tenant_id, sku) DO UPDATE SET
               name = EXCLUDED.name, category = EXCLUDED.category, unit = EXCLUDED.unit,
               brand = EXCLUDED.brand, spec = EXCLUDED.spec, unit_price = EXCLUDED.unit_price, is_active = true""",
        [(str(uuid4()), str(tenant_id), item["sku"], item["name"], item["category"], item["unit"], item["brand"], item["spec"],
          item["unit_price"], 0, True) for item in catalog],
        template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())", page_size=200,
    )
    return f"{len(catalog)} stok kartı güncellendi ({source})"


def _seed_demo_stock(cursor, tenant_id, demo: dict) -> str:
    cursor.execute("SELECT count(*) FROM retail_depots WHERE tenant_id = %s", (str(tenant_id),))
    depots = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM retail_movements WHERE tenant_id = %s", (str(tenant_id),))
    movements = cursor.fetchone()[0]
    if depots or movements:
        return "depo/stok zaten var"
    cursor.execute("SELECT id FROM users WHERE default_role LIKE %s ORDER BY created_at LIMIT 1", ("%platform_admin%",))
    admin = cursor.fetchone()
    if not admin:
        return "yönetici kullanıcı yok; deneme stoğu yönetici oluşturulunca yüklenecek"
    main = demo["main_depot"]
    cursor.execute(
        "INSERT INTO retail_depots (id, tenant_id, kind, name, plate, assigned_user_id, is_active, created_at) "
        "VALUES (%s, %s, 'main', %s, NULL, NULL, true, now())", (main["id"], str(tenant_id), main["name"]))
    cursor.execute("SELECT sku, id FROM retail_materials WHERE tenant_id = %s", (str(tenant_id),))
    material_ids = dict(cursor.fetchall())
    lines = [(sku, quantity) for sku, quantity in demo["openings"].items() if sku in material_ids]
    execute_values(
        cursor,
        "INSERT INTO retail_movements (id, tenant_id, material_id, target_depot_id, kind, quantity, reference_no, note, performed_by, performed_at) VALUES %s",
        [(str(uuid4()), str(tenant_id), str(material_ids[sku]), main["id"], "opening", quantity, demo["reference"], "Deneme stoğu (rastgele)", str(admin[0])) for sku, quantity in lines],
        template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, now())", page_size=200,
    )
    execute_values(
        cursor,
        "INSERT INTO retail_balances (depot_id, material_id, quantity, updated_at) VALUES %s",
        [(main["id"], str(material_ids[sku]), quantity) for sku, quantity in lines],
        template="(%s, %s, %s, now())", page_size=200,
    )
    return f"ana depo ve {len(lines)} kalem deneme stoğu yüklendi"


def seed() -> list[str]:
    """Veri dosyalarından eksik yerel veriyi yükler; ne yaptığını kısa satırlarla döner."""
    stores = _read_json("okur-stores.json.gz")
    catalog, catalog_source = _load_catalog()
    demo = _read_json("okur-demo-stock.json")
    if not (stores or catalog):
        return ["data/ klasöründe yüklenecek dosya yok"]
    report: list[str] = []
    with psycopg2.connect(_sync_url()) as connection, connection.cursor() as cursor:
        tenant_id = _ensure_tenant(cursor, stores["tenant"] if stores else {
            "id": str(uuid4()), "name": "Okur Yerel", "code": "OKUR_LOCAL", "status": "ACTIVE", "is_active": True})
        if stores:
            report.append(_seed_stores(cursor, tenant_id, stores))
        if catalog:
            report.append(_seed_catalog(cursor, tenant_id, catalog, catalog_source))
        if demo and catalog:
            report.append(_seed_demo_stock(cursor, tenant_id, demo))
    return report


def run_local_bootstrap() -> None:
    """API açılışında çağrılır; asla istisna fırlatmaz."""
    try:
        if not DATA_DIR.exists():
            return
        if not migrate():
            return
        for line in seed():
            logger.info("Yerel veri: %s", line)
            print(f"[yerel veri] {line}", flush=True)
    except Exception:  # noqa: BLE001 — başlangıç hatası uygulamayı durdurmamalı
        logger.exception("Yerel veri yüklenemedi")
