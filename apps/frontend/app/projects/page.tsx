"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, ChevronRight, Edit2, FileUp, FolderOpen, MapPin,
  MoreVertical, Plus, Search, Store, Trash2,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getStores, updateStore,
  getStoresPage, getAllRegions, getCancelledStoreCount,
} from "@/services/stores";
import { StoreFormModal, defaultStoreForm, storeFormFrom } from "@/components/store/store-form-modal";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Checkbox } from "@/components/shadcn/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";

// ── Types ──────────────────────────────────────────────────────────────────────

type Project = {
  id: string; name: string; project_no?: string; description?: string;
  status: string; scope_codes?: string[];
  start_date?: string; due_date?: string;
  created_at?: string; updated_at?: string;
  customer_id?: string; region_id?: string; branch_id?: string;
};

type Customer = { id: string; name: string; code?: string };
type Region   = { id: string; name: string; city: string; customer_id: string };
type Branch   = { id: string; name: string; city: string; region_id: string };

type DescExtra = {
  store_type?: string; format?: string;
  bolge?: string; sehir?: string;
  tel1?: string; tel2?: string; tel3?: string; tel4?: string;
  adres?: string; acilis_tarihi?: string;
};

function parseDesc(desc?: string): DescExtra {
  if (!desc) return {};
  try { return JSON.parse(desc); } catch { return {}; }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STORE_TYPE_OPTS = [
  { value: "existing_store", label: "Mevcut Mağaza" },
  { value: "new_build",      label: "Yeni Yapım"    },
  { value: "closed_store",   label: "Kapanan Mağaza"},
  { value: "facility",       label: "Tesis"         },
];

const STORE_TYPE_BADGE: Record<string, "info" | "success" | "muted" | "secondary"> = {
  existing_store: "info",
  new_build:      "success",
  closed_store:   "muted",
  facility:       "secondary",
};
const ALL = "all";


const STATUS_OPTS = [
  { value: "inquiry",      label: "Keşif"        },
  { value: "approved",     label: "Onaylandı"    },
  { value: "in_progress",  label: "Devam Ediyor" },
  { value: "invoice_pend", label: "Beklemede"    },
  { value: "completed",    label: "Tamamlandı"   },
  { value: "cancelled",    label: "İptal Edildi" },
];


function isCancelled(s: string) { return s === "cancelled" || s === "CANCELLED"; }

// ── Mağaza Kartı ───────────────────────────────────────────────────────────────

function MagazaKart({ p, regionName, detailHrefBase, onEdit, onDeactivate, canManage }: {
  p: Project; regionName?: string; detailHrefBase: string;
  onEdit: (p: Project) => void; onDeactivate: (p: Project) => void;
  canManage: boolean;
}) {
  const extra    = parseDesc(p.description);
  const stType   = STORE_TYPE_OPTS.find(o => o.value === extra.store_type);
  const isCancl  = isCancelled(p.status);

  return (
    <Card className={cn("flex flex-col transition-all duration-200", isCancl ? "opacity-50" : "hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md")}>
      <CardHeader className="flex-row items-start gap-2.5 space-y-0 p-4 pb-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Store className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="line-clamp-2 text-sm leading-tight">{p.name}</CardTitle>
          <CardDescription className="mt-0.5 font-mono text-[11px]">{p.project_no ?? "—"}</CardDescription>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-1 -mt-1 size-7 text-muted-foreground" aria-label={`${p.name} işlemleri`}><MoreVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => onEdit(p)}><Edit2 />Düzenle</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDeactivate(p)} className={isCancl ? "text-emerald-700" : "text-destructive focus:text-destructive"}>
                  <Trash2 />{isCancl ? "Aktife Al" : "Pasifleştir"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-2.5 px-4 pb-3 pt-0">
        {regionName && (
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate text-[11px] text-muted-foreground">{regionName}</span>
          </div>
        )}
        {/* Mağaza formatı operasyon türünden bağımsızdır. */}
        <div className="flex min-h-[22px] flex-wrap gap-1.5">
          {stType && <Badge variant={STORE_TYPE_BADGE[stType.value] ?? "muted"}>{stType.label}</Badge>}
        </div>
      </CardContent>

      <CardFooter className="mt-auto justify-between border-t px-4 py-3">
        <p className="text-[10px] text-muted-foreground">{p.updated_at ? new Date(p.updated_at).toLocaleDateString("tr-TR") : "—"}</p>
        <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs">
          <Link href={`${detailHrefBase}/${p.id}`}><FolderOpen data-icon="inline-start" />Klasörü Aç</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Pasifleştir / aktife al onayı ──────────────────────────────────────────────

function DeactivateDialog({ project, onClose, onDone }: { project: Project; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isCancl = isCancelled(project.status);

  const handleConfirm = async () => {
    setBusy(true); setError("");
    try {
      await updateStore(project.id, { status: isCancl ? "inquiry" : "cancelled" });
      onDone(); onClose();
    } catch { setError("İşlem başarısız."); }
    finally { setBusy(false); }
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isCancl ? "Mağazayı Aktife Al" : "Mağazayı Pasifleştir"}</AlertDialogTitle>
          <AlertDialogDescription>
            {isCancl ? `"${project.name}" tekrar aktif listeye alınacak.` : `"${project.name}" pasifleştirilecek. Dosyalar ve geçmiş korunacak.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Vazgeç</AlertDialogCancel>
          {/* Onay düğmesi pencereyi hemen kapatmasın: istek bitince onClose çağrılır. */}
          <Button variant={isCancl ? "default" : "destructive"} disabled={busy} onClick={() => void handleConfirm()}>
            {busy && <Spinner data-icon="inline-start" />}{isCancl ? "Aktife Al" : "Pasifleştir"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Ana Sayfa ──────────────────────────────────────────────────────────────────

export default function MagazalarPage() {
  const pathname = usePathname();
  const isManager = pathname?.startsWith("/manager");
  const isAdmin = pathname?.startsWith("/admin");
  const isUser = pathname?.startsWith("/user");
  const canManage = !isUser;
  const basePath = isManager ? "/manager/magaza-karti" : isAdmin ? "/admin/stores" : isUser ? "/user/magaza-karti" : "/projects";
  const importHref = `${basePath}/import`;

  const [projects,      setProjects]      = useState<Project[]>([]);
  const [totalCount,    setTotalCount]    = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [customers,     setCustomers]     = useState<Customer[]>([]);
  const [regionMap,     setRegionMap]     = useState<Record<string, string>>({});
  const [allRegions,    setAllRegions]    = useState<Region[]>([]);
  const [loading,       setLoading]       = useState(true);

  const [search,           setSearch]           = useState("");
  const [searchDebounced,  setSearchDebounced]  = useState("");
  const [filterStoreType,  setFilterStoreType]  = useState("all");
  const [filterRegion,     setFilterRegion]     = useState("all");
  const [showCancelled,    setShowCancelled]    = useState(false);
  const [page,             setPage]             = useState(1);
  const [pageSize,         setPageSize]         = useState(25);

  const [createOpen,     setCreateOpen]     = useState(false);
  const [editProject,    setEditProject]    = useState<Project | null>(null);
  const [deactivateProj, setDeactivateProj] = useState<Project | null>(null);

  // Referans veri (zincirler + bölgeler) sayfa açılışında BİR KEZ, arama/
  // sayfalama state'inden bağımsız yüklenir — her tuş vuruşunda tekrar
  // çekilmez. Mağaza listesinden ayrı, paralel çalışır.
  useEffect(() => {
    (async () => {
      const [custs, regions] = await Promise.all([
        apiGet<Customer[]>("/projects/customers").catch(() => [] as Customer[]),
        getAllRegions().catch(() => [] as Region[]),
      ]);
      setCustomers(Array.isArray(custs) ? custs : []);
      setAllRegions(regions);
      const rMap: Record<string, string> = {};
      for (const r of regions) rMap[r.id] = r.name;
      setRegionMap(rMap);
    })();
    getCancelledStoreCount().then(setCancelledCount).catch(() => {});
  }, []);

  // Mağaza listesi — sunucu taraflı sayfalama + arama + bölge filtresi.
  // 4000+ mağazayı tek seferde çekmek yerine yalnızca görüntülenen sayfa
  // istenir (bkz. services/stores.ts: getStoresPage).
  const loadStores = async () => {
    setLoading(true);
    try {
      if (filterStoreType !== "all") {
        // Mağaza türü (JSON description alanında saklanıyor, indekslenmiş bir
        // kolon değil) backend'de filtrelenemiyor — bu nadir kullanılan filtre
        // aktifken tam listeyi çekip client-side filtrelemeye devam ediyoruz.
        // Migration'sız, sonuçların yanlış/eksik görünmesini engelleyen güvenli tercih.
        const all = await getStores({ q: searchDebounced || undefined }).catch(() => [] as Project[]);
        const afterRegion    = filterRegion === "all" ? all : all.filter(p => p.region_id === filterRegion);
        const afterCancelled = showCancelled ? afterRegion : afterRegion.filter(p => !isCancelled(p.status));
        const afterType      = afterCancelled.filter(p => parseDesc(p.description).store_type === filterStoreType);
        setTotalCount(afterType.length);
        const start = (page - 1) * pageSize;
        setProjects(afterType.slice(start, start + pageSize));
      } else {
        const { items, total } = await getStoresPage({
          page, pageSize, q: searchDebounced,
          regionId: filterRegion, includeCancelled: showCancelled,
        });
        setProjects(items);
        setTotalCount(total);
      }
    } catch {
      setProjects([]); setTotalCount(0);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadStores(); }, [page, pageSize, searchDebounced, filterRegion, filterStoreType, showCancelled]);

  // Arama debounce'lu — her tuş vuruşunda istek atmaz. Sayfa sıfırlaması da
  // aynı state güncellemesinde yapılır: ayrı bir "filtre değişti → setPage(1)"
  // effect'i kullanılsa, sayfa 1'de değilken filtre değiştirmek iki ayrı
  // render (biri eski sayfa, biri sayfa 1) ve dolayısıyla İKİ ayrı sunucu
  // isteği üretirdi. Sıfırlamayı tetikleyen noktaya taşıyarak tek istek kalır.
  useEffect(() => {
    const t = setTimeout(() => { setSearchDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const totalPages  = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart    = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd      = Math.min(currentPage * pageSize, totalCount);
  const pageItems    = projects;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{isAdmin ? "Mağaza Yönetimi" : "Mağaza Kartı"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Mağaza listesini görüntüleyin, Excel'den içe aktarın ve mağaza bilgilerini yönetin."
              : loading ? "Yükleniyor..." : `${totalCount.toLocaleString("tr-TR")} mağaza · ${allRegions.length} bölge`}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link href={importHref}><FileUp data-icon="inline-start" />Excel&apos;den İçe Aktar</Link></Button>
            <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Yeni Mağaza</Button>
          </div>
        )}
      </header>

      {/* Arama ve süzgeçler: bölge ve mağaza türü açılır seçim, pasifler onay kutusu. */}
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="w-full sm:w-80">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Mağaza adı veya kodu ara..." aria-label="Mağaza ara" />
        </InputGroup>
        <Select value={filterRegion} onValueChange={(value) => { setFilterRegion(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Bölge"><span className="flex min-w-0 items-center gap-2"><MapPin className="size-4 shrink-0 text-muted-foreground" /><SelectValue /></span></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectGroup>
              <SelectItem value={ALL}>Tüm Bölgeler</SelectItem>
              {allRegions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={filterStoreType} onValueChange={(value) => { setFilterStoreType(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Mağaza türü"><span className="flex min-w-0 items-center gap-2"><Store className="size-4 shrink-0 text-muted-foreground" /><SelectValue /></span></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>Tüm Mağazalar</SelectItem>
              {STORE_TYPE_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        {cancelledCount > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox id="pasif-magazalar" checked={showCancelled} onCheckedChange={(checked) => { setShowCancelled(checked === true); setPage(1); }} />
            <Label htmlFor="pasif-magazalar" className="font-normal">Pasifleri göster ({cancelledCount})</Label>
          </div>
        )}
      </div>

      {/* İçerik */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : totalCount === 0 && !searchDebounced && filterStoreType === ALL && filterRegion === ALL && !showCancelled ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Store /></EmptyMedia>
            <EmptyTitle>Mağaza verisi bulunmuyor</EmptyTitle>
            <EmptyDescription>Mağaza listesinin sisteme aktarılması gerekiyor.</EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent className="flex-row justify-center">
              <Button variant="outline" asChild><Link href={importHref}><FileUp data-icon="inline-start" />Excel&apos;den İçe Aktar</Link></Button>
              <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Yeni Mağaza Ekle</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : pageItems.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Search /></EmptyMedia>
            <EmptyTitle>Mağaza bulunamadı</EmptyTitle>
            <EmptyDescription>Arama veya filtre kriterlerinizi değiştirerek tekrar deneyin.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pageItems.map(p => (
              <MagazaKart key={p.id} p={p} regionName={regionMap[p.region_id ?? ""]} detailHrefBase={basePath}
                onEdit={setEditProject} onDeactivate={setDeactivateProj} canManage={canManage} />
            ))}
          </div>

          {/* Sayfalama */}
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Toplam <span className="font-medium tabular-nums text-foreground">{totalCount.toLocaleString("tr-TR")}</span> mağaza içinde{" "}
              <span className="font-medium tabular-nums text-foreground">{pageStart.toLocaleString("tr-TR")}–{pageEnd.toLocaleString("tr-TR")}</span> arası gösteriliyor.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Sayfa başına
                <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
                  <SelectTrigger className="h-8 w-[72px]" aria-label="Sayfa başına mağaza"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                  <ChevronLeft data-icon="inline-start" />Önceki
                </Button>
                <span className="px-2 text-xs tabular-nums text-muted-foreground">Sayfa {currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                  Sonraki<ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {canManage && createOpen && (
        <StoreFormModal mode="create" initial={defaultStoreForm()} customers={customers}
          onClose={() => setCreateOpen(false)} onDone={() => loadStores()} />
      )}
      {canManage && editProject && (
        <StoreFormModal mode="edit" initial={storeFormFrom(editProject)} projectId={editProject.id}
          existingDescription={editProject.description} existingScopeCodes={editProject.scope_codes}
          customers={customers} onClose={() => setEditProject(null)} onDone={() => loadStores()} />
      )}
      {canManage && deactivateProj && (
        <DeactivateDialog project={deactivateProj} onClose={() => setDeactivateProj(null)} onDone={loadStores} />
      )}
    </div>
  );
}
