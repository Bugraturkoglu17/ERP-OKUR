"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordVisit } from "@/lib/nav-history";

/** Ziyaret edilen sayfaları sekme geçmişine yazar (bkz. BackLink). */
export function NavTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (pathname) recordVisit(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);
  return null;
}
