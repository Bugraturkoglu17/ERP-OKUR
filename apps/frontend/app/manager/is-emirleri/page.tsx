"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, CalendarDays, CalendarPlus, ChevronRight, CircleAlert, Clock3,
  Filter, Plus, Search, Store, UserRound,
} from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { cn, formatServerDateTime, isPastDue, localToday, parseServerDate } from "@/lib/utils";
import {
  CATEGORY_LABEL, CREATABLE_CATEGORIES, PRIORITY_LABEL, STATUS_LABEL,
  getTeamUsers, getWorkOrderPage, getWorkOrderSummary,
  type TeamUser, type WorkOrder, type WorkOrderCategory, type WorkOrderCounts,
  type WorkOrderPriority, type WorkOrderStatus,
} from "@/services/managerWorkOrders";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Progress } from "@/components/shadcn/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { useRefreshSignal } from "@/lib/refresh-signal";

type Tab = Exclude<WorkOrderStatus, "cancelled">;
const TABS: { key: Tab; label: string }[] = [
  { key: "planned", label: "Planlanacak" },
  { key: "in_progress", label: "Devam Edenler" },
  { key: "completed", label: "Tamamlananlar" },
];
const ALL = "all";

type BadgeVariant = "muted" | "warning" | "destructive" | "info" | "success";
const PRIORITY_BADGE: Record<WorkOrderPriority, BadgeVariant> = { normal: "muted", important: "warning", critical: "destructive" };
const STATUS_BADGE: Record<WorkOrderStatus, BadgeVariant> = { planned: "info", in_progress: "warning", completed: "success", cancelled: "muted" };

function dateLabel(value: string | null) {
  if (!value) return "Termin yok";
  return `Termin: ${new Date(value).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}`;
}

/** Saat ikonunun yanında tarih değil, son güncellemeden bu yana geçen süre gösterilir. */
function updatedLabel(value: string) {
  const days = Math.floor((Date.now() - parseServerDate(value).getTime()) / 86_400_000);
  if (days <= 0) return "Bugün güncellendi";
  if (days === 1) return "Dün güncellendi";
  return `${days} gün önce güncellendi`;
}

function isOverdueOrder(order: WorkOrder) {
  return !["completed", "cancelled"].includes(order.status) && isPastDue(order.due_date);
}

function getWarnings(order: WorkOrder) {
  if (order.status === "completed" || order.status === "cancelled") return [];
  const warnings: { label: string; tone: string }[] = [];
  const now = new Date();
  if (order.due_date?.slice(0, 10) === localToday(now)) warnings.push({ label: "Bugün Terminli", tone: "text-amber-700" });
  if (isPastDue(order.due_date, now)) warnings.push({ label: "Gecikti", tone: "text-destructive" });
  const staleDays = (now.getTime() - new Date(order.updated_at).getTime()) / 86_400_000;
  if (staleDays > 3) warnings.push({ label: "Uzun Süredir Güncellenmedi", tone: "text-muted-foreground" });
  if (order.has_critical_report) warnings.push({ label: "Kritik Rapor", tone: "text-destructive" });
  return warnings;
}

/** Filtre seçimi: shadcn Select boş değer almaz; "Tümü" seçeneği ALL ile tutulur. */
function FilterSelect({ value, onChange, placeholder, options, label }: {
  value: string; onChange: (value: string) => void; placeholder: string; label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
      <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

// Liste 50'şer kayıt gelir; süzme ve arama sunucuda yapılır (tüm iş emirleri çekilmez).
const PAGE_SIZE = 50;

export default function ManagerWorkOrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [summary, setSummary] = useState<WorkOrderCounts | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("planned");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WorkOrderCategory | "">("");
  const [priority, setPriority] = useState<WorkOrderPriority | "">("");
  const [assignee, setAssignee] = useState("");
  const [statusFilter, setStatusFilter] = useState<"current" | "cancelled">("current");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshSignal = useRefreshSignal();
  useEffect(() => {
    getTeamUsers().then(setUsers).catch(() => setUsers([]));
  }, []);
  useEffect(() => {
    getWorkOrderSummary().then((data) => setSummary(data.counts)).catch(() => setSummary(null));
  }, [refreshSignal]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const pageQuery = useMemo(() => ({
    group: overdueOnly ? undefined : statusFilter === "cancelled" ? "cancelled" as const : activeTab,
    overdue: overdueOnly, q: debouncedQuery, category, priority, assignee, limit: PAGE_SIZE,
  }), [overdueOnly, statusFilter, activeTab, debouncedQuery, category, priority, assignee]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getWorkOrderPage(pageQuery)
      .then((rows) => { if (active) { setOrders(rows); setHasMore(rows.length === PAGE_SIZE); } })
      .catch(() => { if (active) setError("İş emirleri yüklenemedi. Lütfen tekrar deneyin."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pageQuery, refreshSignal]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const rows = await getWorkOrderPage({ ...pageQuery, offset: orders.length });
      setOrders((current) => [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch { setError("İş emirleri yüklenemedi. Lütfen tekrar deneyin."); }
    finally { setLoadingMore(false); }
  }

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

  // Sekme sayıları sunucudaki özetten gelir (süzgeçten bağımsız toplam).
  const counts = { planned: summary?.planned ?? 0, in_progress: summary?.in_progress ?? 0, completed: summary?.completed ?? 0 };
  const filtered = orders;

  // Sekme yalnız "sekme durumu" süzgecinde ve gecikenler süzgeci kapalıyken seçili görünür.
  const tabValue = statusFilter === "current" && !overdueOnly ? activeTab : "";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">İş Emirleri<InfoHint text="Arıza, tadilat ve yeni yapım görevlerini oluşturun, atayın ve takip edin." /></h1>
        <Button asChild><Link href="/manager/is-emirleri/yeni"><Plus data-icon="inline-start" />İş Emri Oluştur</Link></Button>
      </header>

      <Tabs value={tabValue} onValueChange={(value) => { setActiveTab(value as Tab); setStatusFilter("current"); setOverdueOnly(false); }}>
        <TabsList className="grid h-auto w-full grid-cols-3" aria-label="İş emri durumları">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5 py-2 text-xs sm:text-sm">
              {tab.label}<span className="tabular-nums opacity-60">{counts[tab.key]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <InputGroup className="flex-1">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Başlık, mağaza kodu veya çalışan ara" aria-label="İş emri ara" />
            </InputGroup>
            {/* Mobilde süzgeçler tek "Filtreler" düğmesi altında; masaüstünde (lg+) hep açık. */}
            <Button variant="outline" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}
              className={cn("lg:hidden", (activeFilterCount > 0 || filtersOpen) && "border-primary/40 bg-primary/5 text-primary")}>
              <Filter data-icon="inline-start" />Filtreler
              {activeFilterCount > 0 && <Badge className="ml-1 px-1.5 tabular-nums">{activeFilterCount}</Badge>}
            </Button>
          </div>
          <div className={cn(filtersOpen ? "grid" : "hidden", "gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-4")}>
            <FilterSelect label="İş tipi" value={category} onChange={(v) => setCategory(v as WorkOrderCategory | "")} placeholder="Tüm İş Tipleri"
              options={CREATABLE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] }))} />
            <FilterSelect label="Öncelik" value={priority} onChange={(v) => setPriority(v as WorkOrderPriority | "")} placeholder="Tüm Öncelikler"
              options={Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }))} />
            <FilterSelect label="Çalışan" value={assignee} onChange={setAssignee} placeholder="Tüm Çalışanlar"
              options={users.map((user) => ({ value: user.id, label: user.full_name }))} />
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as "current" | "cancelled"); setOverdueOnly(false); }}>
              <SelectTrigger aria-label="Durum"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="current">Sekme Durumu</SelectItem>
                  <SelectItem value="cancelled">İptal Edilenler</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {overdueOnly && (
        <Alert variant="destructive" className="flex items-center justify-between gap-3">
          <AlertDescription className="font-semibold">Yalnızca termini geçmiş işler gösteriliyor.</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => { setOverdueOnly(false); setActiveTab("in_progress"); }}>Filtreyi kaldır</Button>
        </Alert>
      )}

      {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}

      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Filter /></EmptyMedia>
            <EmptyTitle>İş emri bulunamadı</EmptyTitle>
            <EmptyDescription>Arama veya filtre kriterlerinizi değiştirerek tekrar deneyin.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((order) => {
            const warnings = getWarnings(order);
            const progress = order.status === "completed" ? 100 : order.status === "in_progress" ? 50 : 0;
            return (
              <Card key={order.id} className="transition-colors hover:border-foreground/20">
                <CardContent className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold">{order.title}</h2>
                      <Badge variant={PRIORITY_BADGE[order.priority]}>{PRIORITY_LABEL[order.priority]}</Badge>
                      <Badge variant={STATUS_BADGE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Store className="size-3.5" />{order.store_name} <span className="font-mono opacity-70">{order.store_code}</span></span>
                      <span className="flex items-center gap-1.5"><UserRound className="size-3.5" />{order.assigned_to_name}</span>
                      <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{dateLabel(order.due_date)}</span>
                      <span className="flex items-center gap-1.5" title="İş emrinin verildiği tarih ve saat"><CalendarPlus className="size-3.5" />Verildi: {formatServerDateTime(order.created_at)}</span>
                      <span className="flex items-center gap-1.5" title={`Son güncelleme: ${formatServerDateTime(order.updated_at)}`}><Clock3 className="size-3.5" />{updatedLabel(order.updated_at)}</span>
                    </div>
                    {warnings.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-3">
                        {warnings.map((warning) => <span key={warning.label} className={cn("flex items-center gap-1 text-[11px] font-medium", warning.tone)}><CircleAlert className="size-3" />{warning.label}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 xl:w-72">
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{CATEGORY_LABEL[order.category]}{order.installation_project_name ? ` · ${order.installation_project_name}` : ""}</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="mt-1 h-1.5" aria-label={`İlerleme %${progress}`} />
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/manager/is-emirleri/${order.id}`}>Detayı Gör<ChevronRight data-icon="inline-end" /></Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {hasMore && (
            <Button variant="outline" className="self-center" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? "Yükleniyor…" : "Daha fazla göster"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
