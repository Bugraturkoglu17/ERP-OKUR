"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolbarDockAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** default: nötr gri · primary: mavi vurgu · danger: kırmızı (silme gibi yıkıcı işlemler) */
  variant?: "default" | "primary" | "danger";
  /** Filtre/seçim listelerinde şu an seçili olan öğeyi işaretler (✓ ile). */
  active?: boolean;
};

/**
 * Tek bir "≡" (üç çizgi) tetikleyici — tıklanınca satırdaki tüm işlemleri
 * (Aç, İndir, Mağazaya Aktar, Sil vb.) tek bir kompakt panelde açar.
 *
 * Amaç: tablo/liste satırlarında yan yana dizilmiş küçük ikon butonlarının
 * (her biri ayrı dokunma hedefi, dar ekranda sığmayıp yatay kaydırmaya
 * zorlayan bir sütun) yerini TEK bir buton alsın — satır genişliği kısalır,
 * paneldeki her işlem ise kendi başına geniş/kolay dokunulur bir hedef olur.
 *
 * direction="down"  → tetikleyicinin altında, ikon+etiketli dikey liste
 *                      (dar sütunlar, çok işlem — örn. tablo satırları için).
 * direction="side"  → tetikleyicinin yanında, ikonlardan oluşan yatay bir
 *                      "dock" satırı (geniş alan, az işlem, tek bakışta
 *                      görünmesi istenen yerler için).
 */
export function ToolbarDock({
  actions,
  direction = "down",
  align = "end",
  trigger,
  triggerClassName,
  panelClassName,
  className,
}: {
  actions: ToolbarDockAction[];
  direction?: "down" | "side";
  /** Panelin tetikleyiciye göre hangi kenara hizalanacağı/açılacağı. */
  align?: "start" | "end";
  /** Verilirse varsayılan "≡" ikonu yerine ikon+etiket+ok gösteren bir
      "seçim" tetikleyicisi render edilir — aktif filtre/seçenek burada
      görünür (örn. dosya türü filtresi). */
  trigger?: { icon: LucideIcon; label: string };
  triggerClassName?: string;
  /** direction="down" panelinin sınıfları (örn. "w-36" ile daralt) — dar ekranda
      kenardaki kartların menüsü ekran dışına taşmasın diye. */
  panelClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // direction="down" panel'i satır ekranın altına yakınsa aşağı taşarak
  // kırpılıyordu (tablo kabı overflow-hidden). Açarken altta yer yoksa
  // yukarı doğru aç.
  const [flipUp, setFlipUp] = useState(false);
  // Panel `position: fixed` ile ekrana göre konumlanır: tetikleyicinin atalarından
  // biri overflow-hidden/auto ise (kart, tablo kabı, sekme kutusu) absolute panel
  // o kabın kenarında kırpılıyordu (son satır "Sil" görünmüyordu).
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Sabit konumlu panel sayfa kayınca tetikleyiciden ayrılır → kaydırınca kapat.
    const close = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && direction === "down" && rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const estimatedHeight = actions.length * 40 + 16;
        const up = spaceBelow < estimatedHeight && rect.top > spaceBelow;
        setFlipUp(up);
        const viewportW = document.documentElement.clientWidth;
        setPos({
          ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
          ...(align === "end" ? { right: Math.max(4, viewportW - rect.right) } : { left: Math.max(4, rect.left) }),
        });
      }
      return next;
    });
  };

  // Görünür işlem yoksa (hepsi çağıran tarafından koşullu olarak kaldırılmışsa)
  // boş bir tetikleyici basmayalım.
  if (actions.length === 0) return null;

  const variantCls = (v?: ToolbarDockAction["variant"]) =>
    v === "danger"
      ? "text-red-500 hover:bg-red-50 hover:text-red-600"
      : v === "primary"
        ? "text-blue-600 hover:bg-blue-50"
        : "text-slate-500 hover:bg-slate-100 hover:text-slate-800";

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        aria-label={trigger ? trigger.label : "İşlemler"}
        aria-haspopup="menu"
        aria-expanded={open}
        title={trigger ? trigger.label : "İşlemler"}
        className={
          trigger
            ? cn(
                // Sabit genişlik: etiket kısa ("DWG") ya da uzun ("Mağazaya
                // Aktarılanlar") olsun, buton her zaman AYNI genişlikte
                // kalır — aksi halde yanındaki elemanlar (yenile butonu vb.)
                // seçime göre sağa/sola kayıyordu.
                "flex w-44 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:w-48",
                open
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                triggerClassName,
              )
            : cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700",
                open && "bg-slate-100 text-slate-700",
                triggerClassName,
              )
        }
      >
        {trigger ? (
          <>
            <trigger.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{trigger.label}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
          </>
        ) : (
          <Menu className="h-4 w-4" />
        )}
      </button>

      {open && (
        <>
          {/* Dışarı tıklanınca / sayfa kaydırılınca kapansın. */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} onScroll={() => setOpen(false)} />

          {direction === "down" ? (
            <div
              role="menu"
              style={pos}
              data-flip={flipUp ? "up" : "down"}
              className={cn(
                "fixed z-40 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
                panelClassName,
              )}
            >
              {actions.map((a) => (
                <button
                  key={a.key}
                  role="menuitem"
                  aria-current={a.active}
                  onClick={(e) => { e.stopPropagation(); a.onClick(); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors",
                    a.active ? "bg-blue-50 text-blue-700" : variantCls(a.variant),
                  )}
                >
                  <a.icon className={cn("h-3.5 w-3.5 shrink-0", a.active && "text-blue-600")} />
                  <span className="flex-1 truncate">{a.label}</span>
                  {a.active && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
                </button>
              ))}
            </div>
          ) : (
            <div
              role="menu"
              className={cn(
                "absolute top-1/2 z-40 flex -translate-y-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg",
                align === "end" ? "right-full mr-2" : "left-full ml-2",
              )}
            >
              {actions.map((a) => (
                <button
                  key={a.key}
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); a.onClick(); setOpen(false); }}
                  title={a.label}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                    variantCls(a.variant),
                  )}
                >
                  <a.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
