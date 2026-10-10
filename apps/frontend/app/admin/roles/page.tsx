"use client";

import { Shield, Users, User } from "lucide-react";

const ROLES = [
  {
    key: "ADMIN",
    label: "Admin",
    Icon: Shield,
    iconCls: "bg-indigo-500/20 text-indigo-400",
    borderCls: "border-indigo-700/30",
    description:
      "Tüm sistem yetkilerine sahiptir. Kullanıcı, yönetici, rol ve sistem ayarlarını yönetebilir.",
    permissions: [
      "Kullanıcı oluşturma ve silme",
      "Yönetici oluşturma ve silme",
      "Rol değiştirme",
      "Şifre sıfırlama",
      "Sistem ayarları yönetimi",
      "Tüm panellere erişim",
    ],
  },
  {
    key: "MANAGER",
    label: "Yönetici",
    Icon: Users,
    iconCls: "bg-blue-500/20 text-blue-400",
    borderCls: "border-blue-700/30",
    description:
      "İş emirlerini, mağaza kartlarını, genel arşivi ve çalışan kullanıcıları yönetebilir. Admin hesabı oluşturamaz veya silemez.",
    permissions: [
      "İş emri oluşturma ve atama",
      "Mağaza kartı görüntüleme",
      "Genel arşiv yönetimi",
      "Çalışan ekleme ve silme",
      "Rapor görüntüleme",
      "Görsel aktarımı",
    ],
  },
  {
    key: "USER",
    label: "Kullanıcı",
    Icon: User,
    iconCls: "bg-slate-600/40 text-slate-300",
    borderCls: "border-slate-700/30",
    description:
      "Sadece kendisine atanan iş emirlerini görüntüler, rapor oluşturur ve aşamaları günceller.",
    permissions: [
      "Atanan iş emirlerini görme",
      "Süreç başlatma ve güncelleme",
      "Rapor oluşturma",
      "Görsel yükleme",
      "Kendi profilini görme",
    ],
  },
];

export default function AdminRolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Roller & Yetkiler</h1>
        <p className="mt-1 text-sm text-slate-400">
          Sistem rolleri merkezi yetki yapısına göre yönetilir.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ROLES.map(({ key, label, Icon, iconCls, borderCls, description, permissions }) => (
          <div
            key={key}
            className={`rounded-xl border bg-slate-900 p-6 ${borderCls}`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconCls}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold text-slate-100">{label}</h2>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed mb-5">{description}</p>

            <ul className="space-y-2">
              {permissions.map((p) => (
                <li key={p} className="flex items-start gap-2 text-xs text-slate-400">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
