"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronRight, FolderKanban, Plus, Search } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { cn, formatServerDate } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Progress } from "@/components/shadcn/progress";
import { Skeleton } from "@/components/shadcn/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { PROJECT_STATUS_LABEL, listProjects, type ProjectStatus, type ProjectSummary } from "@/services/installationProjects";

const STATUS_BADGE: Record<ProjectStatus, "info" | "success" | "muted"> = { active: "info", completed: "success", cancelled: "muted" };
const STATUSES: ProjectStatus[] = ["active", "completed", "cancelled"];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ProjectStatus>("active");
  const [query, setQuery] = useState("");

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setError("Projeler yüklenemedi.")).finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => ({
    active: projects.filter((p) => p.status === "active").length,
    completed: projects.filter((p) => p.status === "completed").length,
    cancelled: projects.filter((p) => p.status === "cancelled").length,
  }), [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return projects.filter((p) => p.status === tab && (!q || `${p.name} ${p.project_type_label} ${p.store_name ?? ""} ${p.store_no ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)));
  }, [projects, tab, query]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Projeler<InfoHint text="Yeni soğutma kurulumlarını keşiften kapanışa kadar aşama aşama takip edin." /></h1>
        <Button asChild><Link href="/manager/projeler/yeni"><Plus data-icon="inline-start" />Yeni Proje</Link></Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" size="sm" value={tab} onValueChange={(value) => value && setTab(value as ProjectStatus)} aria-label="Proje durumu">
          {STATUSES.map((value) => (
            <ToggleGroupItem key={value} value={value} className="px-3">{PROJECT_STATUS_LABEL[value]} ({counts[value]})</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <InputGroup className="ml-auto w-full sm:w-72">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Proje veya mağaza ara" aria-label="Proje ara" />
        </InputGroup>
      </div>

      {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}

      {loading ? (
        <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FolderKanban /></EmptyMedia>
            <EmptyTitle>{tab === "active" ? "Devam eden proje yok" : "Bu listede proje yok"}</EmptyTitle>
            {tab === "active" && <EmptyDescription>Yeni bir kurulum için &quot;Yeni Proje&quot; ile başlayın.</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((p) => {
            const pct = p.stages_total ? Math.round((p.stages_done / p.stages_total) * 100) : 0;
            return (
              <Link key={p.id} href={`/manager/projeler/${p.id}`} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="transition-colors group-hover:border-foreground/20">
                  <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-semibold">{p.name}</span>
                          <Badge variant="muted" className="shrink-0">{p.project_type_label}</Badge>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {p.store_name ?? "Yer bilgisi yok"}{p.store_no ? ` · ${p.store_no}` : ""}{p.manager_name ? ` · Sorumlu: ${p.manager_name}` : ""}{p.member_count ? ` · ${p.member_count} kişi atandı` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.overdue && <Badge variant="destructive">Hedef tarih geçti</Badge>}
                        <Badge variant={STATUS_BADGE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="h-2 flex-1" aria-label={`${p.stages_done}/${p.stages_total} aşama`} />
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{p.stages_done}/{p.stages_total} aşama</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {p.current_stage && <span className={cn(p.current_stage_overdue && "font-semibold text-destructive")}>Şu an: {p.current_stage}{p.current_stage_overdue ? " (gecikti)" : ""}</span>}
                      {p.closing_pending && <Badge variant="warning">Kapanış onayı bekliyor</Badge>}
                      {p.target_date && <span>Hedef: {formatServerDate(p.target_date)}</span>}
                      <span>{p.work_order_count} iş emri</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
