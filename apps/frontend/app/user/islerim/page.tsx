"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { apiGet } from "@/lib/api";

type WorkOrder = {
  id: string;
  title: string;
  project_name?: string;
  project_no?: string;
  work_type_label: string;
  status: string;
  status_label: string;
  priority: string;
  due_date?: string;
};

const STATUS_COLOR: Record<string, string> = {
  planned:   "bg-blue-100 text-blue-700",
  draft:     "bg-slate-100 text-slate-600",
  sent:      "bg-blue-100 text-blue-700",
  started:   "bg-orange-100 text-orange-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed:    "bg-red-100 text-red-700",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">İşlerim</h1>
        <p className="mt-1 text-sm text-slate-500">
          {loading ? "Yükleniyor..." : `${filtered.length} iş emri${statusFilter ? ` — ${STATUS_GROUP_LABEL[statusFilter] ?? statusFilter}` : " atanmış"}`}
        </p>
      </div>

      {statusFilter && (
        <button
          type="button"
          onClick={() => router.push("/user/islerim")}
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          {STATUS_GROUP_LABEL[statusFilter] ?? statusFilter}
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-20 text-center">
          <p className="text-sm text-slate-400">
            {q
              ? "Aramayla eşleşen iş emri bulunamadı."
              : statusFilter
                ? `${STATUS_GROUP_LABEL[statusFilter] ?? statusFilter} durumunda iş emri yok.`
                : "Henüz atanmış iş emri yok."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((wo) => (
            <Link
              key={wo.id}
              href={`/user/islerim/${wo.id}`}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            >
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[wo.priority] ?? "bg-slate-400"}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {wo.project_name ?? "Mağaza bilgisi yok"} - {wo.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {wo.project_no ? `Mağaza kodu: ${wo.project_no} | ` : ""}{wo.work_type_label}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[wo.status] ?? "bg-slate-100 text-slate-500"}`}>
                {statusLabel(wo.status)}
              </span>
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
