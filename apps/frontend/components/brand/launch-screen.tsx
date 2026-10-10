"use client";

import { BrandMark, type BrandTone } from "@/components/brand/brand-mark";

/**
 * Uygulamanın SOĞUK açılışında (PWA cold boot / sekme yenileme) gösterilen
 * TEK açılış ekranı: koyu zemin, logo dolum animasyonu + logonun üzerinden
 * geçen ışık hüzmesi, marka yazısı ve altında ince kayan bir çizgi.
 *
 * Akış (RoleGuard yönetir):
 *  - İçerik (children) bu ekran görünürken ARKA PLANDA mount olur, güncel
 *    verisini çeker.
 *  - Açılış animasyonu (logo dolumu + ışık hüzmesi, ~2,3 sn) TAMAMLANMADAN
 *    içeriğe geçilmez.
 *  - Animasyon bitince RoleGuard `leaving` verir → ekran 380 ms'de fade olur
 *    ve ardından ağaçtan kaldırılır (sert kesme yok).
 *
 * Kök yönlendirme sayfası (app/page.tsx) bu bileşeni DEĞİL, sade koyu bir
 * katman gösterir — böylece animasyon iki kez başlamaz ("ışık açılıp
 * kapanıyor" hatası).
 */
export function LaunchScreen({
  tone = "red",
  status = "Oturum kontrol ediliyor",
  leaving = false,
}: {
  tone?: BrandTone;
  /** Alt satırdaki durum metni. null verilirse çizgi + metin gizlenir. */
  status?: string | null;
  /** true → ekran opacity 0'a fade olur (RoleGuard, animasyon + oturum hazır olunca verir). */
  leaving?: boolean;
}) {
  return (
    <div
      className="erp-launch-screen"
      data-leaving={leaving ? "true" : undefined}
      aria-label="SİSMİK Kurumsal Operasyon Sistemi açılıyor"
      aria-live="polite"
    >
      <div className="erp-launch-ambient" />
      <div className="relative flex flex-col items-center">
        <BrandMark tone={tone} animated className="h-28 w-28 sm:h-32 sm:w-32" />
        <div className="erp-launch-wordmark mt-5 text-center">
          <p className="text-[1.65rem] font-black tracking-[0.3em] text-white">SİSMİK</p>
          <p className="mt-2 text-[10px] font-semibold tracking-[0.22em] text-white/50">KURUMSAL OPERASYON SİSTEMİ</p>
        </div>
        {status && (
          <div className="erp-launch-wordmark mt-8 flex flex-col items-center gap-2.5">
            <div className="erp-launch-progress h-0.5 w-40 overflow-hidden rounded-full bg-white/10" />
            <p className="text-[10px] font-medium tracking-[0.18em] text-white/40">
              {status.toLocaleUpperCase("tr-TR")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
