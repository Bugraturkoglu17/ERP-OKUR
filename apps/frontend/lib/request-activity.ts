// Devam eden API isteği sayacı (27.11.2026). "Yenile"nin yükleme ekranı, ekranın verisi
// tamamen gelince (sayaç sıfırlanınca) kalkar. Sayaç lib/api.ts'teki axios kesicilerinde tutulur.
let pending = 0;

export function beginRequest(): void {
  pending += 1;
}

export function endRequest(): void {
  pending = Math.max(0, pending - 1);
}

/**
 * İstekler başlasın diye kısa bir süre bekler, sonra devam eden istek kalmayana kadar bekler.
 * En az `minMs` sürer (yükleme ekranı yanıp sönmesin), en çok `maxMs` (takılırsa ekran kilitli kalmasın).
 */
export function waitForRequestsIdle({ minMs = 400, maxMs = 15000 } = {}): Promise<void> {
  const started = Date.now();
  let idleChecks = 0;
  return new Promise((resolve) => {
    const check = () => {
      const elapsed = Date.now() - started;
      // Zincirli istekler (biri bitince diğeri başlayan) arasında sayaç kısa süre 0 olabilir;
      // art arda iki kontrolde (~200 ms) boş kalınca bitmiş sayılır.
      idleChecks = pending === 0 ? idleChecks + 1 : 0;
      if (elapsed >= maxMs || (elapsed >= minMs && idleChecks >= 2)) resolve();
      else window.setTimeout(check, 100);
    };
    // Sayfaların yükleme effect'leri isteklerini başlatsın diye ilk kontrol biraz gecikmeli.
    window.setTimeout(check, 120);
  });
}
