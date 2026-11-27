"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDownToLine, List as ListIcon, ArrowRightLeft, Boxes, ClipboardList,
  Package, Plus, Search, Store, Truck, Warehouse,
} from "lucide-react";
import { apiGet, apiPatch, apiPost, getRequestErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Textarea } from "@/components/shadcn/textarea";
import { Toggle } from "@/components/shadcn/toggle";
import { formatQuantity, quantityForApi, quantityProblem, sanitizeQuantityInput } from "@/lib/quantity";
import { MaterialPicker, MaterialTitle, foldText } from "@/components/retail-stock/material-picker";
import { TransferDialog } from "@/components/retail-stock/transfer-dialog";
import { MaterialCatalog } from "@/components/retail-stock/material-catalog";
import { brand } from "@/lib/brand";

// Proje deposu yok (27.11.2026): yalnız ana depo ve araç (cep) depoları.
type Depot = { id: string; kind: "main" | "vehicle"; name: string; plate: string | null; assigned_user_id: string | null; is_active: boolean };
type Material = { id: string; sku: string; name: string; category: string | null; unit: string; brand?: string | null; spec?: string | null; unit_price?: string | null; min_stock: string };
type StockRow = { material_id: string; sku: string; name: string; category: string | null; unit: string; brand?: string | null; spec?: string | null; unit_price?: string | null; quantity: string; min_stock: string };

type SortKey = "sku" | "name" | "category" | "qty-desc" | "qty-asc";
const PAGE_SIZE = 50;
const SORTERS: Record<SortKey, (a: StockRow, b: StockRow) => number> = {
  sku: (a, b) => a.sku.localeCompare(b.sku, "tr", { numeric: true }),
  name: (a, b) => a.name.localeCompare(b.name, "tr"),
  category: (a, b) => (a.category ?? "").localeCompare(b.category ?? "", "tr") || a.name.localeCompare(b.name, "tr"),
  "qty-desc": (a, b) => Number(b.quantity) - Number(a.quantity),
  "qty-asc": (a, b) => Number(a.quantity) - Number(b.quantity),
};

/** Kritik stok: eşiği girilmiş ve miktarı eşiğe eşit ya da altında olan kalem (İstatistikler ile aynı kural). */
export const isLowStock = (row: { quantity: string | number; min_stock?: string | number | null }) =>
  Number(row.min_stock) > 0 && Number(row.quantity) <= Number(row.min_stock);
type Movement = { id: string; kind: string; material_name: string; material_sku?: string; unit: string; quantity: string; source_name: string | null; target_name: string | null; store_name: string | null; performed_by_name: string; performed_at: string; note: string | null; reference_no: string | null; work_order_id?: string | null; work_order_title?: string | null };
type Staff = { id: string; name: string };
type Action = "main" | "vehicle" | "material" | "opening" | "assign" | "threshold";
type Tab = "stock" | "catalog" | "vehicles" | "projects" | "history";

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Ana depoya giriş", load: "Ana depodan aktarım", use: "İş emri kullanımı",
  return: "Ana depoya iade", count: "Sayım düzeltmesi",
};

const amount = (value: string | number) => (Number.isFinite(Number(value)) ? formatQuantity(value) : "0");

const initialForm = {
  name: "", plate: "", assignedUserId: "", sku: "", category: "", unit: "adet",
  minStock: "0", materialId: "", vehicleId: "", quantity: "", reference: "", note: "",
};

const NONE = "none";
const DEPOT_GROUP_LABEL = { main: "Ana depo", vehicle: "Araç depoları" } as const;
const ACTION_TITLE: Record<Action, string> = {
  main: "Ana depo oluştur", vehicle: "Araç deposu ekle", material: "Malzeme ekle",
  opening: "Ana depoya stok girişi", assign: "Araca çalışan ata", threshold: "Kritik stok eşiği",
};

function StatCard({ icon: Icon, label, value, caption, onClick }: { icon: typeof Boxes; label: string; value: string; caption: string; onClick?: () => void }) {
  const body = (
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-muted-foreground">{label}</span><Icon className="size-4 text-[#d90070]" /></div>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{caption}</p>
    </CardContent>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="h-full transition-colors hover:border-[#d90070]/40">{body}</Card></button>
    : <Card>{body}</Card>;
}

/** Araç deposu kartı (Araç Depoları sekmesi). */
function DepotCard({ icon: Icon, tag, title, subtitle, children }: { icon: typeof Truck; tag: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card className="bg-muted/40">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2"><Icon className="size-5 text-[#d90070]" /><Badge variant="outline" className="bg-background">{tag}</Badge></div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2">{children}</div>
      </CardContent>
    </Card>
  );
}

export function RetailStockPage({ manager }: { manager: boolean }) {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [selectedDepotId, setSelectedDepotId] = useState("");
  const [tab, setTab] = useState<Tab>("stock");
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  // "Tümünü göster": tüm stok kartları sayfa sayfa, seçilen sıraya göre listelenir.
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [form, setForm] = useState(initialForm);
  const [transferOpen, setTransferOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mainDepot = depots.find((depot) => depot.kind === "main");
  // Çalışan: kendi aracı. Ana depo yalnızca iade hedefidir.
  const viewableDepots = manager ? depots : depots.filter((depot) => depot.kind !== "main");
  const vehicles = depots.filter((depot) => depot.kind === "vehicle");
  const selectedDepot = depots.find((depot) => depot.id === selectedDepotId);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("filtre") === "kritik") setLowOnly(true);
  }, []);

  const refreshStock = useCallback(async (depotId: string) => {
    if (!depotId) { setStock([]); return; }
    const rows = await apiGet<StockRow[]>(`/retail-stock/stock?depot_id=${depotId}`);
    setStock(rows);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [nextDepots, nextMaterials, nextMovements, nextStaff] = await Promise.all([
        apiGet<Depot[]>("/retail-stock/depots"),
        apiGet<Material[]>("/retail-stock/materials?limit=2000"),
        apiGet<Movement[]>("/retail-stock/movements"),
        manager ? apiGet<Staff[]>("/retail-stock/staff") : Promise.resolve([] as Staff[]),
      ]);
      setDepots(nextDepots);
      setMaterials(nextMaterials);
      // Çalışan ana depoyu yalnızca iade hedefi olarak alır; stoğu görüntülenemez.
      const viewable = manager ? nextDepots : nextDepots.filter((depot) => depot.kind !== "main");
      setMovements(nextMovements);
      setStaff(nextStaff);
      setSelectedDepotId((current) => viewable.some((depot) => depot.id === current) ? current : (viewable[0]?.id ?? ""));
      setError("");
    } catch (err) {
      setError(getRequestErrorMessage(err, "Depo verileri yüklenemedi."));
    } finally {
      setLoading(false);
    }
  }, [manager]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    void refreshStock(selectedDepotId).catch((err) => setError(getRequestErrorMessage(err, "Stok listesi yüklenemedi.")));
  }, [selectedDepotId, refreshStock]);

  const matchingStock = useMemo(() => {
    const terms = foldText(search).split(/\s+/).filter(Boolean);
    const found = stock.filter((row) => {
      if (lowOnly && !isLowStock(row)) return false;
      const haystack = foldText([row.name, row.spec, row.brand, row.sku, row.category].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    });
    // Stoklu kalemler önce, sonra malzeme kodu sırası.
    return found.sort((a, b) => (Number(b.quantity) > 0 ? 1 : 0) - (Number(a.quantity) > 0 ? 1 : 0) || a.sku.localeCompare(b.sku, "tr", { numeric: true }));
  }, [stock, search, lowOnly]);
  // Ana depoda liste uzayıp gitmesin: aramasız 4 kalem, aramada en çok 30 sonuç. Cep depo küçüktür:
  // aramasız stoktaki tüm kalemler alt alta gösterilir (arayınca stokta olmayanlar da bulunur).
  const isVehicleDepot = selectedDepot?.kind === "vehicle";
  const sortedStock = useMemo(() => (showAll ? [...matchingStock].sort(SORTERS[sortKey]) : matchingStock), [matchingStock, showAll, sortKey]);
  const pageCount = Math.max(1, Math.ceil(sortedStock.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  useEffect(() => { setPage(1); }, [search, lowOnly, sortKey, selectedDepotId, showAll]);
  const visibleStock = useMemo(() => {
    if (showAll) return sortedStock.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    if (lowOnly) return matchingStock;
    if (search.trim()) return matchingStock.slice(0, 30);
    if (isVehicleDepot) return matchingStock.filter((row) => Number(row.quantity) > 0);
    return matchingStock.slice(0, 4);
  }, [matchingStock, search, isVehicleDepot, lowOnly, showAll, sortedStock, currentPage]);
  const hiddenStockCount = showAll || lowOnly || (isVehicleDepot && !search.trim()) ? 0 : matchingStock.length - visibleStock.length;
  const lowCount = stock.filter(isLowStock).length;
  const stockedMaterialCount = stock.filter((row) => Number(row.quantity) > 0).length;

  /** "Malzeme kataloğu" kartı: tanımlı tüm stok kartlarını (miktarsız) katalog sekmesinde açar. */
  function openCatalog() {
    setTab("catalog");
    window.setTimeout(() => document.getElementById("malzeme-katalogu")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function openAction(next: Action, depot?: Depot) {
    setError(""); setSuccess("");
    setForm({ ...initialForm, vehicleId: depot?.kind === "vehicle" ? depot.id : "", assignedUserId: depot?.assigned_user_id ?? "" });
    if (next === "opening") setSelectedDepotId(mainDepot?.id ?? "");
    setAction(next);
  }

  /** Stok kartının kritik stok eşiğini düzenleme penceresi. */
  function openThreshold(row: Material) {
    setError(""); setSuccess("");
    setForm({ ...initialForm, materialId: row.id, name: `${row.sku} – ${row.name}`, unit: row.unit,
      minStock: Number(row.min_stock) > 0 ? amount(row.min_stock) : "" });
    setAction("threshold");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy) return;
    if (action === "opening") {
      if (!form.materialId) { setError("Malzeme seçin."); return; }
      const problem = quantityProblem(form.quantity);
      if (problem) { setError(problem); return; }
    }
    if ((action === "material" || action === "threshold") && form.minStock.trim() && form.minStock.trim() !== "0" && quantityProblem(form.minStock)) {
      setError("Kritik stok eşiği tam sayı veya en fazla bir ondalık olmalı (örn. 5 veya 0,5)."); return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      let createdDepot: Depot | undefined;
      if (action === "main" || action === "vehicle") {
        createdDepot = await apiPost<Depot>("/retail-stock/depots", {
          kind: action, name: form.name.trim(),
          plate: action === "vehicle" ? form.plate : null,
          assigned_user_id: action === "vehicle" && form.assignedUserId ? form.assignedUserId : null,
        });
      } else if (action === "material") {
        await apiPost("/retail-stock/materials", {
          sku: form.sku, name: form.name.trim(), category: form.category.trim() || null,
          unit: form.unit.trim(), min_stock: form.minStock.trim() && form.minStock.trim() !== "0" ? quantityForApi(form.minStock) : "0",
        });
      } else if (action === "threshold") {
        await apiPatch(`/retail-stock/materials/${form.materialId}`, {
          min_stock: form.minStock.trim() && form.minStock.trim() !== "0" ? quantityForApi(form.minStock) : "0",
        });
      } else if (action === "assign") {
        await apiPatch(`/retail-stock/depots/${form.vehicleId}`, { assigned_user_id: form.assignedUserId || null });
      } else if (action === "opening") {
        await apiPost("/retail-stock/opening", {
          depot_id: mainDepot?.id, material_id: form.materialId, quantity: quantityForApi(form.quantity),
          reference_no: form.reference.trim() || null, note: form.note.trim() || null,
        });
      }
      setAction(null);
      setSuccess(action === "threshold" ? `Kritik stok eşiği kaydedildi: ${form.name}` : "İşlem kaydedildi; stok bakiyesi ve hareket geçmişi güncellendi.");
      await loadAll();
      if (createdDepot) setSelectedDepotId(createdDepot.id);
      else await refreshStock(selectedDepotId);
    } catch (err) {
      setError(getRequestErrorMessage(err, "İşlem kaydedilemedi."));
    } finally { setBusy(false); }
  }

  const canTransfer = Boolean(mainDepot && vehicles.length);
  // Stok girişi penceresinde, malzemenin ana depodaki mevcut miktarı seçicide görünür.
  const mainStockHint = (materialId: string, unit: string) => {
    if (selectedDepot?.kind !== "main") return unit;
    const row = stock.find((item) => item.material_id === materialId);
    return `Ana depoda ${amount(row?.quantity ?? 0)} ${unit}`;
  };

  const tabs = ([
    ["stock", "Stok Durumu", Package], ["catalog", "Malzeme Kataloğu", Boxes], ["vehicles", "Araç Depoları", Truck],
    ["history", "Hareketler", ClipboardList],
  ] as const);

  return <div className="mx-auto flex max-w-7xl flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#bd0063]">{brand("OKUR · SAHA LOJİSTİĞİ", "SAHA LOJİSTİĞİ")}</p>
        <h1 className="text-2xl font-bold tracking-tight">Depo & Stok<InfoHint text="Ana depodan plakalı araçlara aktarın. Kullanılan malzeme, iş emri tamamlanınca çalışanın cep deposundan otomatik düşer." /></h1>
      </div>
      {manager && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openAction("material")}><Plus data-icon="inline-start" />Malzeme ekle</Button>
          <Button variant="outline" onClick={() => openAction("vehicle")}><Truck data-icon="inline-start" />Araç ekle</Button>
        </div>
      )}
    </header>

    {error && !action && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {success && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800"><AlertDescription>{success}</AlertDescription></Alert>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Warehouse} label="Ana depo" value={mainDepot ? "Hazır" : "Yok"} caption={mainDepot?.name ?? "Önce oluşturun"} />
      <StatCard icon={Truck} label="Cep depolar" value={String(vehicles.length)} caption="Plakaya bağlı araç" />
      <StatCard icon={Boxes} label="Malzeme kataloğu" value={String(materials.length)} caption={materials.length > 0 ? "Tüm stok kartlarını görmek için tıklayın" : "Henüz stok kartı yok"} onClick={materials.length > 0 ? openCatalog : undefined} />
      <StatCard icon={Package} label="Stoklu malzeme" value={String(stockedMaterialCount)} caption={`${lowCount} kritik stok kalemi`} />
    </div>

    {!loading && manager && !mainDepot && (
      <Alert className="flex flex-wrap items-center justify-between gap-3 border-dashed border-[#d90070]/40 bg-[#fff6fa]">
        <div><AlertTitle>İlk adım: Ana depoyu oluşturun</AlertTitle><AlertDescription className="text-xs text-muted-foreground">Malzeme girişleri önce ana depoya yapılır; araçlara aktarım bundan sonra açılır.</AlertDescription></div>
        <Button onClick={() => openAction("main")}>Ana depo oluştur</Button>
      </Alert>
    )}
    {!loading && !manager && vehicles.length === 0 && <Alert className="border-amber-200 bg-amber-50 text-amber-900"><AlertDescription>Henüz size atanmış araç deposu yok. Plakanızın yönetici tarafından atanması gerekiyor.</AlertDescription></Alert>}

    <Card>
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <div className="overflow-x-auto border-b p-2">
          <TabsList className="h-auto bg-transparent p-0">
            {tabs.map(([value, label, Icon]) => <TabsTrigger key={value} value={value} className="gap-2 px-3.5 py-2 data-[state=active]:bg-muted data-[state=active]:shadow-none"><Icon className="size-4" />{label}</TabsTrigger>)}
          </TabsList>
        </div>
      </Tabs>

      {tab === "stock" && <div id="stok-listesi" className="scroll-mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Depo bakiyesi<InfoHint text="Miktarlar hareket kaydından güncellenir; eksi stok mümkün değildir." /></h2>
          <div className="flex flex-wrap gap-2">
            {manager && mainDepot && materials.length > 0 && <Button variant="outline" size="sm" onClick={() => openAction("opening")}>Stok girişi</Button>}
            {canTransfer && <Button size="sm" onClick={() => setTransferOpen(true)}><ArrowRightLeft data-icon="inline-start" />{manager ? "Aktarım" : "Ana depoya iade"}</Button>}
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(12rem,18rem)_1fr_auto_auto]">
          <Select value={selectedDepotId || NONE} onValueChange={(value) => setSelectedDepotId(value === NONE ? "" : value)} disabled={viewableDepots.length === 0}>
            <SelectTrigger aria-label="Depo seç" className="min-w-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {viewableDepots.length === 0 && <SelectGroup><SelectItem value={NONE}>Depo bulunmuyor</SelectItem></SelectGroup>}
              {(["main", "vehicle"] as const).map((kind) => {
                const group = viewableDepots.filter((depot) => depot.kind === kind);
                if (group.length === 0) return null;
                return (
                  <SelectGroup key={kind}>
                    <SelectLabel>{DEPOT_GROUP_LABEL[kind]}</SelectLabel>
                    {group.map((depot) => <SelectItem key={depot.id} value={depot.id}>{depot.kind === "main" ? `Ana depo · ${depot.name}` : `${depot.plate} · ${depot.name}`}</SelectItem>)}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
          <InputGroup>
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Malzeme adı, kodu veya kategori ara" aria-label="Malzeme ara" />
          </InputGroup>
          <Toggle variant="outline" pressed={lowOnly} onPressedChange={setLowOnly} className="whitespace-nowrap data-[state=on]:border-amber-300 data-[state=on]:bg-amber-50 data-[state=on]:text-amber-800">
            <AlertTriangle />Sadece kritik stok ({lowCount})
          </Toggle>
          <Toggle variant="outline" pressed={showAll} onPressedChange={setShowAll} className="whitespace-nowrap">
            <ListIcon />Tümünü göster ({stock.length})
          </Toggle>
        </div>
        {showAll && !loading && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">Sırala
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
              <SelectTrigger className="h-8 w-48" aria-label="Sıralama"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="sku">Malzeme kodu</SelectItem>
                  <SelectItem value="name">Malzeme adı</SelectItem>
                  <SelectItem value="category">Kategori</SelectItem>
                  <SelectItem value="qty-desc">Miktar (çoktan aza)</SelectItem>
                  <SelectItem value="qty-asc">Miktar (azdan çoğa)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <span className="tabular-nums">{sortedStock.length === 0 ? "0 malzeme" : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, sortedStock.length)} / ${sortedStock.length} malzeme`}</span>
        </div>}
        {loading ? (
          <div className="mt-4 flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : visibleStock.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Boxes /></EmptyMedia>
              <EmptyTitle>{lowOnly ? "Kritik seviyede malzeme yok" : "Henüz malzeme bulunmuyor"}</EmptyTitle>
              <EmptyDescription>{lowOnly ? "Bu depoda miktarı kritik stok eşiğine inmiş malzeme bulunmuyor." : "Bu depoda henüz stok yok. Ana depoya \"Stok girişi\" yapın, sonra \"Aktarım\" ile araçlara gönderin."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="mt-4 divide-y">{visibleStock.map((row) => <div key={row.material_id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold"><MaterialTitle sku={row.sku} name={row.name} spec={row.spec} /></p>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">{[row.category, row.brand].filter(Boolean).join(" · ")}</p>
              {manager && row.unit_price && <p className="mt-0.5 text-[11px] text-muted-foreground">Birim fiyat: {Number(row.unit_price).toLocaleString("tr-TR", { maximumFractionDigits: 4 })} / {row.unit}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className={cn("text-sm font-bold", isLowStock(row) && "text-amber-700")}>{amount(row.quantity)} <span className="text-xs font-medium text-muted-foreground">{row.unit}</span></p>
              {isLowStock(row) && <Badge variant="warning" className="mt-0.5 text-[10px]">Kritik · eşik {amount(row.min_stock)}</Badge>}
            </div>
          </div>)}</div>
        )}
        {showAll && !loading && pageCount > 1 && <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <Button variant="outline" size="sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>Önceki</Button>
          <span className="tabular-nums text-muted-foreground">Sayfa {currentPage} / {pageCount}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>Sonraki</Button>
        </div>}
        {!loading && visibleStock.length > 0 && hiddenStockCount > 0 && <p className="mt-3 rounded-md bg-muted px-4 py-3 text-center text-xs text-muted-foreground">{search.trim() ? `${hiddenStockCount} sonuç daha var; aramayı daraltın.` : `${hiddenStockCount} malzeme daha var. Görmek istediğiniz malzemeyi yukarıdaki kutuya ad, kod veya kategori yazarak bulun.`}</p>}
      </div>}

      {tab === "catalog" && <div id="malzeme-katalogu" className="scroll-mt-4"><MaterialCatalog materials={materials} manager={manager} onEditThreshold={openThreshold} /></div>}

      {tab === "vehicles" && <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {vehicles.length === 0 ? <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Henüz plakaya bağlı araç deposu yok.</p> : vehicles.map((vehicle) => (
          <DepotCard key={vehicle.id} icon={Truck} tag={vehicle.plate ?? ""} title={vehicle.name}
            subtitle={staff.find((person) => person.id === vehicle.assigned_user_id)?.name ?? (vehicle.assigned_user_id ? "Size atanmış araç" : "Çalışan atanmamış")}>
            <Button variant="outline" size="sm" className="bg-background" onClick={() => { setSelectedDepotId(vehicle.id); setTab("stock"); }}>Stoku gör</Button>
            {manager && <Button variant="ghost" size="sm" className="text-[#bd0063]" onClick={() => openAction("assign", vehicle)}>Çalışan ata</Button>}
          </DepotCard>
        ))}
      </div>}

      {tab === "history" && <div className="divide-y p-4 sm:p-5">
        {movements.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Henüz stok hareketi yok.</p> : movements.map((movement) => <div key={movement.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-md bg-muted p-2 text-muted-foreground">{movement.kind === "use" ? <Store className="size-4" /> : movement.kind === "load" ? <ArrowRightLeft className="size-4" /> : <ArrowDownToLine className="size-4" />}</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{movement.material_sku ? <MaterialTitle sku={movement.material_sku} name={movement.material_name} /> : movement.material_name} <span className="font-normal text-muted-foreground">· {MOVEMENT_LABELS[movement.kind] ?? movement.kind}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">{[movement.source_name, movement.target_name, movement.store_name].filter(Boolean).join(" → ")}</p>
              {movement.work_order_title && <p className="mt-1 text-xs font-medium text-[#bd0063]">İş emri: {movement.work_order_title}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">{movement.performed_by_name} · {new Date(movement.performed_at).toLocaleString("tr-TR")}{movement.note ? ` · ${movement.note}` : ""}</p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-bold">{amount(movement.quantity)} {movement.unit}</span>
        </div>)}
      </div>}
    </Card>


    {transferOpen && <TransferDialog depots={depots} manager={manager} initialSourceId={selectedDepotId} staffNames={Object.fromEntries(staff.map((person) => [person.id, person.name]))} onClose={() => setTransferOpen(false)}
      onDone={(message) => { setTransferOpen(false); setSuccess(message); void loadAll().then(() => refreshStock(selectedDepotId)); }} />}

    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !busy) setAction(null); }}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#bd0063]">{brand("OKUR DEPO", "DEPO")}</p>
          <DialogTitle>{action ? ACTION_TITLE[action] : ""}</DialogTitle>
          <DialogDescription className="sr-only">Depo ve stok işlemi</DialogDescription>
        </DialogHeader>
        {action && <form onSubmit={(event) => void submit(event)}>
          <FieldGroup className="gap-4">
            {(action === "main" || action === "vehicle" || action === "material") && (
              <Field>
                <FieldLabel htmlFor="ds-ad">{action === "material" ? "Malzeme adı" : "Depo adı"}</FieldLabel>
                <Input id="ds-ad" required minLength={2} maxLength={action === "material" ? 255 : 120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder={action === "vehicle" ? "Örn. Servis Aracı 1" : action === "main" ? brand("Örn. OKUR Ana Depo", "Örn. Merkez Ana Depo") : "Örn. Bakır Boru 1/4"} />
              </Field>
            )}
            {action === "vehicle" && (
              <Field>
                <FieldLabel htmlFor="ds-plaka">Araç plakası</FieldLabel>
                <Input id="ds-plaka" required minLength={4} maxLength={20} value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value.toLocaleUpperCase("tr-TR") })} placeholder="34 ABC 123" />
              </Field>
            )}
            {(action === "vehicle" || action === "assign") && (
              <Field>
                <FieldLabel htmlFor="ds-calisan">Atanacak çalışan <span className="font-normal text-muted-foreground">(isteğe bağlı)</span></FieldLabel>
                <Select value={form.assignedUserId || NONE} onValueChange={(value) => setForm({ ...form, assignedUserId: value === NONE ? "" : value })}>
                  <SelectTrigger id="ds-calisan"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NONE}>Henüz atanmadı</SelectItem>
                      {staff.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
            {action === "material" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="ds-kod">Malzeme kodu</FieldLabel><Input id="ds-kod" required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="MLZ-001" /></Field>
                <Field><FieldLabel htmlFor="ds-birim">Birim</FieldLabel><Input id="ds-birim" required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="adet / metre / kg" /></Field>
                <Field><FieldLabel htmlFor="ds-kategori">Kategori</FieldLabel><Input id="ds-kategori" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Soğutma" /></Field>
                <Field><FieldLabel htmlFor="ds-esik">Kritik stok eşiği</FieldLabel><Input id="ds-esik" inputMode="decimal" autoComplete="off" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: sanitizeQuantityInput(event.target.value) })} /></Field>
              </div>
            )}
            {action === "threshold" && (
              <>
                <p className="rounded-md bg-muted px-3 py-2.5 text-sm font-semibold">{form.name}</p>
                <Field>
                  <FieldLabel htmlFor="ds-esik2">Kritik stok eşiği ({form.unit})</FieldLabel>
                  <Input id="ds-esik2" autoFocus inputMode="decimal" autoComplete="off" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: sanitizeQuantityInput(event.target.value) })} placeholder="örn. 10 veya 2,5" />
                  <FieldDescription>Bir depodaki miktar bu değere eşit ya da altına düştüğünde malzeme kritik stok olarak işaretlenir. Boş bırakır veya 0 yazarsanız uyarı kapanır. Eşik ana depoya ve tüm araçlara aynı uygulanır.</FieldDescription>
                </Field>
              </>
            )}
            {action === "opening" && (
              <>
                <Field>
                  <FieldLabel>Malzeme</FieldLabel>
                  <MaterialPicker value={form.materialId} onChange={(id) => setForm({ ...form, materialId: id })} options={materials.map((material) => ({ id: material.id, name: material.name, spec: material.spec, brand: material.brand, sku: material.sku, hint: mainStockHint(material.id, material.unit) }))} />
                </Field>
                <Field><FieldLabel htmlFor="ds-miktar">Miktar</FieldLabel><Input id="ds-miktar" required inputMode="decimal" autoComplete="off" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: sanitizeQuantityInput(event.target.value) })} placeholder="örn. 5 veya 0,5" /></Field>
                <Field><FieldLabel htmlFor="ds-fis">Fiş / referans no <span className="font-normal text-muted-foreground">(isteğe bağlı)</span></FieldLabel><Input id="ds-fis" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></Field>
                <Field><FieldLabel htmlFor="ds-not">Not <span className="font-normal text-muted-foreground">(isteğe bağlı)</span></FieldLabel><Textarea id="ds-not" rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
              </>
            )}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => setAction(null)}>İptal</Button>
            <Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{busy ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}
