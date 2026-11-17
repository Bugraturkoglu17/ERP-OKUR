"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const HEADER_SLOT_ID = "shell-header-slot";

/**
 * Sayfaya özel düğmeleri (ör. İstatistikler'deki "Yenile") panelin üst şeridine yerleştirir.
 * Şerit CorporateShell içindedir; sayfa bu bileşenle oraya içerik gönderir.
 */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.getElementById(HEADER_SLOT_ID)); }, []);
  return target ? createPortal(children, target) : null;
}
