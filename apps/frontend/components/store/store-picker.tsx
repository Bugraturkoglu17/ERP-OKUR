"use client";

import { useEffect, useState } from "react";
import { Search, Store, X } from "lucide-react";
import { searchStoresRemote, type Store as StoreOption } from "@/services/stores";

export type { StoreOption };

const EMPTY_STORES: StoreOption[] = [];

function parseBolge(desc?: string): string {
  if (!desc) return "";
  try { return JSON.parse(desc).bolge ?? ""; } catch { return ""; }
}

function parseAdres(desc?: string): string {
  if (!desc) return "";
  try { return JSON.parse(desc).adres ?? ""; } catch { return ""; }
}

/**
 * Aranabilir mağaza seçici. Büyük mağaza sayılarında (binlerce kayıt) dropdown'a
 * tüm listeyi basmaz — kullanıcı yazana kadar sonuç göstermez, debounce'lu arar.
 */
export function StorePicker({
  stores = EMPTY_STORES,
  value,
  onChange,
  placeholder = "Mağaza adı veya kodu ile ara...",
}: {
  stores?: StoreOption[];
  value: StoreOption | null;
  onChange: (s: StoreOption | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) { setResults([]); return; }
    let active = true;
    setLoading(true);
    searchStoresRemote(q)
      .then((remote) => {
        if (!active) return;
        const fallback = stores.filter((s) =>
          s.name.toLowerCase().includes(q) || (s.project_no ?? "").toLowerCase().includes(q)
        );
        setResults(remote.length ? remote : fallback.slice(0, 20));
      })
      .catch(() => {
        if (active) setResults(stores.filter((s) =>
          s.name.toLowerCase().includes(q) || (s.project_no ?? "").toLowerCase().includes(q)
        ).slice(0, 20));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [stores, debounced]);

  if (value) {
    const bolge = parseBolge(value.description);
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{value.name}</p>
          <p className="text-xs text-slate-500">
            #{value.project_no ?? "—"}{bolge && ` · ${bolge}`}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
        />
      </div>
      {open && debounced.trim() !== "" && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-3 py-3 text-xs text-slate-400">Mağazalar aranıyor...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400">Sonuç bulunamadı.</p>
          ) : (
            results.map((s) => {
              const bolge = parseBolge(s.description);
              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(s); setQuery(""); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <Store className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {s.name}
                    {bolge && <span className="text-slate-400"> · {bolge}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">#{s.project_no ?? "—"}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export { parseBolge, parseAdres };
