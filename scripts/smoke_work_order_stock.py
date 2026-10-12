"""Exercise the work-order completion -> cep depo stock flow, then remove only this script's rows.

Covers: mandatory depot/assignee on create, depot must belong to the assignee,
nothing leaves stock while the job is open, the planned material list,
completion blocked without a service form and rolled back atomically on
shortage, automatic deduction + manager notification on completion, idempotent
completion, reassignment moving the depot, delete guard, and a concurrent race.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
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
PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x9a\xa0\xa0\x00\x00\x00\x00IEND\xaeB`\x82")


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
    if login.status_code != 200 or login.json().get("force_password_change"):
        raise RuntimeError("Local admin login unavailable or needs password change; nothing changed")
    session.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

    def call(method: str, path: str, payload: dict | None = None, expected: int = 200, **kwargs):
        response = session.request(method, f"{API}{path}", json=payload, timeout=30, **kwargs)
        if response.status_code != expected:
            raise AssertionError(f"{method} {path}: expected {expected}, got {response.status_code}: {response.text[:300]}")
        return response.json() if response.content else None

    suffix = uuid4().hex[:8].upper()
    created = {"main": False, "user_a": None, "user_b": None, "manager": None, "depot": None, "depot_b": None, "material": None, "material2": None}
    work_order_ids: list[str] = []
    main_id = None

    def stock_of(depot_id: str, material_id: str) -> Decimal:
        rows = call("GET", f"/retail-stock/stock?depot_id={depot_id}")
        return Decimal(next(row["quantity"] for row in rows if row["material_id"] == material_id))

    def upload_form(order_id: str) -> None:
        call("POST", f"/work-orders/{order_id}/service-forms", expected=201,
             files={"file": ("servis-formu.png", PNG, "image/png")})

    def complete(order_id: str, expected: int = 200):
        call("POST", f"/work-orders/{order_id}/photos", expected=201,
             files={"file": ("bitis.png", PNG, "image/png")}, data={"photo_type": "completion"})
        return call("PATCH", f"/work-orders/{order_id}", {"status": "completed"}, expected)

    try:
        with psycopg2.connect(db_url, options="-c default_transaction_read_only=on") as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT id FROM projects WHERE tenant_id = (SELECT id FROM tenants WHERE name = %s) LIMIT 1", ("Okur Yerel",))
                project_id = str(cursor.fetchone()[0])

        depots = call("GET", "/retail-stock/depots")
        main_depot = next((d for d in depots if d["kind"] == "main"), None)
        if main_depot is None:
            main_depot = call("POST", "/retail-stock/depots", {"kind": "main", "name": "SMOKE Ana Depo"}, 201)
            created["main"] = True
        main_id = main_depot["id"]

        phones: dict[str, str] = {}

        def make_user(label: str, role: str = "user") -> str:
            digits = f"5{int(uuid4().int % 10**9):09d}"
            body = {"password": "SmokeTest!234", "full_name": f"SMOKE {label} {suffix}", "phone": digits, "roles": [role]}
            phones[label] = digits
            return call("POST", "/auth/users", body, 201)["id"]

        created["user_a"], created["user_b"] = make_user("a"), make_user("b")
        created["manager"] = make_user("mgr", "manager")
        created["depot"] = call("POST", "/retail-stock/depots", {
            "kind": "vehicle", "name": "SMOKE Cep Depo", "plate": f"98 {suffix}", "assigned_user_id": created["user_a"]}, 201)["id"]
        created["depot_b"] = call("POST", "/retail-stock/depots", {
            "kind": "vehicle", "name": "SMOKE Cep Depo B", "plate": f"97 {suffix}", "assigned_user_id": created["user_b"]}, 201)["id"]
        created["material"] = call("POST", "/retail-stock/materials", {
            "sku": f"SMOKE-WO-{suffix}", "name": "SMOKE boru", "unit": "metre"}, 201)["id"]
        created["material2"] = call("POST", "/retail-stock/materials", {
            "sku": f"SMOKE-W2-{suffix}", "name": "SMOKE tüp", "unit": "adet"}, 201)["id"]
        for material_id, quantity in ((created["material"], "20"), (created["material2"], "10")):
            call("POST", "/retail-stock/opening", {"depot_id": main_id, "material_id": material_id, "quantity": quantity}, 201)
            call("POST", "/retail-stock/transfer", {"source_depot_id": main_id, "target_depot_id": created["depot"], "lines": [
                {"material_id": material_id, "quantity": "10" if material_id == created["material"] else "5"}]}, 201)
        M1, M2 = created["material"], created["material2"]

        # 0) Field workers cannot manage stock: no entries, no catalog items, no vehicles, no loads.
        requests.post(f"{API}/auth/complete-password-reset", timeout=20, json={
            "email": phones["a"], "temporary_password": "SmokeTest!234", "new_password": "SmokeTest!2345"}).raise_for_status()
        worker = requests.post(f"{API}/auth/login", data={"username": phones["a"], "password": "SmokeTest!2345"}, timeout=20).json()
        wh = {"Authorization": f"Bearer {worker['access_token']}"}
        def as_worker(method: str, path: str, payload: dict | None, want: int):
            response = requests.request(method, f"{API}{path}", headers=wh, json=payload, timeout=30)
            assert response.status_code == want, f"worker {method} {path}: expected {want}, got {response.status_code}"
        as_worker("POST", "/retail-stock/opening", {"depot_id": main_id, "material_id": M1, "quantity": "1"}, 403)
        as_worker("POST", "/retail-stock/materials", {"sku": "SMOKE-NO", "name": "Yetkisiz malzeme"}, 403)
        as_worker("POST", "/retail-stock/depots", {"kind": "vehicle", "name": "Yetkisiz arac", "plate": "34 ZZ 999"}, 403)
        as_worker("POST", "/retail-stock/transfer", {"source_depot_id": main_id, "target_depot_id": created["depot"], "lines": [{"material_id": M1, "quantity": "1"}]}, 403)
        as_worker("GET", f"/retail-stock/stock?depot_id={created['depot']}", None, 200)
        as_worker("GET", f"/retail-stock/stock?depot_id={created['depot_b']}", None, 403)
        assert "unit_price" not in requests.get(f"{API}/retail-stock/materials?limit=1", headers=wh, timeout=30).json()[0]
        # The worker sees the main depot only as a return target (no stock view) and can return from their own vehicle.
        worker_depots = requests.get(f"{API}/retail-stock/depots", headers=wh, timeout=30).json()
        assert {d["kind"] for d in worker_depots} == {"main", "vehicle"} and all(d["kind"] == "main" or d["id"] == created["depot"] for d in worker_depots)
        as_worker("GET", f"/retail-stock/stock?depot_id={main_id}", None, 403)
        as_worker("POST", "/retail-stock/transfer", {"source_depot_id": created["depot"], "target_depot_id": main_id, "lines": [{"material_id": M1, "quantity": "1"}]}, 201)
        as_worker("POST", "/retail-stock/transfer", {"source_depot_id": created["depot_b"], "target_depot_id": main_id, "lines": [{"material_id": M1, "quantity": "1"}]}, 403)
        call("POST", "/retail-stock/transfer", {"source_depot_id": main_id, "target_depot_id": created["depot"], "lines": [{"material_id": M1, "quantity": "1"}]}, 201)

        def order_body(title: str, assignee: str | None, depot_id: str | None) -> dict:
            body = {"project_id": project_id, "work_type": "fault", "title": f"SMOKE {title} {suffix}"}
            if assignee: body["assigned_to_user_id"] = assignee
            if depot_id: body["stock_depot_id"] = depot_id
            return body

        # 1) Creation: depot and assignee mandatory, depot must belong to the assignee.
        call("POST", "/work-orders", order_body("no-depot", created["user_a"], None), 422)
        call("POST", "/work-orders", order_body("no-user", None, created["depot"]), 422)
        call("POST", "/work-orders", order_body("wrong-user", created["user_b"], created["depot"]), 400)

        # 2) A new order touches no stock.
        order = call("POST", "/work-orders", order_body("main", created["user_a"], created["depot"]), 201)
        oid = order["id"]
        work_order_ids.append(oid)
        assert order["stock_depot_id"] == created["depot"]
        assert stock_of(created["depot"], M1) == Decimal("10")

        # 3) Planned material list: saved, replaceable, nothing deducted yet.
        saved = call("PUT", f"/work-orders/{oid}/materials", {"materials": [
            {"material_id": M1, "quantity": "3.5"}, {"material_id": M2, "quantity": "1"}]}, 200)
        assert {row["status"] for row in saved} == {"planned"} and len(saved) == 2
        saved = call("PUT", f"/work-orders/{oid}/materials", {"materials": [
            {"material_id": M1, "quantity": "3.5"}, {"material_id": M2, "quantity": "9"}]}, 200)
        assert stock_of(created["depot"], M1) == Decimal("10")
        call("PUT", f"/work-orders/{oid}/materials", {"materials": [{"material_id": M1, "quantity": "0"}]}, 422)
        # Quantities are whole or one decimal: 0.25 / 0.05 are refused everywhere.
        call("PUT", f"/work-orders/{oid}/materials", {"materials": [{"material_id": M1, "quantity": "0.25"}]}, 422)
        call("POST", "/retail-stock/opening", {"depot_id": main_id, "material_id": M1, "quantity": "0.05"}, 422)
        call("POST", "/retail-stock/opening", {"depot_id": main_id, "material_id": M1, "quantity": "0.5"}, 201)
        call("POST", "/retail-stock/transfer", {"source_depot_id": main_id, "target_depot_id": created["depot"], "lines": [{"material_id": M1, "quantity": "0.005"}]}, 422)

        # 4) Completion needs the service form; failure changes nothing.
        call("POST", f"/work-orders/{oid}/photos", expected=201, files={"file": ("bitis.png", PNG, "image/png")}, data={"photo_type": "completion"})
        call("PATCH", f"/work-orders/{oid}", {"status": "started"}, 200)
        call("PATCH", f"/work-orders/{oid}", {"status": "completed"}, 400)
        # 5) Wrong file kind is rejected, a real form is accepted and listed.
        call("POST", f"/work-orders/{oid}/service-forms", expected=400, files={"file": ("x.txt", b"abc", "text/plain")})
        upload_form(oid)
        assert len(call("GET", f"/work-orders/{oid}/service-forms")) == 1

        # 6) Shortage (tüp 9 > 5): completion aborts atomically, stock and status untouched.
        call("PATCH", f"/work-orders/{oid}", {"status": "completed"}, 409)
        assert stock_of(created["depot"], M1) == Decimal("10") and stock_of(created["depot"], M2) == Decimal("5")
        assert call("GET", f"/work-orders/{oid}")["status"] == "started"

        # 7) Fix the list, complete: stock leaves the depot automatically, once.
        call("PUT", f"/work-orders/{oid}/materials", {"materials": [
            {"material_id": M1, "quantity": "3.5"}, {"material_id": M2, "quantity": "2"}]}, 200)
        call("PATCH", f"/work-orders/{oid}", {"status": "completed"}, 200)
        assert stock_of(created["depot"], M1) == Decimal("6.5") and stock_of(created["depot"], M2) == Decimal("3")
        lines = call("GET", f"/work-orders/{oid}/materials")
        assert {row["status"] for row in lines} == {"issued"} and all(row["issued_at"] for row in lines)
        call("PATCH", f"/work-orders/{oid}", {"status": "completed"}, 200)
        assert stock_of(created["depot"], M1) == Decimal("6.5"), "second completion deducted again"
        call("PUT", f"/work-orders/{oid}/materials", {"materials": [{"material_id": M1, "quantity": "1"}]}, 409)

        # 8) Manager audit: movements name the work order; managers got a notification.
        movements = call("GET", "/retail-stock/movements?limit=200")
        used = [m for m in movements if m["kind"] == "use" and m.get("work_order_title") == f"SMOKE main {suffix}"]
        assert len(used) == 2, used
        with psycopg2.connect(db_url, options="-c default_transaction_read_only=on") as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT body FROM notifications WHERE category = 'work_order_stock_deducted' AND work_order_id = %s AND user_id = %s",
                               (oid, created["manager"]))
                bodies = [row[0] for row in cursor.fetchall()]
                assert len(bodies) == 1 and "SMOKE boru 3,5 metre" in bodies[0] and "SMOKE tüp 2 adet" in bodies[0], bodies

        # 9) Guards: delete refused once stock moved; reassignment of a completed order refused.
        call("DELETE", f"/work-orders/{oid}", None, 409)
        call("PATCH", f"/work-orders/{oid}", {"assigned_to_user_id": created["user_b"]}, 409)

        # 9b) An open order with only planned (not yet issued) lines can be deleted.
        deletable = call("POST", "/work-orders", order_body("deletable", created["user_a"], created["depot"]), 201)
        call("PUT", f"/work-orders/{deletable['id']}/materials", {"materials": [{"material_id": M1, "quantity": "1"}]}, 200)
        call("DELETE", f"/work-orders/{deletable['id']}", None, 204)

        # 10) Reassigning an open order moves it (and its planned list) to the new person's depot.
        second = call("POST", "/work-orders", order_body("reassign", created["user_a"], created["depot"]), 201)
        work_order_ids.append(second["id"])
        call("PUT", f"/work-orders/{second['id']}/materials", {"materials": [{"material_id": M1, "quantity": "1"}]}, 200)
        moved = call("PATCH", f"/work-orders/{second['id']}", {"assigned_to_user_id": created["user_b"]}, 200)
        assert moved["stock_depot_id"] == created["depot_b"]
        assert call("GET", f"/work-orders/{second['id']}/materials")[0]["depot_id"] == created["depot_b"]
        call("PATCH", f"/work-orders/{second['id']}", {"status": "cancelled"}, 200)
        assert stock_of(created["depot_b"], M1) == Decimal("0")

        # 11) Race: stock 6.5, two orders each completing 5 -> exactly one wins.
        racers = []
        for index in (1, 2):
            racer = call("POST", "/work-orders", order_body(f"race{index}", created["user_a"], created["depot"]), 201)
            work_order_ids.append(racer["id"])
            call("PUT", f"/work-orders/{racer['id']}/materials", {"materials": [{"material_id": M1, "quantity": "5"}]}, 200)
            call("PATCH", f"/work-orders/{racer['id']}", {"status": "started"}, 200)
            upload_form(racer["id"])
            call("POST", f"/work-orders/{racer['id']}/photos", expected=201, files={"file": ("b.png", PNG, "image/png")}, data={"photo_type": "completion"})
            racers.append(racer["id"])

        def attempt(order_id: str) -> int:
            return requests.patch(f"{API}/work-orders/{order_id}", headers=session.headers, timeout=60, json={"status": "completed"}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = sorted(pool.map(attempt, racers))
        assert outcomes == [200, 409], f"race outcomes {outcomes}"
        assert stock_of(created["depot"], M1) == Decimal("1.5")
        print("PASS: workers cannot manage stock or see prices; mandatory depot/assignee; no deduction while open; planned list; service form required; "
              "shortage aborts atomically; completion deducts once + audit; guards; reassignment moves depot; race safe")
    finally:
        with psycopg2.connect(db_url) as connection:
            with connection.cursor() as cursor:
                mats = [m for m in (created["material"], created["material2"]) if m]
                if mats:
                    cursor.execute("DELETE FROM work_order_materials WHERE material_id = ANY(%s::uuid[])", (mats,))
                    cursor.execute("DELETE FROM retail_movements WHERE material_id = ANY(%s::uuid[])", (mats,))
                    cursor.execute("DELETE FROM retail_balances WHERE material_id = ANY(%s::uuid[])", (mats,))
                    cursor.execute("DELETE FROM retail_materials WHERE id = ANY(%s::uuid[]) AND sku LIKE 'SMOKE-%%'", (mats,))
                if work_order_ids:
                    cursor.execute(
                        "SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc "
                        "JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name "
                        "JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name "
                        "WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'work_orders'")
                    for table, column in cursor.fetchall():
                        cursor.execute(f'DELETE FROM "{table}" WHERE "{column}" = ANY(%s::uuid[])', (work_order_ids,))
                    cursor.execute("DELETE FROM store_activities WHERE title LIKE %s", (f"%SMOKE%{suffix}%",))
                    cursor.execute("DELETE FROM work_orders WHERE id = ANY(%s::uuid[])", (work_order_ids,))
                if created["manager"]:
                    cursor.execute("DELETE FROM notifications WHERE user_id = %s", (created["manager"],))
                for key in ("depot", "depot_b"):
                    if created[key]:
                        cursor.execute("DELETE FROM retail_depots WHERE id = %s AND name LIKE 'SMOKE Cep Depo%%'", (created[key],))
                if created["main"] and main_id:
                    cursor.execute("DELETE FROM retail_depots WHERE id = %s AND name = 'SMOKE Ana Depo'", (main_id,))
        for key in ("user_a", "user_b", "manager"):
            if created[key]:
                session.delete(f"{API}/auth/users/{created[key]}", timeout=20)
        print("Temporary smoke-test rows removed; existing OKUR stores and users untouched")


if __name__ == "__main__":
    main()
