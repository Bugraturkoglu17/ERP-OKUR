"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type PickerOption = {
  id: string;
  name: string;
  spec?: string | null;
  brand?: string | null;
  sku: string;
  /** Satırın altında gösterilen kısa bilgi, örn. "Stok 12,5 metre". */
  hint?: string;
};

/** Malzeme kodu (kırmızı OKUR numaratörü) + ad + tip: "110 – BAKIR BORU KANGAL 18*0,70". */
export function MaterialTitle({ sku, name, spec, className = "" }: { sku: string; name: string; spec?: string | null; className?: string }) {
  return (
    <span className={`break-words ${className}`}>
      <span className="font-bold tabular-nums text-[#d90070]">{sku}</span>
      <span className="mx-1.5 text-slate-300">–</span>
      {name}{spec ? ` ${spec}` : ""}
    </span>
  );
}

/** Türkçe harfleri ve büyük/küçük farkını yok sayan arama anahtarı. */
export function foldText(value: string): string {
  return value
    .replace(/İ/g, "i").replace(/I/g, "i").replace(/ı/g, "i")
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u");
}

/**
 * Uzun malzeme adlarını telefonda taşırmadan seçtiren, aranabilir seçici.
 * Küçük ekranda alttan açılan bir sayfa, geniş ekranda ortada pencere olur.
 */
export function MaterialPicker({ options, value, onChange, placeholder = "Malzeme seçin", disabledIds, ariaLabel = "Malzeme", compact = false }: {
  options: PickerOption[]; value: string; onChange: (id: string) => void;
  placeholder?: string; disabledIds?: Set<string>; ariaLabel?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", onKey, true);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => { window.removeEventListener("keydown", onKey, true); window.clearTimeout(timer); };
  }, [open]);

  const visible = useMemo(() => {
    const terms = foldText(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return options;
    return options.filter((option) => {
      const haystack = foldText([option.name, option.spec, option.brand, option.sku].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    });
  }, [options, query]);

  const close = () => { setOpen(false); setQuery(""); };

  return (
    <>
      <button type="button" aria-label={ariaLabel} aria-haspopup="dialog" onClick={() => setOpen(true)}
        className={`flex w-full min-w-0 items-center justify-between gap-1.5 border border-slate-200 bg-white text-left outline-none focus:border-blue-500 ${compact ? "min-h-[2rem] rounded-lg px-2 py-0.5 text-[11px] leading-tight" : "rounded-xl px-3 py-2.5 text-sm"}`}>
        <span className={`min-w-0 flex-1 ${compact ? "line-clamp-2 break-words" : "break-words"} ${selected ? "font-medium text-slate-900" : "text-slate-400"}`}>
          {selected ? <MaterialTitle sku={selected.sku} name={selected.name} spec={selected.spec} /> : placeholder}
        </span>
        {!compact && <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={ariaLabel}
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[80dvh] sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center gap-2 border-b border-slate-100 p-3">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, tip, marka veya kod ara"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-base outline-none focus:border-blue-500 sm:text-sm" />
              </div>
              <button type="button" onClick={close} aria-label="Kapat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              {visible.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Eşleşen malzeme yok.</li>}
              {visible.map((option) => {
                const disabled = disabledIds?.has(option.id) && option.id !== value;
                return (
                  <li key={option.id} className="border-b border-slate-100 last:border-0">
                    <button type="button" disabled={disabled} onClick={() => { onChange(option.id); close(); }}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${option.id === value ? "bg-blue-50" : ""}`}>
                      <span className="min-w-0 flex-1">
                        <MaterialTitle sku={option.sku} name={option.name} spec={option.spec} className="block text-sm font-semibold text-slate-900" />
                        <span className="mt-0.5 block break-words text-xs text-slate-500">
                          {[option.brand, option.hint].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {option.id === value && <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
