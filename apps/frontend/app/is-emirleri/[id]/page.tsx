"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { SubcontractorAssignmentBox } from "@/components/subcontractors/subcontractor-assignment";
import Link from "next/link";
import { formatServerDateTime } from "@/lib/utils";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, ArrowLeft, Boxes, Camera, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, ClipboardList,
  FileText, Image as ImageIcon, Loader2, Plus, Store,
  Trash2, User, X, Zap,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, getRequestErrorMessage } from "@/lib/api";
import { uploadFormData } from "@/lib/upload";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { CountBadge } from "@/components/ui/CountBadge";
import { ZoomableImage } from "@/components/ui/zoomable-image";
import { CompletionPanel, formatDateTime as formatCompletionTime, useWorkOrderCompletion } from "@/components/work-order/completion-panel";
import { MaterialTitle } from "@/components/retail-stock/material-picker";
import { ProjectLinkControl } from "@/components/work-order/project-link-control";
import { BackLink } from "@/components/ui/back-link";

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkOrder = {
  id: string; project_id: string; project_name?: string; project_no?: string;
  installation_project_id?: string | null; installation_project_name?: string | null;
  project_link_removable?: boolean; assigned_to_user_id?: string | null;
  project_region?: string; project_city?: string; project_address?: string;
  work_type: string; work_type_label: string; title: string; description?: string;
  assigned_to_name?: string;
  priority: string; status: string; status_label: string;
  completion_notes?: string;
  sent_at?: string; started_at?: string; completed_at?: string;
  created_by_name?: string; created_at: string; due_date?: string;
  updated_at?: string; photo_count: number; stock_depot_id?: string | null;
};

type WOPhoto = {
  id: string; file_name?: string; file_size_bytes?: number;
  mime_type?: string; photo_type: string; uploaded_by_name?: string;
  uploaded_at: string; is_added_to_inventory: boolean; fresh_url?: string;
};

type ReportPhoto = {
  id: string; report_id: string; file_name?: string;
  file_size_bytes?: number; mime_type?: string;
  uploaded_by_name?: string; uploaded_at: string; fresh_url?: string;
  is_added_to_inventory: boolean;
};

type Report = {
  id: string; work_order_id: string; title: string;
  description?: string; severity: string;
  created_by_name?: string; created_at: string;
  photo_count: number; photos: ReportPhoto[];
};

type UploadItem = {
  id: string; file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number; error?: string;
};

type Stage = {
  id: string; work_order_id: string; stage_order: number;
  stage_name: string; status: string;
  description?: string; updated_at?: string; updated_by_name?: string;
  created_at: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  draft:            "bg-muted text-muted-foreground",
  sent:             "bg-primary/5 text-primary",
  started:          "bg-amber-50 text-amber-700",
  completed:        "bg-emerald-50 text-emerald-700",
  failed:           "bg-red-50 text-red-700",
  cancelled:        "bg-muted text-muted-foreground",
  material_waiting: "bg-orange-50 text-orange-700",
  revisit:          "bg-purple-50 text-purple-700",
  approval_pending: "bg-yellow-50 text-yellow-700",
  approved:         "bg-emerald-100 text-emerald-800",
};

const PRIORITY_COLOR: Record<string, string> = {
  normal:   "bg-muted text-muted-foreground",
  urgent:   "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const PRIORITY_LABEL: Record<string, string> = {
  normal: "Normal", urgent: "Acil", critical: "Kritik",
};

const SEVERITY_COLOR: Record<string, string> = {
  normal:    "bg-muted text-muted-foreground",
  important: "bg-orange-100 text-orange-700",
  critical:  "bg-red-100 text-red-700",
};

const SEVERITY_LABEL: Record<string, string> = {
  normal:    "Normal",
  important: "Önemli",
  critical:  "Kritik",
};

const STAGE_STATUS_COLOR: Record<string, string> = {
  planned:     "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-700",
  completed:   "bg-emerald-100 text-emerald-700",
  cancelled:   "bg-red-50 text-red-500",
};

const STAGE_STATUS_LABEL: Record<string, string> = {
  planned:     "Planlandı",
  in_progress: "Devam Ediyor",
  completed:   "Tamamlandı",
  cancelled:   "İptal Edildi",
};

const STAGE_STATUS_OPTS = [
  { value: "planned",     label: "Planlandı"     },
  { value: "in_progress", label: "Devam Ediyor"  },
  { value: "completed",   label: "Tamamlandı"    },
  { value: "cancelled",   label: "İptal Edildi"  },
];

const STAGE_PHOTO_TYPE: Record<number, string> = {
  1: "before",
  2: "after",
  3: "issue",
  4: "completion",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  // Sunucu UTC'dir ama saat dilimi eki olmadan gelir; ek yoksa yerel saat sanılıp 3 saat kayıyordu.
  const utc = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`;
  return new Date(utc).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function computedStatus(stages: Stage[]): { label: string; cls: string } {
  if (!stages.length) return { label: "Açık", cls: "bg-muted text-muted-foreground" };
  const statuses = stages.map(s => s.status);
  if (statuses[statuses.length - 1] === "completed") return { label: "Tamamlandı", cls: "bg-emerald-100 text-emerald-700" };
  if (statuses.every(s => s === "cancelled")) return { label: "İptal Edildi", cls: "bg-red-50 text-red-600" };
  if (statuses.some(s => s === "in_progress")) return { label: "Devam Ediyor", cls: "bg-amber-100 text-amber-700" };
  if (statuses.some(s => s === "completed")) return { label: "Devam Ediyor", cls: "bg-amber-100 text-amber-700" };
  return { label: "Açık", cls: "bg-muted text-muted-foreground" };
}

function workOrderStatusLabel(status: string) {
  if (["draft", "sent", "approval_pending"].includes(status)) return "Planlanacak";
  if (["started", "material_waiting", "revisit"].includes(status)) return "Devam Ediyor";
  if (["completed", "approved"].includes(status)) return "Tamamlandı";
  if (["cancelled", "failed"].includes(status)) return "İptal Edildi";
  return status;
}

// ── Lightbox ───────────────────────────────────────────────────────────────────

function Lightbox({ urls, names, index, onClose, onPrev, onNext }: {
  urls: string[]; names: string[]; index: number;
  onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, onPrev, onNext]);

  const url = urls[index];
  if (!url) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X className="h-5 w-5" />
      </button>
      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {/* Güvenli alan: dvh + safe-area üzerinden hesaplanan, header/footer çıkarılmış kullanılabilir alan */}
      <div className="min-h-0 flex-1 flex items-center justify-center px-4 py-14 sm:px-20" onClick={e => e.stopPropagation()}>
        <ZoomableImage src={url} alt={names[index] ?? "foto"} className="rounded-xl shadow-2xl" />
      </div>
      {index < urls.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      <p className="pb-4 text-center text-xs text-white/40">{index + 1} / {urls.length}</p>
    </div>
  );
}

// ── Fotoğraf Çek / Galeriden Seç ─────────────────────────────────────────────────
// capture="environment" mobil tarayıcıda dosya seçiciyi tamamen atlayıp direkt
// kamerayı açar — bu yüzden "çek" ve "galeri" AYRI input'lar olmalı. Galeri
// input'unda capture yok, multiple var; kamera input'unda capture var, tek çekim.

const PHOTO_ACCEPT = "image/jpeg,image/png,image/jpg,image/webp,image/heic,image/heif";

function PhotoPickerButtons({ onFiles, disabled, compact }: {
  onFiles: (files: FileList | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const cameraRef  = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const btnCls = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card font-semibold text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "px-3 py-2 text-xs" : "flex-1 px-4 py-3 text-sm"}`;
  return (
    <div className={compact ? "flex items-center gap-2" : "flex gap-2"}>
      <button type="button" disabled={disabled} onClick={() => cameraRef.current?.click()} className={btnCls}>
        <Camera className="h-3.5 w-3.5" /> Fotoğraf Çek
      </button>
      <button type="button" disabled={disabled} onClick={() => galleryRef.current?.click()} className={btnCls}>
        <ImageIcon className="h-3.5 w-3.5" /> Galeriden Seç
      </button>
      <input
        ref={cameraRef} type="file" accept={PHOTO_ACCEPT} capture="environment" className="hidden"
        onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }}
      />
      <input
        ref={galleryRef} type="file" accept={PHOTO_ACCEPT} multiple className="hidden"
        onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }}
      />
    </div>
  );
}

// ── Rapor Oluştur Modal ────────────────────────────────────────────────────────

function CreateReportModal({ woId, onClose, onDone }: {
  woId: string; onClose: () => void; onDone: () => void;
}) {
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [severity,    setSeverity]    = useState("normal");
  const [files,       setFiles]       = useState<File[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [err,         setErr]         = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const allowed = Array.from(incoming).filter(f =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );
    setFiles(prev => [...prev, ...allowed]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setErr("Rapor başlığı zorunludur."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("description", description.trim());
      fd.append("severity", severity);
      files.forEach(f => fd.append("files", f));

      setUploadProgress(0);
      await uploadFormData(`/work-orders/${woId}/reports`, {
        formData: fd,
        onProgress: setUploadProgress,
      });
      onDone();
    } catch (ex: unknown) {
      setErr((ex as Error).message ?? "Rapor kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-card shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-foreground">Rapor Oluştur<InfoHint text="İş ilerlemesi, sorun veya not ekleyin" /></h2>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Başlık */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Rapor Başlığı *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              placeholder="Ör: Kompresör değiştirildi"
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Açıklama / Not</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Detaylı açıklama, sorun tespiti, yapılan işlemler..."
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none resize-none"
            />
          </div>

          {/* Önem Derecesi */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Önem Derecesi</label>
            <div className="flex gap-2">
              {[
                { value: "normal",    label: "Normal",  cls: "border-border text-muted-foreground" },
                { value: "important", label: "Önemli",  cls: "border-orange-200 text-orange-600" },
                { value: "critical",  label: "Kritik",  cls: "border-red-200 text-red-600" },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSeverity(opt.value)}
                  className={`flex-1 rounded-xl border-2 py-2.5 text-xs font-semibold transition-all ${
                    severity === opt.value
                      ? opt.value === "normal"    ? "border-slate-500 bg-muted/50 text-foreground"
                        : opt.value === "important" ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-red-500 bg-red-50 text-red-700"
                      : `${opt.cls} bg-card hover:bg-accent`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Görsel Yükleme */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Görsel / Dosya Yükleme</label>
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="mb-2 rounded-xl border-2 border-dashed border-border bg-muted/50 px-4 py-3 text-center"
            >
              <p className="text-[11px] text-muted-foreground">Görselleri buraya sürükleyip bırakabilir veya aşağıdan seçebilirsiniz — JPG · PNG · HEIC</p>
            </div>
            <PhotoPickerButtons onFiles={addFiles} />
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-1.5 text-[11px] font-medium text-primary hover:underline">
              veya PDF dosyası ekle
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="application/pdf"
              className="hidden"
              onChange={e => addFiles(e.target.files)}
            />
            {files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-3 py-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-xs text-foreground truncate">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-red-500 shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{err}</p>
            </div>
          )}
          {uploadProgress !== null && (
            <div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} /></div><p className="mt-1 text-right text-xs text-muted-foreground">%{uploadProgress}</p></div>
          )}
        </div>

        <div className="flex shrink-0 justify-between gap-3 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
          <button onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
            Vazgeç
          </button>
          <button onClick={handleSubmit} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Aşama Güncelle Modal ───────────────────────────────────────────────────────

function StageUpdateModal({ stage, woId, hasCompletionPhoto, hasServiceForm, onBeforeComplete, onClose, onDone }: {
  stage: Stage; woId: string; hasCompletionPhoto: boolean; hasServiceForm: boolean;
  onBeforeComplete: () => Promise<void>;
  onClose: () => void; onDone: (s: Stage) => void;
}) {
  const [status,      setStatus]      = useState(stage.status);
  const [description, setDescription] = useState(stage.description ?? "");
  const [files,       setFiles]       = useState<File[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [err,         setErr]         = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    const accepted = Array.from(incoming ?? []).filter(file => file.type.startsWith("image/"));
    setFiles(prev => [...prev, ...accepted]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSave = async () => {
    if (stage.stage_order === 4 && status === "completed" && files.length === 0 && !hasCompletionPhoto) {
      setErr("Tamamlandı aşaması için en az bir saha fotoğrafı eklemelisiniz.");
      return;
    }
    const completing = stage.stage_order === 4 && status === "completed";
    if (completing && !hasServiceForm) {
      setErr("Tamamlamadan önce Servis Formu bölümünden servis formunu yükleyin.");
      return;
    }
    setBusy(true); setErr("");
    try {
      // Malzeme listesi tamamlanmadan hemen önce kaydedilir; stok bu liste ile düşer.
      if (completing) await onBeforeComplete();
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      let uploadedBytes = 0;
      for (const file of files) {
        const body = new FormData();
        body.append("photo_type", STAGE_PHOTO_TYPE[stage.stage_order] ?? "issue");
        body.append("file", file);
        await uploadFormData(`/work-orders/${woId}/photos`, {
          formData: body,
          onProgress: (percent) => setUploadProgress(totalBytes ? Math.round(((uploadedBytes + file.size * percent / 100) / totalBytes) * 100) : 100),
        });
        uploadedBytes += file.size;
      }
      const updated = await apiPatch<Stage>(
        `/work-orders/${woId}/stages/${stage.id}`,
        { status, description: description.trim() || null },
      );
      onDone(updated);
    } catch (reason) {
      setErr(getRequestErrorMessage(reason, "Aşama güncellenemedi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-card shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">{stage.stage_name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Aşama {stage.stage_order} / 4</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Durum</label>
            <div className="grid grid-cols-2 gap-2">
              {STAGE_STATUS_OPTS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`rounded-xl border-2 py-2.5 text-xs font-semibold transition-all ${
                    status === opt.value
                      ? opt.value === "completed"   ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : opt.value === "in_progress" ? "border-amber-500 bg-amber-50 text-amber-700"
                        : opt.value === "cancelled"   ? "border-red-400 bg-red-50 text-red-600"
                        : "border-slate-500 bg-muted/50 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Açıklama (İsteğe Bağlı)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Bu aşamada yapılan işlemler veya notlar..."
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none resize-none"
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-xs font-medium text-muted-foreground">
                {stage.stage_order === 4 ? "Tamamlama Fotoğrafı" : "Aşama Fotoğrafı (İsteğe Bağlı)"}
                {stage.stage_order === 4 && status === "completed" && <span className="text-red-500"> *</span>}
              </label>
              {stage.stage_order === 4 && hasCompletionPhoto && (
                <span className="text-[10px] font-medium text-emerald-600">Mevcut fotoğraf var</span>
              )}
            </div>
            <PhotoPickerButtons onFiles={addFiles} />
            {files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs text-foreground">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                      className="text-muted-foreground hover:text-red-500"
                      aria-label={`${file.name} dosyasını kaldır`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-muted-foreground">Yüklenen görseller Saha Fotoğrafları bölümünde görünür.</p>
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
          {uploadProgress !== null && <div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} /></div><p className="mt-1 text-right text-xs text-muted-foreground">%{uploadProgress}</p></div>}
        </div>
        <div className="flex shrink-0 justify-between gap-3 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
          <button onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
            Vazgeç
          </button>
          <button onClick={handleSave} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fotoğraf Aktarım Modal ─────────────────────────────────────────────────────

const VI_CATEGORIES = [
  { value: "klima",        label: "Klima"            },
  { value: "yangin",       label: "Yangın Sistemi"   },
  { value: "havalandirma", label: "Havalandırma"     },
  { value: "elektrik",     label: "Elektrik/Pano"    },
  { value: "genel",        label: "Genel Teknik Alan"},
  { value: "ariza",        label: "Arıza Görseli"    },
  { value: "saha_gorseli", label: "Saha Görseli"     },
  { value: "diger",        label: "Diğer"            },
];

function TransferModal({ woId, photoIds, reportPhotoIds, onClose, onDone }: {
  woId: string; photoIds: string[]; reportPhotoIds: string[]; onClose: () => void; onDone: () => void;
}) {
  const [category, setCategory] = useState("saha_gorseli");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  const handleTransfer = async () => {
    setBusy(true); setErr("");
    try {
      await apiPost(`/work-orders/${woId}/add-photos-to-inventory`, {
        photo_ids: photoIds,
        report_photo_ids: reportPhotoIds,
        category,
      });
      onDone();
    } catch {
      setErr("Aktarım başarısız.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-card shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Mağaza Kartına Ekle</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{photoIds.length + reportPhotoIds.length} fotoğraf seçildi</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Görsel Kategorisi</label>
            <div className="relative">
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none pr-8">
                {VI_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{err}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
              Vazgeç
            </button>
            <button onClick={handleTransfer} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
              Ekle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ana Sayfa ──────────────────────────────────────────────────────────────────

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const isManager = pathname.startsWith("/manager/");
  const isUser = pathname.startsWith("/user/");
  const backHref = isManager ? "/manager/is-emirleri" : isUser ? "/user/islerim" : "/is-emirleri";
  const storeBase = isManager ? "/manager/magaza-karti" : isUser ? "/user/magaza-karti" : "/projects";

  const [wo,           setWo]           = useState<WorkOrder | null>(null);
  const [photos,       setPhotos]       = useState<WOPhoto[]>([]);
  const [reports,      setReports]      = useState<Report[]>([]);
  const [stages,       setStages]       = useState<Stage[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<"reports" | "stages" | "photos">("stages");
  const [uploadQueue,  setUploadQueue]  = useState<UploadItem[]>([]);
  const uploading = uploadQueue.some(item => item.status === "pending" || item.status === "uploading");
  const [photoType,    setPhotoType]    = useState("completion");

  const [reportModal,  setReportModal]  = useState(false);
  const [stageModal,   setStageModal]   = useState<Stage | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [lightbox,     setLightbox]     = useState<{ urls: string[]; names: string[]; idx: number } | null>(null);
  const [successMsg,   setSuccessMsg]   = useState("");
  const [errorMsg,     setErrorMsg]     = useState("");

  const showSuccess = (msg: string) => {
    setErrorMsg("");
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const showError = (msg: string) => {
    setSuccessMsg("");
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 5000);
  };

  const loadReports = useCallback(async () => {
    if (!id) return;
    const d = await apiGet<Report[]>(`/work-orders/${id}/reports`).catch(() => []);
    setReports(Array.isArray(d) ? d : []);
  }, [id]);

  const loadStages = useCallback(async () => {
    if (!id) return;
    const d = await apiGet<Stage[]>(`/work-orders/${id}/stages`).catch(() => []);
    setStages(Array.isArray(d) ? d : []);
  }, [id]);

  const loadPhotos = useCallback(async () => {
    if (!id) return;
    const d = await apiGet<WOPhoto[]>(`/work-orders/${id}/photos`).catch(() => []);
    setPhotos(Array.isArray(d) ? d : []);
  }, [id]);

  const loadWorkOrder = useCallback(async () => {
    if (!id) return;
    const data = await apiGet<WorkOrder>(`/work-orders/${id}`);
    setWo(data);
  }, [id]);

  // Servis formu + kullanılan malzemeler (stok iş tamamlanınca cep depodan düşer).
  const completion = useWorkOrderCompletion(id, wo?.stock_depot_id);
  const { reload: reloadCompletion } = completion;
  useEffect(() => {
    if (wo) void reloadCompletion();
  }, [wo?.id, wo?.status, wo?.stock_depot_id, reloadCompletion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiGet<WorkOrder>(`/work-orders/${id}`),
      apiGet<Report[]>(`/work-orders/${id}/reports`),
      apiGet<Stage[]>(`/work-orders/${id}/stages`),
      apiGet<WOPhoto[]>(`/work-orders/${id}/photos`),
    ]).then(([woData, repData, stgData, phData]) => {
      setWo(woData ?? null);
      setReports(Array.isArray(repData) ? repData : []);
      setStages(Array.isArray(stgData) ? stgData : []);
      setPhotos(Array.isArray(phData) ? phData : []);
    }).catch(() => {
      setWo(null);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm("Bu raporu silmek istediğinize emin misiniz?")) return;
    try {
      await apiDelete(`/work-orders/${id}/reports/${reportId}`);
      setReports(prev => prev.filter(r => r.id !== reportId));
      showSuccess("Rapor silindi.");
    } catch { /* ignore */ }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Bu saha görselini kalıcı olarak silmek istediğinize emin misiniz?")) return;
    try {
      await apiDelete(`/work-orders/${id}/photos/${photoId}`);
      setPhotos(prev => prev.filter(photo => photo.id !== photoId));
      setSelected(prev => {
        const next = new Set(prev);
        next.delete(`work:${photoId}`);
        return next;
      });
      showSuccess("Saha görseli silindi.");
    } catch {
      showError("Görsel silinemedi. Mağaza kartına eklenmiş görseller önce envanterden kaldırılmalıdır.");
    }
  };

  const handleStageUpdate = (updated: Stage) => {
    setStages(prev => updated.stage_order === 4 && updated.status === "completed"
      ? prev.map(stage => ({ ...stage, status: "completed", updated_at: updated.updated_at, updated_by_name: updated.updated_by_name }))
      : prev.map(stage => stage.id === updated.id ? updated : stage));
    setStageModal(null);
    void Promise.all([loadStages(), loadPhotos(), loadWorkOrder()]);
    showSuccess("Aşama güncellendi.");
  };

  const [starting, setStarting] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleStart = async () => {
    if (!wo || starting) return;
    setStarting(true);
    try {
      const updated = await apiPatch<WorkOrder>(`/work-orders/${wo.id}`, { status: "started" });
      setWo(updated);
      await loadStages();
      showSuccess("Süreç başladı.");
    } catch {
      showError("İş süreci başlatılamadı.");
    } finally {
      setStarting(false);
      setStartConfirmOpen(false);
    }
  };

  const handleCancel = async () => {
    if (!wo || cancelling) return;
    setCancelling(true);
    try {
      await apiPatch(`/work-orders/${wo.id}`, { status: "cancelled" });
      await loadWorkOrder();
      showSuccess("İş emri iptal edildi. Stoktan malzeme düşülmedi.");
    } catch (reason) {
      showError(getRequestErrorMessage(reason, "İş emri iptal edilemedi."));
    } finally {
      setCancelling(false);
      setCancelConfirmOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!wo || deleting) return;
    setDeleting(true);
    try {
      await apiDelete(`/work-orders/${wo.id}`);
      router.push(backHref);
    } catch (reason) {
      showError(getRequestErrorMessage(reason, "İş emri silinemedi."));
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  // Aynı anda en fazla 3 dosya yüklenir — 6+ fotoğraf seçildiğinde tarayıcıyı/
  // sunucuyu boğmadan, geri kalanı sırada bekler. Her dosyanın kendi gerçek
  // (byte bazlı) progress'i ve başarısız olursa ayrı "Tekrar Dene"si var.
  const UPLOAD_CONCURRENCY = 3;

  const runUpload = useCallback(async (item: UploadItem) => {
    if (!wo) return;
    setUploadQueue(q => q.map(x => x.id === item.id ? { ...x, status: "uploading", progress: 0, error: undefined } : x));
    try {
      const body = new FormData();
      body.append("photo_type", photoType);
      body.append("file", item.file);
      await uploadFormData(`/work-orders/${wo.id}/photos`, {
        formData: body,
        onProgress: (percent) => setUploadQueue(q => q.map(x => x.id === item.id ? { ...x, progress: percent } : x)),
      });
      setUploadQueue(q => q.map(x => x.id === item.id ? { ...x, status: "done", progress: 100 } : x));
      await loadPhotos();
    } catch (ex) {
      setUploadQueue(q => q.map(x => x.id === item.id ? { ...x, status: "error", error: (ex as Error).message ?? "Yüklenemedi" } : x));
    }
  }, [wo, photoType]);

  const handlePhotoUpload = (files: FileList | null) => {
    if (!wo || !files?.length) return;
    const items: UploadItem[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file, status: "pending", progress: 0,
    }));
    setUploadQueue(q => [...q, ...items]);

    // Basit eşzamanlılık havuzu: 3 worker, kuyruktan sırayla çeker.
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await runUpload(item);
      }
    };
    Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, worker)).then(() => {
      showSuccess("Fotoğraflar iş emrine eklendi.");
    });
  };

  const retryUpload = (id: string) => {
    const item = uploadQueue.find(x => x.id === id);
    if (item) runUpload({ ...item, status: "pending", progress: 0, error: undefined });
  };

  const dismissUploadItem = (id: string) => setUploadQueue(q => q.filter(x => x.id !== id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ClipboardList className="h-10 w-10 text-slate-200" />
        <p className="text-sm text-muted-foreground">İş emri bulunamadı.</p>
        <Link href={backHref} className="text-sm text-primary hover:underline">İş Emirlerine Dön</Link>
      </div>
    );
  }

  const computedSt = computedStatus(stages);
  const statusCls = STATUS_COLOR[wo.status] ?? "bg-muted text-muted-foreground";
  const photoSourceLabel: Record<string, string> = {
    before: "Hazırlık", after: "Uygulama / İmalat",
    issue: "Kontrol / Test", completion: "Tamamlandı",
  };
  const allPhotoItems = photos.map((photo) => ({
      key: `work:${photo.id}`, id: photo.id, kind: "work" as const,
      name: photo.file_name, url: photo.fresh_url, mime: photo.mime_type,
      uploadedBy: photo.uploaded_by_name, uploadedAt: photo.uploaded_at,
      isAdded: photo.is_added_to_inventory,
      source: photoSourceLabel[photo.photo_type] ?? "İş Emri",
    }));
  const eligiblePhotos = allPhotoItems.filter((photo) => !photo.isAdded && photo.mime?.startsWith("image/"));
  // Resim görüntüleyici yalnızca resimleri gezer; PDF/DWG ekleri dosya olarak açılır.
  const imageItems = allPhotoItems.filter((photo) => photo.mime?.startsWith("image/"));
  const hasCriticalReport = reports.some(r => r.severity === "critical");

  // ── Raporlar Sekmesi ──────────────────────────────────────────────────────────

  // Kapanmış iş emrine rapor eklenmez; oluşturulan raporu yalnız yönetici siler (27.11.2026).
  const reportsClosed = ["completed", "approved", "cancelled", "failed"].includes(wo?.status ?? "");

  const ReportsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">İş Raporları</p>
          <p className="text-xs text-muted-foreground mt-0.5">Her aşamada oluşturulan rapor kayıtları</p>
        </div>
        {isUser && !reportsClosed && (
          <button
            onClick={() => setReportModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Rapor Oluştur
          </button>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border border-dashed border-border">
          <FileText className="h-10 w-10 text-slate-200" />
          <p className="text-sm text-muted-foreground">Henüz rapor oluşturulmamış.</p>
          {isUser && !reportsClosed && <button onClick={() => setReportModal(true)}
            className="text-xs text-primary border border-primary/20 rounded-lg px-3 py-1.5 hover:bg-primary/5">
            İlk Raporu Oluştur
          </button>}
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(rep => {
            const addablePhotos = rep.photos.filter(p => p.mime_type?.startsWith("image/") && !p.is_added_to_inventory);
            const addedPhotoCount = rep.photos.filter(p => p.mime_type?.startsWith("image/") && p.is_added_to_inventory).length;
            return (
            <div key={rep.id} className="rounded-xl border border-border bg-card p-4">
              {/* Üst satır — rozet solda, kişi & tarih sağ üstte */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_COLOR[rep.severity] ?? "bg-muted text-muted-foreground"}`}>
                    {rep.severity === "critical" && <AlertTriangle className="h-3 w-3 mr-1" />}
                    {SEVERITY_LABEL[rep.severity] ?? rep.severity}
                  </span>
                  {rep.photo_count > 0 && (
                    <span className="text-[11px] text-muted-foreground">{rep.photo_count} görsel</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-start gap-1.5">
                    <div className="text-right leading-tight">
                      {rep.created_by_name && (
                        <p className="flex items-center justify-end gap-1 text-[11px] font-medium text-muted-foreground">
                          <User className="h-3 w-3 text-muted-foreground" /> {rep.created_by_name}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">{fmtDateTime(rep.created_at)}</p>
                    </div>
                    {isManager && <button
                      onClick={() => handleDeleteReport(rep.id)}
                      className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 hover:bg-red-50 hover:text-red-500"
                      aria-label="Raporu sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>}
                  </div>
                  {isManager && addablePhotos.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => { setSelected(new Set(addablePhotos.map(p => `report:${p.id}`))); setTransferOpen(true); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-blue-300 hover:bg-primary/5 hover:text-primary"
                    >
                      <Store className="h-3 w-3" /> Mağaza kartına ekle
                    </button>
                  ) : isManager && addedPhotoCount > 0 ? (
                    <p className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Mağaza kartına eklendi
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="mt-2 text-sm font-semibold text-foreground">{rep.title}</p>
              {rep.description && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-3">{rep.description}</p>
              )}

              {/* Görsel önizlemeler */}
              {rep.photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {rep.photos.map((rp, idx) => (
                      <div key={rp.id} className="relative h-16 w-16 shrink-0">
                        <button
                          type="button"
                          onClick={() => setLightbox({
                            urls: rep.photos.map(p => p.fresh_url ?? ""),
                            names: rep.photos.map(p => p.file_name ?? ""),
                            idx,
                          })}
                          className="h-16 w-16 overflow-hidden rounded-lg border border-border transition-colors hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {rp.fresh_url && rp.mime_type?.startsWith("image/") ? (
                            <img src={rp.fresh_url} alt={rp.file_name ?? "Rapor görseli"} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted">
                              <FileText className="h-5 w-5 text-muted-foreground/60" />
                            </div>
                          )}
                        </button>
                        {isManager && rp.mime_type?.startsWith("image/") && rp.is_added_to_inventory && (
                          <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white" title="Mağaza kartında">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Aşamalar Sekmesi ──────────────────────────────────────────────────────────

  const StagesTab = () => {
    const completed = stages.filter(s => s.status === "completed").length;
    const finalStageCompleted = stages.some(stage => stage.stage_order === 4 && stage.status === "completed");
    const progressPct = finalStageCompleted ? 100 : stages.length > 0 ? Math.round((completed / stages.length) * 100) : 0;
    const notStartedYet = ["planned", "draft", "sent", "approval_pending"].includes(wo!.status);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">4 Aşamalı Takip Çizelgesi</p>
            <p className="text-xs text-muted-foreground mt-0.5">Her aşamayı güncelleyerek iş ilerlemesini kaydedin</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-foreground">{progressPct}%</p>
            <p className="text-[10px] text-muted-foreground">Tamamlandı</p>
          </div>
        </div>

        {notStartedYet && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium text-amber-800">Süreç başladığında aşamalar aktif olacaktır.</p>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Aşama kartları */}
        <div className="space-y-3">
          {stages.map((stage, idx) => {
            const statusCls = STAGE_STATUS_COLOR[stage.status] ?? "bg-muted text-muted-foreground";
            const isCompleted = stage.status === "completed";
            const isActive    = stage.status === "in_progress";

            return (
              <div key={stage.id} className="space-y-3">
              {stage.stage_order === 4 && (
                <CompletionPanel
                  c={completion}
                  closed={["completed", "approved", "cancelled", "failed"].includes(wo!.status)}
                  depotLabel={completion.lines[0]?.depot_plate ?? undefined}
                />
              )}
              <div className={`rounded-xl border-2 p-4 transition-colors ${
                isActive    ? "border-amber-200 bg-amber-50/30"
                : isCompleted ? "border-emerald-200 bg-emerald-50/20"
                : "border-border bg-card"
              }`}>
                <div className="flex items-start gap-3">
                  {/* Step number */}
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isCompleted ? "bg-emerald-500 text-white"
                    : isActive  ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{stage.stage_name}</p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusCls}`}>
                        {STAGE_STATUS_LABEL[stage.status] ?? stage.status}
                      </span>
                    </div>

                    {stage.description && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{stage.description}</p>
                    )}

                    {stage.updated_at && (
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                        {stage.updated_by_name && <span>{stage.updated_by_name}</span>}
                        <span>·</span>
                        <span>{fmtDateTime(stage.updated_at)}</span>
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <button
                      onClick={() => setStageModal(stage)}
                      disabled={notStartedYet}
                      title={notStartedYet ? "Önce süreci başlatmalısınız" : undefined}
                      className="shrink-0 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent active:scale-95 transition-transform disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card"
                    >
                      Güncelle
                    </button>
                  )}
                </div>
              </div>
              </div>
            );
          })}
        </div>

        {/* Hesaplanan durum */}
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Hesaplanan Genel Durum:</p>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${computedSt.cls}`}>
            {computedSt.label}
          </span>
        </div>
      </div>
    );
  };

  // ── Fotoğraflar Sekmesi ───────────────────────────────────────────────────────

  const PhotosTab = () => {
    const allEligibleSelected = eligiblePhotos.length > 0 && eligiblePhotos.every((photo) => selected.has(photo.key));

    const toggleAll = () => {
      if (allEligibleSelected) setSelected(new Set());
      else setSelected(new Set(eligiblePhotos.map((photo) => photo.key)));
    };
    const toggleOne = (pid: string) => setSelected(prev => {
      const n = new Set(prev);
      n.has(pid) ? n.delete(pid) : n.add(pid);
      return n;
    });

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Camera className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-semibold text-foreground">Saha Fotoğrafları</p>
            <CountBadge count={allPhotoItems.length} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isManager && eligiblePhotos.length > 0 && (
              <button onClick={toggleAll}
                className="whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                {allEligibleSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
              </button>
            )}
            {isManager && selected.size > 0 && (
              <button onClick={() => setTransferOpen(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary/90">
                <Store className="h-3.5 w-3.5" /> {selected.size} Fotoğrafı Ekle
              </button>
            )}
          </div>
        </div>
        {isUser && (
          <div className="space-y-2 rounded-xl border border-border bg-slate-50/60 p-3">
            <select
              value={photoType}
              onChange={(event) => setPhotoType(event.target.value)}
              className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground sm:w-auto"
            >
              <option value="before">Hazırlık</option>
              <option value="after">Uygulama / İmalat</option>
              <option value="issue">Kontrol / Test</option>
              <option value="completion">Tamamlandı</option>
            </select>
            <PhotoPickerButtons onFiles={handlePhotoUpload} disabled={uploading} />
          </div>
        )}
        {uploadQueue.length > 0 && (
          <div className="space-y-2 rounded-xl border border-border bg-slate-50/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                {uploadQueue.filter(i => i.status === "done").length} / {uploadQueue.length} yüklendi
              </p>
              {uploadQueue.every(i => i.status === "done" || i.status === "error") && (
                <button type="button" onClick={() => setUploadQueue([])} className="text-[11px] text-muted-foreground hover:text-muted-foreground">
                  Listeyi temizle
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {uploadQueue.map(item => (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate text-muted-foreground sm:w-40" title={item.file.name}>{item.file.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-[width] ${item.status === "error" ? "bg-red-500" : item.status === "done" ? "bg-emerald-500" : "bg-primary"}`}
                      style={{ width: `${item.status === "done" ? 100 : item.progress}%` }}
                    />
                  </div>
                  {item.status === "pending" && <span className="w-16 shrink-0 text-muted-foreground">Bekliyor</span>}
                  {item.status === "uploading" && <span className="w-16 shrink-0 text-primary">%{item.progress}</span>}
                  {item.status === "done" && <span className="flex w-16 shrink-0 items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Yüklendi</span>}
                  {item.status === "error" && (
                    <button type="button" onClick={() => retryUpload(item.id)} className="w-16 shrink-0 font-semibold text-red-600 hover:underline">
                      Tekrar Dene
                    </button>
                  )}
                  <button type="button" onClick={() => dismissUploadItem(item.id)} className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {allPhotoItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <Camera className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-muted-foreground">Bu iş emrinde fotoğraf bulunmuyor.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {allPhotoItems.map((photo, idx) => {
              const isChecked  = selected.has(photo.key);
              const isEligible = !photo.isAdded && photo.mime?.startsWith("image/");
              return (
                <div key={photo.key} className="relative group">
                  {isManager && isEligible && (
                    <button
                      onClick={() => toggleOne(photo.key)}
                      className={`absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 shadow-sm transition-colors ${
                        isChecked ? "bg-primary border-primary" : "bg-white/80 border-border hover:border-blue-400"
                      }`}
                    >
                      {isChecked && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                    </button>
                  )}
                  {photo.isAdded && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5">
                      <CheckCircle2 className="h-3 w-3 text-white" />
                      <span className="text-[10px] font-semibold text-white">Eklendi</span>
                    </div>
                  )}
                  {!photo.isAdded && (isUser || isManager) && (
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-muted-foreground shadow-sm hover:bg-red-50 hover:text-red-600"
                      aria-label={`${photo.name ?? "Saha görseli"} sil`}
                      title="Sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {photo.mime?.startsWith("image/") ? (
                    <button
                      onClick={() => setLightbox({
                        urls: imageItems.map((item) => item.url ?? ""),
                        names: imageItems.map((item) => item.name ?? ""),
                        idx: imageItems.indexOf(photo),
                      })}
                      className={`w-full aspect-square overflow-hidden rounded-xl border transition-all ${
                        isChecked ? "border-primary ring-2 ring-blue-400" : "border-border hover:border-border"
                      }`}
                    >
                      {photo.url ? (
                        <img src={photo.url} alt={photo.name ?? "İş emri fotoğrafı"} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
                        </div>
                      )}
                    </button>
                  ) : (
                    // PDF / DWG eki: resim değil, dosya. Tıklanınca yeni sekmede açılır
                    // (PDF görüntülenir, DWG iner). Eskiden boş resim kutusu olarak
                    // görünüp resim görüntüleyicide bozuk açılıyordu.
                    <a
                      href={photo.url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${photo.name ?? "Dosya"} dosyasını aç`}
                      className="flex w-full aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-muted/50 px-2 text-center transition-all hover:border-border hover:bg-accent"
                    >
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground ring-1 ring-slate-200">
                        {(photo.name?.split(".").pop() ?? "DOSYA").toUpperCase().slice(0, 5)}
                      </span>
                      <span className="text-[10px] font-medium text-primary">Aç / İndir</span>
                    </a>
                  )}
                  <div className="mt-1.5 px-0.5">
                    <p className="text-[10px] font-medium text-muted-foreground">{photo.source}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{photo.name ?? "Dosya"}</p>
                    <p className="text-[10px] text-muted-foreground">{photo.uploadedBy ?? "Saha"} | {fmtDate(photo.uploadedAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const TABS = [
    { key: "stages"  as const, label: "Aşamalar", shortLabel: "Aşamalar", count: null,
      icon: <Zap className="h-4 w-4" /> },
    { key: "reports" as const, label: "Raporlar", shortLabel: "Raporlar", count: reports.length,
      icon: <FileText className="h-4 w-4" />,
      badge: hasCriticalReport ? "critical" : undefined },
    { key: "photos"  as const, label: "Saha Fotoğrafları", shortLabel: "Fotoğraflar", count: allPhotoItems.length,
      icon: <Camera className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BackLink fallbackHref={backHref} fallbackLabel="İş Emirleri" className="flex items-center gap-1 hover:text-foreground" />
        <span>/</span>
        <span className="text-foreground font-medium truncate max-w-xs">{wo.title}</span>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-800">{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm font-medium text-red-800">{errorMsg}</p>
        </div>
      )}

      {/* Üst Özet Kartı */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${statusCls}`}>
                {workOrderStatusLabel(wo.status)}
              </span>
              <span className="text-[11px] font-medium border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                {wo.work_type_label}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[wo.priority]}`}>
                {PRIORITY_LABEL[wo.priority] ?? wo.priority}
              </span>
              {hasCriticalReport && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                  <AlertTriangle className="h-3 w-3" /> Kritik Rapor
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-foreground leading-tight">{wo.title}</h1>
            {wo.description && (
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{wo.description}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {(isManager || isUser) && (
              <Link
                href={`${storeBase}/${wo.project_id}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
              >
                <Store className="h-3.5 w-3.5" /> Mağaza Kartı
              </Link>
            )}
            {isUser && ["planned", "draft", "sent", "approval_pending"].includes(wo.status) && (
              <button
                onClick={() => setStartConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90"
              >
                <Zap className="h-3.5 w-3.5" /> Süreci Başlat
              </button>
            )}
            {isManager && !["completed", "approved", "cancelled", "failed"].includes(wo.status) && (
              <button
                onClick={() => setCancelConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50"
              >
                <X className="h-3.5 w-3.5" /> İş Emrini İptal Et
              </button>
            )}
            {isManager && (
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> İş Emrini Sil
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Mağaza</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{wo.project_name ?? "Belirtilmedi"}</p>
            {wo.project_no && <p className="text-[11px] text-muted-foreground font-mono">{wo.project_no}</p>}
            {(wo.project_city || wo.project_region) && <p className="text-[11px] text-muted-foreground">{[wo.project_region, wo.project_city].filter(Boolean).join(" / ")}</p>}
            {isManager ? (
              <ProjectLinkControl wo={wo} canManage projectHref={(projectId) => `/manager/projeler/${projectId}`} onChanged={loadWorkOrder} />
            ) : wo.installation_project_name && <p className="mt-1 inline-flex rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800">Proje: {wo.installation_project_name}</p>}
          </div>
          {wo.assigned_to_name && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Atanan</p>
              <p className="text-sm text-foreground mt-0.5 flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {wo.assigned_to_name}
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Verilme Tarihi</p>
            <p className="text-sm text-foreground mt-0.5">{formatServerDateTime(wo.created_at)}</p>
            {wo.created_by_name && <p className="text-[11px] text-muted-foreground truncate">{wo.created_by_name}</p>}
          </div>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Termin</p>
            <p className="text-sm text-foreground mt-0.5">{fmtDate(wo.due_date)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Genel Durum</p>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold mt-0.5 ${computedSt.cls}`}>
              {computedSt.label}
            </span>
          </div>
          {wo.started_at ? (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Süreci Başlattı</p>
              <p className="text-sm text-foreground mt-0.5 truncate">{wo.assigned_to_name ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground">{fmtDateTime(wo.started_at)}</p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Son Güncelleme</p>
              <p className="mt-0.5 text-sm text-foreground">{fmtDateTime(wo.updated_at ?? wo.created_at)}</p>
            </div>
          )}
          {/* Taşeron (yalnız yönetici): iş yükü ve puan taşeron kartında görünür; puan iş tamamlanınca verilir. */}
          {isManager && (
            <SubcontractorAssignmentBox target={{ work_order_id: wo.id }} doneHint={wo.status}
              editable={wo.status !== "cancelled"} className="col-span-2" />
          )}
        </div>
      </div>

      {/* Stoktan düşülen malzemeler (yönetici özeti) */}
      {completion.lines.some(line => line.status === "issued") && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-foreground">Stoktan Düşülen Malzemeler</h2>
            </div>
            <span className="rounded-full border border-emerald-200 bg-card px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              {completion.lines[0]?.depot_plate} · {completion.lines[0]?.depot_name}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-emerald-100">
            {completion.lines.filter(line => line.status === "issued").map(line => (
              <li key={line.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground"><MaterialTitle sku={line.sku} name={line.name} spec={line.spec} /></p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">{Number(line.quantity).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} {line.unit}</p>
                  <p className="text-[11px] font-medium text-emerald-700">Düşüldü · {formatCompletionTime(line.issued_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {startConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-2xl">
            <p className="text-sm font-semibold text-foreground">Bu işi teslim alıp süreci başlatmak istiyor musunuz?</p>
            <p className="mt-1.5 text-xs text-muted-foreground">Süreç başladıktan sonra aşamaları güncelleyebilirsiniz. Başlangıç zamanı ve sizin adınız kaydedilir.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStartConfirmOpen(false)}
                disabled={starting}
                className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {starting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Süreci Başlat
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-2xl">
            <p className="text-sm font-semibold text-foreground">Bu iş emrini iptal etmek istediğinize emin misiniz?</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              İş emri iptal edilir ve kaydı korunur. Malzemeler yalnızca iş tamamlanınca stoktan düşüldüğü için stok etkilenmez.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(false)}
                disabled={cancelling}
                className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                İptal Et
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-2xl">
            <p className="text-sm font-semibold text-foreground">Bu iş emrini silmek istediğinize emin misiniz?</p>
            <p className="mt-1.5 text-xs text-muted-foreground">İş emri, aşamaları, raporları ve fotoğrafları kalıcı olarak silinir. Bu işlem geri alınamaz.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      <Tabs
        items={TABS.map((tab): TabItem<typeof tab.key> => ({
          key: tab.key, label: tab.label, shortLabel: tab.shortLabel,
          icon: tab.icon, count: tab.count, tone: tab.badge === "critical" ? "critical" : "neutral",
        }))}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Sekme İçeriği */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        {/* Sekmeler bileşen olarak değil fonksiyon olarak çağrılır: sayfa içinde tanımlı bir
            bileşen her render'da yeni tür sayılır, alt ağaç sökülüp yeniden kurulur ve
            miktar alanına her tuş basışında odak kaybolup sayfa en üste kayar. */}
        {activeTab === "reports" && ReportsTab()}
        {activeTab === "stages"  && StagesTab()}
        {activeTab === "photos"  && PhotosTab()}
      </div>

      {/* Modaller */}
      {isUser && reportModal && (
        <CreateReportModal
          woId={wo.id}
          onClose={() => setReportModal(false)}
          onDone={() => { setReportModal(false); loadReports(); showSuccess("Rapor kaydedildi."); }}
        />
      )}
      {isUser && stageModal && (
        <StageUpdateModal
          stage={stageModal}
          woId={wo.id}
          hasCompletionPhoto={photos.some(photo => photo.photo_type === "completion")}
          hasServiceForm={completion.hasForm}
          onBeforeComplete={completion.saveMaterials}
          onClose={() => setStageModal(null)}
          onDone={handleStageUpdate}
        />
      )}
      {transferOpen && (
        <TransferModal
          woId={wo.id}
          photoIds={Array.from(selected).filter((key) => key.startsWith("work:")).map((key) => key.slice(5))}
          reportPhotoIds={Array.from(selected).filter((key) => key.startsWith("report:")).map((key) => key.slice(7))}
          onClose={() => { setTransferOpen(false); setSelected(new Set()); }}
          onDone={() => { setTransferOpen(false); setSelected(new Set()); void Promise.all([loadPhotos(), loadReports()]); showSuccess("Fotoğraflar mağaza kartına eklendi."); }}
        />
      )}
      {lightbox && (
        <Lightbox
          urls={lightbox.urls}
          names={lightbox.names}
          index={lightbox.idx}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(prev => prev && prev.idx > 0 ? { ...prev, idx: prev.idx - 1 } : prev)}
          onNext={() => setLightbox(prev => prev && prev.idx < prev.urls.length - 1 ? { ...prev, idx: prev.idx + 1 } : prev)}
        />
      )}
    </div>
  );
}
