"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, ArrowRight, CheckCircle2, Clock, Download,
  Eye, FileText, Loader2, Paperclip, Receipt, XCircle,
} from "lucide-react";
import { apiGet, buildApiUrl } from "@/lib/api";
import { openFileInNewTab } from "@/lib/download";

type InvoiceRecord = {
  id: string; invoice_type: string; invoice_no?: string; period?: string;
  amount?: number; currency: string; file_url?: string; file_name?: string;
  description?: string; approval_status: string; submitted_by_name?: string; created_at: string;
};

// ── İş türü eşlemeleri ────────────────────────────────────────────────────────

type WorkInfo = {
  label: string;
  badge: string;
  btnLabel: string;
  btnCls: string;
  route: string;
};

function getWorkInfo(invoiceType: string): WorkInfo {
  if (
    invoiceType === "bakim_faturasi" ||
    invoiceType === "ara_fatura" ||
    invoiceType === "final_fatura" ||
    invoiceType === "malzeme_faturasi" ||
    invoiceType === "hizmet_faturasi"
  ) {
    return {
      label:    "Bakım - Fatura",
      badge:    "bg-sky-50 text-sky-700",
      btnLabel: "Bakım & Onarım'a Git",
      btnCls:   "text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100",
      route:    "/bakim/faturalar",
    };
  }
  if (
    invoiceType === "tadilat_faturasi" ||
    invoiceType === "tadilat_avansli" ||
    invoiceType === "tadilat_avanssiz"
  ) {
    return {
      label:    "Tadilat - Fatura",
      badge:    "bg-amber-50 text-amber-700",
      btnLabel: "Tadilat'a Git",
      btnCls:   "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100",
      route:    "/tadilat/faturalar",
    };
  }
  if (invoiceType === "yeni_yapim_faturasi") {
    return {
      label:    "Yeni Yapım - Fatura",
      badge:    "bg-purple-50 text-purple-700",
      btnLabel: "Yeni Yapım'a Git",
      btnCls:   "text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100",
      route:    "/yeni-yapim/faturalar",
    };
  }
  return {
    label:    "Fatura",
    badge:    "bg-slate-100 text-slate-600",
    btnLabel: "Modüle Git",
    btnCls:   "text-slate-600 border-slate-200 bg-slate-50 hover:bg-slate-100",
    route:    "/",
  };
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

const APPROVAL_STATUS: Record<string, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  draft:              { label: "Taslak",                     icon: Clock,        cls: "bg-slate-50 text-slate-600"    },
  internal_pending:   { label: "İç Onay Bekliyor",           icon: Clock,        cls: "bg-amber-50 text-amber-700"    },
  pending:            { label: "İç Onay Bekliyor",           icon: Clock,        cls: "bg-amber-50 text-amber-700"    },
  bekliyor:           { label: "İç Onay Bekliyor",           icon: Clock,        cls: "bg-amber-50 text-amber-700"    },
  internal_approved:  { label: "İç Onay Alındı",             icon: CheckCircle2, cls: "bg-blue-50 text-blue-700"      },
  migros_pending:     { label: "Migros Onayı Bekleniyor",    icon: Clock,        cls: "bg-indigo-50 text-indigo-700"  },
  migros_approved:    { label: "Migros Onayı Verildi",       icon: CheckCircle2, cls: "bg-teal-50 text-teal-700"      },
  invoice_stage:      { label: "Faturalandırma Aşamasında",  icon: Clock,        cls: "bg-emerald-50 text-emerald-700"},
  invoiced:           { label: "Faturalandırıldı",           icon: CheckCircle2, cls: "bg-green-100 text-green-800"   },
  revision_requested: { label: "Revizyon İstendi",           icon: Clock,        cls: "bg-purple-50 text-purple-700"  },
  rejected:           { label: "Reddedildi",                 icon: XCircle,      cls: "bg-red-50 text-red-700"        },
  onaylandi:          { label: "İç Onay Alındı",             icon: CheckCircle2, cls: "bg-blue-50 text-blue-700"      },
  reddedildi:         { label: "Reddedildi",                 icon: XCircle,      cls: "bg-red-50 text-red-700"        },
  revizyon:           { label: "Revizyon İstendi",           icon: Clock,        cls: "bg-purple-50 text-purple-700"  },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTRY(amount?: number, currency?: string) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency ?? "TRY" }).format(amount);
}

async function openDocument(docId: string) {
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
    alert("Dosya açılamadı. Lütfen tekrar deneyin.");
  }
}

// ── Bileşen ───────────────────────────────────────────────────────────────────

export default function FaturaTab({ projectId }: { projectId: string }) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [opening,  setOpening]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiGet<InvoiceRecord[]>(`/invoice-records/projects/${projectId}`).catch(() => []);
    setInvoices(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async (inv: InvoiceRecord) => {
    if (!inv.file_url) return;
    setOpening(inv.id);
    await openDocument(inv.file_url);
    setOpening(null);
  };

  const totalAmount = invoices.reduce((s, i) => s + (i.amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Faturalar</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Mağazaya ait tüm modüllerden fatura kayıtları</p>
      </div>

      {/* Read-only banner */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Bu alan sadece görüntüleme içindir. Fatura yükleme ve düzenleme işlemleri ilgili modülden yapılır.
          Her kaydın yanındaki butona tıklayarak ilgili modüle gidebilirsiniz.
        </p>
      </div>

      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Toplam Fatura", value: invoices.length,                                               color: "text-slate-700" },
            { label: "Onay Bekliyor", value: invoices.filter(i => i.approval_status === "pending").length,  color: "text-amber-600" },
            { label: "Toplam Tutar",  value: fmtTRY(totalAmount),                                           color: "text-blue-600"  },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-100 bg-white p-3 text-center">
              <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed border-slate-200">
          <Receipt className="h-8 w-8 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">Fatura kaydı yok</p>
          <p className="text-xs text-slate-400">Fatura eklemek için Bakım, Tadilat veya Yeni Yapım modülünü kullanın.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const st   = APPROVAL_STATUS[inv.approval_status] ?? APPROVAL_STATUS.draft;
            const Icon = st.icon;
            const wi   = getWorkInfo(inv.invoice_type);
            return (
              <div key={inv.id} className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                    <FileText className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {/* İş türü etiketi */}
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${wi.badge}`}>
                        {wi.label}
                      </span>
                      {inv.invoice_no && (
                        <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                          {inv.invoice_no}
                        </span>
                      )}
                      {inv.period && <span className="text-[11px] text-slate-400">{inv.period}</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                        <Icon className="h-3 w-3" /> {st.label}
                      </span>
                      {inv.amount != null && (
                        <span className="text-xs font-bold text-slate-700">{fmtTRY(inv.amount, inv.currency)}</span>
                      )}
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
                      <button onClick={() => handleOpen(inv)} disabled={opening === inv.id}
                        className="flex items-center gap-1 text-[11px] text-slate-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 disabled:opacity-50">
                        {opening === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Aç
                      </button>
                    )}
                    {inv.file_url && (
                      <button onClick={() => handleOpen(inv)} disabled={opening === inv.id}
                        className="flex items-center gap-1 text-[11px] text-blue-600 border border-blue-100 rounded-lg px-2 py-1 hover:bg-blue-50 disabled:opacity-50">
                        <Download className="h-3.5 w-3.5" /> İndir
                      </button>
                    )}
                    {/* Kayıt bazlı modül yönlendirmesi */}
                    <Link href={wi.route}
                      className={`flex items-center gap-1 text-[11px] border rounded-lg px-2 py-1 font-medium ${wi.btnCls}`}>
                      <ArrowRight className="h-3.5 w-3.5" /> {wi.btnLabel}
                    </Link>
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
