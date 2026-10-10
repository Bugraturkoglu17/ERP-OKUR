"use client";

import { useRef, useState } from "react";
import { Upload, X, File as FileIcon, Loader2, AlertCircle } from "lucide-react";
import { uploadFormData } from "@/lib/upload";

const ACCEPT = ".dwg,.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.zip,.docx,.doc";

function fmtBytes(n: number): string {
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export default function UploadModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [files,   setFiles]   = useState<File[]>([]);
  const [busy,    setBusy]    = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({});
  const [err,     setErr]     = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const next  = Array.from(list).filter((f) => !names.has(f.name));
      return [...prev, ...next];
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (!files.length) return;
    setBusy(true);
    setErr(null);
    setProgress(0);
    setFileProgress(Object.fromEntries(files.map((file) => [file.name, 0])));
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const sentBytesByIndex = new Array(files.length).fill(0);

    const reportProgress = () => {
      const sentBytes = sentBytesByIndex.reduce((a, b) => a + b, 0);
      setProgress(totalBytes ? Math.round((sentBytes / totalBytes) * 100) : 100);
    };

    const uploadOne = async (index: number) => {
      const file = files[index];
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", "other");
      await uploadFormData("/documents/archive/upload", {
        formData: fd,
        onProgress: (percent) => {
          setFileProgress((current) => ({ ...current, [file.name]: percent }));
          sentBytesByIndex[index] = file.size * (percent / 100);
          reportProgress();
        },
      });
      sentBytesByIndex[index] = file.size;
      reportProgress();
    };

    // Dosyalar artık TEK TEK sırayla değil, aynı anda birkaç tanesi birden
    // yükleniyor (basit bir eşzamanlılık havuzu) — tarayıcı/sunucu tarafında
    // tek bir isteğin ağ gecikmesini beklemek yerine bant genişliği paralel
    // kullanılır, çoklu dosya yüklemesi gözle görülür şekilde hızlanır.
    const UPLOAD_CONCURRENCY = 3;
    let nextIndex = 0;
    let failure: string | null = null;

    const worker = async () => {
      while (nextIndex < files.length && !failure) {
        const index = nextIndex++;
        try {
          await uploadOne(index);
        } catch (ex: unknown) {
          failure = ex instanceof Error ? ex.message : "Yükleme başarısız.";
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker),
    );

    setBusy(false);
    if (failure) {
      setErr(failure);
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="archive-upload-title">
      <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="archive-upload-title" className="text-sm font-bold text-slate-900">Genel Arşive Dosya Yükle</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50 sm:py-10"
          >
            <Upload className="h-7 w-7 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Dosyaları buraya sürükleyin veya tıklayın</p>
            <p className="text-xs text-slate-400">DWG, PDF, JPG, PNG, XLSX, ZIP, DOCX ve diğerleri</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {/* Seçilen dosyalar */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1 text-xs text-slate-700 truncate">{f.name}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{busy ? `${fileProgress[f.name] ?? 0}%` : fmtBytes(f.size)}</span>
                  <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    className="shrink-0 text-slate-300 hover:text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {(busy || progress === 100) && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-slate-400 text-right">{progress}%</p>
            </div>
          )}

          {err && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{err}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
          <button onClick={onClose} disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={!files.length || busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {files.length > 1 ? `${files.length} Dosya Yükle` : "Yükle"}
          </button>
        </div>
      </div>
    </div>
  );
}
