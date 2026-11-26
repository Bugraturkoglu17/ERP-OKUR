"use client";

import { cn, formatServerDateTime } from "@/lib/utils";
import { Suspense, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Search, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Skeleton } from "@/components/shadcn/skeleton";

type WorkOrder = {
  id: string;
  title: string;
  project_name?: string;
  project_no?: string;
  work_type_label: string;
  installation_project_name?: string | null;
  status: string;
  status_label: string;
  priority: string;
  due_date?: string;
  created_at?: string;
};

const STATUS_BADGE: Record<string, "info" | "muted" | "warning" | "success" | "destructive"> = {
  planned: "info", draft: "muted", sent: "info", started: "warning", completed: "success", failed: "destructive",
};

function statusLabel(status: string) {
  if (["planned", "draft", "sent", "approval_pending"].includes(status)) return "Planlanacak";
  if (["started", "material_waiting", "revisit"].includes(status)) return "Devam Ediyor";
  if (["completed", "approved"].includes(status)) return "Tamamlandı";
  if (["cancelled", "failed"].includes(status)) return "İptal Edildi";
  return status;
}

// Genel Bakış'taki durum kartlarının filtrelediği gruplar — /user/islerim?durum=... ile eşleşir.
const STATUS_GROUPS: Record<string, string[]> = {
  planned:   ["planned", "draft", "sent", "approval_pending"],
  active:    ["started", "material_waiting", "revisit"],
  completed: ["completed", "approved"],
  cancelled: ["cancelled", "failed"],
};
const STATUS_GROUP_LABEL: Record<string, string> = {
  planned: "Planlanacak", active: "Devam Eden", completed: "Tamamlanan", cancelled: "İptal Edilen",
};

const PRIORITY_DOT: Record<string, string> = {
  normal:   "bg-slate-400",
  urgent:   "bg-amber-400",
  critical: "bg-red-500",
};

function IslerimContent() {
  const [orders,  setOrders]  = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("durum");

  useEffect(() => {
    apiGet<WorkOrder[]>("/work-orders")
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const group = statusFilter ? STATUS_GROUPS[statusFilter] : null;
    return orders.filter((wo) =>
      wo.title.toLowerCase().includes(q.toLowerCase()) &&
      (!group || group.includes(wo.status))
    );
  }, [orders, q, statusFilter]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">İşlerim</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading ? "Yükleniyor..." : `${filtered.length} iş emri${statusFilter ? ` — ${STATUS_GROUP_LABEL[statusFilter] ?? statusFilter}` : " atanmış"}`}
        </p>
      </header>

      {statusFilter && (
        <Button variant="outline" size="sm" className="w-fit rounded-full border-primary/30 bg-primary/5 text-primary" onClick={() => router.push("/user/islerim")}>
          {STATUS_GROUP_LABEL[statusFilter] ?? statusFilter}<X data-icon="inline-end" />
        </Button>
      )}

      <InputGroup>
        <InputGroupAddon><Search /></InputGroupAddon>
        <InputGroupInput type="text" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="İş emri ara" />
      </InputGroup>

      {loading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
            <EmptyTitle className="text-sm font-normal text-muted-foreground">
              {q ? "Aramayla eşleşen iş emri bulunamadı." : statusFilter ? `${STATUS_GROUP_LABEL[statusFilter] ?? statusFilter} durumunda iş emri yok.` : "Henüz atanmış iş emri yok."}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((wo) => (
            <Link key={wo.id} href={`/user/islerim/${wo.id}`} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="flex items-center gap-4 px-4 py-3.5 transition-colors group-hover:border-foreground/20">
                <span className={cn("size-2.5 shrink-0 rounded-full", PRIORITY_DOT[wo.priority] ?? "bg-slate-400")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{wo.project_name ?? "Mağaza bilgisi yok"} - {wo.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {wo.project_no ? `Mağaza kodu: ${wo.project_no} | ` : ""}{wo.work_type_label}{wo.installation_project_name ? ` · ${wo.installation_project_name}` : ""}
                  </p>
                  {wo.created_at && <p className="mt-0.5 text-[11px] text-muted-foreground">Verildi: {formatServerDateTime(wo.created_at)}</p>}
                </div>
                <Badge variant={STATUS_BADGE[wo.status] ?? "muted"} className="shrink-0">{statusLabel(wo.status)}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UserIslerimPage() {
  return (
    <Suspense fallback={<div className="space-y-6" />}>
      <IslerimContent />
    </Suspense>
  );
}
