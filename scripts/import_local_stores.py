"""Import OKUR store cards from the repository seed into an empty database.

Default: isolated local database, read-only preview. --production reads
DATABASE_URL and OKUR_PRODUCTION_DB_HOST from the process environment.
Use --apply to write. Users, jobs, documents and demo stock are never loaded.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
from pathlib import Path
from urllib.parse import urlsplit, unquote, parse_qs
from uuid import UUID, uuid4

import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_values
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
TABLES = ("customers", "regions", "branches", "projects")

def load_payload():
    with gzip.open(ROOT / "data/okur-stores.json.gz", "rt", encoding="utf-8") as handle:
        payload = json.load(handle)
    ids = {}
    for table in TABLES:
        rows = payload[table]
        ids[table] = {str(UUID(row["id"])) for row in rows}
        if not rows or len(ids[table]) != len(rows):
            raise ValueError(f"Empty or duplicate seed records: {table}")
    for row in payload["projects"]:
        for key, parent in (("customer_id", "customers"), ("region_id", "regions"), ("branch_id", "branches")):
            if row[key] not in ids[parent]:
                raise ValueError(f"Broken store relationship: {key}")
        if row.get("created_by") or row.get("contract_value"):
            raise ValueError("Store seed must not contain user references or financial values")
    return payload

def database_url(production=False):
    entries = os.environ if production else dotenv_values(ROOT / "apps/backend/.env")
    raw = entries.get("DATABASE_URL", "")
    parsed = urlsplit(raw)
    db = unquote(parsed.path.lstrip("/"))
    if production:
        expected_host = entries.get("OKUR_PRODUCTION_DB_HOST", "")
        if (not expected_host or parsed.hostname != expected_host
            or not expected_host.endswith(".neon.tech") or db != "okur_erp"
            or parse_qs(parsed.query).get("sslmode", [""])[0] not in {"require", "verify-ca", "verify-full"}):
            raise ValueError("Expected explicitly selected OKUR Neon database with TLS")
    elif parsed.hostname not in {"localhost", "127.0.0.1"} or db != "okur_erp_local":
        raise ValueError("Expected isolated local OKUR database")
    return raw.replace("+asyncpg", "").replace("+psycopg2", "")

def count(cursor, table):
    cursor.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table)))
    return cursor.fetchone()[0]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--production", action="store_true")
    parser.add_argument("--check-file", action="store_true", help="validate seed without connecting")
    args = parser.parse_args()
    payload = load_payload()
    expected = {table: len(payload[table]) for table in TABLES}
    print("Validated seed:", expected)
    if args.check_file:
        return
    with psycopg2.connect(database_url(args.production), connect_timeout=15) as connection:
        connection.set_session(readonly=not args.apply)
        with connection.cursor() as cursor:
            if args.apply:
                cursor.execute("LOCK TABLE tenants, customers, regions, branches, projects IN SHARE ROW EXCLUSIVE MODE")
            before = {table: count(cursor, table) for table in ("tenants", *TABLES)}
            print("Target counts:", before)
            if any(before.values()):
                raise ValueError("Target is not empty; refusing duplicate or mixed import")
            if not args.apply:
                print("Preflight passed. Use --apply to import store cards.")
                return
            tenant_id = str(uuid4())
            cursor.execute("INSERT INTO tenants (id, name, code, status, is_active, created_at) VALUES (%s,%s,%s,'ACTIVE',true,now())",
                           (tenant_id, "OKUR ERP" if args.production else "Okur Yerel", "OKUR" if args.production else "OKUR_LOCAL"))
            for table in TABLES:
                rows = payload[table]
                cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
                known = {row[0] for row in cursor.fetchall()}
                names = list(rows[0])
                if "tenant_id" in names or not set(names).issubset(known) or any(set(row) != set(names) for row in rows):
                    raise ValueError(f"Seed/schema mismatch: {table}")
                statement = sql.SQL("INSERT INTO {} ({}) VALUES %s").format(sql.Identifier(table), sql.SQL(",").join(map(sql.Identifier, ["tenant_id", *names])))
                execute_values(cursor, statement.as_string(connection), [(tenant_id, *(row[key] for key in names)) for row in rows], page_size=500)
                if count(cursor, table) != expected[table]:
                    raise ValueError(f"Post-import count mismatch: {table}")
            print("Verified store counts; committing import:", expected)

if __name__ == "__main__":
    main()
