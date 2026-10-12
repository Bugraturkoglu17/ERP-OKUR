"""Yerel test hesaplarını ve deneme iş emirlerini otomatik oluşturur.

`git pull` sonrası başka bir bilgisayarda API ilk açıldığında (yalnızca
ENV=development ve izole `okur_erp_local` veritabanı) arka planda:

1. Hiç kullanıcı yoksa yerel geliştirici admin (`scripts/create_local_admin.py`)
   oluşturulur; ardından admin'e bağlı deneme stoğu yüklenir.
2. Test kullanıcıları ve cep depoları (`scripts/create_test_users.py`) eklenir.
3. Deneme iş emirleri (`scripts/seed_test_work_orders.py`) eklenir.

Adımlar API üzerinden çalıştığı için sunucu yanıt vermeye başlayınca yürütülür.
Hepsi tekrar çalıştırmaya güvenlidir; var olan kayıt ve parolalar değişmez.
Parolalar Git'e girmez: her bilgisayarda yeniden üretilip `local-data/`
altındaki dosyalara yazılır.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

logger = logging.getLogger("okur.local_test_data")

ROOT = Path(__file__).resolve().parents[4]
SCRIPTS = ROOT / "scripts"
ADMIN_FILE = ROOT / "local-data" / "dev-admin.txt"
HEALTH_URL = "http://127.0.0.1:8001/health"


def _run(script: str) -> str:
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    result = subprocess.run([sys.executable, str(SCRIPTS / script)], cwd=ROOT, capture_output=True, env=env,
                            text=True, encoding="utf-8", errors="replace", timeout=600)
    output = (result.stdout or result.stderr or "").strip().splitlines()
    return output[-1] if output else f"çıkış kodu {result.returncode}"


def _wait_for_api(timeout: float = 180) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=3) as response:
                if response.status == 200:
                    return True
        except OSError:
            pass
        time.sleep(2)
    return False


def _bootstrap() -> None:
    try:
        if not ADMIN_FILE.exists():
            print(f"[test verisi] yönetici: {_run('create_local_admin.py')}", flush=True)
            if ADMIN_FILE.exists():
                # Deneme stoğu bir yönetici kullanıcıya bağlı; admin yeni oluştuysa şimdi yüklenir.
                from app.services.local_seed import seed
                for line in seed():
                    print(f"[yerel veri] {line}", flush=True)
        if not ADMIN_FILE.exists():
            print("[test verisi] dev-admin.txt yok; test kullanıcıları oluşturulamadı", flush=True)
            return
        if not _wait_for_api():
            print(f"[test verisi] API {HEALTH_URL} adresinde yanıt vermedi; atlandı", flush=True)
            return
        print(f"[test verisi] kullanıcılar: {_run('create_test_users.py')}", flush=True)
        print(f"[test verisi] iş emirleri: {_run('seed_test_work_orders.py')}", flush=True)
    except Exception:  # noqa: BLE001 — test verisi hatası API'yi etkilememeli
        logger.exception("Yerel test verisi oluşturulamadı")


def start_local_test_data() -> None:
    """API açılışında çağrılır; işi arka plan iş parçacığında yapar."""
    if not SCRIPTS.exists():
        return
    threading.Thread(target=_bootstrap, name="okur-local-test-data", daemon=True).start()
