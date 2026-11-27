# OKUR ERP — Canlıya alma

Durum (27 Kasım 2026): canlı yayın açıldı; 4.116 mağaza Neon'a aktarıldı.
Proje `polished-field-91637707`, production dalı `br-rough-resonance-bh8ijs23`,
Frankfurt, PostgreSQL 18, veritabanı `okur_erp`, sabit 0.25 CU, 5 dakika sonra uyku.
Neon başlangıçta Free planda; ücretli yükseltme yapılmadı.
Northflank API, web ve worker: her biri nf-compute-20 (0.2 vCPU / 512 MB / 5.40 $ aylık).
Redis 7.2.16: özel ağ, TLS, 256 MB, 6 GB disk; yaklaşık 3.60 $ aylık.
R2 kullandıkça öde aktif; `okur-erp-files` özel, yalnız bu kovaya yetkili anahtar kullanılıyor.
Hesap: bahadirsarman@gmail.com. Ücret modeli: kullandıkça öde, başlangıçta tek kopya.
Adres: https://p01--okur-erp-web--g6sktzrk8j5l.code.run
Kaynak: `bahadiras/ERP-OKUR`, `codex/okur-erp-production` dalı.
Tam ay açık kaynak tabanı yaklaşık 19.80 $; derleme, trafik, vergi ve kota aşımları hariç.
Başlangıçtaki 100 GB belge henüz yüklenmedi; ilk aylarda yükleme olmayabilir.
R2 Standard ilk 10 GB/ay ücretsiz; 100 GB tam ay saklanırsa depolama yaklaşık 1.35 $/ay,
her kalıcı ek 10 GB yaklaşık 0.15 $/ay ekler. İşlem kotaları ayrıca uygulanır.
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

## Doğrulanan yayın

- Northflank'ta API, web ve Celery worker çalışıyor; worker Redis TLS bağlantısı ve ready kaydı doğrulandı.
- `okur-erp-bootstrap` yalnız elle çalışır. Migration ve mağaza aktarımı başarıyla tamamlandı.
- Aktarılanlar: 1 müşteri, 11 bölge, 4.116 şube, 4.116 proje. Kullanıcı/demo işler aktarılmadı.
- Yönetici hesabı kullanıcı tarafından girilen parola ile oluşturuldu; geçici parola değişkenleri
  API ve bootstrap ortamından kaldırıldı. Yeniden bootstrap çalıştırmak parola sıfırlayabilir.
- `production_smoke.py`: mağaza sayısı, web proxy üzerinden giriş ve auth/me, R2 yazma/okuma
  ve yalnız test dosyasının temizliği geçti. Script için admin parolası geçici olarak gerekir.
- Genel HTTPS /login 200, /api/health ok, kimliksiz /api/v1/auth/me 401.
- /manifest.webmanifest: OKUR ERP, standalone; /sw.js 200 ve no-cache/no-store.
- Fiziksel Android/iOS cihazında ana ekrana kurulum bu oturumda denenmedi.
- Celery 5.4.0 + Kombu 5.4.2 + redis-py 5.1.1 sabitlendi; en yeni Kombu ile sürüm uyuşmazlığı giderildi.

Resmî kaynaklar: https://northflank.com/pricing,
https://neon.com/pricing, https://developers.cloudflare.com/r2/pricing/.
