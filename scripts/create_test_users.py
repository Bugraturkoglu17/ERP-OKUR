"""Yerel test için 4 kullanıcı: 1 yönetici + 3 saha kullanıcısı.

Yalnızca yerel OKUR API'si üzerinden, geliştirici admin hesabıyla çalışır.
Saha kullanıcılarına iş emri atanabilmesi için her birine bir cep (araç) depo
açılır. Tekrar çalıştırmaya güvenlidir: olan kullanıcı/depo atlanır, parolası
değiştirilmez. Giriş bilgileri Git'e girmeyen `local-data/test-kullanicilar.txt`
dosyasına yazılır.

    apps/backend/.venv/Scripts/python scripts/create_test_users.py
"""

from __future__ import annotations

import secrets
import string
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8001/api/v1"
ADMIN_FILE = ROOT / "local-data" / "dev-admin.txt"
OUT_FILE = ROOT / "local-data" / "test-kullanicilar.txt"
USERS = [
    {"name": "Test Yönetici", "phone": "5551110001", "email": "yonetici@example.com", "role": "manager", "plate": None},
    {"name": "Test Teknisyen 1", "phone": "5551110002", "email": "teknisyen1@example.com", "role": "user", "plate": "34 TST 001"},
    {"name": "Test Teknisyen 2", "phone": "5551110003", "email": "teknisyen2@example.com", "role": "user", "plate": "34 TST 002"},
    {"name": "Test Depocu", "phone": "5551110004", "email": "depocu@example.com", "role": "user", "plate": "34 TST 003"},
]


def new_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Test" + "".join(secrets.choice(alphabet) for _ in range(8)) + "!"


def main() -> None:
    admin = dict(line.split(": ", 1) for line in ADMIN_FILE.read_text(encoding="utf-8").splitlines() if ": " in line)
    session = requests.Session()
    login = session.post(f"{API}/auth/login", data={"username": admin["E-posta"], "password": admin["Geçici parola"]}, timeout=20)
    login.raise_for_status()
    session.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

    def call(method: str, path: str, payload: dict | None = None):
        response = session.request(method, f"{API}{path}", json=payload, timeout=30)
        if response.status_code not in (200, 201):
            raise SystemExit(f"{method} {path} -> {response.status_code}: {response.text[:300]}")
        return response.json() if response.content else None

    existing = {user["email"]: user for user in call("GET", "/auth/users")}
    depots = call("GET", "/retail-stock/depots")
    lines = []
    for spec in USERS:
        user = existing.get(spec["email"])
        if user:
            lines.append(f"{spec['name']} | {spec['email']} | zaten vardı, parola değiştirilmedi")
        else:
            temporary = "Gecici!" + "".join(secrets.choice(string.digits) for _ in range(6))
            final = new_password()
            user = call("POST", "/auth/users", {"email": spec["email"], "password": temporary, "full_name": spec["name"],
                                                "phone": spec["phone"], "roles": [spec["role"]]})
            reset = requests.post(f"{API}/auth/complete-password-reset", timeout=20,
                                  json={"email": spec["email"], "temporary_password": temporary, "new_password": final})
            reset.raise_for_status()
            role = "Yönetici" if spec["role"] == "manager" else "Saha kullanıcısı"
            lines.append(f"{spec['name']} ({role}) | e-posta: {spec['email']} | telefon: {spec['phone']} | parola: {final}")

        if spec["plate"] and not any(depot.get("plate") == spec["plate"] for depot in depots):
            call("POST", "/retail-stock/depots", {"kind": "vehicle", "name": f"{spec['name']} cep depo",
                                                  "plate": spec["plate"], "assigned_user_id": user["id"]})

    previous = OUT_FILE.read_text(encoding="utf-8") if OUT_FILE.exists() else ""
    if any("parola:" in line for line in lines):
        OUT_FILE.write_text(previous + "\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(line.split(" | parola:")[0] for line in lines))
    print(f"Giriş bilgileri: {OUT_FILE}")


if __name__ == "__main__":
    main()
