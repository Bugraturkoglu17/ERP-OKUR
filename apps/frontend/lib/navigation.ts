import {
  LayoutDashboard,
  Store,
  Archive,
  Users,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";


export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  allowedRoles?: string[];
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  href: string;
  allowedRoles?: string[];
  items: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry && Array.isArray((entry as NavGroup).items);
}

export const NAV_ENTRIES: NavEntry[] = [
  {
    label: "Genel Bakış",
    href: "/",
    icon: LayoutDashboard,
    allowedRoles: ["admin", "saha_muhendisi", "musteri_kullanici"],
  },
  {
    label: "Mağaza Kartı",
    href: "/projects",
    icon: Store,
    allowedRoles: ["admin", "saha_muhendisi", "musteri_kullanici"],
  },
  {
    label: "Genel Arşiv",
    href: "/genel-arsiv",
    icon: Archive,
    allowedRoles: ["admin", "saha_muhendisi"],
  },
  {
    label: "İş Emirleri",
    href: "/is-emirleri",
    icon: ClipboardList,
    allowedRoles: ["admin", "saha_muhendisi"],
  },
  {
    label: "Kullanıcılar",
    href: "/admin/users",
    icon: Users,
    allowedRoles: ["admin"],
  },
];

// ── Legacy flat list (backward compat for SmartSearch etc.) ──────────────────
export const NAV_ITEMS: NavItem[] = NAV_ENTRIES.flatMap((e) =>
  isNavGroup(e) ? e.items : [e]
);

export type NavItemCompat = NavItem;

// ── Filter by roles ───────────────────────────────────────────────────────────
function roleMatch(roles: string[], allowed?: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  return allowed.some((r) => roles.includes(r));
}

export function getVisibleNavEntries(roles: string[]): NavEntry[] {
  if (roles.includes("platform_admin")) return [];
  return NAV_ENTRIES.filter((e) => roleMatch(roles, e.allowedRoles)).map((e) => {
    if (isNavGroup(e)) {
      return { ...e, items: e.items.filter((i) => roleMatch(roles, i.allowedRoles)) };
    }
    return e;
  });
}

// ── Legacy compat ─────────────────────────────────────────────────────────────
export function getVisibleNavItems(roles: string[]): NavItem[] {
  if (roles.includes("platform_admin")) return [];
  return NAV_ITEMS.filter((i) => roleMatch(roles, i.allowedRoles));
}
