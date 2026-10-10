"use client";

import { Archive, ClipboardList, LayoutDashboard, Store, User } from "lucide-react";
import { CorporateShell, type CorporateNavItem } from "@/components/layout/corporate-shell";
import { useAuth } from "@/contexts/auth-context";

const NAV: CorporateNavItem[] = [
  { href: "/user/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/user/islerim", label: "İşlerim", icon: ClipboardList },
  { href: "/user/magaza-karti", label: "Mağaza Kartı", icon: Store },
  { href: "/user/genel-arsiv", label: "Genel Arşiv", icon: Archive },
  { href: "/user/profile", label: "Profil", icon: User },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : "Çalışan";

  return (
    <CorporateShell
      allowedRoles={["USER"]}
      brandTone="amber"
      title="Kullanıcı Paneli"
      navItems={NAV}
      headerLabel={fullName}
    >
      {children}
    </CorporateShell>
  );
}
