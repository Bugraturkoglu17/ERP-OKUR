"use client";

/**
 * GEÇİCİ geliştirme aracı — test sürecini hızlandırmak için gerçek hesaplar
 * arasında tek tıkla geçiş sağlar (mock/sahte veri kullanmaz, her geçiş
 * gerçek backend login'i yapar). Kullanıcı bu paneli üretime almadan
 * kaldıracağını belirtti — silinecekse bu dosya ve corporate-shell.tsx'teki
 * <QuickSwitch /> çağrısı kaldırılır.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, LayoutDashboard, Loader2, LogOut, UserRound } from "lucide-react";
import { useAuth, AUTH_STORE_KEY } from "@/contexts/auth-context";
import { ROLE_LABEL, type UserRole } from "@/lib/permissions";
import { DEMO_MODE, demoLogin, type LoginTarget } from "@/lib/demo-auth";

const QUICK_ACCOUNTS: {
  role: UserRole;
  label: string;
  target: LoginTarget;
  home: string;
}[] = [
  { role: "ADMIN", target: "admin", label: "Admin", home: "/admin/dashboard" },
  { role: "MANAGER", target: "manager", label: "Yönetici", home: "/manager/dashboard" },
  { role: "USER", target: "user", label: "Kullanıcı", home: "/user/dashboard" },
];

export function QuickSwitch({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [switching, setSwitching] = useState<UserRole | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    onNavigate?.();
    await logout();
  };

  if (!user) return null;

  if (user.role === "ADMIN") {
    const views = [
      { label: "Admin Görünümü", href: "/admin/dashboard" },
      { label: "Yönetici Görünümü", href: "/manager/dashboard" },
      { label: "Kullanıcı Görünümü", href: "/user/dashboard" },
    ];
    return (
      <div className="border-t border-white/[0.06] px-3 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">Panel Görünümü</p>
        <div className="space-y-0.5">{views.map((view) => <Link key={view.href} href={view.href} draggable={false} onClick={onNavigate} className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-xs transition-colors ${pathname.startsWith(view.href.split("/dashboard")[0]) ? "bg-white/[0.08] text-white" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"}`}><LayoutDashboard className="h-3.5 w-3.5" />{view.label}</Link>)}</div>
        <button onClick={() => void handleLogout()} disabled={loggingOut} className="mt-3 flex w-full items-center gap-2 border-t border-white/[0.06] px-2 pt-3 text-xs text-slate-400 hover:text-white disabled:opacity-50">{loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}Çıkış Yap</button>
      </div>
    );
  }

  const others = DEMO_MODE ? QUICK_ACCOUNTS.filter((a) => a.role !== user.role) : [];

  const switchTo = async (acc: (typeof QUICK_ACCOUNTS)[0]) => {
    setSwitching(acc.role);
    try {
      onNavigate?.();
      localStorage.removeItem(AUTH_STORE_KEY);
      const result = await demoLogin(acc.target);
      if (!result.ok) throw new Error(result.error ?? "Hesap değiştirilemedi.");
      window.location.assign(acc.home);
    } catch {
      setSwitching(null);
    }
  };

  return (
    <div className="border-t border-white/[0.06]">
      {DEMO_MODE && <div className="px-3 pt-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
          Hızlı Geçiş · Geçici
        </p>
      </div>}

      {DEMO_MODE && <div className="px-3 pb-1 space-y-0.5">
        {others.map((acc) => (
          <button
            key={acc.role}
            onClick={() => switchTo(acc)}
            disabled={switching !== null}
            className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-slate-300" />
            <span className="flex-1 truncate text-left text-xs text-slate-300">{acc.label}</span>
            {switching === acc.role ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-600 group-hover:text-slate-300" />
            )}
          </button>
        ))}
      </div>}

      <div className="flex items-center gap-2.5 border-t border-white/[0.06] p-3">
        <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">{ROLE_LABEL[user.role]}</p>
          <p className="text-[10px] text-white/40">Aktif hesap</p>
        </div>
        <button
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          title="Çıkış Yap"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
