"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, Circle, ClipboardList, FileText, Loader2,
  Package, Plus, Trash2, Upload, X, XCircle,
} from "lucide-react";
import { apiGet, getRequestErrorMessage } from "@/lib/api";
import { uploadFormData } from "@/lib/upload";
import { formatQuantity } from "@/lib/quantity";
import { formatServerDate, formatServerDateTime } from "@/lib/utils";
import { MaterialPicker, MaterialTitle } from "@/components/retail-stock/material-picker";
import { STATUS_LABEL, normalizeStatus } from "@/services/managerWorkOrders";
import {
  PROJECT_STATUS_LABEL, addChecklistItem, deleteProjectDocument, getProject, projectDocumentUrl,
  saveProjectMaterials, setChecklistItem, updateProject, updateStage,
  type ProjectDetail, type ProjectMaterial, type ProjectStage,
} from "@/services/installationProjects";

type UserRow = { id: string; full_name: string; email: string; is_active: boolean };
type CatalogItem = { id: string; sku: string; name: string; spec?: string | null; brand?: string | null; unit: string };
type MaterialRow = { key: string; materialId: string; quantity: string };

let rowSeed = 0;
const money = (value?: string | number | null) => Number(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const qty = (value: string | number) => formatQuantity(value);

function StageStepper({ stages, selectedId, onSelect }: { stages: ProjectStage[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
      {stages.map((stage) => {
        const done = stage.status === "completed";
        const active = stage.status === "in_progress";
        const late = !done && stage.planned_end && new Date(stage.planned_end) < new Date(new Date().toDateString());
        return (
          <li key={stage.id}>
            <button type="button" onClick={() => onSelect(stage.id)}
              className={`flex h-full w-full flex-col items-start gap-1 rounded-xl border px-2.5 py-2 text-left transition ${selectedId === stage.id ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-300"} ${done ? "bg-emerald-50" : active ? "bg-blue-50" : "bg-white"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-emerald-600 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>{done ? <Check className="h-3 w-3" /> : stage.order}</span>
              <span className="text-[11px] font-semibold leading-tight text-slate-800">{stage.name}</span>
              {late && <span className="text-[10px] font-semibold text-red-700">Gecikti</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StagePanel({ stage, users, editable, onChanged, onError }: {
  stage: ProjectStage; users: UserRow[]; editable: boolean;
  onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const [newItem, setNewItem] = useState("");
  const [note, setNote] = useState(stage.note ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(stage.note ?? ""); setNewItem(""); }, [stage.id, stage.note]);
  const locked = !editable || stage.status === "completed";
  const pending = Boolean(stage.approval_requested_at);
  // Tarih alanı yazarken her tuşta kaydediyordu; "0002" gibi yarım yıllar kaydedilmesin.
  const validDate = (value: string) => !value || (Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true); onError("");
    try { await action(); await onChanged(); } catch (reason) { onError(getRequestErrorMessage(reason, fallback)); } finally { setBusy(false); }
  }

  return (
    <section className="erp-section-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-xs font-semibold text-slate-400">Aşama {stage.order} / 8</p>
          <h2 className="text-lg font-bold text-slate-950">{stage.name}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {stage.status === "completed" ? `Tamamlandı · ${formatServerDateTime(stage.completed_at)}` : stage.status === "in_progress" ? `Devam ediyor${stage.started_at ? ` · başladı ${formatServerDate(stage.started_at)}` : ""}` : "Henüz başlamadı (önceki aşama kapanınca başlar)"}
          </p>
        </div>
        {stage.status !== "completed" && editable && (
          <button type="button" disabled={busy || stage.status !== "in_progress"} onClick={() => void run(() => updateStage(stage.id, { action: "complete" }), "Aşama tamamlanamadı.")}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{pending ? "Onayla ve projeyi kapat" : "Aşamayı tamamla"}
          </button>
        )}
      </div>
      {pending && stage.status !== "completed" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          <span><strong>{stage.approval_requested_by_name ?? "Aşama sorumlusu"}</strong> kapanışı {formatServerDateTime(stage.approval_requested_at)} tarihinde onaya gönderdi.</span>
          {editable && (
            <button type="button" disabled={busy} onClick={() => { const reason = window.prompt("Ret nedeni (sorumluya bildirilecek):"); if (reason === null) return; void run(() => updateStage(stage.id, { action: "reject_approval", note: reason.trim() || null }), "Onay reddedilemedi."); }}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40">Reddet</button>
          )}
        </div>
      )}
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">Sorumlu
              <select disabled={locked || busy} value={stage.responsible_user_id ?? ""} onChange={(e) => void run(() => updateStage(stage.id, { responsible_user_id: e.target.value || null }), "Sorumlu kaydedilemedi.")}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50">
                <option value="">Atanmadı</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select></label>
            <label className="block text-xs font-semibold text-slate-600">Planlanan bitiş
              <input type="date" disabled={locked || busy} value={stage.planned_end?.slice(0, 10) ?? ""} min="2000-01-01" max="2100-12-31" onChange={(e) => { const v = e.target.value; if (validDate(v)) void run(() => updateStage(stage.id, { planned_end: v || null }), "Tarih kaydedilemedi."); }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" /></label>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600">Kontrol listesi</p>
            <ul className="mt-2 space-y-1.5">
              {stage.checklist.map((item) => (
                <li key={item.id}>
                  <label className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${item.is_done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200"} ${locked ? "" : "cursor-pointer"}`}>
                    <input type="checkbox" disabled={locked || busy} checked={item.is_done} onChange={(e) => void run(() => setChecklistItem(item.id, e.target.checked), "Madde güncellenemedi.")} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                    <span className={item.is_done ? "text-slate-500 line-through" : "text-slate-800"}>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            {!locked && (
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newItem.trim().length < 2) return; void run(() => addChecklistItem(stage.id, newItem.trim()), "Madde eklenemedi."); }}>
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Yeni madde ekle" maxLength={255} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                <button type="submit" disabled={busy || newItem.trim().length < 2} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
              </form>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-600">Aşamanın kapanması için</p>
            <ul className="mt-2 space-y-1.5">
              {stage.requirements.map((req) => (
                <li key={req.label} className={`flex items-start gap-2 text-sm ${req.ok ? "text-emerald-700" : "text-slate-600"}`}>
                  {req.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}{req.label}
                </li>
              ))}
            </ul>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Not
            <textarea disabled={locked} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if ((stage.note ?? "") !== note) void run(() => updateStage(stage.id, { note }), "Not kaydedilemedi."); }}
              rows={3} placeholder="Bu aşamayla ilgili not" className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" /></label>
        </div>
      </div>
    </section>
  );
}

function DocumentsCard({ project, selectedStage, editable, onChanged, onError }: {
  project: ProjectDetail; selectedStage: ProjectStage | undefined; editable: boolean;
  onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const [docType, setDocType] = useState("kesif_raporu");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const stageNames = useMemo(() => Object.fromEntries(project.stages.map((s) => [s.id, s.name])), [project.stages]);

  async function upload() {
    if (!file) return;
    const form = new FormData();
    form.append("doc_type", docType);
    if (selectedStage) form.append("stage_id", selectedStage.id);
    form.append("file", file);
    onError(""); setProgress(0);
    try {
      await uploadFormData(projectDocumentUrl(project.id), { formData: form, onProgress: setProgress });
      setFile(null); await onChanged();
    } catch (reason) { onError(getRequestErrorMessage(reason, "Belge yüklenemedi.")); } finally { setProgress(null); }
  }

  async function remove(id: string) {
    if (!window.confirm("Bu belge projeden kaldırılsın mı?")) return;
    try { await deleteProjectDocument(id); await onChanged(); } catch (reason) { onError(getRequestErrorMessage(reason, "Belge kaldırılamadı.")); }
  }

  return (
    <section className="erp-section-card">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div><h2 className="text-sm font-semibold text-slate-900">Belgeler</h2><p className="mt-1 text-xs text-slate-400">Keşif raporu, çizim, teklif, sözleşme, test formu, kabul tutanağı.</p></div>
        <FileText className="h-4 w-4 text-slate-300" />
      </div>
      <div className="space-y-4 p-5">
        {editable && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
            <label className="text-xs font-semibold text-slate-600">Belge türü
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm">
                {Object.entries(project.doc_types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
            <label className="min-w-0 flex-1 basis-48 text-xs font-semibold text-slate-600">Dosya
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.dwg,.dxf,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" /></label>
            <button type="button" disabled={!file || progress !== null} onClick={() => void upload()} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {progress !== null ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />%{progress}</> : <><Upload className="h-3.5 w-3.5" />Yükle</>}
            </button>
            {selectedStage && <p className="w-full text-[11px] text-slate-500">Belge &quot;{selectedStage.name}&quot; aşamasına bağlanır. En fazla 25 MB.</p>}
          </div>
        )}
        {project.documents.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Henüz belge yüklenmedi.</p> : (
          <ul className="divide-y divide-slate-100">
            {project.documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-blue-700 hover:underline">{doc.file_name}</a> : <p className="truncate text-sm font-medium">{doc.file_name}</p>}
                  <p className="truncate text-[11px] text-slate-400">{doc.doc_type_label}{doc.stage_id ? ` · ${stageNames[doc.stage_id] ?? ""}` : ""} · {doc.uploaded_by_name ?? ""} · {formatServerDateTime(doc.uploaded_at)}</p>
                </div>
                {editable && <button type="button" onClick={() => void remove(doc.id)} aria-label="Belgeyi kaldır" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MaterialsCard({ project, catalog, editable, onChanged, onError }: {
  project: ProjectDetail; catalog: CatalogItem[]; editable: boolean;
  onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [saving, setSaving] = useState(false);
  const planned = project.materials.filter((m) => Number(m.planned_quantity) > 0);
  const missingCount = planned.filter((m) => Number(m.missing) > 0).length;

  function startEdit() {
    setRows(planned.map((m) => ({ key: `r${++rowSeed}`, materialId: m.material_id, quantity: qty(m.planned_quantity) })));
    setEditing(true);
  }

  async function save() {
    const lines = rows.filter((r) => r.materialId && r.quantity.trim());
    for (const r of lines) {
      if (!/^\d+([.,]\d{1,3})?$/.test(r.quantity.trim()) || Number(r.quantity.replace(",", ".")) <= 0) { onError("Miktarlar sıfırdan büyük sayı olmalı (örn. 5 veya 2,5)."); return; }
    }
    setSaving(true); onError("");
    try {
      await saveProjectMaterials(project.id, lines.map((r) => ({ material_id: r.materialId, planned_quantity: r.quantity.trim().replace(",", ".") })));
      setEditing(false); await onChanged();
    } catch (reason) { onError(getRequestErrorMessage(reason, "Malzeme listesi kaydedilemedi.")); } finally { setSaving(false); }
  }

  const chosen = new Set(rows.map((r) => r.materialId).filter(Boolean));
  const options = catalog.map((m) => ({ id: m.id, name: m.name, spec: m.spec, brand: m.brand, sku: m.sku, hint: m.unit }));

  return (
    <section className="erp-section-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Malzeme listesi</h2>
          <p className="mt-1 text-xs text-slate-400">Planlanan malzeme, proje deposundaki miktar ve montajda kullanılan.{missingCount > 0 ? ` ${missingCount} kalem eksik.` : ""}</p>
        </div>
        {editable && !editing && <button type="button" onClick={startEdit} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Listeyi düzenle</button>}
      </div>
      <div className="p-5">
        {editing ? (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><MaterialPicker compact value={row.materialId} options={options} disabledIds={chosen}
                  onChange={(id) => setRows((cur) => cur.map((r) => r.key === row.key ? { ...r, materialId: id } : r))} /></div>
                <input inputMode="decimal" value={row.quantity} placeholder="Miktar" aria-label="Planlanan miktar"
                  onChange={(e) => setRows((cur) => cur.map((r) => r.key === row.key ? { ...r, quantity: e.target.value } : r))}
                  className="w-20 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm" />
                <button type="button" aria-label="Satırı kaldır" onClick={() => setRows((cur) => cur.filter((r) => r.key !== row.key))} className="rounded-lg p-1.5 text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <button type="button" onClick={() => setRows((cur) => [...cur, { key: `r${++rowSeed}`, materialId: "", quantity: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"><Plus className="h-3.5 w-3.5" />Malzeme ekle</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">Vazgeç</button>
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
              </div>
            </div>
          </div>
        ) : project.materials.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Malzeme listesi henüz girilmedi. Projelendirme aşamasında katalogdan malzeme ekleyin.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Malzeme</th><th className="px-2 py-2 text-right">Planlanan</th><th className="px-2 py-2 text-right">Proje deposu</th><th className="px-2 py-2 text-right">Kullanılan</th><th className="py-2 pl-2 text-right">Eksik</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {project.materials.map((m: ProjectMaterial) => (
                  <tr key={m.material_id}>
                    <td className="py-2 pr-3"><MaterialTitle sku={m.sku} name={m.name} spec={m.spec} className="text-sm" />{m.note && <span className="block text-[11px] text-slate-400">{m.note}</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{qty(m.planned_quantity)} {m.unit}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{qty(m.in_depot)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{qty(m.used)}</td>
                    <td className={`py-2 pl-2 text-right tabular-nums ${Number(m.missing) > 0 ? "font-semibold text-red-700" : "text-slate-400"}`}>{qty(m.missing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!editing && editable && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Malzemeyi projeye ayırmak için <Link href="/manager/depo-stok" className="font-semibold underline">Depo &amp; Stok → Aktarım</Link> ekranında &quot;Nereye&quot; olarak <b>Proje · {project.name}</b> deposunu seçin. Proje bitince kalan malzeme aynı yoldan ana depoya iade edilir.
          </p>
        )}
      </div>
    </section>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await getProject(id);
    setProject(data);
    setSelectedId((current) => current || (data.stages.find((s) => s.status !== "completed") ?? data.stages[data.stages.length - 1]).id);
  }, [id]);

  useEffect(() => {
    Promise.all([
      load(),
      apiGet<UserRow[]>("/auth/users").then((rows) => setUsers((rows ?? []).filter((u) => u.is_active))).catch(() => undefined),
      apiGet<CatalogItem[]>("/retail-stock/materials", { limit: 2000 }).then(setCatalog).catch(() => undefined),
    ]).catch((reason) => setError(getRequestErrorMessage(reason, "Proje yüklenemedi."))).finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    try { await load(); } catch (reason) { setError(getRequestErrorMessage(reason, "Proje yenilenemedi.")); }
  }, [load]);

  async function cancelProject() {
    if (!project || !window.confirm("Proje iptal edilsin mi? İptal edilen proje yeniden açılamaz.")) return;
    setError("");
    try { await updateProject(project.id, { status: "cancelled" }); await refresh(); } catch (reason) { setError(getRequestErrorMessage(reason, "Proje iptal edilemedi.")); }
  }

  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Proje yükleniyor</div>;
  if (!project) return <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error || "Proje bulunamadı."}</div>;

  const editable = project.status === "active";
  const selected = project.stages.find((s) => s.id === selectedId) ?? project.stages[0];
  const done = project.stages.filter((s) => s.status === "completed").length;
  const openWorkOrders = project.work_orders.filter((wo) => !["completed", "cancelled"].includes(normalizeStatus(wo.status))).length;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Link href="/manager/projeler" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Projeler</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">{project.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${project.status === "active" ? "bg-blue-50 text-blue-700" : project.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{PROJECT_STATUS_LABEL[project.status]}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {project.store ? <Link href={`/manager/magaza-karti/${project.store.id}`} className="hover:underline">{project.store.name}{project.store.no ? ` · ${project.store.no}` : ""}</Link> : "Yer bilgisi yok"}
            {project.manager_name ? ` · Sorumlu: ${project.manager_name}` : ""}
          </p>
          {project.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{project.description}</p>}
        </div>
        {editable && <button type="button" onClick={() => void cancelProject()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"><XCircle className="h-4 w-4" />Projeyi iptal et</button>}
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "İlerleme", value: `${done}/8 aşama` },
          { label: "Hedef bitiş", value: formatServerDate(project.target_date) },
          { label: "Bütçe / teklif", value: project.budget ? `₺${money(project.budget)}` : "—" },
          { label: "Malzeme maliyeti (plan / gerçek)", value: `₺${money(project.planned_cost)} / ₺${money(project.used_cost)}` },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-medium text-slate-500">{tile.label}</p>
            <p className="mt-0.5 truncate text-base font-bold tabular-nums text-slate-950">{tile.value}</p>
          </div>
        ))}
      </section>

      <StageStepper stages={project.stages} selectedId={selected.id} onSelect={setSelectedId} />

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <StagePanel stage={selected} users={users} editable={editable} onChanged={refresh} onError={setError} />

      <div className="grid gap-5 xl:grid-cols-2">
        <MaterialsCard project={project} catalog={catalog} editable={editable} onChanged={refresh} onError={setError} />
        <section className="erp-section-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><h2 className="text-sm font-semibold text-slate-900">İş emirleri</h2><p className="mt-1 text-xs text-slate-400">Montaj ve test işleri; teknisyenler bunları normal iş emri ekranından yürütür.{openWorkOrders ? ` ${openWorkOrders} açık iş.` : ""}</p></div>
            {editable && <Link href={`/manager/is-emirleri/yeni?proje=${project.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"><Plus className="h-3.5 w-3.5" />İş emri ekle</Link>}
          </div>
          {project.work_orders.length === 0 ? <div className="px-5 py-10 text-center"><ClipboardList className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm text-slate-500">Henüz iş emri yok.</p></div> : (
            <ul className="divide-y divide-slate-100">
              {project.work_orders.map((wo) => {
                const status = normalizeStatus(wo.status);
                return (
                  <li key={wo.id}>
                    <Link href={`/manager/is-emirleri/${wo.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <Package className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{wo.title}</p><p className="truncate text-[11px] text-slate-400">{wo.assigned_to_name ?? "Atanmadı"} · Verildi: {formatServerDateTime(wo.created_at)}</p></div>
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "cancelled" ? "bg-slate-100 text-slate-500" : status === "in_progress" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{STATUS_LABEL[status]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <DocumentsCard project={project} selectedStage={editable ? selected : undefined} editable={editable} onChanged={refresh} onError={setError} />
    </div>
  );
}
