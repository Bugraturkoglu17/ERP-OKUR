# Okur ERP — yalnız yerel kopya

Bu dal henüz canlıya alınmaz. Sismik'in çalışan GitHub deposu, Northflank
servisleri, Neon veritabanı ve bulut dosyaları değiştirilmez. Okur kodu ayrı
bir GitHub deposundadır; gerçek veri ve `.env` dosyaları yalnız yerel makinede
kalır. Okur markası, logo ve iş akışları sonraki aşamada düzenlenecektir.

## Ayrı kaynaklar

| Kaynak | Okur yerel kopyası |
| --- | --- |
| Web | `http://localhost:3001` |
| API | `http://localhost:8001` |
| PostgreSQL veritabanı | `okur_erp_local` |
| Dosyalar | `%LOCALAPPDATA%\OkurERP\uploads` |

Backend, `ENV=development` dışında veya `okur_erp_local` dışındaki bir
veritabanına bağlanmayı reddeder. Frontend de yalnız `localhost:8001` API'sini
kabul eder. Bu korumalar canlıya geçiş öncesi Okur'a ait ayrı sunucu ve
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

Şu an yalnız yerel yönetici hesabı vardır; mağaza, iş emri, dosya ve diğer
iş verileri **boştur**. Canlı Sismik verileri aktarılmadı. İleride aktarım
istenirse ayrı, salt okunur dışa aktarma planlanmalıdır; hiçbir dump, dosya
veya kimlik bilgisi GitHub'a eklenmez.

Bu repodaki kök `docker-compose.yml` de ayrı konteyner adları, ağ ve volume
kullanır. `infrastructure/docker-compose.yml` içindeki eski Sismik stack'i
güvenlik için devre dışı bırakılmıştır. Docker yapılandırması bu Windows
makinesinde Docker kurulu olmadığı için çalıştırılarak doğrulanmadı;
doğrulanan yöntem yukarıdaki yerel Python/Node çalıştırmasıdır.
