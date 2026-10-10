"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  ChevronLeft, ChevronRight, Edit2, Eye, EyeOff, FileUp, FolderOpen, Loader2, MapPin,
  MoreVertical, Plus, Search, Store, Trash2, X,
} from "lucide-react";
import { CircleMenu, type CircleMenuItem } from "@/components/ui/circle-menu";
import { apiGet } from "@/lib/api";
import {
  getStores, createStore, updateStore,
  getStoresPage, getAllRegions, getCancelledStoreCount,
} from "@/services/stores";
import { StoreCardSkeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────────

type Project = {
  id: string; name: string; project_no?: string; description?: string;
  status: string; scope_codes?: string[];
  start_date?: string; due_date?: string;
  created_at?: string; updated_at?: string;
  customer_id?: string; region_id?: string; branch_id?: string;
};

type Customer = { id: string; name: string; code?: string };
type Region   = { id: string; name: string; city: string; customer_id: string };
type Branch   = { id: string; name: string; city: string; region_id: string };

type DescExtra = {
  store_type?: string; format?: string;
  bolge?: string; sehir?: string;
  tel1?: string; tel2?: string; tel3?: string; tel4?: string;
  adres?: string; acilis_tarihi?: string;
};

function parseDesc(desc?: string): DescExtra {
  if (!desc) return {};
  try { return JSON.parse(desc); } catch { return {}; }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STORE_TYPE_OPTS = [
  { value: "existing_store", label: "Mevcut Mağaza" },
  { value: "new_build",      label: "Yeni Yapım"    },
  { value: "closed_store",   label: "Kapanan Mağaza"},
  { value: "facility",       label: "Tesis"         },
];

const STORE_TYPE_BADGE: Record<string, string> = {
  existing_store: "bg-blue-50 text-blue-700",
  new_build:      "bg-emerald-50 text-emerald-700",
  closed_store:   "bg-slate-100 text-slate-500",
  facility:       "bg-purple-50 text-purple-700",
};


const STATUS_OPTS = [
  { value: "inquiry",      label: "Keşif"        },
  { value: "approved",     label: "Onaylandı"    },
  { value: "in_progress",  label: "Devam Ediyor" },
  { value: "invoice_pend", label: "Beklemede"    },
  { value: "completed",    label: "Tamamlandı"   },
  { value: "cancelled",    label: "İptal Edildi" },
];


function isCancelled(s: string) { return s === "cancelled" || s === "CANCELLED"; }

// ── Mağaza Kartı ───────────────────────────────────────────────────────────────

function MagazaKart({ p, regionName, detailHrefBase, onEdit, onDeactivate, canManage }: {
  p: Project; regionName?: string; detailHrefBase: string;
  onEdit: (p: Project) => void; onDeactivate: (p: Project) => void;
  canManage: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const extra    = parseDesc(p.description);
  const stType   = STORE_TYPE_OPTS.find(o => o.value === extra.store_type);
  const isCancl  = isCancelled(p.status);

  return (
    <div className={`relative flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 group ${
      isCancl ? "border-slate-100 opacity-50" : "border-slate-200 hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5"
    }`}>
      {/* Context menu */}
      {canManage && <div className="absolute top-3 right-3">
        <button onClick={() => setMenuOpen(v => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <button onClick={() => { setMenuOpen(false); onEdit(p); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Düzenle
              </button>
              <button onClick={() => { setMenuOpen(false); onDeactivate(p); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 ${isCancl ? "text-green-700" : "text-red-600 hover:bg-red-50"}`}>
                <Trash2 className="h-3.5 w-3.5" /> {isCancl ? "Aktife Al" : "Pasifleştir"}
              </button>
            </div>
          </>
        )}
      </div>}

      {/* Header */}
      <div className="flex items-start gap-2.5 mb-3 pr-6">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100">
          <Store className="h-4 w-4 text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">{p.name}</p>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{p.project_no ?? "—"}</p>
        </div>
      </div>

      {regionName && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <MapPin className="h-3 w-3 text-slate-300 shrink-0" />
          <span className="text-[11px] text-slate-500 truncate">{regionName}</span>
        </div>
      )}

      {/* Mağaza formatı operasyon türünden bağımsızdır. */}
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[22px]">
        {stType && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STORE_TYPE_BADGE[stType.value] ?? "bg-slate-100 text-slate-600"}`}>
            {stType.label}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-100">
        <p className="text-[10px] text-slate-300">
          {p.updated_at ? new Date(p.updated_at).toLocaleDateString("tr-TR") : "—"}
        </p>
        <Link href={`${detailHrefBase}/${p.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
          <FolderOpen className="h-3.5 w-3.5" /> Klasörü Aç
        </Link>
      </div>
    </div>
  );
}

// ── Store Form Modal ───────────────────────────────────────────────────────────

type StoreFormState = {
  customer_id: string; region_id: string; branch_id: string;
  name: string; project_no: string; status: string;
  bolge: string; sehir: string; adres: string; tel1: string;
};

function defaultForm(): StoreFormState {
  return {
    customer_id: "", region_id: "", branch_id: "",
    name: "", project_no: "", status: "inquiry",
    bolge: "", sehir: "", adres: "", tel1: "",
  };
}

function editForm(p: Project): StoreFormState {
  const extra = parseDesc(p.description);
  return {
    customer_id: p.customer_id ?? "", region_id: p.region_id ?? "", branch_id: p.branch_id ?? "",
    name: p.name, project_no: p.project_no ?? "", status: p.status.toLowerCase(),
    bolge: extra.bolge ?? "", sehir: extra.sehir ?? "", adres: extra.adres ?? "",
    tel1: extra.tel1 ?? "",
  };
}

function buildDescription(existing: string | undefined, form: StoreFormState): string {
  let base: DescExtra = {};
  try { base = JSON.parse(existing || "{}"); } catch {}
  if (form.bolge.trim())      base.bolge      = form.bolge.trim();      else delete base.bolge;
  if (form.sehir.trim())      base.sehir      = form.sehir.trim();      else delete base.sehir;
  if (form.adres.trim())      base.adres      = form.adres.trim();      else delete base.adres;
  if (form.tel1.trim())       base.tel1       = form.tel1.trim();       else delete base.tel1;
  return JSON.stringify(base);
}

function StoreFormModal({ mode, initial, projectId, existingDescription, existingScopeCodes, customers, onClose, onDone }: {
  mode: "create" | "edit"; initial: StoreFormState; projectId?: string;
  existingDescription?: string; existingScopeCodes?: string[];
  customers: Customer[]; onClose: () => void; onDone: () => void;
}) {
  const [form,     setForm]     = useState<StoreFormState>(initial);
  const [regions,  setRegions]  = useState<Region[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  useEffect(() => {
    if (initial.customer_id) {
      apiGet<Region[]>(`/projects/regions/${initial.customer_id}`)
        .then(d => setRegions(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [initial.customer_id]);
  useEffect(() => {
    if (initial.region_id) {
      apiGet<Branch[]>(`/projects/branches/${initial.region_id}`)
        .then(d => setBranches(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [initial.region_id]);

  const onCustomerChange = async (id: string) => {
    setForm(p => ({ ...p, customer_id: id, region_id: "", branch_id: "" }));
    setRegions([]); setBranches([]);
    if (!id) return;
    const d = await apiGet<Region[]>(`/projects/regions/${id}`).catch(() => [] as Region[]);
    setRegions(Array.isArray(d) ? d : []);
  };

  const onRegionChange = async (id: string) => {
    setForm(p => ({ ...p, region_id: id, branch_id: "" }));
    setBranches([]);
    if (!id) return;
    const d = await apiGet<Branch[]>(`/projects/branches/${id}`).catch(() => [] as Branch[]);
    setBranches(Array.isArray(d) ? d : []);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "create" && (!form.customer_id || !form.region_id || !form.branch_id)) {
      setErr("Konum bilgisi zorunludur (Zincir, Şehir, Konum)."); return;
    }
    setBusy(true); setErr("");
    try {
      const desc = buildDescription(existingDescription, form);
      const payload = {
        name: form.name.trim(), project_no: form.project_no.trim() || null,
        description: desc, status: form.status, contract_value: null,
      };
      if (mode === "create") {
        await createStore({ ...payload, customer_id: form.customer_id, region_id: form.region_id, branch_id: form.branch_id });
      } else {
        // scope_codes değiştirilmez — bakım/tadilat/yeni_yapım modüllerinden yönetilir
        await updateStore(projectId!, { ...payload, scope_codes: existingScopeCodes ?? [] });
      }
      onDone(); onClose();
    } catch (ex: any) {
      const detail = ex?.response?.data?.detail;
      setErr(typeof detail === "string" ? detail : "İşlem başarısız.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-900">
            {mode === "create" ? "Yeni Mağaza Ekle" : "Mağaza Bilgilerini Düzenle"}
          </h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[75vh] px-6 py-5 space-y-4">
          {mode === "create" && (
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Konum Bilgisi</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Zinciri *</label>
                <select required value={form.customer_id} onChange={e => onCustomerChange(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">Zincir seçin...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Şehir / Bölge *</label>
                <select required value={form.region_id} onChange={e => onRegionChange(e.target.value)}
                  disabled={!form.customer_id}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50">
                  <option value="">Şehir seçin...</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.city}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Konumu *</label>
                <select required value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}
                  disabled={!form.region_id}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50">
                  <option value="">Konum seçin...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Adı *</label>
              <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Örn: Migros Ataşehir MMM" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Kodu</label>
              <input value={form.project_no} onChange={e => setForm(p => ({ ...p, project_no: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Örn: 3421" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bölge</label>
              <input value={form.bolge} onChange={e => setForm(p => ({ ...p, bolge: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Örn: İç Anadolu" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Şehir</label>
              <input value={form.sehir} onChange={e => setForm(p => ({ ...p, sehir: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Örn: Ankara" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telefon</label>
              <input value={form.tel1} onChange={e => setForm(p => ({ ...p, tel1: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="0XXX XXX XX XX" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Adres</label>
              <textarea rows={2} value={form.adres} onChange={e => setForm(p => ({ ...p, adres: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                placeholder="Tam adres..." />
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Vazgeç
            </button>
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? "Mağaza Oluştur" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Pasifleştir Modal ──────────────────────────────────────────────────────────

function DeactivateModal({ project, onClose, onDone }: { project: Project; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const isCancl = isCancelled(project.status);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await updateStore(project.id, { status: isCancl ? "inquiry" : "cancelled" });
      onDone(); onClose();
    } catch { alert("İşlem başarısız."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-2">
          {isCancl ? "Mağazayı Aktife Al" : "Mağazayı Pasifleştir"}
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          {isCancl
            ? `"${project.name}" tekrar aktif listeye alınacak.`
            : `"${project.name}" pasifleştirilecek. Dosyalar ve geçmiş korunacak.`}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Vazgeç
          </button>
          <button onClick={handleConfirm} disabled={busy}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              isCancl ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            }`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isCancl ? "Aktife Al" : "Pasifleştir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ana Sayfa ──────────────────────────────────────────────────────────────────

export default function MagazalarPage() {
  const pathname = usePathname();
  const router = useRouter();
  const isManager = pathname?.startsWith("/manager");
  const isAdmin = pathname?.startsWith("/admin");
  const isUser = pathname?.startsWith("/user");
  const canManage = !isUser;
  const basePath = isManager ? "/manager/magaza-karti" : isAdmin ? "/admin/stores" : isUser ? "/user/magaza-karti" : "/projects";
  const importHref = `${basePath}/import`;

  const [projects,      setProjects]      = useState<Project[]>([]);
  const [totalCount,    setTotalCount]    = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [customers,     setCustomers]     = useState<Customer[]>([]);
  const [regionMap,     setRegionMap]     = useState<Record<string, string>>({});
  const [allRegions,    setAllRegions]    = useState<Region[]>([]);
  const [loading,       setLoading]       = useState(true);

  const [search,           setSearch]           = useState("");
  const [searchDebounced,  setSearchDebounced]  = useState("");
  const [filterStoreType,  setFilterStoreType]  = useState("all");
  const [filterRegion,     setFilterRegion]     = useState("all");
  const [showCancelled,    setShowCancelled]    = useState(false);
  const [page,             setPage]             = useState(1);
  const [pageSize,         setPageSize]         = useState(25);
  // Filtre "navigator" menüsünde hangi alt panel açık: bölge listesi, mağaza
  // türü listesi ya da hiçbiri. Daire menüdeki ilgili öğeye tıklanınca açılır.
  const [activePanel,      setActivePanel]      = useState<"region" | "type" | null>(null);

  const [createOpen,     setCreateOpen]     = useState(false);
  const [editProject,    setEditProject]    = useState<Project | null>(null);
  const [deactivateProj, setDeactivateProj] = useState<Project | null>(null);

  // Referans veri (zincirler + bölgeler) sayfa açılışında BİR KEZ, arama/
  // sayfalama state'inden bağımsız yüklenir — her tuş vuruşunda tekrar
  // çekilmez. Mağaza listesinden ayrı, paralel çalışır.
  useEffect(() => {
    (async () => {
      const [custs, regions] = await Promise.all([
        apiGet<Customer[]>("/projects/customers").catch(() => [] as Customer[]),
        getAllRegions().catch(() => [] as Region[]),
      ]);
      setCustomers(Array.isArray(custs) ? custs : []);
      setAllRegions(regions);
      const rMap: Record<string, string> = {};
      for (const r of regions) rMap[r.id] = r.name;
      setRegionMap(rMap);
    })();
    getCancelledStoreCount().then(setCancelledCount).catch(() => {});
  }, []);

  // Mağaza listesi — sunucu taraflı sayfalama + arama + bölge filtresi.
  // 4000+ mağazayı tek seferde çekmek yerine yalnızca görüntülenen sayfa
  // istenir (bkz. services/stores.ts: getStoresPage).
  const loadStores = async () => {
    setLoading(true);
    try {
      if (filterStoreType !== "all") {
        // Mağaza türü (JSON description alanında saklanıyor, indekslenmiş bir
        // kolon değil) backend'de filtrelenemiyor — bu nadir kullanılan filtre
        // aktifken tam listeyi çekip client-side filtrelemeye devam ediyoruz.
        // Migration'sız, sonuçların yanlış/eksik görünmesini engelleyen güvenli tercih.
        const all = await getStores({ q: searchDebounced || undefined }).catch(() => [] as Project[]);
        const afterRegion    = filterRegion === "all" ? all : all.filter(p => p.region_id === filterRegion);
        const afterCancelled = showCancelled ? afterRegion : afterRegion.filter(p => !isCancelled(p.status));
        const afterType      = afterCancelled.filter(p => parseDesc(p.description).store_type === filterStoreType);
        setTotalCount(afterType.length);
        const start = (page - 1) * pageSize;
        setProjects(afterType.slice(start, start + pageSize));
      } else {
        const { items, total } = await getStoresPage({
          page, pageSize, q: searchDebounced,
          regionId: filterRegion, includeCancelled: showCancelled,
        });
        setProjects(items);
        setTotalCount(total);
      }
    } catch {
      setProjects([]); setTotalCount(0);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadStores(); }, [page, pageSize, searchDebounced, filterRegion, filterStoreType, showCancelled]);

  // Arama debounce'lu — her tuş vuruşunda istek atmaz. Sayfa sıfırlaması da
  // aynı state güncellemesinde yapılır: ayrı bir "filtre değişti → setPage(1)"
  // effect'i kullanılsa, sayfa 1'de değilken filtre değiştirmek iki ayrı
  // render (biri eski sayfa, biri sayfa 1) ve dolayısıyla İKİ ayrı sunucu
  // isteği üretirdi. Sıfırlamayı tetikleyen noktaya taşıyarak tek istek kalır.
  useEffect(() => {
    const t = setTimeout(() => { setSearchDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const totalPages  = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart    = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd      = Math.min(currentPage * pageSize, totalCount);
  const pageItems    = projects;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{isAdmin ? "Mağaza Yönetimi" : "Mağaza Kartı"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? "Mağaza listesini görüntüleyin, Excel'den içe aktarın ve mağaza bilgilerini yönetin."
              : loading ? "Yükleniyor..." : `${totalCount.toLocaleString("tr-TR")} mağaza · ${allRegions.length} bölge`}
          </p>
        </div>
      </div>

      {/* Arama çubuğu */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Mağaza adı veya kodu ara..."
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
      </div>

      {/* Ana buton — arama çubuğunun SOL-ALTINDA. TÜM panellerde (admin,
          yönetici, kullanıcı) görünür; sadece içerdiği öğeler role göre
          değişir: filtreler (Bölgeler / Mağaza Türü / Aktif-Pasif) herkeste,
          "Yeni Mağaza Ekle" ve "Excel'den İçe Aktar" yalnızca yetkili
          rollerde (canManage). direction="right": öğeler tetikleyicinin
          YANINDAN başlayıp SAĞA doğru, hafif bir CSS geçişiyle açılır. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
            <CircleMenu
              direction="right"
              items={[
                ...(canManage ? [
                  {
                    label: "Yeni Mağaza Ekle", icon: <Plus className="h-4 w-4 text-foreground" />,
                    onClick: () => setCreateOpen(true),
                  },
                  {
                    label: "Excel'den İçe Aktar", icon: <FileUp className="h-4 w-4 text-foreground" />,
                    onClick: () => router.push(importHref),
                  },
                ] as CircleMenuItem[] : []),
                {
                  label: "Bölgeler", icon: <MapPin className="h-4 w-4 text-foreground" />,
                  active: filterRegion !== "all",
                  onClick: () => setActivePanel("region"),
                },
                {
                  label: "Mağaza Türü", icon: <Store className="h-4 w-4 text-foreground" />,
                  active: filterStoreType !== "all",
                  onClick: () => setActivePanel("type"),
                },
                ...(cancelledCount > 0 ? [{
                  label: showCancelled ? "Pasifleri Gizle" : "Pasifleri Göster",
                  icon: showCancelled ? <EyeOff className="h-4 w-4 text-foreground" /> : <Eye className="h-4 w-4 text-foreground" />,
                  active: showCancelled,
                  onClick: () => { setShowCancelled(v => !v); setPage(1); },
                } as CircleMenuItem] : []),
              ]}
            />

            {/* Bölge seçim paneli */}
            {activePanel === "region" && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActivePanel(null)} />
                <div className="absolute left-0 top-full z-50 mt-2 max-h-72 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button onClick={() => { setFilterRegion("all"); setPage(1); setActivePanel(null); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium ${filterRegion === "all" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> Tüm Bölgeler
                  </button>
                  {allRegions.map(r => (
                    <button key={r.id} onClick={() => { setFilterRegion(r.id); setPage(1); setActivePanel(null); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium ${filterRegion === r.id ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {r.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Mağaza türü seçim paneli */}
            {activePanel === "type" && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActivePanel(null)} />
                <div className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button onClick={() => { setFilterStoreType("all"); setPage(1); setActivePanel(null); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium ${filterStoreType === "all" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                    <Store className="h-3.5 w-3.5 shrink-0" /> Tüm Mağazalar
                  </button>
                  {STORE_TYPE_OPTS.map(o => (
                    <button key={o.value} onClick={() => { setFilterStoreType(o.value); setPage(1); setActivePanel(null); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium ${filterStoreType === o.value ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                      <Store className="h-3.5 w-3.5 shrink-0" /> {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
        </div>
      </div>

      {/* Uygulanan filtreler — tetikleyicinin ALTINDA, ayrı satırda, küçük
          çipler halinde. Menü sağa açıldığında ikonların üzerine binmez
          (önceden aynı flex satırındaydı, çakışıyordu). */}
      {(filterRegion !== "all" || filterStoreType !== "all" || showCancelled) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filterRegion !== "all" && (
            <button onClick={() => { setFilterRegion("all"); setPage(1); }}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100">
              <MapPin className="h-3 w-3" /> {allRegions.find(r => r.id === filterRegion)?.name ?? "Bölge"} <X className="h-3 w-3" />
            </button>
          )}
          {filterStoreType !== "all" && (
            <button onClick={() => { setFilterStoreType("all"); setPage(1); }}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100">
              <Store className="h-3 w-3" /> {STORE_TYPE_OPTS.find(o => o.value === filterStoreType)?.label ?? "Tür"} <X className="h-3 w-3" />
            </button>
          )}
          {showCancelled && (
            <button onClick={() => { setShowCancelled(false); setPage(1); }}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100">
              <EyeOff className="h-3 w-3" /> Pasifler <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* İçerik */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => <StoreCardSkeleton key={i} />)}
        </div>
      ) : totalCount === 0 && !searchDebounced && filterStoreType === "all" && filterRegion === "all" && !showCancelled ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Store className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <h2 className="text-sm font-semibold text-slate-800">Mağaza verisi bulunmuyor</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mağaza listesinin sisteme aktarılması gerekiyor.
          </p>
          {canManage && <div className="mt-5 flex items-center justify-center gap-2">
            <Link href={importHref}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <FileUp className="h-4 w-4" /> Excel&apos;den İçe Aktar
            </Link>
            <button onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Yeni Mağaza Ekle
            </button>
          </div>}
        </div>
      ) : pageItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Search className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <h2 className="text-sm font-semibold text-slate-800">Mağaza bulunamadı</h2>
          <p className="mt-1 text-sm text-slate-500">Arama veya filtre kriterlerinizi değiştirerek tekrar deneyin.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pageItems.map(p => (
              <MagazaKart key={p.id} p={p} regionName={regionMap[p.region_id ?? ""]} detailHrefBase={basePath}
                onEdit={setEditProject} onDeactivate={setDeactivateProj} canManage={canManage} />
            ))}
          </div>

          {/* Sayfalama */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500">
              Toplam <span className="font-medium text-slate-700 tabular-nums">{totalCount.toLocaleString("tr-TR")}</span> mağaza içinde{" "}
              <span className="font-medium text-slate-700 tabular-nums">{pageStart.toLocaleString("tr-TR")}–{pageEnd.toLocaleString("tr-TR")}</span> arası gösteriliyor.
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                Sayfa başına
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-500 focus:outline-none">
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white">
                  <ChevronLeft className="h-3.5 w-3.5" /> Önceki
                </button>
                <span className="px-2 text-xs text-slate-500 tabular-nums">Sayfa {currentPage} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white">
                  Sonraki <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {canManage && createOpen && (
        <StoreFormModal mode="create" initial={defaultForm()} customers={customers}
          onClose={() => setCreateOpen(false)} onDone={loadStores} />
      )}
      {canManage && editProject && (
        <StoreFormModal mode="edit" initial={editForm(editProject)} projectId={editProject.id}
          existingDescription={editProject.description} existingScopeCodes={editProject.scope_codes}
          customers={customers} onClose={() => setEditProject(null)} onDone={loadStores} />
      )}
      {canManage && deactivateProj && (
        <DeactivateModal project={deactivateProj} onClose={() => setDeactivateProj(null)} onDone={loadStores} />
      )}
    </div>
  );
}
