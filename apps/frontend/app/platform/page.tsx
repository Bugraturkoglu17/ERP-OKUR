"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, CreditCard, TriangleAlert, Users } from "lucide-react";
import { apiGet } from "@/lib/api";

type Tenant = { id: string; name: string; status: string; is_active: boolean };
type Plan = { id: string; is_active: boolean };

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-3 inline-flex rounded-xl p-2.5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

const SHORTCUTS = [
  { label: "Firma Oluştur", href: "/platform/firmalar", desc: "Yeni firma ekle veya güncelle" },
  { label: "Lisans Tanımla", href: "/platform/lisanslar", desc: "Plan ata, süre ve modül belirle" },
  { label: "Kullanıcı Ekle", href: "/platform/kullanicilar", desc: "Yönetici ve kullanıcı oluştur" },
];

export default function PlatformDashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, p] = await Promise.all([
          apiGet<Tenant[]>("/platform/tenants"),
          apiGet<Plan[]>("/platform/plans"),
        ]);
        setTenants(Array.isArray(t) ? t : []);
        setPlans(Array.isArray(p) ? p : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => ({
    total: tenants.length,
    active: tenants.filter((t) => t.is_active).length,
    suspended: tenants.filter((t) => t.status?.toLowerCase() === "suspended").length,
    plans: plans.filter((p) => p.is_active).length,
  }), [tenants, plans]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* Sayfa başlığı */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Genel Bakış</h1>
        <p className="mt-1 text-sm text-slate-500">Sistem genelindeki firma ve lisans durumunu görüntüleyin.</p>
      </div>

      {/* İstatistikler */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Toplam Firma" value={stats.total} sub={`Aktif: ${stats.active}`} color="bg-blue-50 text-blue-600" />
        <StatCard icon={TriangleAlert} label="Askıdaki Firma" value={stats.suspended} sub="Müdahale gerekiyor" color="bg-amber-50 text-amber-600" />
        <StatCard icon={CreditCard} label="Aktif Lisans" value={stats.plans} sub={`Toplam plan: ${plans.length}`} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Users} label="Aktif Firma" value={stats.active} sub="Sistemde aktif" color="bg-violet-50 text-violet-600" />
      </div>

      {/* Hızlı işlemler */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Hızlı İşlemler</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{s.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Son firmalar */}
      {tenants.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Firmalar</h2>
            <Link href="/platform/firmalar" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              Tümünü gör
            </Link>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Firma Adı</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Durum</th>
                </tr>
              </thead>
              <tbody>
                {tenants.slice(0, 5).map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium text-slate-900">{t.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium
                        ${t.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${t.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {t.is_active ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tenants.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">Henüz firma eklenmemiş</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">İlk firmayı oluşturarak başlayın.</p>
          <Link href="/platform/firmalar" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors">
            <ArrowRight className="h-4 w-4" /> Firma Oluştur
          </Link>
        </div>
      )}
    </div>
  );
}
