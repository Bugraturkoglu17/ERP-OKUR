"""Compare the OKUR store seed to the isolated local database (read-only)."""
import psycopg2
from psycopg2 import sql
from import_local_stores import TABLES, database_url, load_payload

def main():
    payload = load_payload()
    with psycopg2.connect(database_url(), connect_timeout=10) as connection:
        connection.set_session(readonly=True)
        with connection.cursor() as cursor:
            for table in TABLES:
                cursor.execute(sql.SQL("SELECT id::text FROM {} ORDER BY id").format(sql.Identifier(table)))
                actual = {row[0] for row in cursor.fetchall()}
                expected = {row["id"] for row in payload[table]}
                if not expected.issubset(actual):
                    raise ValueError(f"{table}: seed and local record IDs differ")
                print(f"{table}: {len(expected)} seed IDs verified; {len(actual - expected)} additional local records excluded")

if __name__ == "__main__":
    main()
