"use client";

import {
  LayoutDashboard,
  Users,
  Shield,
  Settings,
  UserRound,
} from "lucide-react";
import { CorporateShell, type CorporateNavItem } from "@/components/layout/corporate-shell";

const NAV: CorporateNavItem[] = [
  { href: "/admin/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/admin/users", label: "Kullanıcılar", icon: Users },
  { href: "/admin/roles", label: "Roller & Yetkiler", icon: Shield },
  { href: "/admin/settings", label: "Sistem Ayarları", icon: Settings },
  { href: "/admin/profile", label: "Profilim", icon: UserRound },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <CorporateShell
      allowedRoles={["ADMIN"]}
      brandTone="red"
      title="Admin Paneli"
      navItems={NAV}
      headerLabel="Sistem Yönetimi"
    >
      {children}
    </CorporateShell>
  );
}
