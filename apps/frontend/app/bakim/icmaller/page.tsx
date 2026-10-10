"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, FileText, FolderOpen, Search } from "lucide-react";
import { apiGet } from "@/lib/api";

type Project = { id: string; name: string; project_no?: string; scope_codes?: string[] };
type InvoiceRecord = {
  id: string; project_id: string; invoice_type: string; period?: string;
  file_name?: string; submitted_by_name?: string; created_at: string;
};

const MONTHS_TR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                   "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const NOW_MONTH = new Date().getMonth() + 1;
const NOW_YEAR  = new Date().getFullYear();

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BakimIcmallerPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [records,  setRecords]  = useState<InvoiceRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState("");
  const [month,    setMonth]    = useState(NOW_MONTH);
  const [year,     setYear]     = useState(NOW_YEAR);

  const period = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [ps, recs] = await Promise.all([
        apiGet<Project[]>("/projects?limit=5000").catch(() => [] as Project[]),
        apiGet<InvoiceRecord[]>("/invoice-records?invoice_type=bakım_icmali").catch(() => [] as InvoiceRecord[]),
      ]);
      const allP = Array.isArray(ps) ? ps : [];
      setProjects(allP.filter(p => p.scope_codes?.includes("bakim")));
      setRecords(Array.isArray(recs) ? recs : []);
      setLoading(false);
    })();
  }, []);

  const recMap = useMemo(() => {
    const m = new Map<string, InvoiceRecord>();
    records.filter(r => r.period === period).forEach(r => m.set(r.project_id, r));
    return m;
  }, [records, period]);

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(q) || (p.project_no ?? "").toLowerCase().includes(q));
  }, [projects, query]);

  const uploadedCount = filtered.filter(p => recMap.has(p.id)).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100">
          <FileText className="h-5 w-5 text-sky-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Bakım İcmalleri</h1>
          <p className="text-xs text-slate-500">Bakım mağazalarına ait aylık icmal takibi</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Mağaza ara..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          {MONTHS_TR.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          {[NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {!loading && <span className="text-xs text-slate-400">{uploadedCount} / {filtered.length} yüklendi</span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Mağaza</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Kod</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Dönem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Durum</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Dosya</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Yükleme Tarihi</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => {
                const rec = recMap.get(p.id);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400 hidden sm:table-cell">{p.project_no ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{MONTHS_TR[month]} {year}</td>
                    <td className="px-4 py-3">
                      {rec ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Yüklendi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                          <Clock className="h-3 w-3" /> Bekleniyor
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell max-w-[140px] truncate">{rec?.file_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">{rec?.created_at ? fmtDate(rec.created_at) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/bakim/magazalar/${p.id}`}
                        className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline">
                        <FolderOpen className="h-3.5 w-3.5" /> Bakım Klasörü
                      </Link>
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
