"""Yerel deneme verisini genişletir: 45 ek iş emri ve 8 kurulum projesi.

scripts/seed_test_work_orders.py ile aynı yolu izler: kayıtlar yerel OKUR API'si
üzerinden açılır, sonra tarihleri ve durumları yerel veritabanında geriye çekilir
(fotoğraf, stok düşümü ve aşama koşulları atlanır; yalnızca deneme verisidir).
Başlıklar "[DENEME]" ile başlar. İkinci kez çalıştırılırsa hiçbir şey eklemez.

    apps/backend/.venv/Scripts/python scripts/seed_more_demo_data.py
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
MARKER = "Deneme amaçlı ek iş emri."
TEST_PLATES = {"34 TST 001", "34 TST 002", "34 TST 003"}
JOBS = {
    "fault": [
        "Sütlük reyonu soğutmuyor", "Donuk dolap buz yapıyor", "Kondenser fanı sesli çalışıyor", "Soğuk oda kapı fitili arızası",
        "Kasa önü klima su akıtıyor", "Pano sigortası atıyor", "Evaporatör karlanması", "Genleşme valfi arızası",
        "Dijital termostat hatası", "Merkezi sistem alçak basınç alarmı",
    ],
    "renovation": [
        "Reyon dolabı yer değişikliği", "Soğuk oda panel yenileme", "Dış ünite kaide değişimi", "Drenaj hattı yenileme",
        "Mevsimlik genel bakım", "Aydınlatma LED dönüşümü", "Kanal tipi klima temizliği",
    ],
}
ORDER_PLAN = [("completed", 20), ("started", 11), ("planned", 10), ("cancelled", 4)]

# (ad, tür, tamamlanan aşama sayısı 0-9, başlangıç kaç gün önce, bütçe)
PROJECTS = [
    ("Yeni mağaza soğutma kurulumu", "market", 0, 4, "1850000"),
    ("Şarküteri reyonu yenileme", "market", 2, 18, "640000"),
    ("Donuk muhafaza odası", "soguk_oda", 3, 26, "920000"),
    ("Meyve sebze soğuk odası", "soguk_oda", 4, 35, "715000"),
    ("Merkezi soğutma grubu değişimi", "sogutma", 5, 44, "2400000"),
    ("Depo soğutma sistemi", "sogutma", 6, 58, "1320000"),
    ("Et reyonu soğuk oda kurulumu", "soguk_oda", 8, 72, "560000"),
    ("Market açılış soğutma projesi", "market", 9, 96, "1980000"),
]
COST_CATEGORIES = ["montaj_iscilik", "nakliye", "urun", "ek"]
COST_SHARE = {"montaj_iscilik": 0.18, "nakliye": 0.04, "urun": 0.55, "ek": 0.03}


def main() -> None:
    rng = random.Random(20261115)
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

    depots = [d for d in call("GET", "/retail-stock/depots") if d["kind"] == "vehicle" and d.get("plate") in TEST_PLATES and d.get("assigned_user_id")]
    if not depots:
        raise SystemExit("Önce scripts/create_test_users.py çalıştırın.")
    field_users = [d["assigned_user_id"] for d in depots]
    stores = call("GET", "/projects", params={"limit": 400, "skip": rng.randint(0, 3000)})
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # --- İş emirleri ---
    order_updates = []
    if any((order.get("description") or "") == MARKER for order in call("GET", "/work-orders")):
        print("Ek deneme iş emirleri zaten var; atlandı.")
    else:
        for status, count in ORDER_PLAN:
            for _ in range(count):
                work_type = rng.choice(["fault"] * 6 + ["renovation"] * 4)
                depot = rng.choice(depots)
                created_at = now - timedelta(days=rng.randint(1, 54), hours=rng.randint(0, 9))
                if status in ("planned", "started"):
                    due = now - timedelta(days=rng.randint(1, 6)) if rng.random() < 0.2 else now + timedelta(days=rng.randint(1, 14))
                else:
                    due = created_at + timedelta(days=rng.randint(3, 21))
                created = call("POST", "/work-orders", {
                    "project_id": rng.choice(stores)["id"], "work_type": work_type, "title": PREFIX + rng.choice(JOBS[work_type]),
                    "description": MARKER, "assigned_to_user_id": depot["assigned_user_id"], "stock_depot_id": depot["id"],
                    "priority": rng.choice(["normal"] * 5 + ["urgent"] * 3 + ["critical"] * 2), "due_date": due.date().isoformat(),
                })
                started_at = completed_at = None
                updated_at = created_at
                if status in ("started", "completed"):
                    started_at = created_at + timedelta(hours=rng.randint(2, 48))
                    updated_at = min(started_at + timedelta(hours=rng.randint(1, 30)), now)
                if status == "completed":
                    completed_at = updated_at = min(started_at + timedelta(days=rng.randint(0, 8), hours=rng.randint(1, 8)), now)
                if status == "cancelled":
                    updated_at = min(created_at + timedelta(days=rng.randint(1, 5)), now)
                order_updates.append((status, created_at, updated_at, started_at, completed_at, due, created["id"]))

    # --- Kurulum projeleri ---
    existing = {project["name"] for status in ("active", "completed") for project in call("GET", "/installation-projects", params={"status": status})}
    project_updates = []
    for name, project_type, done, days_ago, budget in PROJECTS:
        full_name = PREFIX + name
        if full_name in existing:
            continue
        start = now - timedelta(days=days_ago)
        target = start + timedelta(days=rng.randint(45, 110))
        members = rng.sample(field_users, k=min(len(field_users), rng.randint(1, 3)))
        created = call("POST", "/installation-projects", {
            "name": full_name, "store_id": rng.choice(stores)["id"], "description": "Deneme amaçlı oluşturulmuş proje.",
            "target_date": target.date().isoformat(), "budget": budget, "project_type": project_type, "member_user_ids": members,
        })
        project_id = created["id"]
        base = float(budget)
        call("PUT", f"/installation-projects/{project_id}/costs", {"kind": "target", "items": [
            {"category": c, "amount": str(round(base * COST_SHARE[c], -2)), "description": "Vinç ve iskele" if c == "ek" else None} for c in COST_CATEGORIES]})
        if done >= 4:
            for index in range(rng.randint(1, 3)):
                call("POST", f"/installation-projects/{project_id}/production-numbers", {"number": f"UR-2026-{rng.randint(1000, 9999)}-{index + 1}"})
        if done >= 5:
            call("PUT", f"/installation-projects/{project_id}/costs", {"kind": "actual", "items": [
                {"category": c, "amount": str(round(base * COST_SHARE[c] * rng.uniform(0.85, 1.2) * min(done / 8, 1), -2)),
                 "description": "Vinç kiralama" if c == "ek" else None} for c in COST_CATEGORIES]})
        project_updates.append((project_id, done, start, rng.choice(field_users)))

    url = next(line.split("=", 1)[1] for line in ENV_FILE.read_text(encoding="utf-8").splitlines() if line.startswith("DATABASE_URL="))
    url = url.replace("postgresql+psycopg2://", "postgresql://").replace("postgresql+asyncpg://", "postgresql://")
    with psycopg2.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select current_database()")
        if cur.fetchone()[0] != "okur_erp_local":
            raise SystemExit("Yalnızca okur_erp_local veritabanında çalışır.")
        for status, created_at, updated_at, started_at, completed_at, due, order_id in order_updates:
            cur.execute(
                "update work_orders set status = case when %s = 'planned' then status else %s end, created_at = %s, updated_at = %s,"
                " started_at = %s, completed_at = %s, due_date = %s where id = %s and title like %s",
                (status, status, created_at, updated_at, started_at, completed_at, due, order_id, PREFIX + "%"),
            )
        for project_id, done, start, responsible in project_updates:
            span = max((now - start) / max(done + 1, 1), timedelta(hours=6))
            finished = start + span * done
            cur.execute("update installation_projects set start_date = %s, created_at = %s, updated_at = %s where id = %s and name like %s",
                        (start, start, min(finished, now), project_id, PREFIX + "%"))
            for order in range(1, 10):
                begin = start + span * (order - 1)
                if order <= done:
                    values = ("completed", begin, begin + span, begin + span)
                elif order == done + 1:
                    values = ("in_progress", begin, None, begin + span + timedelta(days=5))
                else:
                    values = ("planned", None, None, begin + span + timedelta(days=5))
                cur.execute(
                    "update installation_project_stages set status = %s, started_at = %s, completed_at = %s, planned_end = %s,"
                    " responsible_user_id = coalesce(responsible_user_id, %s) where project_id = %s and stage_order = %s",
                    (*values, responsible, project_id, order),
                )
            cur.execute(
                "update installation_project_checklist_items set is_done = true, done_at = s.completed_at from installation_project_stages s"
                " where installation_project_checklist_items.stage_id = s.id and s.project_id = %s and s.status = 'completed'",
                (project_id,),
            )
            if done >= 9:
                cur.execute("update installation_projects set status = 'completed', completed_at = %s where id = %s", (min(finished, now), project_id))
    print(f"{len(order_updates)} iş emri ve {len(project_updates)} proje eklendi.")


if __name__ == "__main__":
    main()
