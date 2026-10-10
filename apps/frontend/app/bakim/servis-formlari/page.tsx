"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Clock, Download, Eye, FileText, FolderOpen, Search, Store, Wrench,
} from "lucide-react";
import { apiGet, buildApiUrl } from "@/lib/api";
import { downloadFromUrl, openFileInNewTab } from "@/lib/download";

type Project = { id: string; name: string; project_no?: string; status: string; scope_codes?: string[] };

type ServiceForm = {
  id: string;
  project_id: string;
  year: number;
  month: number;
  file_url?: string;
  file_name?: string;
  uploaded_by_name?: string;
  created_at: string;
};

const MONTHS_TR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                   "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const NOW_MONTH = new Date().getMonth() + 1;
const NOW_YEAR  = new Date().getFullYear();

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveFileUrl(fileUrlOrDocId: string, forceDownload = false): Promise<string> {
  // Direkt URL (yeni kayıtlar)
  if (fileUrlOrDocId.startsWith("http")) return fileUrlOrDocId;
  // UUID → /documents/{id}/download
  if (UUID_RE.test(fileUrlOrDocId)) {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const res = await fetch(buildApiUrl(`/documents/${fileUrlOrDocId}/download${forceDownload ? "?download=true" : ""}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error();
    const { url } = await res.json();
    return url;
  }
  // Eski kayıtlarda file_key (path) saklanmış → yerel statik servis
  return `http://localhost:8001/static/uploads/${fileUrlOrDocId}`;
}

async function openDoc(fileUrlOrDocId: string) {
  try {
    await openFileInNewTab(() => resolveFileUrl(fileUrlOrDocId));
  } catch {
    alert("Dosya açılamadı.");
  }
}

async function downloadDoc(fileUrlOrDocId: string, fileName?: string) {
  try {
    // forceDownload=true → OCI presigned URL zaten Content-Disposition:
    // attachment taşıyor; downloadFile blob-fetch CORS'a takılırsa otomatik
    // düz navigasyona düşer, indirme yine de tetiklenir.
    await downloadFromUrl(() => resolveFileUrl(fileUrlOrDocId, true), fileName ?? "servis-formu");
  } catch {
    alert("Dosya indirilemedi.");
  }
}

export default function BakimServisFormlariPage() {
  const [projects,    setProjects]    = useState<Project[]>([]);
  const [formMap,     setFormMap]     = useState<Map<string, ServiceForm>>(new Map());
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [query,       setQuery]       = useState("");
  const [monthFilter, setMonthFilter] = useState(NOW_MONTH);
  const [yearFilter,  setYearFilter]  = useState(NOW_YEAR);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        // 2 paralel çağrı — per-project loop yok
        const [projs, forms] = await Promise.all([
          apiGet<Project[]>("/projects?limit=5000").catch(() => [] as Project[]),
          apiGet<ServiceForm[]>(`/service-forms?year=${yearFilter}&month=${monthFilter}`).catch(() => [] as ServiceForm[]),
        ]);

        const list = Array.isArray(projs) ? projs : [];
        // Sadece bakım mağazaları (scope_codes içinde "bakim" olanlar)
        const bakimList = list.filter((p) => p.scope_codes?.includes("bakim"));
        setProjects(bakimList);

        const map = new Map<string, ServiceForm>();
        if (Array.isArray(forms)) {
          forms.forEach((f) => map.set(f.project_id, f));
        }
        setFormMap(map);
      } catch {
        setError("Bağlantı hatası. Backend çalışıyor mu?");
      } finally {
        setLoading(false);
      }
    })();
  }, [yearFilter, monthFilter]);

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.project_no ?? "").toLowerCase().includes(q)
    );
  }, [projects, query]);

  const uploadedCount = filtered.filter((p) => formMap.has(p.id)).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100">
          <FileText className="h-5 w-5 text-sky-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Servis Formları</h1>
          <p className="text-xs text-slate-500">Bakım mağazalarına ait aylık servis formları</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mağaza ara..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(Number(e.target.value))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {MONTHS_TR.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(Number(e.target.value))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {[NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {!loading && (
          <span className="text-xs text-slate-400 ml-1">
            {uploadedCount} / {filtered.length} yüklendi
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400">
            {MONTHS_TR[monthFilter]} {yearFilter} servis formları kontrol ediliyor...
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-600">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-slate-200">
          <Wrench className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-500">Mağaza bulunamadı.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
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
              {filtered.map((p) => {
                const form    = formMap.get(p.id);
                const hasForm = !!form;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-slate-300 shrink-0" />
                        <Link
                          href={`/bakim/magazalar/${p.id}`}
                          className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                        >
                          {p.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 hidden sm:table-cell">
                      {p.project_no ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {MONTHS_TR[monthFilter]} {yearFilter}
                    </td>
                    <td className="px-4 py-3">
                      {hasForm ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Yüklendi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                          <Clock className="h-3 w-3" /> Yükleme Bekleniyor
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell max-w-[160px] truncate">
                      {form?.file_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">
                      {form?.created_at ? fmtDate(form.created_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {hasForm && form?.file_url && (
                          <>
                            <button
                              onClick={() => openDoc(form.file_url!)}
                              className="inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50"
                            >
                              <Eye className="h-3.5 w-3.5" /> Aç
                            </button>
                            <button
                              onClick={() => downloadDoc(form.file_url!, form.file_name)}
                              className="inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" /> İndir
                            </button>
                          </>
                        )}
                        <Link
                          href={`/bakim/magazalar/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <FolderOpen className="h-3.5 w-3.5" /> Forma Git
                        </Link>
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
