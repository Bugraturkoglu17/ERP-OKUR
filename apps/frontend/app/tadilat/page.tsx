"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, CheckCircle2, Flame, FolderOpen, HardHat,
  Loader2, Plus, Search, Store, Thermometer, Trash2, Wrench, X,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";

type Project = {
  id: string; name: string; project_no?: string; status: string;
  scope_codes?: string[]; updated_at?: string;
};
type ActiveJob = {
  project_id: string; project_name: string; project_no?: string;
  process_id: string;
  work_type: string; process_title: string; current_stage?: string;
  target_end_date?: string; days_remaining?: number;
};

const SCOPE_OPTIONS = [
  { value: "yangin_dolabi",   label: "Yangın Tesisatı",           icon: Flame       },
  { value: "sprinkler_hatti", label: "Sprinkler Revizyonu",       icon: Wrench      },
  { value: "havalandirma",    label: "Havalandırma Revizyonu",    icon: Wrench      },
  { value: "kanal_imalati",   label: "Kanal Tadilatı",            icon: Wrench      },
  { value: "klima_sogutma",   label: "Klima / Soğutma Revizyonu", icon: Thermometer },
  { value: "mekanik_tesisat", label: "Mekanik Tesisat Revizyonu", icon: HardHat     },
  { value: "diger",           label: "Diğer",                     icon: Wrench      },
] as const;
type ScopeValue = typeof SCOPE_OPTIONS[number]["value"];

function getScopeLabel(code: string) {
  return SCOPE_OPTIONS.find(o => o.value === code)?.label ?? code;
}

// ── Tadilat Mağazası Ekle Modal ───────────────────────────────────────────────

function StoreAssignModal({ allStores, assignedIds, onClose, onDone }: {
  allStores: Project[];
  assignedIds: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [query,  setQuery]  = useState("");
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState("");

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

  const toggle    = (id: string) =>
    setSelIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => setSelIds(new Set(filtered.map(p => p.id)));
  const clearAll  = () => setSelIds(new Set());

  const handleSave = async () => {
    if (selIds.size === 0) { setErr("En az bir mağaza seçin."); return; }
    setBusy(true); setErr("");
    try {
      await apiPost("/renovation/stores/assign", { store_ids: Array.from(selIds) });
      onDone(); onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? "Kayıt başarısız.");
    } finally { setBusy(false); }
  };

  const selectedList = allStores.filter(p => selIds.has(p.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Tadilat Mağazası Ekle</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Tadilat kapsamına alınacak mağazaları genel mağaza listesinden seçin.
            </p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>

        <div className="flex flex-1 min-h-0 divide-x divide-slate-100">
          <div className="flex-1 flex flex-col min-h-0 p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Mağaza adı veya kodu..."
                className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-amber-500 focus:outline-none" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{filtered.length} mağaza</span>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[11px] text-amber-600 hover:underline">Tümünü Seç</button>
                <button onClick={clearAll}  className="text-[11px] text-slate-400 hover:underline">Temizle</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 rounded-xl border border-slate-200">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-xs text-center text-slate-400">
                  {unassigned.length === 0 ? "Tüm mağazalar zaten tadilat kapsamında." : "Sonuç bulunamadı."}
                </p>
              ) : (
                filtered.map(p => {
                  const checked = selIds.has(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${checked ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                      <div className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${checked ? "bg-amber-600 border-amber-600" : "border-slate-300"}`}>
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

          <div className="w-56 flex flex-col p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              Seçilen Mağazalar{selIds.size > 0 && <span className="ml-1 text-amber-600">({selIds.size})</span>}
            </p>
            <div className="flex-1 overflow-y-auto space-y-1">
              {selectedList.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Henüz mağaza seçilmedi.</p>
              ) : (
                selectedList.map(p => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5">
                    <Store className="h-3 w-3 text-amber-400 shrink-0" />
                    <p className="text-[11px] font-medium text-amber-800 truncate flex-1">{p.name}</p>
                    <button onClick={() => toggle(p.id)}>
                      <X className="h-3 w-3 text-amber-400 hover:text-amber-700" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
          {err ? <p className="text-xs text-red-600">{err}</p> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Vazgeç
            </button>
            <button onClick={handleSave} disabled={busy || selIds.size === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Tadilat Kapsamına Ekle ({selIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tadilat Başlat Modal ──────────────────────────────────────────────────────

function TadilatBaslatModal({ projects, initialStore, onClose, onDone }: {
  projects: Project[]; initialStore?: Project | null; onClose: () => void; onDone: () => void;
}) {
  const [step,       setStep]       = useState<1 | 2 | 3>(initialStore ? 2 : 1);
  const [query,      setQuery]      = useState("");
  const [selProject, setSelProject] = useState<Project | null>(initialStore ?? null);
  const [scopeCodes, setScopeCodes] = useState<ScopeValue[]>([]);
  const [form,       setForm]       = useState({ title: "", description: "", start_date: new Date().toISOString().split("T")[0], target_end_date: "", responsible_name: "" });
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState("");

  const filtered = projects.filter(p =>
    !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.project_no ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const toggleScope = (v: ScopeValue) =>
    setScopeCodes(prev => prev.includes(v) ? prev.filter(c => c !== v) : [...prev, v]);

  const handleSubmit = async () => {
    if (!selProject) return;
    setBusy(true); setErr("");
    try {
      if (scopeCodes.length <= 1) {
        await apiPost(`/process/projects/${selProject.id}/process`, {
          work_type: "tadilat",
          title: form.title.trim() || (scopeCodes[0] ? getScopeLabel(scopeCodes[0]) : "Tadilat Süreci"),
          scope_code: scopeCodes[0] ?? null,
          description: form.description.trim() || null,
          start_date: form.start_date ? `${form.start_date}T00:00:00` : null,
          target_end_date: form.target_end_date ? `${form.target_end_date}T00:00:00` : null,
          responsible_name: form.responsible_name || null,
        });
      } else {
        await apiPost(`/process/projects/${selProject.id}/process/bulk`, {
          work_type: "tadilat",
          title: form.title.trim() || "Tadilat Süreci",
          scope_codes: scopeCodes,
          description: form.description.trim() || null,
          start_date: form.start_date ? `${form.start_date}T00:00:00` : null,
          target_end_date: form.target_end_date ? `${form.target_end_date}T00:00:00` : null,
          responsible_name: form.responsible_name || null,
        });
      }
      onDone(); onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? "Süreç başlatılamadı.");
    } finally { setBusy(false); }
  };

  // initialStore varsa step 1 atlanır — sadece 2 adım gösterilir
  const totalSteps = initialStore ? 2 : 3;
  const displayStep = initialStore ? step - 1 : step;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Tadilat Başlat</h3>
            <p className="text-[11px] text-slate-400">Adım {displayStep} / {totalSteps}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>

        {/* Seçili mağaza özeti — sadece satırdan açıldığında gösterilir */}
        {initialStore && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-2">
            <Store className="h-4 w-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{initialStore.name}</p>
              <p className="text-[10px] font-mono text-slate-400">{initialStore.project_no ?? "—"}</p>
            </div>
          </div>
        )}

        <div className="flex px-6 pt-4 gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i < displayStep ? "bg-amber-500" : "bg-slate-100"}`} />
          ))}
        </div>

        <div className="px-6 py-5 space-y-3 min-h-[280px]">
          {step === 1 && !initialStore && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Mağaza Seçin</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Mağaza adı veya kodu..."
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none" />
              </div>
              {selProject && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selProject.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{selProject.project_no ?? "—"}</p>
                  </div>
                </div>
              )}
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-50 rounded-xl border border-slate-200">
                {filtered.slice(0, 30).map(p => (
                  <button key={p.id} type="button"
                    onClick={() => { setSelProject(p); setQuery(""); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors ${selProject?.id === p.id ? "bg-amber-50" : ""}`}>
                    <Store className="h-4 w-4 text-slate-300 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">{p.project_no ?? "—"}</p>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-4 py-6 text-xs text-center text-slate-400">Sonuç bulunamadı.</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Tadilat Kapsamı</p>
                <p className="text-xs text-slate-500 mt-0.5">Her seçim için ayrı süreç kartı oluşturulur.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SCOPE_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const sel = scopeCodes.includes(opt.value);
                  return (
                    <button key={opt.value} type="button" onClick={() => toggleScope(opt.value)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${sel ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <Icon className={`h-4 w-4 shrink-0 ${sel ? "text-amber-600" : "text-slate-400"}`} />
                      <span className={`text-xs font-medium ${sel ? "text-amber-700" : "text-slate-700"}`}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {scopeCodes.length > 0 && (
                <p className="text-[11px] text-amber-600 font-medium">
                  {scopeCodes.length} kapsam seçildi → {scopeCodes.length} süreç kartı oluşturulacak
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Süreç Bilgileri</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Süreç Adı (opsiyonel)</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder={scopeCodes[0] ? getScopeLabel(scopeCodes[0]) : "Tadilat Süreci"}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Başlangıç Tarihi</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hedef Bitiş</label>
                  <input type="date" value={form.target_end_date}
                    onChange={e => setForm(p => ({ ...p, target_end_date: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sorumlu Kişi</label>
                <input value={form.responsible_name} onChange={e => setForm(p => ({ ...p, responsible_name: e.target.value }))}
                  placeholder="Atanmadı"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Tadilat kapsamı veya notlar..." rows={2}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none" />
              </div>
            </div>
          )}

          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
        </div>

        <div className="flex justify-between border-t border-slate-100 px-6 py-4">
          <button type="button"
            onClick={() => {
              // initialStore varsa step 2 minimum adım — geri basınca modal kapanır
              if (step === 1 || (initialStore && step === 2)) { onClose(); return; }
              setStep(s => (s - 1) as 1 | 2 | 3);
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {(step === 1 || (initialStore && step === 2)) ? "Vazgeç" : "Geri"}
          </button>
          {step < 3 ? (
            <button type="button"
              onClick={() => {
                if (step === 1 && !selProject) { setErr("Lütfen bir mağaza seçin."); return; }
                if (step === 2 && scopeCodes.length === 0) { setErr("En az bir kapsam seçin."); return; }
                setErr(""); setStep(s => (s + 1) as 1 | 2 | 3);
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              İleri →
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Tadilat Başlat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function calcCountdown(days?: number): { text: string; color: string } {
  if (days == null) return { text: "—",              color: "text-slate-400"  };
  if (days > 0)     return { text: `${days}g kaldı`, color: "text-blue-600"   };
  if (days === 0)   return { text: "Bugün teslim",   color: "text-amber-600"  };
  return               { text: `${Math.abs(days)}g gecikti`, color: "text-red-600" };
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────

export default function TadilatPage() {
  const [jobs,           setJobs]           = useState<ActiveJob[]>([]);
  const [allProjects,    setAllProjects]    = useState<Project[]>([]);
  const [tadilatStores,  setTadilatStores]  = useState<Project[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [query,          setQuery]          = useState("");
  const [activeTab,      setActiveTab]      = useState<"aktif" | "magazalar">("aktif");
  const [startingStore,  setStartingStore]  = useState<Project | null | undefined>(undefined);
  const [showAssign,     setShowAssign]     = useState(false);
  const [removing,       setRemoving]       = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [j, p, ts] = await Promise.all([
      apiGet<ActiveJob[]>("/process/active-jobs").catch(() => [] as ActiveJob[]),
      apiGet<Project[]>("/projects?limit=5000").catch(() => [] as Project[]),
      apiGet<Project[]>("/renovation/stores").catch(() => [] as Project[]),
    ]);
    const all = (Array.isArray(j) ? j : []).filter(jb => jb.work_type === "tadilat");
    const seen = new Set<string>();
    setJobs(all.filter(jb => { if (seen.has(jb.process_id)) return false; seen.add(jb.process_id); return true; }));
    setAllProjects(Array.isArray(p) ? p : []);
    setTadilatStores(Array.isArray(ts) ? ts : []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const filteredJobs = useMemo(() =>
    jobs.filter(j => !query || j.project_name.toLowerCase().includes(query.toLowerCase())),
    [jobs, query]
  );

  const filteredStores = useMemo(() => {
    if (!query.trim()) return tadilatStores;
    const q = query.toLowerCase();
    return tadilatStores.filter(p => p.name.toLowerCase().includes(q) || (p.project_no ?? "").toLowerCase().includes(q));
  }, [tadilatStores, query]);

  const assignedIds = useMemo(() => new Set(tadilatStores.map(p => p.id)), [tadilatStores]);

  // Hangi tadilat mağazalarının aktif job'ı var
  const activeProjectIds = useMemo(() => new Set(jobs.map(j => j.project_id)), [jobs]);

  const handleRemove = async (p: Project) => {
    if (!confirm(`"${p.name}" tadilat takip listesinden çıkarılacak. Mağaza arşivinden silinmez ve geçmiş kayıtlar korunur. Devam etmek istiyor musunuz?`)) return;
    setRemoving(p.id);
    try {
      await apiPatch(`/renovation/stores/${p.id}/remove`, {});
      await loadAll();
    } catch {
      alert("İşlem başarısız. Lütfen tekrar deneyin.");
    } finally { setRemoving(null); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
            <HardHat className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Tadilat</h1>
            <p className="text-xs text-slate-500">Tadilat mağazaları ve aktif süreçler</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAssign(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Tadilat Mağazası Ekle
          </button>
          <button onClick={() => setStartingStore(null)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Tadilat Başlat
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tadilat Mağazası", value: tadilatStores.length,                                color: "text-amber-600" },
          { label: "Aktif Süreç",      value: jobs.length,                                          color: "text-blue-600"  },
          { label: "Süre Aşımı",       value: jobs.filter(j => (j.days_remaining ?? 0) < 0).length, color: "text-red-600"   },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-0.5 border border-slate-200 rounded-xl p-1 bg-slate-50">
          <button onClick={() => setActiveTab("aktif")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === "aktif" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            Aktif Süreçler ({jobs.length})
          </button>
          <button onClick={() => setActiveTab("magazalar")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === "magazalar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            Tadilat Mağazaları ({tadilatStores.length})
          </button>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Mağaza ara..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        </div>
      ) : activeTab === "aktif" ? (
        /* ── Aktif Süreçler ── */
        filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <HardHat className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">
              {jobs.length === 0 ? "Henüz aktif tadilat süreci yok." : "Arama sonucu bulunamadı."}
            </p>
            {jobs.length === 0 && (
              <button onClick={() => setStartingStore(null)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700">
                <Plus className="h-3.5 w-3.5" /> Tadilat Başlat
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredJobs.map((j) => {
              const cd = calcCountdown(j.days_remaining);
              const isOverdue = (j.days_remaining ?? 0) < 0;
              return (
                <Link key={j.process_id}
                  href={`/tadilat/surecleri/${j.process_id}?p=${j.project_id}`}
                  className={`flex items-center gap-4 rounded-2xl border p-4 hover:shadow-sm transition-all ${
                    isOverdue ? "border-red-100 bg-red-50/30" : "border-slate-200 bg-white"
                  }`}>
                  <div className={`h-2 w-2 shrink-0 rounded-full ${isOverdue ? "bg-red-400" : "bg-amber-400"}`} />
                  <Store className="h-4 w-4 text-slate-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{j.project_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-mono text-slate-400">{j.project_no ?? "—"}</span>
                      <span className="text-[10px] text-slate-500">{j.process_title}</span>
                      {j.current_stage && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 font-medium">{j.current_stage}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xs font-semibold ${cd.color}`}>{cd.text}</p>
                    {j.target_end_date && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(j.target_end_date).toLocaleDateString("tr-TR")}
                      </p>
                    )}
                  </div>
                  <FolderOpen className="h-4 w-4 text-slate-300 shrink-0" />
                </Link>
              );
            })}
          </div>
        )
      ) : (
        /* ── Tadilat Mağazaları ── */
        filteredStores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-slate-200">
            <HardHat className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">
              {tadilatStores.length === 0 ? "Henüz tadilat kapsamına alınan mağaza yok." : "Arama sonucu bulunamadı."}
            </p>
            {tadilatStores.length === 0 && (
              <button onClick={() => setShowAssign(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700">
                <Plus className="h-3.5 w-3.5" /> Tadilat Mağazası Ekle
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Mağaza</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Kod</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Durum</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredStores.map(p => {
                  const hasActive = activeProjectIds.has(p.id);
                  const activeJob = jobs.find(j => j.project_id === p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-slate-300 shrink-0" />
                          <p className="text-sm font-medium text-slate-900">{p.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-400 hidden sm:table-cell">{p.project_no ?? "—"}</td>
                      <td className="px-4 py-3">
                        {hasActive ? (
                          <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            Aktif Süreç
                          </span>
                        ) : (
                          <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                            Süreç Yok
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {hasActive && activeJob ? (
                            <Link href={`/tadilat/surecleri/${activeJob.process_id}?p=${p.id}`}
                              className="inline-flex items-center gap-1 text-xs text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1 hover:bg-amber-50 font-medium">
                              <FolderOpen className="h-3.5 w-3.5" /> Tadilat Klasörü
                            </Link>
                          ) : (
                            <button onClick={() => setStartingStore(p)}
                              className="inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50">
                              <Plus className="h-3.5 w-3.5" /> Tadilat Başlat
                            </button>
                          )}
                          <button onClick={() => handleRemove(p)} disabled={removing === p.id}
                            title="Tadilat kapsamından çıkar"
                            className="inline-flex items-center gap-1 text-xs text-red-500 border border-red-100 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-40">
                            {removing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            <span className="hidden lg:inline">Kapsamdan Çıkar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {showAssign && (
        <StoreAssignModal
          allStores={allProjects}
          assignedIds={assignedIds}
          onClose={() => setShowAssign(false)}
          onDone={() => { setShowAssign(false); loadAll(); }}
        />
      )}

      {startingStore !== undefined && (
        <TadilatBaslatModal
          projects={allProjects}
          initialStore={startingStore}
          onClose={() => setStartingStore(undefined)}
          onDone={() => { setStartingStore(undefined); loadAll(); }}
        />
      )}
    </div>
  );
}
