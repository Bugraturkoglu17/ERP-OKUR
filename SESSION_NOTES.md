# Mekanik ERP — Oturum Notları (2026-07-10)

## Son Commit
`c44ce44` → `bugra` remote'a push edildi (`main` branch)

---

## Bu Oturumda Yapılanlar

### 1. Timezone Bug Fix (CompletionConfirmModal)
**Sorun:** "Tadilatı Tamamla" / "İşi Tamamla" butonuna basınca "Network Error" çıkıyordu.
**Kök neden:** `new Date().toISOString()` → `"2026-07-10T10:00:00.000Z"` üretiyor.
`Z` suffix'i Pydantic v2'nin timezone-aware datetime parse etmesine yol açıyor.
asyncpg bunu `TIMESTAMP WITHOUT TIME ZONE` kolonuna yazamıyor → connection reset → Axios "Network Error".

**Frontend fix** (tadilat + yeni-yapim her ikisinde):
```ts
completed_at: new Date().toISOString().split(".")[0]  // "Z" ve ms kaldırılır
```

**Backend fix** (store_process.py — update_process ve update_stage):
```python
if isinstance(value, datetime) and value.tzinfo is not None:
    value = value.replace(tzinfo=None)
```

---

### 2. Tamamlanan Tadilatlar — Boş Liste Fix
**Sorun:** `/tadilat/tamamlanan` sayfası hiç kayıt göstermiyordu.
**Kök neden:** Eski filtre `scope_codes.includes("tadilat")` kullanıyordu ama scope_codes `["yangin_dolabi"]` gibi değerler tutuyor.

**Fix:** Backend'e `/process/completed-jobs` endpoint eklendi:
- `store_processes` tablosunda `status == "completed"` VE `work_type IN ("tadilat", "yeni_yapim")` kayıtları döner
- Frontend bu endpoint'i kullanır

---

### 3. Yeni Yapım Modülü — Tadilat ile Aynı Yapıya Getirme

#### ANA SORUN
Yeni Yapım sayfasında bir işe tıklayınca Mağaza Kartı (`/projects/...?tab=process`) açılıyordu.
Olması gereken: **Yeni Yapım Klasörü** (`/yeni-yapim/surecleri/${id}?p=${projectId}`)

#### Değiştirilen Dosyalar

**`apps/frontend/app/yeni-yapim/page.tsx`** — TAM YENİDEN YAZIM
- Tüm yanlış linkler düzeltildi
- ActionMenu → `/yeni-yapim/surecleri/${process.id}?p=${projectId}`
- Duplicate warning → `/yeni-yapim/surecleri/${dupProcess.id}?p=${selProject.id}`
- Mağaza grubu satırları → `/yeni-yapim/surecleri/${proc.id}?p=${project.id}`
- Aktif iş listesi → `/yeni-yapim/surecleri/${j.process_id}?p=${j.project_id}`
- Wizard tamamlandığında: `router.push(...)` kaldırıldı → `load()` ile yenileme
- İki sekme: "Aktif İş Kalemleri" (flat liste) + "Mağaza Grupları"
- Özet istatistikler: Aktif Mağaza / Aktif İş Kalemi / Süre Aşımı

**`apps/frontend/app/yeni-yapim/surecleri/[id]/page.tsx`** — YENİ DOSYA
- `YeniYapimKlasorPage` component (~750 satır)
- Tadilat klasörünün emerald renkli klonu
- 7 sekme: Özet, Süreç Takibi, Proje Dosyaları, Revizyonlar, Hakkedişler, Faturalar, Notlar
- Timezone-safe `completed_at`: `new Date().toISOString().split(".")[0]`
- Filtreler: `payment_type === "yeni_yapim"`, `invoice_type.startsWith("yeni_yapim_")`
- Doc types: `yeni_yapim_proje`, `yeni_yapim_onay`, `yeni_yapim_uygulama`, `yeni_yapim_teklif`, `yeni_yapim_diger`
- Revizyon: `yeni_yapim_revizyon`
- Fatura: `yeni_yapim_avanssiz`, `yeni_yapim_avansli`
- CompletionConfirmModal: "İşi Tamamla" butonu, timezone-safe

**`apps/frontend/app/yeni-yapim/tamamlanan/page.tsx`** — YENİ DOSYA
- `TamamlananYeniYapimPage` component
- `/process/completed-jobs` → `work_type === "yeni_yapim"` filter
- Hakkediş/fatura durumu takibi
- Klasör → `/yeni-yapim/surecleri/...`, Kart → `/projects/...` (read-only)

**`apps/frontend/app/yeni-yapim/surecleri/page.tsx`** — GÜNCELLEME
- Tüm "Sürece Git" linkleri → `/yeni-yapim/surecleri/${j.process_id}?p=${j.project_id}`

**`apps/frontend/lib/navigation.ts`** — GÜNCELLEME
- Yeni Yapım nav grubuna "Tamamlanan İşler" → `/yeni-yapim/tamamlanan` eklendi
- Mevcut nav: Yeni Yapım İşleri | Yeni Yapım Süreçleri | Tamamlanan İşler | Yeni Yapım Hakedişleri

**`apps/backend/app/api/v1/routes/store_process.py`** — 3 FIX

Fix 1 — `update_process` endpoint: `_mark_project_existing` guard
```python
if body.status == "completed" and getattr(proc, "work_type", None) == "yeni_yapim":
    other = await db.execute(
        select(StoreProcess).where(
            StoreProcess.project_id == proc.project_id,
            StoreProcess.work_type == "yeni_yapim",
            StoreProcess.status != "completed",
            StoreProcess.id != proc.id,
        )
    )
    if not other.scalars().first():
        await _mark_project_existing(db, proc.project_id)
```

Fix 2 — `update_stage` endpoint: aynı guard
```python
if proc.progress_percent == 100 and proc.work_type != "tadilat":
    proc.status = "completed"
    proc.completed_at = utc_now()
    if getattr(proc, "work_type", None) == "yeni_yapim":
        other = ...  # aynı kontrol
        if not other.scalars().first():
            await _mark_project_existing(...)
```

Fix 3 — `get_completed_jobs` endpoint:
```python
StoreProcess.work_type.in_(["tadilat", "yeni_yapim"])
```

---

## Sunucu Başlatma

```powershell
# 1. PostgreSQL
& "C:\Users\bturkoglu\postgresql\pgsql\bin\pg_ctl.exe" start -D "C:\Users\bturkoglu\postgresql\data" -l "C:\Users\bturkoglu\postgresql\postgres.log"

# 2. Backend (yeni cmd penceresi)
cd C:\Users\bturkoglu\mekanik-erp\apps\backend
venv\Scripts\activate
venv\Scripts\uvicorn.exe app.main:app --reload --port 8000

# 3. Frontend (yeni cmd penceresi)
cd C:\Users\bturkoglu\mekanik-erp\apps\frontend
npm run dev
```

**NOT:** Port 8000'de başka bir Python app (klima uygulaması) çalışıyor olabilir.
Kontrol: `(Invoke-WebRequest http://localhost:8000/api/v1/openapi.json).Content | ConvertFrom-Json | Select -Expand info`
Doğru backend ise `title` değeri mekanik-erp ile ilgili bir şey döner.

---

## Login Sistemi

- Backend: **şifresiz login** — sadece e-posta DB'de var mı kontrol ediyor
- Format: `application/x-www-form-urlencoded` → `username=email&password=herhangi`
- Kullanıcı: `bturkoglu@migros.com.tr` → herhangi bir şifre ile giriş

---

## Bekleyen / Henüz Test Edilemeyen

- [ ] Yeni Yapım sayfası UI testi (giriş yapıp `/yeni-yapim` açmak)
- [ ] Wizard akışı: Yeni mağaza oluştur → süreç başlat → klasöre git
- [ ] CompletionConfirmModal — "İşi Tamamla" → timezone fix çalışıyor mu?
- [ ] `_mark_project_existing` — tüm süreçler tamamlanınca mağaza → existing_store
- [ ] `/yeni-yapim/hakkedisler` sayfasının linkleri (henüz kontrol edilmedi)

---

## Mimari Kararlar

| Kural | Açıklama |
|-------|----------|
| Mağaza Arşivi read-only | `/projects/*` sadece görüntüleme, yönetim yeni-yapim modülünde |
| work_type ayrımı | `tadilat`, `yeni_yapim`, `bakim` — tüm filtrelemeler buna göre |
| Renk sistemi | Tadilat = amber, Yeni Yapım = emerald, Bakım = blue |
| timezone fix | `new Date().toISOString().split(".")[0]` — "Z" ve ms kaldırılır |
| completed-jobs | Backend endpoint: status=completed + work_type IN (...) |
