"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock,
  FolderOpen, Loader2, Plus, Receipt,
  Search, Store, Trash2, Wrench, X,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";

type Project = {
  id: string; name: string; project_no?: string; status: string;
  scope_codes?: string[];
  description?: string;
};

type ServiceForm    = { id: string; project_id: string; year: number; month: number };
type ProgressPayment = { id: string; project_id: string; payment_type: string; period?: string };
type InvoiceRecord  = { id: string; project_id: string; invoice_type: string; period?: string };

const MONTHS_TR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                   "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function periodStr(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
      ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
    }`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {ok ? "Yüklendi" : "Bekliyor"}
    </span>
  );
}

function getRegion(project: Project): string {
  if (!project.description) return "—";
  try {
    const d = JSON.parse(project.description) as Record<string, string>;
    return d.bolge ?? d.sehir ?? "—";
  } catch { return "—"; }
}

// ── Bakım Mağazası Ekle Modal ─────────────────────────────────────────────────

function StoreAssignModal({ allStores, assignedIds, onClose, onDone }: {
  allStores: Project[];
  assignedIds: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [query,   setQuery]   = useState("");
  const [selIds,  setSelIds]  = useState<Set<string>>(new Set());
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");

  const unassigned = useMemo(() =>
    allStores.filter(p => !assignedIds.has(p.id)),
    [allStores, assignedIds]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return unassigned;
    const q = query.toLowerCase();
    return unassigned.filter(p =>
      p.name.toLowerCase().includes(q) || (p.project_no ?? "").toLowerCase().includes(q)
    );
  }, [unassigned, query]);

  const toggle = (id: string) =>
    setSelIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const selectAll = () => setSelIds(new Set(filtered.map(p => p.id)));
  const clearAll  = () => setSelIds(new Set());

  const handleSave = async () => {
    if (selIds.size === 0) { setErr("En az bir mağaza seçin."); return; }
    setBusy(true); setErr("");
    try {
      await apiPost("/maintenance/stores/assign", { store_ids: Array.from(selIds) });
      onDone(); onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? "Kayıt başarısız. Lütfen tekrar deneyin.");
    } finally { setBusy(false); }
  };

  const selectedList = allStores.filter(p => selIds.has(p.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Bakım Mağazası Ekle</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Bakım kapsamına alınacak mağazaları genel mağaza listesinden seçin.
            </p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>

        <div className="flex flex-1 min-h-0 divide-x divide-slate-100">
          {/* Sol: Arama + Liste */}
          <div className="flex-1 flex flex-col min-h-0 p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Mağaza adı veya kodu..."
                className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-sky-500 focus:outline-none" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{filtered.length} mağaza</span>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[11px] text-sky-600 hover:underline">Tümünü Seç</button>
                <button onClick={clearAll}  className="text-[11px] text-slate-400 hover:underline">Temizle</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 rounded-xl border border-slate-200">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-xs text-center text-slate-400">
                  {unassigned.length === 0 ? "Tüm mağazalar zaten bakım kapsamında." : "Sonuç bulunamadı."}
                </p>
              ) : (
                filtered.map(p => {
                  const checked = selIds.has(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${checked ? "bg-sky-50" : "hover:bg-slate-50"}`}>
                      <div className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${checked ? "bg-sky-600 border-sky-600" : "border-slate-300"}`}>
                        {checked && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      <Store className="h-4 w-4 text-slate-300 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{p.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{p.project_no ?? "—"}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Sağ: Seçilenler */}
          <div className="w-56 flex flex-col p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              Seçilen Mağazalar{selIds.size > 0 && <span className="ml-1 text-sky-600">({selIds.size})</span>}
            </p>
            <div className="flex-1 overflow-y-auto space-y-1">
              {selectedList.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Henüz mağaza seçilmedi.</p>
              ) : (
                selectedList.map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg bg-sky-50 px-2.5 py-1.5">
                    <Store className="h-3 w-3 text-sky-400 shrink-0" />
                    <p className="text-[11px] font-medium text-sky-800 truncate flex-1">{p.name}</p>
                    <button onClick={() => toggle(p.id)}>
                      <X className="h-3 w-3 text-sky-400 hover:text-sky-700" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
          {err ? <p className="text-xs text-red-600">{err}</p> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Vazgeç
            </button>
            <button onClick={handleSave} disabled={busy || selIds.size === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Bakım Kapsamına Ekle ({selIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────

export default function BakimPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [projects,    setProjects]    = useState<Project[]>([]);
  const [forms,       setForms]       = useState<ServiceForm[]>([]);
  const [payments,    setPayments]    = useState<ProgressPayment[]>([]);
  const [invoices,    setInvoices]    = useState<InvoiceRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [query,       setQuery]       = useState("");
  const [tab,         setTab]         = useState<"tumu" | "bekleyen" | "tamamlanan">("tumu");
  const [showAssign,  setShowAssign]  = useState(false);
  const [removing,    setRemoving]    = useState<string | null>(null);

  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const period = periodStr(year, month);

  const loadAll = async () => {
    setLoading(true);
    const [ps, allPs, fs, pays, invs] = await Promise.all([
      apiGet<Project[]>("/maintenance/stores").catch(() => [] as Project[]),
      apiGet<Project[]>("/projects?limit=5000").catch(() => [] as Project[]),
      apiGet<ServiceForm[]>(`/service-forms?year=${year}&month=${month}`).catch(() => [] as ServiceForm[]),
      apiGet<ProgressPayment[]>("/progress-payments?payment_type=bakim").catch(() => [] as ProgressPayment[]),
      apiGet<InvoiceRecord[]>("/invoice-records?invoice_type=bakım_faturası").catch(() => [] as InvoiceRecord[]),
    ]);
    setProjects(Array.isArray(ps) ? ps : []);
    setAllProjects(Array.isArray(allPs) ? allPs : []);
    setForms(Array.isArray(fs) ? fs : []);
    setPayments(Array.isArray(pays) ? pays : []);
    setInvoices(Array.isArray(invs) ? invs : []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [year, month]);

  const sfSet  = useMemo(() => new Set(forms.filter(f => f.year === year && f.month === month).map(f => f.project_id)), [forms, year, month]);
  const paySet = useMemo(() => new Set(payments.filter(p => p.period === period).map(p => p.project_id)), [payments, period]);
  const invSet = useMemo(() => new Set(invoices.filter(i => i.period === period).map(i => i.project_id)), [invoices, period]);

  const assignedIds = useMemo(() => new Set(projects.map(p => p.id)), [projects]);

  const filtered = useMemo(() => {
    let list = projects;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.project_no ?? "").toLowerCase().includes(q));
    }
    if (tab === "bekleyen")   list = list.filter(p => !sfSet.has(p.id) || !paySet.has(p.id) || !invSet.has(p.id));
    if (tab === "tamamlanan") list = list.filter(p =>  sfSet.has(p.id) &&  paySet.has(p.id) &&  invSet.has(p.id));
    return list;
  }, [projects, query, tab, sfSet, paySet, invSet]);

  const handleRemove = async (p: Project) => {
    if (!confirm(`"${p.name}" bakım takip listesinden çıkarılacak. Mağaza arşivinden silinmez. Devam etmek istiyor musunuz?`)) return;
    setRemoving(p.id);
    try {
      await apiPatch(`/maintenance/stores/${p.id}/remove`, {});
      await loadAll();
    } catch {
      alert("İşlem başarısız. Lütfen tekrar deneyin.");
    } finally { setRemoving(null); }
  };

  const sfWait  = projects.filter(p => !sfSet.has(p.id)).length;
  const sfDone  = projects.filter(p =>  sfSet.has(p.id)).length;
  const payWait = projects.filter(p => !paySet.has(p.id)).length;
  const invWait = projects.filter(p => !invSet.has(p.id)).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100">
            <Wrench className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Bakım & Onarım</h1>
            <p className="text-xs text-slate-500">Aylık servis formu, fatura ve hakkediş takibi</p>
          </div>
        </div>
        <button onClick={() => setShowAssign(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Bakım Mağazası Ekle
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Bakım Mağazası",   value: projects.length,                    color: "text-slate-800",  icon: Store         },
          { label: "SF Bekleyen",       value: sfWait,                             color: "text-amber-600",  icon: AlertCircle   },
          { label: "SF Yüklenen",       value: sfDone,                             color: "text-green-600",  icon: CheckCircle2  },
          { label: "Fatura Bekleyen",   value: invWait,                            color: "text-orange-600", icon: Receipt       },
          { label: "Hakkediş Bekleyen", value: payWait,                            color: "text-red-600",    icon: Receipt       },
          { label: "Bu Ay",             value: `${MONTHS_TR[month]} ${year}`,      color: "text-sky-700",    icon: CalendarDays  },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-3 flex items-center gap-2.5">
              <Icon className={`h-4 w-4 shrink-0 ${s.color}`} />
              <div className="min-w-0">
                <p className={`text-sm font-bold ${s.color} truncate`}>{s.value}</p>
                <p className="text-[9px] text-slate-400 leading-tight">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-0.5 border border-slate-200 rounded-xl p-1 bg-slate-50">
          {[
            { key: "tumu",       label: "Tümü" },
            { key: "bekleyen",   label: "Eksik Var" },
            { key: "tamamlanan", label: "Tüm Yüklendi" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Mağaza ara..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-sky-500 focus:outline-none" />
        </div>
        <span className="text-xs text-slate-400">{filtered.length} mağaza</span>
      </div>

      {/* Tablo */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-slate-200">
          <Wrench className="h-10 w-10 text-slate-200" />
          <p className="text-sm text-slate-400">
            {projects.length === 0 ? "Henüz bakım mağazası eklenmemiş." : "Kayıt bulunamadı."}
          </p>
          {projects.length === 0 && (
            <button onClick={() => setShowAssign(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700">
              <Plus className="h-3.5 w-3.5" /> Bakım Mağazası Ekle
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Mağaza</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Bölge</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Servis Formu</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Fatura</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Hakkediş</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-slate-300 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{p.project_no ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{getRegion(p)}</td>
                  <td className="px-4 py-3 text-center"><StatusDot ok={sfSet.has(p.id)} /></td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell"><StatusDot ok={invSet.has(p.id)} /></td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell"><StatusDot ok={paySet.has(p.id)} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/bakim/magazalar/${p.id}`}
                        className="inline-flex items-center gap-1 text-xs text-sky-600 border border-sky-200 rounded-lg px-2.5 py-1 hover:bg-sky-50 font-medium">
                        <FolderOpen className="h-3.5 w-3.5" /> Bakım Klasörü
                      </Link>
                      <button onClick={() => handleRemove(p)} disabled={removing === p.id}
                        title="Bakım kapsamından çıkar"
                        className="inline-flex items-center gap-1 text-xs text-red-500 border border-red-100 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-40">
                        {removing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        <span className="hidden lg:inline">Kapsamdan Çıkar</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAssign && (
        <StoreAssignModal
          allStores={allProjects}
          assignedIds={assignedIds}
          onClose={() => setShowAssign(false)}
          onDone={() => { setShowAssign(false); loadAll(); }}
        />
      )}
    </div>
  );
}
