"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Building2, CheckCircle2, ChevronRight,
  FolderOpen, Loader2, MoreVertical, Plus, Search, Store, X,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type Project = {
  id: string; name: string; project_no?: string; status: string;
  description?: string;
};

type StoreProcess = {
  id: string; project_id: string; work_type: string; title: string;
  description?: string; status: string; progress_percent: number;
  responsible_name?: string; start_date?: string; target_end_date?: string;
  stages: { id: string; name: string; status: string; order_index: number }[];
};

type ActiveJob = {
  project_id: string; project_name: string; project_no?: string;
  work_type: string; process_title: string; current_stage?: string;
  target_end_date?: string; days_remaining?: number; process_id: string;
};

const SCOPE_TYPES = [
  { value: "yangin_dolabi",   label: "Yangın Dolabı"        },
  { value: "sprinkler_hatti", label: "Sprinkler Hattı"      },
  { value: "havalandirma",    label: "Havalandırma Projesi" },
  { value: "kanal_imalati",   label: "Kanal İmalatı"        },
  { value: "klima_sogutma",   label: "Klima / Soğutma"      },
  { value: "mekanik_tesisat", label: "Mekanik Tesisat"      },
  { value: "diger",           label: "Diğer"                },
];

function parseDesc(desc?: string): Record<string, string> {
  if (!desc) return {};
  try { return JSON.parse(desc); } catch { return {}; }
}

function parseStoreType(desc?: string) {
  return parseDesc(desc).store_type ?? "";
}

function fmtCountdown(days?: number) {
  if (days == null) return { text: "—",                         color: "text-slate-400" };
  if (days > 0)     return { text: `${days}g kaldı`,            color: "text-blue-600"  };
  if (days === 0)   return { text: "Bugün teslim",              color: "text-amber-600" };
  return               { text: `${Math.abs(days)}g gecikti`, color: "text-red-600"   };
}

function apiErrMsg(ex: unknown): string {
  const e = ex as { response?: { data?: { detail?: unknown }; status?: number } };
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d: unknown) => (d as { msg?: string }).msg ?? String(d)).join("; ");
  const status = e?.response?.status;
  if (status === 422) return "Gönderilen veriler geçersiz.";
  return "Sunucu tarafında hata oluştu.";
}

// ── Action Menu ────────────────────────────────────────────────────────────────

function ActionMenu({ projectId, process, onRefresh }: {
  projectId: string; process: StoreProcess; onRefresh: () => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doCancel = async () => {
    setBusy(true);
    try { await apiPatch(`/process/projects/${projectId}/process/${process.id}/cancel`, {}); onRefresh(); }
    catch { /* ignore */ }
    setBusy(false); setConfirm(null);
  };

  const doDelete = async () => {
    setBusy(true);
    try { await apiDelete(`/process/projects/${projectId}/process/${process.id}`); onRefresh(); }
    catch { /* ignore */ }
    setBusy(false); setConfirm(null);
  };

  if (confirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm font-semibold text-slate-900">
              {confirm === "delete" ? "Süreci Sil" : "Süreci İptal Et"}
            </p>
          </div>
          <p className="text-xs text-slate-600">
            {confirm === "delete"
              ? "Bu yeni yapım süreci silinecek. Mağaza kartı silinmez, sadece bu süreç kaldırılır."
              : "Bu süreç iptal edilecek. Kayıt sistemde kalır, aktif listelerden çıkar."}
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirm(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Vazgeç
            </button>
            <button onClick={confirm === "delete" ? doDelete : doCancel} disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${
                confirm === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
              }`}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirm === "delete" ? "Evet, Sil" : "Evet, İptal Et"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(p => !p)}
        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
        <MoreVertical className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-48 rounded-xl border border-slate-200 bg-white shadow-lg py-1 text-xs">
          <Link
            href={`/yeni-yapim/surecleri/${process.id}?p=${projectId}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700">
            <FolderOpen className="h-3.5 w-3.5" /> Yeni Yapım Klasörü
          </Link>
          <Link href={`/projects/${projectId}`}
            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-500">
            <Store className="h-3.5 w-3.5" /> Mağaza Kartı (görüntüle)
          </Link>
          <div className="my-1 border-t border-slate-100" />
          {process.status !== "cancelled" && (
            <button onClick={() => { setOpen(false); setConfirm("cancel"); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-amber-50 text-amber-700">
              İptal Et
            </button>
          )}
          <button onClick={() => { setOpen(false); setConfirm("delete"); }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600">
            Sil
          </button>
        </div>
      )}
    </div>
  );
}

// ── Wizard ─────────────────────────────────────────────────────────────────────

type WizardMode = "new_store" | "existing_store";

function Wizard({ onClose, onDone, existingProjects }: {
  onClose: () => void; onDone: () => void; existingProjects: Project[];
}) {
  const [mode,    setMode]    = useState<WizardMode | null>(null);
  const [step,    setStep]    = useState(1);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");

  const [ns, setNs] = useState({
    name: "", project_no: "", bolge: "", sehir: "",
    start_date: new Date().toISOString().split("T")[0],
  });

  const [searchQ,    setSearchQ]    = useState("");
  const [selProject, setSelProject] = useState<Project | null>(null);
  const [scopes,     setScopes]     = useState<string[]>([]);
  const [procTitle,  setProcTitle]  = useState("");
  const [procStart,  setProcStart]  = useState(new Date().toISOString().split("T")[0]);
  const [procEnd,    setProcEnd]    = useState("");
  const [procResp,   setProcResp]   = useState("");
  const [dupProcess, setDupProcess] = useState<StoreProcess | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const checkDuplicate = async (projectId: string): Promise<StoreProcess | null> => {
    try {
      const procs = await apiGet<StoreProcess[]>(`/process/projects/${projectId}/process`);
      return (procs ?? []).find(p => p.work_type === "yeni_yapim" && p.status === "in_progress") ?? null;
    } catch { return null; }
  };

  const handleCreateStore = async () => {
    if (!ns.name.trim())       { setErr("Mağaza adı zorunludur."); return; }
    if (!ns.project_no.trim()) { setErr("Mağaza kodu zorunludur."); return; }
    setBusy(true); setErr("");
    try {
      const desc = JSON.stringify({ store_type: "new_build", bolge: ns.bolge, sehir: ns.sehir });
      const created = await apiPost<{ id: string }>("/projects", {
        name: ns.name.trim(), project_no: ns.project_no.trim(),
        description: desc, status: "inquiry",
        scope_codes: ["yeni_yapim"],
        start_date: ns.start_date ? `${ns.start_date}T00:00:00` : null,
        contract_value: null,
      });
      setCreatedProjectId(created.id);
      setProcTitle(`Yeni Yapım — ${ns.name.trim()}`);
      setStep(2);
    } catch (ex) { setErr(apiErrMsg(ex)); }
    finally { setBusy(false); }
  };

  const handleSelectExisting = async () => {
    if (!selProject) { setErr("Bir mağaza seçin."); return; }
    setBusy(true); setErr("");
    const existing = await checkDuplicate(selProject.id);
    setBusy(false);
    if (existing) { setDupProcess(existing); return; }
    setCreatedProjectId(selProject.id);
    setProcTitle(`Yeni Yapım — ${selProject.name}`);
    setErr("");
    setStep(2);
  };

  const handleCreateProcess = async () => {
    if (!createdProjectId)    { setErr("Mağaza ID bulunamadı."); return; }
    if (!procTitle.trim())    { setErr("Süreç adı zorunludur."); return; }
    if (scopes.length === 0)  { setErr("En az bir iş kalemi seçmelisiniz."); return; }
    setBusy(true); setErr("");
    try {
      await apiPost(`/process/projects/${createdProjectId}/process/bulk`, {
        work_type: "yeni_yapim",
        title: procTitle.trim(),
        scope_codes: scopes,
        start_date: procStart ? `${procStart}T00:00:00` : null,
        target_end_date: procEnd ? `${procEnd}T00:00:00` : null,
        responsible_name: procResp.trim() || null,
      });
      onDone();
    } catch (ex) { setErr(apiErrMsg(ex)); }
    finally { setBusy(false); }
  };

  const filteredExisting = existingProjects.filter(p =>
    !searchQ ||
    p.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    (p.project_no ?? "").includes(searchQ)
  );

  if (dupProcess && selProject) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm font-bold text-slate-900">Aktif Süreç Mevcut</p>
          </div>
          <p className="text-xs text-slate-600">
            <strong>{selProject.name}</strong> mağazası için aktif bir yeni yapım süreci zaten var.
            Yeni süreç açmak yerine mevcut sürece devam edebilirsiniz.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href={`/yeni-yapim/surecleri/${dupProcess.id}?p=${selProject.id}`}
              onClick={onClose}
              className="w-full text-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              Yeni Yapım Klasörünü Aç
            </Link>
            <button onClick={() => {
              setDupProcess(null);
              setCreatedProjectId(selProject.id);
              setProcTitle(`Yeni Yapım — ${selProject.name}`);
              setStep(2);
            }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Yine de Yeni Süreç Oluştur
            </button>
            <button onClick={() => setDupProcess(null)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-1">
              Vazgeç
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {mode === null ? "Yeni Yapım Başlat" : mode === "new_store" ? "Yeni Mağaza Oluştur" : "Mevcut Mağaza Seç"}
            </h3>
            {mode !== null && <p className="text-[11px] text-slate-400 mt-0.5">Adım {step} / 3</p>}
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>

        {mode !== null && (
          <div className="flex gap-1.5 px-5 pt-4">
            {[1, 2, 3].map(i => (
              <div key={i} className={`flex-1 h-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-emerald-500" : "bg-slate-100"}`} />
            ))}
          </div>
        )}

        <div className="px-5 py-5 min-h-[280px] max-h-[65vh] overflow-y-auto">
          {mode === null && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 mb-4">Yeni yapım süreci başlatmak için bir seçenek seçin.</p>
              <button onClick={() => { setMode("new_store"); setStep(1); setErr(""); }}
                className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 group-hover:bg-emerald-200">
                  <Plus className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Yeni Mağaza Oluştur</p>
                  <p className="text-xs text-slate-500 mt-0.5">Yeni açılacak mağaza için arşiv kaydı oluştur ve süreç başlat.</p>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-emerald-500 shrink-0" />
              </button>
              <button onClick={() => { setMode("existing_store"); setStep(1); setErr(""); }}
                className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 group-hover:bg-blue-200">
                  <Store className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Mevcut Mağazadan Devam Et</p>
                  <p className="text-xs text-slate-500 mt-0.5">Kayıtlı mağaza için yeni yapım süreci başlat.</p>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-blue-500 shrink-0" />
              </button>
            </div>
          )}

          {mode === "new_store" && step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Adı *</label>
                <input value={ns.name} onChange={e => setNs(p => ({ ...p, name: e.target.value }))}
                  placeholder="Örn: Migros Ataşehir MMM" autoFocus
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Kodu *</label>
                <input value={ns.project_no} onChange={e => setNs(p => ({ ...p, project_no: e.target.value }))}
                  placeholder="Örn: 3421"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Bölge</label>
                  <select value={ns.bolge} onChange={e => setNs(p => ({ ...p, bolge: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
                    <option value="">Seçin...</option>
                    {["Marmara","Ege","İç Anadolu","Akdeniz","Karadeniz","Doğu Anadolu","Güneydoğu Anadolu"].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Şehir</label>
                  <select value={ns.sehir} onChange={e => setNs(p => ({ ...p, sehir: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
                    <option value="">Seçin...</option>
                    {["İstanbul","Ankara","İzmir","Kocaeli","Konya","Antalya","Bursa","Adana","Mersin","Sivas","Diyarbakır"].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Başlangıç Tarihi</label>
                <input type="date" value={ns.start_date} onChange={e => setNs(p => ({ ...p, start_date: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>
            </div>
          )}

          {mode === "existing_store" && step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Yeni yapım süreci başlatacağınız mağazayı seçin.</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  placeholder="Mağaza ara..." autoFocus
                  className="w-full rounded-xl border pl-9 pr-4 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filteredExisting.slice(0, 40).map(p => (
                  <button key={p.id} type="button" onClick={() => setSelProject(p)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selProject?.id === p.id ? "border-emerald-500 bg-emerald-50" : "border-slate-100 hover:border-slate-200"
                    }`}>
                    <Store className="h-4 w-4 text-slate-300 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{p.project_no ?? "—"}</p>
                    </div>
                    {selProject?.id === p.id && <ChevronRight className="ml-auto h-4 w-4 text-emerald-600 shrink-0" />}
                  </button>
                ))}
                {filteredExisting.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-6">Mağaza bulunamadı.</p>
                )}
              </div>
            </div>
          )}

          {mode !== null && step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Yapılacak İşler</p>
              <p className="text-[11px] text-slate-400">
                Her seçilen iş için ayrı süreç kartı ve 7 aşamalı süreç oluşturulur.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SCOPE_TYPES.map(s => {
                  const sel = scopes.includes(s.value);
                  return (
                    <button key={s.value} type="button"
                      onClick={() => setScopes(prev => sel ? prev.filter(v => v !== s.value) : [...prev, s.value])}
                      className={`text-left rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                        sel ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700 hover:border-slate-300"
                      }`}>
                      {sel && "✓ "}{s.label}
                    </button>
                  );
                })}
              </div>
              {scopes.length > 0 && (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
                  {scopes.length} iş kalemi seçildi → {scopes.length} ayrı Yeni Yapım Klasörü oluşturulacak.
                </p>
              )}
            </div>
          )}

          {mode !== null && step === 3 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Süreç Bilgileri</p>
              {scopes.length > 0 && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-[11px] text-emerald-700 space-y-0.5">
                  <p className="font-semibold">Oluşturulacak klasörler:</p>
                  {scopes.map(s => (
                    <p key={s}>• {SCOPE_TYPES.find(t => t.value === s)?.label}</p>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Süreç Adı *</label>
                <input value={procTitle} onChange={e => setProcTitle(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Başlangıç</label>
                  <input type="date" value={procStart} onChange={e => setProcStart(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hedef Bitiş</label>
                  <input type="date" value={procEnd} onChange={e => setProcEnd(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sorumlu</label>
                <input value={procResp} onChange={e => setProcResp(e.target.value)}
                  placeholder="Sorumlu kişi adı"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>
            </div>
          )}

          {err && <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{err}</p>}
        </div>

        <div className="flex justify-between border-t border-slate-100 px-5 py-4">
          <button onClick={() => {
            setErr("");
            if (step > 1) setStep(s => s - 1);
            else if (mode !== null) setMode(null);
            else onClose();
          }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {step > 1 ? "← Geri" : mode !== null ? "← Geri" : "Vazgeç"}
          </button>

          {mode === null ? null : step === 1 ? (
            <button onClick={() => {
              setErr("");
              if (mode === "new_store") handleCreateStore();
              else handleSelectExisting();
            }} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "new_store" ? "Mağazayı Oluştur →" : "Seç ve Devam Et →"}
            </button>
          ) : step === 2 ? (
            <button onClick={() => {
              if (scopes.length === 0) { setErr("En az bir iş kalemi seçmelisiniz."); return; }
              setErr(""); setStep(3);
            }}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              İleri →
            </button>
          ) : (
            <button onClick={handleCreateProcess} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Süreci Başlat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Store Group Row ────────────────────────────────────────────────────────────

type StoreGroup = { project: Project; processes: StoreProcess[] };

function StoreGroupRow({ entry, onRefresh }: { entry: StoreGroup; onRefresh: () => void }) {
  const { project, processes } = entry;
  const [expanded, setExpanded] = useState(false);

  const activeProcs    = processes.filter(p => p.status === "in_progress" || p.status === "pending");
  const cancelledProcs = processes.filter(p => p.status === "cancelled");
  const completedCount = processes.filter(p => p.status === "completed").length;
  const totalActive    = activeProcs.length + completedCount;

  const scopeLabel = (proc: StoreProcess) => {
    const d = parseDesc(proc.description);
    if (d.scope) return SCOPE_TYPES.find(s => s.value === d.scope)?.label ?? d.scope;
    if (proc.title) {
      for (const s of SCOPE_TYPES) {
        if (proc.title.toLowerCase().includes(s.label.toLowerCase())) return s.label;
      }
    }
    return proc.title;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 bg-slate-50">
        <Store className="h-4 w-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{project.name}</p>
          <p className="text-[10px] font-mono text-slate-400">
            {project.project_no ?? "—"}
            {totalActive > 0 && <span className="ml-2 text-emerald-600">{completedCount}/{totalActive} tamamlandı</span>}
          </p>
        </div>
        <Link href={`/projects/${project.id}`}
          className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-3 py-1 hover:border-slate-300 transition-colors">
          Mağaza Kartı
        </Link>
      </div>

      <div className="divide-y divide-slate-50">
        {activeProcs.map(proc => {
          const current = proc.stages.find(s => s.status === "in_progress") ?? proc.stages[0];
          return (
            <div key={proc.id} className="flex items-center gap-4 px-5 py-3 hover:bg-emerald-50/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-slate-800">{scopeLabel(proc)}</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    Devam Ediyor
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {current && <span className="text-[10px] text-slate-400">Aşama: {current.name}</span>}
                  {proc.responsible_name && <span className="text-[10px] text-slate-400">• {proc.responsible_name}</span>}
                  <span className="text-[10px] text-emerald-600 font-medium">{proc.progress_percent}%</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/yeni-yapim/surecleri/${proc.id}?p=${project.id}`}
                  className="text-xs text-emerald-600 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50 font-medium">
                  Yeni Yapım Klasörü
                </Link>
                <ActionMenu projectId={project.id} process={proc} onRefresh={onRefresh} />
              </div>
            </div>
          );
        })}

        {processes.length === 0 && (
          <div className="px-5 py-4 text-xs text-slate-400 italic">Henüz süreç başlatılmamış.</div>
        )}

        {cancelledProcs.length > 0 && (
          <div>
            <button onClick={() => setExpanded(p => !p)}
              className="w-full px-5 py-2 text-left text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
              {expanded ? "▲" : "▼"} {cancelledProcs.length} iptal edilmiş süreç
            </button>
            {expanded && cancelledProcs.map(proc => (
              <div key={proc.id} className="flex items-center gap-4 px-5 py-2.5 bg-slate-50 opacity-60">
                <p className="flex-1 text-xs text-slate-500 line-through">{scopeLabel(proc)}</p>
                <span className="text-[10px] text-slate-400">İptal Edildi</span>
                <ActionMenu projectId={project.id} process={proc} onRefresh={onRefresh} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ana Sayfa ──────────────────────────────────────────────────────────────────

export default function YeniYapimPage() {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [grouped,    setGrouped]    = useState<StoreGroup[]>([]);
  const [projects,   setProjects]   = useState<Project[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [wizard,     setWizard]     = useState(false);
  const [search,     setSearch]     = useState("");
  const [activeTab,  setActiveTab]  = useState<"isler" | "magazalar">("isler");

  const load = async () => {
    setLoading(true);
    const [j, p] = await Promise.all([
      apiGet<ActiveJob[]>("/process/active-jobs").catch(() => [] as ActiveJob[]),
      apiGet<Project[]>("/projects?limit=5000").catch(() => [] as Project[]),
    ]);

    const jobs = (Array.isArray(j) ? j : []).filter(jb => jb.work_type === "yeni_yapim");
    const allProjects = Array.isArray(p) ? p : [];

    setActiveJobs(jobs);
    setProjects(allProjects);

    const newBuildIds = new Set(jobs.map(jb => jb.project_id));
    const newBuildProjects = allProjects.filter(pr =>
      parseStoreType(pr.description) === "new_build" || newBuildIds.has(pr.id)
    );

    const entries: StoreGroup[] = await Promise.all(
      newBuildProjects.map(async pr => {
        try {
          const procs = await apiGet<StoreProcess[]>(`/process/projects/${pr.id}/process`);
          const filtered = (procs ?? []).filter(proc =>
            proc.work_type === "yeni_yapim" && proc.status !== "deleted"
          );
          return { project: pr, processes: filtered };
        } catch {
          return { project: pr, processes: [] };
        }
      })
    );

    setGrouped(entries);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredJobs = useMemo(() => {
    if (!search) return activeJobs;
    const q = search.toLowerCase();
    return activeJobs.filter(j =>
      j.project_name.toLowerCase().includes(q) ||
      (j.project_no ?? "").toLowerCase().includes(q) ||
      j.process_title.toLowerCase().includes(q)
    );
  }, [activeJobs, search]);

  const filteredGrouped = useMemo(() => {
    if (!search) return grouped;
    const q = search.toLowerCase();
    return grouped.filter(e =>
      e.project.name.toLowerCase().includes(q) ||
      (e.project.project_no ?? "").toLowerCase().includes(q)
    );
  }, [grouped, search]);

  const overdueCount   = activeJobs.filter(j => (j.days_remaining ?? 0) < 0).length;
  const storeCount     = grouped.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
            <Building2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Yeni Yapım</h1>
            <p className="text-xs text-slate-500">Yeni açılacak mağazalar için proje, süreç ve onay takibi.</p>
          </div>
        </div>
        <button onClick={() => setWizard(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
          <Plus className="h-4 w-4" /> Yeni Yapım Başlat
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Aktif Mağaza",  value: storeCount,      color: "text-emerald-600" },
          { label: "Aktif İş Kalemi", value: activeJobs.length, color: "text-blue-600"   },
          { label: "Süre Aşımı",   value: overdueCount,    color: "text-red-600"     },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-0.5 border border-slate-200 rounded-xl p-1 bg-slate-50">
          <button onClick={() => setActiveTab("isler")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === "isler" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}>
            Aktif İş Kalemleri ({activeJobs.length})
          </button>
          <button onClick={() => setActiveTab("magazalar")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === "magazalar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}>
            Mağaza Grupları ({storeCount})
          </button>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Mağaza ara..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>

      ) : activeTab === "isler" ? (
        /* ── Aktif İş Kalemleri (flat list) ── */
        filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border border-dashed border-slate-200 bg-white">
            <Building2 className="h-12 w-12 text-slate-200" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-600">
                {activeJobs.length === 0 ? "Henüz aktif yeni yapım iş kalemi yok." : "Arama sonucu bulunamadı."}
              </p>
              <p className="text-xs text-slate-400 mt-1">Yeni bir mağaza oluşturun veya mevcut mağaza için süreç başlatın.</p>
            </div>
            {activeJobs.length === 0 && (
              <button onClick={() => setWizard(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                <Plus className="h-4 w-4" /> Yeni Yapım Başlat
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredJobs.map(j => {
              const cd = fmtCountdown(j.days_remaining);
              const isOverdue = (j.days_remaining ?? 0) < 0;
              return (
                <Link key={j.process_id}
                  href={`/yeni-yapim/surecleri/${j.process_id}?p=${j.project_id}`}
                  className={`flex items-center gap-4 rounded-2xl border p-4 hover:shadow-sm transition-all ${
                    isOverdue ? "border-red-100 bg-red-50/30" : "border-slate-200 bg-white hover:border-emerald-200"
                  }`}>
                  <div className={`h-2 w-2 shrink-0 rounded-full ${isOverdue ? "bg-red-400" : "bg-emerald-400"}`} />
                  <Store className="h-4 w-4 text-slate-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{j.project_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-mono text-slate-400">{j.project_no ?? "—"}</span>
                      <span className="text-[10px] text-slate-500">{j.process_title}</span>
                      {j.current_stage && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5 font-medium">
                          {j.current_stage}
                        </span>
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
                  <FolderOpen className="h-4 w-4 text-emerald-400 shrink-0" />
                </Link>
              );
            })}
          </div>
        )

      ) : (
        /* ── Mağaza Grupları ── */
        filteredGrouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-slate-200">
            <Building2 className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">
              {grouped.length === 0 ? "Henüz yeni yapım mağazası yok." : "Arama sonucu bulunamadı."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGrouped.map(entry => (
              <StoreGroupRow key={entry.project.id} entry={entry} onRefresh={load} />
            ))}
          </div>
        )
      )}

      {wizard && (
        <Wizard
          onClose={() => setWizard(false)}
          onDone={() => { setWizard(false); load(); }}
          existingProjects={projects}
        />
      )}
    </div>
  );
}
