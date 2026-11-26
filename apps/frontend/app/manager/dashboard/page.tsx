"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { cn, daysUntilDue, isPastDue } from "@/lib/utils";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, CalendarClock, CheckCircle2, ChevronRight,
  ClipboardList, TimerReset, UsersRound,
} from "lucide-react";
import {
  PRIORITY_LABEL, STATUS_LABEL, getManagerWorkOrders, getTeamUsers,
  type TeamUser, type WorkOrder,
} from "@/services/managerWorkOrders";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";
import DocumentQuickSearch from "@/components/dashboard/document-quick-search";
import { MetricCard } from "@/components/dashboard/metric-card";

function isOverdue(order: WorkOrder, referenceTime: number | null) {
  return Boolean(referenceTime) && !["completed", "cancelled"].includes(order.status) && isPastDue(order.due_date, new Date(referenceTime as number));
}

const priorityRank = { critical: 0, important: 1, normal: 2 } as const;
const PRIORITY_BADGE = { critical: "destructive", important: "warning", normal: "muted" } as const;

function deadlineLabel(order: WorkOrder, referenceTime: number | null) {
  if (order.status === "completed") return { label: "Tamamlandı", tone: "text-emerald-700" };
  if (order.status === "cancelled") return { label: "İptal edildi", tone: "text-slate-500" };
  if (!order.due_date || !referenceTime) return { label: "Termin girilmedi", tone: "text-slate-400" };
  const days = daysUntilDue(order.due_date, new Date(referenceTime)) ?? 0;
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
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Genel Bakış<InfoHint text="Operasyonun güncel durumu ve öncelikli aksiyonlar." /></h1>

      <DocumentQuickSearch />

      {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Operasyon özeti">
        {loading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="min-h-36" />) : kpis.map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardHeader className="px-4 py-4 sm:px-5"><CardTitle className="text-sm">Termin ve aşama takibi<InfoHint text="Atanmış işler önem derecesine göre sıralanır." /></CardTitle></CardHeader>
          <Separator />
          {loading ? <div className="flex flex-col gap-3 p-5"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
            : assignedOrders.length === 0 ? (
              <Empty><EmptyHeader><EmptyMedia variant="icon"><CalendarClock /></EmptyMedia><EmptyTitle className="text-sm font-normal text-muted-foreground">Atanmış iş bulunmuyor.</EmptyTitle></EmptyHeader></Empty>
            ) : (
              <div className="max-h-[34rem] divide-y overflow-y-auto">
                {assignedOrders.map((order) => {
                  const deadline = deadlineLabel(order, referenceTime);
                  return (
                    <Link key={order.id} href={`/manager/is-emirleri/${order.id}`} className="group block px-4 py-4 transition-colors hover:bg-accent sm:px-5">
                      <div className="flex items-start gap-3">
                        <Badge variant={PRIORITY_BADGE[order.priority]} className="mt-0.5">{PRIORITY_LABEL[order.priority]}</Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{order.store_name} - {order.title}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{order.assigned_to_name}</p>
                        </div>
                        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted px-3 py-2 text-xs sm:grid-cols-3">
                        <span><span className="block text-[10px] text-muted-foreground">Termin</span><strong className="font-semibold">{order.due_date ? new Date(order.due_date).toLocaleDateString("tr-TR") : "—"}</strong></span>
                        <span><span className="block text-[10px] text-muted-foreground">Kalan süre</span><strong className={cn("font-semibold", deadline.tone)}>{deadline.label}</strong></span>
                        <span className="col-span-2 sm:col-span-1"><span className="block text-[10px] text-muted-foreground">Aşama</span><strong className="font-semibold text-primary">{STATUS_LABEL[order.status]}</strong></span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-4"><CardTitle className="text-sm">Ekip İş Yükü</CardTitle><UsersRound className="size-4 text-muted-foreground" /></CardHeader>
          <Separator />
          {loading ? <div className="flex flex-col gap-3 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            : users.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">Aktif çalışan bulunamadı.</p>
            : (
              <div className="divide-y">
                {users.map((user) => {
                  const mine = orders.filter((order) => order.assigned_to === user.id);
                  return (
                    <div key={user.id} className="grid grid-cols-[1fr_repeat(3,auto)] items-center gap-4 px-5 py-3">
                      <p className="truncate text-sm font-medium">{user.full_name || user.email}</p>
                      <span className="text-center text-xs text-muted-foreground"><strong className="block text-sm text-foreground">{mine.filter((item) => item.status === "planned").length}</strong>Plan</span>
                      <span className="text-center text-xs text-muted-foreground"><strong className="block text-sm text-foreground">{mine.filter((item) => item.status === "in_progress").length}</strong>Aktif</span>
                      <span className="text-center text-xs text-muted-foreground"><strong className="block text-sm text-destructive">{mine.filter((order) => isOverdue(order, referenceTime)).length}</strong>Geciken</span>
                    </div>
                  );
                })}
              </div>
            )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-4">
          <CardTitle className="text-sm">Son Hareketler</CardTitle>
          <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs"><Link href="/manager/is-emirleri">Tümünü Gör</Link></Button>
        </CardHeader>
        <Separator />
        {recent.length === 0 && !loading ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">Henüz hareket bulunmuyor.</p> : (
          <div className="divide-y">
            {recent.map((order) => (
              <Link key={order.id} href={`/manager/is-emirleri/${order.id}`} className="grid gap-1 px-5 py-3.5 hover:bg-accent sm:grid-cols-[1fr_auto]">
                <p className="text-sm"><span className="font-semibold">{order.assigned_to_name}</span>: {order.title} güncellendi.</p>
                <time className="text-xs text-muted-foreground">{new Date(order.updated_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
