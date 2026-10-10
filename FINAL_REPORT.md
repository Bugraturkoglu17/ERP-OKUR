# SİSMİK ERP — Son Production Kabul Raporu

Test tarihi: 11 Eylül 2026

Ortam: Yerel frontend + backend + PostgreSQL + S3 uyumlu kalıcı depolama

Test sırası: Kullanıcı → Yönetici → Admin

## PRODUCTION READINESS

**CONDITIONAL**

Kritik iş akışları ve P0/P1 regresyonları geçti. Ancak talep edilen 320/360/375/390/393/412/430 ve 1366×768/1920×1080 matrisinin tamamı ile gerçek tarayıcı dosya seçicisindeki upload progress yüzdesi mevcut test aracında ayrı ayrı doğrulanamadı. Bu nedenle bu iki kalem `NOT TESTED` olarak bırakıldı.

**PRODUCTION READY = HAYIR** — Tam viewport matrisi ve gerçek tarayıcı upload-progress kabulü tamamlanmadan koşulsuz production onayı verilmedi.

## USER

| Alan | Sonuç |
|---|---|
| Genel Bakış | PASS |
| İşlerim | PASS |
| İş Detay | PASS |
| Aşamalar | PASS |
| Rapor | PASS |
| Fotoğraf | PASS |
| Profil | PASS |
| Logout | PASS |

Doğrulanan ana akışlar:

- Gerçek USER oturumu açıldı; rol state'i Manager/Admin oturumundan taşınmadı.
- Kullanıcı yalnız kendisine atanan işleri gördü; başka kullanıcıya/atanmamış işe doğrudan API erişimi `403` verdi.
- Planlanacak işte “Süreci Başlat” çalıştı; durum `planned → in_progress` oldu ve yönetici ekranına yansıdı.
- `QA/TEST Production Kabul 20260910-2012` işi kullanıcıya düştü ve bildirim üretildi.
- Metin ve görsel içeren QA raporları oluşturuldu; refresh ve hesap değişiminden sonra kaldı.
- Fotoğraf viewer merkezleme, aspect-ratio, viewport içinde kalma ve kapatma davranışı gerçek tarayıcıda geçti.
- Logout sonrası korumalı kullanıcı arayüzü görünmedi.

## MANAGER

| Alan | Sonuç |
|---|---|
| Genel Bakış | PASS |
| İş Emirleri | PASS |
| Yeni İş Emri | PASS |
| İş Detayı | PASS |
| Mağaza Kartı | PASS |
| Genel Arşiv | PASS |
| Kullanıcılar | PASS |
| Raporlar | PASS |
| Logout | PASS |

Doğrulanan ana akışlar:

- Dashboard sayaçları, termin listesi, ekip iş yükü ve son hareketler canlı API verisiyle açıldı.
- Mobil iş emri sekmelerindeki başlık ve sayı tek satırda, hizalı olarak doğrulandı.
- Üç adımlı wizard ile gerçek QA iş emri oluşturuldu; ağ hatası oluşmadı ve kayıt `planned` olarak kalıcılaştı.
- Mağaza seçimi sunucu tarafında arandı; binlerce mağaza modal açılışında indirilmedi.
- USER raporu ve görseli yönetici detayında görüldü.
- Rapor görseli yöneticinin açık işlemiyle Görsel Envanter'e eklendi; iş emrindeki kaynak görsel korundu ve ikinci aktarım UI/backend tarafından engellendi.
- Genel Arşiv'e gerçek multipart dosya yüklendi, açıldı ve mağaza kartına aktarıldı; refresh sonrası metadata/ilişki kaldı.
- Yönetici API'de admin veya manager oluşturamadı/atayamadı; beklenen sonuç `403`.
- Admin hesabı yönetici kullanıcı tablosunda korumalıdır; değiştirme/silme aksiyonu sunulmaz.

## ADMIN

| Alan | Sonuç |
|---|---|
| Genel Bakış | PASS |
| Kullanıcılar | PASS |
| Rol Yönetimi | PASS |
| Sistem Ayarları | PASS |
| Logout | PASS |

Doğrulanan ana akışlar:

- Admin dashboard gerçek kullanıcı sayılarını gösterdi; mobil görünümde kök yatay taşma gözlenmedi.
- Admin menüsünde yalnız güncel yönetim alanları yer aldı.
- Kullanıcı listesi gerçek `/auth/users` verisinden geldi; eski localStorage/mock detay ekranı kaldırıldı.
- Görünen roller Admin/Yönetici/Kullanıcı terminolojisine getirildi; eski “Platform Admin” etiketi “Geliştirici Admin” olarak maskelendi.
- Sistem Ayarları'ndaki geçici “Aşama 3'te” ve sahte `—` değerleri kaldırıldı; gerçek firma/aktif firma sayısı gösterildi.
- Admin → Yönetici görünümüne geçildikten sonra sidebar açma/kapatma paneli Admin'e geri sıçratmadı.
- Eski admin kullanıcı detay URL'si gerçek kullanıcı listesine güvenli yönleniyor.

## COMMON

| Alan | Sonuç |
|---|---|
| Login | PASS |
| Splash | PASS |
| Mobile Sidebar | PASS |
| Responsive | NOT TESTED |
| File Persistence | PASS |
| Image Viewer | PASS |
| Upload Progress | NOT TESTED |
| Auth | PASS |
| Permissions | PASS |
| Performance | PASS |
| Cost Check | PASS |
| Production Build | PASS |

Notlar:

- Login/logout ve geçerli session açılışlarında uygulama kabuğunun splash öncesi görünmesi tekrarlanmadı.
- Mobil sidebar yalnız hamburger ile açıldı; yatay sürükleme sidebar'ı açmadı. Açık durumda blur/backdrop, kapatma ve rol görünümü korundu.
- Bildirim paneli mobil viewport içinde kaldı.
- Bildirim sayacı görünür sekmede 15 saniye yerine 60 saniyede bir yenileniyor; focus/visibility dönüşünde anlık kontrol devam ediyor.
- Mağaza seçici ve Genel Arşiv aktarımı en az iki karakterli debounce'lu uzaktan arama ve 50 kayıt limiti kullanıyor.
- Browser console'da son temiz server başlangıcından sonra React error, hydration error, 500/401/403 loop veya uncaught promise görülmedi.
- Tam responsive viewport matrisi ve tarayıcı dosya seçicisindeki gerçek progress yüzdesi doğrulanamadığı için ilgili kalemler bilinçli biçimde `NOT TESTED` bırakıldı.

## BULUNAN HATALAR VE DÜZELTME DÖNGÜSÜ

### P0 — İş emri oluşturma/başlatma sunucu hatası

- Sayfa: Yönetici > Yeni İş Emri ve Kullanıcı > İş Detay
- Hata: İş emri oluşturma veya süreç başlatma işlemi sunucu bağlantı hatası olarak görünüyordu.
- Gerçek sebep: Alembic revision kaydı güncel görünmesine rağmen PostgreSQL'deki eski native enum kolonları korunmuştu; ORM lowercase VARCHAR değer gönderince PostgreSQL enum doğrulaması işlemi reddediyordu.
- Düzeltme: Veri kaybetmeyen `20260910_01_repair_workorder_enum_columns` migration'ı eklendi; ilgili iş emri, fotoğraf ve WhatsApp enum alanları lowercase VARCHAR'a dönüştürüldü. API çıkışları legacy enum/string için normalize edildi.
- Tekrar test: PASS. QA işi oluşturuldu, kullanıcıya atandı ve `planned → in_progress` geçişi kalıcı olarak doğrulandı.

### P1 — Mağaza seçiminde limitsiz veri yükleme

- Sayfa: Yeni İş Emri mağaza seçici ve Genel Arşiv mağazaya aktarım modalı
- Hata: Önceki akış tüm mağazaları istemciye indirebiliyordu.
- Gerçek sebep: Modal mount işleminde limitsiz `getStores()` ve client-side filtre kullanılıyordu.
- Düzeltme: Mount-time tam liste kaldırıldı; iki karakter sonrası debounce'lu server araması ve en fazla 50 sonuç eklendi.
- Tekrar test: PASS. `3790` mağaza kodu ile sonuç bulundu, seçim ve aktarım tamamlandı.

### P1 — Eski/mock admin ekranları ve yanıltıcı ayar metni

- Sayfa: Admin > Kullanıcı Detay, Denetim Kayıtları, Sistem Ayarları
- Hata: localStorage tabanlı eski kullanıcı detayı ve “Aşama 3'te” gibi geliştirici metinleri production rotalarında kalmıştı.
- Gerçek sebep: Aktif gerçek kullanıcı listesiyle paralel bırakılan eski prototip sayfalar.
- Düzeltme: Mock servis kaldırıldı; detay/denetim rotaları aktif yönetim ekranlarına yönlendirildi; ayarlar canlı tenant verisiyle yeniden yazıldı.
- Tekrar test: PASS. Mock state görülmedi, canlı değerler geldi ve eski metinler kayboldu.

### P1 — OpenAPI tip üretimi bağımlılık çakışması

- Sayfa: Build/tooling
- Hata: `npm run api:generate`, Redocly içinde `js-yaml` API uyumsuzluğu ile kapanıyordu.
- Gerçek sebep: Tüm bağımlılık ağını uyumsuz `js-yaml@5.4.1` sürümüne zorlayan override.
- Düzeltme: Uyumsuz override kaldırıldı; Redocly `1.34.20` ve güvenli `js-yaml@4.3.2` çözümlendi.
- Tekrar test: PASS. API tipleri üretildi ve `npm audit` 0 açık verdi.

### P2 — Mobil iş emri sekme hizası

- Sayfa: Yönetici > İş Emirleri
- Hata: Başlık ve sayaç dar ekranda farklı satırlara düşüyordu.
- Gerçek sebep: Sekme butonlarında nowrap/flex ve dar ekran tipografi ölçeği yoktu.
- Düzeltme: Tek satırlı flex düzeni, kompakt mobil font/padding ve tabular sayaç uygulandı.
- Tekrar test: PASS.

### P2 — Gereksiz bildirim polling maliyeti

- Sayfa: Tüm korumalı paneller
- Hata: Görünür sekmede bildirim sayacı 15 saniyede bir sorgulanıyordu.
- Gerçek sebep: Kısa sabit polling periyodu.
- Düzeltme: Periyot 60 saniyeye çıkarıldı; focus/visibility tabanlı anlık yenileme korundu.
- Tekrar test: PASS.

## TEKNİK DOĞRULAMA

- Frontend lint: PASS — 0 hata, 16 mevcut uyarı.
- Frontend TypeScript: PASS — `tsc --noEmit --incremental false`.
- Frontend production build: PASS — 71 route üretildi.
- OpenAPI type generation: PASS.
- Dependency audit: PASS — 0 güvenlik açığı.
- Backend source compile: PASS — `python -m compileall`.
- Backend mevcut pytest suite: NOT TESTED — repoda test senaryosu bulunmadı (`no tests ran`).
- Backend startup/API smoke: PASS — `/health` 200.
- Frontend smoke: PASS — `/login` 200.
- Database migration: PASS — `20260910_01 (head)`.
- Gerçek secret değerleri bu rapora yazılmadı.

## QA KAYITLARI

- İş emri: `QA/TEST Production Kabul 20260910-2012` (`5398f1af-790d-469c-9fe6-2611d000d5b8`)
- Yetki izolasyon işi: `QA/TEST Yetki İzolasyonu 20260910` (`4fd0235e-8607-4c73-9e12-f36cd1952321`)
- Görselli rapor: `QA/TEST Tarayıcı Görseli 20260910` (`fc6be8f8-142b-4ed0-9609-25be2098d7ed`)
- Genel Arşiv dosyası: `QA_TEST_ARCHIVE_20260910.png` (`0d71df20-1940-4cc6-bcd6-d56fc49ae4d0`)

Bu kayıtlar kabul testinin izlenebilirliği için silinmedi.
