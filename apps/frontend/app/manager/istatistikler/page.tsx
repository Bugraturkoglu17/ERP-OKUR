"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, Boxes, CalendarClock, CheckCircle2, ClipboardList, Gauge,
  MapPinned, RefreshCw, Store, Timer, UsersRound,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import {
  CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, getManagerWorkOrders,
  type WorkOrder, type WorkOrderCategory, type WorkOrderPriority, type WorkOrderStatus,
} from "@/services/managerWorkOrders";
import { getAllRegions, getStoresPage } from "@/services/stores";
import { Skeleton } from "@/components/ui/skeleton";

type UserRow = {
  id: string; full_name: string; email: string; phone?: string | null;
  is_active: boolean; default_role?: string | null; force_password_change?: boolean;
};
type Depot = { id: string; kind: "main" | "vehicle"; name: string; is_active: boolean };
type StockRow = { material_id: string; quantity: string | number; min_stock?: string | number | null };
type Assets = { stores: number; regions: number; materials: number; lowStock: number; vehicles: number };

const DAY = 86_400_000;
const WEEKS = 8;

const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  planned: "#94a3b8", in_progress: "#2563eb", completed: "#059669", cancelled: "#e2e8f0",
};
const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  critical: "bg-red-500", important: "bg-amber-400", normal: "bg-slate-300",
};
const CATEGORY_COLOR: Record<WorkOrderCategory, string> = {
  ariza: "bg-blue-600", tadilat: "bg-indigo-400", yeni_yapim: "bg-teal-500",
};

const isOpen = (order: WorkOrder) => order.status === "planned" || order.status === "in_progress";
const isOverdue = (order: WorkOrder, now: number) =>
  isOpen(order) && Boolean(order.due_date) && new Date(order.due_date as string).getTime() < now;
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const fmt = (value: number) => value.toLocaleString("tr-TR");

function roleLabel(role?: string | null) {
  const value = role ?? "";
  if (value.includes("platform")) return "Geliştirici admin";
  if (value === "admin" || value.includes("manager")) return "Yönetici";
  return "Saha kullanıcısı";
}

function startOfWeek(time: number) {
  const date = new Date(time);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  return date.getTime() - day * DAY;
}

/** Durum dağılımı için halka grafik. */
function Donut({ parts, total }: { parts: { key: WorkOrderStatus; value: number }[]; total: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img" aria-label="İş emri durum dağılımı">
      <circle cx="70" cy="70" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="16" />
      {total > 0 && parts.map(({ key, value }) => {
        const length = (value / total) * circumference;
        const segment = (
          <circle key={key} cx="70" cy="70" r={radius} fill="none" stroke={STATUS_COLOR[key]} strokeWidth="16"
            strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
        );
        offset += length;
        return segment;
      })}
      <text x="70" y="68" textAnchor="middle" className="fill-slate-950 text-[26px] font-bold">{fmt(total)}</text>
      <text x="70" y="88" textAnchor="middle" className="fill-slate-400 text-[10px]">iş emri</text>
    </svg>
  );
}

function BarRow({ label, value, total, barClass, suffix }: { label: string; value: number; total: number; barClass: string; suffix?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="truncate font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500"><strong className="text-slate-900">{fmt(value)}</strong>{suffix ?? ` · %${pct(value, total)}`}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${total ? Math.max((value / total) * 100, value ? 2 : 0) : 0}%` }} />
      </div>
    </div>
  );
}

function Section({ title, description, icon: Icon, children, className = "" }: {
  title: string; description?: string; icon: typeof Gauge; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`erp-section-card ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div><h2 className="text-sm font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-xs text-slate-400">{description}</p>}</div>
        <Icon className="h-4 w-4 shrink-0 text-slate-300" />
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function ManagerStatisticsPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [workOrders, userList] = await Promise.all([getManagerWorkOrders(), apiGet<UserRow[]>("/auth/users")]);
      setOrders(workOrders);
      setUsers(Array.isArray(userList) ? userList : []);
      setNow(Date.now());
    } catch {
      setError("İstatistikler yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin.");
    }
    // Varlık özeti ikincil bilgidir; başarısız olursa sayfanın geri kalanı yine gösterilir.
    try {
      const [stores, regions, depots] = await Promise.all([
        getStoresPage({ page: 1, pageSize: 1, includeCancelled: false }),
        getAllRegions(),
        apiGet<Depot[]>("/retail-stock/depots"),
      ]);
      const activeDepots = (Array.isArray(depots) ? depots : []).filter((depot) => depot.is_active);
      const mainDepot = activeDepots.find((depot) => depot.kind === "main");
      const stock = mainDepot ? await apiGet<StockRow[]>("/retail-stock/stock", { depot_id: mainDepot.id }) : [];
      setAssets({
        stores: stores.total,
        regions: regions.length,
        materials: stock.length,
        lowStock: stock.filter((row) => row.min_stock != null && Number(row.min_stock) > 0 && Number(row.quantity) < Number(row.min_stock)).length,
        vehicles: activeDepots.filter((depot) => depot.kind === "vehicle").length,
      });
    } catch {
      setAssets(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const total = orders.length;
    const byStatus = (["planned", "in_progress", "completed", "cancelled"] as WorkOrderStatus[])
      .map((key) => ({ key, value: orders.filter((order) => order.status === key).length }));
    const open = orders.filter(isOpen).length;
    const completed = orders.filter((order) => order.status === "completed");
    const overdue = orders.filter((order) => isOverdue(order, now)).length;
    const closable = total - byStatus[3].value;
    const avgDays = completed.length
      ? completed.reduce((sum, order) => sum + (new Date(order.updated_at).getTime() - new Date(order.created_at).getTime()), 0) / completed.length / DAY
      : null;
    const thisWeek = startOfWeek(now);
    const completedThisWeek = completed.filter((order) => new Date(order.updated_at).getTime() >= thisWeek).length;

    const byCategory = (Object.keys(CATEGORY_LABEL) as WorkOrderCategory[])
      .map((key) => ({ key, value: orders.filter((order) => order.category === key).length }));
    const byPriority = (["critical", "important", "normal"] as WorkOrderPriority[])
      .map((key) => ({ key, value: orders.filter((order) => isOpen(order) && order.priority === key).length }));

    const weeks = Array.from({ length: WEEKS }, (_, index) => {
      const start = thisWeek - (WEEKS - 1 - index) * 7 * DAY;
      const end = start + 7 * DAY;
      const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= start && t < end; };
      return {
        label: new Date(start).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }),
        opened: orders.filter((order) => inRange(order.created_at)).length,
        closed: completed.filter((order) => inRange(order.updated_at)).length,
      };
    });
    const weekMax = Math.max(1, ...weeks.flatMap((week) => [week.opened, week.closed]));

    const regionMap = new Map<string, { open: number; total: number }>();
    orders.forEach((order) => {
      const key = order.store_region || order.store_city || "Bölge girilmemiş";
      const entry = regionMap.get(key) ?? { open: 0, total: 0 };
      entry.total += 1;
      if (isOpen(order)) entry.open += 1;
      regionMap.set(key, entry);
    });
    const regions = Array.from(regionMap.entries()).map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.total - a.total).slice(0, 6);

    const team = users.map((user) => {
      const mine = orders.filter((order) => order.assigned_to === user.id);
      const done = mine.filter((order) => order.status === "completed").length;
      const active = mine.filter(isOpen).length;
      const late = mine.filter((order) => isOverdue(order, now)).length;
      const lastUpdate = mine.reduce((latest, order) => Math.max(latest, new Date(order.updated_at).getTime()), 0);
      return { user, total: mine.length, done, active, late, rate: pct(done, mine.length - mine.filter((o) => o.status === "cancelled").length), lastUpdate };
    }).sort((a, b) => b.active - a.active || b.total - a.total);

    return {
      total, byStatus, open, overdue, avgDays, completedThisWeek, byCategory, byPriority, weeks, weekMax, regions, team,
      completionRate: pct(completed.length, closable),
      unassigned: orders.filter((order) => isOpen(order) && !order.assigned_to).length,
      activeUsers: users.filter((user) => user.is_active).length,
      pendingUsers: users.filter((user) => user.is_active && user.force_password_change).length,
    };
  }, [orders, users, now]);

  const count = (value?: number) => (value === undefined ? "—" : fmt(value));
  const tiles: { label: string; value: string; sub: string; icon: typeof Gauge; tone: string; href?: string }[] = [
    { label: "Açık iş emri", value: fmt(stats.open), sub: `${fmt(stats.unassigned)} atanmamış`, icon: ClipboardList, tone: "bg-blue-50 text-blue-700", href: "/manager/is-emirleri" },
    { label: "Tamamlanma oranı", value: `%${stats.completionRate}`, sub: `Bu hafta ${fmt(stats.completedThisWeek)} kapandı`, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Geciken", value: fmt(stats.overdue), sub: "Termini geçmiş", icon: CalendarClock, tone: "bg-red-50 text-red-700", href: "/manager/is-emirleri?filter=overdue" },
    { label: "Ort. kapanış", value: stats.avgDays === null ? "—" : `${stats.avgDays.toFixed(1)} gün`, sub: "Açılıştan tamamlanmaya", icon: Timer, tone: "bg-amber-50 text-amber-700" },
    { label: "Aktif mağaza", value: count(assets?.stores), sub: `${fmt(assets?.regions ?? 0)} bölge`, icon: Store, tone: "bg-slate-100 text-slate-600", href: "/manager/magaza-karti" },
    { label: "Stok kalemi", value: count(assets?.materials), sub: "Ana depoda tanımlı", icon: Boxes, tone: "bg-slate-100 text-slate-600", href: "/manager/depo-stok" },
    { label: "Kritik stok", value: count(assets?.lowStock), sub: "Minimumun altında", icon: AlertCircle, tone: "bg-slate-100 text-slate-600", href: "/manager/depo-stok" },
    { label: "Aktif kullanıcı", value: fmt(stats.activeUsers), sub: `${count(assets?.vehicles)} cep depo`, icon: UsersRound, tone: "bg-slate-100 text-slate-600", href: "/manager/kullanicilar" },
  ];

  const generatedAt = now ? new Date(now).toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="mx-auto max-w-screen-2xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-950">İstatistikler</h1>
          <p className="text-sm text-slate-500">Firmanın güncel durumu, yapılan işler ve ekip performansı.</p>
        </div>
        <div className="flex items-center gap-3">
          {generatedAt && <span className="text-xs text-slate-400">{generatedAt}</span>}
          <button type="button" onClick={() => void load()} disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Yenile
          </button>
        </div>
      </header>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-8" aria-label="Temel göstergeler">
        {tiles.map(({ label, value, sub, icon: Icon, tone, href }) => (
          <Link key={label} href={href ?? "#"} className={`flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-slate-300 ${href ? "" : "pointer-events-none"}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium text-slate-500">{label}</span>
              <span className="block text-lg font-bold leading-6 tabular-nums text-slate-950">{loading && !now ? <Skeleton className="mt-0.5 h-5 w-10" /> : value}</span>
              <span className="block truncate text-[10px] text-slate-400">{sub}</span>
            </span>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Section title="İş emri durumları" description="Tüm iş emirlerinin aşamalara göre dağılımı." icon={Gauge}>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Donut parts={stats.byStatus} total={stats.total} />
            <ul className="w-full space-y-2.5">
              {stats.byStatus.map(({ key, value }) => (
                <li key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[key] }} />{STATUS_LABEL[key]}</span>
                  <span className="whitespace-nowrap tabular-nums text-slate-500"><strong className="text-slate-900">{fmt(value)}</strong> · %{pct(value, stats.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section title="İş türü ve öncelik" description="Türler tüm işler, öncelikler yalnızca açık işler üzerinden." icon={ClipboardList}>
          <div className="space-y-3">
            {stats.byCategory.map(({ key, value }) => <BarRow key={key} label={CATEGORY_LABEL[key]} value={value} total={stats.total} barClass={CATEGORY_COLOR[key]} />)}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-500">Açık işlerin önceliği</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              {stats.byPriority.map(({ key, value }) => value > 0 && <div key={key} className={PRIORITY_COLOR[key]} style={{ width: `${pct(value, stats.open)}%` }} title={`${PRIORITY_LABEL[key]}: ${value}`} />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
              {stats.byPriority.map(({ key, value }) => <span key={key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${PRIORITY_COLOR[key]}`} />{PRIORITY_LABEL[key]} <strong className="tabular-nums text-slate-900">{fmt(value)}</strong></span>)}
            </div>
          </div>
        </Section>

        <Section title="Bölgelere göre iş yükü" description="En çok iş emri olan bölgeler." icon={MapPinned} className="lg:col-span-2 xl:col-span-1">
          {stats.regions.length === 0
            ? <p className="py-8 text-center text-sm text-slate-500">Henüz iş emri bulunmuyor.</p>
            : <div className="space-y-3">{stats.regions.map((region) => (
              <BarRow key={region.name} label={region.name} value={region.total} total={stats.regions[0].total} barClass="bg-blue-600" suffix={` · ${fmt(region.open)} açık`} />
            ))}</div>}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Haftalık iş akışı" description={`Son ${WEEKS} haftada açılan ve tamamlanan iş emirleri.`} icon={CalendarClock}>
          <div className="flex h-40 items-end gap-2 sm:gap-3" role="img" aria-label="Haftalık açılan ve tamamlanan iş emri grafiği">
            {stats.weeks.map((week) => (
              <div key={week.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <div className="w-1/2 max-w-4 rounded-t bg-blue-600" style={{ height: `${(week.opened / stats.weekMax) * 100}%` }} title={`Açılan: ${week.opened}`} />
                  <div className="w-1/2 max-w-4 rounded-t bg-emerald-500" style={{ height: `${(week.closed / stats.weekMax) * 100}%` }} title={`Tamamlanan: ${week.closed}`} />
                </div>
                <span className="truncate text-[10px] text-slate-400">{week.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-600" />Açılan</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Tamamlanan</span>
          </div>
        </Section>


      <section className="erp-section-card xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Kullanıcı durumları</h2>
            <p className="mt-1 text-xs text-slate-400">{fmt(stats.activeUsers)} aktif hesap{stats.pendingUsers > 0 ? ` · ${fmt(stats.pendingUsers)} hesap ilk girişte parola değiştirecek` : ""}</p>
          </div>
          <Link href="/manager/kullanicilar" className="text-xs font-semibold text-blue-700 hover:text-blue-800">Kullanıcıları yönet</Link>
        </div>
        {stats.team.length === 0
          ? <p className="px-5 py-12 text-center text-sm text-slate-500">{loading ? "Yükleniyor" : "Kullanıcı bulunamadı."}</p>
          : <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead><tr className="whitespace-nowrap border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5">Kullanıcı</th><th className="px-2 py-2.5">Hesap</th><th className="px-2 py-2.5 text-right">Aktif iş</th>
                <th className="px-2 py-2.5 text-right">Tamamlanan</th><th className="px-2 py-2.5 text-right">Geciken</th><th className="px-3 py-2.5">Tamamlanma</th><th className="px-3 py-2.5">Son hareket</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {stats.team.map(({ user, total, done, active, late, rate, lastUpdate }) => (
                  <tr key={user.id} className="whitespace-nowrap hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <p className="max-w-[10rem] truncate font-medium text-slate-900">{user.full_name || user.email}</p>
                      <p className="text-xs text-slate-400">{roleLabel(user.default_role)}</p>
                    </td>
                    <td className="px-2 py-2">
                      {!user.is_active
                        ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Pasif</span>
                        : user.force_password_change
                          ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Giriş bekliyor</span>
                          : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Aktif</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-slate-900">{fmt(active)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmt(done)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${late ? "font-semibold text-red-600" : "text-slate-400"}`}>{fmt(late)}</td>
                    <td className="px-3 py-2">
                      {total === 0 ? <span className="text-xs text-slate-400">İş atanmadı</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} /></div>
                          <span className="text-xs tabular-nums text-slate-600">%{rate}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{lastUpdate ? new Date(lastUpdate).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </section>
      </div>

    </div>
  );
}
