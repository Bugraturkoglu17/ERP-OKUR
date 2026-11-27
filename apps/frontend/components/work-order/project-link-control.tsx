"use client";

import Link from "next/link";
import { useState } from "react";
import { FolderKanban, Link2, Loader2, Unlink, X } from "lucide-react";
import { getRequestErrorMessage } from "@/lib/api";
import {
  linkWorkOrderToProject, listProjects, unlinkWorkOrderFromProject, type ProjectSummary,
} from "@/services/installationProjects";

type LinkableOrder = {
  id: string; project_id: string; status: string; assigned_to_user_id?: string | null;
  installation_project_id?: string | null; installation_project_name?: string | null;
  project_link_removable?: boolean;
};

const CLOSED = ["completed", "approved", "cancelled", "failed"];

/**
 * İş emri ↔ kurulum projesi köprüsü (iş emri detayında). Bağlıysa projeye giden etiket ve — malzemesi
 * düşülmemiş arıza/bakım işinde — "Bağı kaldır"; bağlı değilse yönetici aynı mağazanın aktif projesine bağlar.
 * İşlem sürerken pencere kilitlenir (çift tıklama / yarım işlem olmasın).
 */
export function ProjectLinkControl({ wo, canManage, projectHref, onChanged }: {
  wo: LinkableOrder; canManage: boolean; projectHref: (projectId: string) => string;
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"link" | "unlink" | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = !CLOSED.includes(wo.status);

  async function openLink() {
    setMode("link"); setError(""); setChoice(""); setProjects(null); setBusy(true);
    try {
      const rows = await listProjects("active");
      setProjects(rows.filter((project) => project.store_id === wo.project_id));
    } catch (reason) { setError(getRequestErrorMessage(reason, "Projeler yüklenemedi.")); setProjects([]); }
    finally { setBusy(false); }
  }

  function openUnlink() {
    setMode("unlink"); setError(""); setChoice("");
  }

  async function submit() {
    setBusy(true); setError("");
    try {
      if (mode === "link") await linkWorkOrderToProject(wo.id, choice);
      else await unlinkWorkOrderFromProject(wo.id);
      await onChanged();
      setMode(null);
    } catch (reason) {
      setError(getRequestErrorMessage(reason, mode === "link" ? "İş emri projeye bağlanamadı." : "Proje bağı kaldırılamadı."));
    } finally { setBusy(false); }
  }

  return (
    <>
      {wo.installation_project_id ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Link href={projectHref(wo.installation_project_id)} className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-100">
            <FolderKanban className="h-3 w-3" />Proje: {wo.installation_project_name ?? "—"}
          </Link>
          {canManage && wo.project_link_removable && (
            <button type="button" onClick={openUnlink} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-red-700">
              <Unlink className="h-3 w-3" />Bağı kaldır
            </button>
          )}
        </div>
      ) : canManage && open ? (
        <button type="button" onClick={() => void openLink()} className="mt-1 inline-flex items-center gap-1 rounded-md border border-dashed border-teal-300 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-50">
          <Link2 className="h-3 w-3" />Projeye bağla
        </button>
      ) : null}

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={mode === "link" ? "Projeye bağla" : "Proje bağını kaldır"}>
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl">
            {busy && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            )}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">{mode === "link" ? "Projeye bağla" : "Proje bağını kaldır"}</h2>
              <button type="button" onClick={() => setMode(null)} disabled={busy} aria-label="Kapat" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              {mode === "link" ? (
                projects === null ? null : projects.length === 0 ? (
                  <p className="text-slate-500">Bu mağazada devam eden proje yok.</p>
                ) : (
                  <>
                    <p className="text-slate-600">Bağlanınca malzeme yine çalışanın cep deposundan düşer; tutarı projenin gerçekleşen maliyetine eklenir.</p>
                    <ul className="space-y-1.5">
                      {projects.map((project) => (
                        <li key={project.id}>
                          <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 ${choice === project.id ? "border-teal-500 bg-teal-50/60" : "border-slate-200 hover:border-slate-300"}`}>
                            <input type="radio" name="project" value={project.id} checked={choice === project.id} onChange={() => setChoice(project.id)} className="mt-1 accent-teal-600" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-900">{project.name}</span>
                              <span className="block text-[11px] text-slate-500">{project.project_type_label} · {project.current_stage ?? "—"}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )
              ) : (
                <>
                  <p className="text-slate-600">Bağ kaldırılınca işin malzeme tutarı projenin maliyetine yazılmaz; cep depo değişmez.</p>
                </>
              )}
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button type="button" onClick={() => setMode(null)} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">Vazgeç</button>
              <button type="button" onClick={() => void submit()}
                disabled={busy || (mode === "link" && !choice)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${mode === "link" ? "bg-teal-700 hover:bg-teal-800" : "bg-red-600 hover:bg-red-700"}`}>
                {mode === "link" ? "Bağla" : "Bağı kaldır"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
