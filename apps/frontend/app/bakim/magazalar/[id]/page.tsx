"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Clock, Download, Eye,
  FileText, Loader2, Plus, Receipt, StickyNote,
  Trash2, Upload, Wrench, X,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, buildApiUrl } from "@/lib/api";
import { downloadFromUrl, openFileInNewTab } from "@/lib/download";

// ── Types ──────────────────────────────────────────────────────────────────────

type Project = {
  id: string; name: string; project_no?: string; description?: string;
};

type ServiceForm = {
  id: string; project_id: string; year: number; month: number;
  file_url?: string; file_name?: string; file_size_bytes?: number;
  contractor_company?: string; uploaded_by_name?: string;
  description?: string; status: string; created_at: string;
};

type ProgressPayment = {
  id: string; project_id: string; payment_type: string; period?: string;
  amount?: number; currency: string; file_url?: string; file_name?: string;
  approval_status: string; submitted_for_approval: boolean;
  submitted_by_name?: string; description?: string; created_at: string;
};

type InvoiceRecord = {
  id: string; project_id: string; invoice_type: string; period?: string;
  invoice_no?: string; amount?: number; currency: string;
  file_url?: string; file_name?: string; approval_status: string;
  submitted_by_name?: string; description?: string; created_at: string;
};

type StoreActivity = {
  id: string; activity_type: string; title: string;
  description?: string; user_name?: string; created_at: string;
};

type Note = { id: string; content: string; created_by_name?: string; created_at: string };

type TabKey = "servis" | "fatura" | "hakkediş" | "aktivite" | "notlar";

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTHS_TR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                   "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const NOW_YEAR  = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;

function periodStr(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTRY(amount?: number, currency = "TRY") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
}

function getRegion(project: Project): string {
  if (!project.description) return "";
  try {
    const d = JSON.parse(project.description) as Record<string, string>;
    return d.bolge ?? d.sehir ?? "";
  } catch { return ""; }
}

async function fetchDocUrl(docId: string, download: boolean): Promise<string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(buildApiUrl(`/documents/${docId}/download${download ? "?download=true" : ""}`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error();
  return (await res.json()).url;
}

async function openDoc(docId: string) {
  try {
    await openFileInNewTab(() => fetchDocUrl(docId, false));
  } catch {
    alert("Dosya açılamadı.");
  }
}

async function downloadDoc(docId: string, fileName?: string) {
  // download=true → OCI presigned URL zaten Content-Disposition: attachment
  // taşıyor. downloadFile önce blob-fetch dener, storage bucket CORS
  // vermiyorsa otomatik düz navigasyona düşer (indirme yine de tetiklenir).
  try {
    await downloadFromUrl(() => fetchDocUrl(docId, true), fileName ?? "dosya");
  } catch {
    alert("İndirilemiyor.");
  }
}

// ── Upload Modal ───────────────────────────────────────────────────────────────

type UploadConfig = {
  title: string;
  docType: string;
  extraFields?: React.ReactNode;
  onSubmit: (docId: string, fileName: string, fileSize: number) => Promise<void>;
};

function UploadModal({
  projectId, config, onClose, onDone,
}: { projectId: string; config: UploadConfig; onClose: () => void; onDone: () => void }) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [file,     setFile]     = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  const handleSubmit = async () => {
    if (!file) { setErr("Lütfen bir dosya seçin."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("project_id", projectId);
      fd.append("doc_type", config.docType);
      fd.append("file", file);
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(buildApiUrl("/documents/upload"), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.detail ?? "Dosya yüklenemedi."); }
      const doc = await res.json();
      await config.onSubmit(doc.id, doc.original_name ?? file.name, file.size);
      onDone(); onClose();
    } catch (ex: any) {
      setErr(ex?.message ?? "Yükleme başarısız.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">{config.title}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          {config.extraFields}
          {/* Dosya Seç */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 cursor-pointer transition-colors ${
              dragging ? "border-sky-400 bg-sky-50" : file ? "border-green-400 bg-green-50" : "border-slate-200 hover:border-slate-300"
            }`}>
            <Upload className={`h-6 w-6 ${file ? "text-green-500" : "text-slate-300"}`} />
            {file
              ? <p className="text-xs font-medium text-green-700">{file.name}</p>
              : <><p className="text-xs text-slate-500">Dosyayı buraya sürükle veya tıkla</p><p className="text-[10px] text-slate-400">PDF, JPG, PNG, XLSX, ZIP</p></>
            }
            <input ref={fileRef} type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.zip"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Vazgeç</button>
          <button onClick={handleSubmit} disabled={busy || !file}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Yükle
          </button>
        </div>
      </div>
    </div>
  );
}

// ── File Row Component ─────────────────────────────────────────────────────────

function FileRow({
  label, period, fileUrl, fileName, uploadedBy, uploadedAt,
  status, amount, currency, onDelete, onReplace,
}: {
  label: string; period?: string; fileUrl?: string; fileName?: string;
  uploadedBy?: string; uploadedAt?: string; status?: string;
  amount?: number; currency?: string; onDelete?: () => void; onReplace?: () => void;
}) {
  const hasFile = !!fileUrl;
  return (
    <div className={`rounded-xl border p-4 ${hasFile ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${hasFile ? "bg-sky-50" : "bg-slate-100"}`}>
          <FileText className={`h-4 w-4 ${hasFile ? "text-sky-600" : "text-slate-300"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            {period && <span className="text-[10px] font-mono text-slate-400">{period}</span>}
            {hasFile ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-3 w-3" /> Yüklendi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                <Clock className="h-3 w-3" /> Bekleniyor
              </span>
            )}
            {status && status !== "draft" && (() => {
              const HAKEDIS_STATUS: Record<string, { label: string; cls: string }> = {
                internal_pending:   { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"    },
                bekliyor:           { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"    },
                pending:            { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"    },
                internal_approved:  { label: "İç Onay Alındı",           cls: "bg-blue-50 text-blue-700"      },
                migros_pending:     { label: "Migros Onayı Bekleniyor",   cls: "bg-indigo-50 text-indigo-700"  },
                invoice_stage:      { label: "Faturalandırma Aşamasında", cls: "bg-emerald-50 text-emerald-700"},
                invoiced:           { label: "Faturalandırıldı",          cls: "bg-green-100 text-green-800"   },
                revision_requested: { label: "Revizyon İstendi",          cls: "bg-purple-50 text-purple-700"  },
                rejected:           { label: "Reddedildi",                cls: "bg-red-50 text-red-600"        },
                onaylandi:          { label: "Onaylandı",                 cls: "bg-green-100 text-green-800"   },
                reddedildi:         { label: "Reddedildi",                cls: "bg-red-50 text-red-600"        },
                revizyon:           { label: "Revizyon İstendi",          cls: "bg-purple-50 text-purple-700"  },
              };
              const cfg = HAKEDIS_STATUS[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
              return (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                  {cfg.label}
                </span>
              );
            })()}
          </div>
          {fileName && <p className="text-xs text-slate-500 truncate mt-0.5">{fileName}</p>}
          {amount != null && <p className="text-xs font-semibold text-slate-700 mt-0.5">{fmtTRY(amount, currency)}</p>}
          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 flex-wrap">
            {uploadedBy && <span>Yükleyen: {uploadedBy}</span>}
            {uploadedAt && <span>{fmtDate(uploadedAt)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {hasFile && (
            <>
              <button onClick={() => openDoc(fileUrl!)}
                className="inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50">
                <Eye className="h-3.5 w-3.5" /> Aç
              </button>
              <button onClick={() => downloadDoc(fileUrl!, fileName)}
                className="inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50">
                <Download className="h-3.5 w-3.5" /> İndir
              </button>
              {onReplace && (
                <button onClick={onReplace}
                  className="inline-flex items-center gap-1 text-xs text-sky-600 border border-sky-200 rounded-lg px-2 py-1 hover:bg-sky-50">
                  <Upload className="h-3.5 w-3.5" /> Yeniden Yükle
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete}
                  className="inline-flex items-center gap-1 text-xs text-red-500 border border-red-100 rounded-lg px-2 py-1 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" /> Sil
                </button>
              )}
            </>
          )}
          {!hasFile && onReplace && (
            <button onClick={onReplace}
              className="inline-flex items-center gap-1 text-xs text-sky-600 border border-sky-200 rounded-lg px-2.5 py-1.5 hover:bg-sky-50 font-medium">
              <Plus className="h-3.5 w-3.5" /> Yükle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BakimKlasoruPage() {
  const params    = useParams();
  const projectId = params.id as string;

  const [project,    setProject]    = useState<Project | null>(null);
  const [activeTab,  setActiveTab]  = useState<TabKey>("servis");
  const [year,       setYear]       = useState(NOW_YEAR);
  const [month,      setMonth]      = useState(NOW_MONTH);
  const [loadingMain, setLoadingMain] = useState(true);

  // Tab data
  const [forms,     setForms]     = useState<ServiceForm[]>([]);
  const [payments,  setPayments]  = useState<ProgressPayment[]>([]);
  const [invoices,  setInvoices]  = useState<InvoiceRecord[]>([]);
  const [activities, setActivities] = useState<StoreActivity[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // Upload modal
  const [uploadCfg, setUploadCfg] = useState<UploadConfig | null>(null);

  // Period
  const period = periodStr(year, month);
  const periodLabel = `${MONTHS_TR[month]} ${year}`;

  useEffect(() => {
    apiGet<Project>(`/projects/${projectId}`)
      .then(p => setProject(p))
      .catch(() => {})
      .finally(() => setLoadingMain(false));
  }, [projectId]);

  const loadTab = useCallback(async () => {
    setTabLoading(true);
    try {
      if (activeTab === "servis") {
        const d = await apiGet<ServiceForm[]>(`/service-forms/projects/${projectId}?year=${year}&month=${month}`).catch(() => []);
        setForms(Array.isArray(d) ? d : []);
      } else if (activeTab === "hakkediş") {
        const d = await apiGet<ProgressPayment[]>(`/progress-payments/projects/${projectId}`).catch(() => []);
        setPayments(Array.isArray(d) ? d : []);
      } else if (activeTab === "fatura") {
        const d = await apiGet<InvoiceRecord[]>(`/invoice-records/projects/${projectId}`).catch(() => []);
        setInvoices((Array.isArray(d) ? d : []).filter(i => i.invoice_type === "bakım_faturası"));
      } else if (activeTab === "aktivite") {
        const d = await apiGet<StoreActivity[]>(`/projects/${projectId}/activity`).catch(() => []);
        setActivities(Array.isArray(d) ? d : []);
      }
    } finally { setTabLoading(false); }
  }, [activeTab, projectId, year, month]);

  useEffect(() => { loadTab(); }, [loadTab]);

  if (loadingMain) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-sm text-slate-500">Mağaza bulunamadı.</p>
        <Link href="/bakim" className="text-xs text-sky-600 hover:underline">← Bakım Mağazaları</Link>
      </div>
    );
  }

  const region = getRegion(project);

  // ── Upload handlers ──────────────────────────────────────────────────────────

  const openServisUpload = () => setUploadCfg({
    title: `${periodLabel} Servis Formu Yükle`,
    docType: "field_report",
    onSubmit: async (docId, fileName, fileSize) => {
      await apiPost(`/service-forms/projects/${projectId}`, {
        year, month, file_url: docId, file_name: fileName, file_size_bytes: fileSize,
      });
      loadTab();
    },
  });

  const openFaturaUpload = (existingId?: string) => setUploadCfg({
    title: `${periodLabel} Bakım Faturası Yükle`,
    docType: "invoice_doc",
    onSubmit: async (docId, fileName) => {
      if (existingId) { await apiDelete(`/invoice-records/${existingId}`); }
      await apiPost(`/invoice-records/projects/${projectId}`, {
        invoice_type: "bakım_faturası", period, file_url: docId, file_name: fileName,
      });
      loadTab();
    },
  });

  const openHakkedisCUpload = (existingId?: string) => setUploadCfg({
    title: `${periodLabel} Bakım Hakkedişi Yükle`,
    docType: "invoice_doc",
    onSubmit: async (docId, fileName) => {
      if (existingId) { await apiDelete(`/progress-payments/${existingId}`); }
      await apiPost(`/progress-payments/projects/${projectId}`, {
        payment_type: "bakim", period, file_url: docId, file_name: fileName,
        submitted_for_approval: false,
      });
      loadTab();
    },
  });

  // Current period records
  const currentForms    = forms.filter(f => f.year === year && f.month === month);
  const currentPayments = payments.filter(p => p.period === period);
  const currentInvoices = invoices.filter(i => i.period === period);

  const TAB_DEFS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "servis",    label: "Servis Formları", icon: <FileText className="h-4 w-4" /> },
    { key: "fatura",    label: "Faturalar",        icon: <Receipt className="h-4 w-4" /> },
    { key: "hakkediş",  label: "Hakkedişler",      icon: <Receipt className="h-4 w-4" /> },
    { key: "aktivite",  label: "Son İşlemler",     icon: <Clock className="h-4 w-4" /> },
    { key: "notlar",    label: "Notlar",            icon: <StickyNote className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb + Header */}
      <div>
        <Link href="/bakim" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Bakım Mağazaları
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100">
            <Wrench className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Bakım Klasörü</h1>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{project.name}</span>
              {project.project_no && <span className="font-mono">{project.project_no}</span>}
              {region && <span>· {region}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Yıl / Ay Seçici */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3">
        <span className="text-xs font-semibold text-slate-500">Dönem:</span>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none">
          {[NOW_YEAR - 2, NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none">
          {MONTHS_TR.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <span className="text-sm font-semibold text-sky-700 ml-1">{periodLabel}</span>
        <Link href={`/projects/${projectId}`}
          className="ml-auto text-xs text-slate-400 hover:text-slate-700 hover:underline">
          Mağaza Kartına Git →
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TAB_DEFS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === t.key
                ? "border-sky-600 text-sky-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab İçeriği */}
      {tabLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Servis Formları ── */}
          {activeTab === "servis" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{periodLabel} Servis Formu</p>
                {currentForms.length === 0 && (
                  <button onClick={openServisUpload}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
                    <Plus className="h-3.5 w-3.5" /> Servis Formu Yükle
                  </button>
                )}
              </div>
              {currentForms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 flex flex-col items-center gap-3">
                  <FileText className="h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">{periodLabel} için henüz servis formu yüklenmemiş.</p>
                </div>
              ) : currentForms.map(f => (
                <FileRow key={f.id}
                  label={`${periodLabel} Servis Formu`}
                  fileUrl={f.file_url} fileName={f.file_name}
                  uploadedBy={f.uploaded_by_name} uploadedAt={f.created_at}
                  onDelete={async () => {
                    if (!confirm("Servis formu silinsin mi?")) return;
                    try { await apiDelete(`/service-forms/${f.id}`); loadTab(); }
                    catch { alert("Silme işlemi tamamlanamadı. Sunucu bağlantısı kontrol edilmeli."); }
                  }}
                  onReplace={openServisUpload}
                />
              ))}
              {/* Önceki aylar */}
              {forms.filter(f => !(f.year === year && f.month === month)).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">Diğer Dönemler</p>
                  <div className="space-y-2">
                    {forms.filter(f => !(f.year === year && f.month === month)).map(f => (
                      <FileRow key={f.id}
                        label={`${MONTHS_TR[f.month]} ${f.year} Servis Formu`}
                        fileUrl={f.file_url} fileName={f.file_name}
                        uploadedBy={f.uploaded_by_name} uploadedAt={f.created_at}
                        onDelete={async () => {
                          if (!confirm("Silinsin mi?")) return;
                          try { await apiDelete(`/service-forms/${f.id}`); loadTab(); }
                          catch { alert("Silme işlemi tamamlanamadı. Sunucu bağlantısı kontrol edilmeli."); }
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Faturalar ── */}
          {activeTab === "fatura" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{periodLabel} Bakım Faturası</p>
                <button onClick={() => openFaturaUpload()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
                  <Plus className="h-3.5 w-3.5" /> Fatura Yükle
                </button>
              </div>
              {currentInvoices.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 flex flex-col items-center gap-3">
                  <Receipt className="h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">{periodLabel} için henüz bakım faturası yüklenmemiş.</p>
                </div>
              ) : currentInvoices.map(inv => (
                <FileRow key={inv.id}
                  label={`${periodLabel} Bakım Faturası`}
                  period={inv.period} fileUrl={inv.file_url} fileName={inv.file_name}
                  amount={inv.amount} currency={inv.currency}
                  uploadedBy={inv.submitted_by_name} uploadedAt={inv.created_at}
                  onDelete={async () => {
                    if (!confirm("Fatura kaydı silinsin mi?")) return;
                    try { await apiDelete(`/invoice-records/${inv.id}`); loadTab(); }
                    catch { alert("Silme işlemi tamamlanamadı. Sunucu bağlantısı kontrol edilmeli."); }
                  }}
                  onReplace={() => openFaturaUpload(inv.id)}
                />
              ))}
              {/* Önceki dönemler */}
              {invoices.filter(i => i.period !== period).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">Diğer Dönemler</p>
                  <div className="space-y-2">
                    {invoices.filter(i => i.period !== period).map(inv => (
                      <FileRow key={inv.id}
                        label={`${inv.period ?? "—"} Bakım Faturası`}
                        period={inv.period} fileUrl={inv.file_url} fileName={inv.file_name}
                        amount={inv.amount} currency={inv.currency}
                        uploadedBy={inv.submitted_by_name} uploadedAt={inv.created_at}
                        onDelete={async () => {
                          if (!confirm("Silinsin mi?")) return;
                          try { await apiDelete(`/invoice-records/${inv.id}`); loadTab(); }
                          catch { alert("Silme işlemi tamamlanamadı. Sunucu bağlantısı kontrol edilmeli."); }
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Hakkedişler ── */}
          {activeTab === "hakkediş" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{periodLabel} Bakım Hakkedişi</p>
                <button onClick={() => openHakkedisCUpload()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
                  <Plus className="h-3.5 w-3.5" /> Hakkediş Yükle
                </button>
              </div>
              {currentPayments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 flex flex-col items-center gap-3">
                  <Receipt className="h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">{periodLabel} için henüz bakım hakkedişi yüklenmemiş.</p>
                </div>
              ) : currentPayments.map(pay => (
                <div key={pay.id} className="space-y-2">
                  <FileRow
                    label={`${periodLabel} Bakım Hakkedişi`}
                    period={pay.period} fileUrl={pay.file_url} fileName={pay.file_name}
                    amount={pay.amount} currency={pay.currency}
                    status={pay.approval_status}
                    uploadedBy={pay.submitted_by_name} uploadedAt={pay.created_at}
                    onDelete={async () => {
                      if (!confirm("Hakkediş silinsin mi? Bağlı onay talebi de iptal edilecek.")) return;
                      try { await apiDelete(`/progress-payments/${pay.id}`); loadTab(); }
                      catch { alert("Silme işlemi tamamlanamadı. Sunucu bağlantısı kontrol edilmeli."); }
                    }}
                    onReplace={() => openHakkedisCUpload(pay.id)}
                  />
                  {!pay.submitted_for_approval && pay.file_url && (
                    <button
                      onClick={async () => {
                        await apiPost(`/progress-payments/projects/${projectId}`, {
                          payment_type: "bakim", period, file_url: pay.file_url,
                          file_name: pay.file_name, submitted_for_approval: true,
                        });
                        await apiDelete(`/progress-payments/${pay.id}`);
                        loadTab();
                      }}
                      className="text-xs text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-50 font-medium">
                      Onaya Gönder →
                    </button>
                  )}
                </div>
              ))}
              {/* Önceki dönemler */}
              {payments.filter(p => p.period !== period).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">Diğer Dönemler</p>
                  <div className="space-y-2">
                    {payments.filter(p => p.period !== period).map(pay => (
                      <FileRow key={pay.id}
                        label={`${pay.period ?? "—"} Bakım Hakkedişi`}
                        period={pay.period} fileUrl={pay.file_url} fileName={pay.file_name}
                        amount={pay.amount} currency={pay.currency}
                        status={pay.approval_status}
                        uploadedBy={pay.submitted_by_name} uploadedAt={pay.created_at}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Son İşlemler ── */}
          {activeTab === "aktivite" && (
            <div className="space-y-2">
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-dashed border-slate-200">
                  <Clock className="h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">Henüz işlem kaydı yok.</p>
                </div>
              ) : activities.map(a => (
                <div key={a.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
                  <div className="h-2 w-2 mt-1.5 shrink-0 rounded-full bg-sky-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{a.title}</p>
                    {a.description && <p className="text-xs text-slate-500 mt-0.5">{a.description}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">{a.user_name} · {fmtDate(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Notlar ── */}
          {activeTab === "notlar" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-dashed border-slate-200">
              <StickyNote className="h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">Notlar için mağaza kartını kullanın.</p>
              <Link href={`/projects/${projectId}?tab=notes`}
                className="text-xs text-sky-600 hover:underline">
                Mağaza Kartı Notları →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {uploadCfg && (
        <UploadModal
          projectId={projectId}
          config={uploadCfg}
          onClose={() => setUploadCfg(null)}
          onDone={() => { setUploadCfg(null); loadTab(); }}
        />
      )}
    </div>
  );
}
