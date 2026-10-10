"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Ban, CheckCircle2, CircleDashed, Clock3, History, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import DocumentQuickSearch from "@/components/dashboard/document-quick-search";
import { MetricCard } from "@/components/dashboard/metric-card";

interface WorkOrder {
  id: string;
  title: string;
  project_name?: string;
  project_no?: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at?: string;
}

const PLANNED_STATUSES = ["planned", "draft", "sent", "approval_pending"];
const ACTIVE_STATUSES = ["started", "material_waiting", "revisit"];
const COMPLETED_STATUSES = ["completed", "approved"];
const CANCELLED_STATUSES = ["cancelled", "failed"];

const STATUS_LABEL: Record<string, string> = {
  planned: "Planlanacak", draft: "Planlanacak", sent: "Planlanacak", approval_pending: "Planlanacak",
  started: "Devam Ediyor", material_waiting: "Malzeme Bekliyor", revisit: "Tekrar Ziyaret",
  completed: "Tamamlandı", approved: "Tamamlandı",
  failed: "İptal Edildi", cancelled: "İptal Edildi",
};

const STATUS_COLOR: Record<string, string> = {
  planned: "bg-blue-50 text-blue-700", draft: "bg-slate-100 text-slate-700", sent: "bg-blue-50 text-blue-700",
  approval_pending: "bg-blue-50 text-blue-700", started: "bg-amber-50 text-amber-700",
  material_waiting: "bg-orange-50 text-orange-700", revisit: "bg-violet-50 text-violet-700",
  completed: "bg-emerald-50 text-emerald-700", approved: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700", cancelled: "bg-red-50 text-red-700",
};

function orderTitle(order: WorkOrder) {
  return `${order.project_name ?? "Mağaza bilgisi yok"} - ${order.title}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function OrderList({ orders, emptyText }: { orders: WorkOrder[]; emptyText: string }) {
  if (orders.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-slate-400">{emptyText}</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {orders.slice(0, 5).map(order => (
        <li key={order.id}>
          <Link href={`/user/islerim/${order.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{orderTitle(order)}</p>
              {order.project_no && <p className="mt-0.5 text-xs text-slate-400">Mağaza kodu: {order.project_no}</p>}
            </div>
            <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${STATUS_COLOR[order.status] ?? "bg-slate-100 text-slate-600"}`}>
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function UserDashboardPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<WorkOrder[]>("/work-orders")
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setError("İş emirleri yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  const planned = orders.filter(order => PLANNED_STATUSES.includes(order.status));
  const active = orders.filter(order => ACTIVE_STATUSES.includes(order.status));
  const completed = orders.filter(order => COMPLETED_STATUSES.includes(order.status));
  const cancelled = orders.filter(order => CANCELLED_STATUSES.includes(order.status));
  const recent = useMemo(
    () => [...orders].sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at)).slice(0, 6),
    [orders],
  );

  const stats = [
    { label: "Planlanacak", value: planned.length, description: "Başlatılmayı bekleyen", icon: CircleDashed, tone: "blue" as const, href: "/user/islerim?durum=planned" },
    { label: "Devam Eden", value: active.length, description: "Sahada işlem gören", icon: Clock3, tone: "amber" as const, href: "/user/islerim?durum=active" },
    { label: "Tamamlanan", value: completed.length, description: "Süreci kapanan", icon: CheckCircle2, tone: "emerald" as const, href: "/user/islerim?durum=completed" },
    { label: "İptal Edilen", value: cancelled.length, description: "İşlemden kaldırılan", icon: Ban, tone: "slate" as const, href: "/user/islerim?durum=cancelled" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Genel Bakış</h1>
        <p className="mt-1 text-sm text-slate-500">Atanan işlerin güncel durumu ve son hareketleri</p>
      </header>

      <DocumentQuickSearch />

      {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="İş emri özeti">
        {stats.map((stat) => <MetricCard key={stat.label} {...stat} value={loading ? "…" : stat.value} />)}
      </section>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> İşler yükleniyor
        </div>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="erp-section-card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div><h2 className="text-sm font-semibold text-slate-800">Yeni gelen işler</h2><p className="mt-0.5 text-xs text-slate-400">Süreci başlatılmayı bekleyen iş emirleri</p></div>
              <span className="text-sm font-bold tabular-nums text-blue-700">{planned.length}</span>
            </div>
            <OrderList orders={planned} emptyText="Planlanacak iş emri yok." />
          </div>

          <div className="erp-section-card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div><h2 className="text-sm font-semibold text-slate-800">Aktif işlerim</h2><p className="mt-0.5 text-xs text-slate-400">Sahada devam eden iş emirleri</p></div>
              <Link href="/user/islerim" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800">Tümünü gör <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <OrderList orders={active} emptyText="Aktif iş emri yok." />
          </div>
        </section>
      )}

      <section className="erp-section-card">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <History className="h-4 w-4 text-slate-400" />
          <div><h2 className="text-sm font-semibold text-slate-800">Son hareketler</h2><p className="mt-0.5 text-xs text-slate-400">İş emirlerindeki en son durum değişiklikleri</p></div>
        </div>
        {!loading && recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">Henüz hareket bulunmuyor.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map(order => (
              <li key={order.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${COMPLETED_STATUSES.includes(order.status) ? "bg-emerald-500" : ACTIVE_STATUSES.includes(order.status) ? "bg-amber-500" : CANCELLED_STATUSES.includes(order.status) ? "bg-red-500" : "bg-blue-500"}`} />
                <div className="min-w-0 flex-1">
                  <Link href={`/user/islerim/${order.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-blue-700">{orderTitle(order)}</Link>
                  <p className="mt-0.5 text-xs text-slate-400">Durum: {STATUS_LABEL[order.status] ?? order.status}</p>
                </div>
                <time className="shrink-0 text-xs text-slate-400">{formatDate(order.updated_at ?? order.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
