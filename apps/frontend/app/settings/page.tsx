"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Bell,
  Shield,
  Settings2,
  Save,
  RotateCcw,
  Database,
  FileCog,
  Workflow,
  Globe,
  Clock3,
  Wallet,
  Users,
  CheckCircle2,
  Lock,
  Mail,
  Info,
  Check,
  Image as ImageIcon,
  Building,
  Plus,
  Trash2,
  MapPin,
  Layers,
  Sparkles,
  DownloadCloud,
  UploadCloud,
  FileSpreadsheet,
} from "lucide-react";
import { api, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { fetchTenantContext, saveTenantContext, type TenantContext } from "@/lib/tenant-context";
import { getTokenPayloadFromStorage, getRoles } from "@/lib/auth";

type SettingsState = {
  companyName: string;
  taxNumber: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  defaultCurrency: "TRY" | "USD" | "EUR";
  vatRate: number;
  locale: string;
  timezone: string;
  dateFormat: string;
  lowStockThreshold: number;
  autoInvoiceNo: boolean;
  invoicePrefix: string;
  requireApprovalForExpenses: boolean;
  defaultPaymentTermDays: number;
  sessionTimeoutMinutes: number;
  mfaRequiredForAdmins: boolean;
  loginIpWhitelist: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  dailySummaryHour: string;
  backupFrequency: "daily" | "weekly";
  retentionDays: number;
  // Markalama ve Genişletilmiş Alanlar
  sector: string;
  country: string;
  themeColor: string;
  logoUrl: string;
  emailMode: "platform" | "tenant_domain";
  fromName: string;
  fromEmail: string;
  replyTo: string;
  emailDomainVerified: boolean;
};

const DEFAULTS: SettingsState = {
  companyName: "",
  taxNumber: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  defaultCurrency: "TRY",
  vatRate: 20,
  locale: "tr-TR",
  timezone: "Europe/Istanbul",
  dateFormat: "DD.MM.YYYY",
  lowStockThreshold: 10,
  autoInvoiceNo: true,
  invoicePrefix: "SMK-INV",
  requireApprovalForExpenses: true,
  defaultPaymentTermDays: 30,
  sessionTimeoutMinutes: 60,
  mfaRequiredForAdmins: true,
  loginIpWhitelist: "",
  emailNotifications: true,
  pushNotifications: false,
  dailySummaryHour: "18:00",
  backupFrequency: "daily",
  retentionDays: 180,
  sector: "",
  country: "",
  themeColor: "indigo",
  logoUrl: "",
  emailMode: "platform",
  fromName: "",
  fromEmail: "",
  replyTo: "",
  emailDomainVerified: false,
};

const COLORS = [
  { id: "indigo", name: "İndigo", bg: "bg-indigo-600", ring: "ring-indigo-400" },
  { id: "emerald", name: "Zümrüt", bg: "bg-emerald-600", ring: "ring-emerald-400" },
  { id: "violet", name: "Menekşe", bg: "bg-violet-600", ring: "ring-violet-400" },
  { id: "rose", name: "Gül", bg: "bg-rose-600", ring: "ring-rose-400" },
  { id: "amber", name: "Kehribar", bg: "bg-amber-600", ring: "ring-amber-400" },
  { id: "blue", name: "Mavi", bg: "bg-blue-600", ring: "ring-blue-400" },
  { id: "slate", name: "Arduvaz", bg: "bg-slate-600", ring: "ring-slate-400" },
];

const INPUT_CLASS = "corp-input";
const SELECT_CLASS = "corp-select";
const LABEL_SWITCH_CLASS = "flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors duration-150 cursor-pointer";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "hierarchy" | "finance" | "email" | "security">("general");

  // Hiyerarşi Yönetimi States
  const [customers, setCustomers] = useState<any[]>([]);
  const [regionsByCustomer, setRegionsByCustomer] = useState<Record<string, any[]>>({});
  const [branchesByRegion, setBranchesByRegion] = useState<Record<string, any[]>>({});
  const [loadingHierarchyData, setLoadingHierarchyData] = useState(false);
  const [importingChain, setImportingChain] = useState<string | null>(null);
  const [importingMessage, setImportingMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [regionForm, setRegionForm] = useState({ customer_id: "", name: "", city: "", code: "" });
  const [branchForm, setBranchForm] = useState({ region_id: "", name: "", address: "", code: "" });

  useEffect(() => {
    // Firma Admin rol doğrulaması
    const payload = getTokenPayloadFromStorage();
    const roles = getRoles(payload);
    const hasAdminRights = roles.includes("admin") || roles.includes("platform_admin");
    setIsAdmin(hasAdminRights);
    setIsPlatformAdmin(roles.includes("platform_admin"));

    if (hasAdminRights) {
      (async () => {
        const ctx = await fetchTenantContext(true);
        if (!ctx) return;
        setSettings((prev) => ({
          ...prev,
          companyName: ctx.tenant_name || prev.companyName,
          taxNumber: ctx.tax_no || "",
          contactEmail: ctx.domain ? `info@${ctx.domain}` : prev.contactEmail,
          invoicePrefix: ctx.subdomain || prev.invoicePrefix,
          contactPhone: ctx.contact_phone || "",
          address: ctx.address || "",
          defaultCurrency: (ctx.default_currency as any) || "TRY",
          vatRate: ctx.vat_rate !== undefined ? ctx.vat_rate : 20,
          lowStockThreshold: ctx.low_stock_threshold !== undefined ? ctx.low_stock_threshold : 10,
          autoInvoiceNo: ctx.auto_invoice_no !== undefined ? ctx.auto_invoice_no : true,
          requireApprovalForExpenses: ctx.require_approval_for_expenses !== undefined ? ctx.require_approval_for_expenses : true,
          defaultPaymentTermDays: ctx.default_payment_term_days !== undefined ? ctx.default_payment_term_days : 30,
          locale: ctx.locale || "tr-TR",
          timezone: ctx.timezone || "Europe/Istanbul",
          dateFormat: ctx.date_format || "DD.MM.YYYY",
          sessionTimeoutMinutes: ctx.session_timeout_minutes !== undefined ? ctx.session_timeout_minutes : 60,
          mfaRequiredForAdmins: ctx.mfa_required_for_admins !== undefined ? ctx.mfa_required_for_admins : true,
          loginIpWhitelist: ctx.login_ip_whitelist || "",
          emailNotifications: ctx.email_notifications !== undefined ? ctx.email_notifications : true,
          pushNotifications: ctx.push_notifications !== undefined ? ctx.push_notifications : false,
          dailySummaryHour: ctx.daily_summary_hour || "18:00",
          backupFrequency: (ctx.backup_frequency as any) || "daily",
          retentionDays: ctx.retention_days !== undefined ? ctx.retention_days : 180,
          // Eklenen kurumsal, markalama ve e-posta ayarlarının yüklenmesi
          sector: ctx.sector || "",
          country: ctx.country || "",
          themeColor: ctx.theme_color || "indigo",
          logoUrl: ctx.logo_url || "",
          emailMode: (ctx.email_mode as any) || "platform",
          fromName: ctx.from_name || "",
          fromEmail: ctx.from_email || "",
          replyTo: ctx.reply_to || "",
          emailDomainVerified: ctx.email_domain_verified || false,
        }));
      })();
    }
  }, []);

  // Hiyerarşi Verilerini Yükleme
  async function loadHierarchy() {
    setLoadingHierarchyData(true);
    try {
      const custsData = await apiGet<any[]>("/projects/customers").catch(() => []);
      const custs = Array.isArray(custsData) ? custsData : [];
      setCustomers(custs);

      const regionMap: Record<string, any[]> = {};
      const branchMap: Record<string, any[]> = {};

      await Promise.all(custs.map(async (c: any) => {
        const regs = await apiGet(`/projects/regions/${c.id}`).catch(() => []);
        regionMap[c.id] = Array.isArray(regs) ? regs : [];
        await Promise.all((regionMap[c.id] || []).map(async (r: any) => {
          const brs = await apiGet(`/projects/branches/${r.id}`).catch(() => []);
          branchMap[r.id] = Array.isArray(brs) ? brs : [];
        }));
      }));

      setRegionsByCustomer(regionMap);
      setBranchesByRegion(branchMap);
    } catch (err) {
      console.error("Hiyerarşi verileri yüklenemedi:", err);
    } finally {
      setLoadingHierarchyData(false);
    }
  }

  // Sadece Hiyerarşi sekmesi aktif olduğunda yükleme tetikleme
  useEffect(() => {
    if (activeTab === "hierarchy" && isAdmin) {
      loadHierarchy();
    }
  }, [activeTab, isAdmin]);

  const isValid = useMemo(() => {
    if (!settings.companyName.trim()) return false;
    if (!settings.contactEmail.includes("@")) return false;
    if (settings.vatRate < 0 || settings.vatRate > 100) return false;
    if (settings.lowStockThreshold < 0) return false;
    if (settings.defaultPaymentTermDays < 0) return false;
    if (settings.sessionTimeoutMinutes < 5) return false;
    if (settings.retentionDays < 30) return false;
    if (settings.emailMode === "tenant_domain") {
      if (settings.fromEmail && !settings.fromEmail.includes("@")) return false;
      if (settings.replyTo && !settings.replyTo.includes("@")) return false;
    }
    return true;
  }, [settings]);

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  // Kaydetme Fonksiyonu (Firma Ayarları)
  async function handleSave() {
    if (!settings.companyName.trim()) {
      alert("Lütfen 'Firma Resmi Adı' alanını doldurun.");
      return;
    }
    if (!settings.contactEmail.trim() || !settings.contactEmail.includes("@")) {
      alert("Lütfen geçerli bir 'İrtibat E-posta Adresi' girin (örn: info@firma.com).");
      return;
    }
    if (settings.vatRate < 0 || settings.vatRate > 100) {
      alert("Varsayılan KDV Oranı 0 ile 100 arasında olmalıdır.");
      return;
    }
    if (settings.lowStockThreshold < 0) {
      alert("Kritik Stok Uyarı Eşiği 0'dan küçük olamaz.");
      return;
    }
    if (settings.defaultPaymentTermDays < 0) {
      alert("Varsayılan Ödeme Vadesi 0'dan küçük olamaz.");
      return;
    }
    if (settings.sessionTimeoutMinutes < 5) {
      alert("Maksimum Oturum Zaman Aşımı en az 5 dakika olmalıdır.");
      return;
    }
    if (settings.retentionDays < 30) {
      alert("Yedek Saklama Süresi en az 30 gün olmalıdır.");
      return;
    }
    if (settings.emailMode === "tenant_domain") {
      if (settings.fromEmail && !settings.fromEmail.includes("@")) {
        alert("Lütfen geçerli bir 'Gönderici E-postası' girin.");
        return;
      }
      if (settings.replyTo && !settings.replyTo.includes("@")) {
        alert("Lütfen geçerli bir 'Yanıt E-posta Adresi' girin.");
        return;
      }
    }
    setSaving(true);
    try {
      const [profile, ctx] = await Promise.all([
        apiPut<TenantContext>("/auth/tenant-context/profile", {
          tenant_name: settings.companyName.trim(),
          logo_url: settings.logoUrl.trim() || null,
        }),
        apiPut<TenantContext>("/auth/tenant-context/settings", {
          tax_no: settings.taxNumber.trim() || null,
          sector: settings.sector.trim() || null,
          country: settings.country.trim() || null,
          theme_color: settings.themeColor,
          domain: settings.contactEmail.includes("@") ? settings.contactEmail.split("@")[1] : null,
          subdomain: settings.invoicePrefix.trim().toLowerCase() || null,
          contact_phone: settings.contactPhone.trim() || null,
          address: settings.address.trim() || null,
          default_currency: settings.defaultCurrency,
          vat_rate: settings.vatRate,
          low_stock_threshold: settings.lowStockThreshold,
          auto_invoice_no: settings.autoInvoiceNo,
          require_approval_for_expenses: settings.requireApprovalForExpenses,
          default_payment_term_days: settings.defaultPaymentTermDays,
          locale: settings.locale.trim(),
          timezone: settings.timezone.trim(),
          date_format: settings.dateFormat.trim(),
          session_timeout_minutes: settings.sessionTimeoutMinutes,
          mfa_required_for_admins: settings.mfaRequiredForAdmins,
          login_ip_whitelist: settings.loginIpWhitelist.trim() || null,
          email_notifications: settings.emailNotifications,
          push_notifications: settings.pushNotifications,
          daily_summary_hour: settings.dailySummaryHour.trim(),
          backup_frequency: settings.backupFrequency,
          retention_days: settings.retentionDays,
          // Eklenen e-posta ayarlarının backend'e gönderilmesi
          email_mode: settings.emailMode,
          from_name: settings.fromName.trim() || null,
          from_email: settings.fromEmail.trim() || null,
          reply_to: settings.replyTo.trim() || null,
        }),
      ]);

      saveTenantContext({ ...ctx, tenant_name: profile.tenant_name, logo_url: profile.logo_url });
      setSavedAt(new Date().toLocaleString("tr-TR"));
      alert("Firma ayarları başarıyla kaydedildi.");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Ayarlar kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSettings(DEFAULTS);
    setSavedAt(null);
  }

  // Hiyerarşi Mutasyonları (Ekleme / Güncelleme / Silme)
  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) return;
    try {
      await apiPost("/projects/customers", { name: customerName.trim() });
      setCustomerName("");
      await loadHierarchy();
      alert("Müşteri başarıyla eklendi.");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Müşteri eklenemedi.");
    }
  }

  async function handleCreateRegion(e: React.FormEvent) {
    e.preventDefault();
    if (!regionForm.customer_id || !regionForm.name.trim() || !regionForm.city.trim()) {
      alert("Lütfen gerekli alanları doldurun.");
      return;
    }
    try {
      const payload = {
        ...regionForm,
        code: regionForm.code.trim() || null,
      };
      await apiPost("/projects/regions", payload);
      setRegionForm({ customer_id: "", name: "", city: "", code: "" });
      await loadHierarchy();
      alert("Bölge başarıyla eklendi.");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Bölge eklenemedi.");
    }
  }

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!branchForm.region_id || !branchForm.name.trim()) {
      alert("Lütfen gerekli alanları doldurun.");
      return;
    }
    try {
      const payload = {
        ...branchForm,
        code: branchForm.code.trim() || null,
        address: branchForm.address.trim() || null,
      };
      await apiPost("/projects/branches", payload);
      setBranchForm({ region_id: "", name: "", address: "", code: "" });
      await loadHierarchy();
      alert("Şube başarıyla eklendi.");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Şube eklenemedi.");
    }
  }

  async function handleRenameCustomer(id: string, current: string) {
    const name = prompt("Yeni müşteri adı", current);
    if (!name || !name.trim()) return;
    try {
      await apiPatch(`/projects/customers/${id}`, { name: name.trim() });
      await loadHierarchy();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Ad değiştirilemedi.");
    }
  }

  async function handleRenameRegion(id: string, current: any) {
    const name = prompt("Yeni bölge adı", current.name);
    if (!name || !name.trim()) return;
    try {
      await apiPatch(`/projects/regions/${id}`, { name: name.trim() });
      await loadHierarchy();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Ad değiştirilemedi.");
    }
  }

  async function handleRenameBranch(id: string, current: any) {
    const name = prompt("Yeni şube adı", current.name);
    if (!name || !name.trim()) return;
    try {
      await apiPatch(`/projects/branches/${id}`, { name: name.trim() });
      await loadHierarchy();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Ad değiştirilemedi.");
    }
  }

  async function handleDeleteCustomer(id: string) {
    if (!confirm("Bu müşteriyi silmek istediğinize emin misiniz? Altındaki tüm bölge ve şubeler de silinecektir.")) return;
    try {
      await apiDelete(`/projects/customers/${id}`);
      await loadHierarchy();
      alert("Müşteri silindi.");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Silinemedi.");
    }
  }

  async function handleDeleteRegion(id: string) {
    if (!confirm("Bu bölgeyi silmek istediğinize emin misiniz? Altındaki tüm şubeler de silinecektir.")) return;
    try {
      await apiDelete(`/projects/regions/${id}`);
      await loadHierarchy();
      alert("Bölge silindi.");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Silinemedi.");
    }
  }

  async function handleDeleteBranch(id: string) {
    if (!confirm("Bu şubeyi silmek istediğinize emin misiniz?")) return;
    try {
      await apiDelete(`/projects/branches/${id}`);
      await loadHierarchy();
      alert("Şube silindi.");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Silinemedi.");
    }
  }

  async function handleImportTemplateChain(chainName: string) {
    setImportingChain(chainName);
    setImportingMessage(null);
    try {
      const res = await apiPost<any>("/projects/hierarchy/import-template-chain", {
        chain_name: chainName
      });
      setImportingMessage({
        type: "success",
        text: res?.message || `Başarıyla içe aktarıldı. ${res?.added_branches || 0} yeni şube eklendi.`
      });
      await loadHierarchy();
    } catch (err: any) {
      console.error(err);
      setImportingMessage({
        type: "error",
        text: err?.response?.data?.detail || "Şablon içe aktarılırken bir hata oluştu."
      });
    } finally {
      setImportingChain(null);
    }
  }

  async function handleDownloadCSV(chainName: string) {
    try {
      const response = await api.get(`/projects/hierarchy/download-csv`, {
        params: { chain: chainName },
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${chainName.toLowerCase()}_sablon_subeler.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("CSV indirilemedi:", err);
      alert("Şablon CSV indirilirken bir hata oluştu.");
    }
  }

  async function handleImportCustomCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Lütfen geçerli bir .csv dosyası seçin.");
      return;
    }
    
    setImportingChain("custom_csv");
    setImportingMessage(null);
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await apiPost<any>("/projects/hierarchy/import-custom-csv", formData, true);
      setImportingMessage({
        type: "success",
        text: res?.message || `Özel CSV başarıyla aktarıldı.`
      });
      await loadHierarchy();
    } catch (err: any) {
      console.error(err);
      setImportingMessage({
        type: "error",
        text: err?.response?.data?.detail || "CSV aktarılırken bir hata oluştu."
      });
    } finally {
      setImportingChain(null);
      e.target.value = "";
    }
  }

  // Yükleme durumu
  if (isAdmin === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        <span className="text-sm font-semibold text-slate-500">Yetkiler ve Sistem Ayarları Yükleniyor...</span>
      </div>
    );
  }

  // Yetkisiz erişim ekranı
  if (isAdmin === false) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200/80 bg-white/70 backdrop-blur-xl p-8 text-center shadow-xl space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 ring-4 ring-amber-100/50">
            <Lock className="h-8 w-8 stroke-[1.5]" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">Yetkisiz Erişim</h3>
            <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
              Sistem ayarları sayfası; kurumsal entegrasyonlar, finansal varsayımlar ve güvenlik politikaları içerdiğinden yalnızca <strong>Firma Yöneticisi</strong> rolüne sahip kullanıcılar tarafından görüntülenebilir ve değiştirilebilir.
            </p>
          </div>
          <div className="pt-2">
            <Link href="/" className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg active:scale-[0.98]">
              Ana Sayfaya Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Premium Header Gradient */}
      <div className="corp-header">
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              Sistem Ayarları <span className="rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-indigo-200 uppercase">Firma Yönetimi</span>
            </h2>
            <p className="mt-1.5 text-xs text-slate-350 max-w-3xl">
              Firma yasal bilgileri, organizasyon şeması hiyerarşisi, kurumsal e-posta entegrasyonları, finansal varsayımlar ve güvenlik politikalarını tek bir merkezi panelden yönetin.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-full self-start lg:self-center">
            <CheckCircle2 className="h-4 w-4" />
            {savedAt ? `Son kayıt: ${savedAt}` : "Değişiklikler kaydedilmedi"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          {/* Dikey Sekmeler - Desktop */}
          <div className="hidden lg:flex flex-col gap-1 corp-card p-3">
            <button
              onClick={() => setActiveTab("general")}
              className={`flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 ${
                activeTab === "general"
                  ? "bg-indigo-50/70 text-indigo-600 border-l-4 border-indigo-600"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Building2 className="h-4.5 w-4.5" />
              Kurumsal & Markalama
            </button>
            <button
              onClick={() => setActiveTab("hierarchy")}
              className={`flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 ${
                activeTab === "hierarchy"
                  ? "bg-indigo-50/70 text-indigo-600 border-l-4 border-indigo-600"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Layers className="h-4.5 w-4.5" />
              Organizasyon & Hiyerarşi
            </button>
            <button
              onClick={() => setActiveTab("finance")}
              className={`flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 ${
                activeTab === "finance"
                  ? "bg-indigo-50/70 text-indigo-600 border-l-4 border-indigo-600"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Workflow className="h-4.5 w-4.5" />
              Operasyon & Finans
            </button>
            <button
              onClick={() => setActiveTab("email")}
              className={`flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 ${
                activeTab === "email"
                  ? "bg-indigo-50/70 text-indigo-600 border-l-4 border-indigo-600"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Mail className="h-4.5 w-4.5" />
              E-posta & Bildirimler
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 ${
                activeTab === "security"
                  ? "bg-indigo-50/70 text-indigo-600 border-l-4 border-indigo-600"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Shield className="h-4.5 w-4.5" />
              Güvenlik & Yedekleme
            </button>
          </div>

          {/* Yatay Sekmeler - Mobile */}
          <div className="flex lg:hidden overflow-x-auto gap-2 pb-2 scrollbar-none">
            <button
              onClick={() => setActiveTab("general")}
              className={`flex items-center gap-2 shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-150 ${
                activeTab === "general"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Kurumsal
            </button>
            <button
              onClick={() => setActiveTab("hierarchy")}
              className={`flex items-center gap-2 shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-150 ${
                activeTab === "hierarchy"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Hiyerarşi
            </button>
            <button
              onClick={() => setActiveTab("finance")}
              className={`flex items-center gap-2 shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-150 ${
                activeTab === "finance"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              <Workflow className="h-3.5 w-3.5" />
              Finans
            </button>
            <button
              onClick={() => setActiveTab("email")}
              className={`flex items-center gap-2 shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-150 ${
                activeTab === "email"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              E-posta
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`flex items-center gap-2 shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-150 ${
                activeTab === "security"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              Güvenlik
            </button>
          </div>

          {/* Yönetim Kısayolları */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2.5 shadow-sm hover:shadow-md/50 transition-all duration-200">
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Settings2 className="h-4 w-4 text-indigo-500" /> Yönetim Kısayolları
            </h3>
            <Link href="/admin/users" className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3.5 py-3 text-xs font-bold text-slate-700 bg-slate-50/20 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all duration-150">
              <Users className="h-4 w-4 text-slate-400" /> Kullanıcı ve Rol Yönetimi
            </Link>
          </div>
        </aside>

        {/* Tab Content Panel */}
        <section className="lg:col-span-3">
          {/* TAB 1: KURUMSAL & MARKALAMA */}
          {activeTab === "general" && (
            <div className="corp-card p-5 sm:p-8 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2.5">
                  <Building2 className="h-5 w-5 text-indigo-500" /> Kurumsal Profil & Arayüz Markalama
                </h3>
                <p className="text-xs text-slate-500 mt-1">Firma resmi yasal bilgilerini ve panel marka görsel ayarlarını buradan yönetebilirsiniz.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500">Firma Resmi Adı *</label>
                    {!isPlatformAdmin && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50/50 border border-amber-200/40 rounded-full px-2.5 py-0.5 animate-in fade-in duration-200">
                        <Lock className="h-2.5 w-2.5 text-amber-500 animate-pulse" /> Resmi Kayıt - Sistem Kontrollü
                      </span>
                    )}
                  </div>
                  <input
                    className={`${INPUT_CLASS} disabled:opacity-70 disabled:bg-slate-100/40 disabled:cursor-not-allowed disabled:hover:border-slate-200`}
                    placeholder="Firma adı"
                    value={settings.companyName}
                    onChange={(e) => update("companyName", e.target.value)}
                    disabled={!isPlatformAdmin}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500">Vergi Numarası</label>
                    {!isPlatformAdmin && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50/50 border border-amber-200/40 rounded-full px-2.5 py-0.5 animate-in fade-in duration-200">
                        <Lock className="h-2.5 w-2.5 text-amber-500" /> Resmi Kayıt - Sistem Kontrollü
                      </span>
                    )}
                  </div>
                  <input
                    className={`${INPUT_CLASS} disabled:opacity-70 disabled:bg-slate-100/40 disabled:cursor-not-allowed disabled:hover:border-slate-200`}
                    placeholder="Vergi numarası"
                    value={settings.taxNumber}
                    onChange={(e) => update("taxNumber", e.target.value)}
                    disabled={!isPlatformAdmin}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Sektör</label>
                  <input className={INPUT_CLASS} placeholder="Örn: İnşaat, Mekanik, Lojistik" value={settings.sector} onChange={(e) => update("sector", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Ülke</label>
                  <input className={INPUT_CLASS} placeholder="Örn: Türkiye, Almanya" value={settings.country} onChange={(e) => update("country", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">İrtibat E-posta Adresi *</label>
                  <input className={INPUT_CLASS} placeholder="Örn: info@firma.com" value={settings.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">İrtibat Telefon Numarası</label>
                  <input className={INPUT_CLASS} placeholder="Telefon" value={settings.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
                </div>
              </div>

              {/* Logo URL ve Önizleme */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500">Firma Logo Bağlantısı (URL)</label>
                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <input className={INPUT_CLASS} placeholder="https://domain.com/assets/logo.png" value={settings.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} />
                  </div>
                  {settings.logoUrl ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 p-1">
                      <img src={settings.logoUrl} alt="Logo Önizleme" className="h-full w-full object-contain" onError={(e) => { (e.target as any).src = "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=100"; }} />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/20 text-slate-400">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
              </div>

              {/* Tema Rengi Seçici */}
              <div className="space-y-2.5 pt-2">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                  ERP Panel Tema Rengi
                  <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-semibold">Branding</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                  {COLORS.map((color) => {
                    const isSelected = settings.themeColor === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => update("themeColor", color.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all duration-200 ${
                          isSelected
                            ? `bg-slate-50 border-slate-900 text-slate-900 ring-2 ${color.ring}`
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50/50"
                        }`}
                      >
                        <span className={`h-3 w-3 rounded-full shrink-0 ${color.bg}`} />
                        {color.name}
                        {isSelected && <Check className="h-3 w-3 ml-auto text-slate-900" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">Açık Adres</label>
                <textarea className="corp-input" rows={3} placeholder="Yasal açık adres" value={settings.address} onChange={(e) => update("address", e.target.value)} />
              </div>
            </div>
          )}

          {/* TAB 2: ORGANİZASYON & HİYERARŞİ (NEW EMBEDDED TAB) */}
          {activeTab === "hierarchy" && (
            <div className="corp-card p-5 sm:p-8 space-y-6">
              <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2.5">
                    <Layers className="h-5 w-5 text-indigo-500" /> Organizasyon & Hiyerarşi Yönetimi
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Müşteri firmaları, onlara bağlı bölgeleri ve bu bölgelerin altındaki şubeleri merkezi olarak yönetin.</p>
                </div>
                <button
                  onClick={loadHierarchy}
                  disabled={loadingHierarchyData}
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all duration-150 shrink-0 self-start"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${loadingHierarchyData ? "animate-spin" : ""}`} />
                  {loadingHierarchyData ? "Yükleniyor..." : "Yenile"}
                </button>
              </div>

              {/* Hiyerarşi Ekleme Formları */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* 1. Müşteri Ekle */}
                <form onSubmit={handleCreateCustomer} className="rounded-2xl border border-slate-150 bg-slate-50/20 p-4 space-y-3 shadow-sm hover:border-slate-350 transition-colors duration-200">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Building className="h-4 w-4 text-indigo-500" /> Müşteri Ekle
                  </p>
                  <div className="space-y-1.5">
                    <input
                      className={INPUT_CLASS}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Müşteri firma resmi adı"
                      required
                    />
                  </div>
                  <button type="submit" className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-xs font-bold text-white shadow transition-all active:scale-[0.98]">
                    <Plus className="h-3.5 w-3.5" /> Müşteri Ekle
                  </button>
                </form>

                {/* 2. Bölge Ekle */}
                <form onSubmit={handleCreateRegion} className="rounded-2xl border border-slate-150 bg-slate-50/20 p-4 space-y-3 shadow-sm hover:border-slate-350 transition-colors duration-200">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Globe className="h-4 w-4 text-indigo-500" /> Bölge Ekle
                  </p>
                  <select
                    className={SELECT_CLASS}
                    value={regionForm.customer_id}
                    onChange={(e) => setRegionForm({ ...regionForm, customer_id: e.target.value })}
                    required
                  >
                    <option value="">Bağlı Müşteri Seçin *</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    className={INPUT_CLASS}
                    value={regionForm.name}
                    onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })}
                    placeholder="Bölge adı (Örn: Ege Bölgesi)"
                    required
                  />
                  <input
                    className={INPUT_CLASS}
                    value={regionForm.city}
                    onChange={(e) => setRegionForm({ ...regionForm, city: e.target.value })}
                    placeholder="Şehir (Örn: İzmir)"
                    required
                  />
                  <button type="submit" className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-xs font-bold text-white shadow transition-all active:scale-[0.98]">
                    <Plus className="h-3.5 w-3.5" /> Bölge Ekle
                  </button>
                </form>

                {/* 3. Şube Ekle */}
                <form onSubmit={handleCreateBranch} className="rounded-2xl border border-slate-150 bg-slate-50/20 p-4 space-y-3 shadow-sm hover:border-slate-350 transition-colors duration-200">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <MapPin className="h-4 w-4 text-indigo-500" /> Şube Ekle
                  </p>
                  <select
                    className={SELECT_CLASS}
                    value={branchForm.region_id}
                    onChange={(e) => setBranchForm({ ...branchForm, region_id: e.target.value })}
                    required
                  >
                    <option value="">Bağlı Bölge Seçin *</option>
                    {Object.values(regionsByCustomer).flat().map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.city})</option>)}
                  </select>
                  <input
                    className={INPUT_CLASS}
                    value={branchForm.name}
                    onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                    placeholder="Şube adı (Örn: Bornova Şubesi)"
                    required
                  />
                  <input
                    className={INPUT_CLASS}
                    value={branchForm.address}
                    onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                    placeholder="Şube açık adresi (Opsiyonel)"
                  />
                  <button type="submit" className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-xs font-bold text-white shadow transition-all active:scale-[0.98]">
                    <Plus className="h-3.5 w-3.5" /> Şube Ekle
                  </button>
                </form>
              </div>

              {/* Hiyerarşik Ağaç Görünümü */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Aktif Kurumsal Hiyerarşi Ağacı</h4>

                {loadingHierarchyData && customers.length === 0 ? (
                  <div className="flex justify-center items-center py-12 text-slate-400 text-xs font-semibold gap-2">
                    <RotateCcw className="h-4 w-4 animate-spin text-indigo-500" /> Yükleniyor...
                  </div>
                ) : customers.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl text-slate-400 text-xs font-semibold">
                    Kayıtlı müşteri bulunamadı. Üstteki formları kullanarak ilk hiyerarşiyi oluşturabilirsiniz.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {customers.map((c) => (
                      <div key={c.id} className="border border-slate-200/80 bg-slate-50/10 rounded-2xl p-4 shadow-sm hover:shadow transition-all duration-150">
                        {/* Müşteri Başlığı */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                          <button
                            type="button"
                            onClick={() => handleRenameCustomer(c.id, c.name)}
                            className="font-bold text-slate-800 text-sm flex items-center gap-2 text-left hover:text-indigo-600 transition-colors"
                            title="İsmi düzenlemek için tıklayın"
                          >
                            <Building className="h-4.5 w-4.5 text-indigo-600 shrink-0" />
                            {c.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomer(c.id)}
                            className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1.5 rounded-lg transition-all"
                            title="Müşteriyi sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Bölgeler - Girintili */}
                        <div className="mt-3 pl-4 sm:pl-6 border-l border-dashed border-slate-200 space-y-3">
                          {(!regionsByCustomer[c.id] || regionsByCustomer[c.id].length === 0) ? (
                            <p className="text-[11px] text-slate-400 font-semibold italic py-1">Bu müşteriye bağlı bir bölge tanımlanmamış.</p>
                          ) : (
                            regionsByCustomer[c.id].map((r: any) => (
                              <div key={r.id} className="border border-slate-100 bg-white rounded-xl p-3 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => handleRenameRegion(r.id, r)}
                                    className="text-xs font-bold text-slate-700 flex items-center gap-1.5 hover:text-indigo-600 transition-colors text-left"
                                    title="Bölge ismini düzenlemek için tıklayın"
                                  >
                                    <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    {r.name} <span className="text-[10px] text-slate-400 font-semibold">({r.city})</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRegion(r.id)}
                                    className="text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1 rounded-md transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                {/* Şubeler - Girintili */}
                                <div className="mt-2 pl-4 sm:pl-5 border-l border-dotted border-slate-100 flex flex-wrap gap-2">
                                  {(!branchesByRegion[r.id] || branchesByRegion[r.id].length === 0) ? (
                                    <p className="text-[10px] text-slate-400 italic py-0.5 font-semibold">Bölgeye bağlı şube yok.</p>
                                  ) : (
                                    branchesByRegion[r.id].map((b: any) => (
                                      <div key={b.id} className="inline-flex items-center gap-2 text-xs border border-slate-100 bg-slate-50/50 rounded-lg px-2.5 py-1.5 hover:border-slate-300 transition-all duration-150">
                                        <button
                                          type="button"
                                          onClick={() => handleRenameBranch(b.id, b)}
                                          className="font-bold text-slate-600 hover:text-indigo-600 transition-colors"
                                          title="Şube ismini düzenlemek için tıklayın"
                                        >
                                          <MapPin className="h-3 w-3 inline mr-1 text-slate-400 shrink-0" />
                                          {b.name}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteBranch(b.id)}
                                          className="text-rose-500 hover:text-rose-700 transition-colors shrink-0"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Hazır Zincir Market Şablonları */}
              <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" /> Hazır Zincir Market Şablonları
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Türkiye'nin en yaygın zincir marketlerinin güncel şube verilerini otomatik olarak kurumsal hiyerarşinize aktarın veya CSV şablonu olarak indirin.
                    </p>
                  </div>
                </div>

                {importingMessage && (
                  <div className={`p-4 rounded-xl text-xs flex items-center justify-between border ${
                    importingMessage.type === "success" 
                      ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                      : "bg-rose-50 border-rose-100 text-rose-800"
                  } transition-all duration-200`}>
                    <div className="flex items-center gap-2">
                      {importingMessage.type === "success" ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Info className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                      )}
                      <span className="font-semibold">{importingMessage.text}</span>
                    </div>
                    <button 
                      onClick={() => setImportingMessage(null)}
                      className="text-slate-400 hover:text-slate-600 text-sm font-bold px-1"
                    >
                      ×
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {/* Migros Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/10 p-4 flex flex-col justify-between space-y-4 hover:border-indigo-300 hover:bg-slate-50/30 transition-all duration-200 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">MİGROS</span>
                        <Building2 className="h-4 w-4 text-slate-400" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold mt-2">Macrocenter dahil tüm Migros mağazaları.</p>
                      <p className="text-xs font-black text-slate-700 mt-1">4.833 Aktif Şube</p>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleImportTemplateChain("Migros")}
                        disabled={importingChain !== null}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all active:scale-[0.98]"
                      >
                        {importingChain === "Migros" ? (
                          <RotateCcw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        ERP'ye Aktar
                      </button>
                      <button
                        onClick={() => handleDownloadCSV("Migros")}
                        className="inline-flex items-center justify-center p-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-sm transition-all"
                        title="CSV Şablonu İndir"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* A101 Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/10 p-4 flex flex-col justify-between space-y-4 hover:border-indigo-300 hover:bg-slate-50/30 transition-all duration-200 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">A101</span>
                        <Building2 className="h-4 w-4 text-slate-400" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold mt-2">Bölgesel A101 şube ağ şablonu.</p>
                      <p className="text-xs font-black text-slate-700 mt-1">957 Aktif Şube</p>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleImportTemplateChain("A101")}
                        disabled={importingChain !== null}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all active:scale-[0.98]"
                      >
                        {importingChain === "A101" ? (
                          <RotateCcw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        ERP'ye Aktar
                      </button>
                      <button
                        onClick={() => handleDownloadCSV("A101")}
                        className="inline-flex items-center justify-center p-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-sm transition-all"
                        title="CSV Şablonu İndir"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* BİM Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/10 p-4 flex flex-col justify-between space-y-4 hover:border-indigo-300 hover:bg-slate-50/30 transition-all duration-200 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">BİM</span>
                        <Building2 className="h-4 w-4 text-slate-400" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold mt-2">Bölgesel BİM şube ağ şablonu.</p>
                      <p className="text-xs font-black text-slate-700 mt-1">262 Aktif Şube</p>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleImportTemplateChain("BİM")}
                        disabled={importingChain !== null}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all active:scale-[0.98]"
                      >
                        {importingChain === "BİM" ? (
                          <RotateCcw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        ERP'ye Aktar
                      </button>
                      <button
                        onClick={() => handleDownloadCSV("BİM")}
                        className="inline-flex items-center justify-center p-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-sm transition-all"
                        title="CSV Şablonu İndir"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* All Chains Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/10 p-4 flex flex-col justify-between space-y-4 hover:border-indigo-300 hover:bg-slate-50/30 transition-all duration-200 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">TÜMÜ</span>
                        <Sparkles className="h-4 w-4 text-slate-400" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold mt-2">Tüm zincir market şubelerini tek seferde aktarın.</p>
                      <p className="text-xs font-black text-slate-700 mt-1">6.052 Aktif Şube</p>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleImportTemplateChain("all")}
                        disabled={importingChain !== null}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all active:scale-[0.98]"
                      >
                        {importingChain === "all" ? (
                          <RotateCcw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        ERP'ye Aktar
                      </button>
                      <button
                        onClick={() => handleDownloadCSV("all")}
                        className="inline-flex items-center justify-center p-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 shadow-sm transition-all"
                        title="Tüm Şablonu CSV İndir"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Custom CSV Upload Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/10 p-4 flex flex-col justify-between space-y-4 hover:border-indigo-300 hover:bg-slate-50/30 transition-all duration-200 shadow-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">ÖZEL CSV</span>
                        <UploadCloud className="h-4 w-4 text-slate-400" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold mt-2">Dışarıdan kendi hazırladığınız şube listesi CSV dosyasını aktarın.</p>
                      <p className="text-xs font-black text-slate-700 mt-1">Akıllı Alan Eşleştirme</p>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleImportCustomCSV}
                        disabled={importingChain !== null}
                        className="hidden"
                        id="custom-csv-file-input"
                      />
                      <label
                        htmlFor="custom-csv-file-input"
                        className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                          importingChain !== null ? "pointer-events-none opacity-50" : ""
                        }`}
                      >
                        {importingChain === "custom_csv" ? (
                          <RotateCcw className="h-3 w-3 animate-spin" />
                        ) : (
                          <UploadCloud className="h-3.5 w-3.5" />
                        )}
                        Dosya Seç & Aktar
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OPERASYON & FİNANS VARSAYIMLARI */}
          {activeTab === "finance" && (
            <div className="corp-card p-5 sm:p-8 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2.5">
                  <Workflow className="h-5 w-5 text-indigo-500" /> Operasyon & Finans Varsayımları
                </h3>
                <p className="text-xs text-slate-500 mt-1">Stok, onaylama, faturalama ve varsayılan vade süreçlerinin finansal ayarlarını düzenleyin.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Varsayılan Para Birimi</label>
                  <select className={SELECT_CLASS} value={settings.defaultCurrency} onChange={(e) => update("defaultCurrency", e.target.value as SettingsState["defaultCurrency"])}>
                    <option value="TRY">TRY (₺)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Varsayılan KDV Oranı (%)</label>
                  <input type="number" className={INPUT_CLASS} value={settings.vatRate} onChange={(e) => update("vatRate", Number(e.target.value))} placeholder="KDV %" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Kritik Stok Uyarı Eşiği</label>
                  <input type="number" className={INPUT_CLASS} value={settings.lowStockThreshold} onChange={(e) => update("lowStockThreshold", Number(e.target.value))} placeholder="Stok uyarısı adeti" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className={LABEL_SWITCH_CLASS}>
                  <span className="flex items-center gap-2.5 font-semibold text-slate-700">
                    <FileCog className="h-4.5 w-4.5 text-slate-400" /> Otomatik fatura numarası üretilsin
                  </span>
                  <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" checked={settings.autoInvoiceNo} onChange={(e) => update("autoInvoiceNo", e.target.checked)} />
                </label>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Fatura Seri/Önek</label>
                  <input className={INPUT_CLASS} placeholder="Örn: SMK-INV" value={settings.invoicePrefix} onChange={(e) => update("invoicePrefix", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className={LABEL_SWITCH_CLASS}>
                  <span className="flex items-center gap-2.5 font-semibold text-slate-700">
                    <Wallet className="h-4.5 w-4.5 text-slate-400" /> Giderler yönetici onayına düşsün
                  </span>
                  <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" checked={settings.requireApprovalForExpenses} onChange={(e) => update("requireApprovalForExpenses", e.target.checked)} />
                </label>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Varsayılan Ödeme Vadesi (Gün)</label>
                  <input type="number" className={INPUT_CLASS} value={settings.defaultPaymentTermDays} onChange={(e) => update("defaultPaymentTermDays", Number(e.target.value))} placeholder="Örn: 30" />
                </div>
              </div>

              {/* Bölgesel ve Zaman Ayarları */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Globe className="h-4.5 w-4.5 text-indigo-500" /> Bölgesel ve Zaman Ayarları</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">Yerel Dil Biçimi</label>
                    <input className={INPUT_CLASS} value={settings.locale} onChange={(e) => update("locale", e.target.value)} placeholder="tr-TR" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">Zaman Dilimi (Timezone)</label>
                    <input className={INPUT_CLASS} value={settings.timezone} onChange={(e) => update("timezone", e.target.value)} placeholder="Europe/Istanbul" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">Tarih Biçimi (Format)</label>
                    <input className={INPUT_CLASS} value={settings.dateFormat} onChange={(e) => update("dateFormat", e.target.value)} placeholder="DD.MM.YYYY" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: E-POSTA & BİLDİRİM AYARLARI */}
          {activeTab === "email" && (
            <div className="corp-card p-5 sm:p-8 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2.5">
                  <Mail className="h-5 w-5 text-indigo-500" /> E-posta & Entegrasyon Altyapısı
                </h3>
                <p className="text-xs text-slate-500 mt-1">Sistem tarafından gönderilen onay, şifre sıfırlama ve fatura e-postalarının kimliğini ve sıklığını yönetin.</p>
              </div>

              {/* E-posta Gönderim Türü Seçimi */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500">E-posta Gönderim Modu</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => update("emailMode", "platform")}
                    className={`flex flex-col text-left p-4 rounded-2xl border transition-all duration-200 ${
                      settings.emailMode === "platform"
                        ? "border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      Sistem Varsayılanı
                      {settings.emailMode === "platform" && <span className="h-2 w-2 rounded-full bg-indigo-600" />}
                    </span>
                    <span className="text-xs text-slate-500 mt-1 leading-relaxed">
                      E-postalar kurumsal sistem sunucusu üzerinden markalanarak yasal gönderim limitleriyle iletilir.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => update("emailMode", "tenant_domain")}
                    className={`flex flex-col text-left p-4 rounded-2xl border transition-all duration-200 ${
                      settings.emailMode === "tenant_domain"
                        ? "border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      Özel Alan Adı (Custom Domain)
                      {settings.emailMode === "tenant_domain" && <span className="h-2 w-2 rounded-full bg-indigo-600" />}
                    </span>
                    <span className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Kendi kurumsal alan adınız (örn: muhasebe@firma.com) üzerinden fatura ve durum mailleri göndermenizi sağlar.
                    </span>
                  </button>
                </div>
              </div>

              {/* Alan Adı Doğrulama ve DNS Uyarısı */}
              {settings.emailMode === "tenant_domain" && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">Gönderen Adı</label>
                      <input className={INPUT_CLASS} placeholder="Örn: Mekanik ERP Muhasebe" value={settings.fromName} onChange={(e) => update("fromName", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">Gönderici E-postası</label>
                      <input className={INPUT_CLASS} placeholder="Örn: fatura@firma.com" value={settings.fromEmail} onChange={(e) => update("fromEmail", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">Yanıt E-posta Adresi (Reply-To)</label>
                      <input className={INPUT_CLASS} placeholder="Örn: destek@firma.com" value={settings.replyTo} onChange={(e) => update("replyTo", e.target.value)} />
                    </div>
                  </div>

                  {settings.emailDomainVerified ? (
                    <div className="flex gap-3 rounded-xl bg-emerald-50 border border-emerald-200/60 p-4 text-emerald-800">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <span className="font-bold">Alan Adınız Doğrulanmıştır</span>
                        <p className="text-emerald-700/90 leading-relaxed">Özel e-posta altyapınız Resend entegrasyonu ile başarıyla eşleştirilmiştir. Mailleriniz kendi adresinizden gönderilmektedir.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3 rounded-xl bg-amber-50/80 border border-amber-200/60 p-4 text-amber-900">
                      <Info className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <span className="font-bold">DNS Kaydı & Alan Adı Doğrulaması Bekleniyor</span>
                        <p className="text-amber-800/90 leading-relaxed">
                          Özel e-postalarınızın SPAM kutusuna düşmemesi ve güvenle gönderilebilmesi için DNS panelinize DKIM / SPF kayıtları (TXT) girilmelidir. Lütfen kayıt listesini talep etmek için sistem yöneticinizle iletişime geçin.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sistem Bildirim Kanalları */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Bell className="h-4.5 w-4.5 text-indigo-500" /> Sistem Bildirimleri</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <label className={LABEL_SWITCH_CLASS}>
                    <span className="font-semibold text-slate-700">E-posta Bildirimleri Gönderilsin</span>
                    <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" checked={settings.emailNotifications} onChange={(e) => update("emailNotifications", e.target.checked)} />
                  </label>
                  <label className={LABEL_SWITCH_CLASS}>
                    <span className="font-semibold text-slate-700">Web Push Tarayıcı Bildirimleri</span>
                    <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" checked={settings.pushNotifications} onChange={(e) => update("pushNotifications", e.target.checked)} />
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">Günlük Yönetici Özet Raporu Saati</label>
                    <input type="time" className={INPUT_CLASS} value={settings.dailySummaryHour} onChange={(e) => update("dailySummaryHour", e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: GÜVENLİK & YEDEKLEME */}
          {activeTab === "security" && (
            <div className="corp-card p-5 sm:p-8 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2.5">
                  <Shield className="h-5 w-5 text-indigo-500" /> Güvenlik Politikaları & Oturum Denetimi
                </h3>
                <p className="text-xs text-slate-500 mt-1">İki faktörlü kimlik doğrulama, oturum zaman aşımı ve yetkili IP erişim kısıtlamalarını yönetin.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className={LABEL_SWITCH_CLASS}>
                  <span className="font-semibold text-slate-700">Yöneticiler için MFA / İki Faktörlü Doğrulama Zorunlu</span>
                  <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" checked={settings.mfaRequiredForAdmins} onChange={(e) => update("mfaRequiredForAdmins", e.target.checked)} />
                </label>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Maksimum Oturum Zaman Aşımı (Dakika)</label>
                  <input type="number" className={INPUT_CLASS} value={settings.sessionTimeoutMinutes} onChange={(e) => update("sessionTimeoutMinutes", Number(e.target.value))} placeholder="Oturum süresi (dk)" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">Erişim İzinli IP Beyaz Listesi (IP Whitelist - Virgülle ayırarak girin)</label>
                <textarea className="corp-input" rows={2} value={settings.loginIpWhitelist} onChange={(e) => update("loginIpWhitelist", e.target.value)} placeholder="Örn: 192.168.1.1, 10.0.0.1 (Boş bırakılırsa tüm dış IP'lerden oturum açılabilir)" />
              </div>

              {/* Veri Saklama ve Yedekleme Politikaları */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Database className="h-4.5 w-4.5 text-indigo-500" /> Yedekleme Politikaları</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-500">Yedekleme Sıklığı</label>
                      {!isPlatformAdmin && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50/50 border border-indigo-200/40 rounded-full px-2.5 py-0.5 animate-in fade-in duration-200">
                          <Lock className="h-2.5 w-2.5 text-indigo-500 animate-pulse" /> Altyapı - Sistem Kontrollü
                        </span>
                      )}
                    </div>
                    <select
                      className={`${SELECT_CLASS} disabled:opacity-70 disabled:bg-slate-100/40 disabled:cursor-not-allowed disabled:hover:border-slate-200`}
                      value={settings.backupFrequency}
                      onChange={(e) => update("backupFrequency", e.target.value as SettingsState["backupFrequency"])}
                      disabled={!isPlatformAdmin}
                    >
                      <option value="daily">Her Gün (Otomatik gece yedekleme)</option>
                      <option value="weekly">Her Hafta (Otomatik pazar yedekleme)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-500">Yedek Saklama Süresi (Gün)</label>
                      {!isPlatformAdmin && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50/50 border border-indigo-200/40 rounded-full px-2.5 py-0.5 animate-in fade-in duration-200">
                          <Lock className="h-2.5 w-2.5 text-indigo-500 animate-pulse" /> Altyapı - Sistem Kontrollü
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      className={`${INPUT_CLASS} disabled:opacity-70 disabled:bg-slate-100/40 disabled:cursor-not-allowed disabled:hover:border-slate-200`}
                      value={settings.retentionDays}
                      onChange={(e) => update("retentionDays", Number(e.target.value))}
                      placeholder="Saklama süresi (gün)"
                      disabled={!isPlatformAdmin}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Sticky Bottom Actions Bar */}
      {activeTab !== "hierarchy" && (
        <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between shadow-sm">
          <div className="text-xs font-semibold text-slate-500 flex items-center gap-2">
            <Clock3 className="h-4.5 w-4.5 text-slate-400 shrink-0" />
            Mevcut değişiklikler kaydedildiğinde sistem politikaları anlık olarak uygulanır.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="corp-btn-secondary"
            >
              <RotateCcw className="h-4 w-4" /> Sıfırla
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="corp-btn-primary disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
