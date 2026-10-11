"""Read-only smoke test for the isolated Okur development environment."""

from pathlib import Path
from urllib.parse import unquote, urlsplit

import httpx
import psycopg2


ROOT = Path(__file__).resolve().parents[1]
BACKEND_ENV = ROOT / "apps" / "backend" / ".env"
CREDENTIALS = ROOT / "local-data" / "dev-admin.txt"


def entries(path: Path) -> dict[str, str]:
    return dict(
        line.split("=", 1)
        for line in path.read_text(encoding="utf-8-sig").splitlines()
        if line and not line.lstrip().startswith("#") and "=" in line
    )


def main() -> None:
    env = entries(BACKEND_ENV)
    parsed = urlsplit(env["DATABASE_URL"])
    if parsed.hostname not in {"localhost", "127.0.0.1"} or unquote(parsed.path.lstrip("/")) != "okur_erp_local":
        raise SystemExit("Refusing to inspect a database outside the local Okur instance")

    with psycopg2.connect(env["DATABASE_URL"].replace("+asyncpg", "").replace("+psycopg2", ""), options="-c default_transaction_read_only=on") as db:
        with db.cursor() as cursor:
            cursor.execute("SELECT current_database()")
            assert cursor.fetchone()[0] == "okur_erp_local"
            counts: dict[str, int] = {}
            for table in ("users", "projects", "work_orders", "documents", "notifications"):
                cursor.execute(f'SELECT count(*) FROM "{table}"')
                counts[table] = cursor.fetchone()[0]
                print(f"{table}: {counts[table]}")

    credentials = dict(
        line.split(": ", 1)
        for line in CREDENTIALS.read_text(encoding="utf-8-sig").splitlines()
        if ": " in line
    )
    with httpx.Client(timeout=15) as client:
        response = client.get("http://127.0.0.1:8001/health")
        response.raise_for_status()
        print("API health: OK")
        response = client.post(
            "http://127.0.0.1:8001/api/v1/auth/login",
            data={"username": credentials["E-posta"], "password": credentials["Geçici parola"]},
        )
        response.raise_for_status()
        token = response.json()["access_token"]
        assert token
        print("Local admin login: OK")
        unauthorized = client.get("http://127.0.0.1:8001/api/v1/projects")
        assert unauthorized.status_code in {401, 403}
        headers = {"Authorization": f"Bearer {token}"}
        projects = client.get("http://127.0.0.1:8001/api/v1/projects?limit=1", headers=headers)
        projects.raise_for_status()
        assert int(projects.headers["X-Total-Count"]) == counts["projects"]
        orders = client.get("http://127.0.0.1:8001/api/v1/work-orders", headers=headers)
        orders.raise_for_status()
        assert len(orders.json()) == counts["work_orders"]
        print("Authorization and business list counts: OK")
        response = client.get("http://127.0.0.1:3001/login")
        response.raise_for_status()
        assert "html" in response.headers.get("content-type", "")
        print("Frontend login page: OK")


if __name__ == "__main__":
    main()
