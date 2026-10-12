"""Bootstrap one local Okur admin without storing credentials in Git."""

import os
from pathlib import Path
import secrets
import subprocess
import sys

import psycopg2


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "apps" / "backend"
ENV_FILE = BACKEND / ".env"
PASSWORD_FILE = ROOT / "local-data" / "dev-admin.txt"
EMAIL = "admin@okur.local"


def main() -> None:
    if PASSWORD_FILE.exists():
        raise SystemExit("Local admin credential file already exists; refusing to reset password")
    entries = dict(
        line.split("=", 1)
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines()
        if line and not line.lstrip().startswith("#") and "=" in line
    )
    url = entries["DATABASE_URL"].replace("+asyncpg", "").replace("+psycopg2", "")
    if not url.endswith("/okur_erp_local"):
        raise SystemExit("Refusing to bootstrap outside the isolated Okur database")
    with psycopg2.connect(url, options="-c default_transaction_read_only=on", connect_timeout=5) as db:
        with db.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM users")
            if cursor.fetchone()[0] != 0:
                raise SystemExit("Users already exist; refusing to change any account")

    password = secrets.token_urlsafe(24)
    env = os.environ.copy()
    env.update(
        PLATFORM_ADMIN_EMAIL=EMAIL,
        PLATFORM_ADMIN_PASSWORD=password,
        PLATFORM_ADMIN_FULL_NAME="Okur Yerel Yönetici",
    )
    subprocess.run([sys.executable, "-m", "app.bootstrap_admin"], cwd=BACKEND, env=env, check=True)
    PASSWORD_FILE.parent.mkdir(parents=True, exist_ok=True)
    PASSWORD_FILE.write_text(f"E-posta: {EMAIL}\nGeçici parola: {password}\n", encoding="utf-8")
    print(f"Local admin created. Credentials saved only in ignored file: {PASSWORD_FILE}")


if __name__ == "__main__":
    main()
