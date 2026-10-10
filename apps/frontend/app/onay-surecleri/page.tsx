"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  AlertCircle, CheckCircle2, Clock, Download,
  FolderOpen, Loader2, RefreshCw, XCircle, Send,
  FileCheck, Receipt, FileText, Upload, X,
} from "lucide-react";
import { apiGet, apiPatch, apiPost, buildApiUrl } from "@/lib/api";
import { openFileInNewTab } from "@/lib/download";

type ApprovalRequest = {
  id: string;
  project_id: string;
  process_id?: string;
  project_name?: string;
  project_no?: string;
  approval_type: string;
  payment_type?: string;
  related_payment_id?: string;
  title: string;
  description?: string;
  amount?: number;
  file_url?: string;
  file_name?: string;
  status: string;
  requested_by_name?: string;
  requested_at: string;
  approved_by_name?: string;
  approved_at?: string;
  note?: string;
};

const PAYMENT_TYPE_MODULE_LABELS: Record<string, string> = {
  bakim:      "Bakım Hakkedişi",
  tadilat:    "Tadilat Hakkedişi",
  yeni_yapim: "Yeni Yapım Hakkedişi",
  ara:        "Ara Hakkediş",
  final:      "Final Hakkediş",
};

function buildDetailHref(a: ApprovalRequest): string {
  if (a.approval_type === "hakkediş") {
    if (a.payment_type === "bakim")      return `/bakim/magazalar/${a.project_id}`;
    if (a.payment_type === "tadilat")    return a.process_id ? `/tadilat/surecleri/${a.process_id}` : `/tadilat`;
    if (a.payment_type === "yeni_yapim") return a.process_id ? `/yeni-yapim/surecleri/${a.process_id}` : `/yeni-yapim`;
  }
  return `/projects/${a.project_id}`;
}

function getApprovalLabel(a: ApprovalRequest): string {
  if (a.approval_type === "hakkediş" && a.payment_type) {
    return PAYMENT_TYPE_MODULE_LABELS[a.payment_type] ?? "Hakkediş";
  }
  return APPROVAL_TYPE_LABELS[a.approval_type] ?? a.approval_type;
}

const TABS: { key: string; label: string }[] = [
  { key: "",               label: "Tümü"                },
  { key: "hakkediş",      label: "Hakkediş Onayı"      },
  { key: "fatura",        label: "Fatura Onayı"         },
  { key: "proje",         label: "Proje Onayı"          },
  { key: "teklif",        label: "Teklif Onayı"         },
  { key: "is_tamamlandi", label: "İş Tamamlandı Onayı" },
];

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  "hakkediş":      "Hakkediş",
  "fatura":        "Fatura",
  "proje":         "Proje",
  "teklif":        "Teklif",
  "is_tamamlandi": "İş Tamamlandı",
  "mail":          "Mail Onayı",
};

// İki aşamalı hakkediş akışı — sıralı durum etiketleri
const STATUS_CFG: Record<string, { label: string; icon: typeof CheckCircle2; dot: string; badge: string }> = {
  // ── Hakkediş iki aşamalı akış ──────────────────────────────────────────────
  internal_pending:   { label: "İç Onay Bekliyor",       icon: Clock,        dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700"    },
  internal_approved:  { label: "İç Onay Alındı",         icon: CheckCircle2, dot: "bg-blue-400",    badge: "bg-blue-50 text-blue-700"      },
  migros_pending:     { label: "Migros Onayı Bekleniyor", icon: Send,         dot: "bg-indigo-400",  badge: "bg-indigo-50 text-indigo-700"  },
  migros_approved:    { label: "Migros Onayladı",         icon: FileCheck,    dot: "bg-teal-400",    badge: "bg-teal-50 text-teal-700"      },
  invoice_stage:      { label: "Faturalandırma Aşamasında", icon: FileText,  dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700"},
  invoiced:           { label: "Faturalandırıldı",         icon: Receipt,      dot: "bg-green-400",   badge: "bg-green-50 text-green-700"    },
  revision_requested: { label: "Revizyon İstendi",         icon: AlertCircle,  dot: "bg-purple-400",  badge: "bg-purple-50 text-purple-700"  },
  rejected:           { label: "Reddedildi",               icon: XCircle,      dot: "bg-red-400",     badge: "bg-red-50 text-red-700"        },
  // ── Diğer onay türleri (fatura/proje/teklif) ve geriye dönük kayıtlar ──────
  bekliyor:           { label: "Onay Bekliyor",            icon: Clock,        dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700"    },
  onaylandi:          { label: "Onaylandı",                icon: CheckCircle2, dot: "bg-green-400",   badge: "bg-green-50 text-green-700"    },
  reddedildi:         { label: "Reddedildi",               icon: XCircle,      dot: "bg-red-400",     badge: "bg-red-50 text-red-700"        },
  revizyon:           { label: "Revizyon İstendi",         icon: AlertCircle,  dot: "bg-purple-400",  badge: "bg-purple-50 text-purple-700"  },
  iptal:              { label: "İptal Edildi",             icon: XCircle,      dot: "bg-slate-300",   badge: "bg-slate-100 text-slate-500"   },
  tamamlandi:         { label: "Tamamlandı",               icon: CheckCircle2, dot: "bg-slate-300",   badge: "bg-slate-100 text-slate-600"   },
};

// Hakkediş durumunda "İç Onay Bekliyor" kapsamına giren tüm status değerleri
// (DB migration öncesi kayıtlar için geriye dönük uyumluluk)
const HAK_IC_ONAY_BEKLIYOR = new Set(["internal_pending", "bekliyor"]);

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(amount?: number) {
  if (!amount) return null;
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount);
}

// ── Fatura Yükleme Modalı ─────────────────────────────────────────────────────

type FaturaModalState = {
  approval: ApprovalRequest;
};

function FaturaModal({ state, onClose, onSuccess }: {
  state: FaturaModalState;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { approval: a } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file,        setFile]        = useState<File | null>(null);
  const [dragging,    setDragging]    = useState(false);
  const [amountRaw,   setAmountRaw]   = useState("");   // sayısal değer (noktalı)
  const [invoiceNo,   setInvoiceNo]   = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [uploading,   setUploading]   = useState(false);
  const [error,       setError]       = useState("");

  const fmtAmountDisplay = (raw: string) => {
    const num = parseFloat(raw.replace(",", "."));
    if (isNaN(num)) return raw;
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(num);
  };

  const PAYMENT_TYPE_LABELS: Record<string, string> = {
    bakim: "Bakım Hakkedişi", tadilat: "Tadilat Hakkedişi",
    yeni_yapim: "Yeni Yapım Hakkedişi", ara: "Ara Hakkediş", final: "Final Hakkediş",
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) { setError("Lütfen fatura dosyasını seçin."); return; }
    if (!a.related_payment_id) { setError("Hakkediş kaydı bulunamadı."); return; }
    setUploading(true);
    setError("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const fd = new FormData();
      fd.append("file", file);
      if (amountRaw)   fd.append("amount",       amountRaw.replace(",", "."));
      if (invoiceNo)   fd.append("invoice_no",   invoiceNo);
      if (invoiceDate) fd.append("invoice_date",  invoiceDate);
      if (description) fd.append("description",   description);

      const res = await fetch(buildApiUrl(`/progress-payments/${a.related_payment_id}/invoice`), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `Hata: ${res.status}`);
      }
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız.");
    } finally {
      setUploading(false);
    }
  };

  const fmtBytes = (b: number) => b < 1024 * 1024
    ? `${(b / 1024).toFixed(1)} KB`
    : `${(b / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Başlık */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Hakkedişe Bağlı Fatura Yükle</h2>
            <p className="text-xs text-slate-500 mt-0.5">Sadece Migros onaylı hakkedişler faturalandırılabilir</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Hakkediş bilgileri */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-400">Mağaza</span><p className="font-semibold text-slate-800 mt-0.5">{a.project_name ?? "—"}</p></div>
            <div><span className="text-slate-400">Kod</span><p className="font-semibold text-slate-800 mt-0.5 font-mono">{a.project_no ?? "—"}</p></div>
            <div><span className="text-slate-400">Hakkediş Türü</span><p className="font-semibold text-slate-800 mt-0.5">{a.payment_type ? PAYMENT_TYPE_LABELS[a.payment_type] ?? a.payment_type : "—"}</p></div>
            {a.amount != null && (
              <div><span className="text-slate-400">Hakkediş Tutarı</span><p className="font-semibold text-slate-800 mt-0.5">{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(a.amount)}</p></div>
            )}
          </div>

          {/* Dosya seçimi */}
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Fatura Dosyası <span className="text-red-500">*</span></p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragging ? "border-blue-400 bg-blue-50" : file ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              {file ? (
                <div className="space-y-1">
                  <FileText className="h-6 w-6 text-emerald-500 mx-auto" />
                  <p className="text-xs font-semibold text-emerald-700">{file.name}</p>
                  <p className="text-[10px] text-slate-400">{fmtBytes(file.size)}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="h-6 w-6 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-500">Sürükle-bırak veya <span className="text-blue-600 font-medium">dosya seç</span></p>
                  <p className="text-[10px] text-slate-400">PDF, JPG, PNG, XLSX</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
            />
          </div>

          {/* Form alanları */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Fatura Tutarı</label>
              <div className="mt-1 relative">
                <input
                  type="text" inputMode="decimal"
                  value={amountRaw}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9,.]/, "");
                    setAmountRaw(v);
                  }}
                  placeholder="150.000"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-6 text-xs focus:border-blue-500 focus:outline-none"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">₺</span>
              </div>
              {amountRaw && !isNaN(parseFloat(amountRaw.replace(",", "."))) && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {fmtAmountDisplay(amountRaw)}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Fatura Tarihi</label>
              <input
                type="date"
                value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Fatura No <span className="text-slate-400 font-normal">(opsiyonel)</span></label>
              <input
                type="text"
                value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="FTR-2026-001"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Açıklama <span className="text-slate-400 font-normal">(opsiyonel)</span></label>
              <input
                type="text"
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Kısa açıklama"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={uploading}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || !file}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Yükleniyor…" : "Fatura Yükle"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function OnayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("tip") ?? "";

  const [approvals,    setApprovals]    = useState<ApprovalRequest[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [actingId,     setActingId]     = useState<string | null>(null);
  const [syncing,      setSyncing]      = useState(false);
  const [faturaModal,  setFaturaModal]  = useState<FaturaModalState | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await apiGet<ApprovalRequest[]>("/approvals").catch(() => []);
    setApprovals(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiPost<{ synced: number; message: string }>(
        "/progress-payments/sync-approvals", {}
      );
      alert(res?.message ?? "Senkronizasyon tamamlandı.");
      await load();
    } catch {
      alert("Senkronizasyon başarısız.");
    } finally { setSyncing(false); }
  };

  const openDoc = async (docId: string) => {
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
  };

  const act = async (id: string, status: string, note?: string) => {
    setActingId(id);
    try {
      await apiPatch(`/approvals/${id}`, { status, note });
      await load();
    } finally { setActingId(null); }
  };

  const setType = (key: string) => {
    if (key === "") {
      router.push("/onay-surecleri");
    } else {
      router.push(`/onay-surecleri?tip=${key}`);
    }
  };

  const displayed = approvals.filter((a) => {
    const typeMatch   = activeType === "" || a.approval_type === activeType;
    // Filtre: internal_pending ve bekliyor aynı grup olarak ele al
    let statusMatch = statusFilter === "" || a.status === statusFilter;
    if (statusFilter === "internal_pending" && HAK_IC_ONAY_BEKLIYOR.has(a.status)) statusMatch = true;
    return typeMatch && statusMatch;
  });

  const countByType = (key: string) =>
    key === "" ? approvals.length : approvals.filter((a) => a.approval_type === key).length;

  const icOnayBekleyen  = approvals.filter((a) => a.approval_type === "hakkediş" && HAK_IC_ONAY_BEKLIYOR.has(a.status)).length;
  const migrosBekleyen  = approvals.filter((a) => a.approval_type === "hakkediş" && a.status === "migros_pending").length;
  const faturaAsamasi   = approvals.filter((a) => a.approval_type === "hakkediş" && a.status === "invoice_stage").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Fatura Yükleme Modalı */}
      {faturaModal && (
        <FaturaModal
          state={faturaModal}
          onClose={() => setFaturaModal(null)}
          onSuccess={() => { setFaturaModal(null); load(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Onay Süreçleri</h1>
            <p className="text-xs text-slate-500">Hakkediş, fatura, proje ve teklif onayları</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Tüm Durumlar</option>
            <optgroup label="Hakkediş Akışı">
              <option value="internal_pending">İç Onay Bekliyor</option>
              <option value="internal_approved">İç Onay Alındı</option>
              <option value="migros_pending">Migros Onayı Bekleniyor</option>
              <option value="migros_approved">Migros Onayladı</option>
              <option value="invoice_stage">Faturalandırma Aşamasında</option>
              <option value="invoiced">Faturalandırıldı</option>
              <option value="revision_requested">Revizyon İstendi</option>
              <option value="rejected">Reddedildi</option>
            </optgroup>
            <optgroup label="Diğer Onaylar">
              <option value="bekliyor">Onay Bekliyor</option>
              <option value="onaylandi">Onaylandı</option>
              <option value="iptal">İptal Edildi</option>
              <option value="tamamlandi">Tamamlandı</option>
            </optgroup>
          </select>
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Onaya gönderilmiş ama Onay Süreçleri'nde görünmeyen hakkedişleri senkronize eder"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Senkronize Et
          </button>
        </div>
      </div>

      {/* Uyarı bantları */}
      {icOnayBekleyen > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-sm font-medium text-amber-800">
            {icOnayBekleyen} onay talebi iç onay bekliyor
          </p>
        </div>
      )}
      {migrosBekleyen > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <Send className="h-5 w-5 text-indigo-500 shrink-0" />
          <p className="text-sm font-medium text-indigo-800">
            {migrosBekleyen} hakkediş Migros onayı bekliyor
          </p>
        </div>
      )}
      {faturaAsamasi > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <FileText className="h-5 w-5 text-emerald-500 shrink-0" />
          <p className="text-sm font-medium text-emerald-800">
            {faturaAsamasi} hakkediş faturalandırma aşamasında
          </p>
        </div>
      )}

      {/* Tip sekmeleri */}
      <div className="flex gap-0.5 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeType === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              activeType === t.key ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
            }`}>
              {countByType(t.key)}
            </span>
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <CheckCircle2 className="h-10 w-10 text-slate-200" />
          <p className="text-sm text-slate-400">
            {activeType
              ? `${APPROVAL_TYPE_LABELS[activeType] ?? activeType} onayı bulunamadı.`
              : "Onay talebi bulunamadı."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((a) => {
            const st   = STATUS_CFG[a.status] ?? STATUS_CFG.internal_pending;
            const Icon = st.icon;
            const amt  = fmtAmount(a.amount);
            const isHakkediş = a.approval_type === "hakkediş";
            const busy = actingId === a.id;
            const detailHref = buildDetailHref(a);

            // Hakkediş akışı için durum kontrolü
            const isIcOnayBekliyor  = isHakkediş && HAK_IC_ONAY_BEKLIYOR.has(a.status);
            const isIcOnayVerildi   = isHakkediş && a.status === "internal_approved";
            const isMigrosBekliyor  = isHakkediş && a.status === "migros_pending";
            const isFaturaAsamasi   = isHakkediş && a.status === "invoice_stage";
            const isFaturalandirildi = isHakkediş && a.status === "invoiced";

            return (
              <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                  <div className="flex-1 min-w-0">
                    {/* Üst satır */}
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
                            {getApprovalLabel(a)}
                          </span>
                          {a.project_no && (
                            <span className="text-[10px] font-mono text-slate-400">{a.project_no}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 leading-tight">{a.title}</p>
                        {a.project_name && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{a.project_name}</p>
                        )}
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${st.badge}`}>
                        <Icon className="h-3 w-3" /> {st.label}
                      </span>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                      <span>{a.requested_by_name ?? "—"}</span>
                      <span>{fmtDate(a.requested_at)}</span>
                      {amt && <span className="font-semibold text-slate-700">{amt}</span>}
                      {a.file_name && <span>{a.file_name}</span>}
                    </div>
                    {a.note && (
                      <p className="text-[11px] text-slate-500 italic mt-1">Not: {a.note}</p>
                    )}
                    {a.approved_by_name && a.approved_at && (
                      <p className="text-[11px] text-blue-600 mt-1">
                        {a.approved_by_name} — {fmtDate(a.approved_at)} tarihinde iç onay verildi.
                      </p>
                    )}

                    {/* ─── Aksiyon butonları ─────────────────────────────────── */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">

                      {/* Ortak butonlar */}
                      <Link
                        href={detailHref}
                        className="flex items-center gap-1 text-[11px] text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50"
                      >
                        <FolderOpen className="h-3 w-3" /> Detaya Git
                      </Link>
                      {a.file_url && (
                        <button
                          onClick={() => openDoc(a.file_url!)}
                          className="flex items-center gap-1 text-[11px] text-blue-600 border border-blue-100 rounded-lg px-2.5 py-1 hover:bg-blue-50"
                        >
                          <Download className="h-3 w-3" /> Dosyayı Aç
                        </button>
                      )}

                      {/* ── 1. İç Onay Bekliyor ────────────────────────────── */}
                      {isIcOnayBekliyor && (
                        <>
                          <button
                            onClick={() => act(a.id, "internal_approved")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-100 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            İç Onay Ver
                          </button>
                          <button
                            onClick={() => act(a.id, "revision_requested", "Revizyon gerekiyor")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] text-purple-700 border border-purple-100 rounded-lg px-2.5 py-1 hover:bg-purple-50 disabled:opacity-50"
                          >
                            <AlertCircle className="h-3 w-3" /> Revizyon İste
                          </button>
                          <button
                            onClick={() => act(a.id, "rejected")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] text-red-600 border border-red-100 rounded-lg px-2.5 py-1 hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" /> Reddet
                          </button>
                        </>
                      )}

                      {/* ── 2. İç Onay Alındı ─────────────────────────────── */}
                      {isIcOnayVerildi && (
                        <>
                          <button
                            onClick={() => act(a.id, "migros_pending")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Migros&apos;a Gönderildi
                          </button>
                          <button
                            onClick={() => act(a.id, "revision_requested", "Revizyon gerekiyor")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] text-purple-700 border border-purple-100 rounded-lg px-2.5 py-1 hover:bg-purple-50 disabled:opacity-50"
                          >
                            <AlertCircle className="h-3 w-3" /> Revizyon İste
                          </button>
                        </>
                      )}

                      {/* ── 3. Migros Onayı Bekleniyor ─────────────────────── */}
                      {isMigrosBekliyor && (
                        <>
                          <button
                            onClick={() => act(a.id, "invoice_stage")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                            Migros Onayladı
                          </button>
                          <button
                            onClick={() => act(a.id, "revision_requested", "Migros revizyonu")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] text-purple-700 border border-purple-100 rounded-lg px-2.5 py-1 hover:bg-purple-50 disabled:opacity-50"
                          >
                            <AlertCircle className="h-3 w-3" /> Revizyon İste
                          </button>
                          <button
                            onClick={() => act(a.id, "rejected")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] text-red-600 border border-red-100 rounded-lg px-2.5 py-1 hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" /> Reddet
                          </button>
                        </>
                      )}

                      {/* ── 4. Faturalandırma Aşamasında ────────────────────── */}
                      {isFaturaAsamasi && (
                        <button
                          onClick={() => setFaturaModal({ approval: a })}
                          className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-100"
                        >
                          <Upload className="h-3 w-3" /> Fatura Yükle
                        </button>
                      )}

                      {/* ── 5. Faturalandırıldı ─────────────────────────────── */}
                      {isFaturalandirildi && (
                        <Link
                          href={`${detailHref}?tab=faturalar`}
                          className="flex items-center gap-1 text-[11px] text-green-700 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-50"
                        >
                          <Receipt className="h-3 w-3" /> Faturayı Aç
                        </Link>
                      )}

                      {/* ── Diğer onay türleri (fatura/proje/teklif) ─────────── */}
                      {!isHakkediş && a.status === "bekliyor" && (
                        <>
                          <button
                            onClick={() => act(a.id, "onaylandi")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-100 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Onayla
                          </button>
                          <button
                            onClick={() => act(a.id, "revizyon", "Revizyon gerekiyor")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] text-purple-700 border border-purple-100 rounded-lg px-2.5 py-1 hover:bg-purple-50 disabled:opacity-50"
                          >
                            <AlertCircle className="h-3 w-3" /> Revizyon İste
                          </button>
                          <button
                            onClick={() => act(a.id, "reddedildi")}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] text-red-600 border border-red-100 rounded-lg px-2.5 py-1 hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" /> Reddet
                          </button>
                        </>
                      )}
                    </div>
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

export default function OnayPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    }>
      <OnayPage />
    </Suspense>
  );
}
