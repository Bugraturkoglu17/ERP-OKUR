"""Yerel OKUR verisini `data/` klasörüne dışa aktarır (Git'e eklenir).

`git pull` yapan başka bir bilgisayarda API açılırken (`app/services/local_seed.py`)
bu dosyalardan veritabanı otomatik doldurulur:

- data/okur-stores.json.gz   mağaza kartları: müşteri, bölge, şube, proje (+ firma kaydı)
- data/okur-catalog.json     stok kartları: Excel fiyat listesinden (kod, ad, birim, marka, tip, fiyat)
- data/okur-demo-stock.json  ana depo + deneme açılış stoğu (kod -> miktar)
- data/STOK-VE-MAGAZA-LISTESI.xlsx   kaynak Excel (verilirse kopyalanır)

    python scripts/export_seed_data.py ["C:/yol/STOK VE MAĞAZA LİSTESİ.xlsx"]

Kullanıcı, parola veya sözleşme tutarı aktarılmaz.
"""

from __future__ import annotations

import argparse
import gzip
import importlib.util
import json
import shutil
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

import psycopg2


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ENV_FILE = ROOT / "apps" / "backend" / ".env"
EXCEL_NAME = "STOK-VE-MAGAZA-LISTESI.xlsx"
TENANT_NAME = "Okur Yerel"
STORE_TABLES = ("customers", "regions", "branches", "projects")


def database_url() -> str:
    values = dict(line.split("=", 1) for line in ENV_FILE.read_text(encoding="utf-8").splitlines()
                  if line and not line.lstrip().startswith("#") and "=" in line)
    url = values["DATABASE_URL"].replace("+asyncpg", "").replace("+psycopg2", "")
    parsed = urlsplit(url)
    if parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.path != "/okur_erp_local":
        raise SystemExit("Refusing to export from anything but the isolated local OKUR database")
    return url


def jsonable(value):
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def write_json(path: Path, payload, *, gz: bool = False) -> None:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=jsonable)
    if gz:
        # mtime=0: aynı veri her seferinde aynı baytları üretsin, Git farkı gürültülü olmasın.
        with open(path, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as handle:
            handle.write(text.encode("utf-8"))
    else:
        path.write_text(text + "\n", encoding="utf-8")


def load_catalog_reader():
    spec = importlib.util.spec_from_file_location("import_material_catalog", ROOT / "scripts" / "import_material_catalog.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.read_rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("excel", nargs="?", type=Path, help="Fiyat listesi Excel dosyası (data/ klasörüne kopyalanır)")
    args = parser.parse_args()
    DATA.mkdir(exist_ok=True)

    if args.excel:
        shutil.copyfile(args.excel, DATA / EXCEL_NAME)
    excel = DATA / EXCEL_NAME
    if excel.exists():
        items, stats = load_catalog_reader()(excel)
        catalog = [{**item, "unit_price": str(item["unit_price"]) if item["unit_price"] is not None else None} for item in items]
        catalog.sort(key=lambda item: (len(item["sku"]), item["sku"]))
        write_json(DATA / "okur-catalog.json", catalog)
        print(f"catalog: {len(catalog)} stok kartı (işçilik atlanan: {stats['services']})")
    else:
        print("catalog: Excel bulunamadı, okur-catalog.json değişmedi")

    with psycopg2.connect(database_url()) as connection, connection.cursor() as cursor:
        cursor.execute("SELECT id, name, code, status::text, is_active FROM tenants WHERE name = %s", (TENANT_NAME,))
        tenant = cursor.fetchone()
        if not tenant:
            raise SystemExit(f"'{TENANT_NAME}' firma kaydı bulunamadı")
        payload = {"tenant": {"id": tenant[0], "name": tenant[1], "code": tenant[2], "status": tenant[3], "is_active": tenant[4]}}
        for table in STORE_TABLES:
            cursor.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position", (table,))
            columns = [row[0] for row in cursor.fetchall() if row[0] != "tenant_id"]
            cursor.execute(f'SELECT {", ".join(columns)} FROM {table} WHERE tenant_id = %s ORDER BY id', (tenant[0],))
            rows = []
            for values in cursor.fetchall():
                row = dict(zip(columns, values))
                if table == "projects":
                    row["created_by"] = None          # kullanıcılar aktarılmaz
                    row["contract_value"] = None      # tutarlar aktarılmaz
                rows.append(row)
            payload[table] = rows
        write_json(DATA / "okur-stores.json.gz", payload, gz=True)
        print("stores:", {table: len(payload[table]) for table in STORE_TABLES})

        cursor.execute("SELECT id, name FROM retail_depots WHERE tenant_id = %s AND kind = 'main'", (tenant[0],))
        main = cursor.fetchone()
        if main:
            cursor.execute(
                "SELECT m.sku, sum(mv.quantity) FROM retail_movements mv JOIN retail_materials m ON m.id = mv.material_id "
                "WHERE mv.tenant_id = %s AND mv.kind = 'opening' AND mv.reference_no = 'DENEME-STOK' GROUP BY m.sku",
                (tenant[0],))
            openings = {sku: str(quantity) for sku, quantity in cursor.fetchall()}
            write_json(DATA / "okur-demo-stock.json", {
                "main_depot": {"id": main[0], "name": main[1]}, "reference": "DENEME-STOK", "openings": dict(sorted(openings.items(), key=lambda kv: (len(kv[0]), kv[0]))),
            })
            print(f"demo-stock: ana depo '{main[1]}', {len(openings)} kalem açılış stoğu")
        else:
            print("demo-stock: ana depo yok, okur-demo-stock.json değişmedi")

    for path in sorted(DATA.iterdir()):
        print(f"  {path.name}: {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
