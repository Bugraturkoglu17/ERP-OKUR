"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  default_role: string;
  discipline?: string;
  is_active: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  user: "Kullanıcı",
  saha_muhendisi: "Kullanıcı",
  manager: "Yönetici",
  admin: "Yönetici",
  platform_admin: "Geliştirici Admin",
};

export default function UserProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<UserProfile>("/auth/me")
      .then((p) => {
        setProfile(p);
        setPhone(p.phone ?? "");
        setFullName(p.full_name);
        setEmail(p.email.endsWith("@sismik.local") ? "" : p.email);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setError("");
    if (!fullName.trim() || !phone.trim()) { setError("Ad soyad ve telefon boş olamaz."); return; }
    setSaving(true);
    try {
      const updated = await apiPatch<UserProfile>("/auth/me", { full_name: fullName.trim(), phone: phone.trim(), ...(email.trim() ? { email: email.trim() } : {}) });
      setProfile(updated);
      setPhone(updated.phone ?? "");
      setFullName(updated.full_name);
      setEmail(updated.email.endsWith("@sismik.local") ? "" : updated.email);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (cause) {
      const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Profil güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return <p className="text-sm text-slate-400">Profil yüklenemedi.</p>;
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profilim</h1>
        <p className="mt-1 text-sm text-slate-500">Kişisel bilgileriniz</p>
      </div>

      <div className="flex items-center gap-4 rounded-xl bg-white border border-slate-200 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-lg font-bold">
          {profile.full_name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-base font-semibold text-slate-900">{profile.full_name}</p>
          <p className="text-sm text-slate-500">{profile.email}</p>
          <span className="inline-block mt-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
            {ROLE_LABEL[profile.default_role] ?? profile.default_role}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Bilgilerimi Düzenle</h2>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Ad Soyad</label>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">E-posta</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-posta isteğe bağlı"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Telefon</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+90 5xx xxx xx xx"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
          />
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="text-xs text-slate-500">Telefonu değiştirdiğinizde yeni numaranızla giriş yapabilirsiniz.</p>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            saved
              ? "bg-emerald-500 text-white"
              : "bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50"
          }`}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saved ? "Kaydedildi!" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
