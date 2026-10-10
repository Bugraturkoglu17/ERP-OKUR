"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, type LucideIcon } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { QuickSwitch } from "@/components/layout/quick-switch";
import type { UserRole } from "@/lib/permissions";
import { BrandMark, type BrandTone } from "@/components/brand/brand-mark";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useMobileDrawer } from "@/hooks/use-mobile-drawer";

export type CorporateNavItem = { href: string; label: string; icon: LucideIcon };

function CorporateSidebar({
  mobileOpen,
  onClose,
  brandTone,
  title,
  navItems,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  brandTone: BrandTone;
  title: string;
  navItems: CorporateNavItem[];
}) {
  const pathname = usePathname();

  const inner = (
    <div className={`flex h-full min-h-dvh flex-col border-t-[3px] bg-[#0c1520] ${brandTone === "amber" ? "border-t-amber-400" : "border-t-[#ff3131]"}`}>
      {/* iOS PWA'da status bar "black-translucent" olduğu için web içeriği
          durum çubuğunun ALTINA uzanır; drawer başlığı da saat/pil ikonlarıyla
          çakışır. Güvenli alan boşluğu Tailwind arbitrary value yerine inline
          style ile veriliyor — env()/calc() ifadesi hiçbir sınıf-adı
          ayrıştırma adımından geçmeden birebir CSS'e yazılır. */}
      <div
        className="flex items-center justify-between border-b border-white/[0.06] px-4"
        style={{
          minHeight: "calc(4rem + env(safe-area-inset-top))",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <BrandMark
            key={`sidebar-brand-${mobileOpen ? "open" : "closed"}`}
            tone={brandTone}
            animated
            className="h-9 w-9 shrink-0"
          />
          <div>
            <span className="text-sm font-semibold tracking-[-0.02em] text-white leading-none">{title}</span>
            <span className="block text-[10px] text-white/40 mt-0.5 uppercase tracking-widest">ERP Sistemi</span>
          </div>
        </div>
        <button type="button" aria-label="Yan paneli kapat" onClick={onClose} className="lg:hidden rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* flex-1, QuickSwitch'i en alta iter ve sayfa boyunca dengeli bir
          dağılım oluşturur. Liste içinde kaydırma yapılabilir ama elastic-bounce (çekmece elastikiyeti) önlenir. */}
      <nav className="flex-1 space-y-1 overflow-y-auto overscroll-none touch-pan-y px-3 py-5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              draggable={false}
              onClick={onClose}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
                active
                  ? "bg-white/[0.09] text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  : "text-slate-400 hover:translate-x-0.5 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              {active && <span className={`absolute -left-3 h-5 w-0.5 rounded-r ${brandTone === "amber" ? "bg-amber-400" : "bg-[#ff3131]"}`} />}
              <Icon className={`h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:scale-[1.16] ${active ? (brandTone === "amber" ? "text-amber-300" : "text-red-400") : "text-slate-500 group-hover:text-slate-300"}`} strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <QuickSwitch onNavigate={onClose} />
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-60 shrink-0">{inner}</aside>
      {/* iOS Standalone/PWA ve tüm mobil tarayıcılarda görünür alanı
          kesintisiz ve tam boy (edge-to-edge) kaplamak için fixed inset-0
          kullanılır. Böylece cihazın en altındaki Home Indicator alanında
          herhangi bir boşluk/kayma bug'ı oluşmaz ve arka plan kusursuz uzanır. */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${mobileOpen ? "pointer-events-auto visible" : "pointer-events-none invisible"}`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Menüyü kapat"
          className={`absolute inset-0 z-0 h-full w-full bg-slate-950/30 backdrop-blur-[3px] transition-opacity duration-200 touch-none ${mobileOpen ? "opacity-100" : "opacity-0"}`}
          onClick={onClose}
        />
        <aside
          className={`fixed top-0 bottom-0 left-0 z-10 m-0 w-[86vw] max-w-[360px] h-full min-h-dvh bg-[#0c1520] overflow-hidden overscroll-none touch-none transition-transform duration-200 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
          onClick={(event) => event.stopPropagation()}
        >
          {inner}
        </aside>
      </div>
    </>
  );
}

/**
 * Ortak "Kurumsal Güç" kabuğu — admin/manager/user panelleri arasında
 * sidebar teması, Hesap Geçişi paneli ve header düzenini tek noktadan tutar.
 */
export function CorporateShell({
  children,
  allowedRoles,
  brandTone = "red",
  title,
  navItems,
  headerLabel,
}: {
  children: ReactNode;
  allowedRoles: UserRole[];
  brandTone?: BrandTone;
  title: string;
  navItems: CorporateNavItem[];
  headerLabel: ReactNode;
}) {
  const drawer = useMobileDrawer();

  return (
    <RoleGuard allowedRoles={allowedRoles} brandTone={brandTone}>
      <div className="flex h-dvh max-w-full overflow-x-clip bg-slate-50">
        <CorporateSidebar
          mobileOpen={drawer.open}
          onClose={drawer.close}
          brandTone={brandTone}
          title={title}
          navItems={navItems}
        />
        <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <header className="fixed inset-x-0 top-0 z-30 flex min-h-[calc(4rem_+_env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 pb-0 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-xl sm:px-6 lg:static lg:min-h-16 lg:shadow-none">
            <button
              onClick={drawer.openDrawer}
              className={`h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] lg:hidden ${drawer.open ? "hidden" : "flex"}`}
              aria-label="Menüyü aç"
              aria-hidden={drawer.open}
              tabIndex={drawer.open ? -1 : undefined}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="hidden lg:block">
              <p className="text-xs font-semibold tracking-[-0.01em] text-slate-700">Sismik ERP</p>
              <p className="mt-0.5 text-[10px] text-slate-400">Güvenli operasyon çalışma alanı</p>
            </div>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
                <span className="max-w-[6.5rem] truncate text-[11px] font-semibold tracking-wide text-slate-500 sm:max-w-none">{headerLabel}</span>
              </div>
              <NotificationBell />
            </div>
          </header>
          <main id="main-content" className="erp-workspace min-w-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[calc(5rem_+_env(safe-area-inset-top))] sm:p-6 sm:pt-[calc(5rem_+_env(safe-area-inset-top))] lg:p-8">{children}</main>
        </div>
      </div>
    </RoleGuard>
  );
}
