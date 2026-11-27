"use client";

import { isPastDue } from "@/lib/utils";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, Boxes, CalendarClock, CheckCircle2, ClipboardList, Gauge,
  MapPinned, Store, Timer, UsersRound,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import {
  CATEGORY_LABEL, CREATABLE_CATEGORIES, PRIORITY_LABEL, STATUS_LABEL, getManagerWorkOrders,
  type WorkOrder, type WorkOrderCategory, type WorkOrderPriority, type WorkOrderStatus,
} from "@/services/managerWorkOrders";
import { getAllRegions, getStoresPage } from "@/services/stores";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSlot } from "@/components/layout/header-slot";
import { isLowStock } from "@/components/retail-stock/retail-stock-page";
import { CountUp, Reveal, StatClock, countAt, delay, useClockEffect } from "@/components/stats/motion";
import { InfoHint } from "@/components/ui/info-hint";
import { ProjectStatsBlock } from "@/components/stats/project-stats";
import { getProjectStats, type ProjectStats } from "@/services/installationProjects";

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
  ariza: "bg-blue-600", tadilat: "bg-indigo-400", proje: "bg-teal-500", yeni_yapim: "bg-slate-400",
};

const isOpen = (order: WorkOrder) => order.status === "planned" || order.status === "in_progress";
const isOverdue = (order: WorkOrder, now: number) =>
  isOpen(order) && isPastDue(order.due_date, new Date(now));
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

// Genel stil dosyasındaki "transition-duration: 0.01ms" kuralı her karede yeni bir geçiş başlattığı için halka yayı ancak
// sayma bitince boyanıyordu; geçişi tümüyle kapatmak bunu önler.
const NO_TRANSITION = { transition: "none" } as const;

/** Durum dağılımı için halka grafik. Yaylar ve ortadaki sayı saatten doğrudan DOM'a yazılır (React yeniden çizilmez). */
function Donut({ parts, total }: { parts: { key: WorkOrderStatus; value: number }[]; total: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const arcs = useRef<(SVGCircleElement | null)[]>([]);
  const label = useRef<SVGTextElement>(null);
  const signature = parts.map((part) => part.value).join(",");

  useClockEffect((progress) => {
    let offset = 0;
    parts.forEach(({ value }, index) => {
      const length = total > 0 ? (value / total) * circumference * progress : 0;
      const arc = arcs.current[index];
      if (arc) {
        arc.setAttribute("stroke-dasharray", `${length} ${circumference - length}`);
        arc.setAttribute("stroke-dashoffset", String(-offset));
      }
      offset += length;
    });
    if (label.current) label.current.textContent = fmt(countAt(total, progress));
  }, [signature, total]);

  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="İş emri durum dağılımı">
      <circle cx="70" cy="70" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="16" />
      {parts.map(({ key }, index) => (
        <circle key={key} ref={(node) => { arcs.current[index] = node; }} cx="70" cy="70" r={radius} fill="none" stroke={STATUS_COLOR[key]} strokeWidth="16"
          transform="rotate(-90 70 70)" style={NO_TRANSITION} />
      ))}
      <text ref={label} x="70" y="68" textAnchor="middle" className="fill-slate-950 text-[26px] font-bold" />
      <text x="70" y="88" textAnchor="middle" className="fill-slate-400 text-[10px]">iş emri</text>
    </svg>
  );
}

/** Tamamlanma oranı göstergesi (koyu zemin üzerinde dolan halka). */
function CompletionGauge({ rate }: { rate: number }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const arc = useRef<SVGCircleElement>(null);
  const label = useRef<SVGTextElement>(null);

  useClockEffect((progress) => {
    arc.current?.setAttribute("stroke-dasharray", `${(rate / 100) * circumference * progress} ${circumference}`);
    if (label.current) label.current.textContent = `%${countAt(rate, progress)}`;
  }, [rate]);

  return (
    <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img" aria-label={`Tamamlanma oranı yüzde ${rate}`}>
      <defs>
        <linearGradient id="stat-gauge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" /><stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
      <circle ref={arc} cx="70" cy="70" r={radius} fill="none" stroke="url(#stat-gauge)" strokeWidth="12" strokeLinecap="round"
        transform="rotate(-90 70 70)" style={NO_TRANSITION} />
      <text ref={label} x="70" y="72" textAnchor="middle" className="fill-white text-[30px] font-bold" />
      <text x="70" y="92" textAnchor="middle" className="fill-sky-100/70 text-[10px]">tamamlandı</text>
    </svg>
  );
}

function BarRow({ label, value, total, barClass, detail, order = 0 }: {
  label: string; value: number; total: number; barClass: string; detail?: { value: number; label: string }; order?: number;
}) {
  return (
    <div className="stat-row-in" style={delay(150 + order * 40)}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="truncate font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500"><strong className="text-slate-900"><CountUp value={value} /></strong>{" · "}{detail ? <><CountUp value={detail.value} /> {detail.label}</> : <>%<CountUp value={pct(value, total)} /></>}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`stat-grow-x h-full rounded-full ${barClass}`}
          style={{ width: `${total ? Math.max((value / total) * 100, value ? 2 : 0) : 0}%` }} />
      </div>
    </div>
  );
}

function Section({ title, description, icon: Icon, children, className = "", index = 0 }: {
  title: string; description?: string; icon: typeof Gauge; children: React.ReactNode; className?: string; index?: number;
}) {
  return (
    <Reveal as="section" index={index} className={`erp-section-card stat-lift flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}{description && <InfoHint text={description} />}</h2>
        <Icon className="h-4 w-4 shrink-0 text-slate-300" />
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </Reveal>
  );
}


export default function ManagerStatisticsPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    // Varlık özeti ikincil bilgidir; başarısız olursa sayfanın geri kalanı yine gösterilir.
    const loadAssets = async (): Promise<Assets | null> => {
      try {
        const [stores, regions, depots] = await Promise.all([
          getStoresPage({ page: 1, pageSize: 1, includeCancelled: false }),
          getAllRegions(),
          apiGet<Depot[]>("/retail-stock/depots"),
        ]);
        const activeDepots = (Array.isArray(depots) ? depots : []).filter((depot) => depot.is_active);
        const mainDepot = activeDepots.find((depot) => depot.kind === "main");
        const stock = mainDepot ? await apiGet<StockRow[]>("/retail-stock/stock", { depot_id: mainDepot.id }) : [];
        return {
          stores: stores.total,
          regions: regions.length,
          materials: stock.length,
          lowStock: stock.filter(isLowStock).length,
          vehicles: activeDepots.filter((depot) => depot.kind === "vehicle").length,
        };
      } catch {
        return null;
      }
    };
    try {
      // Bütün veriler birlikte beklenir ve tek seferde yazılır; yoksa geç gelen kutuların
      // sayıları, diğer animasyonlar bittikten sonra saymaya başlıyordu.
      const [workOrders, userList, nextAssets, nextProjectStats] = await Promise.all([
        getManagerWorkOrders(), apiGet<UserRow[]>("/auth/users"), loadAssets(),
        // Proje özeti de ikincil bilgidir; alınamazsa bölüm gösterilmez.
        getProjectStats().catch(() => null),
      ]);
      setOrders(workOrders);
      setUsers(Array.isArray(userList) ? userList : []);
      setAssets(nextAssets);
      setProjectStats(nextProjectStats);
      setNow(Date.now());
    } catch {
      setError("İstatistikler yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin.");
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

    // Eski "Yeni Yapım" kayıtları yalnızca varsa gösterilir; yeni iş tipleri Arıza, Tadilat, Proje.
    const byCategory = (Object.keys(CATEGORY_LABEL) as WorkOrderCategory[])
      .map((key) => ({ key, value: orders.filter((order) => order.category === key).length }))
      .filter(({ key, value }) => CREATABLE_CATEGORIES.includes(key) || value > 0);
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

  const pulse: { label: string; value: number | null; sub: string; icon: typeof Gauge; href?: string; format?: (value: number) => string; alert?: boolean }[] = [
    { label: "Açık iş emri", value: stats.open, sub: `${fmt(stats.unassigned)} atanmamış`, icon: ClipboardList, href: "/manager/is-emirleri" },
    { label: "Geciken", value: stats.overdue, sub: "Termini geçmiş", icon: CalendarClock, href: "/manager/is-emirleri?filter=overdue", alert: stats.overdue > 0 },
    { label: "Bu hafta kapanan", value: stats.completedThisWeek, sub: "Pazartesiden bugüne", icon: CheckCircle2 },
    { label: "Ort. kapanış", value: stats.avgDays, sub: "Açılıştan tamamlanmaya", icon: Timer, format: (value) => `${value.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} gün` },
  ];
  const assetTiles: { label: string; value?: number; sub: string; icon: typeof Gauge; href: string; tone: string }[] = [
    { label: "Aktif mağaza", value: assets?.stores, sub: `${fmt(assets?.regions ?? 0)} bölge`, icon: Store, href: "/manager/magaza-karti", tone: "bg-sky-50 text-sky-700" },
    { label: "Stok kalemi", value: assets?.materials, sub: "Ana depoda tanımlı", icon: Boxes, href: "/manager/depo-stok", tone: "bg-indigo-50 text-indigo-700" },
    { label: "Kritik stok", value: assets?.lowStock, sub: "Eşikte veya altında", icon: AlertCircle, href: "/manager/depo-stok?filtre=kritik", tone: assets?.lowStock ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600" },
    { label: "Aktif kullanıcı", value: stats.activeUsers, sub: `${assets ? fmt(assets.vehicles) : "—"} cep depo`, icon: UsersRound, href: "/manager/kullanicilar", tone: "bg-emerald-50 text-emerald-700" },
  ];

  const generatedAt = now ? new Date(now).toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const firstLoad = loading && !now;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-3">
      {/* Sayfa başlığı görünmez (yalnızca ekran okuyucular için). Yenileme üst çubuktaki genel "Yenile" ile yapılır. */}
      <HeaderSlot>
        <h1 className="sr-only">İstatistikler</h1>
        {generatedAt && <span className="hidden whitespace-nowrap text-[11px] text-slate-400 md:inline">{generatedAt}</span>}
      </HeaderSlot>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      {firstLoad ? (
        <div className="space-y-4" aria-busy="true" aria-label="İstatistikler yükleniyor">
          <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-52 rounded-2xl lg:col-span-2" /><Skeleton className="h-52 rounded-2xl" /></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
          <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
        </div>
      ) : (
        // Üst çubuktaki "Yenile" sayfayı yeniden kurar; giriş animasyonları baştan oynar.
        <StatClock delay={900} className="space-y-3 stat-intro">
          <div>
            <Reveal as="section" index={0} className="relative overflow-hidden rounded-2xl bg-[#0f2440] px-5 py-4 text-white shadow-[0_18px_45px_rgba(15,36,64,0.25)]">
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
              <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
                <CompletionGauge rate={stats.completionRate} />
                <div className="w-full min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200/70">Operasyon nabzı</p>
                  <h2 className="mt-1 text-lg font-semibold leading-snug">
                    <CountUp value={stats.total} /> iş emrinin <CountUp value={stats.byStatus[2].value} /> tanesi tamamlandı
                  </h2>
                  <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {pulse.map(({ label, value, sub, icon: Icon, href, format, alert }, i) => {
                      const body = (
                        <>
                          <span className="flex items-center gap-1.5 text-[11px] font-medium text-sky-100/70"><Icon className={`h-3.5 w-3.5 ${alert ? "text-rose-300" : ""}`} />{label}</span>
                          <span className={`mt-1 block text-xl font-bold tabular-nums ${alert ? "text-rose-200" : "text-white"}`}>
                            {value === null ? "—" : <CountUp value={value} format={format} />}
                          </span>
                          <span className="block truncate text-[10px] text-sky-100/50">{sub}</span>
                        </>
                      );
                      const cls = "stat-reveal block rounded-xl bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/10 transition-colors";
                      return href
                        ? <Link key={label} href={href} className={`${cls} hover:bg-white/[0.12]`} style={delay(250 + i * 90)}>{body}</Link>
                        : <div key={label} className={cls} style={delay(250 + i * 90)}>{body}</div>;
                    })}
                  </div>
                </div>
              </div>
            </Reveal>

          </div>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Varlık özeti">
            {assetTiles.map(({ label, value, sub, icon: Icon, href, tone }, i) => (
              <Link key={label} href={href} className="stat-reveal stat-lift flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300" style={delay(180 + i * 70)}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-slate-500">{label}</span>
                  <span className="block text-xl font-bold leading-7 tabular-nums text-slate-950">{value === undefined ? "—" : <CountUp value={value} />}</span>
                  <span className="block truncate text-[10px] text-slate-400">{sub}</span>
                </span>
              </Link>
            ))}
          </section>

          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
            <Section index={2} title="İş emri durumları" description="Tüm iş emirlerinin aşamalara göre dağılımı." icon={Gauge}>
              <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row">
                <Donut parts={stats.byStatus} total={stats.total} />
                <ul className="w-full space-y-2.5">
                  {stats.byStatus.map(({ key, value }, i) => (
                    <li key={key} className="stat-row-in flex items-center justify-between gap-3 text-sm" style={delay(150 + i * 40)}>
                      <span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[key] }} />{STATUS_LABEL[key]}</span>
                      <span className="whitespace-nowrap tabular-nums text-slate-500"><strong className="text-slate-900"><CountUp value={value} /></strong> · %<CountUp value={pct(value, stats.total)} /></span>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
            <Section index={3} title="İş türü ve öncelik" description="Türler tüm işler, öncelikler yalnızca açık işler üzerinden." icon={ClipboardList}>
              <div className="mb-4 space-y-3">
                {stats.byCategory.map(({ key, value }, i) => <BarRow key={key} order={i} label={CATEGORY_LABEL[key]} value={value} total={stats.total} barClass={CATEGORY_COLOR[key]} />)}
              </div>
              <div className="mt-auto border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-medium text-slate-500">Açık işlerin önceliği</p>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="stat-grow-x flex h-full">
                    {stats.byPriority.map(({ key, value }) => value > 0 && <div key={key} className={PRIORITY_COLOR[key]} style={{ width: `${pct(value, stats.open)}%` }} title={`${PRIORITY_LABEL[key]}: ${value}`} />)}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                  {stats.byPriority.map(({ key, value }) => <span key={key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${PRIORITY_COLOR[key]}`} />{PRIORITY_LABEL[key]} <strong className="tabular-nums text-slate-900"><CountUp value={value} /></strong></span>)}
                </div>
              </div>
            </Section>

            <Section index={4} title="Bölgelere göre iş yükü" description="En çok iş emri olan bölgeler." icon={MapPinned}>
              {stats.regions.length === 0
                ? <p className="py-8 text-center text-sm text-slate-500">Henüz iş emri bulunmuyor.</p>
                : <div className="space-y-3">{stats.regions.map((region, i) => (
                  <BarRow key={region.name} order={i} label={region.name} value={region.total} total={stats.regions[0].total} barClass="bg-[#1d4ed8]" detail={{ value: region.open, label: "açık" }} />
                ))}</div>}
            </Section>

            <Section index={5} title="Haftalık iş akışı" description={`Son ${WEEKS} haftada açılan ve tamamlanan iş emirleri.`} icon={CalendarClock}>
              <div className="flex min-h-40 flex-1 items-end gap-2 sm:gap-3" role="img" aria-label="Haftalık açılan ve tamamlanan iş emri grafiği">
                {stats.weeks.map((week, i) => (
                  <div key={week.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <div className="flex h-full w-full items-end justify-center gap-1">
                      <div className="stat-grow-y w-1/2 max-w-4 rounded-t bg-blue-600" style={{ height: `${(week.opened / stats.weekMax) * 100}%` }} title={`Açılan: ${week.opened}`} />
                      <div className="stat-grow-y w-1/2 max-w-4 rounded-t bg-emerald-500" style={{ height: `${(week.closed / stats.weekMax) * 100}%` }} title={`Tamamlanan: ${week.closed}`} />
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
          </div>

          {projectStats && projectStats.counts.total > 0 && <ProjectStatsBlock stats={projectStats} />}

          <Reveal as="section" index={9} className="erp-section-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Kullanıcı durumları</h2>
                <p className="mt-1 text-xs text-slate-400">{fmt(stats.activeUsers)} aktif hesap{stats.pendingUsers > 0 ? ` · ${fmt(stats.pendingUsers)} hesap ilk girişte parola değiştirecek` : ""}</p>
              </div>
              <Link href="/manager/kullanicilar" className="text-xs font-semibold text-blue-700 hover:text-blue-800">Kullanıcıları yönet</Link>
            </div>
            {stats.team.length === 0
              ? <p className="px-5 py-12 text-center text-sm text-slate-500">Kullanıcı bulunamadı.</p>
              : <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead><tr className="whitespace-nowrap border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">Kullanıcı</th><th className="px-2 py-2.5">Hesap</th><th className="px-2 py-2.5 text-right">Aktif iş</th>
                    <th className="px-2 py-2.5 text-right">Tamamlanan</th><th className="px-3 py-2.5 text-right">Geciken</th><th className="px-3 py-2.5">Tamamlanma</th><th className="px-3 py-2.5">Son hareket</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.team.map(({ user, total, done, active, late, rate, lastUpdate }, i) => (
                      <tr key={user.id} className="stat-row-in whitespace-nowrap transition-colors hover:bg-slate-50" style={delay(250 + Math.min(i, 10) * 30)}>
                        <td className="px-4 py-2">
                          <p className="max-w-[14rem] truncate font-medium text-slate-900">{user.full_name || user.email}</p>
                          <p className="text-xs text-slate-400">{roleLabel(user.default_role)}</p>
                        </td>
                        <td className="px-2 py-2">
                          {!user.is_active
                            ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Pasif</span>
                            : user.force_password_change
                              ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Giriş bekliyor</span>
                              : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Aktif</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold text-slate-900"><CountUp value={active} /></td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700"><CountUp value={done} /></td>
                        <td className={`px-3 py-2 text-right tabular-nums ${late ? "font-semibold text-red-600" : "text-slate-400"}`}><CountUp value={late} /></td>
                        <td className="px-3 py-2">
                          {total === 0 ? <span className="text-xs text-slate-400">İş atanmadı</span> : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="stat-grow-x h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} /></div>
                              <span className="text-xs tabular-nums text-slate-600">%<CountUp value={rate} /></span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{lastUpdate ? new Date(lastUpdate).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </Reveal>
        </StatClock>
      )}
    </div>
  );
}
