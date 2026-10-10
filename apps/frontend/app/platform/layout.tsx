"use client";

import { Building2, CreditCard, LayoutDashboard, Users } from "lucide-react";
import { CorporateShell, type CorporateNavItem } from "@/components/layout/corporate-shell";

const NAV: CorporateNavItem[] = [
  { label: "Genel Bakış", href: "/platform", icon: LayoutDashboard },
  { label: "Firmalar", href: "/platform/firmalar", icon: Building2 },
  { label: "Lisanslar", href: "/platform/lisanslar", icon: CreditCard },
  { label: "Kullanıcılar", href: "/platform/kullanicilar", icon: Users },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
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
