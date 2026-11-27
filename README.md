# OKUR ERP

Mağaza kartları, iş emirleri, saha operasyonları, proje takibi, stok, dosyalar ve
hakediş yönetimi için kurumsal uygulama. Telefon ve bilgisayara PWA olarak kurulabilir.

## Bileşenler

- Arayüz: Next.js, TypeScript, Tailwind CSS.
- API: FastAPI, SQLModel / SQLAlchemy, Alembic.
- Veritabanı: PostgreSQL; canlı ortamda OKUR'a özel Neon veritabanı.
- Arka plan işleri: Redis ve Celery.
- Dosya deposu: geliştirmede yerel klasör, canlıda Cloudflare R2 (S3 API).
- Barındırma: Northflank; sağlayıcının ücretsiz HTTPS adresi kullanılabilir.

## Yerel geliştirme

[Kurulum adımları](OKUR_LOCAL_SETUP.md). Web `http://localhost:3001`, API
`http://localhost:8001`, veritabanı `okur_erp_local`.

```sh
docker compose up -d --build
```

`data/okur-stores.json.gz` müşteri, bölge, şube ve mağaza kartlarını içerir.
Kullanıcı/parola, iş emri ve finans verilerini canlıya aktarmak için kullanılmaz.
Geliştirmede otomatik demo verisi yükleme `AUTO_SEED_LOCAL_DATA` ile yönetilir.

## Canlıya alma

[Northflank / Neon / Cloudflare hazırlığı](infrastructure/DEPLOYMENT.md).
Canlıda `ENV=production`, `okur_erp` veritabanı, açıkça seçilmiş Neon sunucusu,
TLS bağlantısı ve güçlü oturum anahtarı zorunludur. Otomatik demo yükleme kapalıdır.

PWA manifesti `/manifest.webmanifest`, service worker `/sw.js` adresindedir.
Çevrimdışıyken bağlantı uyarısı gösterilir; iş kayıtları internet bağlantısı gerektirir.

`.env`, parolalar, API anahtarları, veritabanı dump dosyaları ve kullanıcı yüklemeleri
Git'e eklenmez. Kök dizindeki eski test raporları arşivdir; yeni canlı ortamın kabul
veya yayın kanıtı değildir.
