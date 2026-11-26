"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatQuantity } from "@/lib/quantity";
import { foldText } from "@/components/retail-stock/material-picker";
import { Button } from "@/components/shadcn/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";

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
    <h2 className="font-semibold">Malzeme kataloğu<InfoHint text="Tanımlı tüm stok kartları ve bilgileri. Depodaki miktarlar için &quot;Stok Durumu&quot; sekmesine bakın." /></h2>

    <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
      <InputGroup>
        <InputGroupAddon><Search /></InputGroupAddon>
        <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kod, ad, marka, tip veya kategori ara" aria-label="Katalogda ara" />
      </InputGroup>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">Sırala
        <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
          <SelectTrigger className="w-40" aria-label="Sıralama"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="sku">Malzeme kodu</SelectItem>
              <SelectItem value="name">Malzeme adı</SelectItem>
              <SelectItem value="category">Kategori</SelectItem>
              <SelectItem value="brand">Marka</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>

    <p className="mt-3 text-xs tabular-nums text-muted-foreground">{rows.length === 0 ? "Eşleşen malzeme yok" : `${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, rows.length)} / ${rows.length} malzeme`}</p>

    {visible.length > 0 && <div className="mt-2 overflow-hidden rounded-lg border">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Kod</TableHead><TableHead>Malzeme</TableHead><TableHead>Tip</TableHead>
            <TableHead>Marka</TableHead><TableHead>Kategori</TableHead><TableHead>Birim</TableHead>
            {manager && <TableHead className="text-right">Birim fiyat</TableHead>}
            <TableHead className="text-right">Kritik stok eşiği</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((item) => <TableRow key={item.id} className="align-top">
            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{item.spec || "—"}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{item.brand || "—"}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{item.category || "—"}</TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{item.unit}</TableCell>
            {manager && <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{price(item.unit_price)}</TableCell>}
            <TableCell className="whitespace-nowrap text-right text-xs">
              {manager
                ? <Button variant="link" size="sm" onClick={() => onEditThreshold(item)} className="h-auto p-0 text-xs text-muted-foreground hover:text-[#d90070]">{Number(item.min_stock) > 0 ? `${formatQuantity(item.min_stock)} ${item.unit}` : "Eşik belirle"}</Button>
                : <span className="text-muted-foreground">{Number(item.min_stock) > 0 ? `${formatQuantity(item.min_stock)} ${item.unit}` : "—"}</span>}
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>}

    {pageCount > 1 && <div className="mt-3 flex items-center justify-center gap-2 text-xs">
      <Button variant="outline" size="sm" onClick={() => setPage(current - 1)} disabled={current === 1}>Önceki</Button>
      <span className="tabular-nums text-muted-foreground">Sayfa {current} / {pageCount}</span>
      <Button variant="outline" size="sm" onClick={() => setPage(current + 1)} disabled={current === pageCount}>Sonraki</Button>
    </div>}
  </div>;
}
