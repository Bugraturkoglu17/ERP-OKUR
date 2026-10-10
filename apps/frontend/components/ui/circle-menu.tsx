"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEM = 44; // px — tetikleyici ve öğe çapı
const GAP = 10; // px — öğeler arası boşluk

export type CircleMenuItem = {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  /** Filtre gibi durumu olan öğelerde şu an aktif olduğunu gösterir (mavi halka). */
  active?: boolean;
};

/**
 * Tıklayınca açılan kompakt "navigator" menüsü. Kapalıyken sadece bir "≡"
 * tetikleyici; açılınca öğeler tek bir sırada, hafif bir CSS geçişiyle
 * (framer-motion YOK — kasma/gecikme olmasın diye) tetikleyicinin yanından
 * kayarak belirir. Simgelerin üzerine gelince ne oldukları etiketle görünür.
 *
 * direction="right" (varsayılan): öğeler tetikleyicinin YANINDAN başlayıp
 * SAĞA doğru aynı hizada açılır. direction="up": yukarı doğru açılır.
 */
export function CircleMenu({
  items,
  direction = "right",
  className,
}: {
  items: CircleMenuItem[];
  direction?: "right" | "up";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Rota değişince menü kesin kapansın. Bir öğe router.push yapıp sayfa
  // değişse bile açık kalmasın — "başka ekrana geçince sol tarafta duruyor"
  // bug'ına karşı güvence.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (items.length === 0) return null;

  const spacing = ITEM + GAP;

  return (
    <div className={cn("relative inline-flex", className)} style={{ width: ITEM, height: ITEM }}>
      {/* Dışarı tıklayınca kapat — sadece menü AÇIKKEN DOM'da. */}
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "İşlem menüsünü kapat" : "İşlemler"}
        aria-expanded={open}
        title="İşlemler"
        className="relative z-20 flex items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform duration-150 ease-out hover:brightness-110 active:scale-95"
        style={{ width: ITEM, height: ITEM }}
      >
        {open ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
      </button>

      {/* Öğeler — her zaman DOM'da ama kapalıyken opacity-0 + pointer-events-none,
          tetikleyicinin tam arkasında (translate 0). Açılınca CSS transform ile
          kayarlar; stagger, transition-delay ile. */}
      {items.map((item, i) => {
        const offset = (i + 1) * spacing;
        const tx = direction === "right" ? offset : 0;
        const ty = direction === "up" ? -offset : 0;
        return (
          <button
            key={item.label}
            type="button"
            title={item.label}
            onClick={() => {
              item.onClick?.();
              setOpen(false);
            }}
            style={{
              width: ITEM,
              height: ITEM,
              transform: open ? `translate(${tx}px, ${ty}px)` : "translate(0px, 0px)",
              transitionDelay: `${(open ? i : items.length - 1 - i) * 25}ms`,
            }}
            className={cn(
              "group absolute left-0 top-0 z-20 flex items-center justify-center rounded-full bg-muted text-foreground shadow-md",
              "transition-[transform,opacity] duration-200 ease-out",
              open ? "opacity-100" : "pointer-events-none opacity-0",
              item.active && "ring-2 ring-blue-500 ring-offset-1",
            )}
          >
            {item.icon}
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[11px] font-medium text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
