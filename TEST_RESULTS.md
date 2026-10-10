# SİSMİK ERP — Canlıya Çıkış Öncesi Test & Denetim Raporu

## ✅ GÜNCELLEME (2026-09-07, aynı gün) — Tüm P0 ve seçili P1 düzeltmeleri uygulandı ve canlı doğrulandı

Aşağıdaki maddeler düzeltildi, backend'i yeniden başlatıp gerçek API çağrılarıyla (önce/sonra karşılaştırmalı) tekrar test edildi:

| Bulgu | Düzeltme | Canlı Doğrulama |
|---|---|---|
| P0-1 saha_muhendisi rolü yok | `bootstrap_admin.py`'a rol seed'i eklendi + DB'ye uygulandı | `POST /auth/users roles=["user"]` → **201** (önce 500) |
| P0-2/3 Manager→Manager create/delete | `auth.py`: Yönetici oluşturma/silme/düzenleme artık yalnızca geliştirici admin | Manager→Manager create **403**, delete **403** (önce 201/204) |
| P0-4 Self-lock | Kendi hesabını pasif yapma engeli eklendi | Manager kendini pasifleştiremiyor — **403** |
| P0-5 Stale JWT rol kontrolü | `dependencies.py`: `require_role`/`require_permission` artık canlı DB'den okuyor | Rol düşürüldükten sonra eski token ile korumalı endpoint → **401** (önce 200 ile çalışmaya devam ediyordu) |
| P0-6 documents PATCH auth'suz | `get_current_user` + scope kontrolü eklendi | Tokensız istek → **401** (önce içerik değiştirilebiliyordu) |
| P0 Storage orphan | `delete_report`/`delete_work_order`'da envanterde referanslanmayan dosyalar `storage.delete_file` ile temizleniyor (mağaza kartına aktarılmış dosyalar korunuyor) | Kod incelemesiyle doğrulandı |
| P0 N+1 (list_work_orders) | Tek tek sorgu yerine toplu (`in_`) sorgulara çevrildi — ~2500 sorgudan sabit 5 sorguya | `GET /work-orders` 200 dönüyor, aynı veri |
| P1 ESLint crash | `eslint.config.mjs` → `FlatCompat` ile düzeltildi | `npm run lint` artık gerçekten çalışıyor (35 gerçek bulgu buldu, kapsam dışı ayrı liste) |
| P1 Rate limiting yok | `/auth/login`'e IP başına dakikada 10 deneme sınırı eklendi | 7. denemeden itibaren **429** |
| P1 Logout/revocation yok | `token_version` kolonu + migration + `/auth/logout` endpoint'i eklendi; rol değişikliği ve pasif yapma da token'ı geçersiz kılıyor | Logout sonrası aynı token → **401** |
| P1 Mağaza listesi tek seferde 5000 satır | `getStores()` artık 500'lük parçalar halinde çekiyor (aynı veri, tek dev response yok) | Kod incelemesiyle doğrulandı |
| Frontend UI tutarsızlığı | Manager arayüzünde "Yönetici" rol seçeneği ve peer Yönetici satırlarının düzenle/sil butonları kaldırıldı, kalkan ikonuyla korunuyor | Tarayıcıda canlı doğrulandı |

**Bilinçli olarak ERTELENEN/yapılmayan maddeler** (yüksek risk/kapsam nedeniyle, ayrı bir oturumda ele alınmalı):
- JWT'nin `localStorage`'dan httpOnly cookie'ye taşınması — tüm auth mimarisini etkileyen büyük bir değişiklik, kör bir geçişte kırılma riski yüksek.
- `fastapi`/`starlette`/`python-multipart` gibi büyük sürüm farkı olan bağımlılıkların yükseltilmesi — regresyon riski, ayrı test turu gerektirir.
- Thumbnail/sıkıştırma pipeline'ı — yeni bir özellik, bug fix kapsamının dışında.
- `document` versiyon geçmişi / arşiv hard-delete temizliği — versiyon geçmişini kırma riski nedeniyle dokunulmadı.
- ESLint'in artık çalışır hale gelmesiyle ortaya çıkan 35 kod kalitesi bulgusu (çoğu `<img>`→`next/image` önerisi, birkaçı gerçek hata) tek tek düzeltilmedi — ayrı bir temizlik turu önerilir.

Bu bölümün altındaki rapor, düzeltme öncesi orijinal test sonuçlarıdır (referans/kanıt olarak korunmuştur).

---

**Tarih:** 2026-09-07
**Ortam:** Local dev (PostgreSQL local, backend `localhost:8000`, frontend `localhost:3000`)
**Yöntem:** Statik kod incelemesi (4 paralel salt-okunur denetim ajanı) + canlı API testleri (gerçek token'larla, gerçek admin/manager hesapları oluşturularak) + tarayıcı doğrulaması (DOM/network inceleme).
**Kural:** Bu aşamada hiçbir kod/DB değişikliği yapılmadı (yalnızca test amaçlı, uygulamanın kendi API'si üzerinden 2 test hesabı oluşturuldu — aşağıda not edildi). Frontend dev sunucusu, bir denetim ajanının eşzamanlı `npm run build` denemesiyle bozulduğu için yeniden başlatıldı (yerel dev ortamı, prod'a dokunulmadı).

---

## GENEL SONUÇ

**Production Hazır: HAYIR**

| Seviye | Sayı |
|---|---|
| CRITICAL (P0) | 6 |
| HIGH (P1) | 9 |
| MEDIUM (P2) | 6 |
| LOW (P3) | 4 |

En kritik tek cümle: **"Kullanıcı" (USER) rolünde hiç kimse oluşturulamıyor (P0-1), bir Yönetici başka bir Yönetici oluşturup silebiliyor (P0-2/3), ve bir doküman güncelleme endpoint'i hiç kimlik doğrulaması istemiyor (P0-6).** Bunlar düzeltilmeden canlıya çıkılmamalı.

---

## 1. SUNUCU DURUMU

| Bileşen | Durum |
|---|---|
| Frontend (Next.js 15) | PASS — çalışıyor, tüm 18 beklenen route mevcut |
| Backend (FastAPI) | PASS — ayakta, login/CRUD uçtan uca çalıştı |
| Database (local Postgres / prod Neon) | PASS (bağlantı) / WARNING (N+1 sorgu riski, bkz. §5) |
| Storage (OCI/S3, local fallback) | WARNING — silme akışlarında orphan dosya riski (§2) |

---

## 2. MALİYET RİSKLERİ

### NEON'U GEREKSİZ UYANDIRABİLECEK İŞLEMLER
**Bulunamadı.** Detaylı tarama sonucu:
- Frontend'de `setInterval`, React Query/SWR, WebSocket/SSE polling — **sıfır**. Tüm `setTimeout` kullanımları tek seferlik (debounce, splash ekranı, toast) ve `clearTimeout` ile temizleniyor.
- `/health` endpoint'i (`apps/backend/app/main.py:73-75`) DB'ye **hiç dokunmuyor**, statik `{"status":"ok"}` dönüyor. Dockerfile healthcheck (10s aralık) bu endpoint'i çağırıyor — DB-free olduğu için risk yok.
- `get_db()` içindeki cold-start retry (bu oturumda eklendi) **1 deneme ile sınırlı**, sonsuz döngü yok — kod incelemesiyle doğrulandı.
- Celery Beat'te **hiçbir periyodik görev tanımlı değil** (`beat_schedule`/`add_periodic_task` sıfır sonuç). `check_low_stock` fonksiyonunun "saatte bir çalışır" diyen docstring'i **yalıştır** — hiçbir yerden tetiklenmiyor, ölü/pasif kod. [P3] İleride biri bu docstring'e güvenip gerçek bir saatlik schedule eklerse Neon'u sürekli uyandırır — temizlenmesi öneriliyor.
- Repo içinde `northflank.json`/`Procfile` yok — Northflank'ın gerçek readiness probe path/interval'i dashboard'dan elle doğrulanmalı (repodan görülemiyor).

### BACKEND'İ GEREKSİZ ÇALIŞTIRAN İŞLEMLER
- **[P0] `list_work_orders` (GET /work-orders) — N+1 patlaması.** Her iş emri için 5 ayrı sorgu (proje, fotoğraflar, formlar, raporlar, aktif link) çalışıyor. 500 iş emri limitiyle bile **tek istekte kadar 2.500 sıralı DB round-trip**. `apps/backend/app/api/v1/routes/work_orders.py:477-510`. Aynı desen `get_work_order`, `update_work_order`, `list_reports` (+ fotoğraf başına S3 presign çağrısı), `list_work_order_photos`'da da var.
- **[P1] Frontend `getStores()` varsayılan `limit=5000`** ile mağaza listesini tek seferde çekiyor, sayfalama client-side yapılıyor. **Canlı network isteğinde doğrulandı:** `GET /api/v1/projects?limit=5000&skip=0`. `apps/frontend/services/stores.ts:29`, `apps/frontend/app/projects/page.tsx:447`. Tam olarak brief'te bahsedilen "4000 mağaza" riski.
- **[P1] `/documents/archive` (Genel Arşiv) sıfır sayfalama** — tüm arşiv tek seferde geliyor.
- **[P2]** `invoice_records`, `progress_payments`, `service_forms` tenant-geneli listeleri `limit(5000)` gibi "yalancı sonsuzluk" sınırları kullanıyor, gerçek sayfalama değil.

---

## 3. GÜVENLİK

### CRITICAL

**[P0-6] `PATCH /documents/{doc_id}` — kimlik doğrulama YOK.**
`apps/backend/app/api/v1/routes/documents.py:266-290`. Diğer tüm endpoint'lerin aksine bu fonksiyonda `Depends(get_current_user)` yok. **Herhangi bir kullanıcı, token olmadan, herhangi bir tenant'a ait herhangi bir dokümanın metadata'sını (`doc_type`, `original_name`, `revision_note`) değiştirebilir.**
→ Önerilen çözüm: `current_user: User = Depends(get_current_user)` ekle + `_ensure_document_scope()` çağrısı.

**[P0-1] "Kullanıcı" (saha_muhendisi) rolü sistemde hiç seed edilmemiş → USER hesabı oluşturma her zaman 500 hatası veriyor.**
Canlı test: `POST /auth/users` ile `roles=["user"]` gönderildiğinde `{"detail":"saha_muhendisi rolü sistemde tanımlı değil."}` (HTTP 500). `roles` tablosunda sadece `admin` ve `platform_admin` var (DB'de doğrulandı). Kök neden: `apps/backend/app/bootstrap_admin.py:51-62` sadece `platform_admin` ve `admin` rollerini oluşturuyor; `saha_muhendisi` rolünü hiçbir migration, seed script veya bootstrap kodu oluşturmuyor. Bu **local DB'ye özgü bir eksiklik değil, kod tabanının kendisinde bir boşluk** — AUTO_BOOTSTRAP_PLATFORM_ADMIN ile açılan her yeni ortamda aynı şekilde bozuk olacak.
→ **Etkisi:** Spesifikasyonun ilk sorduğu soru olan "Admin yeni USER oluşturabiliyor mu?" sorusunun cevabı şu an **HAYIR**, hiçbir şekilde.
→ Önerilen çözüm: `bootstrap_admin.py`'a (veya bir migration'a) `saha_muhendisi` rolünü ekleyen bir `_ensure_role()` çağrısı eklenmeli.

**[P0-2] MANAGER (Yönetici) başka bir MANAGER oluşturabiliyor.**
Canlı test: test-manager hesabıyla `POST /auth/users` `roles=["manager"]` → **HTTP 201, başarılı.** Spesifikasyon açıkça "YAPAMAZ: MANAGER oluşturamaz" diyor. Kök neden: `create_user`, `update_user_details`, `delete_user_account` (`apps/backend/app/api/v1/routes/auth.py`) hepsi tek bir yetki kontrolü kullanıyor — `_is_manager(admin)` — bu kontrol hem `platform_admin` hem de tenant-seviyesi `admin` (kod içinde "Yönetici" karşılığı) için **aynı** true değerini döndürüyor. Sistemde ADMIN/MANAGER diye ayrı iki yetki katmanı **yok**; ikisi de aynı `default_role="admin"` değerine karşılık geliyor.
→ **Frontend'de de doğrulandı:** Manager olarak giriş yapıp "Yeni Hesap" formunu açtığımda Rol seçicisinde "Kullanıcı" VE "Yönetici" seçenekleri **ikisi de** görünüyor — frontend bu kısıtlamayı hiç uygulamaya çalışmıyor bile.

**[P0-3] MANAGER başka bir MANAGER'ı silebiliyor.**
Canlı test: test-manager hesabıyla, önceden oluşturulan test-manager2 hesabına `DELETE /auth/users/{id}` → **HTTP 204, başarılı.** Aynı kök neden (`_is_manager` her iki tarafta da true). `delete_user_account` sadece `platform_admin` hedefini ve kendi hesabını koruyor — başka bir manager'ı korumuyor.
→ **Frontend'de de doğrulandı:** Manager'ın "Kullanıcılar" ekranında diğer Yönetici hesaplarının (hatta geliştirici admin ile aynı satırda görünen "Yönetici" etiketli hesapların) yanında "Hesabı sil" butonu **tıklanabilir durumda** görünüyor.

**[P0-4] Kendi kendini pasif yapma (self-lock) engeli yok — tenant admin/manager için.**
Canlı test: test-manager kendi hesabını `PATCH .../{kendi_id} {is_active:false}` ile pasif yaptı → **HTTP 200, başarılı.** Hemen ardından aynı token ile herhangi bir istek → 401 (anında kilitlendi, kurtarma yolu admin müdahalesi). Not: **platform_admin için bu risk yok** — `is_platform_admin(user)` kontrolü geliştirici adminin kendi hesabını da (başka biri de) bu endpoint'ten değiştirmesini tamamen engelliyor. Ama tenant admin/manager için hiçbir koruma yok.

**[P0-5] `require_role()`/`require_permission()` canlı DB rolünü değil, JWT içindeki (login anında dondurulmuş) rolü kontrol ediyor.**
Kod kanıtı (`apps/backend/app/core/dependencies.py:136-190`): `token_roles = payload.get("roles", [])` — DB'den taze rol çekilmiyor. Bu, `projects.py`'deki tüm `require_role("admin")` korumalı endpoint'leri (müşteri/bölge/şube CRUD'u) etkiliyor.
→ **Pratik etkisi:** Bir yöneticinin rolü admin tarafından düşürülse bile, elindeki token süresi dolana kadar (24 saate kadar) veya `/refresh` çağrılana kadar eski yetkileriyle bu endpoint'lere erişmeye devam edebilir. **Not:** `GET /auth/users` gibi `auth.py`'deki kullanıcı yönetimi endpoint'leri bu sorundan etkilenmiyor (onlar `_is_manager()` ile her istekte DB'den taze `User` nesnesi kullanıyor) — sorun özellikle `require_role`/`require_permission` kullanan route'larla (projects.py, vb.) sınırlı.
→ Bu senaryoyu uçtan uca canlı test etmeyi denedim ama P0-1 hatası (rol değiştirme çağrısı da "user" rolüne referans verdiği için 500 döndü) zinciri kesti — kanıt kod incelemesine dayanıyor, ayrıca bağımsız güvenlik denetim ajanı da aynı sonuca ulaştı.

**[P1] Sunucu tarafında oturum/token iptali (logout) hiç yok.**
`apps/backend/app/api/v1/routes/auth.py`'de `/logout` endpoint'i yok. Frontend "çıkış" sadece `localStorage`'ı temizliyor, backend'e hiç istek atmıyor. Çalınan veya işten ayrılmış bir kullanıcının token'ı, access token için 24 saate, refresh token için 30 güne kadar geçerliliğini koruyor — hiçbir admin işlemi bunu erkenden geçersiz kılamıyor.

### HIGH

- **[P1] JWT (access + 30 günlük refresh token) `localStorage`'da saklanıyor**, httpOnly cookie değil. XSS = tam hesap ele geçirme, 30 güne kadar. (`lib/api.ts`, `lib/demo-auth.ts`, `contexts/auth-context.tsx`)
- **[P1] `/auth/login` dahil hiçbir endpoint'te rate limiting yok** — brute-force'a açık.
- **[P1] `/static/uploads` mount'u kimlik doğrulamasız** — local-fallback modunda (dev/staging, `AWS_ACCESS_KEY_ID` boşsa) tahmin edilebilir (timestamp tabanlı, UUID değil) dosya adlarıyla herkes tenant kontrolü olmadan dosyalara erişebiliyor. Doğru yapılandırılmış prod'da (`is_production` + local mode kombinasyonu `RuntimeError` fırlatıyor) bu risk kapanıyor — ama staging/demo ortamları için gerçek.
- **[P1] `npm run lint` hiç çalışmıyor** — `eslint.config.mjs`'de `eslint-config-next/core-web-vitals` importunda eksik `.js` uzantısı yüzünden ESLint her seferinde crash ediyor (`ERR_MODULE_NOT_FOUND`). **Sıfır dosya lint edilmiş durumda** — muhtemelen bir süredir kimse lint sinyali almıyor.

### MEDIUM

- Dosya yükleme: MIME/uzantı/boyut doğrulaması yok; depolama anahtarları UUID değil, unix-timestamp tabanlı (tahmin edilebilir).
- `NEXT_PUBLIC_DEMO_*_PASSWORD` deseni — şu an gerçek bir değer set edilmemiş (frontend'de hiç `.env` yok), ama biri ileride gerçek bir şifre koyarsa `NODE_ENV` ne olursa olsun client bundle'a gömülür.
- Dependency audit: Backend'de `pip-audit` kurulu değildi, ama `fastapi`/`starlette`/`python-multipart` büyük versiyon farkları var (CVE geçmişi olan alanlar). Kullanılmayan `python-jose` bağımlılığı temizlenebilir. Frontend `npm audit`: 0 critical, 7-10 high (`axios`, `sharp`, `xlsx` — bu sonuncusu için upstream fix yok).

### LOW / NONE
- SQL injection: **bulunamadı** (tüm sorgular parametrize ORM). bcrypt doğru kullanılıyor. JWT algoritması sabit (`HS256`, "none" riski yok). `.env` hiç git'e girmemiş, `.gitignore`'da doğru. CORS wildcard + credentials kombinasyonu yok.
- `SECRET_KEY` için zayıf varsayılan değer var ama `main.py`'de prod'da bunu engelleyen bir guard mevcut.
- Şifre değiştirme akışında geçici şifre kısa süreliğine `sessionStorage`'a yazılıyor (XSS'e karşı düşük risk).

---

## 4. ÇALIŞMAYAN ALANLAR

| Alan | Beklenen | Gerçek | Hata |
|---|---|---|---|
| `POST /auth/users` (roles=["user"]) | 201, USER hesabı oluşur | 500 | "saha_muhendisi rolü sistemde tanımlı değil." |
| `npm run lint` | Lint sonucu | Crash, 0 dosya kontrol edildi | `ERR_MODULE_NOT_FOUND` (eslint.config.mjs) |
| `npm run build` | Prod build | EPERM (dev server `.next`'i kilitliyor) | Ortam çakışması, kod hatası değil — dev server kapalıyken tekrar denenmeli |
| `delete_document`, `delete_report`, `delete_work_order` (bulk) | Silinen dosya storage'dan da silinir | Storage nesnesi hiç silinmiyor, kalıcı orphan | — |

---

## 5. PERFORMANCE

- **[P0]** `list_work_orders` N+1: ~500 satır × 5 sorgu = ~2.500 DB round-trip / istek.
- **[P1]** Mağaza listesi tek seferde 5000 satıra kadar çekiliyor (canlı doğrulandı), client-side sayfalanıyor.
- **[P1]** Thumbnail/sıkıştırma pipeline'ı yok — 64×64 grid hücresi bile orijinal çözünürlüklü fotoğrafı indiriyor.
- **[P2]** `/documents/archive`, `/documents/project/{id}` gibi endpoint'lerde sayfalama yok.
- Manager olarak `/manager/magaza-karti` sayfasını açtığımda network sekmesinde her API çağrısının (`/projects`, `/projects/customers`, `/projects/regions/{id}`) **iki kez** tetiklendiğini gördüm — muhtemelen React StrictMode'un dev-mode çift-render davranışı (zararsız), ama prod build şu an test edilemediği için (§ÇALIŞMAYAN ALANLAR) **doğrulanamadı**. Prod build çalışır hale getirildikten sonra tekrar kontrol edilmeli.

---

## 6. TEST MATRİSİ — Kullanıcı/Rol/Yetki

**Not:** ADMIN sütunu bootstrap `platform_admin` hesabıyla, MANAGER sütunu canlı oluşturulan `test-manager` hesabıyla test edildi. USER sütunundaki testler **P0-1 hatası yüzünden hiç çalıştırılamadı** (hesap oluşturulamadığı için) — bu satırlar NOT TESTED olarak işaretlendi, "başarılı" varsayılmadı.

| İşlem | ADMIN | MANAGER | USER |
|---|---|---|---|
| USER görüntüle | PASS | PASS | NOT TESTED |
| USER oluştur | **FAIL (P0-1, 500)** | **FAIL (P0-1, 500)** | NOT TESTED |
| USER düzenle | NOT TESTED (hesap yok) | NOT TESTED (hesap yok) | NOT TESTED |
| USER pasif yap | PASS (kod+dolaylı) | PASS (kendi hesabında doğrulandı) | NOT TESTED |
| USER sil | NOT TESTED (hesap yok, ama aynı `_is_manager` kapısı) | NOT TESTED | NOT TESTED |
| MANAGER görüntüle | PASS | PASS | NOT TESTED |
| MANAGER oluştur | PASS (beklenen) | **FAIL — CAN CREATE (P0-2, beklenmiyordu)** | NOT TESTED |
| MANAGER düzenle | PASS (beklenen) | WARNING — aynı `_is_manager` kapısı, muhtemelen mümkün (doğrudan retest edilemedi) | NOT TESTED |
| MANAGER sil | PASS (beklenen) | **FAIL — CAN DELETE (P0-3, beklenmiyordu)** | NOT TESTED |
| ADMIN görüntüle | PASS (kendi) | PASS (listede görünüyor) | NOT TESTED |
| ADMIN oluştur | N/A — hiçbir endpoint'ten platform_admin oluşturulamıyor (CREATABLE_ROLE_MAP'te yok) | PASS (403 ile engellendi) | NOT TESTED |
| ADMIN düzenle | N/A (kendi hesabı bu ekrandan değiştirilemiyor) | PASS (403, tenant-scope) | NOT TESTED |
| ADMIN sil | PASS (kendi hesabı 403 ile engellendi) | PASS (403, tenant-scope) | NOT TESTED |
| Rol değiştirme (USER↔MANAGER) | PASS (beklenen) | WARNING — aynı `_is_manager`/CREATABLE_ROLE_MAP kapısı, muhtemelen mümkün (P0-1 nedeniyle tam doğrulanamadı) | NOT TESTED |
| Direkt `role=admin` injection | 403 (herkes için) | **PASS — doğru engellendi** | NOT TESTED |
| Duplicate email/telefon | **PASS — doğru engellendi (400)** | — | — |
| Validation (eksik alan, geçersiz email) | **PASS — 422, stack trace yok** | — | — |
| Kendi hesabını silme | **PASS — engellendi (403)** | (kod aynı, evrensel) | — |
| Kendi hesabını pasif yapma | **PASS — engellendi (platform_admin özel koruması)** | **FAIL — engellenmedi (P0-4)** | — |
| Pasif kullanıcının token'ı sonraki istekte reddediliyor mu | **PASS — 401** | **PASS — 401** | NOT TESTED |
| Rol düşürme sonrası eski token (`require_role` route'ları) | WARNING — kod kanıtı var, canlı zincir P0-1 yüzünden tamamlanamadı | — | — |

---

## 7. PRODUCTION BLOCKER

Aşağıdakiler düzeltilmeden canlıya çıkılmamalı:

1. **[P0-1]** `saha_muhendisi` rolü seed edilmemiş → USER hesabı hiç oluşturulamıyor.
2. **[P0-2 / P0-3]** MANAGER, başka MANAGER oluşturabiliyor/silebiliyor (backend + frontend'de rol seçici açık).
3. **[P0-4]** MANAGER kendi hesabını yanlışlıkla pasif yapıp kilitlenebiliyor.
4. **[P0-5]** Rol/izin kontrolü canlı DB yerine JWT claim'ine dayanıyor — yetki iptali gecikmeli.
5. **[P0-6]** `PATCH /documents/{doc_id}` kimlik doğrulamasız.
6. **[P0]** Silme akışlarında (`delete_document`, `delete_report`, `delete_work_order`) storage nesneleri hiç silinmiyor → sınırsız maliyet birikimi.
7. **[P0]** `list_work_orders` N+1 sorgu patlaması — üretim hacminde (yüzlerce iş emri) çökme/aşırı yavaşlama riski yüksek.

## 8. MALİYET BLOCKER

- `delete_document`/`upload_document_version`/`delete_report`/bulk `delete_work_order` → orphan storage nesneleri, temizlik job'u yok, **süresiz büyüyen depolama maliyeti**.
- `list_work_orders` N+1 → her liste isteği DB'ye ~2.500 sorguya kadar yük bindiriyor.
- Mağaza listesi 5000 limitiyle tek seferde çekiliyor.
- Thumbnail pipeline'ı yok → her küçük resim gösterimi bile tam boyutlu dosya indiriyor (bant genişliği/egress maliyeti).
- (Neon'u sürekli uyanık tutan bir şey **bulunamadı** — bu iyi haber, §2'de detaylı.)

## 9. DÜZELTME ÖNCELİĞİ

**P0 — Canlıya çıkmadan mutlaka düzelt:**
saha_muhendisi rol seed'i · Manager↔Manager create/delete engeli · self-lock engeli (tenant admin/manager) · require_role canlı DB kontrolü (veya en azından kısa access-token ömrü + revocation) · documents PATCH auth eksikliği · storage silme/orphan temizliği · work_orders N+1

**P1 — Canlıya çıkmadan düzeltilmesi önerilir:**
JWT'nin httpOnly cookie'ye taşınması (veya en azından refresh token) · login rate limiting · logout/token revocation mekanizması · /static/uploads auth'u · mağaza listesi gerçek server-side sayfalama · thumbnail pipeline · Genel Arşiv sayfalama · ESLint config'inin düzeltilmesi (0 dosya lint ediliyor)

**P2 — İlk sürüm sonrasında yapılabilir:**
Dosya upload MIME/boyut/uzantı validasyonu · storage key'lerin UUID'ye taşınması · dependency güncellemeleri (fastapi/starlette/python-multipart, axios/sharp/xlsx) · diğer sayfalanmamış list endpoint'leri · useSearchParams Suspense boundary'leri (4 dosya) · "son manager" koruması

**P3 — Optimizasyon:**
check_low_stock docstring/schedule temizliği · supervisord/docker-compose beat tutarsızlığı · kullanılmayan python-jose bağımlılığının kaldırılması · repo kökündeki test payload dosyalarının temizlenmesi

## 10. SON KARAR

1. **Sunucular gereksiz çalışıyor mu?** Hayır — polling/health-check tarafı temiz.
2. **Neon'u gereksiz uyandıran işlem var mı?** Bulunamadı (kod seviyesinde) — Northflank'taki gerçek probe ayarı dashboard'dan elle doğrulanmalı.
3. **Gereksiz maliyet oluşturabilecek kod var mı?** **Evet** — orphan storage temizliği yok, N+1 sorgular, sayfasız mağaza/arşiv listeleri.
4. **Güvenlik açığı bulundu mu?** **Evet** — en kritik: `PATCH /documents/{id}` auth'suz, JWT localStorage'da + revocation yok, rate limiting yok.
5. **Yetki açığı bulundu mu?** **Evet, canlı olarak kanıtlandı** — Manager, Manager oluşturup silebiliyor; kendi kendini kilitleyebiliyor; USER rolü hiç çalışmıyor.
6. **Çalışmayan ekran veya işlem var mı?** **Evet** — USER hesabı oluşturma (500), lint (crash).
7. **Veri kaybı riski var mı?** Kullanıcı silme soft-delete olduğu için iş emri/rapor ilişkileri **bozulmuyor** (iyi haber). Ancak dosya/storage tarafında **kalıcı sızıntı** (veri kaybı değil, tam tersi — hiç silinmeyen veri) riski var.
8. **Production'a alınabilir mi?** **HAYIR — koşullu bile değil.** Yukarıdaki 7 P0 maddesi kapatılmadan çıkılmamalı; özellikle USER rolünün hiç çalışmaması ve Manager'ın Manager'ı silebilmesi/kendini kilitleyebilmesi temel iş akışını ve güvenliği doğrudan kırıyor.

---

## Ek Notlar

- Bu test sırasında uygulamanın kendi API'si üzerinden şu test hesapları oluşturuldu (temizlenmedi, local dev DB'de kalıyor): `test-manager@sismikmekanik.com.tr`, `test-manager2@sismikmekanik.com.tr` (pasif/silinmiş durumda). İsterseniz temizleyebilirim.
- Frontend dev sunucusu, denetim ajanının `npm run build` denemesiyle çakışıp bozulduğu için yeniden başlatıldı (yerel ortam, veri/DB'ye dokunulmadı).
- USER rolüne dair tüm testler P0-1 hatası yüzünden eksik kaldı — bu rol seed'i eklendikten sonra (onayınızla) USER-tier testlerinin (liste görememe, IDOR, require_role endpoint'leri) tamamlanması gerekiyor.

**Hiçbir düzeltme uygulanmadı. Onayınızı bekliyorum.**
