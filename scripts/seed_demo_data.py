"""DENEME verisi: 2 kullanıcı + 2 cep depo + rastgele ama mantıklı stok.

Yalnızca yerel OKUR API'si üzerinden, yönetici hesabıyla çalışır; her adım tekrar
çalıştırmaya güvenlidir (olanı atlar). Stok hareketlerine "DENEME-STOK" referansı
yazılır. Deneme kullanıcılarının giriş bilgileri `local-data/deneme-kullanicilar.txt`
dosyasına yazılır (Git'e girmez).

    python scripts/seed_demo_data.py
"""

from __future__ import annotations

import random
import secrets
import string
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8001/api/v1"
ADMIN_FILE = ROOT / "local-data" / "dev-admin.txt"
OUT_FILE = ROOT / "local-data" / "deneme-kullanicilar.txt"
REFERENCE = "DENEME-STOK"
USERS = [
    {"name": "Deneme Kullanıcı 1", "phone": "5550000001", "plate": "34 DNM 001", "depot": "Deneme Cep Depo 1"},
    {"name": "Deneme Kullanıcı 2", "phone": "5550000002", "plate": "34 DNM 002", "depot": "Deneme Cep Depo 2"},
]


def demo_quantity(material: dict, rng: random.Random) -> float:
    """Birime ve fiyata göre makul bir açılış miktarı (tam veya .5)."""
    unit = (material.get("unit") or "adet").lower()
    price = float(material["unit_price"]) if material.get("unit_price") else None
    if unit == "metre":
        return float(rng.choice([20, 30, 40, 50, 60, 80, 100, 120, 150, 200]))
    if unit == "kg":
        return rng.choice([4, 5, 8, 10, 12.5, 15, 20, 25, 30, 40])
    if unit == "litre":
        return float(rng.choice([10, 20, 30]))
    if unit == "set":
        return float(rng.choice([3, 4, 5, 6, 8, 10]))
    if price is None or price < 5:
        return float(rng.randint(40, 150))
    if price < 25:
        return float(rng.randint(20, 80))
    if price < 100:
        return float(rng.randint(10, 40))
    if price < 500:
        return float(rng.randint(4, 15))
    return float(rng.randint(1, 5))


def main() -> None:
    admin = dict(line.split(": ", 1) for line in ADMIN_FILE.read_text(encoding="utf-8").splitlines() if ": " in line)
    session = requests.Session()
    login = session.post(f"{API}/auth/login", data={"username": admin["E-posta"], "password": admin["Geçici parola"]}, timeout=20)
    login.raise_for_status()
    session.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

    def call(method, path, payload=None, expected=(200, 201)):
        response = session.request(method, f"{API}{path}", json=payload, timeout=30)
        if response.status_code not in expected:
            raise SystemExit(f"{method} {path} -> {response.status_code}: {response.text[:200]}")
        return response.json() if response.content else None

    rng = random.Random(20261012)
    depots = call("GET", "/retail-stock/depots")
    main_depot = next((d for d in depots if d["kind"] == "main"), None)
    if not main_depot:
        raise SystemExit("Önce Depo & Stok ekranından ana depoyu oluşturun.")

    # 1) Kullanıcılar: ilk girişte parola değiştirme zorunluluğunu geçici parolayla kapatıp
    #    kalıcı deneme parolasını atar.
    existing_staff = {s["name"]: s["id"] for s in call("GET", "/retail-stock/staff")}
    lines = []
    user_ids = {}
    for spec in USERS:
        if spec["name"] in existing_staff:
            user_ids[spec["name"]] = existing_staff[spec["name"]]
            lines.append(f"{spec['name']}: kullanıcı zaten vardı (parola değiştirilmedi)")
            continue
        temporary = "Gecici!" + "".join(secrets.choice(string.digits) for _ in range(6))
        final = "Deneme" + "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8)) + "!"
        created = call("POST", "/auth/users", {"password": temporary, "full_name": spec["name"], "phone": spec["phone"], "roles": ["user"]})
        r = requests.post(f"{API}/auth/complete-password-reset", json={"email": spec["phone"], "temporary_password": temporary, "new_password": final}, timeout=20)
        r.raise_for_status()
        user_ids[spec["name"]] = created["id"]
        lines.append(f"{spec['name']} | giriş: {spec['phone']} | parola: {final}")

    # 2) Cep depolar
    cep = {}
    for spec in USERS:
        depot = next((d for d in depots if d["plate"] == spec["plate"]), None)
        if not depot:
            depot = call("POST", "/retail-stock/depots", {"kind": "vehicle", "name": spec["depot"], "plate": spec["plate"], "assigned_user_id": user_ids[spec["name"]]})
        cep[spec["plate"]] = depot

    # 3) Ana depo açılış stoğu (yalnızca bakiyesi 0 olanlara)
    stock = call("GET", f"/retail-stock/stock?depot_id={main_depot['id']}")
    opened = 0
    for row in stock:
        if float(row["quantity"]) > 0:
            continue
        quantity = demo_quantity(row, rng)
        call("POST", "/retail-stock/opening", {"depot_id": main_depot["id"], "material_id": row["material_id"], "quantity": str(quantity),
                                                "reference_no": REFERENCE, "note": "Deneme stoğu (rastgele)"})
        opened += 1
    main_rows = call("GET", f"/retail-stock/stock?depot_id={main_depot['id']}")
    stock = {row["material_id"]: float(row["quantity"]) for row in main_rows}
    units = {row["material_id"]: (row["unit"] or "adet").lower() for row in main_rows}

    # 4) Cep depolara yükleme (yalnızca boş cep depolara)
    loaded = {}
    material_ids = [m for m, q in stock.items() if q >= 2]
    for plate, depot in cep.items():
        if any(float(r["quantity"]) > 0 for r in call("GET", f"/retail-stock/stock?depot_id={depot['id']}")):
            loaded[plate] = "zaten stoklu"
            continue
        picked = rng.sample(material_ids, k=min(70, len(material_ids)))
        lines = []
        for material_id in picked:
            share = stock[material_id] * rng.uniform(0.15, 0.35)
            # Adet/set tam sayı; metre, kg gibi ölçü birimleri 0,5 adımla.
            quantity = float(max(1, round(share))) if units[material_id] in {"adet", "set"} else max(0.5, round(share * 2) / 2)
            if quantity > stock[material_id]:
                continue
            stock[material_id] -= quantity
            lines.append({"material_id": material_id, "quantity": str(quantity)})
        call("POST", "/retail-stock/transfer", {"source_depot_id": main_depot["id"], "target_depot_id": depot["id"], "lines": lines,
                                                 "reference_no": REFERENCE, "note": "Deneme yüklemesi"})
        loaded[plate] = "zaten stoklu"
            continue
        picked = rng.sample(material_ids, k=min(70, len(material_ids)))
        for material_id in picked:
            share = stock[material_id] * rng.uniform(0.15, 0.35)
            # Adet/set tam sayı; metre, kg gibi ölçü birimleri 0,5 adımla.
            quantity = float(max(1, round(share))) if units[material_id] in {"adet", "set"} else max(0.5, round(share * 2) / 2)
            if quantity > stock[material_id]:
                continue
            call("POST", "/retail-stock/load", {"source_depot_id": main_depot["id"], "target_depot_id": depot["id"], "material_id": material_id,
                                                  "quantity": str(quantity), "reference_no": REFERENCE, "note": "Deneme yüklemesi"})
            stock[material_id] -= quantity
        loaded[plate] = f"{len(picked)} kalem"

    if any("parola:" in line for line in lines):
        OUT_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Ana depoya {opened} kalem açılış stoğu yazıldı. Cep depolar: {loaded}")
    print("Kullanıcı bilgileri:", OUT_FILE if OUT_FILE.exists() else "(yeni kullanıcı oluşmadı)")


if __name__ == "__main__":
    main()
