"""Create an empty, isolated Okur database on an existing local PostgreSQL.

The supplied Sismik .env is used only for the credentials to the *local*
PostgreSQL server. No Sismik business table is read or written. Existing
Okur databases and environment files are never overwritten.
"""

from pathlib import Path
import secrets
import sys
from urllib.parse import urlsplit, urlunsplit, unquote

import psycopg2
from psycopg2 import sql


ROOT = Path(__file__).resolve().parents[1]
DATABASE = "okur_erp_local"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/setup_local.py path/to/local-sismik/backend/.env")

    backend_env = ROOT / "apps" / "backend" / ".env"
    frontend_env = ROOT / "apps" / "frontend" / ".env.local"
    if backend_env.exists() or frontend_env.exists():
        raise SystemExit("Okur environment file already exists; refusing to overwrite it")

    source_env = Path(sys.argv[1])
    entries = dict(
        line.split("=", 1)
        for line in source_env.read_text(encoding="utf-8-sig").splitlines()
        if line and not line.lstrip().startswith("#") and "=" in line
    )
    raw_url = entries["DATABASE_URL"]
    parsed = urlsplit(raw_url)
    if parsed.hostname not in {"localhost", "127.0.0.1"} or unquote(parsed.path.lstrip("/")) != "sismik_erp":
        raise SystemExit("Refusing a non-local or unexpected source database URL")

    # Connect to PostgreSQL's maintenance DB, not to Sismik's business DB.
    connection = psycopg2.connect(
        host=parsed.hostname,
        port=parsed.port or 5432,
        user=unquote(parsed.username or ""),
        password=unquote(parsed.password or ""),
        dbname="postgres",
        connect_timeout=5,
    )
    try:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DATABASE,))
            if cursor.fetchone():
                raise SystemExit("Okur database already exists; refusing to modify it")
            cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(DATABASE)))
    finally:
        connection.close()

    target_url = urlunsplit(parsed._replace(path="/" + DATABASE))
    backend_env.write_text(
        "ENV=development\n"
        + f"DATABASE_URL={target_url}\n"
        + "REDIS_URL=redis://localhost:6381/0\n"
        + f"SECRET_KEY={secrets.token_urlsafe(48)}\n"
        + "AUTO_MIGRATE=false\n"
        + "AUTO_CREATE_SCHEMA=false\n"
        + "AUTO_BOOTSTRAP_PLATFORM_ADMIN=false\n"
        + "EMAIL_PROVIDER=disabled\n"
        + "EMAIL_ASYNC_ENABLED=false\n"
        + "RESEND_API_KEY=\n"
        + "WHATSAPP_ACCESS_TOKEN=\n"
        + "WHATSAPP_PHONE_NUMBER_ID=\n"
        + "WHATSAPP_BUSINESS_ACCOUNT_ID=\n"
        + "WHATSAPP_VERIFY_TOKEN=\n"
        + "AWS_ACCESS_KEY_ID=\n"
        + "AWS_SECRET_ACCESS_KEY=\n"
        + "FRONTEND_URL=http://localhost:3001\n",
        encoding="utf-8",
    )
    frontend_env.write_text(
        "NEXT_PUBLIC_API_URL=http://localhost:8001/api/v1\n"
        "NEXT_PUBLIC_DEMO_LOGIN=false\n",
        encoding="utf-8",
    )
    print(f"Created empty local database {DATABASE} and ignored Okur .env files")


if __name__ == "__main__":
    main()
