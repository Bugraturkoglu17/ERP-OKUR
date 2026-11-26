"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Circle, Clock, FileText, Loader2, Plus, Send, Upload } from "lucide-react";
import { getRequestErrorMessage } from "@/lib/api";
import { uploadFormData } from "@/lib/upload";
import { formatQuantity } from "@/lib/quantity";
import { formatServerDate, formatServerDateTime } from "@/lib/utils";
import { MaterialTitle } from "@/components/retail-stock/material-picker";
import { BackLink } from "@/components/ui/back-link";
import { ProductionNumbersCard } from "@/components/installation-projects/project-extras";
import { STATUS_LABEL, normalizeStatus } from "@/services/managerWorkOrders";
import {
  addChecklistItem, getStageTask, projectDocumentUrl, setChecklistItem, updateStage, type StageTask,
} from "@/services/installationProjects";

// Aşamaya göre önerilen belge türü (sorumlunun en sık yükleyeceği belge).
const SUGGESTED_DOC: Record<string, string> = {
  kesif: "kesif_raporu", teklif: "teklif", onay: "sozlesme", montaj_test: "test_formu", teslim: "kabul_tutanagi",
};

export default function ProjectTaskPage() {
  const { stageId } = useParams<{ stageId: string }>();
  const [task, setTask] = useState<StageTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [note, setNote] = useState("");
  const [newItem, setNewItem] = useState("");
  const [docType, setDocType] = useState("diger");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const load = useCallback(async () => {
    const data = await getStageTask(stageId);
    setTask(data);
    setNote(data.stage.note ?? "");
    setDocType((current) => (current === "diger" ? SUGGESTED_DOC[data.stage.code] ?? "fotograf" : current));
  }, [stageId]);

  useEffect(() => {
    load().catch((reason) => setError(getRequestErrorMessage(reason, "Görev yüklenemedi."))).finally(() => setLoading(false));
  }, [load]);

  async function run(action: () => Promise<unknown>, fallback: string, ok = "") {
    setBusy(true); setError(""); setSuccess("");
    try { await action(); await load(); if (ok) setSuccess(ok); } catch (reason) { setError(getRequestErrorMessage(reason, fallback)); } finally { setBusy(false); }
  }

  async function upload() {
    if (!task || !file) return;
    const form = new FormData();
    form.append("doc_type", docType);
    form.append("stage_id", task.stage.id);
    form.append("file", file);
    setError(""); setProgress(0);
    try {
      await uploadFormData(projectDocumentUrl(task.project.id), { formData: form, onProgress: setProgress });
      setFile(null); await load(); setSuccess("Belge yüklendi.");
    } catch (reason) { setError(getRequestErrorMessage(reason, "Belge yüklenemedi.")); } finally { setProgress(null); }
  }

  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Yükleniyor</div>;
  if (!task) return <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error || "Görev bulunamadı."}</div>;

  const { stage, project } = task;
  // "Adımı Tamamla" daima açık: sırası gelmemiş adım da tamamlanabilir.
  const open = project.status === "active" && stage.status !== "completed";
  const locked = project.status !== "active" || stage.status === "completed";
  const pending = Boolean(stage.approval_requested_at);
  const stageDocs = task.documents.filter((d) => d.stage_id === stage.id);
  const planned = task.materials.filter((m) => Number(m.planned_quantity) > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink fallbackHref="/user/proje-gorevleri" fallbackLabel="Proje Görevlerim" />
      <header>
        <p className="text-xs font-semibold text-slate-400">{project.name} · {project.project_type_label}{project.store ? ` · ${project.store.name}` : ""}</p>
        {project.is_member && <Link href={`/user/projeler/${project.id}`} className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline">Projenin tamamını aç</Link>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{stage.order}. {stage.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {stage.status === "completed" ? `Tamamlandı · ${formatServerDateTime(stage.completed_at)}` : stage.status === "in_progress" ? "Sıra sizde" : "Önceki aşama kapanınca başlar"}
          {stage.planned_end ? ` · Planlanan bitiş: ${formatServerDate(stage.planned_end)}` : ""}
        </p>
      </header>

      <ol className="flex flex-wrap gap-1.5">{task.stages.map((s) => (
        <li key={s.order} className={`rounded-lg px-2 py-1 text-[11px] font-medium ${s.status === "completed" ? "bg-emerald-50 text-emerald-700" : s.order === stage.order ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{s.status === "completed" && <Check className="mr-0.5 inline h-3 w-3" />}{s.order}. {s.name}</li>
      ))}</ol>

      {pending && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><Clock className="mt-0.5 h-4 w-4 shrink-0" />Kapanış {formatServerDateTime(stage.approval_requested_at)} tarihinde yöneticiye onaya gönderildi. Yönetici onaylayınca proje tamamlanacak.</div>}
      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      {stage.code === "uretim" && (
        <ProductionNumbersCard projectId={project.id} numbers={task.production_numbers} canEnter={project.status === "active"}
          onChanged={load} onError={setError} />
      )}

      <section className="erp-section-card">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Kontrol listesi</h2></div>
        <div className="space-y-1.5 p-5">
          {stage.checklist.map((item) => (
            <label key={item.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${item.is_done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200"}`}>
              <input type="checkbox" disabled={locked || busy} checked={item.is_done} onChange={(e) => void run(() => setChecklistItem(item.id, e.target.checked), "Madde güncellenemedi.")} className="mt-0.5 h-5 w-5 accent-emerald-600" />
              <span className={item.is_done ? "text-slate-500 line-through" : "text-slate-800"}>{item.label}</span>
            </label>
          ))}
          {!locked && (
            <form className="flex gap-2 pt-1" onSubmit={(e) => { e.preventDefault(); if (newItem.trim().length < 2) return; void run(() => addChecklistItem(stage.id, newItem.trim()), "Madde eklenemedi.").then(() => setNewItem("")); }}>
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Madde ekle" maxLength={255} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button type="submit" disabled={busy || newItem.trim().length < 2} aria-label="Madde ekle" className="rounded-lg border border-slate-200 px-3 text-slate-600 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
            </form>
          )}
        </div>
      </section>

      <section className="erp-section-card">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Belgeler ve fotoğraflar</h2></div>
        <div className="space-y-3 p-5">
          {!locked && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
              <label className="text-xs font-semibold text-slate-600">Tür
                <select value={docType} onChange={(e) => setDocType(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm">
                  {Object.entries(task.doc_types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
              <label className="min-w-0 flex-1 basis-48 text-xs font-semibold text-slate-600">Dosya
                <input type="file" accept="image/*,.pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" /></label>
              <button type="button" disabled={!file || progress !== null} onClick={() => void upload()} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {progress !== null ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />%{progress}</> : <><Upload className="h-3.5 w-3.5" />Yükle</>}
              </button>
            </div>
          )}
          {stageDocs.length === 0 ? <p className="text-sm text-slate-500">Bu aşamaya henüz belge yüklenmedi.</p> : (
            <ul className="divide-y divide-slate-100">{stageDocs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-blue-700 hover:underline">{doc.file_name}</a> : <p className="truncate text-sm">{doc.file_name}</p>}
                  <p className="text-[11px] text-slate-400">{doc.doc_type_label} · {formatServerDateTime(doc.uploaded_at)}</p>
                </div>
              </li>
            ))}</ul>
          )}
        </div>
      </section>

      {(stage.code === "uretim" || stage.code === "kapanis") && planned.length > 0 && (
        <section className="erp-section-card">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Malzeme durumu<InfoHint text="Malzemeyi proje deposuna aktarma ve iade işlemlerini yönetici yapar." /></h2></div>
          <div className="overflow-x-auto p-5"><table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-[11px] font-semibold uppercase text-slate-400"><th className="py-1.5 pr-2">Malzeme</th><th className="px-2 text-right">Plan</th><th className="px-2 text-right">Depoda</th><th className="px-2 text-right">Kullanılan</th><th className="pl-2 text-right">Eksik</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{planned.map((m) => (
              <tr key={m.material_id}><td className="py-2 pr-2"><MaterialTitle sku={m.sku} name={m.name} spec={m.spec} /></td><td className="px-2 text-right tabular-nums">{formatQuantity(m.planned_quantity)} {m.unit}</td><td className="px-2 text-right tabular-nums">{formatQuantity(m.in_depot)}</td><td className="px-2 text-right tabular-nums">{formatQuantity(m.used)}</td><td className={`pl-2 text-right tabular-nums ${Number(m.missing) > 0 ? "font-semibold text-red-700" : "text-slate-400"}`}>{formatQuantity(m.missing)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {stage.code === "montaj_test" && task.work_orders.length > 0 && (
        <section className="erp-section-card">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Montaj iş emirleri</h2></div>
          <ul className="divide-y divide-slate-100">{task.work_orders.map((wo) => (
            <li key={wo.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"><span className="truncate">{wo.title}<span className="block text-[11px] text-slate-400">{wo.assigned_to_name ?? "Atanmadı"}</span></span><span className="whitespace-nowrap text-xs font-semibold text-slate-600">{STATUS_LABEL[normalizeStatus(wo.status)]}</span></li>
          ))}</ul>
        </section>
      )}

      <section className="erp-section-card">
        <div className="space-y-4 p-5">
          <div>
            <p className="text-xs font-semibold text-slate-600">Aşama şartları (tamamlamayı engellemez)</p>
            <ul className="mt-2 space-y-1.5">{stage.requirements.map((req) => (
              <li key={req.label} className={`flex items-start gap-2 text-sm ${req.ok ? "text-emerald-700" : "text-slate-600"}`}>{req.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}{req.label}</li>
            ))}</ul>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Not
            <textarea disabled={locked} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if ((stage.note ?? "") !== note) void run(() => updateStage(stage.id, { note }), "Not kaydedilemedi."); }} rows={3} placeholder="Ölçüler, müşteri talebi, dikkat edilecekler" className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" /></label>
          {open && !pending && (stage.needs_approval ? (
            <button type="button" disabled={busy} onClick={() => void run(() => updateStage(stage.id, { action: "request_approval" }), "Onaya gönderilemedi.", "Kapanış yöneticiye onaya gönderildi.")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Kapanışı Yöneticiye Onaya Gönder
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void run(() => updateStage(stage.id, { action: "complete" }), "Aşama tamamlanamadı.", "Adım tamamlandı.")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Adımı Tamamla
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
