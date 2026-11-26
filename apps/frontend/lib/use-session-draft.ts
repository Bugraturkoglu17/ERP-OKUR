"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Formun kaydedilmemiş hâlini sekme boyunca (sessionStorage) saklar: kullanıcı başka sayfaya gidip
 * dönünce kaldığı yerden devam eder. Kayıt başarılı olunca clear() çağrılır.
 * restored: taslak geri yüklendiyse true (ekranda "Temizle" seçeneği göstermek için).
 * Form başlangıç hâlindeyken taslak tutulmaz.
 */
export function useSessionDraft<T>(key: string, initial: T) {
  const storageKey = `draft:${key}`;
  const initialJson = useRef(JSON.stringify(initial));
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Sunucu çıktısıyla uyumsuzluk olmasın diye taslak ilk çizimden sonra okunur.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw && raw !== initialJson.current) {
        setValue({ ...JSON.parse(initialJson.current), ...JSON.parse(raw) });
        setRestored(true);
      }
    } catch { /* bozuk taslak yok sayılır */ }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const json = JSON.stringify(value);
      if (json === initialJson.current) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, json);
    } catch { /* depolama doluysa taslak tutulmaz */ }
  }, [loaded, storageKey, value]);

  const clear = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch { /* yok say */ }
    setValue(JSON.parse(initialJson.current));
    setRestored(false);
  }, [storageKey]);

  /** Kayıt tamamlandı: taslak silinir, ekrandaki değerler (ör. başarı mesajı için) korunur. */
  const finish = useCallback(() => {
    setLoaded(false);
    try { sessionStorage.removeItem(storageKey); } catch { /* yok say */ }
  }, [storageKey]);

  return { value, setValue, restored, clear, finish };
}
