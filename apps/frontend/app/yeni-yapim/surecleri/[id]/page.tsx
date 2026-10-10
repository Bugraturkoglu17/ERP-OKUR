"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, Building2, Calendar, CheckCircle2,
  ChevronRight, Clock, Download, Eye,
  FileText, FolderOpen, HardHat, History, Loader2, MapPin,
  MessageSquarePlus, Paperclip, Play, Plus, Receipt,
  RefreshCw, Save, Send, StickyNote, Trash2, Upload, X, XCircle,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, buildApiUrl } from "@/lib/api";
import { openFileInNewTab } from "@/lib/download";

// ── Types ──────────────────────────────────────────────────────────────────────

type StageStatus = "pending" | "in_progress" | "completed" | "delayed" | "cancelled";

type Stage = {
  id: string; process_id: string; name: string; order_index: number;
  status: StageStatus; responsible_name?: string;
  target_end_date?: string; completed_at?: string; note?: string;
};

type Process = {
  id: string; project_id: string; work_type: string; title: string;
  description?: string; status: string; scope_code?: string;
  start_date?: string; target_end_date?: string; completed_at?: string;
  responsible_name?: string; progress_percent: number;
  created_at: string; stages: Stage[];
  project_name?: string; project_no?: string; store_address?: string;
};

type Document = {
  id: string; original_name: string; doc_type: string; version: number;
  revision_note?: string; uploaded_by_name?: string;
  file_size_bytes?: number; created_at: string;
};

type DocVersion = {
  id: string; version: number; original_name: string;
  revision_note?: string; uploaded_by_name?: string;
  file_size_bytes?: number; created_at: string;
};

type ProgressPayment = {
  id: string; project_id: string; payment_type: string; period?: string;
  amount?: number; currency: string; file_url?: string; file_name?: string;
  description?: string; approval_status: string; submitted_for_approval: boolean;
  submitted_by_name?: string; created_at: string;
};

type InvoiceRecord = {
  id: string; project_id: string; invoice_type: string; invoice_no?: string;
  period?: string; amount?: number; currency: string;
  file_url?: string; file_name?: string; description?: string;
  approval_status: string; submitted_by_name?: string; created_at: string;
};

type ProcessNote = {
  id: string; process_id: string; note_type: string;
  content: string; user_name?: string; created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtBytes(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function parseTRY(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

function displayTRY(s: string): string {
  const n = parseTRY(s);
  if (!n) return s;
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTRY(n: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
}

function calcDays(d?: string | null): { text: string; color: string } {
  if (!d) return { text: "", color: "" };
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff > 0)  return { text: `${diff}g kaldı`,          color: "text-blue-600"  };
  if (diff === 0) return { text: "Bugün teslim",            color: "text-amber-600" };
  return             { text: `${Math.abs(diff)}g gecikti`, color: "text-red-600"   };
}

/** description alanı JSON metadata ise gizler, düz metin ise gösterir */
function DescriptionDisplay({ description }: { description?: string }) {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description);
    if (typeof parsed === "object" && parsed !== null) {
      // JSON metadata — scope varsa küçük bir badge göster, raw JSON'u gösterme
      const scope = parsed.scope as string | undefined;
      if (!scope) return null;
      return (
        <span className="inline-block mt-1.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
          {scope}
        </span>
      );
    }
  } catch {
    // JSON değil — düz metin olarak göster
  }
  return <p className="text-sm text-slate-500 mt-1.5">{description}</p>;
}

async function uploadFile(file: File, projectId: string, docType: string): Promise<{ id: string; original_name: string }> {
  const fd = new FormData();
  fd.append("project_id", projectId);
  fd.append("doc_type", docType);
  fd.append("file", file);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(buildApiUrl("/documents/upload"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Dosya yüklenemedi");
  return res.json();
}

async function openDoc(docId: string) {
  try {
    await openFileInNewTab(async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(buildApiUrl(`/documents/${docId}/download`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      return (await res.json()).url;
    });
  } catch {
    alert("Dosya açılamadı.");
  }
}

// ── Stage config ───────────────────────────────────────────────────────────────

type StageCfg = { label: string; icon: React.ElementType; dot: string; text: string; bg: string; border: string };
const STAGE_STATUS: Record<string, StageCfg> = {
  in_progress: { label: "Devam Ediyor", icon: Play,         dot: "bg-blue-400",  text: "text-blue-700",  bg: "bg-blue-50",  border: "border-blue-200"  },
  completed:   { label: "Tamamlandı",   icon: CheckCircle2, dot: "bg-green-400", text: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  waiting:     { label: "Beklemede",    icon: Clock,        dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  pending:     { label: "Beklemede",    icon: Clock,        dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  delayed:     { label: "Beklemede",    icon: Clock,        dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  cancelled:   { label: "İptal",        icon: XCircle,      dot: "bg-slate-300", text: "text-slate-400", bg: "bg-slate-50", border: "border-slate-200" },
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  "Keşif":             "Sahada keşif yapıldı mı, yapılacak iş netleşti mi?",
  "Proje Onayı":       "Proje çizimleri ve teknik şartname hazırlandı mı, onaylandı mı?",
  "Fiyat Onayı":       "Fiyat teklifi hazırlandı mı, ilgili taraflarca onaylandı mı?",
  "Malzeme Hazırlığı": "Malzeme siparişi verildi mi, temin süreci başladı mı?",
  "Montaj / Uygulama": "Sahada montaj / uygulama işlemi yapıldı mı?",
  "Test ve Kontrol":   "Sistem test edildi mi, aktif ve çalışır hale getirildi mi?",
  "Hakediş / Fatura":  "Hakediş/fatura işlemleri tamamlandı mı? Bu aşama tamamlandığında yeni yapım iş kalemi kapanır.",
};

const STATUS_OPTIONS = [
  { value: "in_progress", label: "Devam Ediyor", icon: Play,         selCls: "border-blue-400 bg-blue-50",   iconCls: "text-blue-600"  },
  { value: "completed",   label: "Tamamlandı",   icon: CheckCircle2, selCls: "border-green-400 bg-green-50", iconCls: "text-green-600" },
  { value: "waiting",     label: "Beklemede",    icon: Clock,        selCls: "border-amber-400 bg-amber-50", iconCls: "text-amber-600" },
] as const;

const APPROVAL_STATUS: Record<string, { label: string; cls: string }> = {
  draft:              { label: "Taslak",                    cls: "bg-slate-100 text-slate-600"    },
  pending:            { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"     },
  bekliyor:           { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"     },
  internal_pending:   { label: "İç Onay Bekliyor",          cls: "bg-amber-50 text-amber-700"     },
  internal_approved:  { label: "İç Onay Alındı",           cls: "bg-blue-50 text-blue-700"       },
  migros_pending:     { label: "Migros Onayı Bekleniyor",   cls: "bg-indigo-50 text-indigo-700"   },
  invoice_stage:      { label: "Faturalandırma Aşamasında", cls: "bg-emerald-50 text-emerald-700" },
  invoiced:           { label: "Faturalandırıldı",          cls: "bg-green-100 text-green-800"    },
  revision_requested: { label: "Revizyon İstendi",          cls: "bg-purple-50 text-purple-700"   },
  rejected:           { label: "Reddedildi",                cls: "bg-red-50 text-red-600"         },
  onaylandi:          { label: "Onaylandı",                 cls: "bg-green-50 text-green-700"     },
  reddedildi:         { label: "Reddedildi",                cls: "bg-red-50 text-red-600"         },
  revizyon:           { label: "Revizyon İstendi",          cls: "bg-purple-50 text-purple-700"   },
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  general: "Genel", firm: "Firma", technical: "Teknik", approval: "Onay", revision: "Revizyon",
};

const DOC_TYPES_YENI_YAPIM = [
  { value: "yeni_yapim_proje",    label: "Yeni Yapım Projesi"  },
  { value: "yeni_yapim_onay",     label: "Onaylı Proje"        },
  { value: "yeni_yapim_uygulama", label: "Uygulama Projesi"    },
  { value: "yeni_yapim_teklif",   label: "Teklif Dosyası"      },
  { value: "yeni_yapim_diger",    label: "Diğer"               },
];

const DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOC_TYPES_YENI_YAPIM.map(d => [d.value, d.label])
);

// ── File Dropzone ──────────────────────────────────────────────────────────────

function FileDropzone({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <>
      <input ref={ref} type="file" className="hidden" onChange={e => onFile(e.target.files?.[0] ?? null)} />
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0] ?? null); }}
        onClick={() => !file && ref.current?.click()}
        className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors cursor-pointer ${
          drag ? "border-emerald-400 bg-emerald-50" : file ? "border-green-300 bg-green-50/60 cursor-default" : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40"
        }`}
      >
        {file ? (
          <>
            <FileText className="h-4 w-4 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
              <p className="text-[11px] text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button type="button" onClick={e => { e.stopPropagation(); onFile(null); if (ref.current) ref.current.value = ""; }}
              className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 text-slate-300 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-slate-500">Sürükle & bırak <span className="text-slate-400">veya</span></p>
              <button type="button" onClick={e => { e.stopPropagation(); ref.current?.click(); }}
                className="text-xs font-semibold text-emerald-600 hover:underline">Dosya Seç</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── CurrencyInput ──────────────────────────────────────────────────────────────

function CurrencyInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <input type="text"
        value={focused ? value : (value ? displayTRY(value) || value : "")}
        onFocus={() => setFocused(true)}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { setFocused(false); const n = parseTRY(value); if (n > 0) onChange(displayTRY(value)); }}
        placeholder="0,00" className={className} inputMode="decimal" />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">₺</span>
    </div>
  );
}

// ── Stage Update Modal ─────────────────────────────────────────────────────────

function StageUpdateModal({ stage, processId, projectId, isLastStage, onClose, onDone, onPendingCompletion }: {
  stage: Stage; processId: string; projectId: string;
  isLastStage: boolean;
  onClose: () => void;
  onDone: () => void;
  onPendingCompletion: (data: { responsible: string; date: string; note: string }) => void;
}) {
  const normalizeStatus = (s: string) =>
    (s === "pending" || s === "delayed" || s === "cancelled") ? "waiting" : s;

  const [status, setStatus] = useState<"in_progress" | "completed" | "waiting">(
    normalizeStatus(stage.status) as "in_progress" | "completed" | "waiting"
  );
  const [responsible, setResponsible] = useState(stage.responsible_name ?? "");
  const [date, setDate] = useState(stage.target_end_date?.split("T")[0] ?? "");
  const [note, setNote] = useState(stage.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isLastStage && status === "completed") {
      onPendingCompletion({ responsible, date, note });
      onClose();
      return;
    }

    setBusy(true); setErr("");
    try {
      const completedAt = status === "completed"
        ? (stage.completed_at ?? new Date().toISOString().split("T")[0] + "T00:00:00")
        : null;
      await apiPatch(`/process/projects/${projectId}/process/${processId}/stages/${stage.id}`, {
        status,
        responsible_name: responsible || null,
        target_end_date: date ? `${date}T00:00:00` : null,
        completed_at: completedAt,
        note: note || null,
      });
      onDone();
      onClose();
    } catch (ex: any) { setErr(ex?.response?.data?.detail ?? "Güncelleme başarısız."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Aşama Güncelle</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{stage.name}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Durum</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isSelected = status === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setStatus(opt.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-all ${
                      isSelected ? opt.selCls : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}>
                    <Icon className={`h-5 w-5 ${isSelected ? opt.iconCls : "text-slate-400"}`} />
                    <span className={`text-[11px] font-semibold ${isSelected ? opt.iconCls : "text-slate-500"}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Sorumlu Kişi</label>
            <input value={responsible} onChange={e => setResponsible(e.target.value)}
              placeholder="Atanmadı" className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hedef Tarih</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama / Not</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Aşama notu..." className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          {isLastStage && status === "completed" && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700">Son aşama tamamlanacak</p>
              <p className="text-[11px] text-emerald-600 mt-0.5">
                Kaydet butonuna bastığınızda onay penceresi açılacak ve yeni yapım iş kalemi tamamlandı olarak işaretlenecek.
              </p>
            </div>
          )}
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Vazgeç</button>
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Process Completion Confirm Modal ───────────────────────────────────────────

type PendingCompletion = { stageId: string; responsible: string; date: string; note: string };

function CompletionConfirmModal({ pendingData, processId, projectId, onCancel, onConfirm }: {
  pendingData: PendingCompletion;
  processId: string; projectId: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  const handleConfirm = async () => {
    setBusy(true); setErr("");
    try {
      const completedAt = new Date().toISOString().split("T")[0] + "T00:00:00";
      await apiPatch(`/process/projects/${projectId}/process/${processId}/stages/${pendingData.stageId}`, {
        status: "completed",
        responsible_name: pendingData.responsible || null,
        target_end_date: pendingData.date ? `${pendingData.date}T00:00:00` : null,
        completed_at: completedAt,
        note: pendingData.note || null,
      });
      await apiPatch(`/process/projects/${projectId}/process/${processId}`, {
        status: "completed",
        progress_percent: 100,
        completed_at: new Date().toISOString().split(".")[0],
      });
      onConfirm();
    } catch (ex: any) {
      const detail = ex?.response?.data?.detail;
      const status = ex?.response?.status;
      let errMsg = "İşlem başarısız.";
      if (typeof detail === "string" && detail) {
        errMsg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        errMsg = detail[0]?.msg ?? "Doğrulama hatası.";
      } else if (status) {
        errMsg = `Sunucu hatası (${status}). Lütfen tekrar deneyin.`;
      } else if (ex?.message) {
        errMsg = `Bağlantı hatası: ${ex.message}`;
      }
      console.warn("[CompletionConfirmModal] hata:", ex?.code, ex?.response?.status, ex?.message);
      setErr(errMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="px-6 pt-6 pb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 border border-green-100 mb-4">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Yeni Yapım İşi Tamamlanacak</h3>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Hakediş / Fatura aşaması tamamlandı olarak işaretlendi. Bu işlem sonrası yeni yapım iş kalemi aktif
            listeden kaldırılacak ve <span className="font-medium text-slate-700">Tamamlanan İşler</span> bölümüne
            taşınacaktır. Devam etmek istiyor musunuz?
          </p>
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4 mt-4">
          <button onClick={onCancel} disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Vazgeç
          </button>
          <button onClick={handleConfirm} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            İşi Tamamla
          </button>
        </div>
      </div>
    </div>
  );
}

// ── History Drawer ─────────────────────────────────────────────────────────────

function HistoryDrawer({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet<DocVersion[]>(`/documents/${doc.id}/versions`)
      .then(d => setVersions(Array.isArray(d) ? d : []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [doc.id]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Revizyon Geçmişi</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[220px]">{doc.original_name}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            : versions.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Revizyon bulunamadı.</p>
            : [...versions].sort((a, b) => b.version - a.version).map(v => (
              <div key={v.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">v{v.version}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{v.original_name}</p>
                  {v.revision_note && <p className="text-[11px] text-slate-500 italic mt-0.5">{v.revision_note}</p>}
                  <p className="text-[11px] text-slate-400 mt-0.5">{v.uploaded_by_name ?? "—"} · {new Date(v.created_at).toLocaleDateString("tr-TR")} · {fmtBytes(v.file_size_bytes)}</p>
                </div>
                <button onClick={() => openDoc(v.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-green-50 hover:text-green-600">
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab types ──────────────────────────────────────────────────────────────────

type TabKey = "ozet" | "surec" | "dosyalar" | "revizyonlar" | "hakkedisler" | "faturalar" | "notlar";

const TABS: { key: TabKey; label: string }[] = [
  { key: "ozet",        label: "Özet"            },
  { key: "surec",       label: "Süreç Takibi"    },
  { key: "dosyalar",    label: "Proje Dosyaları" },
  { key: "revizyonlar", label: "Revizyonlar"     },
  { key: "hakkedisler", label: "Hakkedişler"     },
  { key: "faturalar",   label: "Faturalar"       },
  { key: "notlar",      label: "Notlar"          },
];

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function YeniYapimKlasorPage() {
  const params       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const processId    = params.id;
  const projectId    = searchParams.get("p") ?? "";

  const [process,   setProcess]   = useState<Process | null>(null);
  const [docs,      setDocs]      = useState<Document[]>([]);
  const [payments,  setPayments]  = useState<ProgressPayment[]>([]);
  const [invoices,  setInvoices]  = useState<InvoiceRecord[]>([]);
  const [notes,     setNotes]     = useState<ProcessNote[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<TabKey>("ozet");

  const [uploadDocOpen,     setUploadDocOpen]     = useState(false);
  const [uploadRevOpen,     setUploadRevOpen]     = useState(false);
  const [addPayOpen,        setAddPayOpen]        = useState(false);
  const [addInvOpen,        setAddInvOpen]        = useState(false);
  const [editStage,         setEditStage]         = useState<Stage | null>(null);
  const [historyDoc,        setHistoryDoc]        = useState<Document | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState<PendingCompletion | null>(null);

  const [noteText,   setNoteText]   = useState("");
  const [noteType,   setNoteType]   = useState("general");
  const [savingNote, setSavingNote] = useState(false);

  const loadProcess = useCallback(async () => {
    if (!projectId) return;
    const procs = await apiGet<Process[]>(`/process/projects/${projectId}/process`).catch(() => []);
    const found = (Array.isArray(procs) ? procs : []).find(p => p.id === processId) ?? null;
    setProcess(found);
  }, [projectId, processId]);

  const loadDocs = useCallback(async () => {
    if (!projectId) return;
    const d = await apiGet<Document[]>(`/documents/projects/${projectId}`).catch(() => []);
    setDocs(Array.isArray(d) ? d : []);
  }, [projectId]);

  const loadPayments = useCallback(async () => {
    if (!projectId) return;
    const d = await apiGet<ProgressPayment[]>(`/progress-payments/projects/${projectId}`).catch(() => []);
    setPayments((Array.isArray(d) ? d : []).filter(p => p.payment_type === "yeni_yapim"));
  }, [projectId]);

  const loadInvoices = useCallback(async () => {
    if (!projectId) return;
    const d = await apiGet<InvoiceRecord[]>(`/invoice-records/projects/${projectId}`).catch(() => []);
    setInvoices((Array.isArray(d) ? d : []).filter(i => i.invoice_type.startsWith("yeni_yapim_")));
  }, [projectId]);

  const loadNotes = useCallback(async () => {
    if (!projectId || !processId) return;
    const d = await apiGet<ProcessNote[]>(`/process/projects/${projectId}/process/${processId}/notes`).catch(() => []);
    setNotes(Array.isArray(d) ? d : []);
  }, [projectId, processId]);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    Promise.all([loadProcess(), loadDocs(), loadPayments(), loadInvoices(), loadNotes()])
      .finally(() => setLoading(false));
  }, [loadProcess, loadDocs, loadPayments, loadInvoices, loadNotes]);

  const addNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await apiPost(`/process/projects/${projectId}/process/${processId}/notes`, {
        note_type: noteType, content: noteText.trim(),
      });
      setNoteText(""); await loadNotes();
    } catch { /* ignore */ }
    finally { setSavingNote(false); }
  };

  const projDocs = docs.filter(d => d.doc_type.startsWith("yeni_yapim_") && d.doc_type !== "yeni_yapim_revizyon");
  const revDocs  = docs.filter(d => d.doc_type === "yeni_yapim_revizyon");

  if (!projectId) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle className="h-10 w-10 text-slate-200" />
      <p className="text-sm text-slate-500">Proje ID bulunamadı. Lütfen Yeni Yapım Süreçleri listesinden erişin.</p>
      <Link href="/yeni-yapim/surecleri" className="text-sm text-emerald-600 hover:underline">← Yeni Yapım Süreçleri</Link>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
    </div>
  );

  if (!process) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle className="h-10 w-10 text-slate-200" />
      <p className="text-sm text-slate-500">Yeni yapım süreci bulunamadı.</p>
      <Link href="/yeni-yapim/surecleri" className="text-sm text-emerald-600 hover:underline">← Yeni Yapım Süreçleri</Link>
    </div>
  );

  const isCompleted = process.status === "completed";
  const currentStage = process.stages.find(s => s.status === "in_progress")
    ?? process.stages.find(s => s.status !== "completed");
  const cd = calcDays(process.target_end_date);

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/yeni-yapim" className="hover:text-slate-700">Yeni Yapım</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/yeni-yapim/surecleri" className="hover:text-slate-700">Süreçler</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-slate-700 font-medium truncate max-w-[260px]">{process.title}</span>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                isCompleted ? "bg-green-50 text-green-700 border-green-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}>
                {isCompleted ? "Tamamlandı" : "Devam Ediyor"}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                Yeni Yapım
              </span>
              {process.responsible_name && (
                <span className="text-[11px] text-slate-400">{process.responsible_name}</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900">{process.title}</h1>

            <div className="mt-1.5 flex items-start gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-sm font-semibold text-slate-800">
                  {process.project_name ?? "Mağaza bilgisi yükleniyor…"}
                </span>
                {process.project_no && (
                  <span className="ml-1.5 text-xs text-slate-400 font-mono">— {process.project_no}</span>
                )}
                {process.store_address && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 text-slate-300 shrink-0" />
                    <span className="text-[11px] text-slate-400">{process.store_address}</span>
                  </div>
                )}
              </div>
            </div>

            {process.description && <DescriptionDisplay description={process.description} />}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {process.start_date && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Başlangıç: {fmtDate(process.start_date)}
                </span>
              )}
              {process.target_end_date && (
                <span className={`text-[11px] font-medium flex items-center gap-1 ${cd.color || "text-slate-400"}`}>
                  <Clock className="h-3 w-3" /> {cd.text || fmtDate(process.target_end_date)}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <div className="text-right">
              <p className={`text-lg font-bold ${isCompleted ? "text-green-600" : "text-emerald-600"}`}>
                {process.progress_percent}%
              </p>
              <div className="w-24 h-2 rounded-full bg-slate-100 mt-1 overflow-hidden">
                <div className={`h-full rounded-full ${isCompleted ? "bg-green-400" : "bg-emerald-400"}`}
                  style={{ width: `${process.progress_percent}%` }} />
              </div>
            </div>
            <Link href={`/projects/${projectId}`}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50">
              <FolderOpen className="h-3 w-3" /> Mağaza Kartı
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b border-slate-100">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-none px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key ? "border-emerald-500 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* ── Özet ── */}
          {tab === "ozet" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Aşama",         value: currentStage?.name ?? (isCompleted ? "Tamamlandı" : "—") },
                  { label: "İlerleme",      value: `${process.progress_percent}%` },
                  { label: "Proje Dosyası", value: String(projDocs.length) },
                  { label: "Hakkediş",     value: String(payments.length) },
                  { label: "Fatura",       value: String(invoices.length) },
                  { label: "Tamamlananlar", value: `${process.stages.filter(s => s.status === "completed").length}/${process.stages.length}` },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{s.label}</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aşamalar</p>
                {process.stages.map((stage, idx) => {
                  const cfg = STAGE_STATUS[stage.status] ?? STAGE_STATUS.waiting;
                  const Icon = cfg.icon;
                  return (
                    <div key={stage.id} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
                      stage.status === "in_progress" ? "border-blue-100 bg-blue-50/50" :
                      stage.status === "completed"   ? "border-green-100 bg-green-50/30" : "border-slate-100 bg-white"
                    }`}>
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-500">{idx + 1}</div>
                      <Icon className={`h-4 w-4 shrink-0 ${cfg.text}`} />
                      <p className={`text-xs font-medium flex-1 ${cfg.text}`}>{stage.name}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                      {stage.completed_at && <span className="text-[10px] text-slate-400">{fmtDate(stage.completed_at)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Süreç Takibi ── */}
          {tab === "surec" && (
            <div className="space-y-5">
              <div className={`rounded-2xl border p-5 ${
                isCompleted ? "bg-green-50 border-green-200" : "bg-gradient-to-r from-slate-50 to-white border-slate-200"
              }`}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Genel İlerleme</p>
                    <p className={`text-3xl font-bold mt-0.5 ${isCompleted ? "text-green-600" : "text-slate-900"}`}>
                      {process.progress_percent}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-400 mb-0.5">Tamamlanan</p>
                    <p className="text-sm font-bold text-slate-700">
                      {process.stages.filter(s => s.status === "completed").length}
                      <span className="text-slate-400 font-normal"> / {process.stages.length} aşama</span>
                    </p>
                    {!isCompleted && cd.text && (
                      <p className={`text-xs font-semibold mt-1 ${cd.color}`}>{cd.text}</p>
                    )}
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full mt-1">
                        <CheckCircle2 className="h-3 w-3" /> Tamamlandı
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-200/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${isCompleted ? "bg-green-400" : "bg-emerald-400"}`}
                    style={{ width: `${process.progress_percent}%` }}
                  />
                </div>
                {!isCompleted && currentStage && (
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-medium text-slate-700">Aktif aşama:</span> {currentStage.name}
                  </p>
                )}
              </div>

              <div>
                {process.stages.map((stage, idx) => {
                  const cfg = STAGE_STATUS[stage.status] ?? STAGE_STATUS.waiting;
                  const Icon = cfg.icon;
                  const isLast = idx === process.stages.length - 1;
                  const isDone = stage.status === "completed";
                  const isActive = stage.status === "in_progress";

                  return (
                    <div key={stage.id} className="flex gap-4">
                      <div className="flex flex-col items-center w-10 shrink-0">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                          isDone   ? "border-green-200 bg-green-50" :
                          isActive ? "border-emerald-300 bg-emerald-50 shadow-sm shadow-emerald-100" :
                          "border-slate-200 bg-white"
                        }`}>
                          <Icon className={`h-4.5 w-4.5 ${cfg.text}`} style={{ width: "18px", height: "18px" }} />
                        </div>
                        {!isLast && (
                          <div className={`flex-1 w-0.5 min-h-[16px] mt-1 ${isDone ? "bg-green-200" : "bg-slate-100"}`} />
                        )}
                      </div>

                      <div className={`flex-1 rounded-2xl border p-4 mb-3 transition-all ${
                        isDone   ? "border-green-100 bg-green-50/30" :
                        isActive ? "border-emerald-100 bg-emerald-50/40 shadow-sm" :
                        "border-slate-100 bg-white"
                      }`}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900">{stage.name}</h4>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                                <Icon className="h-2.5 w-2.5" style={{ width: "10px", height: "10px" }} />
                                {cfg.label}
                              </span>
                            </div>
                            {STAGE_DESCRIPTIONS[stage.name] && (
                              <p className="text-xs text-slate-400 mb-1.5">{STAGE_DESCRIPTIONS[stage.name]}</p>
                            )}
                            <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
                              {stage.responsible_name && (
                                <span className="flex items-center gap-1">
                                  <HardHat className="h-3 w-3" /> {stage.responsible_name}
                                </span>
                              )}
                              {stage.completed_at && (
                                <span className="text-green-600 font-medium">✓ {fmtDate(stage.completed_at)}</span>
                              )}
                              {!stage.completed_at && stage.target_end_date && (
                                <span>Hedef: {fmtDate(stage.target_end_date)}</span>
                              )}
                              {stage.note && (
                                <span className="italic truncate max-w-[220px]">{stage.note}</span>
                              )}
                            </div>
                          </div>
                          {!isCompleted && (
                            <button
                              onClick={() => setEditStage(stage)}
                              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-xl px-3 py-1.5 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                            >
                              <RefreshCw className="h-3 w-3" /> Güncelle
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Proje Dosyaları ── */}
          {tab === "dosyalar" && (
            <ProjectFilesTab
              docs={projDocs}
              projectId={projectId}
              onUpload={() => setUploadDocOpen(true)}
              onHistory={setHistoryDoc}
              onDelete={async (doc) => {
                if (!confirm(`"${doc.original_name}" arşivlensin mi?`)) return;
                await apiDelete(`/documents/${doc.id}`).catch(() => {});
                await loadDocs();
              }}
              onRefresh={loadDocs}
            />
          )}

          {/* ── Revizyonlar ── */}
          {tab === "revizyonlar" && (
            <RevizjonlarTab
              docs={revDocs}
              projectId={projectId}
              onUpload={() => setUploadRevOpen(true)}
              onHistory={setHistoryDoc}
              onDelete={async (doc) => {
                if (!confirm(`"${doc.original_name}" arşivlensin mi?`)) return;
                await apiDelete(`/documents/${doc.id}`).catch(() => {});
                await loadDocs();
              }}
            />
          )}

          {/* ── Hakkedişler ── */}
          {tab === "hakkedisler" && (
            <HakkedislerTab
              payments={payments}
              projectId={projectId}
              onAdd={() => setAddPayOpen(true)}
              onDelete={async (p) => {
                if (!confirm("Bu hakkediş silinsin mi?")) return;
                await apiDelete(`/progress-payments/${p.id}`).catch(() => {});
                await loadPayments();
              }}
              onRefresh={loadPayments}
            />
          )}

          {/* ── Faturalar ── */}
          {tab === "faturalar" && (
            <FaturalarTab
              invoices={invoices}
              projectId={projectId}
              onAdd={() => setAddInvOpen(true)}
              onDelete={async (inv) => {
                if (!confirm("Bu fatura silinsin mi?")) return;
                await apiDelete(`/invoice-records/${inv.id}`).catch(() => {});
                await loadInvoices();
              }}
            />
          )}

          {/* ── Notlar ── */}
          {tab === "notlar" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <select value={noteType} onChange={e => setNoteType(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none">
                  {Object.entries(NOTE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <textarea rows={2} value={noteText} onChange={e => setNoteText(e.target.value)}
                  placeholder="Süreç notu ekle..."
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:border-emerald-500 focus:outline-none" />
                <button onClick={addNote} disabled={!noteText.trim() || savingNote}
                  className="self-end inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40">
                  {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquarePlus className="h-3 w-3" />} Ekle
                </button>
              </div>
              {notes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <StickyNote className="h-7 w-7 text-slate-200" />
                  <p className="text-sm text-slate-400">Henüz not yok.</p>
                </div>
              )}
              {notes.map(note => (
                <div key={note.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                      note.note_type === "technical" ? "bg-blue-50 text-blue-700" :
                      note.note_type === "firm"      ? "bg-purple-50 text-purple-700" :
                      note.note_type === "approval"  ? "bg-green-50 text-green-700" :
                      note.note_type === "revision"  ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
                    }`}>{NOTE_TYPE_LABELS[note.note_type] ?? note.note_type}</span>
                    <span className="text-[10px] text-slate-400">{note.user_name ?? "—"} · {fmtDate(note.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      {editStage && (
        <StageUpdateModal
          stage={editStage}
          processId={processId}
          projectId={projectId}
          isLastStage={process.stages[process.stages.length - 1]?.id === editStage.id}
          onClose={() => setEditStage(null)}
          onDone={() => { loadProcess(); }}
          onPendingCompletion={(data) => {
            setPendingCompletion({ stageId: editStage.id, ...data });
            setEditStage(null);
          }}
        />
      )}
      {pendingCompletion && (
        <CompletionConfirmModal
          pendingData={pendingCompletion}
          processId={processId}
          projectId={projectId}
          onCancel={() => setPendingCompletion(null)}
          onConfirm={() => { setPendingCompletion(null); loadProcess(); }}
        />
      )}
      {historyDoc && <HistoryDrawer doc={historyDoc} onClose={() => setHistoryDoc(null)} />}
      {uploadDocOpen && (
        <DocUploadModal projectId={projectId} processId={processId} isRevision={false}
          onClose={() => setUploadDocOpen(false)} onDone={loadDocs} />
      )}
      {uploadRevOpen && (
        <DocUploadModal projectId={projectId} processId={processId} isRevision={true}
          onClose={() => setUploadRevOpen(false)} onDone={loadDocs} />
      )}
      {addPayOpen && (
        <AddPaymentModal projectId={projectId}
          onClose={() => setAddPayOpen(false)} onDone={loadPayments} />
      )}
      {addInvOpen && (
        <AddInvoiceModal projectId={projectId}
          onClose={() => setAddInvOpen(false)} onDone={loadInvoices} />
      )}
    </div>
  );
}

// ── Sub-tab components ─────────────────────────────────────────────────────────

function ProjectFilesTab({ docs, onUpload, onHistory, onDelete }: {
  docs: Document[]; projectId: string;
  onUpload: () => void; onHistory: (d: Document) => void;
  onDelete: (d: Document) => void; onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Proje Dosyaları</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Yeni Yapım - Proje</p>
        </div>
        <button onClick={onUpload}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Proje Yükle
        </button>
      </div>
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed border-slate-200">
          <FileText className="h-8 w-8 text-slate-200" />
          <p className="text-sm text-slate-400">Proje dosyası yüklenmemiş.</p>
          <button onClick={onUpload} className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
            <Upload className="h-3.5 w-3.5" /> Dosya Yükle
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 hover:border-slate-200 group">
              <FileText className="h-5 w-5 text-slate-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{doc.original_name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded px-1.5 py-0.5 mr-1">Yeni Yapım - Proje</span>
                  {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type} · v{doc.version} · {fmtBytes(doc.file_size_bytes)}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onHistory(doc)} title="Geçmiş"
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <History className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => openDoc(doc.id)} title="İndir"
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-green-50 hover:text-green-600">
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onDelete(doc)} title="Arşivle"
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="text-[11px] text-slate-400 shrink-0">{new Date(doc.created_at).toLocaleDateString("tr-TR")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RevizjonlarTab({ docs, onUpload, onHistory, onDelete }: {
  docs: Document[]; projectId: string;
  onUpload: () => void; onHistory: (d: Document) => void; onDelete: (d: Document) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Revizyonlar</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Yeni Yapım - Revizyon</p>
        </div>
        <button onClick={onUpload}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Revizyon Yükle
        </button>
      </div>
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed border-slate-200">
          <RefreshCw className="h-8 w-8 text-slate-200" />
          <p className="text-sm text-slate-400">Revizyon yüklenmemiş.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...docs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(doc => (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 group">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-100 text-[11px] font-bold text-blue-700">v{doc.version}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{doc.original_name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded px-1.5 py-0.5 mr-1">Yeni Yapım - Revizyon</span>
                  {doc.uploaded_by_name ?? "—"} · {fmtBytes(doc.file_size_bytes)}
                </p>
                {doc.revision_note && <p className="text-[11px] text-slate-500 italic mt-0.5">{doc.revision_note}</p>}
              </div>
              <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onHistory(doc)} className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><History className="h-3.5 w-3.5" /></button>
                <button onClick={() => openDoc(doc.id)} className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-green-50 hover:text-green-600"><Download className="h-3.5 w-3.5" /></button>
                <button onClick={() => onDelete(doc)} className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <p className="text-[11px] text-slate-400 shrink-0">{new Date(doc.created_at).toLocaleDateString("tr-TR")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HakkedislerTab({ payments, projectId, onAdd, onDelete, onRefresh }: {
  payments: ProgressPayment[]; projectId: string;
  onAdd: () => void; onDelete: (p: ProgressPayment) => void; onRefresh: () => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleApproval = async (p: ProgressPayment) => {
    if (!confirm("Onaya gönderilsin mi?")) return;
    setSubmitting(p.id);
    try { await apiPatch(`/progress-payments/${p.id}`, { submitted_for_approval: true }); onRefresh(); }
    catch { alert("Gönderilemedi."); }
    finally { setSubmitting(null); }
  };

  const total = payments.reduce((s, p) => s + (p.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Hakkedişler</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Yeni Yapım - Hakkediş</p>
        </div>
        <button onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Hakkediş Ekle
        </button>
      </div>
      {payments.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Toplam",           value: payments.length,                                                                                              color: "text-slate-700" },
            { label: "İç Onay Bekliyor", value: payments.filter(p => ["pending","bekliyor","internal_pending"].includes(p.approval_status)).length,           color: "text-amber-600" },
            { label: "Toplam Tutar",     value: fmtTRY(total),                                                                                               color: "text-green-600" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-100 bg-white p-3 text-center">
              <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      {payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed border-slate-200">
          <Receipt className="h-8 w-8 text-slate-200" />
          <p className="text-sm text-slate-400">Hakkediş kaydı yok.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map(p => {
            const st = APPROVAL_STATUS[p.submitted_for_approval ? (p.approval_status || "pending") : "draft"];
            return (
              <div key={p.id} className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                    <Receipt className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded px-2 py-0.5">Yeni Yapım - Hakkediş</span>
                      {p.period && <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{p.period}</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${st?.cls ?? "bg-slate-100 text-slate-600"}`}>{st?.label ?? "Taslak"}</span>
                      {p.amount != null && <span className="text-xs font-bold text-slate-700">{fmtTRY(p.amount, p.currency)}</span>}
                    </div>
                    {p.file_name && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Paperclip className="h-3 w-3 text-slate-300" />
                        <span className="text-[11px] text-slate-400 truncate max-w-[200px]">{p.file_name}</span>
                      </div>
                    )}
                    {p.description && <p className="text-[11px] text-slate-500 italic mt-1">{p.description}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">{p.submitted_by_name ?? "—"} · {fmtDate(p.created_at)}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {p.file_url && (
                      <>
                        <button onClick={async () => { setOpening(p.id); await openDoc(p.file_url!); setOpening(null); }}
                          disabled={opening === p.id}
                          className="flex items-center gap-1 text-[11px] text-slate-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
                          {opening === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Aç
                        </button>
                        <button onClick={async () => { setOpening(p.id + "_dl"); await openDoc(p.file_url!); setOpening(null); }}
                          className="flex items-center gap-1 text-[11px] text-blue-600 border border-blue-100 rounded-lg px-2 py-1 hover:bg-blue-50">
                          <Download className="h-3.5 w-3.5" /> İndir
                        </button>
                      </>
                    )}
                    {!p.submitted_for_approval && (
                      <button onClick={() => handleApproval(p)} disabled={submitting === p.id}
                        className="flex items-center gap-1 text-[11px] text-emerald-700 border border-emerald-200 rounded-lg px-2 py-1 hover:bg-emerald-50 disabled:opacity-50">
                        {submitting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Onaya Gönder
                      </button>
                    )}
                    <button onClick={() => onDelete(p)}
                      className="flex items-center gap-1 text-[11px] text-red-500 border border-red-100 rounded-lg px-2 py-1 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" /> Sil
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FaturalarTab({ invoices, onAdd, onDelete }: {
  invoices: InvoiceRecord[]; projectId: string;
  onAdd: () => void; onDelete: (inv: InvoiceRecord) => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const total = invoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const INV_LABELS: Record<string, string> = {
    yeni_yapim_avansli:  "Avanslı Fatura",
    yeni_yapim_avanssiz: "Avanssız Fatura",
    yeni_yapim_faturasi: "Yeni Yapım Faturası",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Faturalar</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Yeni Yapım - Fatura</p>
        </div>
        <button onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Fatura Ekle
        </button>
      </div>
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Toplam Fatura", value: invoices.length, color: "text-slate-700" },
            { label: "Onay Bekliyor", value: invoices.filter(i => i.approval_status === "pending").length, color: "text-amber-600" },
            { label: "Toplam Tutar",  value: fmtTRY(total), color: "text-blue-600" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-100 bg-white p-3 text-center">
              <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed border-slate-200">
          <Receipt className="h-8 w-8 text-slate-200" />
          <p className="text-sm text-slate-400">Fatura kaydı yok.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const st = APPROVAL_STATUS[inv.approval_status] ?? APPROVAL_STATUS.draft;
            return (
              <div key={inv.id} className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                    <FileText className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded px-2 py-0.5">
                        Yeni Yapım - {INV_LABELS[inv.invoice_type] ?? "Fatura"}
                      </span>
                      {inv.invoice_no && <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{inv.invoice_no}</span>}
                      {inv.period && <span className="text-[11px] text-slate-400">{inv.period}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                      {inv.amount != null && <span className="text-xs font-bold text-slate-700">{fmtTRY(inv.amount, inv.currency)}</span>}
                    </div>
                    {inv.file_name && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Paperclip className="h-3 w-3 text-slate-300" />
                        <span className="text-[11px] text-slate-400 truncate max-w-[200px]">{inv.file_name}</span>
                      </div>
                    )}
                    {inv.description && <p className="text-[11px] text-slate-500 italic mt-1">{inv.description}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">{inv.submitted_by_name ?? "—"} · {fmtDate(inv.created_at)}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {inv.file_url && (
                      <>
                        <button onClick={async () => { setOpening(inv.id); await openDoc(inv.file_url!); setOpening(null); }}
                          disabled={opening === inv.id}
                          className="flex items-center gap-1 text-[11px] text-slate-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
                          {opening === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Aç
                        </button>
                        <button onClick={async () => { await openDoc(inv.file_url!); }}
                          className="flex items-center gap-1 text-[11px] text-blue-600 border border-blue-100 rounded-lg px-2 py-1 hover:bg-blue-50">
                          <Download className="h-3.5 w-3.5" /> İndir
                        </button>
                      </>
                    )}
                    <button onClick={() => onDelete(inv)}
                      className="flex items-center gap-1 text-[11px] text-red-500 border border-red-100 rounded-lg px-2 py-1 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" /> Sil
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Upload Modals ──────────────────────────────────────────────────────────────

function DocUploadModal({ projectId, processId, isRevision, onClose, onDone }: {
  projectId: string; processId: string; isRevision: boolean; onClose: () => void; onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState(isRevision ? "yeni_yapim_revizyon" : "yeni_yapim_proje");
  const [revNote, setRevNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setErr("Dosya seçin."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("project_id", projectId);
      fd.append("doc_type", docType);
      fd.append("revision_note", revNote);
      if (!isRevision && processId) fd.append("process_id", processId);
      fd.append("file", file);
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(buildApiUrl("/documents/upload"), {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Yükleme başarısız.");
      onDone(); onClose();
    } catch (ex: any) { setErr(ex.message ?? "Yükleme başarısız."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-900">{isRevision ? "Revizyon Yükle" : "Proje Dosyası Yükle"}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {!isRevision && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Proje Türü</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
                {DOC_TYPES_YENI_YAPIM.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dosya</label>
            <FileDropzone file={file} onFile={setFile} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{isRevision ? "Revizyon No / Not" : "Not"}</label>
            <input value={revNote} onChange={e => setRevNote(e.target.value)}
              placeholder="İsteğe bağlı..." className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Vazgeç</button>
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Yükle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddPaymentModal({ projectId, onClose, onDone }: {
  projectId: string; onClose: () => void; onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    period: new Date().toISOString().slice(0, 7),
    amountRaw: "", description: "", submitted_for_approval: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    const amount = parseTRY(form.amountRaw);
    if (amount <= 0) { setErr("Geçerli bir tutar girin."); return; }
    setBusy(true); setErr("");
    try {
      let file_url: string | null = null;
      let file_name: string | null = null;
      if (file) {
        const doc = await uploadFile(file, projectId, "invoice_doc");
        file_url = doc.id; file_name = doc.original_name;
      }
      await apiPost(`/progress-payments/projects/${projectId}`, {
        payment_type: "yeni_yapim",
        period: form.period || null,
        amount,
        file_url, file_name,
        description: form.description || null,
        submitted_for_approval: form.submitted_for_approval,
      });
      onDone(); onClose();
    } catch (ex: any) { setErr(ex?.message ?? ex?.response?.data?.detail ?? "Kayıt oluşturulamadı."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">Hakkediş Ekle <span className="text-emerald-600 font-normal">— Yeni Yapım</span></h3>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>
        <div className="px-5 py-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Dönem</label>
              <input value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
                placeholder="2026-06" className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tutar *</label>
              <CurrencyInput value={form.amountRaw} onChange={v => setForm(p => ({ ...p, amountRaw: v }))}
                className="w-full rounded-lg border px-3 pr-7 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dosya</label>
            <FileDropzone file={file} onFile={setFile} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
            <input type="checkbox" checked={form.submitted_for_approval}
              onChange={e => setForm(p => ({ ...p, submitted_for_approval: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            <div>
              <span className="text-xs font-medium text-slate-700">Onaya gönder</span>
              <p className="text-[11px] text-slate-400">Onay Süreçleri ekranına düşer.</p>
            </div>
          </label>
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Vazgeç</button>
          <button onClick={handleSubmit} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            {busy ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddInvoiceModal({ projectId, onClose, onDone }: {
  projectId: string; onClose: () => void; onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    invoice_type: "yeni_yapim_avanssiz",
    invoice_no: "", period: new Date().toISOString().slice(0, 7),
    amountRaw: "", description: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    const amount = parseTRY(form.amountRaw);
    if (amount <= 0) { setErr("Geçerli bir tutar girin."); return; }
    setBusy(true); setErr("");
    try {
      let file_url: string | null = null;
      let file_name: string | null = null;
      if (file) {
        const doc = await uploadFile(file, projectId, "invoice_doc");
        file_url = doc.id; file_name = doc.original_name;
      }
      await apiPost(`/invoice-records/projects/${projectId}`, {
        invoice_type: form.invoice_type,
        invoice_no: form.invoice_no || null,
        period: form.period || null,
        amount,
        file_url, file_name,
        description: form.description || null,
      });
      onDone(); onClose();
    } catch (ex: any) { setErr(ex?.message ?? ex?.response?.data?.detail ?? "Kayıt oluşturulamadı."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">Fatura Ekle <span className="text-emerald-600 font-normal">— Yeni Yapım</span></h3>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>
        <div className="px-5 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Fatura Tipi *</label>
            <select value={form.invoice_type} onChange={e => setForm(p => ({ ...p, invoice_type: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
              <option value="yeni_yapim_avanssiz">Avanssız Fatura</option>
              <option value="yeni_yapim_avansli">Avanslı Fatura</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fatura No</label>
              <input value={form.invoice_no} onChange={e => setForm(p => ({ ...p, invoice_no: e.target.value }))}
                placeholder="2026-0001" className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tutar *</label>
              <CurrencyInput value={form.amountRaw} onChange={v => setForm(p => ({ ...p, amountRaw: v }))}
                className="w-full rounded-lg border px-3 pr-7 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dönem</label>
            <input value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
              placeholder="2026-06" className="w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dosya</label>
            <FileDropzone file={file} onFile={setFile} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Vazgeç</button>
          <button onClick={handleSubmit} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {busy ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
