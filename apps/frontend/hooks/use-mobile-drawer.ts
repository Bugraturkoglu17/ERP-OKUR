"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Mobil menü yalnızca hamburger, kapatma düğmesi ve backdrop ile yönetilir. */
export function useMobileDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const openDrawer = useCallback(() => setOpen(true), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlHeight = html.style.height;
    const prevBodyHeight = body.style.height;

    // iOS/Safari ve diğer mobil tarayıcılar için scroll kilitleme
    html.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.height = "100%";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.height = prevHtmlHeight;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
    };
  }, [open]);

  return { open, openDrawer, close };
}
