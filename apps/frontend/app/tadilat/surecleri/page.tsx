"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FolderOpen, GitCommit, HardHat, Search, Store, Trash2 } from "lucide-react";
import { apiGet, apiDelete } from "@/lib/api";

type ActiveJob = {
  project_id: string; project_name: string; project_no?: string;
  process_id: string;
  work_type: string; process_title: string; current_stage?: string;
  target_end_date?: string; days_remaining?: number;
};

function calcCountdown(days?: number): { text: string; color: string } {
  if (days == null) return { text: "—",              color: "text-slate-400"  };
  if (days > 0)     return { text: `${days}g kaldı`, color: "text-blue-600"   };
  if (days === 0)   return { text: "Bugün teslim",   color: "text-amber-600"  };
  return               { text: `${Math.abs(days)}g gecikti`, color: "text-red-600" };
}

export default function TadilatSurecleriPage() {
  const [jobs,    setJobs]    = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState("");

  const load = () => {
    apiGet<ActiveJob[]>("/process/active-jobs")
      .then((d) => {
        const all = (Array.isArray(d) ? d : []).filter(j => j.work_type === "tadilat");
        // process_id benzersiz UUID'dir — dedupe
        const seen = new Set<string>();
        const unique = all.filter(j => {
          if (seen.has(j.process_id)) return false;
          seen.add(j.process_id);
          return true;
        });
        setJobs(unique);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (j: ActiveJob) => {
    if (!j.process_id) { alert("Süreç ID bulunamadı."); return; }
    if (!confirm(`"${j.process_title}" sürecini silmek istediğinizden emin misiniz?`)) return;
    try {
      await apiDelete(`/process/projects/${j.project_id}/process/${j.process_id}`);
      load();
    } catch (ex: any) {
      alert(ex?.response?.data?.detail ?? "Süreç silinemedi.");
    }
  };

  const filtered = useMemo(() =>
    jobs.filter(j => !query || j.project_name.toLowerCase().includes(query.toLowerCase())),
    [jobs, query]
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
          <GitCommit className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Tadilat Süreçleri</h1>
          <p className="text-xs text-slate-500">Aktif tadilat işlerinin süreç adımlarını takip edin.</p>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Mağaza ara..."
          className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-slate-200">
          <HardHat className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">Henüz aktif tadilat süreci yok.</p>
          <p className="text-xs text-slate-400">Bu kayıtlar mağaza kartlarından oluşturulacak.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Mağaza</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Süreç</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Mevcut Aşama</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Kalan Süre</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((j) => {
                const cd = calcCountdown(j.days_remaining);
                return (
                  <tr key={j.process_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-slate-300 shrink-0" />
                        <Link href={`/tadilat/surecleri/${j.process_id}?p=${j.project_id}`}
                          className="font-medium text-slate-900 hover:text-blue-600 transition-colors">
                          {j.project_name}
                        </Link>
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5 pl-6">{j.project_no ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{j.process_title}</td>
                    <td className="px-4 py-3">
                      {j.current_stage
                        ? <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">{j.current_stage}</span>
                        : <span className="text-slate-400 text-xs">—</span>
                      }
                    </td>
                    <td className={`px-4 py-3 text-xs font-semibold ${cd.color}`}>{cd.text}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/tadilat/surecleri/${j.process_id}?p=${j.project_id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <FolderOpen className="h-3.5 w-3.5" /> Klasöre Git
                        </Link>
                        <button
                          onClick={() => handleDelete(j)}
                          className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          title="Süreci Sil"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
