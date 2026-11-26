# Düzeltilecekler

Kodlama sırasında fark edilen, sonraki derlemeyle birlikte yapılacak küçük düzeltmeler ve gün sonu işleri.
Yapılan madde işaretlenir (`[x]`) ve altına kısa not düşülür.

## Açık

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
