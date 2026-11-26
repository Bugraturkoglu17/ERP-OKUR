# Düzeltilecekler

Kodlama sırasında fark edilen, sonraki derlemeyle birlikte yapılacak küçük düzeltmeler ve gün sonu işleri.
Yapılan madde işaretlenir (`[x]`) ve altına kısa not düşülür.

## Açık

- [ ] **DEVİR (26.11.2026 akşam) · Keşif / kontrol listesi şablonu — kodlandı, henüz derlenip denenmedi.**
  Yapılan: firma kontrol listesi şablonu (tablo `installation_checklist_templates`, migration `20261126_03`
  uygulandı), `GET/PUT /installation-projects/checklist-templates` (kaydedince devam eden projelerin tamamlanmamış
  adımları eşitlenir), proje başlığında "Kontrol listelerini düzenle" penceresi (`ChecklistTemplatesDialog`),
  adım panelinde "Planlanan bitiş" ve projeye özel "Yeni madde ekle" kaldırıldı, kontrol listesi "zorunlu",
  Üretim ve Montaj'a tek termin (`PUT /{id}/phase-due`), başlıklar büyük harf (Üretim ve Montaj, Montaj ve Test,
  Projelendirme ve Teklif, Müşteri Onayı). Tip kontrolü temiz.
  Kalan: arayüzü derle (`scripts\start_okur_web.bat`), pencereyi ve termin alanını tarayıcıda dene, ekran görüntüsüyle
  kullanıcı onayı al. Sonra sıradaki konu: **Teklif** aşaması.

- [ ] **Analiz · Üretim no:** Üretim no projenin kimliği gibidir; İstatistikler'de ve aramada kullanılacak
  (kullanıcı "sonraki tura" dedi, kapsam ayrıca konuşulacak). (26.11.2026)

- [ ] **Gün sonu · Marka:** OKUR adı/logosu geçici gizli. Geri açmak için `apps/frontend/.env.local` içinden
  `NEXT_PUBLIC_HIDE_BRAND=true` satırını silip arayüzü yeniden derle. (26.11.2026)
- [ ] **Gün sonu · Tasarım:** Tüm ekranların yazı boyutu / düzeni tek ölçeğe getirilecek (proje Özet ekranı örnek alınacak). (26.11.2026)
- [ ] **shadcn yaygınlaştırma:** Pilot (proje detayı) beğenilirse diğer ekranlara geçirilecek. (26.11.2026)
- [ ] **Analiz · Aşama kayıt listesi:** Firma geneli kayıtlar (`/installation-projects/stage-events`) İstatistikler'de tablo
  ve/veya Excel olarak gösterilecek. (26.11.2026)

## Yapıldı

- [x] **Proje detayı · Aşamalar:** Tek adımlı ana aşamada (Keşif) panel başlığında ad iki kez görünüyordu.
  Üst satır artık yalnız çok adımlı ana aşamada ("Üretim ve montaj · Adım 1 / 2") gösteriliyor. (26.11.2026)
- [x] **Geri dönüş:** Projede "İş emri bağla → Yeni iş emri aç" sonrası geri, projeye değil İş Emirleri listesine
  gidiyordu (form ilk çizimde geçmişi okuyordu, sayfa henüz kayda geçmemişti). Düzeltildi; kaydedilmiş formlar
  geri dönüşte atlanıyor, kayıt sonrası iş emri / proje formun yerine açılıyor. (26.11.2026)
