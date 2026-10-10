"use client";

import { useEffect } from "react";

// iOS Safari (ve Android Chrome) ekranın sol/sağ kenarına yakın başlayan
// tek-parmak sürüklemeyi "tarayıcı geçmişinde geri/ileri git" jesti olarak
// yorumluyor — sayfa kayıp bir önceki route'a düşüyor.
//
// ÖNEMLİ: WebKit'in kendi kenar-jesti tanıyıcısı (edge gesture recognizer)
// dokunuş başladığı anda (touchstart) takibe geçiyor ve JS tarafında
// touchmove'u bekleyip "yatay mı?" diye karar vermek ÇOK GEÇ kalıyor —
// jest o ana kadar zaten WebKit tarafına "kapılmış" oluyor. Bu yüzden
// touchstart anında, dokunuş kenara EDGE_THRESHOLD_PX kadar yakınsa hemen
// preventDefault çağırıyoruz. Eşik, gerçek buton/link dokunma alanlarını
// bozmayacak kadar dar tutuluyor (iOS'un kendi jest tanıma bandı da
// benzer genişlikte, ~15-20px).
const EDGE_THRESHOLD_PX = 16;

export function EdgeSwipeGuard() {
  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const nearEdge = touch.clientX <= EDGE_THRESHOLD_PX || touch.clientX >= window.innerWidth - EDGE_THRESHOLD_PX;
      if (nearEdge && event.cancelable) {
        event.preventDefault();
      }
    };

    // passive:false zorunlu — aksi halde preventDefault etkisiz kalır.
    document.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });
    return () => document.removeEventListener("touchstart", onTouchStart, { capture: true });
  }, []);

  return null;
}
