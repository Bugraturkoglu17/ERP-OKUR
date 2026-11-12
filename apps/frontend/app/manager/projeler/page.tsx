"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, FolderKanban, Plus, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatServerDate } from "@/lib/utils";
import { PROJECT_STATUS_LABEL, listProjects, type ProjectStatus, type ProjectSummary } from "@/services/installationProjects";

const STATUS_TONE: Record<ProjectStatus, string> = {
  active: "bg-blue-50 text-blue-700", completed: "bg-emerald-50 text-emerald-700", cancelled: "bg-slate-100 text-slate-500",
};

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
    return projects.filter((p) => p.status === tab && (!q || `${p.name} ${p.store_name ?? ""} ${p.store_no ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)));
  }, [projects, tab, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Projeler</h1>
          <p className="mt-1 text-sm text-slate-500">Yeni soğutma kurulumlarını keşiften kapanışa kadar aşama aşama takip edin.</p>
        </div>
        <Link href="/manager/projeler/yeni" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Yeni Proje</Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(["active", "completed", "cancelled"] as ProjectStatus[]).map((value) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${tab === value ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {PROJECT_STATUS_LABEL[value]} ({counts[value]})
          </button>
        ))}
        <div className="relative ml-auto min-w-0 flex-1 basis-60 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Proje veya mağaza ara" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      {loading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FolderKanban className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">{tab === "active" ? "Devam eden proje yok" : "Bu listede proje yok"}</p>
            {tab === "active" && <p className="mt-1 text-sm text-slate-500">Yeni bir kurulum için &quot;Yeni Proje&quot; ile başlayın.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((p) => {
              const pct = p.stages_total ? Math.round((p.stages_done / p.stages_total) * 100) : 0;
              return (
                <Link key={p.id} href={`/manager/projeler/${p.id}`} className="group block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{p.store_name ?? "Yer bilgisi yok"}{p.store_no ? ` · ${p.store_no}` : ""}{p.manager_name ? ` · Sorumlu: ${p.manager_name}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.overdue && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Hedef tarih geçti</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[p.status]}`}>{PROJECT_STATUS_LABEL[p.status]}</span>
                      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} /></div>
                    <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">{p.stages_done}/{p.stages_total} aşama</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {p.current_stage && <span className={p.current_stage_overdue ? "font-semibold text-red-700" : ""}>Şu an: {p.current_stage}{p.current_stage_overdue ? " (gecikti)" : ""}</span>}
                    {p.closing_pending && <span className="rounded bg-amber-50 px-1.5 font-semibold text-amber-700">Kapanış onayı bekliyor</span>}
                    {p.target_date && <span>Hedef: {formatServerDate(p.target_date)}</span>}
                    <span>{p.work_order_count} iş emri</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
    </div>
  );
}
