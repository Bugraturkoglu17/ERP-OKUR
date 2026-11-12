"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, FolderKanban, Loader2 } from "lucide-react";
import { formatServerDate } from "@/lib/utils";
import { getMyStages, type MyStage } from "@/services/installationProjects";

export default function ProjectTasksPage() {
  const [items, setItems] = useState<MyStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyStages().then(setItems).catch(() => setError("Proje görevleri yüklenemedi.")).finally(() => setLoading(false));
  }, []);

  const active = items.filter((i) => i.status === "in_progress");
  const waiting = items.filter((i) => i.status === "planned");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Proje Görevlerim</h1>
        <p className="mt-1 text-sm text-slate-500">Sorumlusu olduğunuz kurulum projesi aşamaları. Sırası gelen aşamayı buradan yürütüp tamamlarsınız.</p>
      </header>

      {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      {loading ? <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Yükleniyor</p>
        : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FolderKanban className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">Size atanmış proje görevi yok</p>
            <p className="mt-1 text-sm text-slate-500">Yönetici bir proje aşamasına sizi sorumlu yaptığında burada görünür.</p>
          </div>
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
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title} ({items.length})</h2>
      {items.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{empty}</p> : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.stage_id}>
              <Link href={`/user/proje-gorevleri/${item.stage_id}`} className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3.5 transition hover:border-slate-300 ${muted ? "border-slate-100 opacity-80" : "border-slate-200"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${muted ? "bg-slate-100 text-slate-500" : "bg-blue-600 text-white"}`}>{item.stage_order}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.stage_name}</p>
                  <p className="truncate text-xs text-slate-500">{item.project_name}{item.store_name ? ` · ${item.store_name}` : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                    {item.planned_end && <span className={item.overdue ? "font-semibold text-red-700" : "text-slate-400"}>Planlanan bitiş: {formatServerDate(item.planned_end)}{item.overdue ? " (gecikti)" : ""}</span>}
                    {item.approval_pending && <span className="rounded bg-amber-50 px-1.5 font-semibold text-amber-700">Yönetici onayı bekliyor</span>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
