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
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import { Field, FieldGroup, FieldLabel } from "@/components/shadcn/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/shadcn/input-group";
import { Separator } from "@/components/shadcn/separator";
import { Spinner } from "@/components/shadcn/spinner";
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
import { OkurWordmark } from "@/components/brand/okur-wordmark";
import { brand } from "@/lib/brand";
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
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(26rem,0.9fr)_minmax(34rem,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-[#09121c] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="pointer-events-none absolute -left-32 top-24 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.3)_1px,transparent_1px)] [background-size:40px_40px]" />

        <OkurWordmark dark animated priority className="w-52" />

        <div className="relative max-w-xl pb-8">
          <p className="mb-4 text-xs font-semibold tracking-[0.24em] text-fuchsia-400">OPERASYON MERKEZİ</p>
          <h1 className="max-w-lg text-balance text-4xl font-bold leading-[1.08] tracking-[-0.045em] xl:text-5xl">
            Saha operasyonunuz tek, güvenli bir merkezde.
          </h1>
          <p className="mt-6 max-w-md text-pretty text-sm leading-6 text-slate-400">
            İş emirlerini, mağaza projelerini ve saha raporlarını yetkinize göre yönetin.
          </p>

          <div className="mt-10 grid max-w-lg grid-cols-2 gap-x-8 gap-y-4 border-t border-white/10 pt-6 text-xs text-slate-300">
            {["Rol bazlı güvenli erişim", "Merkezi dosya yönetimi", "Anlık iş takibi", "Saha raporlama"].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-fuchsia-400" strokeWidth={1.8} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[10px] tracking-[0.16em] text-white/25">{brand("OKUR TEKNİK SOĞUTMA · KURUMSAL ERİŞİM", "KURUMSAL ERİŞİM")}</p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className={`w-full ${DEMO_MODE ? "max-w-xl" : "max-w-md"}`}>
          <div className="mb-7 lg:hidden">
            <OkurWordmark animated priority className="w-60 max-w-full sm:w-64" />
          </div>

          <header className="mb-7">
            <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-fuchsia-700">GÜVENLİ GİRİŞ</p>
            <h2 className="text-3xl font-bold tracking-tight">Tekrar hoş geldiniz</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Çalışma alanınıza devam etmek için hesap bilgilerinizi girin.</p>
          </header>

          <Card className="shadow-lg">
            <CardContent className="p-5 sm:p-7">
              <form onSubmit={handleCompanyLogin}>
                <FieldGroup className="gap-5">
                  {companyError && <Alert variant="destructive"><AlertDescription>{companyError}</AlertDescription></Alert>}
                  <Field>
                    <FieldLabel htmlFor="login-identity">Kullanıcı adı / E-posta</FieldLabel>
                    <InputGroup className="h-11">
                      <InputGroupAddon><AtSign /></InputGroupAddon>
                      <InputGroupInput id="login-identity" type="text" required autoComplete="username" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="kullanici@firma.com" />
                    </InputGroup>
                  </Field>
                  <Field>
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor="login-password">Şifre</FieldLabel>
                      <span className="text-[11px] text-muted-foreground">Büyük/küçük harfe duyarlı</span>
                    </div>
                    <InputGroup className="h-11">
                      <InputGroupAddon><LockKeyhole /></InputGroupAddon>
                      <InputGroupInput id="login-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={companyPassword} onChange={(e) => setCompanyPassword(e.target.value)} placeholder="••••••••" />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton size="icon-xs" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>
                          {showPassword ? <EyeOff /> : <Eye />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                  <Button type="submit" size="lg" disabled={companyLoading} className="w-full">
                    {companyLoading ? <Spinner data-icon="inline-start" /> : <ArrowRight data-icon="inline-start" />}
                    {companyLoading ? "Giriş yapılıyor…" : "Giriş yap"}
                  </Button>
                </FieldGroup>
              </form>
              <Separator className="my-5" />
              <p className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                Oturum bilgileriniz şifreli bağlantıyla korunur
              </p>
            </CardContent>
          </Card>

        {DEMO_MODE && (
          <aside className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4">
            <div className="mb-3">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-xs font-semibold">Test hesapları</h3>
                <Badge variant="warning">Geliştirme</Badge>
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">Yetki seviyesini seçerek doğrudan giriş yapın.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {QUICK_LOGIN.map(({ target, icon: Icon, tone }) => {
                const account = DEMO_ACCOUNTS[target];
                const isLoading = quickLoading === target;
                return (
                  <Button
                    key={target}
                    type="button"
                    variant="outline"
                    onClick={() => handleQuickLogin(target)}
                    disabled={quickLoading !== null || companyLoading}
                    aria-label={`${account.label} ${account.description}`}
                    className="h-auto min-w-0 justify-start gap-2.5 bg-background p-2.5 text-left"
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", tone)}>
                      {isLoading ? <Spinner /> : <Icon />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{account.label}</span>
                      <span className="block truncate text-[10px] font-normal text-muted-foreground">{account.description}</span>
                    </span>
                  </Button>
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
