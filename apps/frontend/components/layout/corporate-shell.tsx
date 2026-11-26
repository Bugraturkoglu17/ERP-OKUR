"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, type LucideIcon } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { QuickSwitch } from "@/components/layout/quick-switch";
import type { UserRole } from "@/lib/permissions";
import type { BrandTone } from "@/components/brand/brand-mark";
import { OkurWordmark } from "@/components/brand/okur-wordmark";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/layout/notification-bell";
import { HEADER_SLOT_ID } from "@/components/layout/header-slot";
import { useMobileDrawer } from "@/hooks/use-mobile-drawer";
import { Button } from "@/components/shadcn/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/shadcn/sheet";

export type CorporateNavItem = { href: string; label: string; icon: LucideIcon };

/** Yan menünün içeriği: masaüstünde sabit sütun, mobilde Sheet (çekmece) içinde aynı içerik. */
function SidebarContent({ brandTone, title, navItems, mobile, onClose }: {
  brandTone: BrandTone; title: string; navItems: CorporateNavItem[]; mobile: boolean; onClose: () => void;
}) {
  const pathname = usePathname();
  const amber = brandTone === "amber";

  return (
    <div className={cn("flex h-full min-h-dvh flex-col border-t-[3px] bg-sidebar text-sidebar-foreground", amber ? "border-t-amber-400" : "border-t-[#ff3131]")}>
      {/* iOS PWA'da durum çubuğu "black-translucent" olduğu için içerik saat/pil satırının altına uzanır;
          güvenli alan boşluğu inline style ile verilir (env()/calc() sınıf ayrıştırmasından geçmeden CSS'e yazılır). */}
      <div
        className="flex items-center justify-between border-b border-sidebar-border px-4"
        style={{ minHeight: "calc(3rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2.5">
          <OkurWordmark key={`sidebar-brand-${mobile ? "mobile" : "desktop"}`} dark animated className="w-[4.5rem] shrink-0" />
          <div>
            <span className="block text-[13px] font-semibold leading-none tracking-tight text-white">{title}</span>
            <span className="mt-1 block text-[9px] uppercase leading-none tracking-widest text-white/40">{brand("OKUR ERP", "Operasyon Sistemi")}</span>
          </div>
        </div>
        {mobile && (
          <Button variant="ghost" size="icon" aria-label="Yan paneli kapat" onClick={onClose}
            className="size-8 text-sidebar-foreground/60 hover:bg-white/[0.06] hover:text-white">
            <X />
          </Button>
        )}
      </div>

      {/* flex-1, QuickSwitch'i en alta iter; liste kendi içinde kayar, elastik sekme önlenir. */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-none px-3 py-5 touch-pan-y">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              draggable={false}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                active
                  ? "bg-white/[0.09] font-semibold text-white"
                  : "text-sidebar-foreground/60 hover:translate-x-0.5 hover:bg-white/[0.04] hover:text-sidebar-foreground",
              )}
            >
              {active && <span className={cn("absolute -left-3 h-5 w-0.5 rounded-r", amber ? "bg-amber-400" : "bg-[#ff3131]")} />}
              <Icon
                strokeWidth={1.8}
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200 ease-out group-hover:scale-[1.16]",
                  active ? (amber ? "text-amber-300" : "text-red-400") : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80",
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <QuickSwitch onNavigate={onClose} />
    </div>
  );
}

/**
 * Ortak "Kurumsal" kabuk — yönetici / kullanıcı panellerinde yan menü, hesap geçişi ve üst çubuğu tek noktadan tutar.
 * Mobilde yan menü shadcn Sheet içinde açılır (odak tuzağı, Esc ile kapanma, kaydırma kilidi Sheet'tedir).
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
      <div className="flex h-dvh max-w-full overflow-x-clip bg-background">
        <aside className="hidden w-60 shrink-0 lg:block">
          <SidebarContent brandTone={brandTone} title={title} navItems={navItems} mobile={false} onClose={drawer.close} />
        </aside>
        <Sheet open={drawer.open} onOpenChange={(open) => { if (!open) drawer.close(); }}>
          <SheetContent side="left" className="w-[86vw] max-w-[360px] overflow-hidden border-0 p-0 sm:max-w-[360px] [&>button:first-child]:hidden">
            <SheetTitle className="sr-only">{title} menüsü</SheetTitle>
            <SheetDescription className="sr-only">Sayfalar arasında gezinme</SheetDescription>
            <SidebarContent brandTone={brandTone} title={title} navItems={navItems} mobile onClose={drawer.close} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <header className="fixed inset-x-0 top-0 z-30 flex min-h-[calc(3rem_+_env(safe-area-inset-top))] shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-xl sm:px-6 lg:static lg:min-h-12 lg:shadow-none">
            <Button variant="outline" size="icon" onClick={drawer.openDrawer} aria-label="Menüyü aç" className="size-8 lg:hidden">
              <Menu />
            </Button>
            <p className="hidden min-w-0 items-baseline gap-2 truncate lg:flex">
              <span className="text-xs font-semibold tracking-tight">{brand("OKUR ERP", "ERP")}</span>
              <span className="truncate text-[11px] text-muted-foreground">Güvenli operasyon çalışma alanı</span>
            </p>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {/* Sayfaya özel düğmeler (HeaderSlot) buraya yerleşir. */}
              <div id={HEADER_SLOT_ID} className="flex shrink-0 items-center gap-2 empty:hidden" />
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-50" aria-hidden />
                <span className="max-w-[6.5rem] truncate text-[11px] font-semibold tracking-wide text-muted-foreground sm:max-w-none">{headerLabel}</span>
              </div>
              <NotificationBell />
            </div>
          </header>
          <main id="main-content" className="erp-workspace min-w-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[calc(4rem_+_env(safe-area-inset-top))] sm:p-6 sm:pt-[calc(4rem_+_env(safe-area-inset-top))] lg:p-8">{children}</main>
        </div>
      </div>
    </RoleGuard>
  );
}
