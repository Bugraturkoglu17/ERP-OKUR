# Okur ERP — yalnız yerel kopya

Bu dal henüz canlıya alınmaz. Sismik'in çalışan GitHub deposu, Northflank
servisleri, Neon veritabanı ve bulut dosyaları değiştirilmez. Okur kodu ayrı
bir GitHub deposundadır; gerçek veri ve `.env` dosyaları yalnız yerel makinede
kalır. OKUR markası yerel arayüze uygulanmıştır; diğer özelleştirmeler
yalnız bu ayrı kopyada yapılır.

## Ayrı kaynaklar

| Kaynak | Okur yerel kopyası |
| --- | --- |
| Web | `http://localhost:3001` |
| API | `http://localhost:8001` |
| PostgreSQL veritabanı | `okur_erp_local` |
| Dosyalar | `%LOCALAPPDATA%\OkurERP\uploads` |

Backend, `ENV=development` dışında veya `okur_erp_local` dışındaki bir
veritabanına bağlanmayı reddeder. Frontend `/api/v1` isteklerini yalnız kendi
`127.0.0.1:3001` adresinden alır ve yerel `127.0.0.1:8001` API'sine yönlendirir.
Bu korumalar canlıya geçiş öncesi Okur'a ait ayrı sunucu ve
bağlantılar hazırlandığında bilinçli olarak güncellenmelidir.

## Geliştirme ortamı

- Windows'ta Python 3.10+, Node.js 20+ ve yerel PostgreSQL gereklidir.
- Bu makinede `scripts/setup_local.py` ayrı ve boş `okur_erp_local`
  veritabanını oluşturdu. Betik yalnız **yerel** PostgreSQL giriş bilgilerini
  `mekanik-erp/apps/backend/.env` dosyasından okur; Sismik iş verilerini
  okumaz. Başka makinede yerel PostgreSQL'de aynı isimli boş veritabanını
  oluşturup `apps/backend/.env.example` ve
  `apps/frontend/.env.local.example` şablonlarıyla kendi yerel bağlantılarınızı
  tanımlayabilirsiniz. `.env` dosyaları Git'e eklenmez.
- Backend: `cd apps/backend`, `python -m venv .venv`,
  `.venv/Scripts/pip install -r requirements.txt`,
  `.venv/Scripts/python -m alembic upgrade head`.
- Başlangıç yöneticisi: kök dizinden
  `apps/backend/.venv/Scripts/python scripts/create_local_admin.py`.
  Betik yalnız boş kullanıcı tablosunda çalışır; rastgele ürettiği giriş
  bilgisini Git tarafından yok sayılan `local-data/dev-admin.txt` dosyasına
  kaydeder. Bu dosyayı firmalara göndermeyin.
- Frontend: `cd apps/frontend`, `npm ci`.
- API: `cd apps/backend`, `.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001`.
- Web: `cd apps/frontend`, `npm run dev -- --hostname 127.0.0.1 --port 3001`.
- Salt okunur kontrol: kök dizinden
  `apps/backend/.venv/Scripts/python scripts/smoke_local.py`.

Bu makinede Sismik'in **yerel** veritabanındaki 4.004 mağaza, 1 müşteri,
8 bölge ve 8 şube Okur'un ayrı veritabanına aktarıldı. Kaynak bağlantı
salt okunurdu; tüm mağaza alanları (firma kimliği hariç) karşılaştırılarak
doğrulandı. Okur'da yeni `Okur Yerel` firma kaydı kullanılır. İş emirleri,
dosyalar, kullanıcılar (yerel başlangıç yöneticisi hariç) ve finans verileri
aktarılmadı. Canlı Sismik verileri aktarılmadı.

Yeni ve boş bir Okur kurulumunda aynı yerel mağaza aktarımı için kök dizinden
`apps/backend/.venv/Scripts/python scripts/import_local_stores.py` komutuyla
ön kontrol, ardından aynı komuta `--apply` ekleyerek aktarım yapılabilir.
Bu betik yalnız boş Okur mağaza tablolarına yazar; ikinci kez çalıştırılınca
kopyalamayı reddeder. `scripts/verify_local_stores.py` iki yerel veritabanını
salt okunur karşılaştırır. Veritabanı verisi, dump, dosya ve şifreler
GitHub'a eklenmez.

## Başka bilgisayarda: `git pull` sonrası veriler otomatik gelir

Mağaza kartları, stok kartları (fiyat listesi) ve deneme stoğu `data/` klasöründe
Git ile taşınır:

| Dosya | İçerik |
| --- | --- |
| `data/STOK-VE-MAGAZA-LISTESI.xlsx` | Kaynak Excel: stok kartı + fiyatlar. **API açılırken doğrudan okunur** |
| `data/okur-stores.json.gz` | 4.116 mağaza kartı (müşteri, bölge, şube, proje) |
| `data/okur-catalog.json` | Stok kartlarının yedeği (yalnızca `openpyxl` yoksa kullanılır) |
| `data/okur-demo-stock.json` | Ana depo + deneme açılış stoğu |

`git pull` sonrası **API'yi yeniden başlatmanız yeterlidir**. Geliştirme ortamında
(`ENV=development`, izole `okur_erp_local` veritabanı) API açılırken sırayla:
migrasyonlar güncellenir (`alembic upgrade head`), mağazalar boşsa yüklenir, stok kartları
**Excel'den** koda göre eklenir/güncellenir (yeni kod = yeni kart, değişen fiyat/ad güncellenir),
ana depo ve deneme stoğu (depo/hareket yoksa ve yönetici varsa) yüklenir. Hepsi tekrar
çalıştırmaya güvenlidir; mevcut kayıtlar ezilmez (stok kartı adı/fiyatı hariç). Excel'i
değiştirip push etmek yeterlidir; diğer bilgisayarda pull + API yeniden başlatma yeterli.
Kapatmak için `.env` içine `AUTO_SEED_LOCAL_DATA=false`.

`openpyxl` kurulu değilse (`pip install -r apps/backend/requirements.txt`) Excel okunamaz ve
`okur-catalog.json` yedeği kullanılır; bu durumda değişen Excel'i işlemek için önce paketi kurun.

Test hesapları ve deneme iş emirleri de API açılınca arka planda otomatik oluşur:
hiç kullanıcı yoksa yönetici (`scripts/create_local_admin.py`), ardından 1 yönetici +
3 saha kullanıcısı ve cep depoları (`scripts/create_test_users.py`) ile başlıkları
`[DENEME]` olan 30 iş emri (`scripts/seed_test_work_orders.py`). Parolalar Git'e girmez;
her bilgisayarda yeniden üretilir ve `local-data/dev-admin.txt` ile
`local-data/test-kullanicilar.txt` dosyalarına yazılır. Var olan hesap ve iş emirlerine
dokunulmaz.

Yeni **mağaza** eklediyseniz (mağazalar Excel'den değil, veritabanından dışa aktarılır):
`python scripts/export_seed_data.py` çalıştırın, `data/` klasörünü commit/push edin. Yalnızca
Excel değiştiyse dışa aktarmaya gerek yoktur.

## Docker'sız, ayrı PostgreSQL ile başlatma (Windows)

Sismik'in PostgreSQL'iyle karışmaması için Okur kendi veri klasörünü ve
**5433** portunu kullanır (`local-data/pgdata`, Git'e eklenmez). İlk kurulum:

1. `initdb -D local-data/pgdata -U okur_local --pwfile=<parola dosyası> -A scram-sha-256 -E UTF8 --locale=C`
2. `pg_ctl start -D local-data/pgdata -l local-data/postgres.log -o "-p 5433"`
3. `okur_erp_local` veritabanını oluşturun; `apps/backend/.env` içindeki
   `DATABASE_URL` `...@127.0.0.1:5433/okur_erp_local` olmalıdır.
4. `alembic upgrade head`, ardından `scripts/create_local_admin.py`.

Sonraki açılışlarda yalnız `pg_ctl start`, API ve web komutları yeterlidir.

Bu repodaki kök `docker-compose.yml` de ayrı konteyner adları, ağ ve volume
kullanır. `infrastructure/docker-compose.yml` içindeki eski Sismik stack'i
güvenlik için devre dışı bırakılmıştır. Docker yapılandırması bu Windows
makinesinde Docker kurulu olmadığı için çalıştırılarak doğrulanmadı;
doğrulanan yöntem yukarıdaki yerel Python/Node çalıştırmasıdır.
