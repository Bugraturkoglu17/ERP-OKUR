"use client";

import {
  LayoutDashboard,
  ClipboardList,
  Store,
  Archive,
  BarChart3,
  Users,
  DatabaseBackup,
  UserRound,
} from "lucide-react";
import { CorporateShell, type CorporateNavItem } from "@/components/layout/corporate-shell";
import { useAuth } from "@/contexts/auth-context";

const BASE_NAV: CorporateNavItem[] = [
  { href: "/manager/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/manager/is-emirleri", label: "İş Emirleri", icon: ClipboardList },
  { href: "/manager/magaza-karti", label: "Mağaza Kartı", icon: Store },
  { href: "/manager/genel-arsiv", label: "Genel Arşiv", icon: Archive },
  { href: "/manager/kullanicilar", label: "Kullanıcılar", icon: Users },
  { href: "/manager/raporlar", label: "Raporlar", icon: BarChart3 },
  { href: "/manager/profile", label: "Profilim", icon: UserRound },
];

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // "Sistem Yedeği": Yönetici (MANAGER) VE Geliştirici Admin (ADMIN, platform_admin)
  // görür/kullanabilir — Admin, "Panel Görünümü"nden Yönetici Görünümü'nü
  // seçtiğinde fiilen bir Yönetici gibi çalışabilmeli (backend de
  // require_role("admin","platform_admin") ile ikisine de izin verir).
  // Yalnızca USER hiç görmez/erişemez.
  const canSeeBackup = user?.role === "MANAGER" || user?.role === "ADMIN";
  const navItems: CorporateNavItem[] =
    canSeeBackup
      ? [...BASE_NAV, { href: "/manager/sistem-yedegi", label: "Sistem Yedeği", icon: DatabaseBackup }]
      : BASE_NAV;

  return (
    <CorporateShell
      allowedRoles={["MANAGER"]}
      brandTone="red"
      title="Yönetici Paneli"
      navItems={navItems}
      headerLabel="Operasyon Yönetimi"
    >
      {children}
    </CorporateShell>
  );
}
