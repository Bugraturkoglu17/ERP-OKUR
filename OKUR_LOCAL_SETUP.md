# OKUR ERP — Yerel kurulum

Yerel geliştirme kaynakları: web `localhost:3001`, API `localhost:8001`,
PostgreSQL `okur_erp_local`, dosyalar `%LOCALAPPDATA%\OkurERP\uploads`.
Geliştirme ayarları uzak veritabanına bağlanmayı reddeder.

1. Python 3.12, Node.js 20+ ve PostgreSQL kurun.
2. `apps/backend/.env.example` dosyasını `.env` olarak kopyalayın ve kendi
   yerel PostgreSQL bağlantınızı girin. `okur_erp_local` veritabanını oluşturun.
3. `apps/backend` içinde `python -m venv .venv`, ardından
   `.venv/Scripts/pip install -r requirements.txt` çalıştırın.
4. Aynı klasörde `.venv/Scripts/python -m alembic upgrade head` çalıştırın.
5. API: `.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001`.
6. `apps/frontend` içinde `npm ci`, ardından `npm run dev -- --port 3001`.
7. Başlangıç yöneticisi için kökten
   `apps/backend/.venv/Scripts/python scripts/create_local_admin.py` çalıştırın.
   Giriş bilgileri yalnız `local-data/dev-admin.txt` dosyasına yazılır.

Geliştirmede `AUTO_SEED_LOCAL_DATA=true` ise API açılışında mağaza kartları,
stok kataloğu ve demo verileri yüklenir. `data/okur-stores.json.gz` güncel
olarak 4.116 mağaza, 1 müşteri, 11 bölge ve 4.116 şube içerir.
Canlı ortamda demo yükleme kapalı tutulur.

Yalnız mağaza aktarımı için `scripts/import_local_stores.py --check-file` ile
kaynak dosyasını denetleyin. Parametresiz çalıştırma hedefi salt okunur denetler;
`--apply` boş hedefe tek işlemde aktarır. `scripts/verify_local_stores.py`
yerel mağaza kimliklerini dosyayla salt okunur karşılaştırır.

Windows'ta ayrı PostgreSQL verisi `local-data/pgdata` altında, port **5433**
üzerinde kullanılabilir. `scripts/start_postgres.ps1` ve
`scripts/start_okur_web.bat` mevcut yerel başlatma araçlarıdır.
Docker kullanıyorsanız kökten `docker compose up -d --build` çalıştırın.

Canlı kurulum için [dağıtım notlarına](infrastructure/DEPLOYMENT.md) bakın.
