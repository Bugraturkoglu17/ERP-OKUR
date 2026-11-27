"use client";

import { InfoHint } from "@/components/ui/info-hint";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, ChevronRight, CircleDashed, Clock3, History } from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";
import DocumentQuickSearch from "@/components/dashboard/document-quick-search";
import { MetricCard } from "@/components/dashboard/metric-card";
import { useRefreshSignal } from "@/lib/refresh-signal";

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

type BadgeVariant = "info" | "muted" | "warning" | "success" | "destructive" | "secondary";
const STATUS_BADGE: Record<string, BadgeVariant> = {
  planned: "info", draft: "muted", sent: "info", approval_pending: "info", started: "warning",
  material_waiting: "warning", revisit: "secondary", completed: "success", approved: "success",
  failed: "destructive", cancelled: "destructive",
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
    return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="divide-y">
      {orders.slice(0, 5).map(order => (
        <li key={order.id}>
          <Link href={`/user/islerim/${order.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-accent">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{orderTitle(order)}</p>
              {order.project_no && <p className="mt-0.5 text-xs text-muted-foreground">Mağaza kodu: {order.project_no}</p>}
            </div>
            <Badge variant={STATUS_BADGE[order.status] ?? "muted"} className="shrink-0">{STATUS_LABEL[order.status] ?? order.status}</Badge>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, hint, action, children }: { title: string; hint: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-4">
        <CardTitle className="text-sm">{title}<InfoHint text={hint} /></CardTitle>
        {action}
      </CardHeader>
      <Separator />
      {children}
    </Card>
  );
}

export default function UserDashboardPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshSignal = useRefreshSignal();
  useEffect(() => {
    apiGet<WorkOrder[]>("/work-orders")
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setError("İş emirleri yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin."))
      .finally(() => setLoading(false));
  }, [refreshSignal]);

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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Genel Bakış<InfoHint text="Atanan işlerin güncel durumu ve son hareketleri" /></h1>

      <DocumentQuickSearch />

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="İş emri özeti">
        {stats.map((stat) => <MetricCard key={stat.label} {...stat} value={loading ? "…" : stat.value} />)}
      </section>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          <Section title="Yeni gelen işler" hint="Süreci başlatılmayı bekleyen iş emirleri" action={<span className="text-sm font-bold tabular-nums text-primary">{planned.length}</span>}>
            <OrderList orders={planned} emptyText="Planlanacak iş emri yok." />
          </Section>
          <Section title="Aktif işlerim" hint="Sahada devam eden iş emirleri"
            action={<Button variant="link" size="sm" asChild className="h-auto p-0 text-xs"><Link href="/user/islerim">Tümünü gör<ChevronRight data-icon="inline-end" /></Link></Button>}>
            <OrderList orders={active} emptyText="Aktif iş emri yok." />
          </Section>
        </section>
      )}

      <Section title="Son hareketler" hint="İş emirlerindeki en son durum değişiklikleri" action={<History className="size-4 text-muted-foreground" />}>
        {!loading && recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Henüz hareket bulunmuyor.</p>
        ) : (
          <ul className="divide-y">
            {recent.map(order => (
              <li key={order.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={cn("size-2 shrink-0 rounded-full", COMPLETED_STATUSES.includes(order.status) ? "bg-emerald-500" : ACTIVE_STATUSES.includes(order.status) ? "bg-amber-500" : CANCELLED_STATUSES.includes(order.status) ? "bg-red-500" : "bg-blue-500")} />
                <div className="min-w-0 flex-1">
                  <Link href={`/user/islerim/${order.id}`} className="block truncate text-sm font-medium hover:text-primary">{orderTitle(order)}</Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">Durum: {STATUS_LABEL[order.status] ?? order.status}</p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">{formatDate(order.updated_at ?? order.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
