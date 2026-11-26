"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/shadcn/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Separator } from "@/components/shadcn/separator";

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
      <span className="mx-1.5 text-muted-foreground/60">–</span>
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
  const selected = options.find((option) => option.id === value);

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
        className={cn("flex w-full min-w-0 items-center justify-between gap-1.5 border border-input bg-background text-left shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
          compact ? "min-h-8 rounded-md px-2 py-0.5 text-[11px] leading-tight" : "min-h-9 rounded-md px-3 py-2 text-sm")}>
        <span className={cn("min-w-0 flex-1 break-words", compact && "line-clamp-2", selected ? "font-medium" : "text-muted-foreground")}>
          {selected ? <MaterialTitle sku={selected.sku} name={selected.name} spec={selected.spec} /> : placeholder}
        </span>
        {!compact && <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
      </button>

      <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
        <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-h-[80dvh] sm:max-w-lg [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">{ariaLabel}</DialogTitle>
          <DialogDescription className="sr-only">Malzemeyi ad, tip, marka veya kodla arayıp seçin.</DialogDescription>
          <div className="flex items-center gap-2 p-3">
            <InputGroup className="min-w-0 flex-1">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, tip, marka veya kod ara" aria-label="Malzeme ara" className="text-base sm:text-sm" />
            </InputGroup>
            <Button variant="ghost" size="icon" onClick={close} aria-label="Kapat"><X /></Button>
          </div>
          <Separator />
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            {visible.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Eşleşen malzeme yok.</li>}
            {visible.map((option) => {
              const disabled = disabledIds?.has(option.id) && option.id !== value;
              return (
                <li key={option.id} className="border-b last:border-0">
                  <button type="button" disabled={disabled} onClick={() => { onChange(option.id); close(); }}
                    className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40", option.id === value && "bg-primary/5")}>
                    <span className="min-w-0 flex-1">
                      <MaterialTitle sku={option.sku} name={option.name} spec={option.spec} className="block text-sm font-semibold" />
                      <span className="mt-0.5 block break-words text-xs text-muted-foreground">{[option.brand, option.hint].filter(Boolean).join(" · ")}</span>
                    </span>
                    {option.id === value && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
