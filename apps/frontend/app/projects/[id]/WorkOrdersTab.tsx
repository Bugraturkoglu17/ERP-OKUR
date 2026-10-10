"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, ExternalLink, Plus } from "lucide-react";
import { apiGet } from "@/lib/api";
import { usePathname } from "next/navigation";

type WorkOrder = {
  id: string; project_id: string;
  work_type: string; work_type_label: string;
  title: string; description?: string;
  assigned_to_name?: string;
  priority: string; status: string; status_label: string;
  due_date?: string; created_by_name?: string;
  completed_at?: string; photo_count: number; has_service_form: boolean;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  draft:            "bg-slate-100 text-slate-600",
  sent:             "bg-blue-50 text-blue-700",
  started:          "bg-amber-50 text-amber-700",
  completed:        "bg-emerald-50 text-emerald-700",
  failed:           "bg-red-50 text-red-700",
  cancelled:        "bg-slate-100 text-slate-500",
  material_waiting: "bg-orange-50 text-orange-700",
  revisit:          "bg-purple-50 text-purple-700",
  approval_pending: "bg-yellow-50 text-yellow-700",
  approved:         "bg-emerald-100 text-emerald-800",
};

export default function WorkOrdersTab({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const isUser = pathname.startsWith("/user");
  const listHref = pathname.startsWith("/manager") ? "/manager/is-emirleri" : isUser ? "/user/islerim" : "/is-emirleri";
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet<WorkOrder[]>(`/work-orders?project_id=${projectId}`)
      .catch(() => [])
      .then((d) => { setOrders(Array.isArray(d) ? d : []); setLoading(false); });
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">İş Emirleri</p>
          {orders.length > 0 && (
            <span className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
              {orders.length}
            </span>
          )}
        </div>
        <Link href={listHref} className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> İş Emirleri Modülüne Git
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed border-slate-200">
          <ClipboardList className="h-9 w-9 text-slate-200" />
          <p className="text-sm text-slate-400">Bu mağazaya henüz iş emri açılmamış.</p>
          {!isUser && <Link href={listHref}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50">
            <Plus className="h-3.5 w-3.5" /> İş Emri Oluştur
          </Link>}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((wo) => (
            <div key={wo.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-medium text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
                      {wo.work_type_label}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[wo.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {wo.status_label}
                    </span>
                    {wo.priority === "critical" && <span className="text-[10px] text-red-600 font-bold">KRİTİK</span>}
                    {wo.priority === "urgent"   && <span className="text-[10px] text-orange-600 font-bold">ACİL</span>}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{wo.title}</p>
                  {wo.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{wo.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-slate-400">
                    {wo.assigned_to_name && <span>👤 {wo.assigned_to_name}</span>}
                    {wo.due_date && <span>Termin: {new Date(wo.due_date).toLocaleDateString("tr-TR")}</span>}
                    {wo.photo_count > 0 && <span>{wo.photo_count} fotoğraf</span>}
                    {wo.has_service_form && <span className="text-emerald-600">✓ Servis formu</span>}
                    <span>{new Date(wo.created_at).toLocaleDateString("tr-TR")}</span>
                  </div>
                </div>
                <Link href={`${listHref}/${wo.id}`}
                  className="shrink-0 inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50">
                  Detaya Git
                </Link>
              </div>
              {wo.status === "completed" && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Tamamlandı {wo.completed_at ? `· ${new Date(wo.completed_at).toLocaleDateString("tr-TR")}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
