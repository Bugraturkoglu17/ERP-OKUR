"""Copy only Sismik's local store hierarchy into Okur's separate local DB.

The source transaction is read-only. The destination is written atomically and
must have no existing tenant/store hierarchy. No users, jobs, files or finances
are imported. Run without --apply for a preflight preview.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import unquote, urlsplit
from uuid import uuid4

import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor, execute_values, register_uuid


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ENV = ROOT.parent / "mekanik-erp" / "apps" / "backend" / ".env"
TARGET_ENV = ROOT / "apps" / "backend" / ".env"
TABLES = ("customers", "regions", "branches", "projects")
SOURCE_PROJECTS = 4119  # includes 3 later test jobs that are not stores
EXPECTED_PROJECTS = 4116
# Sismik test jobs ("mm", "ÇUKURCA MJET", "AAA") created after the store load.
EXCLUDED_PROJECT_IDS = {
    "3b7239c9-dde6-47c3-928a-b81f80e1a966",
    "cd8683d7-4c23-487e-a96f-2b7688b76e20",
    "58cedddc-de22-4435-a398-34be336080e0",
}


def database_url(path: Path, expected_name: str) -> str:
    entries = dict(
        line.split("=", 1)
        for line in path.read_text(encoding="utf-8-sig").splitlines()
        if line and not line.lstrip().startswith("#") and "=" in line
    )
    raw = entries["DATABASE_URL"].strip().strip('"')
    parsed = urlsplit(raw)
    if parsed.hostname not in {"localhost", "127.0.0.1"} or unquote(parsed.path.lstrip("/")) != expected_name:
        raise SystemExit(f"Refusing non-local or unexpected {expected_name} database")
    return raw.replace("+asyncpg", "").replace("+psycopg2", "")


def columns(cursor: psycopg2.extensions.cursor, table: str) -> list[str]:
    cursor.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s ORDER BY ordinal_position",
        (table,),
    )
    return [row[0] for row in cursor.fetchall()]


def count(cursor: psycopg2.extensions.cursor, table: str) -> int:
    cursor.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table)))
    return cursor.fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write to the empty Okur DB")
    args = parser.parse_args()

    source_url = database_url(SOURCE_ENV, "sismik_erp")
    target_url = database_url(TARGET_ENV, "okur_erp_local")
    register_uuid()
    with psycopg2.connect(source_url, options="-c default_transaction_read_only=on") as source:
        source.set_session(readonly=True, isolation_level="REPEATABLE READ")
        with psycopg2.connect(target_url) as target:
            with source.cursor() as src, target.cursor() as dst:
                src.execute("SELECT current_database()")
                dst.execute("SELECT current_database()")
                assert src.fetchone()[0] == "sismik_erp"
                assert dst.fetchone()[0] == "okur_erp_local"

                source_counts = {table: count(src, table) for table in TABLES}
                target_counts = {table: count(dst, table) for table in ("tenants", *TABLES)}
                print("Sismik local:", source_counts)
                print("Okur before:", target_counts)
                if source_counts["projects"] != SOURCE_PROJECTS:
                    raise SystemExit("Source project count changed; inspect before importing")
                if any(target_counts.values()):
                    raise SystemExit("Okur already has tenant/store data; refusing duplicate import")

                src.execute("SELECT DISTINCT tenant_id FROM projects")
                source_tenants = [row[0] for row in src.fetchall()]
                if len(source_tenants) != 1 or source_tenants[0] is None:
                    raise SystemExit("Expected one non-null source tenant")
                src.execute("SELECT count(*) FROM tenants WHERE id = %s", (source_tenants[0],))
                if src.fetchone()[0] != 1:
                    raise SystemExit("Source tenant does not exist")
                src.execute(
                    "SELECT count(*) FROM projects p "
                    "LEFT JOIN customers c ON c.id = p.customer_id "
                    "LEFT JOIN regions r ON r.id = p.region_id "
                    "LEFT JOIN branches b ON b.id = p.branch_id "
                    "WHERE c.id IS NULL OR r.id IS NULL OR b.id IS NULL "
                    "OR c.tenant_id IS DISTINCT FROM p.tenant_id "
                    "OR r.tenant_id IS DISTINCT FROM p.tenant_id "
                    "OR b.tenant_id IS DISTINCT FROM p.tenant_id"
                )
                if src.fetchone()[0]:
                    raise SystemExit("Source store hierarchy is inconsistent")
                for table in TABLES:
                    if columns(src, table) != columns(dst, table):
                        raise SystemExit(f"{table} schemas differ; refusing lossy import")

                if not args.apply:
                    print("Preflight passed. Run with --apply to copy stores into Okur only.")
                    return

                okur_tenant_id = uuid4()
                dst.execute(
                    "INSERT INTO tenants (id, name, code, status, is_active, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, now())",
                    (str(okur_tenant_id), "Okur Yerel", "OKUR_LOCAL", "ACTIVE", True),
                )
                src.execute("SELECT id, customer_id FROM projects")
                kept_customers = {
                    str(customer_id)
                    for project_id, customer_id in src.fetchall()
                    if str(project_id) not in EXCLUDED_PROJECT_IDS
                }
                for table in TABLES:
                    table_columns = columns(src, table)
                    with source.cursor(cursor_factory=RealDictCursor) as rows_cursor:
                        rows_cursor.execute(sql.SQL("SELECT * FROM {}").format(sql.Identifier(table)))
                        data = []
                        for row in rows_cursor:
                            if table == "projects" and str(row["id"]) in EXCLUDED_PROJECT_IDS:
                                continue
                            if table == "customers" and str(row["id"]) not in kept_customers:
                                continue  # Sismik test customers carry no stores.
                            row["tenant_id"] = okur_tenant_id
                            if table == "projects":
                                row["created_by"] = None  # Sismik users are not imported.
                                row["contract_value"] = None  # Only store data, not financials.
                            data.append(tuple(row[column] for column in table_columns))
                    statement = sql.SQL("INSERT INTO {} ({}) VALUES %s").format(
                        sql.Identifier(table),
                        sql.SQL(", ").join(map(sql.Identifier, table_columns)),
                    ).as_string(target)
                    execute_values(dst, statement, data, page_size=500)
                    if count(dst, table) != len(data):
                        raise RuntimeError(f"Count verification failed for {table}")
                    if table == "projects" and len(data) != EXPECTED_PROJECTS:
                        raise RuntimeError("Imported project count differs from expected stores")

                dst.execute("SELECT count(*) FROM projects WHERE tenant_id = %s", (str(okur_tenant_id),))
                if dst.fetchone()[0] != EXPECTED_PROJECTS:
                    raise RuntimeError("Tenant mapping verification failed")
                # Context manager commits only after every insert and check succeeds.
                print(f"Imported {EXPECTED_PROJECTS:,} stores and their hierarchy into Okur local DB.")


if __name__ == "__main__":
    main()
