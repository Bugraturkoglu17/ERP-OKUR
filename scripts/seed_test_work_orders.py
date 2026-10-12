"""Yerel test için 30 deneme iş emri (başlıkları "[DENEME]" ile başlar).

İş emirleri yerel OKUR API'si üzerinden açılır ve test saha kullanıcılarına
(scripts/create_test_users.py) atanır. İstatistik ekranında anlamlı bir tablo
oluşması için tarihler son 8 haftaya yayılır ve bir kısmı doğrudan yerel
veritabanında "devam ediyor", "tamamlandı" veya "iptal" durumuna çekilir.
Bu kestirme yol fotoğraf ve stok düşümü adımlarını atlar; yalnızca deneme
verisi içindir. Zaten deneme iş emri varsa hiçbir şey yapmaz.

    apps/backend/.venv/Scripts/python scripts/seed_test_work_orders.py
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import requests


ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8001/api/v1"
ADMIN_FILE = ROOT / "local-data" / "dev-admin.txt"
ENV_FILE = ROOT / "apps" / "backend" / ".env"
PREFIX = "[DENEME] "
TEST_PLATES = {"34 TST 001", "34 TST 002", "34 TST 003"}
JOBS = {
    "fault": ["Klima arızası", "Soğutucu reyon ısınıyor", "Kompresör çalışmıyor", "Gaz kaçağı kontrolü", "Fan motoru arızası"],
    "renovation": ["Periyodik bakım", "Filtre değişimi", "Split klima yer değişikliği", "Bakır boru yenileme"],
    "manufacturing": ["Yeni reyon montajı", "Soğuk oda kurulumu", "VRF sistem montajı"],
}
# (durum, adet): planned = planlanacak, started = devam ediyor
PLAN = [("completed", 13), ("started", 8), ("planned", 6), ("cancelled", 3)]


def main() -> None:
    rng = random.Random(20261012)
    admin = dict(line.split(": ", 1) for line in ADMIN_FILE.read_text(encoding="utf-8").splitlines() if ": " in line)
    session = requests.Session()
    login = session.post(f"{API}/auth/login", data={"username": admin["E-posta"], "password": admin["Geçici parola"]}, timeout=20)
    login.raise_for_status()
    session.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

    def call(method: str, path: str, payload: dict | None = None, params: dict | None = None):
        response = session.request(method, f"{API}{path}", json=payload, params=params, timeout=30)
        if response.status_code not in (200, 201):
            raise SystemExit(f"{method} {path} -> {response.status_code}: {response.text[:300]}")
        return response.json()

    if any(order["title"].startswith(PREFIX) for order in call("GET", "/work-orders")):
        raise SystemExit("Deneme iş emirleri zaten var; tekrar eklenmedi.")

    depots = [d for d in call("GET", "/retail-stock/depots") if d["kind"] == "vehicle" and d.get("plate") in TEST_PLATES and d.get("assigned_user_id")]
    if not depots:
        raise SystemExit("Önce scripts/create_test_users.py çalıştırın.")
    stores = call("GET", "/projects", params={"limit": 400, "skip": rng.randint(0, 3000)})

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    updates = []
    for status, count in PLAN:
        for _ in range(count):
            work_type = rng.choice(["fault"] * 5 + ["renovation"] * 3 + ["manufacturing"] * 2)
            store = rng.choice(stores)
            depot = rng.choice(depots)
            priority = rng.choice(["normal"] * 5 + ["urgent"] * 3 + ["critical"] * 2)
            created_at = now - timedelta(days=rng.randint(1, 54), hours=rng.randint(0, 9))
            if status in ("planned", "started"):
                # Açık işlerin dörtte biri termini geçmiş, kalanı önümüzdeki günlerde.
                due = now - timedelta(days=rng.randint(1, 5)) if rng.random() < 0.25 else now + timedelta(days=rng.randint(1, 12))
            else:
                due = created_at + timedelta(days=rng.randint(3, 21))
            created = call("POST", "/work-orders", {
                "project_id": store["id"], "work_type": work_type, "title": PREFIX + rng.choice(JOBS[work_type]),
                "description": "Deneme amaçlı oluşturulmuş iş emri.", "assigned_to_user_id": depot["assigned_user_id"],
                "stock_depot_id": depot["id"], "priority": priority, "due_date": due.date().isoformat(),
            })
            started_at = completed_at = None
            updated_at = created_at
            if status in ("started", "completed"):
                started_at = created_at + timedelta(hours=rng.randint(2, 48))
                updated_at = min(started_at + timedelta(hours=rng.randint(1, 30)), now)
            if status == "completed":
                completed_at = updated_at = min(started_at + timedelta(days=rng.randint(0, 9), hours=rng.randint(1, 8)), now)
            if status == "cancelled":
                updated_at = min(created_at + timedelta(days=rng.randint(1, 5)), now)
            updates.append((status, created_at, updated_at, started_at, completed_at, due, created["id"]))

    url = next(line.split("=", 1)[1] for line in ENV_FILE.read_text(encoding="utf-8").splitlines() if line.startswith("DATABASE_URL="))
    url = url.replace("postgresql+psycopg2://", "postgresql://").replace("postgresql+asyncpg://", "postgresql://")
    with psycopg2.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select current_database()")
        if cur.fetchone()[0] != "okur_erp_local":
            raise SystemExit("Yalnızca okur_erp_local veritabanında çalışır.")
        for status, created_at, updated_at, started_at, completed_at, due, order_id in updates:
            cur.execute(
                "update work_orders set status = case when %s = 'planned' then status else %s end, created_at = %s, updated_at = %s,"
                " started_at = %s, completed_at = %s, due_date = %s where id = %s and title like %s",
                (status, status, created_at, updated_at, started_at, completed_at, due, order_id, PREFIX + "%"),
            )
    summary = {status: count for status, count in PLAN}
    print(f"{len(updates)} deneme iş emri eklendi: {summary}")


if __name__ == "__main__":
    main()
