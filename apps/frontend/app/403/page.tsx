"use client";

import { ShieldOff } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_PANEL_HOME } from "@/lib/permissions";

export default function ForbiddenPage() {
  const { user } = useAuth();
  const dashboardHref = user?.role ? ROLE_PANEL_HOME[user.role] : "/login";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
          <ShieldOff className="h-8 w-8 text-red-500" />
        </div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-red-400">
          403
        </p>
        <h1 className="mb-3 text-2xl font-bold text-slate-900">Yetkiniz Yok</h1>
        <p className="mb-8 text-sm leading-relaxed text-slate-500">
          Bu sayfaya erişmek için gerekli yetkiye sahip değilsiniz.
        </p>
        <a
          href={dashboardHref}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Panele Dön
        </a>
      </div>
    </div>
  );
}
