"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ClipboardList, Shield, Activity, ArrowRight } from "lucide-react";
import { apiGet } from "@/lib/api";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Skeleton } from "@/components/ui/skeleton";

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  default_role: string;
}

function displayName(user: UserRow) {
  return user.default_role.includes("platform_admin") ? "Geliştirici Admin" : user.full_name;
}

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<UserRow[]>("/auth/users")
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeUsers = users.filter((u) => u.is_active).length;

  const cards = [
    { label: "Toplam kullanıcı", value: loading ? "…" : users.length, description: "Sistemde kayıtlı hesap", icon: Users, tone: "blue" as const, href: "/admin/users" },
    { label: "Aktif kullanıcı", value: loading ? "…" : activeUsers, description: "Giriş yapabilen hesap", icon: Activity, tone: "emerald" as const, href: "/admin/users" },
    { label: "Rol yapısı", value: "3", description: "Admin, yönetici, kullanıcı", icon: Shield, tone: "amber" as const, href: "/admin/roles" },
    { label: "Operasyon", value: "Canlı", description: "Sistem servis durumu", icon: ClipboardList, tone: "slate" as const, href: "/admin/settings" },
  ];

  const shortcuts = [
    { label: "Yeni Kullanıcı Ekle", href: "/admin/users" },
    { label: "Rol Yönetimi", href: "/admin/roles" },
    { label: "Sistem Ayarları", href: "/admin/settings" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Genel Bakış</h1>
        <p className="mt-1 text-sm text-slate-500">Hesaplar, roller ve sistem yönetimi özeti.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((card) => <MetricCard key={card.label} {...card} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hızlı Erişim */}
        <section className="erp-section-card p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Hızlı erişim</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {shortcuts.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-800 active:scale-[0.99]"
              >
                <span>{label}</span>
                <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </section>

        {/* Son Kullanıcılar */}
        <section className="erp-section-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Son kullanıcılar</h2>
            <Link href="/admin/users" className="text-xs font-semibold text-blue-700 hover:text-blue-800">
              Tümünü gör →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2 py-2"><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /></div>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Henüz kullanıcı yok.</p>
          ) : (
            <ul className="space-y-2">
              {users.slice(0, 5).map((u) => (
                <li key={u.id}>
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">
                      {displayName(u).slice(0, 2).toLocaleUpperCase("tr-TR")}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{displayName(u)}</p>
                      <p className="truncate text-xs text-slate-400">{u.email}</p>
                    </div>
                    <span
                      className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_active
                          ? "border border-emerald-100 bg-emerald-50 text-emerald-700"
                          : "border border-slate-200 bg-slate-100 text-slate-500"
                      }`}
                    >
                      {u.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
