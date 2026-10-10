"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Eye, EyeOff, Info, KeyRound, Loader2, Mail, Phone, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX, X } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { ToolbarDock, type ToolbarDockAction } from "@/components/ui/toolbar-dock";

type UserRow = { id: string; full_name: string; email: string; phone?: string; is_active: boolean; default_role?: string; force_password_change: boolean; onboarding_complete: boolean };
type FormState = { first_name: string; last_name: string; email: string; phone: string; password: string; role: "user" | "manager"; is_active: boolean };

const emptyForm: FormState = { first_name: "", last_name: "", email: "", phone: "", password: "", role: "user", is_active: true };
const inputClass = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400";

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { first_name: parts.shift() ?? "", last_name: parts.join(" ") };
}

function uiRole(user: UserRow) {
  if ((user.default_role ?? "").includes("platform_admin")) return "ADMIN";
  if (["admin", "manager"].includes(user.default_role ?? "")) return "MANAGER";
  return "USER";
}

function displayName(user: UserRow) {
  return uiRole(user) === "ADMIN" ? "Geliştirici Admin" : user.full_name;
}

function errorMessage(cause: unknown) {
  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : cause instanceof Error ? cause.message : "İşlem tamamlanamadı.";
}

export default function ManagerUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [infoUser, setInfoUser] = useState<UserRow | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedPassword, setIssuedPassword] = useState<{ name: string; password: string } | null>(null);

  const load = async () => {
    try {
      const data = await apiGet<UserRow[]>("/auth/users");
      setUsers(Array.isArray(data) ? data : []);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return users.filter((user) => `${user.full_name} ${user.email} ${user.phone ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [query, users]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(""); setModalOpen(true); };
  const openEdit = (user: UserRow) => {
    const name = splitName(user.full_name);
    setEditing(user);
    setForm({ ...emptyForm, ...name, email: user.email.endsWith("@sismik.local") ? "" : user.email, phone: user.phone ?? "", role: uiRole(user) === "MANAGER" ? "manager" : "user", is_active: user.is_active });
    setError("");
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return setError("Ad ve soyad zorunludur.");
    if (!form.phone.trim()) return setError("Telefon numarası zorunludur.");
    if (!editing && form.password.length < 8) return setError("Geçici şifre en az 8 karakter olmalıdır.");
    setSaving(true);
    setError("");
    try {
      const payload = { full_name: `${form.first_name.trim()} ${form.last_name.trim()}`, phone: form.phone.trim(), roles: [form.role], is_active: form.is_active };
      if (editing) await apiPatch(`/auth/users/${editing.id}`, currentUser?.role === "ADMIN" ? payload : { full_name: payload.full_name, phone: payload.phone, is_active: payload.is_active });
      else await apiPost("/auth/users", { ...payload, email: form.email.trim() || null, password: form.password, discipline: null, discipline_only: false });
      setModalOpen(false);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: UserRow) => {
    try { await apiPatch(`/auth/users/${user.id}`, { is_active: !user.is_active }); await load(); }
    catch (cause) { setError(errorMessage(cause)); }
  };

  const remove = async (user: UserRow) => {
    if (!window.confirm(`${user.full_name} hesabını KALICI olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
    setError("");
    setNotice("");
    try {
      const res = await apiDelete(`/auth/users/${user.id}`) as { message?: string; hard_deleted?: boolean } | undefined;
      await load();
      // Kalıcı silinemeyip pasifleştirildiyse kullanıcıyı bilgilendir.
      if (res && res.hard_deleted === false && res.message) setNotice(res.message);
    }
    catch (cause) { setError(errorMessage(cause)); }
  };

  const resetPassword = async (user: UserRow) => {
    if (!window.confirm(`${user.full_name} için yeni bir geçici şifre oluşturulsun mu? Eski şifre ve açık oturumlar geçersiz olur; kullanıcı verileri korunur.`)) return;
    setError("");
    try {
      const result = await apiPost<{ temporary_password: string }>(`/auth/users/${user.id}/temporary-password`);
      setIssuedPassword({ name: user.full_name, password: result.temporary_password });
      await load();
    } catch (cause) { setError(errorMessage(cause)); }
  };

  // Her satırın verisi BİR kez hesaplanır; telefon listesi ve masaüstü tablosu aynı veriyi kullanır.
  const rows = filtered.map((user) => {
    const role = uiRole(user);
    const protectedAdmin = role === "ADMIN";
    const protectedManager = role === "MANAGER" && currentUser?.role !== "ADMIN";
    const isProtected = protectedAdmin || protectedManager;
    const isSelf = user.id === currentUser?.id;
    const visibleName = displayName(user);
    const accountStatus = !user.is_active ? "Pasif" : user.force_password_change || !user.onboarding_complete ? "İlk giriş bekliyor" : "Aktif";
    const status = accountStatus === "Aktif"
      ? { label: accountStatus, pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", text: "text-emerald-700" }
      : accountStatus === "Pasif"
        ? { label: accountStatus, pill: "bg-slate-100 text-slate-500", dot: "bg-slate-400", text: "text-slate-500" }
        : { label: accountStatus, pill: "bg-amber-100 text-amber-700", dot: "bg-amber-500", text: "text-amber-700" };
    const actions: ToolbarDockAction[] = [
      { key: "info", label: "Bilgiler", icon: Info, onClick: () => setInfoUser(user) },
      ...(isProtected ? [] : [
        { key: "edit", label: "Düzenle", icon: Edit3, onClick: () => openEdit(user) } as ToolbarDockAction,
        ...(!isSelf ? [{ key: "reset-password", label: "Geçici şifre oluştur", icon: KeyRound, onClick: () => resetPassword(user) } as ToolbarDockAction] : []),
      ]),
      ...(!isProtected && !isSelf ? [
        { key: "toggle", label: user.is_active ? "Pasif yap" : "Aktif yap", icon: user.is_active ? UserX : UserCheck, onClick: () => toggleActive(user) } as ToolbarDockAction,
        { key: "delete", label: "Hesabı sil", icon: Trash2, variant: "danger", onClick: () => remove(user) } as ToolbarDockAction,
      ] : []),
    ];
    return {
      user, role, visibleName, status, isProtected, actions,
      roleLabel: role === "ADMIN" ? "Geliştirici Admin" : role === "MANAGER" ? "Yönetici" : "Kullanıcı",
      initials: visibleName.split(" ").map((part) => part[0]).slice(0, 2).join("").toLocaleUpperCase("tr-TR"),
      protectedTitle: protectedAdmin ? "Admin hesabı korunur" : "Yönetici hesabını yalnızca geliştirici admin düzenleyebilir/silebilir",
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Ekip yönetimi</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Kullanıcılar</h1><p className="mt-1 text-sm text-slate-500">Kullanıcı ve yönetici hesaplarını, ilk girişlerini ve durumlarını yönetin.</p></div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Yeni Hesap</button>
      </div>

      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, e-posta veya telefon ara" className={`${inputClass} mt-0 pl-9`} /></div>
      {error && !modalOpen && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && !modalOpen && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Kullanıcılar yükleniyor</div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">Eşleşen kullanıcı bulunamadı.</p>
        ) : (
          <>
            {/* Telefon: tablo yerine sade liste. Dört sütun dar ekrana sığmıyordu;
                rol etiketi iki satıra bölünüp bozuluyor, tablo yana kayıyordu. */}
            <ul className="divide-y divide-slate-100 sm:hidden">
              {rows.map(({ user, initials, visibleName, roleLabel, status, isProtected, protectedTitle, actions }) => (
                <li key={user.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{visibleName}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="truncate">{roleLabel}</span>
                      <span aria-hidden className="text-slate-300">·</span>
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        <span className={status.text}>{status.label}</span>
                      </span>
                    </p>
                  </div>
                  {isProtected && <span title={protectedTitle} className="shrink-0 text-slate-300"><ShieldCheck className="h-4 w-4" /></span>}
                  <ToolbarDock actions={actions} panelClassName="w-48" triggerClassName="bg-transparent text-slate-400 hover:bg-transparent hover:text-slate-800" />
                </li>
              ))}
            </ul>

            {/* Masaüstü: tablo. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">Ad Soyad</th>
                    <th className="px-4 py-3 font-medium">Rol</th>
                    <th className="px-4 py-3 font-medium">Durum</th>
                    <th className="px-4 py-3 text-right font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(({ user, initials, visibleName, roleLabel, role, status, isProtected, protectedTitle, actions }) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials}</span>
                          <span className="font-medium text-slate-800">{visibleName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${role === "ADMIN" ? "bg-indigo-100 text-indigo-700" : role === "MANAGER" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{roleLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${status.pill}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isProtected && <span title={protectedTitle} className="text-indigo-400"><ShieldCheck className="h-3.5 w-3.5" /></span>}
                          <ToolbarDock actions={actions} direction="down" align="end" className="justify-end" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {issuedPassword && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><h2 className="font-bold text-slate-900">Geçici şifre hazır</h2><p className="mt-2 text-sm text-slate-600">{issuedPassword.name} bu şifreyle giriş yapınca yeni şifre oluşturmalıdır. Şifre yalnızca burada bir kez gösterilir.</p><div className="mt-4 flex items-center gap-2"><code className="min-w-0 flex-1 select-all break-all rounded-lg bg-slate-100 px-3 py-2 text-sm">{issuedPassword.password}</code><button onClick={() => void navigator.clipboard.writeText(issuedPassword.password)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Kopyala</button></div><button onClick={() => setIssuedPassword(null)} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Kapat</button></div></div>}

      {infoUser && (() => {
        const infoRole = uiRole(infoUser);
        const infoStatus = !infoUser.is_active ? "Pasif" : infoUser.force_password_change || !infoUser.onboarding_complete ? "İlk giriş bekliyor" : "Aktif";
        const hasEmail = !infoUser.email.endsWith("@sismik.local");
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" onClick={() => setInfoUser(null)}>
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{displayName(infoUser).split(" ").map((part) => part[0]).slice(0, 2).join("").toLocaleUpperCase("tr-TR")}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{displayName(infoUser)}</p>
                  <p className="text-xs text-slate-400">{infoRole === "ADMIN" ? "Geliştirici Admin" : infoRole === "MANAGER" ? "Yönetici" : "Kullanıcı"} · {infoStatus}</p>
                </div>
                <button onClick={() => setInfoUser(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
              <dl className="divide-y divide-slate-100 px-5 py-1 text-sm">
                <div className="flex items-center gap-3 py-3">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 break-words text-slate-700">{hasEmail ? infoUser.email : "E-posta tanımlı değil"}</span>
                </div>
                <div className="flex items-center gap-3 py-3">
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 text-slate-700">{infoUser.phone || "Telefon tanımlı değil"}</span>
                </div>
              </dl>
            </div>
          </div>
        );
      })()}

      {modalOpen && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-3 sm:items-center sm:p-4" role="dialog" aria-modal="true"><div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">{editing ? "Hesabı Düzenle" : "Yeni Hesap"}</h2><p className="mt-0.5 text-xs text-slate-400">Admin rolü bu ekrandan atanamaz.</p></div><button onClick={() => setModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">Ad *<input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} className={inputClass} /></label>
        <label className="block text-xs font-medium text-slate-600">Soyad *<input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} className={inputClass} /></label>
        <label className="block text-xs font-medium text-slate-600">Telefon *<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={inputClass} /></label>
        <label className="block text-xs font-medium text-slate-600">E-posta (isteğe bağlı)<input type="email" disabled={Boolean(editing)} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} /></label>
        <label className="block text-xs font-medium text-slate-600">Rol *<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as FormState["role"] })} className={inputClass} disabled={currentUser?.role !== "ADMIN"}><option value="user">Kullanıcı</option>{currentUser?.role === "ADMIN" && <option value="manager">Yönetici</option>}</select></label>
        <label className="block text-xs font-medium text-slate-600">Hesap durumu *<select value={form.is_active ? "active" : "passive"} onChange={(event) => setForm({ ...form, is_active: event.target.value === "active" })} className={inputClass}><option value="active">Aktif</option><option value="passive">Pasif</option></select></label>
        {!editing && <label className="block text-xs font-medium text-slate-600 sm:col-span-2">Geçici şifre *<div className="relative"><input type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={`${inputClass} pr-10`} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 translate-y-0.5 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><span className="mt-1 block font-normal text-slate-400">Kullanıcı ilk girişte otomatik olarak yeni şifre ekranına yönlendirilir.</span></label>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 sm:col-span-2">{error}</p>}</div><div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4"><button onClick={() => setModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700">Vazgeç</button><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Kaydet</button></div></div></div>}
    </div>
  );
}
