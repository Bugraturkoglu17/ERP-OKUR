"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileSearch, Loader2, Search, Trash2, X } from "lucide-react";
import { apiGet, apiDelete } from "@/lib/api";
import { downloadFromUrl, openFileInNewTab } from "@/lib/download";

type ArchiveDocument = {
  id: string;
  original_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  doc_type: string;
  archive_status: string;
  transferred_project_name: string | null;
  transferred_project_no: string | null;
  transferred_category: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  project_file: "Proje Dosyaları",
  visual_inventory: "Görsel Envanter",
  field_report: "Servis Formları",
  other: "Diğer Dosyalar",
};

const QUICK_FILTERS = ["DWG", "PDF", "PNG"];

function normalize(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extensionOf(name: string) {
  return name.split(".").pop()?.toUpperCase() ?? "DOSYA";
}

function formatBytes(value: number | null) {
  if (!value) return "Boyut bilinmiyor";
  if (value < 1_048_576) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function rankDocument(doc: ArchiveDocument, normalizedQuery: string) {
  const name = normalize(doc.original_name);
  const extension = normalize(extensionOf(doc.original_name));
  if (extension === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;
  return 3;
}

export default function DocumentQuickSearch() {
  const [documents, setDocuments] = useState<ArchiveDocument[]>([]);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDocument, setActiveDocument] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<ArchiveDocument[]>("/documents/archive")
      .then((data) => setDocuments(Array.isArray(data) ? data : []))
      .catch(() => setError("Dosya araması şu anda kullanılamıyor."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const closeResults = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", closeResults);
    return () => document.removeEventListener("mousedown", closeResults);
  }, []);

  const normalizedQuery = normalize(query);
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return documents
      .filter((doc) => {
        const extension = extensionOf(doc.original_name);
        const category = CATEGORY_LABELS[doc.transferred_category ?? doc.doc_type] ?? doc.doc_type;
        const searchable = normalize([
          doc.original_name,
          extension,
          doc.mime_type ?? "",
          category,
          doc.transferred_project_name ?? "",
          doc.transferred_project_no ?? "",
          doc.archive_status === "transferred" ? "mağazaya aktarıldı" : "aktarılmayı bekliyor",
        ].join(" "));
        return tokens.every((token) => searchable.includes(token));
      })
      .sort((a, b) => rankDocument(a, normalizedQuery) - rankDocument(b, normalizedQuery))
      .slice(0, 8);
  }, [documents, normalizedQuery]);

  const openDocument = async (doc: ArchiveDocument, download = false) => {
    setActiveDocument(doc.id);
    setError("");
    const getUrl = async () =>
      (await apiGet<{ url: string }>(`/documents/${doc.id}/download${download ? "?download=true" : ""}`)).url;
    try {
      if (download) await downloadFromUrl(getUrl, doc.original_name);
      else await openFileInNewTab(getUrl);
    } catch {
      setError(download ? "Dosya indirilemedi." : "Dosya bağlantısı oluşturulamadı.");
    } finally {
      setActiveDocument(null);
    }
  };

  const deleteDocument = async (doc: ArchiveDocument) => {
    if (!window.confirm(`"${doc.original_name}" dosyasını arşivden kaldırmak istediğinize emin misiniz?`)) return;
    setActiveDocument(doc.id);
    setError("");
    try {
      await apiDelete(`/documents/${doc.id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      setError("Dosya silinemedi.");
    } finally {
      setActiveDocument(null);
    }
  };

  const showResults = focused && normalizedQuery.length > 0;

  return (
    <section ref={containerRef} className="relative z-20">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Search className="ml-1 h-5 w-5 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setError(""); }}
            onFocus={() => setFocused(true)}
            onKeyDown={(event) => { if (event.key === "Escape") setFocused(false); }}
            placeholder="Dosya, mağaza veya tür ara... Örn: DWG, PDF, PNG, mağaza kodu"
            aria-label="Akıllı dosya arama"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {query && (
            <button onClick={() => setQuery("")} aria-label="Aramayı temizle" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="hidden items-center gap-1 border-l border-slate-200 pl-3 sm:flex">
            {QUICK_FILTERS.map((filter) => (
              <button key={filter} onClick={() => { setQuery(filter); setFocused(true); }} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-700">
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showResults && (
        <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-xs font-semibold text-slate-600">{results.length} hızlı sonuç</p>
            <p className="text-[11px] text-slate-400">Dosya · mağaza · kategori · uzantı</p>
          </div>

          {error ? (
            <p className="px-4 py-8 text-center text-sm text-red-600">{error}</p>
          ) : results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <FileSearch className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">Aramanızla eşleşen dosya bulunamadı.</p>
            </div>
          ) : (
            <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {results.map((doc) => {
                const extension = extensionOf(doc.original_name);
                const transferred = doc.archive_status === "transferred";
                return (
                  <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="w-12 shrink-0 rounded-md bg-slate-100 px-1.5 py-1 text-center text-[10px] font-bold text-slate-600">{extension}</span>
                    <button onClick={() => openDocument(doc)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold text-slate-800">{doc.original_name}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-400">
                        {doc.transferred_project_name ?? (transferred ? "Mağaza bilgisi yok" : "Genel Arşiv")} · {CATEGORY_LABELS[doc.transferred_category ?? doc.doc_type] ?? "Dosya"} · {formatBytes(doc.file_size_bytes)}
                      </span>
                    </button>
                    <button onClick={() => openDocument(doc)} title="Dosyayı aç" aria-label={`${doc.original_name} dosyasını aç`} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-blue-700 hover:shadow-sm">
                      {activeDocument === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    </button>
                    <button onClick={() => openDocument(doc, true)} title="Hemen indir" aria-label={`${doc.original_name} dosyasını indir`} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={activeDocument === doc.id}>
                      {activeDocument === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">İndir</span>
                    </button>
                    <button onClick={() => deleteDocument(doc)} title="Dosyayı sil" aria-label={`${doc.original_name} dosyasını sil`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" disabled={activeDocument === doc.id}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
