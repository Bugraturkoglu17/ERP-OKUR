"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { labelForPath, previousPath } from "@/lib/nav-history";

/**
 * "Geri" bağlantısı: kullanıcının geldiği uygulama sayfasına döner. Hedef hemen bir önceki sayfaysa
 * tarayıcı geri kullanılır (o sayfanın kaldığı yer korunur); arada atlanan bir form varsa doğrudan
 * hedefe gidilir. Geçmiş yoksa (sayfa doğrudan açıldıysa) verilen listeye gider.
 */
export function BackLink({ fallbackHref, fallbackLabel, className }: {
  fallbackHref: string; fallbackLabel: string; className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [prev, setPrev] = useState<{ path: string; immediate: boolean } | null>(null);

  // Adres çubuğundaki tam yol (sorgu dahil) ile geçmişte bir önceki sayfa bulunur.
  useEffect(() => {
    setPrev(previousPath(`${window.location.pathname}${window.location.search}`));
  }, [pathname]);

  const target = prev?.path ?? fallbackHref;
  return (
    <a
      href={target}
      onClick={(event) => {
        event.preventDefault();
        if (prev?.immediate && window.history.length > 1) router.back();
        else router.push(target);
      }}
      className={className ?? "inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"}
    >
      <ArrowLeft className="h-4 w-4" />{prev ? labelForPath(prev.path) : fallbackLabel}
    </a>
  );
}
