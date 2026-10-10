"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Building2, Camera, CheckCircle2, ChevronDown, ClipboardList,
  Eye, Loader2, MessageSquare, Plus, Search, Trash2, User, X, Zap,
} from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type Project = { id: string; name: string; project_no?: string; description?: string };

type AppUser = { id: string; full_name?: string; email: string; phone?: string; is_active?: boolean };

type WorkOrder = {
  id: string; project_id: string; project_name?: string; project_no?: string;
  work_type: string; work_type_label: string; title: string; description?: string;
  assigned_to_name?: string; assigned_to_phone?: string;
  priority: string; status: string; status_label: string;
  location_url?: string; due_date?: string;
  created_by_name?: string; sent_at?: string; completed_at?: string;
  photo_count: number; has_service_form: boolean; public_token?: string;
  created_at: string; updated_at: string;
};

const WORK_TYPES = [
  { value: "fault",         label: "Arıza"      },
  { value: "renovation",    label: "Tadilat"    },
  { value: "manufacturing", label: "Yeni Yapım" },
];

const PRIORITIES = [
  { value: "normal",   label: "Normal"  },
  { value: "urgent",   label: "Acil"    },
  { value: "critical", label: "Kritik"  },
];

const STATUS_COLOR: Record<string, string> = {
  draft:            "bg-slate-100 text-slate-600",
  sent:             "bg-blue-50 text-blue-700",
  started:          "bg-amber-50 text-amber-700",
  completed:        "bg-emerald-50 text-emerald-700",
  failed:           "bg-red-50 text-red-700",
  cancelled:        "bg-slate-100 text-slate-500",
  material_waiting: "bg-orange-50 text-orange-700",
  revisit:          "bg-purple-50 text-purple-700",
  approval_pending: "bg-yellow-50 text-yellow-700",
  approved:         "bg-emerald-100 text-emerald-800",
};

const PRIORITY_COLOR: Record<string, string> = {
  normal:   "bg-slate-100 text-slate-600",
  urgent:   "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

function apiErrMsg(ex: unknown, fallback = "Bir hata oluştu."): string {
  const e = ex as { response?: { data?: { detail?: unknown } } };
  const d = e?.response?.data?.detail;
  if (typeof d === "string" && d !== "Not Found") return d;
  return fallback;
}


// ── Delete Confirm Modal ───────────────────────────────────────────────────────

function DeleteModal({
  wo, onClose, onDone,
}: { wo: WorkOrder; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleDelete = async () => {
    setBusy(true); setErr("");
    try {
      await apiDelete(`/work-orders/${wo.id}`);
      onDone();
    } catch (ex) {
      setErr(apiErrMsg(ex) || "İş emri silinemedi. Lütfen tekrar deneyin.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
            <Trash2 className="h-4 w-4 text-red-500" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">İş Emri Sil</h3>
        </div>
        <p className="text-sm text-slate-600">
          Bu iş emri silinecek. Mağaza kartı silinmez, sadece bu iş emri kaldırılır. Devam etmek istiyor musunuz?
        </p>
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <p className="text-xs font-semibold text-slate-700 truncate">{wo.title}</p>
          <p className="text-[10px] text-slate-400">{wo.project_name}</p>
        </div>
        {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Vazgeç
          </button>
          <button onClick={handleDelete} disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Form Modal ──────────────────────────────────────────────────────────

type WorkOrderCreated = { id: string };

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users,    setUsers]    = useState<AppUser[]>([]);
  const [search, setSearch] = useState("");
  const [selProject, setSelProject] = useState<Project | null>(null);
  const [selUserId,  setSelUserId]  = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    work_type: "fault", title: "", description: "",
    priority: "normal", due_date: "",
  });

  useEffect(() => {
    apiGet<Project[]>("/projects?limit=2000")
      .then(d => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {});
    apiGet<AppUser[]>("/auth/users")
      .then(d => setUsers(Array.isArray(d) ? d.filter(u => u.is_active !== false) : []))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() =>
    projects.filter(p =>
      !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.project_no ?? "").includes(search)
    ), [projects, search]);

  const handleSelectProject = (p: Project) => {
    setSelProject(p);
  };

  const handleCreate = async () => {
    if (!selProject) { setErr("Mağaza seçin."); return; }
    if (!form.title.trim()) { setErr("İş başlığı zorunludur."); return; }
    setBusy(true); setErr("");
    try {
      const selUser = users.find(u => u.id === selUserId);
      const wo = await apiPost<WorkOrderCreated>("/work-orders", {
        project_id: selProject.id,
        work_type: form.work_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_to_name: selUser ? (selUser.full_name || selUser.email) : null,
        assigned_to_phone: selUser?.phone || null,
        assigned_to_user_id: selUserId || null,
        priority: form.priority,
        due_date: form.due_date ? `${form.due_date}T00:00:00` : null,
      });
      onDone(wo.id);
    } catch (ex) { setErr(apiErrMsg(ex, "İş emri oluşturulamadı. Sunucu bağlantısı kontrol edilmeli.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">İş Emri Oluştur</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Adım {step} / 2</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-300 hover:text-slate-600" /></button>
        </div>

        <div className="flex gap-1.5 px-5 pt-4">
          {[1, 2].map(i => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i <= step ? "bg-blue-600" : "bg-slate-100"}`} />
          ))}
        </div>

        <div className="px-5 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {step === 1 && (
            <>
              <p className="text-xs font-semibold text-slate-700">Mağaza Seç</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Mağaza ara..." autoFocus
                  className="w-full rounded-xl border pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filtered.slice(0, 50).map(p => (
                  <button key={p.id} type="button" onClick={() => handleSelectProject(p)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selProject?.id === p.id ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:border-slate-200"
                    }`}>
                    <Building2 className="h-4 w-4 text-slate-300 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{p.project_no ?? "—"}</p>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-center text-xs text-slate-400 py-6">Bulunamadı.</p>}
              </div>
              {selProject && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                  <p className="text-xs font-semibold text-blue-800">Seçili: {selProject.name}</p>
                  {selProject.project_no && <p className="text-[10px] text-blue-600 font-mono">{selProject.project_no}</p>}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {selProject && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 mb-1">
                  <p className="text-[11px] font-semibold text-slate-700">{selProject.name}</p>
                  {selProject.project_no && <p className="text-[10px] text-slate-400 font-mono">{selProject.project_no}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">İş Tipi *</label>
                  <select value={form.work_type} onChange={e => setForm(p => ({ ...p, work_type: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {WORK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Öncelik</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {PRIORITIES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">İş Başlığı *</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Ör: Deveboynu kanalı imalatı" autoFocus
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">İş Açıklaması</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="Detaylı açıklama..."
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none" />
              </div>

              {/* Atanacak kişi — yalnızca kullanıcı listesinden seç */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> Atanacak Kişi</span>
                </label>
                <div className="relative">
                  <select
                    value={selUserId}
                    onChange={e => setSelUserId(e.target.value)}
                    className="w-full appearance-none rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none pr-8"
                  >
                    <option value="">— Seçiniz —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Termin Tarihi</label>
                <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </>
          )}

          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        </div>

        <div className="flex justify-between border-t border-slate-100 px-5 py-4">
          <button onClick={() => step === 1 ? onClose() : setStep(1)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {step === 1 ? "Vazgeç" : "← Geri"}
          </button>
          {step === 1 ? (
            <button onClick={() => { if (!selProject) { setErr("Mağaza seçin."); return; } setErr(""); setStep(2); }}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              İleri →
            </button>
          ) : (
            <button onClick={handleCreate} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <Plus className="h-4 w-4" /> İş Emri Oluştur
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── WhatsApp Gönder Butonu ────────────────────────────────────────────────────

function SendWhatsAppBtn({ wo, onRefresh }: { wo: WorkOrder; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    if (!wo.assigned_to_phone) {
      alert("Atanacak kişinin telefon numarası bulunmuyor.");
      return;
    }
    if (!confirm(`"${wo.assigned_to_name || wo.assigned_to_phone}" kişisine WhatsApp mesajı gönderilsin mi?`)) return;
    setBusy(true); setErr("");
    try {
      await apiPost(`/work-orders/${wo.id}/send-whatsapp`, {});
      onRefresh();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? "WhatsApp mesajı gönderilemedi.");
    } finally { setBusy(false); }
  };

  return (
    <div>
      <button onClick={send} disabled={busy || !wo.assigned_to_phone}
        title={!wo.assigned_to_phone ? "Telefon numarası girilmemiş" : "WhatsApp ile bildir"}
        className="inline-flex items-center gap-1 text-xs text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50 disabled:opacity-40">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
        WhatsApp Gönder
      </button>
      {err && <p className="text-[10px] text-red-500 mt-1 max-w-[180px]">{err}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IsEmirleriPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<WorkOrder | null>(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = async () => {
    setLoading(true);
    const d = await apiGet<WorkOrder[]>("/work-orders").catch(() => []);
    setOrders(Array.isArray(d) ? d : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => orders.filter(o => {
    if (filterType && o.work_type !== filterType) return false;
    if (filterStatus && o.status !== filterStatus) return false;
    if (query && !o.project_name?.toLowerCase().includes(query.toLowerCase()) && !o.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [orders, query, filterType, filterStatus]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
            <ClipboardList className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">İş Emirleri</h1>
            <p className="text-xs text-slate-500">Arıza, tadilat ve yeni yapım görevlerini tek ekrandan oluşturun, atayın ve takip edin.</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> İş Emri Oluştur
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Mağaza veya iş başlığı ara..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">Tüm İş Tipleri</option>
          {WORK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">Tüm Durumlar</option>
          {[
            ["draft","Taslak"],["sent","Gönderildi"],["started","İşe Başlandı"],
            ["completed","Tamamlandı"],["failed","Tamamlanmadı"],["cancelled","İptal"],
            ["material_waiting","Malzeme Bekliyor"],["revisit","Tekrar Gidilecek"],
            ["approval_pending","Onay Bekliyor"],["approved","Onaylandı"],
          ].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Toplam", value: orders.length, color: "text-slate-900" },
          { label: "Gönderildi", value: orders.filter(o => o.status === "sent").length, color: "text-blue-600" },
          { label: "Devam Ediyor", value: orders.filter(o => o.status === "started").length, color: "text-amber-600" },
          { label: "Tamamlandı", value: orders.filter(o => o.status === "completed").length, color: "text-emerald-600" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border border-dashed border-slate-200 bg-white">
          <ClipboardList className="h-12 w-12 text-slate-200" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600">İş emri bulunamadı.</p>
            <p className="text-xs text-slate-400 mt-1">Yeni iş emri oluşturun.</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> İş Emri Oluştur
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(wo => (
            <div key={wo.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-4">
                {/* Sol: iş bilgileri */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[wo.priority] ?? "bg-slate-100 text-slate-600"}`}>
                      {wo.priority === "critical" ? "🔴 KRİTİK" : wo.priority === "urgent" ? "🟠 ACİL" : "NORMAL"}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
                      {wo.work_type_label}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[wo.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {wo.status_label}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 truncate">{wo.title}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <Link href={`/projects/${wo.project_id}`}
                      className="text-xs text-blue-600 hover:underline font-medium">
                      {wo.project_name}
                    </Link>
                    {wo.project_no && <span className="text-[10px] text-slate-400 font-mono">{wo.project_no}</span>}
                    {wo.due_date && (
                      <span className="text-[10px] text-slate-500">
                        Termin: {new Date(wo.due_date).toLocaleDateString("tr-TR")}
                      </span>
                    )}
                  </div>
                  {wo.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{wo.description}</p>
                  )}
                  {(wo.assigned_to_name || wo.assigned_to_phone) && (
                    <p className="text-xs text-slate-600 mt-1.5">
                      👤 {wo.assigned_to_name || ""} {wo.assigned_to_phone ? `(${wo.assigned_to_phone})` : ""}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {wo.photo_count > 0 && (
                      <span className="text-[10px] text-slate-500">{wo.photo_count} fotoğraf</span>
                    )}
                    {wo.has_service_form && (
                      <span className="text-[10px] text-emerald-600">✓ Servis formu</span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {new Date(wo.created_at).toLocaleDateString("tr-TR")} • {wo.created_by_name}
                    </span>
                  </div>
                </div>

                {/* Sağ: aksiyonlar */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Link href={`/is-emirleri/${wo.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                    <Eye className="h-3.5 w-3.5" /> Detayı Gör
                  </Link>
                  {wo.photo_count > 0 && (
                    <Link href={`/is-emirleri/${wo.id}`}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                      <Camera className="h-3 w-3" /> {wo.photo_count} fotoğraf
                    </Link>
                  )}
                  <Link href={`/projects/${wo.project_id}?tab=work-orders`}
                    className="text-[11px] text-slate-400 hover:text-slate-600">
                    Mağaza Kartı →
                  </Link>
                  <button onClick={() => setDeleting(wo)}
                    className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 mt-1">
                    <Trash2 className="h-3.5 w-3.5" /> Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onDone={(woId) => { setShowCreate(false); router.push(`/is-emirleri/${woId}`); }}
        />
      )}
      {deleting && (
        <DeleteModal
          wo={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); load(); }}
        />
      )}
    </div>
  );
}
