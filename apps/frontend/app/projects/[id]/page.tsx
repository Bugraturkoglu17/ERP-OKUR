"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  Archive,
  ChevronRight,
  ClipboardPlus,
  Edit2,
  FileText,
  Folder,
  Loader2,
  Save,
  Store,
  X,
} from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { useDocActions } from "@/hooks/use-doc-actions";
import { ToolbarDock } from "@/components/ui/toolbar-dock";
import ServisFormTab from "./ServisFormTab";
import WorkOrdersTab from "./WorkOrdersTab";
import VisualInventoryTab from "./VisualInventoryTab";

// ── Types ──────────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  name: string;
  project_no?: string;
  description?: string;
  status: string;
  scope_codes?: string[];
  start_date?: string;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  customer_id?: string;
  region_id?: string;
  branch_id?: string;
};

type Document = {
  id: string;
  original_name: string;
  doc_type: string;
  version: number;
  revision_note?: string;
  vi_meta?: string;
  uploaded_by_name?: string;
  file_size_bytes?: number;
  mime_type?: string;
  created_at: string;
  process_id?: string;
  is_archive?: boolean;
};

// ── Tab Config ─────────────────────────────────────────────────────────────────

type TabKey = "identity" | "work-orders" | "project_files" | "visual_inventory" | "servisform" | "other";

const TABS: { key: TabKey; label: string }[] = [
  { key: "identity",         label: "Kimlik"          },
  { key: "work-orders",      label: "İş Emirleri"     },
  { key: "project_files",    label: "Proje Dosyaları" },
  { key: "visual_inventory", label: "Görsel Envanter" },
  { key: "servisform",       label: "Servis Formları" },
  { key: "other",            label: "Diğer Dosyalar"  },
];

type DescExtra = {
  store_type?: string;
  format?: string;
  bolge?: string;
  sehir?: string;
  tel1?: string;
  tel2?: string;
  tel3?: string;
  tel4?: string;
  adres?: string;
  acilis_tarihi?: string;
};

function parseDesc(desc?: string): DescExtra {
  if (!desc) return {};
  try { return JSON.parse(desc); } catch { return {}; }
}

// ── Constants ──────────────────────────────────────────────────────────────────

// category: hangi sekmeye ait olduğu
// "project_file" → Proje Dosyaları, "revision" → Revizyonlar, "module" → kendi sekmesi, "other" → Diğer, "visual_inventory" → Görsel Envanter
const DOC_TYPES: Record<string, { label: string; category: "project_file" | "revision" | "module" | "other" | "visual_inventory"; ext?: string }> = {
  // Proje Dosyaları
  drawing_hvac:    { label: "HVAC Çizim",      category: "project_file", ext: "DWG" },
  drawing_fire:    { label: "Yangın Çizim",    category: "project_file", ext: "DWG" },
  drawing_seismic: { label: "Sismik Çizim",    category: "project_file", ext: "DWG" },
  drawing_mep:     { label: "MEP Çizim",       category: "project_file", ext: "DWG" },
  project_file:    { label: "Proje Dosyası",   category: "project_file"             },
  contract:        { label: "Sözleşme",        category: "project_file", ext: "PDF" },
  // Tadilat Proje Dosyaları
  tadilat_proje:    { label: "Tadilat - Proje",     category: "project_file" },
  tadilat_onay:     { label: "Tadilat - Onaylı",    category: "project_file" },
  tadilat_uygulama: { label: "Tadilat - Uygulama",  category: "project_file" },
  tadilat_teklif:   { label: "Tadilat - Teklif",    category: "project_file" },
  tadilat_diger:    { label: "Tadilat - Diğer",     category: "project_file" },
  tadilat_revizyon: { label: "Tadilat - Revizyon",  category: "revision"     },
  // Sadece Revizyonlar sekmesi
  revision:        { label: "Revizyon",        category: "revision"                 },
  // Modül sekmeleri (ServisFormTab, HakkedisTab, FaturaTab, OnayMailTab yönetir)
  field_report:    { label: "Saha Raporu",     category: "module" },
  invoice_doc:     { label: "Hakediş/Fatura",  category: "module" },
  expense_receipt: { label: "Masraf Makbuzu",  category: "module" },
  approval_email:  { label: "Onay Maili",      category: "module" },
  // Diğer Dosyalar
  other:           { label: "Diğer",           category: "other"  },
  // Görsel Envanter — sadece Görsel Envanter sekmesinde görünür
  visual_inventory: { label: "Görsel Envanter", category: "visual_inventory" },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  inquiry:      { label: "Keşif",         cls: "bg-purple-50 text-purple-700 border-purple-100" },
  INQUIRY:      { label: "Keşif",         cls: "bg-purple-50 text-purple-700 border-purple-100" },
  approved:     { label: "Onaylandı",     cls: "bg-green-50 text-green-700 border-green-100"   },
  APPROVED:     { label: "Onaylandı",     cls: "bg-green-50 text-green-700 border-green-100"   },
  in_progress:  { label: "Sahada",        cls: "bg-blue-50 text-blue-700 border-blue-100"      },
  IN_PROGRESS:  { label: "Sahada",        cls: "bg-blue-50 text-blue-700 border-blue-100"      },
  invoice_pend: { label: "Beklemede",     cls: "bg-amber-50 text-amber-700 border-amber-100"   },
  INVOICE_PEND: { label: "Beklemede",     cls: "bg-amber-50 text-amber-700 border-amber-100"   },
  completed:    { label: "Tamamlandı",    cls: "bg-slate-100 text-slate-600 border-slate-200"  },
  COMPLETED:    { label: "Tamamlandı",    cls: "bg-slate-100 text-slate-600 border-slate-200"  },
  cancelled:    { label: "İptal",         cls: "bg-red-50 text-red-600 border-red-100"         },
  CANCELLED:    { label: "İptal",         cls: "bg-red-50 text-red-600 border-red-100"         },
};

const STATUS_OPTS = [
  { value: "inquiry",      label: "Keşif"         },
  { value: "approved",     label: "Onaylandı"     },
  { value: "in_progress",  label: "Devam Ediyor"  },
  { value: "invoice_pend", label: "Beklemede"     },
  { value: "completed",    label: "Tamamlandı"    },
  { value: "cancelled",    label: "İptal Edildi"  },
];

function fmtBytes(n?: number): string {
  if (!n) return "—";
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function getDocCategory(doc_type: string) {
  return DOC_TYPES[doc_type]?.category ?? "other";
}

function getExtBadge(doc: Document): string {
  if (DOC_TYPES[doc.doc_type]?.ext) return DOC_TYPES[doc.doc_type].ext!;
  const ext = doc.original_name.split(".").pop()?.toUpperCase() ?? "";
  return ext;
}

// ── URL Tab Util ───────────────────────────────────────────────────────────────

function readTabFromUrl(): TabKey {
  if (typeof window === "undefined") return "identity";
  const p = new URLSearchParams(window.location.search);
  const t = p.get("tab");
  // Eski sekme key'lerini yeni yapıya yönlendir
  if (t === "dwg" || t === "pdf" || t === "revisions") return "project_files";
  if (t === "process" || t === "activity" || t === "notes") return "identity";
  if (t === "hakkediş" || t === "fatura") return "other";
  if (t === "visual_inventory") return "visual_inventory";
  return (t && TABS.some((x) => x.key === t) ? t : "identity") as TabKey;
}

function writeTabToUrl(tab: TabKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url.toString());
}

// ── Doc List ───────────────────────────────────────────────────────────────────

function DocList({ docs, archiveHref, onDeleted }: { docs: Document[]; archiveHref: string; onDeleted: (docId: string) => void }) {
  const router = useRouter();
  // Aç / İndir / Sil: mağaza sayfasındaki tüm dosya listeleriyle ortak "≡" menüsü.
  const { actionsFor, busyId, error: actionError } = useDocActions(onDeleted);

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Folder className="h-8 w-8 text-slate-200" />
        <p className="text-sm text-slate-400">Bu mağazaya ait dosya bulunmuyor.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</p>
      )}
      {docs.map((doc) => {
        const typeInfo = DOC_TYPES[doc.doc_type];
        return (
          <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 hover:border-slate-200 group transition-colors">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50">
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-900 truncate">{doc.original_name}</p>
                {(() => { const ext = getExtBadge(doc); return ext ? (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
                    ext === "DWG"  ? "bg-orange-50 text-orange-600" :
                    ext === "PDF"  ? "bg-red-50 text-red-600"       :
                    ext === "XLSX" || ext === "XLS" ? "bg-green-50 text-green-600" :
                    ext === "ZIP"  ? "bg-purple-50 text-purple-600" :
                    "bg-slate-100 text-slate-500"
                  }`}>{ext}</span>
                ) : null; })()}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-400">{typeInfo?.label ?? doc.doc_type}</span>
                <span className="text-slate-200">·</span>
                <span className="text-[11px] text-slate-400">v{doc.version}</span>
                <span className="text-slate-200">·</span>
                <span className="text-[11px] text-slate-400">{fmtBytes(doc.file_size_bytes)}</span>
                {doc.revision_note && (
                  <><span className="text-slate-200">·</span><span className="text-[11px] text-slate-500 italic truncate max-w-[180px]">{doc.revision_note}</span></>
                )}
              </div>
            </div>
            <div className="shrink-0 text-[11px] text-slate-400 ml-1">
              {new Date(doc.created_at).toLocaleDateString("tr-TR")}
            </div>
            {/* Çerçevesiz tek "≡" — dokunmatikte de görünür (eskiden yalnızca hover'da çıkıyordu). */}
            {busyId === doc.id ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
            ) : (
              <ToolbarDock
                actions={actionsFor(doc, doc.is_archive
                  ? [{ key: "archive", label: "Genel Arşivde Göster", icon: Archive, onClick: () => router.push(archiveHref) }]
                  : [])}
                panelClassName="w-48"
                triggerClassName="bg-transparent text-slate-400 hover:bg-transparent hover:text-slate-800"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────

function EditModal({ project, onClose, onDone }: { project: Project; onClose: () => void; onDone: (p: Project) => void }) {
  const extra = parseDesc(project.description);
  const [form, setForm] = useState({
    name:       project.name,
    project_no: project.project_no ?? "",
    status:     project.status,
    bolge:      extra.bolge      ?? "",
    sehir:      extra.sehir      ?? "",
    adres:      extra.adres      ?? "",
    tel1:       extra.tel1       ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      // description JSON'u yeniden oluştur — store_type, acilis_tarihi gibi alanları koru
      const prevDesc = parseDesc(project.description);
      const newDesc: Record<string, string> = { ...prevDesc as Record<string, string> };
      if (form.bolge.trim())      newDesc.bolge      = form.bolge.trim();      else delete newDesc.bolge;
      if (form.sehir.trim())      newDesc.sehir      = form.sehir.trim();      else delete newDesc.sehir;
      if (form.adres.trim())      newDesc.adres      = form.adres.trim();      else delete newDesc.adres;
      if (form.tel1.trim())       newDesc.tel1       = form.tel1.trim();       else delete newDesc.tel1;

      const updated = await apiPatch<Project>(`/projects/${project.id}`, {
        name:        form.name.trim(),
        project_no:  form.project_no.trim() || null,
        description: JSON.stringify(newDesc),
        status:      form.status,
        // scope_codes değiştirilmez — bakım/tadilat/yeni_yapım modüllerinden yönetilir
        scope_codes: project.scope_codes ?? [],
      });
      onDone(updated);
      onClose();
    } catch (ex: any) {
      setErr(ex?.response?.data?.detail ?? "Güncelleme başarısız.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-900">Mağaza Bilgilerini Düzenle</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[75vh] px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Adı *</label>
              <input required value={form.name} onChange={set("name")}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Kodu</label>
              <input value={form.project_no} onChange={set("project_no")}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Durum</label>
              <select value={form.status} onChange={set("status")}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bölge</label>
              <input value={form.bolge} onChange={set("bolge")} placeholder="Örn: İç Anadolu"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Şehir</label>
              <input value={form.sehir} onChange={set("sehir")} placeholder="Örn: Ankara"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telefon</label>
              <input value={form.tel1} onChange={set("tel1")} placeholder="0XXX XXX XX XX"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Adres</label>
              <textarea rows={2} value={form.adres} onChange={set("adres")}
                placeholder="Tam adres..."
                className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Vazgeç</button>
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}<Save className="h-4 w-4" /> Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Ana Sayfa ──────────────────────────────────────────────────────────────────

export default function MagazaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const isManager = pathname?.startsWith("/manager") ?? false;
  const isUser = pathname?.startsWith("/user") ?? false;
  const backHref = pathname?.startsWith("/manager") ? "/manager/magaza-karti"
    : pathname?.startsWith("/admin") ? "/admin/stores"
    : pathname?.startsWith("/user") ? "/user/magaza-karti"
    : "/projects";
  const archiveHref = isManager ? "/manager/genel-arsiv" : isUser ? "/user/genel-arsiv" : "/genel-arsiv";

  const [project, setProject] = useState<Project | null>(null);
  const [docs,    setDocs]    = useState<Document[]>([]);
  // Bir dosya silinince (tüm sekmelerdeki "≡ > Sil") listeden hemen çıkar.
  const removeDoc = (docId: string) => setDocs((prev) => prev.filter((d) => d.id !== docId));
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<TabKey>("identity");

  const [editOpen,         setEditOpen]         = useState(false);
  const [projFileFilter,   setProjFileFilter]   = useState<string>("all");

  // Read initial tab from URL on mount
  useEffect(() => { setTab(readTabFromUrl()); }, []);

  const switchTab = (t: TabKey) => {
    setTab(t);
    writeTabToUrl(t);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiGet<Project>(`/projects/${id}`).catch(() => null),
      apiGet<Document[]>(`/documents/project/${id}`).catch(() => [] as Document[]),
    ]).then(([p, d]) => {
      setProject(p);
      setDocs(Array.isArray(d) ? d : []);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Store className="h-10 w-10 text-slate-200" />
        <p className="text-sm text-slate-500">Mağaza bulunamadı veya erişim yetkiniz yok.</p>
        <Link href={backHref} className="text-sm text-blue-600 hover:underline">← Mağazalar Listesine Dön</Link>
      </div>
    );
  }

  const statusInfo = STATUS_BADGE[project.status] ?? { label: project.status, cls: "bg-slate-100 text-slate-600 border-slate-200" };

  // Dosyalar doc_type kategorisine göre ayrılır
  const projectFileDocs = docs.filter((d) => getDocCategory(d.doc_type) === "project_file");
  const revisionDocs    = docs.filter((d) => getDocCategory(d.doc_type) === "revision");
  const otherDocs       = docs.filter((d) => getDocCategory(d.doc_type) === "other");
  // Proje Dosyaları = proje dosyaları + revizyonlar birleşik
  const allProjectDocs  = [...projectFileDocs, ...revisionDocs];

  // Proje Dosyaları içi filtre (revizyon filtresi dahil)
  const filteredProjectDocs = projFileFilter === "all"
    ? allProjectDocs
    : projFileFilter === "revizyon"
    ? revisionDocs
    : allProjectDocs.filter((d) => {
        const ext = getExtBadge(d).toLowerCase();
        if (projFileFilter === "dwg")   return ext === "dwg";
        if (projFileFilter === "pdf")   return ext === "pdf";
        if (projFileFilter === "excel") return ext === "xls" || ext === "xlsx";
        if (projFileFilter === "zip")   return ext === "zip";
        return !["dwg","pdf","xls","xlsx","zip"].includes(ext);
      });

  const extra = parseDesc(project.description);
  const phones = [extra.tel1, extra.tel2, extra.tel3, extra.tel4].filter((t) => t && t.trim());

  const visualInventoryDocs = docs.filter((d) => getDocCategory(d.doc_type) === "visual_inventory");
  const fieldReportDocs     = docs.filter((d) => d.doc_type === "field_report");

  const tabCounts: Record<TabKey, number | null> = {
    identity:          null,
    "work-orders":     null,
    project_files:     allProjectDocs.length       || null,
    visual_inventory:  visualInventoryDocs.length  || null,
    servisform:        fieldReportDocs.length       || null,
    other:             otherDocs.length            || null,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href={backHref} className="hover:text-slate-700 transition-colors">Mağazalar</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-slate-700 font-medium truncate max-w-[280px]">{project.name}</span>
      </div>

      {/* Başlık Kartı */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusInfo.cls}`}>
                {statusInfo.label}
              </span>
              {project.project_no && (
                <span className="text-[11px] font-mono text-slate-400">#{project.project_no}</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{project.name}</h1>
            {extra.adres && (
              <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">{extra.adres}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {isManager && (
              <Link href={`/manager/is-emirleri/yeni?storeId=${project.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
                <ClipboardPlus className="h-3.5 w-3.5" /> İş Emri Oluştur
              </Link>
            )}
            {!isUser && <button onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <Edit2 className="h-3.5 w-3.5" /> Düzenle
            </button>}
          </div>
        </div>

      </div>

      {/* Sekmeler + İçerik */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

        {/* Tab Bar */}
        <div className="flex overflow-x-auto border-b border-slate-100">
          {TABS.map((t) => {
            const count = tabCounts[t.key];
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`flex-none flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                {t.label}
                {count !== null && count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-5">

          {/* ── Kimlik Bilgileri ── */}
          {tab === "identity" && (
            <div className="space-y-5">
              {/* Temel Bilgiler */}
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoCard label="Mağaza Adı" value={project.name} />
                <InfoCard label="Mağaza Kodu" value={project.project_no ?? "—"} mono />
                <InfoCard label="Durum" value={statusInfo.label} />
                {extra.bolge && <InfoCard label="Bölge" value={extra.bolge} />}
                {extra.sehir && <InfoCard label="Şehir" value={extra.sehir} />}
                {extra.tel1  && <InfoCard label="Telefon" value={extra.tel1} mono />}
                {project.start_date && (
                  <InfoCard label="Başlangıç Tarihi" value={new Date(project.start_date).toLocaleDateString("tr-TR")} />
                )}
                <InfoCard label="Sisteme Eklenme" value={project.created_at ? new Date(project.created_at).toLocaleDateString("tr-TR") : "—"} />
              </div>

              {/* Ek Bilgiler — gizlenebilir */}
              {(extra.format || extra.adres || extra.acilis_tarihi || phones.length > 0) && (
                <details className="group">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-400 select-none list-none flex items-center gap-1.5">
                    <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                    Ek Bilgiler
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {extra.format && <InfoCard label="Format" value={extra.format} />}
                    {extra.acilis_tarihi && (
                      <InfoCard label="Açılış Tarihi" value={new Date(extra.acilis_tarihi).toLocaleDateString("tr-TR")} />
                    )}
                    {phones.map((tel, i) => (
                      <InfoCard key={i} label={`Telefon ${i + 1}`} value={tel!} mono />
                    ))}
                    {extra.adres && (
                      <div className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-medium text-slate-500 mb-1">Adres</p>
                        <p className="text-sm text-slate-800 leading-relaxed">{extra.adres}</p>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* ── Proje Dosyaları ── */}
          {tab === "project_files" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500">Bu alan mağazaya bağlanmış dosyaları görüntülemek içindir. Dosya ekleme işlemleri Genel Arşiv üzerinden yapılır.</p>
              </div>
              {/* Filtre Chipleri */}
              {allProjectDocs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: "all",      label: "Tümü"     },
                    { key: "dwg",      label: "DWG"      },
                    { key: "pdf",      label: "PDF"      },
                    { key: "excel",    label: "Excel"    },
                    { key: "zip",      label: "ZIP"      },
                    { key: "revizyon", label: "Revizyon" },
                    { key: "other",    label: "Diğer"    },
                  ].map((f) => (
                    <button key={f.key} onClick={() => setProjFileFilter(f.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                        projFileFilter === f.key
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
              <DocList docs={filteredProjectDocs} archiveHref={archiveHref} onDeleted={removeDoc} />
            </div>
          )}

          {/* ── İş Emirleri ── */}
          {tab === "work-orders" && project && (
            <WorkOrdersTab projectId={project.id} />
          )}

          {/* ── Görsel Envanter ── */}
          {tab === "visual_inventory" && project && (
            <VisualInventoryTab
              projectId={project.id}
              docs={visualInventoryDocs}
              onDeleted={removeDoc}
            />
          )}

          {/* ── Servis Formları ── */}
          {tab === "servisform" && (
            <ServisFormTab docs={fieldReportDocs} onDeleted={removeDoc} />
          )}

          {/* ── Diğer Dosyalar ── */}
          {tab === "other" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500">Bu alan mağazaya bağlanmış dosyaları görüntülemek içindir. Dosya ekleme işlemleri Genel Arşiv üzerinden yapılır.</p>
              </div>
              <DocList docs={otherDocs} archiveHref={archiveHref} onDeleted={removeDoc} />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {!isUser && editOpen && project && <EditModal project={project} onClose={() => setEditOpen(false)} onDone={(p) => setProject(p)} />}
    </div>
  );
}

// ── InfoCard ───────────────────────────────────────────────────────────────────

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-medium text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-medium text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
