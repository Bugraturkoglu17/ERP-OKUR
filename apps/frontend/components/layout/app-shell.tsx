"use client";

import { Menu } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { fetchTenantContext } from "@/lib/tenant-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [title, setTitle] = useState("Sismik Mağaza Kartı");
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isPublicRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/403" ||
    pathname === "/password-reset" ||
    pathname === "/platform" ||
    pathname.startsWith("/platform/") ||
    pathname.startsWith("/is-emri/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/manager" ||
    pathname.startsWith("/manager/") ||
    pathname === "/user" ||
    pathname.startsWith("/user/");
  const hasToken = typeof window !== "undefined" && (!!localStorage.getItem("token") || !!localStorage.getItem("auth_store"));

  useEffect(() => {
    if (!mounted) return;
    const isPlatformRoute = pathname === "/platform" || pathname.startsWith("/platform/");
    if (!isPublicRoute && !isPlatformRoute && !hasToken) {
      window.location.href = "/login";
    }
  }, [mounted, isPublicRoute, hasToken, pathname]);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/password-reset") {
      return;
    }
    if (!hasToken) {
      return;
    }
    (async () => {
      const ctx = await fetchTenantContext();
      if (ctx?.tenant_name) {
        setTitle(`${ctx.tenant_name} — Mağaza Kartı`);
      }
    })();
  }, [pathname, hasToken]);

  // isPublicRoute kapsamındaki her şey (tüm admin/manager/user/login/403/
  // password-reset/platform/is-emri rotaları — yani pratikte uygulamanın
  // tamamı) kendi auth kontrolünü RoleGuard üzerinden zaten yapıyor. Bu
  // dalı "mounted" beklemeden EN ÖNCE kontrol ediyoruz: aksi halde, henüz
  // hydrate olmamışken burada ayrı bir (önceden açık renkli) spinner
  // basılıyordu — bu, kök layout'un server-render edilen ilk çıktısı
  // olarak RoleGuard'ın koyu BootScreen'inden ÖNCE boyanıyor ve PWA soğuk
  // açılışta splash'tan önce görünen kısa açık/beyaz ekranın asıl
  // kaynağıydı.
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Prevent hydration mismatch and rendering layout components before path is determined
  if (!mounted) {
    return null;
  }

  const isPlatformRoute = pathname === "/platform" || pathname.startsWith("/platform/");
  // Redirecting state
  if (!isPlatformRoute && !hasToken) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 w-full">
      <Suspense fallback={<div className="w-64 shrink-0" />}>
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="Menüyü aç"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="truncate text-sm font-semibold text-slate-800 sm:text-base lg:text-lg">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-8 w-8 rounded-full bg-slate-200" />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
