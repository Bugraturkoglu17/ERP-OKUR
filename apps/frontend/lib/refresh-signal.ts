"use client";

import { useEffect, useState } from "react";

// Üst çubuktaki "Yenile" düğmesinin sinyali (27.11.2026).
// Sürekli sorgu (zamanlayıcı) yok: veri yalnız ekran açılınca ve kullanıcı "Yenile"ye basınca çekilir.
// Sinyali dinleyen ekran verisini yerinde yeniler (açık sekme, yazılan not korunur);
// dinleyen ekran yoksa kabuk sayfayı baştan kurar.
export const REFRESH_EVENT = "erp:refresh";

let subscribers = 0;

/** Yenile isteğini yayar; en az bir ekran dinliyorsa true döner. */
export function requestRefresh(): boolean {
  window.dispatchEvent(new Event(REFRESH_EVENT));
  return subscribers > 0;
}

/** Her "Yenile"de artan sayı. Yükleme effect'inin bağımlılığına eklenir; ilk açılışta 0'dır. */
export function useRefreshSignal(): number {
  const [signal, setSignal] = useState(0);
  useEffect(() => {
    subscribers += 1;
    const onRefresh = () => setSignal((value) => value + 1);
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      subscribers -= 1;
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, []);
  return signal;
}
