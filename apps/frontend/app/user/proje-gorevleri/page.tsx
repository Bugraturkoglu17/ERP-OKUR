"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronRight, FolderKanban } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { cn, formatServerDate } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Card } from "@/components/shadcn/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Skeleton } from "@/components/shadcn/skeleton";
import { getMyStages, listProjects, type MyStage, type ProjectSummary } from "@/services/installationProjects";

/** Liste satırı: kart görünümlü bağlantı. */
function RowLink({ href, muted = false, children }: { href: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className={cn("flex items-center gap-3 px-4 py-3.5 transition-colors group-hover:border-foreground/20", muted && "opacity-80")}>
        {children}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  );
}

export default function ProjectTasksPage() {
  const [items, setItems] = useState<MyStage[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getMyStages().then(setItems), listProjects("active").then(setProjects)])
      .catch(() => setError("Proje görevleri yüklenemedi.")).finally(() => setLoading(false));
  }, []);

  const active = items.filter((i) => i.status === "in_progress");
  const waiting = items.filter((i) => i.status === "planned");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Proje Görevlerim<InfoHint text="Atandığınız projeler ve sorumlusu olduğunuz aşamalar. Aşamayı buradan yürütüp tamamlarsınız." /></h1>

      {!loading && projects.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atandığım projeler ({projects.length})</h2>
          <ul className="flex flex-col gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <RowLink href={`/user/projeler/${p.id}`}>
                  <FolderKanban className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold">{p.name}</span><Badge variant="muted" className="shrink-0">{p.project_type_label}</Badge></p>
                    <p className="truncate text-xs text-muted-foreground">{p.store_name ?? "Yer bilgisi yok"}{p.current_stage ? ` · Şu an: ${p.current_stage}` : ""} · {p.stages_done}/{p.stages_total} aşama</p>
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}

      {loading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : items.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FolderKanban /></EmptyMedia>
            <EmptyTitle>{projects.length > 0 ? "Sorumlusu olduğunuz aşama yok" : "Size atanmış proje veya görev yok"}</EmptyTitle>
            <EmptyDescription>Yönetici sizi bir projeye atadığında ya da bir aşamanın sorumlusu yaptığında burada görünür.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <TaskGroup title="Sıra sizde" items={active} empty="Şu an sırası gelmiş görev yok." />
          {waiting.length > 0 && <TaskGroup title="Sırası bekleyen" items={waiting} empty="" muted />}
        </>
      )}
    </div>
  );
}

function TaskGroup({ title, items, empty, muted = false }: { title: string; items: MyStage[]; empty: string; muted?: boolean }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title} ({items.length})</h2>
      {items.length === 0 ? <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.stage_id}>
              <RowLink href={`/user/proje-gorevleri/${item.stage_id}`} muted={muted}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>{item.stage_order}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.stage_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.project_name}{item.store_name ? ` · ${item.store_name}` : ""}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    {item.planned_end && <span className={item.overdue ? "font-semibold text-destructive" : "text-muted-foreground"}>Planlanan bitiş: {formatServerDate(item.planned_end)}{item.overdue ? " (gecikti)" : ""}</span>}
                    {item.approval_pending && <Badge variant="warning">Yönetici onayı bekliyor</Badge>}
                  </div>
                </div>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
