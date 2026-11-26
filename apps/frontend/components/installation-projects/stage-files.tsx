"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Image as ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { getRequestErrorMessage } from "@/lib/api";
import { uploadFormData } from "@/lib/upload";
import { cn, formatServerDateTime } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import {
  deleteProjectDocument, projectDocumentUrl,
  type ProjectDetail, type ProjectDocument, type ProjectStage,
} from "@/services/installationProjects";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.dwg,.dxf,.doc,.docx,.xls,.xlsx";
const MAX_BYTES = 25 * 1024 * 1024;
const INVOICE = "fatura";

type Pending = { key: number; file: File; docType: string; status: "waiting" | "uploading" | "done" | "error"; progress: number; error?: string };
let pendingKey = 0;

const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const isImage = (doc: { mime_type?: string | null; file_name: string }) =>
  (doc.mime_type ?? "").startsWith("image/") || /\.(png|jpe?g|webp|heic)$/i.test(doc.file_name);

/** Bir belgenin satırı: dosya, tür, yükleyen ve zaman. */
export function DocumentRow({ doc, stageName, onDelete }: { doc: ProjectDocument; stageName?: string; onDelete?: () => void }) {
  const Icon = isImage(doc) ? ImageIcon : FileText;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        {doc.url
          ? <a href={doc.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-blue-700 hover:underline">{doc.file_name}</a>
          : <p className="truncate text-sm font-medium text-slate-900">{doc.file_name}</p>}
        <p className="truncate text-[11px] text-slate-500">
          <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{doc.doc_type_label}</span>
          {stageName ? `${stageName} · ` : ""}{doc.uploaded_by_name ?? "—"} · {formatServerDateTime(doc.uploaded_at)}
        </p>
      </div>
      {onDelete && (
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`${doc.file_name} belgesini kaldır`} className="text-muted-foreground hover:text-destructive">
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

/**
 * Aşamanın dosyaları: tek "Dosya yükle" alanı (tıkla veya sürükle-bırak, çoklu dosya). Dosyalar seçilince
 * her birinin belge türü sorulur (aşamanın gerekli belgeleri üstte); yüklenenler bu aşamanın altında
 * yükleyen kişi ve zamanıyla listelenir. Yükleme sürerken pencere kilitlenir.
 */
export function StageFiles({ project, stage, canUpload, invoiceOnly = false, canDelete, onChanged, onError }: {
  project: ProjectDetail; stage: ProjectStage; canUpload: boolean;
  /** Kapanmış projede yalnızca fatura yüklenir. */
  invoiceOnly?: boolean;
  canDelete: boolean;
  onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const docs = project.documents.filter((doc) => doc.stage_id === stage.id);
  const required = stage.required_docs ?? [];
  const uploadedTypes = new Set(docs.map((doc) => doc.doc_type));
  const typeOptions = invoiceOnly
    ? [[INVOICE, project.doc_types[INVOICE] ?? "Fatura"]] as [string, string][]
    : [
      ...required.map((value) => [value, project.doc_types[value] ?? value] as [string, string]),
      ...Object.entries(project.doc_types).filter(([value]) => !required.includes(value)),
    ];

  function choose(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    const tooBig = list.find((file) => file.size > MAX_BYTES);
    if (tooBig) { onError(`${tooBig.name}: dosya 25 MB'tan büyük olamaz.`); return; }
    onError("");
    setPending(list.map((file) => ({ key: ++pendingKey, file, docType: invoiceOnly ? INVOICE : "", status: "waiting", progress: 0 })));
  }

  async function uploadAll() {
    if (!pending) return;
    setBusy(true);
    let failed = false;
    for (const item of pending) {
      if (item.status === "done") continue;
      setPending((cur) => cur && cur.map((row) => row.key === item.key ? { ...row, status: "uploading", progress: 0, error: undefined } : row));
      const form = new FormData();
      form.append("doc_type", item.docType);
      form.append("stage_id", stage.id);
      form.append("file", item.file);
      try {
        await uploadFormData(projectDocumentUrl(project.id), {
          formData: form,
          onProgress: (progress) => setPending((cur) => cur && cur.map((row) => row.key === item.key ? { ...row, progress } : row)),
        });
        setPending((cur) => cur && cur.map((row) => row.key === item.key ? { ...row, status: "done", progress: 100 } : row));
      } catch (reason) {
        failed = true;
        const message = getRequestErrorMessage(reason, "Dosya yüklenemedi.");
        setPending((cur) => cur && cur.map((row) => row.key === item.key ? { ...row, status: "error", error: message } : row));
      }
    }
    await onChanged();
    setBusy(false);
    if (!failed) setPending(null);
  }

  async function remove(doc: ProjectDocument) {
    if (!window.confirm(`"${doc.file_name}" projeden kaldırılsın mı?`)) return;
    setBusy(true); onError("");
    try { await deleteProjectDocument(doc.id); await onChanged(); }
    catch (reason) { onError(getRequestErrorMessage(reason, "Belge kaldırılamadı.")); }
    finally { setBusy(false); }
  }

  const ready = pending !== null && pending.every((row) => row.docType);

  return (
    <div className="relative">
      {busy && pending === null && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">Dosyalar{docs.length ? ` (${docs.length})` : ""}</p>
      </div>
      {canUpload && (
        <button type="button" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); choose(e.dataTransfer.files); }}
          className={`mt-2 flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 text-left transition ${dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/40"}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"><UploadCloud className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">Dosya yükle</span>
            <span className="block text-[11px] text-slate-500">Tıklayın veya sürükleyip bırakın · PDF, görsel, DWG, Word, Excel · en fazla 25 MB</span>
          </span>
        </button>
      )}
      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { choose(e.target.files); e.target.value = ""; }} />
      {docs.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">Bu adıma henüz dosya yüklenmedi.</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-100">
          {docs.map((doc) => <DocumentRow key={doc.id} doc={doc} onDelete={canDelete ? () => void remove(doc) : undefined} />)}
        </ul>
      )}

      {pending && (
        <Dialog open onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
          <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg"
            onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
            onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
            <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
              <DialogTitle className="text-sm">Dosya yükle · {stage.name}</DialogTitle>
              <DialogDescription className="text-xs">Her dosyanın ne olduğunu seçin.</DialogDescription>
            </DialogHeader>
            <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              {pending.map((row) => (
                <li key={row.key} className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{sizeLabel(row.file.size)}</span>
                    {row.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${row.file.name} belge türü`}>
                    {typeOptions.map(([value, label]) => {
                      const needed = required.includes(value) && !uploadedTypes.has(value);
                      return (
                        <Button key={value} type="button" size="sm" role="radio" aria-checked={row.docType === value} disabled={busy || row.status === "done"}
                          variant={row.docType === value ? "default" : "outline"}
                          className={cn("h-7 px-2.5 text-xs", needed && row.docType !== value && "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100")}
                          onClick={() => setPending((cur) => cur && cur.map((item) => item.key === row.key ? { ...item, docType: value } : item))}>
                          {label}{needed ? " · gerekli" : ""}
                        </Button>
                      );
                    })}
                  </div>
                  {row.status === "uploading" && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${row.progress}%` }} /></div>}
                  {row.error && <p className="mt-2 text-xs text-destructive">{row.error}</p>}
                </li>
              ))}
            </ul>
            <DialogFooter className="gap-2 border-t px-5 py-3 sm:space-x-0">
              <Button variant="ghost" size="sm" onClick={() => setPending(null)} disabled={busy}>Vazgeç</Button>
              <Button size="sm" onClick={() => void uploadAll()} disabled={busy || !ready}>
                {busy && <Loader2 className="animate-spin" />}{busy ? "Yükleniyor" : `${pending.filter((row) => row.status !== "done").length} dosyayı yükle`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
