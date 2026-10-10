"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, LogOut, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getVisibleNavEntries, isNavGroup, type NavGroup } from "@/lib/navigation";
import { getRoles, getTokenPayloadFromStorage } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { BrandMark } from "@/components/brand/brand-mark";

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
};

function findActiveGroup(groups: NavGroup[], pathname: string): string | null {
  for (const g of groups) {
    if (pathname === g.href || pathname.startsWith(g.href + "/") ||
        g.items.some((i) => pathname === i.href.split("?")[0] || pathname.startsWith(i.href.split("?")[0] + "/"))) {
      return g.href;
    }
  }
  return null;
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [roles, setRoles]       = useState<string[]>([]);
  const [fullName, setFullName] = useState("Kullanıcı");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const payload = getTokenPayloadFromStorage();
    const r = getRoles(payload);
    setRoles(r);
    apiGet<{ full_name: string }>("/auth/me")
      .then((me) => { if (me?.full_name) setFullName(me.full_name); })
      .catch(() => {});
  }, []);

  const entries = getVisibleNavEntries(roles);
  const navGroups = entries.filter(isNavGroup) as NavGroup[];

  // Auto-open the group that contains the current path
  useEffect(() => {
    const active = findActiveGroup(navGroups, pathname);
    if (active) setOpenGroups((prev) => new Set(Array.from(prev).concat(active)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, roles]);

  const toggleGroup = (href: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  const isActive = (href: string) => {
    const [base, query] = href.split("?");
    if (base === "/") return pathname === "/";
    const pathMatch = pathname === base || pathname.startsWith(base + "/");
    if (!pathMatch) return false;
    if (!query) return true;
    const params = new URLSearchParams(query);
    for (const [k, v] of Array.from(params.entries())) {
      if (searchParams.get(k) !== v) return false;
    }
    return true;
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        {/* Güvenli alan boşluğu inline style ile — sınıf adı içindeki
            calc(3.5rem+env(...)) ifadesi boşluksuz olduğu için GEÇERSİZ CSS
            üretiyordu (calc içinde +/- çevresinde boşluk zorunludur) ve
            tarayıcı kuralı tamamen düşürüyordu. */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4"
          style={{
            minHeight: "calc(3.5rem + env(safe-area-inset-top))",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <BrandMark animated className="h-7 w-7 shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">Sismik ERP</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Mağaza Takip</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {entries.map((entry) => {
            if (isNavGroup(entry)) {
              const isOpen    = openGroups.has(entry.href);
              const isGroupActive = entry.items.some((i) => isActive(i.href)) || isActive(entry.href);
              const GroupIcon = entry.icon;
              return (
                <div key={entry.href}>
                  <button
                    onClick={() => toggleGroup(entry.href)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isGroupActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <GroupIcon className={cn("h-4 w-4 shrink-0", isGroupActive ? "text-blue-600" : "text-slate-400")} />
                    <span className="flex-1 text-left">{entry.label}</span>
                    <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-150", isOpen && "rotate-90")} />
                  </button>
                  {isOpen && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-100 pl-3">
                      {entry.items.map((item) => {
                        const ItemIcon = item.icon;
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                              active
                                ? "bg-blue-50 text-blue-700"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            )}
                          >
                            <ItemIcon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-blue-600" : "text-slate-300")} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Plain nav item
            const Icon   = entry.icon;
            const active = isActive(entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-blue-600" : "text-slate-400")} />
                {entry.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 p-2">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 mb-0.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700 shrink-0">
              {fullName.slice(0, 2).toUpperCase()}
            </div>
            <p className="text-xs font-medium text-slate-900 truncate flex-1">{fullName}</p>
          </div>
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            Çıkış Yap
          </button>
        </div>
      </aside>
    </>
  );
}
