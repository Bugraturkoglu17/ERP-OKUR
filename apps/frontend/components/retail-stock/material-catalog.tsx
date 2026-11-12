"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatQuantity } from "@/lib/quantity";
import { foldText } from "@/components/retail-stock/material-picker";

export type CatalogMaterial = {
  id: string; sku: string; name: string; category: string | null; unit: string;
  brand?: string | null; spec?: string | null; unit_price?: string | null; min_stock: string;
};

type SortKey = "sku" | "name" | "category" | "brand";
const PAGE_SIZE = 50;
const SORTERS: Record<SortKey, (a: CatalogMaterial, b: CatalogMaterial) => number> = {
  sku: (a, b) => a.sku.localeCompare(b.sku, "tr", { numeric: true }),
  name: (a, b) => a.name.localeCompare(b.name, "tr"),
  category: (a, b) => (a.category ?? "").localeCompare(b.category ?? "", "tr") || a.name.localeCompare(b.name, "tr"),
  brand: (a, b) => (a.brand ?? "").localeCompare(b.brand ?? "", "tr") || a.name.localeCompare(b.name, "tr"),
};

/**
 * Malzeme kataloğu: tanımlı tüm stok kartları ve bilgileri. Depodan bağımsızdır, miktar göstermez;
 * hangi depoda ne kadar olduğu "Stok Durumu" sekmesindedir. Yönetici kritik stok eşiğini buradan düzenler.
 */
export function MaterialCatalog({ materials, manager, onEditThreshold }: {
  materials: CatalogMaterial[]; manager: boolean; onEditThreshold: (material: CatalogMaterial) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const terms = foldText(search).split(/\s+/).filter(Boolean);
    return materials
      .filter((item) => {
        const haystack = foldText([item.sku, item.name, item.spec, item.brand, item.category].filter(Boolean).join(" "));
        return terms.every((term) => haystack.includes(term));
      })
      .sort(SORTERS[sortKey]);
  }, [materials, search, sortKey]);

  useEffect(() => { setPage(1); }, [search, sortKey]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const price = (value?: string | null) => (value ? Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 4 }) : "—");

  return <div className="p-4 sm:p-5">
    <div><h2 className="font-semibold text-slate-900">Malzeme kataloğu</h2><p className="mt-0.5 text-xs text-slate-500">Tanımlı tüm stok kartları ve bilgileri. Depodaki miktarlar için &quot;Stok Durumu&quot; sekmesine bakın.</p></div>

    <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kod, ad, marka, tip veya kategori ara" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pl-10 text-sm outline-none focus:border-[#d90070]" /></div>
      <label className="flex items-center gap-2 text-xs text-slate-500">Sırala
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
          <option value="sku">Malzeme kodu</option>
          <option value="name">Malzeme adı</option>
          <option value="category">Kategori</option>
          <option value="brand">Marka</option>
        </select>
      </label>
    </div>

    <p className="mt-3 text-xs tabular-nums text-slate-500">{rows.length === 0 ? "Eşleşen malzeme yok" : `${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, rows.length)} / ${rows.length} malzeme`}</p>

    {visible.length > 0 && <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <th className="px-3 py-2.5">Kod</th><th className="px-3 py-2.5">Malzeme</th><th className="px-3 py-2.5">Tip</th>
          <th className="px-3 py-2.5">Marka</th><th className="px-3 py-2.5">Kategori</th><th className="px-3 py-2.5">Birim</th>
          {manager && <th className="px-3 py-2.5 text-right">Birim fiyat</th>}
          <th className="px-3 py-2.5 text-right">Kritik stok eşiği</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {visible.map((item) => <tr key={item.id} className="align-top hover:bg-slate-50">
            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500">{item.sku}</td>
            <td className="px-3 py-2.5 font-medium text-slate-900">{item.name}</td>
            <td className="px-3 py-2.5 text-xs text-slate-600">{item.spec || "—"}</td>
            <td className="px-3 py-2.5 text-xs text-slate-600">{item.brand || "—"}</td>
            <td className="px-3 py-2.5 text-xs text-slate-600">{item.category || "—"}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{item.unit}</td>
            {manager && <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-xs text-slate-700">{price(item.unit_price)}</td>}
            <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs">
              {manager
                ? <button type="button" onClick={() => onEditThreshold(item)} className="font-medium text-slate-600 underline-offset-2 hover:text-[#d90070] hover:underline">{Number(item.min_stock) > 0 ? `${formatQuantity(item.min_stock)} ${item.unit}` : "Eşik belirle"}</button>
                : <span className="text-slate-600">{Number(item.min_stock) > 0 ? `${formatQuantity(item.min_stock)} ${item.unit}` : "—"}</span>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {pageCount > 1 && <div className="mt-3 flex items-center justify-center gap-2 text-xs">
      <button type="button" onClick={() => setPage(current - 1)} disabled={current === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 disabled:opacity-40">Önceki</button>
      <span className="tabular-nums text-slate-500">Sayfa {current} / {pageCount}</span>
      <button type="button" onClick={() => setPage(current + 1)} disabled={current === pageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 disabled:opacity-40">Sonraki</button>
    </div>}
  </div>;
}
