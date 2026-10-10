"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, CalendarClock, CheckCircle2,
  ClipboardList, TimerReset, UsersRound,
} from "lucide-react";
import {
  PRIORITY_LABEL, STATUS_LABEL, getManagerWorkOrders, getTeamUsers,
  type TeamUser, type WorkOrder,
} from "@/services/managerWorkOrders";
import { Skeleton } from "@/components/ui/skeleton";
import DocumentQuickSearch from "@/components/dashboard/document-quick-search";
import { MetricCard } from "@/components/dashboard/metric-card";

function isOverdue(order: WorkOrder, referenceTime: number | null) {
  return Boolean(referenceTime && order.due_date && !["completed", "cancelled"].includes(order.status) && new Date(order.due_date).getTime() < referenceTime);
}

const priorityRank = { critical: 0, important: 1, normal: 2 } as const;
const priorityClass = {
  critical: "border-red-200 bg-red-50 text-red-700",
  important: "border-amber-200 bg-amber-50 text-amber-700",
  normal: "border-slate-200 bg-slate-50 text-slate-600",
} as const;

function deadlineLabel(order: WorkOrder, referenceTime: number | null) {
  if (order.status === "completed") return { label: "Tamamlandı", tone: "text-emerald-700" };
  if (order.status === "cancelled") return { label: "İptal edildi", tone: "text-slate-500" };
  if (!order.due_date || !referenceTime) return { label: "Termin girilmedi", tone: "text-slate-400" };
  const days = Math.ceil((new Date(order.due_date).getTime() - referenceTime) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} gün gecikti`, tone: "text-red-700" };
  if (days === 0) return { label: "Termin bugün", tone: "text-amber-700" };
  return { label: `${days} gün kaldı`, tone: days <= 3 ? "text-amber-700" : "text-slate-600" };
}

export default function ManagerDashboardPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referenceTime, setReferenceTime] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getManagerWorkOrders(), getTeamUsers()])
      .then(([workOrders, team]) => { setOrders(workOrders); setUsers(team); setReferenceTime(Date.now()); })
      .catch(() => setError("Operasyon özeti yüklenemedi."))
      .finally(() => setLoading(false));
  }, []);

  const kpis = useMemo(() => [
    { label: "Planlanacak", value: orders.filter((item) => item.status === "planned").length, description: "Başlatılmayı bekleyen", href: "/manager/is-emirleri?tab=planned", icon: ClipboardList },
    { label: "Devam Eden", value: orders.filter((item) => item.status === "in_progress").length, description: "Sahada işlem gören", href: "/manager/is-emirleri?tab=in_progress", icon: TimerReset },
    { label: "Tamamlanan", value: orders.filter((item) => item.status === "completed").length, description: "Süreci kapanan", href: "/manager/is-emirleri?tab=completed", icon: CheckCircle2 },
    { label: "Geciken", value: orders.filter((order) => isOverdue(order, referenceTime)).length, description: "Termini geçen", href: "/manager/is-emirleri?filter=overdue", icon: CalendarClock },
  ], [orders, referenceTime]);

  const assignedOrders = useMemo(() => [...orders]
    .filter((order) => Boolean(order.assigned_to))
    .sort((a, b) => {
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }), [orders]);

  const recent = useMemo(() => [...orders]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6), [orders]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-950">Genel Bakış</h1><p className="mt-1 text-sm text-slate-500">Operasyonun güncel durumu ve öncelikli aksiyonlar.</p></div>
      </header>

      <DocumentQuickSearch />

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Operasyon özeti">
        {loading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="min-h-36 rounded-2xl border border-slate-200 bg-white p-4"><Skeleton className="h-4 w-24" /><Skeleton className="mt-5 h-9 w-12" /></div>) : kpis.map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="erp-section-card">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5"><h2 className="text-sm font-semibold text-slate-900">Termin ve aşama takibi</h2><p className="mt-1 text-xs text-slate-400">Atanmış işler önem derecesine göre sıralanır.</p></div>
          {loading ? <div className="space-y-3 p-5"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : assignedOrders.length === 0 ? <div className="px-5 py-12 text-center"><CalendarClock className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm text-slate-500">Atanmış iş bulunmuyor.</p></div> : <div className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">{assignedOrders.map((order) => { const deadline = deadlineLabel(order, referenceTime); return <Link key={order.id} href={`/manager/is-emirleri/${order.id}`} className="group block px-4 py-4 transition-colors hover:bg-slate-50 sm:px-5"><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-md border px-2 py-1 text-[10px] font-bold ${priorityClass[order.priority]}`}>{PRIORITY_LABEL[order.priority]}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{order.store_name} - {order.title}</p><p className="mt-1 truncate text-xs text-slate-500">{order.assigned_to_name}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" /></div><div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs sm:grid-cols-3"><span><span className="block text-[10px] text-slate-400">Termin</span><strong className="font-semibold text-slate-700">{order.due_date ? new Date(order.due_date).toLocaleDateString("tr-TR") : "—"}</strong></span><span><span className="block text-[10px] text-slate-400">Kalan süre</span><strong className={`font-semibold ${deadline.tone}`}>{deadline.label}</strong></span><span className="col-span-2 sm:col-span-1"><span className="block text-[10px] text-slate-400">Aşama</span><strong className="font-semibold text-blue-700">{STATUS_LABEL[order.status]}</strong></span></div></Link>; })}</div>}
        </section>

        <section className="erp-section-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Ekip İş Yükü</h2><UsersRound className="h-4 w-4 text-slate-300" /></div>
          {loading ? <div className="space-y-3 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : users.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">Aktif çalışan bulunamadı.</p> : <div className="divide-y divide-slate-100">{users.map((user) => { const mine = orders.filter((order) => order.assigned_to === user.id); return <div key={user.id} className="grid grid-cols-[1fr_repeat(3,auto)] items-center gap-4 px-5 py-3"><p className="truncate text-sm font-medium text-slate-800">{user.full_name || user.email}</p><span className="text-center text-xs text-slate-500"><strong className="block text-sm text-slate-900">{mine.filter((item) => item.status === "planned").length}</strong>Plan</span><span className="text-center text-xs text-slate-500"><strong className="block text-sm text-slate-900">{mine.filter((item) => item.status === "in_progress").length}</strong>Aktif</span><span className="text-center text-xs text-slate-500"><strong className="block text-sm text-red-600">{mine.filter((order) => isOverdue(order, referenceTime)).length}</strong>Geciken</span></div>; })}</div>}
        </section>
      </div>

      <section className="erp-section-card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Son Hareketler</h2><Link href="/manager/is-emirleri" className="text-xs font-semibold text-blue-700 hover:text-blue-800">Tümünü Gör</Link></div>
        {recent.length === 0 && !loading ? <p className="px-5 py-10 text-center text-sm text-slate-500">Henüz hareket bulunmuyor.</p> : <div className="divide-y divide-slate-100">{recent.map((order) => <Link key={order.id} href={`/manager/is-emirleri/${order.id}`} className="grid gap-1 px-5 py-3.5 hover:bg-slate-50 sm:grid-cols-[1fr_auto]"><p className="text-sm text-slate-700"><span className="font-semibold">{order.assigned_to_name}</span>: {order.title} güncellendi.</p><time className="text-xs text-slate-400">{new Date(order.updated_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></Link>)}</div>}
      </section>
    </div>
  );
}
