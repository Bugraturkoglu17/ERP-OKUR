"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen, HardHat, Search, Store } from "lucide-react";
import { apiGet } from "@/lib/api";

type Project = { id: string; name: string; project_no?: string; status: string };

export default function TadilatDosyalarPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState("");

  useEffect(() => {
    apiGet<Project[]>("/projects?limit=5000")
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    projects.filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query]
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
          <FileText className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Tadilat Dosyaları</h1>
          <p className="text-xs text-slate-500">Tadilat projelerine ait proje dosyalarını takip edin.</p>
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
          <p className="text-sm font-semibold text-slate-500">Henüz tadilat dosyası eklenmemiş.</p>
          <p className="text-xs text-slate-400">Bu kayıtlar mağaza kartlarından oluşturulacak.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              <Store className="h-4 w-4 text-slate-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5">{p.project_no ?? "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/projects/${p.id}?tab=dwg`}
                  className="text-xs text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50">
                  DWG
                </Link>
                <Link href={`/projects/${p.id}?tab=pdf`}
                  className="text-xs text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50">
                  PDF
                </Link>
                <Link href={`/projects/${p.id}`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <FolderOpen className="h-3.5 w-3.5" /> Klasörü Aç
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
