"use client";

import { Archive, FileText, Folder, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useDocActions } from "@/hooks/use-doc-actions";
import { ToolbarDock } from "@/components/ui/toolbar-dock";

type Document = {
  id: string;
  original_name: string;
  doc_type: string;
  version: number;
  uploaded_by_name?: string;
  file_size_bytes?: number;
  created_at: string;
  is_archive?: boolean;
};

function fmtBytes(n?: number): string {
  if (!n) return "—";
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export default function ServisFormTab({ docs, onDeleted }: { docs: Document[]; onDeleted: (docId: string) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  // Aç / İndir / Sil: mağaza sayfasındaki tüm dosya listeleriyle ortak "≡" menüsü.
  const { actionsFor, busyId, error: actionError } = useDocActions(onDeleted);
  const archiveHref = pathname.startsWith("/manager") ? "/manager/genel-arsiv" : pathname.startsWith("/user") ? "/user/genel-arsiv" : "/genel-arsiv";
  if (docs.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Servis Formları</h3>
          <p className="text-xs text-slate-400 mt-0.5">Bu mağazaya ait servis formları burada görüntülenir.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <Folder className="h-8 w-8 text-slate-200" />
          <p className="text-sm text-slate-400">Bu mağazaya ait servis formu bulunmuyor.</p>
          <p className="text-xs text-slate-300">Servis formları Genel Arşiv üzerinden bu sekmeye taşınabilir.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Servis Formları</h3>
        <p className="text-xs text-slate-400 mt-0.5">Bu mağazaya ait servis formları burada görüntülenir.</p>
      </div>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</p>
      )}

      <div className="space-y-2">
        {docs.map((doc) => {
          const ext = doc.original_name.split(".").pop()?.toUpperCase() ?? "";
          return (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 hover:border-slate-200 group transition-colors">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 truncate">{doc.original_name}</p>
                  {ext && (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
                      ext === "PDF"  ? "bg-red-50 text-red-600"
                      : ext === "XLSX" || ext === "XLS" ? "bg-green-50 text-green-600"
                      : "bg-slate-100 text-slate-500"
                    }`}>{ext}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                  <span>{doc.is_archive ? "Genel Arşiv" : "Mağaza Kartı"}</span>
                  <span className="text-slate-200">·</span>
                  <span>{fmtBytes(doc.file_size_bytes)}</span>
                  <span className="text-slate-200">·</span>
                  <span>{new Date(doc.created_at).toLocaleDateString("tr-TR")}</span>
                  {doc.uploaded_by_name && (
                    <><span className="text-slate-200">·</span><span>{doc.uploaded_by_name}</span></>
                  )}
                </div>
              </div>
              {/* Çerçevesiz tek "≡" — dokunmatikte de görünür (eskiden yalnızca hover'da çıkıyordu;
                  "İndir" da aslında yalnızca açıyordu). */}
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
    </div>
  );
}
