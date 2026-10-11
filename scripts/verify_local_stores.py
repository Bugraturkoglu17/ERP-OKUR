"""Read-only equality check for the local Sismik -> Okur store import."""

import psycopg2
from psycopg2 import sql

from import_local_stores import SOURCE_ENV, TARGET_ENV, TABLES, columns, database_url


def main() -> None:
    source_url = database_url(SOURCE_ENV, "sismik_erp")
    target_url = database_url(TARGET_ENV, "okur_erp_local")
    with psycopg2.connect(source_url, options="-c default_transaction_read_only=on") as source:
        with psycopg2.connect(target_url, options="-c default_transaction_read_only=on") as target:
            with source.cursor() as src, target.cursor() as dst:
                for table in TABLES:
                    comparable = [
                        name for name in columns(src, table)
                        if name not in {"tenant_id", "created_by", "contract_value"}
                    ]
                    query = sql.SQL("SELECT {} FROM {} ORDER BY id").format(
                        sql.SQL(", ").join(map(sql.Identifier, comparable)),
                        sql.Identifier(table),
                    )
                    src.execute(query)
                    dst.execute(query)
                    source_rows = src.fetchall()
                    target_rows = dst.fetchall()
                    if source_rows != target_rows:
                        raise AssertionError(f"{table} differs between local databases")
                    print(f"{table}: {len(source_rows)} matching records")

                dst.execute("SELECT count(DISTINCT tenant_id) FROM projects")
                assert dst.fetchone()[0] == 1
                dst.execute("SELECT name FROM tenants WHERE id = (SELECT tenant_id FROM projects LIMIT 1)")
                assert dst.fetchone()[0] == "Okur Yerel"
                print("All stores belong to the isolated Okur tenant")


if __name__ == "__main__":
    main()
