"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownToLine, ArrowRightLeft, Boxes, ClipboardList,
  Package, Plus, Search, Store, Truck, Warehouse, X,
} from "lucide-react";
import { apiGet, apiPatch, apiPost, getRequestErrorMessage } from "@/lib/api";
import { formatQuantity, quantityForApi, quantityProblem, sanitizeQuantityInput } from "@/lib/quantity";
import { MaterialPicker, MaterialTitle, foldText } from "@/components/retail-stock/material-picker";
import { TransferDialog } from "@/components/retail-stock/transfer-dialog";

type Depot = { id: string; kind: "main" | "vehicle"; name: string; plate: string | null; assigned_user_id: string | null; is_active: boolean };
type Material = { id: string; sku: string; name: string; category: string | null; unit: string; brand?: string | null; spec?: string | null; unit_price?: string | null; min_stock: string };
type StockRow = { material_id: string; sku: string; name: string; category: string | null; unit: string; brand?: string | null; spec?: string | null; unit_price?: string | null; quantity: string; min_stock: string };
type Movement = { id: string; kind: string; material_name: string; material_sku?: string; unit: string; quantity: string; source_name: string | null; target_name: string | null; store_name: string | null; performed_by_name: string; performed_at: string; note: string | null; reference_no: string | null; work_order_id?: string | null; work_order_title?: string | null };
type Staff = { id: string; name: string };
type Action = "main" | "vehicle" | "material" | "opening" | "assign";
type Tab = "stock" | "vehicles" | "history";

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Ana depoya giriş", load: "Araca yükleme", use: "İş emri kullanımı",
  return: "Ana depoya iade", count: "Sayım düzeltmesi",
};

const amount = (value: string | number) => (Number.isFinite(Number(value)) ? formatQuantity(value) : "0");

const initialForm = {
  name: "", plate: "", assignedUserId: "", sku: "", category: "", unit: "adet",
  minStock: "0", materialId: "", vehicleId: "", quantity: "", reference: "", note: "",
};

function StatCard({ icon: Icon, label, value, caption }: { icon: typeof Boxes; label: string; value: string; caption: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.03)]">
    <div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold text-slate-500">{label}</span><Icon className="h-4 w-4 text-[#d90070]" /></div>
    <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
    <p className="mt-1 text-[11px] text-slate-400">{caption}</p>
  </div>;
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
  const [action, setAction] = useState<Action | null>(null);
  const [form, setForm] = useState(initialForm);
  const [transferOpen, setTransferOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mainDepot = depots.find((depot) => depot.kind === "main");
  const viewableDepots = manager ? depots : depots.filter((depot) => depot.kind === "vehicle");
  const vehicles = depots.filter((depot) => depot.kind === "vehicle");
  const selectedDepot = depots.find((depot) => depot.id === selectedDepotId);

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
      const viewable = manager ? nextDepots : nextDepots.filter((depot) => depot.kind === "vehicle");
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
      const haystack = foldText([row.name, row.spec, row.brand, row.sku, row.category].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    });
    // Stoklu kalemler önce, sonra malzeme kodu sırası.
    return found.sort((a, b) => (Number(b.quantity) > 0 ? 1 : 0) - (Number(a.quantity) > 0 ? 1 : 0) || a.sku.localeCompare(b.sku, "tr", { numeric: true }));
  }, [stock, search]);
  // Ana depoda liste uzayıp gitmesin: aramasız 4 kalem, aramada en çok 30 sonuç. Cep depo küçüktür:
  // aramasız stoktaki tüm kalemler alt alta gösterilir (arayınca stokta olmayanlar da bulunur).
  const isVehicleDepot = selectedDepot?.kind === "vehicle";
  const visibleStock = useMemo(() => {
    if (search.trim()) return matchingStock.slice(0, 30);
    if (isVehicleDepot) return matchingStock.filter((row) => Number(row.quantity) > 0);
    return matchingStock.slice(0, 4);
  }, [matchingStock, search, isVehicleDepot]);
  const hiddenStockCount = isVehicleDepot && !search.trim() ? 0 : matchingStock.length - visibleStock.length;
  const lowCount = stock.filter((row) => Number(row.min_stock) > 0 && Number(row.quantity) <= Number(row.min_stock)).length;
  const stockedMaterialCount = stock.filter((row) => Number(row.quantity) > 0).length;

  function openAction(next: Action, depot?: Depot) {
    setError(""); setSuccess("");
    setForm({ ...initialForm, vehicleId: depot?.kind === "vehicle" ? depot.id : "", assignedUserId: depot?.assigned_user_id ?? "" });
    if (next === "opening") setSelectedDepotId(mainDepot?.id ?? "");
    setAction(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy) return;
    if (action === "opening") {
      if (!form.materialId) { setError("Malzeme seçin."); return; }
      const problem = quantityProblem(form.quantity);
      if (problem) { setError(problem); return; }
    }
    if (action === "material" && form.minStock.trim() && form.minStock.trim() !== "0" && quantityProblem(form.minStock)) {
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
      } else if (action === "assign") {
        await apiPatch(`/retail-stock/depots/${form.vehicleId}`, { assigned_user_id: form.assignedUserId || null });
      } else if (action === "opening") {
        await apiPost("/retail-stock/opening", {
          depot_id: mainDepot?.id, material_id: form.materialId, quantity: quantityForApi(form.quantity),
          reference_no: form.reference.trim() || null, note: form.note.trim() || null,
        });
      }
      setAction(null);
      setSuccess("İşlem kaydedildi; stok bakiyesi ve hareket geçmişi güncellendi.");
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

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#bd0063]">OKUR · SAHA LOJİSTİĞİ</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Depo & Stok</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Ana depodan plakalı araçlara aktarın. Kullanılan malzeme, iş emri tamamlanınca çalışanın cep deposundan otomatik düşer.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {manager && <button type="button" onClick={() => openAction("material")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#d90070]/40"><Plus className="h-4 w-4" /> Malzeme ekle</button>}
        {manager && <button type="button" onClick={() => openAction("vehicle")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#d90070]/40"><Truck className="h-4 w-4" /> Araç ekle</button>}
      </div>
    </div>

    {error && !action && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Warehouse} label="Ana depo" value={mainDepot ? "Hazır" : "Yok"} caption={mainDepot?.name ?? "Önce oluşturun"} />
      <StatCard icon={Truck} label="Cep depolar" value={String(vehicles.length)} caption="Plakaya bağlı araç" />
      <StatCard icon={Boxes} label="Malzeme kataloğu" value={String(materials.length)} caption={materials.length > 0 ? "Fiyat listesinden aktarılan stok kartları" : "Henüz stok kartı yok"} />
      <StatCard icon={Package} label="Stoklu malzeme" value={String(stockedMaterialCount)} caption={`${lowCount} kritik stok kalemi`} />
    </div>

    {!loading && manager && !mainDepot && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[#d90070]/40 bg-[#fff6fa] p-5">
      <div><p className="font-semibold text-slate-900">İlk adım: Ana depoyu oluşturun</p><p className="mt-1 text-xs text-slate-600">Malzeme girişleri önce ana depoya yapılır; araçlara aktarım bundan sonra açılır.</p></div>
      <button type="button" onClick={() => openAction("main")} className="rounded-xl bg-[#d90070] px-4 py-2.5 text-xs font-semibold text-white">Ana depo oluştur</button>
    </div>}
    {!loading && !manager && vehicles.length === 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Henüz size atanmış araç deposu yok. Plakanızın yönetici tarafından atanması gerekiyor.</div>}

    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-100 p-2">
        {([ ["stock", "Stok Durumu", Boxes], ["vehicles", "Araç Depoları", Truck], ["history", "Hareketler", ClipboardList] ] as const).map(([value, label, Icon]) =>
          <button key={value} type="button" onClick={() => setTab(value)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${tab === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}><Icon className="h-4 w-4" />{label}</button>
        )}
      </div>

      {tab === "stock" && <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-slate-900">Depo bakiyesi</h2><p className="mt-0.5 text-xs text-slate-500">Miktarlar hareket kaydından güncellenir; eksi stok mümkün değildir.</p></div>
          <div className="flex flex-wrap gap-2">
            {manager && mainDepot && materials.length > 0 && <button type="button" onClick={() => openAction("opening")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Stok girişi</button>}
            {canTransfer && <button type="button" onClick={() => setTransferOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"><ArrowRightLeft className="h-3.5 w-3.5" />{manager ? "Aktarım" : "Ana depoya iade"}</button>}
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(12rem,18rem)_1fr]">
          <select aria-label="Depo seç" value={selectedDepotId} onChange={(event) => setSelectedDepotId(event.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#d90070]">
            {viewableDepots.length === 0 && <option value="">Depo bulunmuyor</option>}
            {viewableDepots.map((depot) => <option key={depot.id} value={depot.id}>{depot.kind === "main" ? "Ana depo" : depot.plate} · {depot.name}</option>)}
          </select>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Malzeme adı, kodu veya kategori ara" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pl-10 text-sm outline-none focus:border-[#d90070]" /></div>
        </div>
        {loading ? <p className="py-12 text-center text-sm text-slate-400">Stok yükleniyor…</p> : visibleStock.length === 0 ? <div className="py-14 text-center"><Boxes className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">Henüz malzeme bulunmuyor</p><p className="mt-1 text-xs text-slate-400">Bu depoda henüz stok yok. Ana depoya &quot;Stok girişi&quot; yapın, sonra &quot;Aktarım&quot; ile araçlara gönderin.</p></div> :
          <div className="mt-4 divide-y divide-slate-100">{visibleStock.map((row) => <div key={row.material_id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-900"><MaterialTitle sku={row.sku} name={row.name} spec={row.spec} /></p><p className="mt-0.5 break-words text-xs text-slate-400">{[row.category, row.brand].filter(Boolean).join(" · ")}</p>{manager && row.unit_price && <p className="mt-0.5 text-[11px] text-slate-500">Birim fiyat: {Number(row.unit_price).toLocaleString("tr-TR", { maximumFractionDigits: 4 })} / {row.unit}</p>}</div>
            <div className="shrink-0 text-right"><p className={`text-sm font-bold ${Number(row.min_stock) > 0 && Number(row.quantity) <= Number(row.min_stock) ? "text-amber-700" : "text-slate-900"}`}>{amount(row.quantity)} <span className="text-xs font-medium text-slate-500">{row.unit}</span></p>{Number(row.min_stock) > 0 && Number(row.quantity) <= Number(row.min_stock) && <p className="text-[10px] text-amber-600">Kritik seviye</p>}</div>
          </div>)}</div>}
        {!loading && visibleStock.length > 0 && hiddenStockCount > 0 && <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">{search.trim() ? `${hiddenStockCount} sonuç daha var; aramayı daraltın.` : `${hiddenStockCount} malzeme daha var. Görmek istediğiniz malzemeyi yukarıdaki kutuya ad, kod veya kategori yazarak bulun.`}</p>}
      </div>}

      {tab === "vehicles" && <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {vehicles.length === 0 ? <p className="col-span-full py-10 text-center text-sm text-slate-500">Henüz plakaya bağlı araç deposu yok.</p> : vehicles.map((vehicle) => <div key={vehicle.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between"><Truck className="h-5 w-5 text-[#d90070]" /><span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold tracking-wide text-slate-800">{vehicle.plate}</span></div>
          <p className="mt-4 font-semibold text-slate-900">{vehicle.name}</p>
          <p className="mt-1 text-xs text-slate-500">{staff.find((person) => person.id === vehicle.assigned_user_id)?.name ?? (vehicle.assigned_user_id ? "Size atanmış araç" : "Çalışan atanmamış")}</p>
          <div className="mt-4 flex gap-2"><button type="button" onClick={() => { setSelectedDepotId(vehicle.id); setTab("stock"); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Stoku gör</button>{manager && <button type="button" onClick={() => openAction("assign", vehicle)} className="rounded-lg px-3 py-2 text-xs font-semibold text-[#bd0063]">Çalışan ata</button>}</div>
        </div>)}
      </div>}

      {tab === "history" && <div className="divide-y divide-slate-100 p-4 sm:p-5">
        {movements.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Henüz stok hareketi yok.</p> : movements.map((movement) => <div key={movement.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
          <div className="flex min-w-0 items-start gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-600">{movement.kind === "use" ? <Store className="h-4 w-4" /> : movement.kind === "load" ? <ArrowRightLeft className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}</div><div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{movement.material_sku ? <MaterialTitle sku={movement.material_sku} name={movement.material_name} /> : movement.material_name} <span className="font-normal text-slate-500">· {MOVEMENT_LABELS[movement.kind] ?? movement.kind}</span></p><p className="mt-1 text-xs text-slate-500">{[movement.source_name, movement.target_name, movement.store_name].filter(Boolean).join(" → ")}</p>{movement.work_order_title && <p className="mt-1 text-xs font-medium text-[#bd0063]">İş emri: {movement.work_order_title}</p>}<p className="mt-1 text-[11px] text-slate-400">{movement.performed_by_name} · {new Date(movement.performed_at).toLocaleString("tr-TR")}{movement.note ? ` · ${movement.note}` : ""}</p></div></div>
          <span className="shrink-0 text-sm font-bold text-slate-900">{amount(movement.quantity)} {movement.unit}</span>
        </div>)}
      </div>}
    </div>



    {transferOpen && <TransferDialog depots={depots} manager={manager} initialSourceId={selectedDepotId} onClose={() => setTransferOpen(false)}
      onDone={(message) => { setTransferOpen(false); setSuccess(message); void loadAll().then(() => refreshStock(selectedDepotId)); }} />}

    {action && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setAction(null); }}>
      <div role="dialog" aria-modal="true" aria-label="Depo stok işlemi" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-[#bd0063]">OKUR DEPO</p><h2 className="mt-1 text-lg font-bold text-slate-950">{{ main: "Ana depo oluştur", vehicle: "Araç deposu ekle", material: "Malzeme ekle", opening: "Ana depoya stok girişi", assign: "Araca çalışan ata" }[action]}</h2></div><button type="button" onClick={() => setAction(null)} aria-label="Kapat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4 p-5">
          {(action === "main" || action === "vehicle" || action === "material") && <label className="block text-xs font-semibold text-slate-600">{action === "material" ? "Malzeme adı" : "Depo adı"}<input required minLength={2} maxLength={action === "material" ? 255 : 120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={action === "vehicle" ? "Örn. Servis Aracı 1" : action === "main" ? "Örn. OKUR Ana Depo" : "Örn. Bakır Boru 1/4"} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#d90070]" /></label>}
          {action === "vehicle" && <label className="block text-xs font-semibold text-slate-600">Araç plakası<input required minLength={4} maxLength={20} value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value.toLocaleUpperCase("tr-TR") })} placeholder="34 ABC 123" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#d90070]" /></label>}
          {(action === "vehicle" || action === "assign") && <label className="block text-xs font-semibold text-slate-600">Atanacak çalışan <span className="font-normal text-slate-400">(isteğe bağlı)</span><select value={form.assignedUserId} onChange={(event) => setForm({ ...form, assignedUserId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Henüz atanmadı</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
          {action === "material" && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Malzeme kodu<input required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="MLZ-001" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Birim<input required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="adet / metre / kg" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Kategori<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Soğutma" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Kritik stok eşiği<input inputMode="decimal" autoComplete="off" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: sanitizeQuantityInput(event.target.value) })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label></div>}
          {action === "opening" && <>
            <div className="block text-xs font-semibold text-slate-600"><span>Malzeme</span><div className="mt-1.5"><MaterialPicker value={form.materialId} onChange={(id) => setForm({ ...form, materialId: id })} options={materials.map((material) => ({ id: material.id, name: material.name, spec: material.spec, brand: material.brand, sku: material.sku, hint: mainStockHint(material.id, material.unit) }))} /></div></div>
            <label className="block text-xs font-semibold text-slate-600">Miktar<input required inputMode="decimal" autoComplete="off" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: sanitizeQuantityInput(event.target.value) })} placeholder="örn. 5 veya 0,5" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
            <label className="block text-xs font-semibold text-slate-600">Fiş / referans no <span className="font-normal text-slate-400">(isteğe bağlı)</span><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
            <label className="block text-xs font-semibold text-slate-600">Not <span className="font-normal text-slate-400">(isteğe bağlı)</span><textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
          </>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setAction(null)} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500">İptal</button><button type="submit" disabled={busy} className="rounded-xl bg-[#d90070] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
        </form>
      </div>
    </div>}
  </div>;
}
