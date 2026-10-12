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
    extra_material_ids: list[str] = []
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

        material2 = request("POST", "/materials", {"sku": f"SMOKE2-{suffix}", "name": "SMOKE test malzemesi 2", "unit": "adet"}, 201)
        material2_id = material2["id"]
        extra_material_ids.append(material2_id)

        def transfer(source: str, target: str, lines: list[tuple[str, str]], expected: int = 201):
            return request("POST", "/transfer", {"source_depot_id": source, "target_depot_id": target,
                                                 "lines": [{"material_id": m, "quantity": q} for m, q in lines]}, expected)

        def qty(depot: str, material: str) -> Decimal:
            return Decimal(next(row["quantity"] for row in request("GET", f"/stock?depot_id={depot}") if row["material_id"] == material))

        request("POST", "/opening", {"depot_id": main_id, "material_id": material_id, "quantity": "10.5"}, 201)
        request("POST", "/opening", {"depot_id": main_id, "material_id": material2_id, "quantity": "6"}, 201)
        # Multi-line load main -> vehicle in one go.
        transfer(main_id, vehicle_id, [(material_id, "4"), (material2_id, "5")])
        # Return part of it back (vehicle -> main).
        transfer(vehicle_id, main_id, [(material_id, "1.5")])
        # All-or-nothing: the second line overdraws, so the first must not move either.
        transfer(main_id, vehicle_id, [(material_id, "1"), (material2_id, "99")], 409)
        assert qty(main_id, material_id) == Decimal("8"), qty(main_id, material_id)
        assert qty(vehicle_id, material_id) == Decimal("2.5")
        assert qty(main_id, material2_id) == Decimal("1") and qty(vehicle_id, material2_id) == Decimal("5")
        # Direction rules: no vehicle->vehicle, no main->main; fractions beyond one decimal are refused.
        transfer(vehicle_id, vehicle_id, [(material_id, "1")], 400)
        transfer(main_id, main_id, [(material_id, "1")], 400)
        transfer(main_id, vehicle_id, [(material_id, "0.25")], 422)
        # The direct "use at store" path no longer exists: stock only leaves via work-order completion.
        assert session.post(f"{API}/retail-stock/use", json={}, timeout=15).status_code in (404, 405)
        movements = request("GET", "/movements")
        assert len([row for row in movements if row["material_name"].startswith("SMOKE test malzemesi")]) == 5, [m["kind"] for m in movements]
        print("PASS: opening -> atomic multi-line transfer both ways; all-or-nothing on overdraft; direction/decimal rules; no direct use endpoint")
    finally:
        with psycopg2.connect(db_url) as connection:
            with connection.cursor() as cursor:
                mats = [m for m in [material_id, *extra_material_ids] if m]
                if mats:
                    cursor.execute("DELETE FROM retail_movements WHERE material_id = ANY(%s::uuid[])", (mats,))
                    cursor.execute("DELETE FROM retail_balances WHERE material_id = ANY(%s::uuid[])", (mats,))
                    cursor.execute("DELETE FROM retail_materials WHERE id = ANY(%s::uuid[]) AND sku LIKE 'SMOKE%%'", (mats,))
                if vehicle_id:
                    cursor.execute("DELETE FROM retail_depots WHERE id = %s AND name = 'SMOKE Araç'", (vehicle_id,))
                if created_main and main_id:
                    cursor.execute("DELETE FROM retail_depots WHERE id = %s AND name = 'SMOKE Ana Depo'", (main_id,))
        print("Temporary smoke-test rows removed; existing OKUR stores and users untouched")


if __name__ == "__main__":
    main()
