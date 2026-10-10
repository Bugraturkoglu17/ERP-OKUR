"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Download,
  FileText,
  Folder,
  FolderOpen,
  History,
  Loader2,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiGet, apiDelete, buildApiUrl } from "@/lib/api";
import { openFileInNewTab } from "@/lib/download";

// ── Types ──────────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  name: string;
  project_no?: string;
  status?: string;
};

type Document = {
  id: string;
  original_name: string;
  doc_type: string;
  version: number;
  revision_note?: string;
  uploaded_by_name?: string;
  file_size_bytes?: number;
  created_at: string;
};

type DocVersion = {
  id: string;
  version: number;
  original_name: string;
  revision_note?: string;
  uploaded_by_name?: string;
  file_size_bytes?: number;
  created_at: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const DOC_TYPES: Record<string, { label: string; tag: string }> = {
  drawing_hvac:    { label: "HVAC Çizim",      tag: "DWG"  },
  drawing_fire:    { label: "Yangın Çizim",    tag: "DWG"  },
  drawing_seismic: { label: "Sismik Çizim",    tag: "DWG"  },
  drawing_mep:     { label: "MEP Çizim",       tag: "DWG"  },
  contract:        { label: "Sözleşme",        tag: "PDF"  },
  invoice_doc:     { label: "Hakediş/Fatura",  tag: "PDF"  },
  field_report:    { label: "Saha Raporu",     tag: "PDF"  },
  expense_receipt: { label: "Masraf Makbuzu",  tag: "PDF"  },
  other:           { label: "Diğer",           tag: "—"    },
};

const DOC_TYPE_OPTS = Object.entries(DOC_TYPES).map(([v, d]) => ({ value: v, label: d.label }));
const FILTER_TABS = ["Tümü", "DWG", "PDF", "Diğer"];

function fmtBytes(n?: number): string {
  if (!n) return "—";
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// ── Upload Modal ───────────────────────────────────────────────────────────────

function UploadModal({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile]       = useState<File | null>(null);
  const [docType, setDocType] = useState("drawing_hvac");
  const [revNote, setRevNote] = useState("");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setErr("Dosya seçin."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("project_id", projectId);
      fd.append("doc_type", docType);
      fd.append("revision_note", revNote);
      fd.append("file", file);
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(buildApiUrl("/documents/upload"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Yükleme başarısız.");
      }
      onDone(); onClose();
    } catch (ex: any) {
      setErr(ex.message ?? "Yükleme başarısız.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-900">Dosya Yükle</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dosya Türü</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              {DOC_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dosya *</label>
            <input ref={inputRef} type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors">
              {file
                ? <span className="text-sm font-medium text-slate-700">{file.name}</span>
                : <span className="text-sm text-slate-400">Dosya seçmek için tıklayın</span>}
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Revizyon Notu</label>
            <input value={revNote} onChange={(e) => setRevNote(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="İsteğe bağlı..." />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Vazgeç
            </button>
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Yükle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Revizyon Modal ─────────────────────────────────────────────────────────────

function ReviseModal({ doc, onClose, onDone }: { doc: Document; onClose: () => void; onDone: () => void }) {
  const [file, setFile]     = useState<File | null>(null);
  const [revNote, setRevNote] = useState("");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setErr("Dosya seçin."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("revision_note", revNote);
      fd.append("file", file);
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(buildApiUrl(`/documents/${doc.id}/version`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Revizyon başarısız.");
      }
      onDone(); onClose();
    } catch (ex: any) {
      setErr(ex.message ?? "Revizyon başarısız.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Yeni Revizyon Yükle</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{doc.original_name} · v{doc.version} → v{doc.version + 1}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Güncel Dosya *</label>
            <input ref={inputRef} type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors">
              {file ? <span className="text-sm font-medium text-slate-700">{file.name}</span>
                    : <span className="text-sm text-slate-400">Dosya seçin</span>}
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Revizyon Notu</label>
            <input value={revNote} onChange={(e) => setRevNote(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Ne değişti?" />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Vazgeç
            </button>
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Revizyon Yükle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── History Panel ──────────────────────────────────────────────────────────────

function HistoryPanel({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    apiGet<DocVersion[]>(`/documents/${doc.id}/versions`)
      .then((d) => setVersions(Array.isArray(d) ? d : []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [doc.id]);

  const download = async (ver: DocVersion) => {
    try {
      await openFileInNewTab(async () => (await apiGet<{ url: string }>(`/documents/${ver.id}/download`))?.url);
    } catch { alert("İndirme bağlantısı alınamadı."); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 p-0">
      <div className="w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Revizyon Geçmişi</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[260px]">{doc.original_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Revizyon bulunamadı.</p>
          ) : (
            <div className="space-y-2">
              {[...versions].sort((a, b) => b.version - a.version).map((v) => (
                <div key={v.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    v{v.version}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{v.original_name}</p>
                    {v.revision_note && (
                      <p className="text-[11px] text-slate-500 mt-0.5 italic">{v.revision_note}</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {v.uploaded_by_name ?? "—"} · {new Date(v.created_at).toLocaleDateString("tr-TR")} · {fmtBytes(v.file_size_bytes)}
                    </p>
                  </div>
                  <button onClick={() => download(v)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-green-50 hover:text-green-600">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ana Sayfa ──────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get("project") ?? "";

  const [projects,         setProjects]         = useState<Project[]>([]);
  const [selectedProject,  setSelectedProject]  = useState<Project | null>(null);
  const [docs,             setDocs]             = useState<Document[]>([]);
  const [loadingProjects,  setLoadingProjects]  = useState(true);
  const [loadingDocs,      setLoadingDocs]      = useState(false);

  const [search,      setSearch]      = useState("");
  const [filterTab,   setFilterTab]   = useState("Tümü");

  const [uploadOpen,  setUploadOpen]  = useState(false);
  const [reviseDoc,   setReviseDoc]   = useState<Document | null>(null);
  const [historyDoc,  setHistoryDoc]  = useState<Document | null>(null);

  useEffect(() => {
    apiGet<Project[]>("/projects")
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setProjects(list);
        if (initialProjectId) {
          const found = list.find((p) => p.id === initialProjectId);
          if (found) setSelectedProject(found);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [initialProjectId]);

  const loadDocs = useCallback(async (proj: Project) => {
    setLoadingDocs(true);
    const d = await apiGet<Document[]>(`/documents/project/${proj.id}`).catch(() => [] as Document[]);
    setDocs(Array.isArray(d) ? d : []);
    setLoadingDocs(false);
  }, []);

  useEffect(() => {
    if (selectedProject) loadDocs(selectedProject);
    else setDocs([]);
  }, [selectedProject, loadDocs]);

  const handleDownload = async (doc: Document) => {
    try {
      await openFileInNewTab(async () => (await apiGet<{ url: string }>(`/documents/${doc.id}/download`))?.url);
    } catch { alert("İndirme bağlantısı alınamadı."); }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(`"${doc.original_name}" arşivlensin mi?`)) return;
    try {
      await apiDelete(`/documents/${doc.id}`);
      if (selectedProject) await loadDocs(selectedProject);
    } catch { alert("Dosya arşivlenemedi."); }
  };

  const filteredDocs = useMemo(() => {
    const q = search.toLowerCase();
    return docs.filter((d) => {
      const matchSearch = !q || d.original_name.toLowerCase().includes(q) || (d.revision_note ?? "").toLowerCase().includes(q);
      const tag = DOC_TYPES[d.doc_type]?.tag ?? "—";
      const matchTab = filterTab === "Tümü" || tag === filterTab || (filterTab === "Diğer" && tag === "—");
      return matchSearch && matchTab;
    });
  }, [docs, search, filterTab]);

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">

      {/* Sol: Mağaza Listesi */}
      <div className="w-60 shrink-0 flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide">Mağazalar</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loadingProjects ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          ) : projects.length === 0 ? (
            <p className="text-xs text-slate-400 px-4 py-4">Mağaza bulunamadı.</p>
          ) : (
            projects.map((p) => (
              <button key={p.id}
                onClick={() => setSelectedProject(p)}
                className={`w-full text-left flex items-center gap-2 px-4 py-2.5 transition-colors ${
                  selectedProject?.id === p.id
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}>
                <Store className={`h-3.5 w-3.5 shrink-0 ${selectedProject?.id === p.id ? "text-blue-500" : "text-slate-300"}`} />
                <span className="text-xs font-medium truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Sağ: Dosya Alanı */}
      <div className="flex-1 min-w-0 flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">

        {!selectedProject ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <FolderOpen className="h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-400">Dosyaları görmek için bir mağaza seçin.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-slate-100 px-5 py-4 shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-slate-900 truncate">{selectedProject.name}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  <Link href={`/projects/${selectedProject.id}`} className="hover:text-blue-600 hover:underline">
                    Mağaza Sayfasına Git →
                  </Link>
                </p>
              </div>
              <button onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 shrink-0 transition-colors">
                <Upload className="h-4 w-4" /> Dosya Yükle
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100 shrink-0">
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Dosya ara..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-1">
                {FILTER_TABS.map((t) => (
                  <button key={t} onClick={() => setFilterTab(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      filterTab === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Doc List */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loadingDocs ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Folder className="h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">
                    {docs.length === 0 ? "Henüz dosya yüklenmemiş." : "Filtreye uygun dosya bulunamadı."}
                  </p>
                  {docs.length === 0 && (
                    <button onClick={() => setUploadOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline">
                      <Upload className="h-3.5 w-3.5" /> İlk dosyayı yükle
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDocs.map((doc) => {
                    const typeInfo = DOC_TYPES[doc.doc_type];
                    return (
                      <div key={doc.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 hover:border-slate-200 group transition-colors">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                          <FileText className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{doc.original_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {typeInfo?.tag && typeInfo.tag !== "—" && (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {typeInfo.tag}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400">{typeInfo?.label ?? doc.doc_type}</span>
                            <span className="text-slate-200">·</span>
                            <span className="text-[11px] text-slate-400">v{doc.version}</span>
                            <span className="text-slate-200">·</span>
                            <span className="text-[11px] text-slate-400">{fmtBytes(doc.file_size_bytes)}</span>
                            {doc.revision_note && (
                              <>
                                <span className="text-slate-200">·</span>
                                <span className="text-[11px] text-slate-500 italic truncate max-w-[160px]">{doc.revision_note}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setHistoryDoc(doc)} title="Revizyon Geçmişi"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <History className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setReviseDoc(doc)} title="Yeni Revizyon"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDownload(doc)} title="İndir"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-green-50 hover:text-green-600">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(doc)} title="Arşivle"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="shrink-0 text-[11px] text-slate-400 ml-1">
                          {new Date(doc.created_at).toLocaleDateString("tr-TR")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {uploadOpen && selectedProject && (
        <UploadModal
          projectId={selectedProject.id}
          onClose={() => setUploadOpen(false)}
          onDone={() => loadDocs(selectedProject)}
        />
      )}
      {reviseDoc && (
        <ReviseModal
          doc={reviseDoc}
          onClose={() => setReviseDoc(null)}
          onDone={() => selectedProject && loadDocs(selectedProject)}
        />
      )}
      {historyDoc && (
        <HistoryPanel doc={historyDoc} onClose={() => setHistoryDoc(null)} />
      )}
    </div>
  );
}
