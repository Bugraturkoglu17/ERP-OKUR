"use client";

import { FormEvent, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  EyeOff,
  AtSign,
  LockKeyhole,
  ShieldCheck,
  Loader2,
  UserRound,
} from "lucide-react";
import axios from "axios";
import { buildApiUrl } from "@/lib/api";
import { getTokenPayloadFromStorage } from "@/lib/auth";
import { AUTH_STORE_KEY } from "@/contexts/auth-context";
import {
  DEMO_ACCOUNTS,
  DEMO_MODE,
  demoLogin,
  type LoginTarget,
} from "@/lib/demo-auth";
import { BrandMark } from "@/components/brand/brand-mark";
import { resetLaunchIntro } from "@/lib/client-session";

const QUICK_LOGIN: Array<{
  target: LoginTarget;
  icon: typeof ShieldCheck;
  tone: string;
}> = [
  { target: "admin", icon: ShieldCheck, tone: "border-slate-800 bg-slate-950 text-white" },
  { target: "manager", icon: BriefcaseBusiness, tone: "border-red-100 bg-red-50 text-red-600" },
  { target: "user", icon: UserRound, tone: "border-amber-100 bg-amber-50 text-amber-700" },
];

function redirectByRole() {
  const payload = getTokenPayloadFromStorage();
  if (!payload) { window.location.href = "/login"; return; }
  const roles = payload.roles ?? [];
  if (roles.includes("platform_admin")) { window.location.href = "/admin/dashboard"; return; }
  if (roles.includes("manager")) { window.location.href = "/manager/dashboard"; return; }
  if (roles.includes("admin")) { window.location.href = "/manager/dashboard"; return; }
  window.location.href = "/user/dashboard";
}

export default function LoginPage() {
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPassword, setCompanyPassword] = useState("");
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [quickLoading, setQuickLoading] = useState<LoginTarget | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleCompanyLogin = async (e: FormEvent) => {
    e.preventDefault();
    setCompanyLoading(true);
    setCompanyError("");
    try {
      const params = new URLSearchParams();
      params.append("username", companyEmail.trim().toLowerCase());
      params.append("password", companyPassword);
      const res = await axios.post<{ access_token: string; refresh_token?: string; force_password_change?: boolean }>(
        buildApiUrl("/auth/login"),
        params,
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      localStorage.removeItem(AUTH_STORE_KEY);
      localStorage.setItem("token", res.data.access_token);
      if (res.data.refresh_token) localStorage.setItem("refresh_token", res.data.refresh_token);
      sessionStorage.removeItem("initial_login_id");
      sessionStorage.removeItem("initial_temporary_password");
      if (res.data.force_password_change) {
        sessionStorage.setItem("initial_login_id", companyEmail.trim());
        sessionStorage.setItem("initial_temporary_password", companyPassword);
        window.location.href = `/password-reset?email=${encodeURIComponent(companyEmail.trim())}`;
        return;
      }
      resetLaunchIntro();
      redirectByRole();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setCompanyError(
        typeof detail === "string" ? detail : "Geçersiz e-posta veya şifre."
      );
      setCompanyLoading(false);
    }
  };

  const handleQuickLogin = async (target: LoginTarget) => {
    setQuickLoading(target);
    setCompanyError("");
    localStorage.removeItem(AUTH_STORE_KEY);
    const result = await demoLogin(target);
    if (!result.ok) {
      setCompanyError(result.error ?? "Giriş yapılamadı.");
      setQuickLoading(null);
      return;
    }
    resetLaunchIntro();
    redirectByRole();
  };

  return (
    <main className="grid min-h-dvh bg-[#f4f6f8] lg:grid-cols-[minmax(26rem,0.9fr)_minmax(34rem,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-[#09121c] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="pointer-events-none absolute -left-32 top-24 h-96 w-96 rounded-full bg-red-500/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.3)_1px,transparent_1px)] [background-size:40px_40px]" />

        <div className="relative flex items-center gap-3">
          <BrandMark tone="red" className="h-10 w-10" />
          <div>
            <p className="text-sm font-bold tracking-[-0.02em]">Sismik Mekanik</p>
            <p className="text-[10px] font-semibold tracking-[0.22em] text-white/40">ERP SİSTEMİ</p>
          </div>
        </div>

        <div className="relative max-w-xl pb-8">
          <p className="mb-4 text-xs font-semibold tracking-[0.24em] text-red-400">OPERASYON MERKEZİ</p>
          <h1 className="max-w-lg text-balance text-4xl font-bold leading-[1.08] tracking-[-0.045em] xl:text-5xl">
            Saha operasyonunuz tek, güvenli bir merkezde.
          </h1>
          <p className="mt-6 max-w-md text-pretty text-sm leading-6 text-slate-400">
            İş emirlerini, mağaza projelerini ve saha raporlarını yetkinize göre yönetin.
          </p>

          <div className="mt-10 grid max-w-lg grid-cols-2 gap-x-8 gap-y-4 border-t border-white/10 pt-6 text-xs text-slate-300">
            {["Rol bazlı güvenli erişim", "Merkezi dosya yönetimi", "Anlık iş takibi", "Saha raporlama"].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-red-400" strokeWidth={1.8} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[10px] tracking-[0.16em] text-white/25">SİSMİK MEKANİK · KURUMSAL ERİŞİM</p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className={`w-full ${DEMO_MODE ? "max-w-xl" : "max-w-md"}`}>
          <div className="mb-8 flex items-center gap-4 lg:hidden">
            <BrandMark tone="red" animated className="h-14 w-14" />
            <div>
              <p className="text-sm font-bold tracking-[-0.02em] text-slate-950">Sismik Mekanik</p>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400">ERP SİSTEMİ</p>
            </div>
          </div>

          <header className="mb-7">
            <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-red-600">GÜVENLİ GİRİŞ</p>
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">Tekrar hoş geldiniz</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Çalışma alanınıza devam etmek için hesap bilgilerinizi girin.</p>
          </header>

          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-7">
          <form onSubmit={handleCompanyLogin} className="space-y-5">
            {companyError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-medium text-red-700">
                {companyError}
              </div>
            )}
            <div>
              <label htmlFor="login-identity" className="mb-2 block text-xs font-semibold text-slate-700">
                Kullanıcı adı / E-posta
              </label>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="login-identity" type="text" required autoComplete="username" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="kullanici@firma.com" className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-500/10" />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700">
                Şifre
                </label>
                <span className="text-[11px] text-slate-400">Büyük/küçük harfe duyarlı</span>
              </div>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="login-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={companyPassword} onChange={(e) => setCompanyPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-10 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-500/10" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"} className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={companyLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff3131] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,49,49,0.22)] transition hover:-translate-y-0.5 hover:bg-red-600 hover:shadow-[0_16px_34px_rgba(255,49,49,0.28)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {companyLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {companyLoading ? "Giriş yapılıyor…" : "Giriş yap"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Oturum bilgileriniz şifreli bağlantıyla korunur
          </div>
          </div>

        {DEMO_MODE && (
          <aside className="mt-5 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-slate-900">Test hesapları</h3>
                  <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[9px] font-bold tracking-wide text-amber-900">
                    Geliştirme
                  </span>
                </div>
                <p className="text-[11px] leading-4 text-slate-500">Yetki seviyesini seçerek doğrudan giriş yapın.</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {QUICK_LOGIN.map(({ target, icon: Icon, tone }) => {
                const account = DEMO_ACCOUNTS[target];
                const isLoading = quickLoading === target;
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => handleQuickLogin(target)}
                    disabled={quickLoading !== null || companyLoading}
                    className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-amber-100 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone}`}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-900">{account.label}</span>
                      <span className="block truncate text-[10px] text-slate-400">{account.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
        </div>
      </section>
    </main>
  );
}
