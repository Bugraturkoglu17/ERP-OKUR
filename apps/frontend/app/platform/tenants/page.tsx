"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { getTokenPayloadFromStorage, isPlatformAdmin } from "@/lib/auth";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  Filter,
  KeyRound,
  Lock,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  UserPlus,
  XCircle,
} from "lucide-react";

type Firma = {
  id: string;
  name: string;
  code: string;
  logo_url?: string | null;
  status: string;
  is_active: boolean;
  created_at: string;
};

type FirmaAyar = {
  tenant_id: string;
  tax_no?: string | null;
  sector?: string | null;
  country?: string | null;
  theme_color?: string | null;
  domain?: string | null;
  subdomain?: string | null;
  email_mode?: "platform" | "tenant_domain" | null;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  email_domain_verified?: boolean | null;
  email_provider_identity_id?: string | null;
  email_branding?: {
    logo_url?: string;
    color?: string;
    footer?: string;
  } | null;
  updated_at: string;
};

type FirmaYoneticisi = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  force_password_change: boolean;
};

type Plan = {
  id: string;
  code: string;
  name: string;
  max_users: number;
  storage_limit_gb: number;
  modules: string[];
  is_active: boolean;
  created_at: string;
};

type Lisans = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  ends_at?: string | null;
};

type ConfirmState = {
  open: boolean;
  title: string;
  detail: string;
  action: () => Promise<void>;
};

const TABS = ["firmalar", "yoneticiler", "lisans"] as const;
type TabKey = (typeof TABS)[number];

const STATUS_LABELS: Record<string, string> = {
  trial: "Deneme",
  active: "Aktif",
  suspended: "Askıda",
  archived: "Arşiv",
};

const STATUS_BADGE: Record<string, string> = {
  trial: "bg-blue-50 text-blue-700 border-blue-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  suspended: "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-slate-100 text-slate-700 border-slate-200",
};

function statusText(value: string): string {
  const key = value.toLowerCase();
  return STATUS_LABELS[key] || value;
}

function statusBadge(value: string): string {
  const key = value.toLowerCase();
  return STATUS_BADGE[key] || "bg-slate-50 text-slate-700 border-slate-200";
}

function randomPassword(length = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function ConfirmModal({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <h3 className="text-base font-semibold text-slate-900">{state.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{state.detail}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
            Vazgeç
          </button>
          <button
            onClick={async () => {
              await state.action();
              onClose();
            }}
            className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white"
          >
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}

function PlatformTenantsPageContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>("firmalar");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [firmalar, setFirmalar] = useState<Firma[]>([]);
  const [selectedFirmaId, setSelectedFirmaId] = useState("");

  const [firmaAyar, setFirmaAyar] = useState<FirmaAyar | null>(null);
  const [firmaYoneticileri, setFirmaYoneticileri] = useState<FirmaYoneticisi[]>([]);
  const [planlar, setPlanlar] = useState<Plan[]>([]);
  const [lisanslar, setLisanslar] = useState<Lisans[]>([]);

  const [firmaForm, setFirmaForm] = useState({
    name: "",
    code: "",
    logo_url: "",
    tax_no: "",
    sector: "",
    country: "",
    theme_color: "",
    domain: "",
    subdomain: "",
  });
  const [firmaDuzenleForm, setFirmaDuzenleForm] = useState({ name: "", code: "", logo_url: "" });
  const [yasamForm, setYasamForm] = useState({ status: "trial", is_active: true, reason: "" });
  const [ayarForm, setAyarForm] = useState({
    tax_no: "",
    sector: "",
    country: "",
    theme_color: "",
    domain: "",
    subdomain: "",
    email_mode: "platform" as "platform" | "tenant_domain",
    from_name: "",
    from_email: "",
    reply_to: "",
    email_domain_verified: false,
    email_provider_identity_id: "",
    branding_logo_url: "",
    branding_color: "",
    branding_footer: "",
  });
  const [yoneticiForm, setYoneticiForm] = useState({ full_name: "", email: "", temporary_password: "" });
  const [resetForm, setResetForm] = useState({
    admin_user_id: "",
    temporary_password: "",
    force_password_change: true,
    reason: "",
  });
  const [planForm, setPlanForm] = useState({ code: "", name: "", max_users: 10, storage_limit_gb: 5, modules: "projects,inventory,finance" });
  const [atamaForm, setAtamaForm] = useState({ plan_id: "", status: "active", ends_at: "" });

  const [searchFirma, setSearchFirma] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false, title: "", detail: "", action: async () => {} });
  const [firmaSection, setFirmaSection] = useState<"manage" | "create">("manage");
  const [editingAdminId, setEditingAdminId] = useState("");
  const [editingAdminForm, setEditingAdminForm] = useState({ full_name: "", force_password_change: false, is_active: true });

  const [toasts, setToasts] = useState<Array<{ id: number; type: "ok" | "err"; text: string }>>([]);
  const toastCounterRef = useRef(1);

  const pushToast = (type: "ok" | "err", text: string) => {
    const id = toastCounterRef.current;
    toastCounterRef.current += 1;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  };

  const selectedFirma = useMemo(() => firmalar.find((f) => f.id === selectedFirmaId) || null, [firmalar, selectedFirmaId]);

  const filteredFirmalar = useMemo(() => {
    return firmalar.filter((f) => {
      const term = searchFirma.toLowerCase();
      const passText = f.name.toLowerCase().includes(term) || f.code.toLowerCase().includes(term);
      const passStatus = statusFilter === "all" || f.status.toLowerCase() === statusFilter;
      return passText && passStatus;
    });
  }, [firmalar, searchFirma, statusFilter]);

  const selectedPlan = useMemo(() => planlar.find((p) => p.id === atamaForm.plan_id) || null, [planlar, atamaForm.plan_id]);

  const aktifLisans = useMemo(() => {
    if (!lisanslar.length) return null;
    return lisanslar[0];
  }, [lisanslar]);

  const aktifPlan = useMemo(() => {
    if (!aktifLisans) return null;
    return planlar.find((p) => p.id === aktifLisans.plan_id) || null;
  }, [aktifLisans, planlar]);

  const metrik = useMemo(() => {
    const aktifFirma = firmalar.filter((f) => f.is_active).length;
    const askida = firmalar.filter((f) => f.status.toLowerCase() === "suspended").length;
    const adminSayisi = firmaYoneticileri.filter((u) => u.is_active).length;
    const limit = aktifPlan?.max_users || 0;
    const oran = limit > 0 ? Math.min(100, Math.round((adminSayisi / limit) * 100)) : 0;
    return { aktifFirma, askida, adminSayisi, limit, oran };
  }, [firmalar, firmaYoneticileri, aktifPlan]);

  const loadCore = async () => {
    const [firmaRows, planRows] = await Promise.all([
      apiGet<Firma[]>("/platform/tenants"),
      apiGet<Plan[]>("/platform/plans"),
    ]);
    setFirmalar(Array.isArray(firmaRows) ? firmaRows : []);
    setPlanlar(Array.isArray(planRows) ? planRows : []);
  };

  const loadFirmaScope = async (firmaId: string) => {
    if (!firmaId) return;
    const [ayar, yoneticiler, abonelik] = await Promise.all([
      apiGet<FirmaAyar>(`/platform/tenants/${firmaId}/settings`),
      apiGet<FirmaYoneticisi[]>(`/platform/tenants/${firmaId}/admins`),
      apiGet<Lisans[]>("/platform/subscriptions", { tenant_id: firmaId }),
    ]);
    setFirmaAyar(ayar);
    setAyarForm({
      tax_no: ayar?.tax_no || "",
      sector: ayar?.sector || "",
      country: ayar?.country || "",
      theme_color: ayar?.theme_color || "",
      domain: ayar?.domain || "",
      subdomain: ayar?.subdomain || "",
      email_mode: (ayar?.email_mode as "platform" | "tenant_domain") || "platform",
      from_name: ayar?.from_name || "",
      from_email: ayar?.from_email || "",
      reply_to: ayar?.reply_to || "",
      email_domain_verified: Boolean(ayar?.email_domain_verified),
      email_provider_identity_id: ayar?.email_provider_identity_id || "",
      branding_logo_url: ayar?.email_branding?.logo_url || "",
      branding_color: ayar?.email_branding?.color || "",
      branding_footer: ayar?.email_branding?.footer || "",
    });
    setFirmaYoneticileri(Array.isArray(yoneticiler) ? yoneticiler : []);
    setLisanslar(Array.isArray(abonelik) ? abonelik : []);
  };

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && TABS.includes(tabParam as TabKey)) {
      setTab(tabParam as TabKey);
    }
  }, [searchParams]);

  useEffect(() => {
    const payload = getTokenPayloadFromStorage();
    if (!payload) {
      window.location.href = "/login";
      return;
    }
    if (!isPlatformAdmin(payload)) {
      window.location.href = "/";
      return;
    }

    setAuthorized(true);
    (async () => {
      setLoading(true);
      setError("");
      try {
        await loadCore();
      } catch (err: any) {
        setError(err?.response?.data?.detail || "Sistem verileri yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedFirmaId) return;
    (async () => {
      try {
        await loadFirmaScope(selectedFirmaId);
      } catch (err: any) {
        setError(err?.response?.data?.detail || "Firma detayları yüklenemedi.");
      }
    })();
  }, [selectedFirmaId]);

  useEffect(() => {
    if (!selectedFirma) {
      setFirmaDuzenleForm({ name: "", code: "", logo_url: "" });
      setFirmaSection("create");
      return;
    }
    setFirmaSection("manage");
    setFirmaDuzenleForm({
      name: selectedFirma.name || "",
      code: selectedFirma.code || "",
      logo_url: selectedFirma.logo_url || "",
    });
  }, [selectedFirma]);

  useEffect(() => {
    setResetForm((prev) => {
      const currentValid = prev.admin_user_id && firmaYoneticileri.some((admin) => admin.id === prev.admin_user_id);
      if (currentValid) return prev;
      return {
        ...prev,
        admin_user_id: firmaYoneticileri[0]?.id || "",
      };
    });
  }, [firmaYoneticileri]);

  const createFirma = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await apiPost<Firma>("/platform/tenants", {
        name: firmaForm.name.trim(),
        code: firmaForm.code.trim().toLowerCase(),
        logo_url: firmaForm.logo_url.trim() || null,
      });
      if (created?.id) {
        await apiPut(`/platform/tenants/${created.id}/settings`, {
          tax_no: firmaForm.tax_no.trim() || null,
          sector: firmaForm.sector.trim() || null,
          country: firmaForm.country.trim() || null,
          theme_color: firmaForm.theme_color.trim() || null,
          domain: firmaForm.domain.trim() || null,
          subdomain: firmaForm.subdomain.trim() || null,
        });
      }
      setFirmaForm({
        name: "",
        code: "",
        logo_url: "",
        tax_no: "",
        sector: "",
        country: "",
        theme_color: "",
        domain: "",
        subdomain: "",
      });
      await loadCore();
      pushToast("ok", "Firma oluşturuldu.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Firma oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const patchFirmaYasam = async () => {
    if (!selectedFirmaId) return;
    setBusy(true);
    try {
      await apiPatch(`/platform/tenants/${selectedFirmaId}`, {
        status: yasamForm.status,
        is_active: yasamForm.is_active,
      });
      await loadCore();
      pushToast("ok", "Firma yaşam döngüsü güncellendi.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Firma güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const saveFirmaVeAyar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFirmaId) return;
    const name = firmaDuzenleForm.name.trim();
    const code = firmaDuzenleForm.code.trim().toLowerCase();
    if (!name || !code) {
      pushToast("err", "Firma adı ve kodu zorunludur.");
      return;
    }
    setBusy(true);
    try {
      await Promise.all([
        apiPatch(`/platform/tenants/${selectedFirmaId}`, {
          name,
          code,
          logo_url: firmaDuzenleForm.logo_url.trim() || null,
        }),
        apiPut(`/platform/tenants/${selectedFirmaId}/settings`, {
          tax_no: ayarForm.tax_no,
          sector: ayarForm.sector,
          country: ayarForm.country,
          theme_color: ayarForm.theme_color,
          domain: ayarForm.domain,
          subdomain: ayarForm.subdomain,
          email_mode: ayarForm.email_mode,
          from_name: ayarForm.from_name || null,
          from_email: ayarForm.from_email || null,
          reply_to: ayarForm.reply_to || null,
          email_domain_verified: ayarForm.email_domain_verified,
          email_provider_identity_id: ayarForm.email_provider_identity_id || null,
          email_branding: {
            logo_url: ayarForm.branding_logo_url || undefined,
            color: ayarForm.branding_color || undefined,
            footer: ayarForm.branding_footer || undefined,
          },
        }),
      ]);
      await loadFirmaScope(selectedFirmaId);
      await loadCore();
      pushToast("ok", "Firma bilgileri ve ayarları kaydedildi.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Firma kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const createYonetici = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFirmaId) return;
    setBusy(true);
    try {
      await apiPost("/platform/tenants/provision-admin", {
        tenant_id: selectedFirmaId,
        email: yoneticiForm.email.trim().toLowerCase(),
        full_name: yoneticiForm.full_name.trim(),
        temporary_password: yoneticiForm.temporary_password,
      });
      setYoneticiForm({ full_name: "", email: "", temporary_password: "" });
      await loadFirmaScope(selectedFirmaId);
      await loadCore();
      pushToast("ok", "Firma yöneticisi oluşturuldu.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Firma yöneticisi oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const resetYoneticiParola = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFirmaId) return;
    setBusy(true);
    try {
      await apiPost(`/platform/tenants/${selectedFirmaId}/reset-admin-password`, {
        admin_user_id: resetForm.admin_user_id || null,
        temporary_password: resetForm.temporary_password,
        force_password_change: resetForm.force_password_change,
      });
      setResetForm((prev) => ({
        admin_user_id: prev.admin_user_id,
        temporary_password: "",
        force_password_change: true,
        reason: "",
      }));
      await loadFirmaScope(selectedFirmaId);
      await loadCore();
      pushToast("ok", "Yönetici şifresi sıfırlandı.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Şifre sıfırlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const updateYonetici = async (
    admin: FirmaYoneticisi,
    payload: { full_name?: string; is_active?: boolean; force_password_change?: boolean },
  ) => {
    setBusy(true);
    try {
      await apiPatch(`/platform/admin-users/${admin.id}`, payload);
      if (selectedFirmaId) await loadFirmaScope(selectedFirmaId);
      await loadCore();
      pushToast("ok", "Yönetici güncellendi.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Yönetici güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const removeFirma = async () => {
    if (!selectedFirmaId) return;
    setBusy(true);
    try {
      await apiPatch(`/platform/tenants/${selectedFirmaId}`, {
        status: "archived",
        is_active: false,
      });
      await loadCore();
      await loadFirmaScope(selectedFirmaId);
      pushToast("ok", "Firma pasife alındı ve arşive taşındı.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Firma kaldırma işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const openYoneticiDuzenle = (admin: FirmaYoneticisi) => {
    setEditingAdminId(admin.id);
    setEditingAdminForm({
      full_name: admin.full_name,
      force_password_change: admin.force_password_change,
      is_active: admin.is_active,
    });
  };

  const saveYoneticiDuzenle = async (admin: FirmaYoneticisi) => {
    const fullName = editingAdminForm.full_name.trim();
    if (!fullName) {
      pushToast("err", "Ad soyad boş bırakılamaz.");
      return;
    }
    await updateYonetici(admin, {
      full_name: fullName,
      is_active: editingAdminForm.is_active,
      force_password_change: editingAdminForm.force_password_change,
    });
    setEditingAdminId("");
  };

  const createPlan = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost("/platform/plans", {
        code: planForm.code.trim().toLowerCase(),
        name: planForm.name.trim(),
        max_users: planForm.max_users,
        storage_limit_gb: planForm.storage_limit_gb,
        modules: planForm.modules.split(",").map((x) => x.trim()).filter(Boolean),
      });
      setPlanForm({ code: "", name: "", max_users: 10, storage_limit_gb: 5, modules: "projects,inventory,finance" });
      await loadCore();
      pushToast("ok", "Plan oluşturuldu.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Plan oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const assignLisans = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFirmaId || !atamaForm.plan_id) return;
    setBusy(true);
    try {
      await apiPost("/platform/subscriptions/assign", {
        tenant_id: selectedFirmaId,
        plan_id: atamaForm.plan_id,
        status: atamaForm.status,
        ends_at: atamaForm.ends_at || null,
      });
      await loadFirmaScope(selectedFirmaId);
      await loadCore();
      pushToast("ok", "Lisans atandı.");
    } catch (err: any) {
      pushToast("err", err?.response?.data?.detail || "Lisans atanamadı.");
    } finally {
      setBusy(false);
    }
  };

  if (!authorized || loading) {
    return (
      <div className="flex min-h-[380px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <ConfirmModal state={confirm} onClose={() => setConfirm((p) => ({ ...p, open: false }))} />

      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow ${t.type === "ok" ? "border-emerald-250/50 bg-emerald-50 text-emerald-800" : "border-rose-250/50 bg-rose-50 text-rose-800"}`}>
            {t.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      <section className="corp-header">
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-350">Geliştirici Admin</p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight">Super Admin Paneli</h1>
            <p className="mt-1 text-xs text-slate-350">Firma yaşam döngüsü, yönetici, lisans ve denetim.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">Firma: <b>{firmalar.length}</b></div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">Aktif: <b>{metrik.aktifFirma}</b></div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">Askıda: <b>{metrik.askida}</b></div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">Yönetici: <b>{metrik.adminSayisi}</b></div>
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-250/50 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{error}</div>}

      <div className="corp-card p-4">
        <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200/50">
          <button onClick={() => setTab("firmalar")} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${tab === "firmalar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Firmalar</button>
          <button onClick={() => setTab("yoneticiler")} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${tab === "yoneticiler" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Yöneticiler</button>
          <button onClick={() => setTab("lisans")} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${tab === "lisans" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Lisans</button>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="corp-card p-5 lg:col-span-1 space-y-4">
          <h3 className="text-xs font-extrabold text-slate-450 uppercase tracking-wider border-b border-slate-100 pb-2">Firma Seçimi ve Filtre</h3>
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="corp-input pl-9" placeholder="Firma adı/kod ara" value={searchFirma} onChange={(e) => setSearchFirma(e.target.value)} />
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select className="corp-select pl-9" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Tüm durumlar</option>
                <option value="trial">Deneme</option>
                <option value="active">Aktif</option>
                <option value="suspended">Askıda</option>
                <option value="archived">Arşiv</option>
              </select>
            </div>
            <select className="corp-select" value={selectedFirmaId} onChange={(e) => setSelectedFirmaId(e.target.value)}>
              <option value="">Firma seçin</option>
              {filteredFirmalar.map((firma) => (
                <option key={firma.id} value={firma.id}>{firma.name} ({firma.code})</option>
              ))}
            </select>
            <div className="text-xs text-slate-500 font-semibold">Seçili firma: {selectedFirma ? selectedFirma.name : "Yok"}</div>
          </div>

          {selectedFirma && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Durum</p>
              <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(selectedFirma.status)}`}>{statusText(selectedFirma.status)}</span>
              <p className="mt-2 text-xs text-slate-500">Kod: {selectedFirma.code}</p>
              <p className="text-xs text-slate-500">Ayar güncelleme: {firmaAyar ? new Date(firmaAyar.updated_at).toLocaleString("tr-TR") : "-"}</p>
              <div className="mt-3">
                <p className="mb-1 text-xs text-slate-500">Kullanıcı limiti kullanımı</p>
                <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
                  <div className="h-full bg-indigo-600" style={{ width: `${metrik.oran}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-600">{metrik.adminSayisi} / {metrik.limit || "-"}</p>
              </div>
            </div>
          )}
        </div>

        {tab === "firmalar" && (
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <button
                  onClick={() => setFirmaSection("manage")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${firmaSection === "manage" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Seçili Firma Yönetimi
                </button>
                <button
                  onClick={() => setFirmaSection("create")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${firmaSection === "create" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Yeni Firma Ekle
                </button>
              </div>
            </div>

            {firmaSection === "create" && (
              <form onSubmit={createFirma} className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><PlusCircle className="h-4 w-4" /> Yeni Firma</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Firma Adı *</label>
                    <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Örn: Akme Mühendislik" value={firmaForm.name} onChange={(e) => setFirmaForm((p) => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Firma Kodu *</label>
                    <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Örn: akme (küçük harf)" pattern="[a-z0-9-]{2,32}" value={firmaForm.code} onChange={(e) => setFirmaForm((p) => ({ ...p, code: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Sektör</label>
                    <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Örn: İnşaat, Mühendislik" value={firmaForm.sector} onChange={(e) => setFirmaForm((p) => ({ ...p, sector: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Ülke</label>
                    <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Örn: Türkiye" value={firmaForm.country} onChange={(e) => setFirmaForm((p) => ({ ...p, country: e.target.value }))} />
                  </div>
                </div>
                <button disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><Building2 className="h-4 w-4" /> Firma Oluştur</button>
              </form>
            )}

            {firmaSection === "manage" && (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Lock className="h-4 w-4" /> Firma Yaşam Döngüsü</h3>
                  <div className="space-y-2">
                    <select className="w-full rounded-lg border px-3 py-2 text-sm" value={yasamForm.status} onChange={(e) => setYasamForm((p) => ({ ...p, status: e.target.value }))}>
                      <option value="trial">Deneme</option>
                      <option value="active">Aktif</option>
                      <option value="suspended">Askıya Al</option>
                      <option value="archived">Arşive Al</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={yasamForm.is_active} onChange={(e) => setYasamForm((p) => ({ ...p, is_active: e.target.checked }))} /> Oturum Açabilsin</label>
                    <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Neden (audit için)" value={yasamForm.reason} onChange={(e) => setYasamForm((p) => ({ ...p, reason: e.target.value }))} />
                    <button
                      onClick={() => setConfirm({
                        open: true,
                        title: "Firma yaşam döngüsü güncellenecek",
                        detail: "Bu işlem giriş yetkilerini etkileyebilir.",
                        action: async () => patchFirmaYasam(),
                      })}
                      disabled={!selectedFirmaId || busy}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white"
                    >
                      <Save className="h-4 w-4" /> Güncelle
                    </button>
                    <div>
                      <button
                        type="button"
                        disabled={!selectedFirmaId || busy}
                        onClick={() =>
                          setConfirm({
                            open: true,
                            title: "Firmayı kaldır (arşivle)",
                            detail: "Bu işlem firmayı pasife alır ve durumunu arşive çeker. Veri silinmez.",
                            action: async () => removeFirma(),
                          })
                        }
                        className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-rose-300"
                      >
                        Pasife Al (Arşivle)
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={saveFirmaVeAyar} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-bold">Firma Bilgileri ve Ayarları</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">Firma Adı *</label>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Firma adı" value={firmaDuzenleForm.name} onChange={(e) => setFirmaDuzenleForm((p) => ({ ...p, name: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">Firma Kodu *</label>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Kısa kod" pattern="[a-z0-9-]{2,32}" value={firmaDuzenleForm.code} onChange={(e) => setFirmaDuzenleForm((p) => ({ ...p, code: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">Sektör</label>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Sektör" value={ayarForm.sector} onChange={(e) => setAyarForm((p) => ({ ...p, sector: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">Ülke</label>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Ülke" value={ayarForm.country} onChange={(e) => setAyarForm((p) => ({ ...p, country: e.target.value }))} />
                    </div>
                  </div>

                  <button disabled={!selectedFirmaId || busy} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"><Save className="h-4 w-4" /> Tümünü Kaydet</button>
                </form>
              </>
            )}
          </div>
        )}

        {tab === "yoneticiler" && (
          <div className="grid gap-5 lg:col-span-2 lg:grid-cols-2">
            <form onSubmit={createYonetici} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><UserPlus className="h-4 w-4" /> Firma Yöneticisi Ekle</h3>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">Ad Soyad</label>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Ad Soyad" value={yoneticiForm.full_name} onChange={(e) => setYoneticiForm((p) => ({ ...p, full_name: e.target.value }))} required />
                <label className="text-xs font-semibold text-slate-500">E-posta</label>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="yonetici@firma.com" type="email" value={yoneticiForm.email} onChange={(e) => setYoneticiForm((p) => ({ ...p, email: e.target.value }))} required />
                <label className="text-xs font-semibold text-slate-500">Geçici Parola</label>
                <div className="flex gap-2">
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Geçici parola" type="text" value={yoneticiForm.temporary_password} onChange={(e) => setYoneticiForm((p) => ({ ...p, temporary_password: e.target.value }))} required />
                  <button type="button" onClick={() => setYoneticiForm((p) => ({ ...p, temporary_password: randomPassword() }))} className="rounded-lg border border-slate-300 px-3 text-xs font-semibold">Üret</button>
                </div>
                <button disabled={!selectedFirmaId || busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"><ShieldCheck className="h-4 w-4" /> Oluştur</button>
              </div>
            </form>

            <form onSubmit={resetYoneticiParola} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><KeyRound className="h-4 w-4" /> Yönetici Şifre Sıfırla</h3>
              <div className="space-y-2">
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={resetForm.admin_user_id}
                  onChange={(e) => setResetForm((p) => ({ ...p, admin_user_id: e.target.value }))}
                  required
                >
                  <option value="">Yönetici seçin</option>
                  {firmaYoneticileri.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.full_name} ({admin.email})
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Yeni geçici parola" type="text" value={resetForm.temporary_password} onChange={(e) => setResetForm((p) => ({ ...p, temporary_password: e.target.value }))} required />
                  <button type="button" onClick={() => setResetForm((p) => ({ ...p, temporary_password: randomPassword() }))} className="rounded-lg border border-slate-300 px-3 text-xs font-semibold">Üret</button>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resetForm.force_password_change} onChange={(e) => setResetForm((p) => ({ ...p, force_password_change: e.target.checked }))} /> İlk girişte zorunlu değiştir</label>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Neden (audit)" value={resetForm.reason} onChange={(e) => setResetForm((p) => ({ ...p, reason: e.target.value }))} />
                <button
                  disabled={!selectedFirmaId || !resetForm.admin_user_id || busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white"
                >
                  <RefreshCw className="h-4 w-4" /> Sıfırla
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><UserCog className="h-4 w-4" /> Firma Yöneticileri</h3>
              <div className="space-y-2">
                {firmaYoneticileri.length === 0 && <p className="text-sm text-slate-500">Yönetici bulunamadı.</p>}
                {firmaYoneticileri.map((admin) => (
                  <div key={admin.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{admin.full_name}</p>
                      <p className="text-xs text-slate-600">{admin.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => openYoneticiDuzenle(admin)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() =>
                          setConfirm({
                            open: true,
                            title: admin.is_active ? "Yöneticiyi kilitle" : "Yöneticiyi aktifleştir",
                            detail: admin.is_active ? "Kullanıcı giriş yapamayacak." : "Kullanıcı yeniden giriş yapabilir.",
                            action: async () => updateYonetici(admin, { is_active: !admin.is_active }),
                          })
                        }
                        className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                      >
                        {admin.is_active ? "Kilitle" : "Aç"}
                      </button>
                      <button
                        onClick={() => updateYonetici(admin, { force_password_change: !admin.force_password_change })}
                        className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs text-white"
                      >
                        Parola Değişimi: {admin.force_password_change ? "Zorunlu" : "Serbest"}
                      </button>
                      <button
                        onClick={() =>
                          setConfirm({
                            open: true,
                            title: "Yöneticiyi kaldır",
                            detail: "Bu işlem kullanıcıyı pasife alır ve girişini engeller.",
                            action: async () => updateYonetici(admin, { is_active: false }),
                          })
                        }
                        disabled={!admin.is_active}
                        className="rounded-md bg-rose-600 px-2.5 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-rose-300"
                      >
                        Kaldır
                      </button>
                    </div>
                    {editingAdminId === admin.id && (
                      <div className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            className="rounded-lg border px-3 py-2 text-sm"
                            placeholder="Ad Soyad"
                            value={editingAdminForm.full_name}
                            onChange={(e) => setEditingAdminForm((p) => ({ ...p, full_name: e.target.value }))}
                          />
                          <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={editingAdminForm.force_password_change}
                              onChange={(e) => setEditingAdminForm((p) => ({ ...p, force_password_change: e.target.checked }))}
                            />
                            İlk girişte parola değişimi zorunlu
                          </label>
                          <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm md:col-span-2">
                            <input
                              type="checkbox"
                              checked={editingAdminForm.is_active}
                              onChange={(e) => setEditingAdminForm((p) => ({ ...p, is_active: e.target.checked }))}
                            />
                            Kullanıcı aktif
                          </label>
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={() => setEditingAdminId("")}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                          >
                            Vazgeç
                          </button>
                          <button
                            onClick={() => saveYoneticiDuzenle(admin)}
                            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Kaydet
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "lisans" && (
          <div className="grid gap-5 lg:col-span-2 lg:grid-cols-2">
            <form onSubmit={createPlan} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><CreditCard className="h-4 w-4" /> Plan Oluştur</h3>
              <div className="space-y-2">
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Kod" value={planForm.code} onChange={(e) => setPlanForm((p) => ({ ...p, code: e.target.value }))} required />
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Ad" value={planForm.name} onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))} required />
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded-lg border px-3 py-2 text-sm" type="number" min={1} value={planForm.max_users} onChange={(e) => setPlanForm((p) => ({ ...p, max_users: Number(e.target.value) }))} />
                  <input className="rounded-lg border px-3 py-2 text-sm" type="number" min={1} value={planForm.storage_limit_gb} onChange={(e) => setPlanForm((p) => ({ ...p, storage_limit_gb: Number(e.target.value) }))} />
                </div>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Modüller (virgülle)" value={planForm.modules} onChange={(e) => setPlanForm((p) => ({ ...p, modules: e.target.value }))} />
                <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"><PlusCircle className="h-4 w-4" /> Ekle</button>
              </div>
            </form>

            <form onSubmit={assignLisans} className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-bold">Firmaya Lisans Ata</h3>
              <div className="space-y-2">
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={atamaForm.plan_id} onChange={(e) => setAtamaForm((p) => ({ ...p, plan_id: e.target.value }))} required>
                  <option value="">Plan seçin</option>
                  {planlar.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.code})</option>)}
                </select>
                <select className="w-full rounded-lg border px-3 py-2 text-sm" value={atamaForm.status} onChange={(e) => setAtamaForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="active">Aktif</option>
                  <option value="trial">Deneme</option>
                  <option value="suspended">Askıda</option>
                </select>
                <input className="w-full rounded-lg border px-3 py-2 text-sm" type="datetime-local" value={atamaForm.ends_at} onChange={(e) => setAtamaForm((p) => ({ ...p, ends_at: e.target.value }))} />
                {selectedPlan && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-700">
                    Plan özeti: {selectedPlan.max_users} kullanıcı, {selectedPlan.storage_limit_gb} GB, modüller: {selectedPlan.modules.join(", ") || "-"}
                  </div>
                )}
                <button disabled={!selectedFirmaId || busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"><Save className="h-4 w-4" /> Ata</button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-bold">Planlar ve Geçmiş</h3>
              <div className="space-y-2">
                {planlar.map((plan) => (
                  <div key={plan.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{plan.name} ({plan.code})</p>
                      <span className="text-xs text-slate-500">Kullanıcı: {plan.max_users} · Depolama: {plan.storage_limit_gb}GB</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">Modüller: {plan.modules.join(", ") || "-"}</p>
                  </div>
                ))}
              </div>
              {selectedFirmaId && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Seçili Firma Lisans Geçmişi</p>
                  <div className="space-y-1 text-sm text-slate-700">
                    {lisanslar.length === 0 ? (
                      <p>Kayıt yok</p>
                    ) : (
                      lisanslar.map((sub) => (
                        <p key={sub.id}>{sub.status} · plan: {sub.plan_id} · başlangıç: {new Date(sub.starts_at).toLocaleString("tr-TR")} · bitiş: {sub.ends_at ? new Date(sub.ends_at).toLocaleString("tr-TR") : "-"}</p>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </section>
    </div>
  );
}

export default function PlatformTenantsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[380px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>}>
      <PlatformTenantsPageContent />
    </Suspense>
  );
}
