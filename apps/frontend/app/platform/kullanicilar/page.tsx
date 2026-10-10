"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Lock, Unlock, UserPlus, Users, XCircle } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";

type Tenant = { id: string; name: string; code: string };
type Admin = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  force_password_change: boolean;
};

function randomPassword(len = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function KullanicilarPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [createForm, setCreateForm] = useState({ full_name: "", email: "", temporary_password: "" });
  const [resetForm, setResetForm] = useState({ admin_user_id: "", temporary_password: "" });

  const toastRef = useRef(0);
  const [toasts, setToasts] = useState<Array<{ id: number; ok: boolean; text: string }>>([]);
  const pushToast = (ok: boolean, text: string) => {
    const id = ++toastRef.current;
    setToasts((p) => [...p, { id, ok, text }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  };

  useEffect(() => {
    (async () => {
      try {
        const t = await apiGet<Tenant[]>("/platform/tenants");
        setTenants(Array.isArray(t) ? t : []);
      } catch {
        setError("Firma listesi yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadAdmins = async (tenantId: string) => {
    if (!tenantId) { setAdmins([]); return; }
    setAdminsLoading(true);
    try {
      const a = await apiGet<Admin[]>(`/platform/tenants/${tenantId}/admins`);
      setAdmins(Array.isArray(a) ? a : []);
      setResetForm({ admin_user_id: (Array.isArray(a) && a.length > 0 ? a[0].id : ""), temporary_password: "" });
    } catch {
      setAdmins([]);
    } finally {
      setAdminsLoading(false);
    }
  };

  useEffect(() => { loadAdmins(selectedTenantId); }, [selectedTenantId]);

  const selectedTenant = useMemo(() => tenants.find((t) => t.id === selectedTenantId), [tenants, selectedTenantId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    setBusy(true);
    try {
      await apiPost("/platform/tenants/provision-admin", {
        tenant_id: selectedTenantId,
        email: createForm.email.trim().toLowerCase(),
        full_name: createForm.full_name.trim(),
        temporary_password: createForm.temporary_password,
      });
      setCreateForm({ full_name: "", email: "", temporary_password: "" });
      await loadAdmins(selectedTenantId);
      pushToast(true, "Yönetici oluşturuldu.");
    } catch (err: any) {
      pushToast(false, err?.response?.data?.detail || "Yönetici oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !resetForm.admin_user_id) return;
    setBusy(true);
    try {
      await apiPost(`/platform/tenants/${selectedTenantId}/reset-admin-password`, {
        admin_user_id: resetForm.admin_user_id,
        temporary_password: resetForm.temporary_password,
        force_password_change: true,
      });
      setResetForm((p) => ({ ...p, temporary_password: "" }));
      pushToast(true, "Şifre sıfırlandı.");
    } catch (err: any) {
      pushToast(false, err?.response?.data?.detail || "Şifre sıfırlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (admin: Admin) => {
    setBusy(true);
    try {
      await apiPatch(`/platform/admin-users/${admin.id}`, { is_active: !admin.is_active });
      await loadAdmins(selectedTenantId);
      pushToast(true, admin.is_active ? "Kullanıcı kilitlendi." : "Kullanıcı aktifleştirildi.");
    } catch (err: any) {
      pushToast(false, err?.response?.data?.detail || "Güncelleme başarısız.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Toasts */}
      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-md ${t.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {t.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {t.text}
          </div>
        ))}
      </div>

      {/* Başlık */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Kullanıcılar</h1>
        <p className="mt-1 text-sm text-slate-500">Firma yöneticilerini oluşturun, düzenleyin ve şifrelerini sıfırlayın.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Firma seçimi */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-xs font-semibold text-slate-600 block mb-2">Firma Seçin</label>
        <select
          value={selectedTenantId}
          onChange={(e) => setSelectedTenantId(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Firma seçin…</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
          ))}
        </select>
      </div>

      {selectedTenantId && (
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          {/* Yönetici Ekle */}
          <form onSubmit={handleCreate} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-500" /> Yönetici Ekle
            </h2>
            <p className="text-xs text-slate-400">{selectedTenant?.name} firmasına yeni yönetici oluşturun.</p>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Ad Soyad</label>
              <input required value={createForm.full_name} onChange={(e) => setCreateForm((p) => ({ ...p, full_name: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Ad Soyad" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">E-posta</label>
              <input required type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="yonetici@firma.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Geçici Şifre</label>
              <div className="flex gap-2">
                <input required value={createForm.temporary_password} onChange={(e) => setCreateForm((p) => ({ ...p, temporary_password: e.target.value }))}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Geçici şifre" />
                <button type="button" onClick={() => setCreateForm((p) => ({ ...p, temporary_password: randomPassword() }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Üret
                </button>
              </div>
            </div>
            <button disabled={busy} type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Yönetici Oluştur
            </button>
          </form>

          {/* Şifre Sıfırla */}
          <form onSubmit={handleReset} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-500" /> Şifre Sıfırla
            </h2>
            <p className="text-xs text-slate-400">Seçili yöneticinin şifresini sıfırlayın.</p>

            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Yönetici</label>
              <select required value={resetForm.admin_user_id} onChange={(e) => setResetForm((p) => ({ ...p, admin_user_id: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">Seçin…</option>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.full_name} ({a.email})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Yeni Geçici Şifre</label>
              <div className="flex gap-2">
                <input required value={resetForm.temporary_password} onChange={(e) => setResetForm((p) => ({ ...p, temporary_password: e.target.value }))}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Yeni şifre" />
                <button type="button" onClick={() => setResetForm((p) => ({ ...p, temporary_password: randomPassword() }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Üret
                </button>
              </div>
            </div>
            <button disabled={busy || !resetForm.admin_user_id} type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Şifre Sıfırla
            </button>
          </form>

          {/* Yöneticiler Listesi */}
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-slate-500" />
              {selectedTenant?.name} — Yöneticiler
            </h2>

            {adminsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : admins.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Henüz yönetici eklenmemiş.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["Ad Soyad", "E-posta", "Durum", "Şifre Durumu", "İşlem"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => (
                      <tr key={admin.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 font-medium text-slate-900">{admin.full_name}</td>
                        <td className="px-3 py-3 text-slate-500 text-xs">{admin.email}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${admin.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${admin.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {admin.is_active ? "Aktif" : "Kilitli"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs ${admin.force_password_change ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                            {admin.force_password_change ? "Değişim zorunlu" : "Normal"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => toggleActive(admin)}
                            disabled={busy}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${admin.is_active ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                          >
                            {admin.is_active ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            {admin.is_active ? "Kilitle" : "Aç"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
