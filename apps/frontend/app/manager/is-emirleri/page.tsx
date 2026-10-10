"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, CalendarDays, CircleAlert, Clock3,
  Filter, Plus, Search, Store, UserRound,
} from "lucide-react";
import {
  CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL,
  getManagerWorkOrders, getTeamUsers,
  type TeamUser, type WorkOrder, type WorkOrderCategory,
  type WorkOrderPriority, type WorkOrderStatus,
} from "@/services/managerWorkOrders";
import { Skeleton } from "@/components/ui/skeleton";

const TABS: { key: Exclude<WorkOrderStatus, "cancelled">; label: string }[] = [
  { key: "planned", label: "Planlanacak" },
  { key: "in_progress", label: "Devam Edenler" },
  { key: "completed", label: "Tamamlananlar" },
];

const priorityStyle: Record<WorkOrderPriority, string> = {
  normal: "bg-slate-100 text-slate-600",
  important: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
};

const statusStyle: Record<WorkOrderStatus, string> = {
  planned: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function dateLabel(value: string | null) {
  if (!value) return "Termin yok";
  return new Date(value).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function isOverdueOrder(order: WorkOrder) {
  return Boolean(order.due_date && !["completed", "cancelled"].includes(order.status) && new Date(order.due_date).getTime() < Date.now());
}

function getWarnings(order: WorkOrder) {
  if (order.status === "completed" || order.status === "cancelled") return [];
  const warnings: { label: string; tone: string }[] = [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (order.due_date?.slice(0, 10) === today) warnings.push({ label: "Bugün Terminli", tone: "text-amber-700" });
  if (order.due_date && new Date(order.due_date) < now) warnings.push({ label: "Gecikti", tone: "text-red-700" });
  const staleDays = (now.getTime() - new Date(order.updated_at).getTime()) / 86_400_000;
  if (staleDays > 3) warnings.push({ label: "Uzun Süredir Güncellenmedi", tone: "text-slate-600" });
  if (order.has_critical_report) warnings.push({ label: "Kritik Rapor", tone: "text-red-700" });
  return warnings;
}

export default function ManagerWorkOrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [activeTab, setActiveTab] = useState<Exclude<WorkOrderStatus, "cancelled">>("planned");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WorkOrderCategory | "">("");
  const [priority, setPriority] = useState<WorkOrderPriority | "">("");
  const [assignee, setAssignee] = useState("");
  const [statusFilter, setStatusFilter] = useState<"current" | "cancelled">("current");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getManagerWorkOrders(), getTeamUsers()])
      .then(([workOrders, team]) => { setOrders(workOrders); setUsers(team); })
      .catch(() => setError("İş emirleri yüklenemedi. Lütfen tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (requestedTab === "planned" || requestedTab === "in_progress" || requestedTab === "completed") {
      setActiveTab(requestedTab);
      setStatusFilter("current");
      setOverdueOnly(false);
    } else if (params.get("filter") === "overdue") {
      setStatusFilter("current");
      setOverdueOnly(true);
    }
  }, []);

  const activeFilterCount = (category ? 1 : 0) + (priority ? 1 : 0) + (assignee ? 1 : 0) + (statusFilter === "cancelled" ? 1 : 0);

  const counts = useMemo(() => ({
    planned: orders.filter((item) => item.status === "planned").length,
    in_progress: orders.filter((item) => item.status === "in_progress").length,
    completed: orders.filter((item) => item.status === "completed").length,
  }), [orders]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("tr-TR");
    return orders.filter((item) => {
      if (overdueOnly) {
        if (!isOverdueOrder(item)) return false;
      } else if (statusFilter === "cancelled" ? item.status !== "cancelled" : item.status !== activeTab) return false;
      if (search && !`${item.title} ${item.store_name} ${item.store_code} ${item.assigned_to_name}`.toLocaleLowerCase("tr-TR").includes(search)) return false;
      if (category && item.category !== category) return false;
      if (priority && item.priority !== priority) return false;
      if (assignee && item.assigned_to !== assignee) return false;
      return true;
    });
  }, [orders, statusFilter, overdueOnly, activeTab, query, category, priority, assignee]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">İş Emirleri</h1>
          <p className="mt-1 text-sm text-slate-500">Arıza, tadilat ve yeni yapım görevlerini oluşturun, atayın ve takip edin.</p>
        </div>
        <Link href="/manager/is-emirleri/yeni" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98]">
          <Plus className="h-4 w-4" /> İş Emri Oluştur
        </Link>
      </header>

      <nav className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="İş emri durumları">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setStatusFilter("current"); setOverdueOnly(false); }} className={`flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap border-r border-slate-100 px-1.5 py-3 text-[11px] font-semibold tracking-[-0.01em] transition last:border-r-0 sm:px-3 sm:text-sm ${activeTab === tab.key && statusFilter === "current" && !overdueOnly ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
            <span>{tab.label}</span>
            <span className="shrink-0 text-[10px] tabular-nums opacity-60 sm:text-xs">{counts[tab.key]}</span>
          </button>
        ))}
      </nav>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Başlık, mağaza kodu veya çalışan ara" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
          </label>
          {/* Mobilde 4 tam genişlik <select> ekranın yarısını kaplıyordu —
              artık tek bir "Filtreler" butonu altında toplandı; masaüstünde
              (lg+) yine hep açık. */}
          <button type="button" onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors lg:hidden ${
              activeFilterCount > 0 || filtersOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}>
            <Filter className="h-4 w-4" /> Filtreler
            {activeFilterCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white tabular-nums">{activeFilterCount}</span>}
          </button>
        </div>

        <div className={`${filtersOpen ? "grid" : "hidden"} mt-2 gap-2 sm:grid-cols-2 lg:mt-2 lg:grid lg:grid-cols-4`}>
          <select value={category} onChange={(event) => setCategory(event.target.value as WorkOrderCategory | "")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-blue-500">
            <option value="">Tüm İş Tipleri</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value as WorkOrderPriority | "")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-blue-500">
            <option value="">Tüm Öncelikler</option>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={assignee} onChange={(event) => setAssignee(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-blue-500">
            <option value="">Tüm Çalışanlar</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "current" | "cancelled"); setOverdueOnly(false); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none focus:border-blue-500">
            <option value="current">Sekme Durumu</option>
            <option value="cancelled">İptal Edilenler</option>
          </select>
        </div>
      </section>

      {overdueOnly && <div className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"><span className="font-semibold">Yalnızca termini geçmiş işler gösteriliyor.</span><button type="button" onClick={() => { setOverdueOnly(false); setActiveTab("in_progress"); }} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-red-100">Filtreyi kaldır</button></div>}

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      {loading ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <Filter className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 text-sm font-semibold text-slate-800">İş emri bulunamadı</h2>
          <p className="mt-1 text-sm text-slate-500">Arama veya filtre kriterlerinizi değiştirerek tekrar deneyin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => {
            const warnings = getWarnings(order);
            const progress = order.status === "completed" ? 100 : order.status === "in_progress" ? 50 : 0;
            return (
              <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-slate-950">{order.title}</h2>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${priorityStyle[order.priority]}`}>{PRIORITY_LABEL[order.priority]}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${statusStyle[order.status]}`}>{STATUS_LABEL[order.status]}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5" />{order.store_name} <span className="font-mono text-slate-400">{order.store_code}</span></span>
                      <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{order.assigned_to_name}</span>
                      <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{dateLabel(order.due_date)}</span>
                      <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{new Date(order.updated_at).toLocaleDateString("tr-TR")}</span>
                    </div>
                    {warnings.length > 0 && <div className="mt-2 flex flex-wrap gap-3">{warnings.map((warning) => <span key={warning.label} className={`flex items-center gap-1 text-[11px] font-medium ${warning.tone}`}><CircleAlert className="h-3 w-3" />{warning.label}</span>)}</div>}
                  </div>
                  <div className="flex items-center gap-4 xl:w-72">
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-[11px] text-slate-500"><span>{CATEGORY_LABEL[order.category]}</span><span>{progress}%</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div>
                    </div>
                    <Link href={`/manager/is-emirleri/${order.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Detayı Gör <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
