"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Download, FileText, Loader2, Mail, Plus, X, XCircle } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";

type ApprovalRequest = {
  id: string;
  approval_type: string;
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

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  "hakkediş":        "Hakkediş Onayı",
  "fatura":          "Fatura Onayı",
  "proje":           "Proje Onayı",
  "teklif":          "Teklif Onayı",
  "is_tamamlandi":   "İş Tamamlandı Onayı",
  "mail":            "Mail Onayı",
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  bekliyor:    { label: "Onay Bekliyor",   icon: Clock,        cls: "bg-amber-50 text-amber-700"  },
  onaylandi:   { label: "Onaylandı",       icon: CheckCircle2, cls: "bg-green-50 text-green-700"  },
  reddedildi:  { label: "Reddedildi",      icon: XCircle,      cls: "bg-red-50 text-red-700"      },
  revizyon:    { label: "Revizyon İstendi",icon: Clock,        cls: "bg-purple-50 text-purple-700"},
  tamamlandi:  { label: "Tamamlandı",      icon: CheckCircle2, cls: "bg-slate-100 text-slate-600" },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function AddModal({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    approval_type: "mail",
    title: "",
    description: "",
    file_name: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  const handleSubmit = async () => {
    if (!form.title.trim()) { setErr("Başlık zorunludur."); return; }
    setBusy(true); setErr("");
    try {
      await apiPost(`/approvals/projects/${projectId}`, {
        approval_type: form.approval_type,
        title: form.title.trim(),
        description: form.description || null,
        file_name: form.file_name || null,
      });
      onDone(); onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? "Kayıt oluşturulamadı.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">Onay Talebi Ekle</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>
        <div className="px-5 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Onay Tipi *</label>
            <select value={form.approval_type} onChange={(e) => setForm(p => ({...p, approval_type: e.target.value}))}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              {Object.entries(APPROVAL_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Başlık *</label>
            <input value={form.title} onChange={(e) => setForm(p => ({...p, title: e.target.value}))}
              placeholder="Onay konusu..."
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dosya Adı</label>
            <input value={form.file_name} onChange={(e) => setForm(p => ({...p, file_name: e.target.value}))}
              placeholder="onay-maili.pdf veya .eml"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm(p => ({...p, description: e.target.value}))}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Vazgeç</button>
          <button onClick={handleSubmit} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <Mail className="h-4 w-4" /> Ekle
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnayMailTab({ projectId }: { projectId: string }) {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiGet<ApprovalRequest[]>(`/approvals/projects/${projectId}`).catch(() => []);
    setApprovals(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Onay Mailleri & Onay Talepleri</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Proje onayları, teklif onayları, hakkediş onayları</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Onay Ekle
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Mail className="h-8 w-8 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">Onay kaydı yok</p>
          <p className="text-xs text-slate-400">Onay maili, proje onayı veya hakkediş onayı ekleyin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {approvals.map((a) => {
            const st = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.bekliyor;
            const Icon = st.icon;
            return (
              <div key={a.id} className="rounded-xl border border-slate-100 bg-white p-4 flex items-start gap-3">
                <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-xl flex items-center justify-center ${
                  a.status === "onaylandi" ? "bg-green-50" :
                  a.status === "bekliyor"  ? "bg-amber-50" : "bg-slate-50"
                }`}>
                  <Mail className={`h-4 w-4 ${
                    a.status === "onaylandi" ? "text-green-600" :
                    a.status === "bekliyor"  ? "text-amber-600" : "text-slate-400"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                    <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                      {APPROVAL_TYPE_LABELS[a.approval_type] ?? a.approval_type}
                    </span>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                    <Icon className="h-3 w-3" /> {st.label}
                  </span>
                  {a.description && <p className="text-[11px] text-slate-500 italic mt-1">{a.description}</p>}
                  {a.note && <p className="text-[11px] text-slate-500 mt-1">Not: {a.note}</p>}
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {a.requested_by_name ?? "—"} · {fmtDate(a.requested_at)}
                    {a.approved_at ? ` · Onaylandı: ${fmtDate(a.approved_at)}` : ""}
                  </p>
                </div>
                {a.file_url && (
                  <a href={a.file_url} target="_blank" rel="noreferrer"
                    className="shrink-0 flex items-center gap-1 text-[11px] text-blue-600 border border-blue-100 rounded-lg px-2 py-1 hover:bg-blue-50">
                    <Download className="h-3.5 w-3.5" /> İndir
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddModal projectId={projectId} onClose={() => setShowAdd(false)} onDone={load} />}
    </div>
  );
}
