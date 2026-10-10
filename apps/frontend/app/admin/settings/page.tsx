"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Settings, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api";

type Tenant = { id: string; is_active: boolean };

export default function AdminSettingsPage() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);

  useEffect(() => {
    apiGet<Tenant[]>("/platform/tenants")
      .then((items) => setTenants(Array.isArray(items) ? items : []))
      .catch(() => setTenants([]));
  }, []);

  const rows = [
    { label: "Uygulama", value: "SİSMİK Kurumsal Operasyon Sistemi" },
    { label: "Firma sayısı", value: tenants === null ? null : String(tenants.length) },
    { label: "Aktif firma", value: tenants === null ? null : String(tenants.filter((item) => item.is_active).length) },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Sistem Ayarları</h1>
        <p className="mt-1 text-sm text-slate-500">Canlı sistem yapılandırmasını ve güvenlik ilkelerini görüntüleyin.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="erp-section-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Settings className="h-4 w-4 text-blue-700" />
            <h2 className="text-sm font-semibold text-slate-900">Sistem bilgileri</h2>
          </div>
          <dl className="divide-y divide-slate-100 px-5">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-3.5">
                <dt className="text-sm text-slate-500">{row.label}</dt>
                <dd className="text-right text-sm font-semibold text-slate-800">
                  {row.value === null ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="erp-section-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-slate-900">Güvenlik ilkeleri</h2>
          </div>
          <dl className="divide-y divide-slate-100 px-5">
            <div className="flex items-center justify-between gap-4 py-3.5">
              <dt className="text-sm text-slate-500">Minimum şifre uzunluğu</dt>
              <dd className="text-sm font-semibold text-slate-800">8 karakter</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5">
              <dt className="text-sm text-slate-500">Rol modeli</dt>
              <dd className="text-sm font-semibold text-slate-800">Admin · Yönetici · Kullanıcı</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5">
              <dt className="text-sm text-slate-500">Firma izolasyonu</dt>
              <dd className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <Building2 className="h-4 w-4" /> Etkin
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
