# OKUR ERP — Canlıya alma

Durum (27 Kasım 2026): Neon OKUR ERP projesi oluşturuldu; mağazalar henüz aktarılmadı.
Proje `polished-field-91637707`, production dalı `br-rough-resonance-bh8ijs23`,
Frankfurt, PostgreSQL 18, veritabanı `okur_erp`, sabit 0.25 CU, 5 dakika sonra uyku.
Neon başlangıçta Free planda; ücretli yükseltme yapılmadı.
Northflank API taslağı `okur-erp-api`, nf-compute-20 (0.2 vCPU / 512 MB / 5.40 $ aylık).
Servis oluşturulmadı: kart ve GitHub bağlantısı bekleniyor.
R2 aboneliği kullanıcı tarafından onaylandı; aktivasyon kart/fatura bilgileri bekliyor.
Hesap: bahadirsarman@gmail.com. Ücret modeli: kullandıkça öde, başlangıçta tek kopya.
Adres: frontend portu için Northflank tarafından verilen ücretsiz HTTPS `*.code.run` adresi.
Cloudflare özel alan adı satın almak için gerekli değildir; dosya deposu R2 olarak kullanılır.

## Kaynaklar

- Neon: ayrı OKUR projesi, `okur_erp` veritabanı, TLS, başlangıçta en küçük compute.
  İlk kurulumda doğrudan bağlantı kullanın; migration ve pg_dump bu bağlantıyı kullanır.
- Cloudflare R2: özel `okur-erp-files` kovası, yalnız bu kovaya yetkili anahtarlar.
- Northflank API: Dockerfile `/apps/backend/Dockerfile`, context `/apps/backend`,
  başlangıç 0.2 vCPU / 512 MB (bellek ölçümüne göre artırılır), tek kopya,
  8000 portu yalnız proje içi; health check `/health`.
- Frontend: Dockerfile `/apps/frontend/Dockerfile`, context `/apps/frontend`,
  başlangıç 0.2 vCPU / 512 MB, tek kopya, public HTTP port 3000.
- Redis: en küçük uygun addon, yalnız iç ağ, kalıcı disk.
- Celery worker: backend imajı, başlangıç 0.2 vCPU / 512 MB,
  `celery -A app.core.workers.tasks worker --loglevel=info --concurrency=1`, public port yok.
  Küçük kaynaklar yük testi olmadan kapasite garantisi vermez. Build kaynakları ayrıdır.

## Ortam değişkenleri

`production.env.example` gerçek değerlerin hangi hizmetlere ekleneceğini gösterir.
Değerleri Northflank secret group içinde saklayın. Frontend'in `API_INTERNAL_URL`
build argümanı API'nin proje içi adresidir; `NEXT_PUBLIC_API_URL=/api/v1` kalır.
Frontend adresi belirlendikten sonra `FRONTEND_URL` ve `CORS_ORIGINS` güncellenir.
Demo yükleme ve otomatik admin sıfırlama canlıda kapalıdır.

## İlk yayın sırası

1. OKUR kaynaklarını ayrı olarak oluşturun ve GitHub deposunu yalnız gereken yetkiyle bağlayın.
2. Backend imajını oluşturun. Tek seferlik migration job: `AUTO_MIGRATE=true`,
   varsayılan entrypoint, komut `true`; başarılı olduğunda kapatın.
3. `scripts/import_local_stores.py --check-file` ile mağaza dosyasını doğrulayın.
   Güvenli yerel ortamda hedef `DATABASE_URL` ve `OKUR_PRODUCTION_DB_HOST` değişkenlerini
   tanımlayın. `--production` ile salt okunur ön kontrol; `--production --apply`
   ile boş hedefe mağaza aktarımı. Script yanlış hedefi ve tekrarlı aktarımı reddeder.
   Mevcut dosya: 4.116 mağaza, 1 müşteri, 11 bölge, 4.116 şube. Demo işler yüklenmez.
4. Tek seferlik `python -m app.bootstrap_admin` job'ına admin e-posta/parolasını
   secret olarak verin; iş bitince parola değişkenini kaldırın. Tekrarlamayın:
   mevcut adminin parolasını sıfırlayabilir.
5. API, Redis, worker ve frontend'i başlatın. Demo hesaplar yerine yeni canlı admini kullanın.
6. HTTPS üzerinden giriş, mağaza sayısı, dosya yükleme/indirme, yetkiler ve iş emri akışını kontrol edin.
7. Android/iOS PWA kurulumu, ikon/ad, yeniden açılış, güncelleme ve bağlantı kesilmesi testi yapın.
   Çevrimdışı ekran vardır; çevrimdışı kayıt oluşturma/senkronizasyon özelliği yoktur.
8. Maliyetleri, bellek kullanımını ve hata günlüklerini izleyin; ihtiyaca göre artırın.

Docker bu bilgisayarda bulunmadığından container build ve gerçek servis sağlık kontrolleri
bulut hesabına giriş sonrası yapılmalıdır. Yerel build, canlıya alınmış olduğu anlamına gelmez.

Resmî kaynaklar: https://northflank.com/pricing,
https://neon.com/pricing, https://developers.cloudflare.com/r2/pricing/.
