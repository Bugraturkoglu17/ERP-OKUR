"""Exercise OKUR retail stock locally, then remove only this script's test rows."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import psycopg2
import requests


ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8001/api/v1"
ENV_FILE = ROOT / "apps" / "backend" / ".env"
PASSWORD_FILE = ROOT / "local-data" / "dev-admin.txt"


def local_database_url() -> str:
    values = dict(line.split("=", 1) for line in ENV_FILE.read_text(encoding="utf-8").splitlines()
                  if line and not line.lstrip().startswith("#") and "=" in line)
    url = values["DATABASE_URL"].replace("+asyncpg", "").replace("+psycopg2", "")
    parsed = urlsplit(url)
    if parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.path != "/okur_erp_local":
        raise RuntimeError("Refusing to test outside isolated local OKUR database")
    return url


def credentials() -> tuple[str, str]:
    values = dict(line.split(": ", 1) for line in PASSWORD_FILE.read_text(encoding="utf-8").splitlines() if ": " in line)
    return values["E-posta"], values["Geçici parola"]


def main() -> None:
    db_url = local_database_url()
    email, password = credentials()
    session = requests.Session()
    login = session.post(f"{API}/auth/login", data={"username": email, "password": password}, timeout=15)
    if login.status_code != 200:
        raise RuntimeError(f"Local admin login unavailable (HTTP {login.status_code}); no stock data changed")
    token_data = login.json()
    if token_data.get("force_password_change"):
        raise RuntimeError("Local admin must complete password change; no stock data changed")
    session.headers["Authorization"] = f"Bearer {token_data['access_token']}"

    def request(method: str, path: str, payload: dict | None = None, expected: int = 200):
        response = session.request(method, f"{API}/retail-stock{path}", json=payload, timeout=15)
        if response.status_code != expected:
            raise AssertionError(f"{method} {path}: expected {expected}, received {response.status_code}: {response.text[:250]}")
        return response.json()

    main_id = vehicle_id = material_id = None
    created_main = False
    try:
        depots = request("GET", "/depots")
        main_depot = next((depot for depot in depots if depot["kind"] == "main"), None)
        if main_depot is None:
            main_depot = request("POST", "/depots", {"kind": "main", "name": "SMOKE Ana Depo"}, 201)
            created_main = True
        main_id = main_depot["id"]
        suffix = uuid4().hex[:8].upper()
        vehicle = request("POST", "/depots", {"kind": "vehicle", "name": "SMOKE Araç", "plate": f"99 {suffix}"}, 201)
        vehicle_id = vehicle["id"]
        material = request("POST", "/materials", {"sku": f"SMOKE-{suffix}", "name": "SMOKE test malzemesi", "unit": "metre", "min_stock": "1"}, 201)
        material_id = material["id"]

        with psycopg2.connect(db_url, options="-c default_transaction_read_only=on") as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id FROM branches WHERE tenant_id = (SELECT id FROM tenants WHERE name = %s) LIMIT 1", ("Okur Yerel",))
                branch_id = cursor.fetchone()[0]

        request("POST", "/opening", {"depot_id": main_id, "material_id": material_id, "quantity": "10.5"}, 201)
        request("POST", "/load", {"source_depot_id": main_id, "target_depot_id": vehicle_id, "material_id": material_id, "quantity": "4"}, 201)
        request("POST", "/use", {"vehicle_depot_id": vehicle_id, "material_id": material_id, "branch_id": str(branch_id), "quantity": "1.5"}, 201)
        request("POST", "/return", {"source_depot_id": vehicle_id, "target_depot_id": main_id, "material_id": material_id, "quantity": "1"}, 201)
        request("POST", "/use", {"vehicle_depot_id": vehicle_id, "material_id": material_id, "branch_id": str(branch_id), "quantity": "99"}, 409)

        main_stock = request("GET", f"/stock?depot_id={main_id}")
        vehicle_stock = request("GET", f"/stock?depot_id={vehicle_id}")
        main_quantity = Decimal(next(row["quantity"] for row in main_stock if row["material_id"] == material_id))
        vehicle_quantity = Decimal(next(row["quantity"] for row in vehicle_stock if row["material_id"] == material_id))
        assert main_quantity == Decimal("7.5")
        assert vehicle_quantity == Decimal("1.5")
        movements = request("GET", "/movements")
        assert len([row for row in movements if row["material_name"] == "SMOKE test malzemesi"]) == 4
        print("PASS: opening -> vehicle load -> store use -> return; overdraft rejected; balances and audit correct")
    finally:
        with psycopg2.connect(db_url) as connection:
            with connection.cursor() as cursor:
                if material_id:
                    cursor.execute("DELETE FROM retail_movements WHERE material_id = %s", (material_id,))
                    cursor.execute("DELETE FROM retail_balances WHERE material_id = %s", (material_id,))
                    cursor.execute("DELETE FROM retail_materials WHERE id = %s AND sku LIKE 'SMOKE-%%'", (material_id,))
                if vehicle_id:
                    cursor.execute("DELETE FROM retail_depots WHERE id = %s AND name = 'SMOKE Araç'", (vehicle_id,))
                if created_main and main_id:
                    cursor.execute("DELETE FROM retail_depots WHERE id = %s AND name = 'SMOKE Ana Depo'", (main_id,))
        print("Temporary smoke-test rows removed; existing OKUR stores and users untouched")


if __name__ == "__main__":
    main()
