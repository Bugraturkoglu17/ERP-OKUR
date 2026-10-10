"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, Loader2, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";

type Tenant = { id: string; name: string; code: string; is_active: boolean };
type Plan = { id: string; code: string; name: string; max_users: number; storage_limit_gb: number };
type Subscription = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

type LisansRow = {
  sub: Subscription;
  tenant: Tenant | undefined;
  plan: Plan | undefined;
  remaining: number | null;
  displayStatus: "aktif" | "yakinda" | "dolmus" | "askida" | "diger";
};

function calcRemaining(ends_at: string | null): number | null {
  if (!ends_at) return null;
  const diff = new Date(ends_at).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDisplayStatus(sub: Subscription, remaining: number | null): LisansRow["displayStatus"] {
  if (sub.status.toLowerCase() === "suspended") return "askida";
  if (remaining !== null && remaining < 0) return "dolmus";
  if (remaining !== null && remaining <= 15) return "yakinda";
  if (sub.status.toLowerCase() === "active" || sub.status.toLowerCase() === "trial") return "aktif";
  return "diger";
}

const STATUS_BADGE: Record<string, string> = {
  aktif: "bg-emerald-50 text-emerald-700",
  yakinda: "bg-amber-50 text-amber-700",
  dolmus: "bg-red-50 text-red-700",
  askida: "bg-slate-100 text-slate-600",
  diger: "bg-slate-100 text-slate-600",
};

const STATUS_LABEL: Record<string, string> = {
  aktif: "Aktif",
  yakinda: "Yakında Bitecek",
  dolmus: "Süresi Dolmuş",
  askida: "Askıda",
  diger: "Bilinmiyor",
};

type ModalState = {
  open: boolean;
  subId: string;
  tenantId: string;
  planId: string;
  currentStatus: string;
  currentEndsAt: string;
  mode: "uzat" | "durum";
};

const EMPTY_MODAL: ModalState = {
  open: false, subId: "", tenantId: "", planId: "", currentStatus: "", currentEndsAt: "", mode: "uzat",
};

export default function LisanslarPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; ok: boolean; text: string }>>([]);
  const [modal, setModal] = useState<ModalState>(EMPTY_MODAL);
  const [newEndsAt, setNewEndsAt] = useState("");
  const [newStatus, setNewStatus] = useState("");

  let toastId = 0;
  const pushToast = (ok: boolean, text: string) => {
    const id = ++toastId;
    setToasts((p) => [...p, { id, ok, text }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [s, t, p] = await Promise.all([
        apiGet<Subscription[]>("/platform/subscriptions"),
        apiGet<Tenant[]>("/platform/tenants"),
        apiGet<Plan[]>("/platform/plans"),
      ]);
      setSubs(Array.isArray(s) ? s : []);
      setTenants(Array.isArray(t) ? t : []);
      setPlans(Array.isArray(p) ? p : []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Veriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo<LisansRow[]>(() => {
    return subs.map((sub) => {
      const tenant = tenants.find((t) => t.id === sub.tenant_id);
      const plan = plans.find((p) => p.id === sub.plan_id);
      const remaining = calcRemaining(sub.ends_at);
      const displayStatus = getDisplayStatus(sub, remaining);
      return { sub, tenant, plan, remaining, displayStatus };
    });
  }, [subs, tenants, plans]);

  const openUzat = (row: LisansRow) => {
    setNewEndsAt(row.sub.ends_at ? row.sub.ends_at.slice(0, 16) : "");
    setNewStatus(row.sub.status);
    setModal({ open: true, subId: row.sub.id, tenantId: row.sub.tenant_id, planId: row.sub.plan_id, currentStatus: row.sub.status, currentEndsAt: row.sub.ends_at || "", mode: "uzat" });
  };

  const doAction = async (tenantId: string, planId: string, status: string, endsAt: string | null) => {
    setBusy(true);
    try {
      await apiPost("/platform/subscriptions/assign", {
        tenant_id: tenantId,
        plan_id: planId,
        status,
        ends_at: endsAt || null,
      });
      pushToast(true, "Lisans güncellendi.");
      setModal(EMPTY_MODAL);
      await load();
    } catch (err: any) {
      pushToast(false, err?.response?.data?.detail || "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const quickAction = async (row: LisansRow, newStatusVal: string) => {
    await doAction(row.sub.tenant_id, row.sub.plan_id, newStatusVal, row.sub.ends_at);
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Toasts */}
      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-md ${t.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {t.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {t.text}
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Lisans Güncelle</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Durum</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="active">Aktif</option>
                  <option value="trial">Deneme</option>
                  <option value="suspended">Askıya Al</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Bitiş Tarihi</label>
                <input
                  type="datetime-local"
                  value={newEndsAt}
                  onChange={(e) => setNewEndsAt(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(EMPTY_MODAL)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Vazgeç</button>
              <button
                disabled={busy}
                onClick={() => doAction(modal.tenantId, modal.planId, newStatus, newEndsAt || null)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Başlık */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Lisanslar</h1>
        <p className="mt-1 text-sm text-slate-500">Tüm firmaların lisans durumunu görüntüleyin ve yönetin.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <CreditCard className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-600 font-medium">Henüz lisans kaydı yok</p>
          <p className="text-xs text-slate-400 mt-1">Firmalar sayfasından firma seçip lisans atayabilirsiniz.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Firma", "Paket", "Durum", "Başlangıç", "Bitiş", "Kalan", "Kullanıcı Limiti", "Depolama", "İşlemler"].map((h) => (
                    <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sub.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {row.tenant?.name ?? <span className="text-slate-400 text-xs">Bilinmiyor</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {row.plan?.name ?? <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.displayStatus]}`}>
                        {STATUS_LABEL[row.displayStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(row.sub.starts_at).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {row.sub.ends_at ? new Date(row.sub.ends_at).toLocaleDateString("tr-TR") : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.remaining === null ? (
                        <span className="text-slate-400 text-xs">Sınırsız</span>
                      ) : row.remaining < 0 ? (
                        <span className="text-red-600 text-xs font-medium">{Math.abs(row.remaining)} gün geçti</span>
                      ) : (
                        <span className={`text-xs font-medium ${row.remaining <= 15 ? "text-amber-600" : "text-slate-700"}`}>{row.remaining} gün</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.plan?.max_users ?? "—"} kullanıcı</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.plan ? `${row.plan.storage_limit_gb} GB` : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openUzat(row)}
                          title="Düzenle / Uzat"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <CalendarClock className="h-3.5 w-3.5" /> Uzat
                        </button>
                        {row.displayStatus !== "askida" ? (
                          <button
                            onClick={() => quickAction(row, "suspended")}
                            title="Askıya Al"
                            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                          >
                            <PauseCircle className="h-3.5 w-3.5" /> Askıya Al
                          </button>
                        ) : (
                          <button
                            onClick={() => quickAction(row, "active")}
                            title="Aktif Et"
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            <PlayCircle className="h-3.5 w-3.5" /> Aktif Et
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
