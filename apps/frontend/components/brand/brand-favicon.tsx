"use client";

import { useEffect } from "react";
import { HIDE_BRAND, NEUTRAL_ICON } from "@/lib/brand";

/**
 * Marka gizliyken (NEXT_PUBLIC_HIDE_BRAND=true) app/icon.png ve apple-icon.png ile gelen
 * OKUR ikonlarını nötr ikonla değiştirir. Next başlığa yeni ikon bağlantısı eklerse yeniden uygular.
 */
export function BrandFavicon() {
  useEffect(() => {
    if (!HIDE_BRAND) return;
    const apply = () => {
      document.head
        .querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]')
        .forEach((link) => {
          if (link.getAttribute("href") === NEUTRAL_ICON) return;
          link.setAttribute("href", NEUTRAL_ICON);
          link.setAttribute("type", "image/svg+xml");
          link.removeAttribute("sizes");
        });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
