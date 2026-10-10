"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  ChevronRight,
  ClipboardList,
  FileText,
  Plus,
  Search,
  Store,
  UploadCloud,
} from "lucide-react";
import { apiGet } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  project_no?: string;
  status: string;
  updated_at?: string;
  created_at?: string;
}

interface Document {
  id: string;
  project_id: string | null;
  original_name?: string;
  name?: string;
  doc_type: string;
  created_at: string;
}

interface WorkOrder {
  id: string;
  project_id: string;
  project_name?: string;
  title: string;
  status: string;
  work_type?: string;
}

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  inquiry:      { label: "Keşif",        dot: "bg-purple-400", text: "text-purple-700" },
  INQUIRY:      { label: "Keşif",        dot: "bg-purple-400", text: "text-purple-700" },
  approved:     { label: "Onaylandı",    dot: "bg-green-400",  text: "text-green-700"  },
  APPROVED:     { label: "Onaylandı",    dot: "bg-green-400",  text: "text-green-700"  },
  in_progress:  { label: "Devam Ediyor", dot: "bg-blue-400",   text: "text-blue-700"   },
  IN_PROGRESS:  { label: "Devam Ediyor", dot: "bg-blue-400",   text: "text-blue-700"   },
  invoice_pend: { label: "Beklemede",    dot: "bg-amber-400",  text: "text-amber-700"  },
  INVOICE_PEND: { label: "Beklemede",    dot: "bg-amber-400",  text: "text-amber-700"  },
  completed:    { label: "Tamamlandı",   dot: "bg-slate-400",  text: "text-slate-600"  },
  COMPLETED:    { label: "Tamamlandı",   dot: "bg-slate-400",  text: "text-slate-600"  },
  cancelled:    { label: "İptal",        dot: "bg-red-400",    text: "text-red-700"    },
  CANCELLED:    { label: "İptal",        dot: "bg-red-400",    text: "text-red-700"    },
};

const WO_STATUS: Record<string, { label: string; color: string }> = {
  planned:          { label: "Planlanacak",      color: "text-blue-600"   },
  draft:            { label: "Taslak",           color: "text-slate-500"  },
  sent:             { label: "Gönderildi",        color: "text-blue-600"   },
  started:          { label: "Devam Ediyor",      color: "text-amber-600"  },
  material_waiting: { label: "Malzeme Bekliyor",  color: "text-orange-600" },
  revisit:          { label: "Tekrar Gidilecek",  color: "text-purple-600" },
  approval_pending: { label: "Onay Bekliyor",     color: "text-rose-600"   },
  completed:        { label: "Tamamlandı",        color: "text-emerald-600"},
  failed:           { label: "Tamamlanmadı",      color: "text-red-600"    },
  cancelled:        { label: "İptal",             color: "text-slate-400"  },
};

const NOW = new Date();
const THIS_MONTH_START = new Date(NOW.getFullYear(), NOW.getMonth(), 1).toISOString();

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  iconClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-3 inline-flex rounded-xl p-2 ${iconClass ?? "bg-slate-100 text-slate-600"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function MagazaCard({ project }: { project: Project }) {
  const st = STATUS[project.status] ?? { label: project.status, dot: "bg-slate-400", text: "text-slate-600" };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-200 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{project.name}</p>
            {project.project_no && (
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{project.project_no}</p>
            )}
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.text} bg-slate-50 border border-slate-200`}>
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${st.dot}`} />
          {st.label}
        </span>
      </div>

      <div className="flex items-center justify-between">
        {project.updated_at && (
          <p className="text-[11px] text-slate-400">
            Son güncelleme: {new Date(project.updated_at).toLocaleDateString("tr-TR")}
          </p>
        )}
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 ml-auto group-hover:underline"
        >
          Klasörü Aç <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function SmartSearch({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    return projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.project_no ?? "").toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [query, projects]);

  return (
    <div className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Mağaza adı veya kodu ara..."
          className="w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {results.map((p) => {
            const st = STATUS[p.status];
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                onClick={() => setQuery("")}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
              >
                <Store className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                  {p.project_no && <p className="text-xs text-slate-400 font-mono">{p.project_no}</p>}
                </div>
                {st && (
                  <span className={`text-[11px] font-medium ${st.text}`}>{st.label}</span>
                )}
                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}

      {query.length >= 2 && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-slate-200 bg-white shadow-lg px-4 py-3">
          <p className="text-sm text-slate-400">Sonuç bulunamadı.</p>
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function DashboardOverview() {
  const [projects, setProjects]     = useState<Project[]>([]);
  const [docs, setDocs]             = useState<Document[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [p, d, wo] = await Promise.all([
          apiGet<Project[]>("/projects?limit=5000"),
          apiGet<Document[]>("/documents").catch(() => [] as Document[]),
          apiGet<WorkOrder[]>("/work-orders").catch(() => [] as WorkOrder[]),
        ]);
        setProjects(Array.isArray(p) ? p : []);
        setDocs(Array.isArray(d) ? d : []);
        setWorkOrders(Array.isArray(wo) ? wo : []);
      } catch (err: any) {
        setError(err?.response?.data?.detail || "Veriler yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const aktifIsEmirleri = workOrders.filter((wo) =>
      ["sent", "started", "material_waiting", "revisit"].includes(wo.status)
    ).length;
    const bekleyenGorevler = workOrders.filter((wo) =>
      ["planned", "draft", "approval_pending"].includes(wo.status)
    ).length;
    const buAyDocs = docs.filter((d) => d.created_at >= THIS_MONTH_START).length;
    return { total: projects.length, aktifIsEmirleri, bekleyenGorevler, buAyDocs };
  }, [projects, docs, workOrders]);

  const sonMagazalar = useMemo(
    () =>
      [...projects]
        .sort((a, b) =>
          new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
          new Date(a.updated_at ?? a.created_at ?? 0).getTime()
        )
        .slice(0, 6),
    [projects]
  );

  const aktifIsler = useMemo(
    () =>
      workOrders
        .filter((wo) =>
          ["sent", "started", "material_waiting", "revisit", "approval_pending"].includes(wo.status)
        )
        .slice(0, 10),
    [workOrders]
  );

  const sonDosyalar = useMemo(
    () =>
      [...docs]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 5),
    [docs]
  );

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* Başlık + Arama */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Genel Bakış</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mağaza kartları, iş emirleri ve dosyaları tek ekrandan takip edin.
          </p>
        </div>
        <SmartSearch projects={projects} />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Özet kartlar */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Store}
          label="Toplam Mağaza"
          value={stats.total}
          sub="Kayıtlı mağaza kartı"
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={ClipboardList}
          label="Aktif İş Emirleri"
          value={stats.aktifIsEmirleri}
          sub="Devam eden görevler"
          iconClass="bg-amber-50 text-amber-600"
        />
        <StatCard
          icon={AlertCircle}
          label="Bekleyen Görevler"
          value={stats.bekleyenGorevler}
          sub="Taslak ve onay bekleyen"
          iconClass="bg-rose-50 text-rose-500"
        />
        <StatCard
          icon={UploadCloud}
          label="Bu Ay Yüklenen Dosyalar"
          value={stats.buAyDocs}
          sub={new Date().toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}
          iconClass="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Hızlı işlemler */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          <Store className="h-4 w-4" /> Mağaza Kartları
        </Link>
        <Link
          href="/is-emirleri"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> İş Emirleri
        </Link>
        <Link
          href="/genel-arsiv"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Archive className="h-4 w-4" /> Genel Arşiv
        </Link>
      </div>

      {/* Ana içerik + Yan panel */}
      <div className="flex gap-6 items-start">

        {/* Sol: Son Mağazalar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Son Güncellenen Mağazalar</h2>
            <Link href="/projects" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              Tümünü gör →
            </Link>
          </div>

          {sonMagazalar.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <Store className="mx-auto h-8 w-8 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-600">Henüz mağaza eklenmemiş</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                Projeler sayfasından ilk mağazayı oluşturabilirsiniz.
              </p>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
              >
                <Plus className="h-4 w-4" /> Mağaza Ekle
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {sonMagazalar.map((p) => (
                <MagazaCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>

        {/* Sağ: Aktif İşler + Son Dosyalar */}
        <div className="w-72 shrink-0 hidden xl:block space-y-4">

          {/* Aktif İş Emirleri */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900">Aktif İşler</h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                {aktifIsler.length}
              </span>
            </div>
            {aktifIsler.length === 0 ? (
              <div className="p-6 text-center">
                <ClipboardList className="mx-auto h-7 w-7 text-slate-200 mb-2" />
                <p className="text-xs text-slate-400">Aktif iş emri bulunmuyor.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[360px] overflow-y-auto">
                {aktifIsler.map((wo) => {
                  const wst = WO_STATUS[wo.status] ?? { label: wo.status, color: "text-slate-500" };
                  return (
                    <Link
                      key={wo.id}
                      href={`/is-emirleri/${wo.id}`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group"
                    >
                      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        wo.status === "started"          ? "bg-amber-400"  :
                        wo.status === "material_waiting" ? "bg-orange-400" :
                        wo.status === "approval_pending" ? "bg-rose-400"   :
                        "bg-blue-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate leading-tight group-hover:text-blue-600">
                          {wo.project_name ?? wo.title}
                        </p>
                        {wo.project_name && (
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">{wo.title}</p>
                        )}
                        <p className={`text-[10px] font-semibold mt-0.5 ${wst.color}`}>{wst.label}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="border-t border-slate-50 px-4 py-2">
              <Link href="/is-emirleri" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                Tümünü gör →
              </Link>
            </div>
          </div>

          {/* Son Yüklenen Dosyalar */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-slate-900">Son Yüklenen Dosyalar</h2>
              </div>
            </div>
            {sonDosyalar.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-slate-400">Henüz dosya yüklenmemiş.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[240px] overflow-y-auto">
                {sonDosyalar.map((d) => {
                  const fileName = d.original_name ?? d.name ?? "—";
                  const ext = fileName.split(".").pop()?.toUpperCase() ?? "";
                  return (
                    <div key={d.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        ext === "DWG"                           ? "bg-orange-50 text-orange-600"
                        : ext === "PDF"                        ? "bg-red-50 text-red-600"
                        : ["JPG","JPEG","PNG"].includes(ext)   ? "bg-green-50 text-green-600"
                        : "bg-slate-100 text-slate-500"
                      }`}>{ext || "?"}</span>
                      <p className="flex-1 text-[11px] text-slate-700 truncate">{fileName}</p>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-slate-50 px-4 py-2">
              <Link href="/genel-arsiv" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                Genel Arşiv →
              </Link>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
