"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  AlertCircle, ArrowDown, ArrowRight, ArrowUp, Check, CheckCircle2, ChevronRight, Circle, ClipboardList, Download, FileSpreadsheet, FileText, History, Link2, ListChecks, Loader2,
  Package, Plus, Trash2, X, XCircle,
} from "lucide-react";
import { apiGet, getRequestErrorMessage } from "@/lib/api";
import { formatQuantity } from "@/lib/quantity";
import { DocumentRow, StageFiles } from "@/components/installation-projects/stage-files";
import { formatServerDate, formatServerDateTime } from "@/lib/utils";
import { MaterialPicker, MaterialTitle } from "@/components/retail-stock/material-picker";
import { downloadMaterialTemplate, parseMaterialExcel } from "@/components/installation-projects/material-excel";
import { SubcontractorAssignmentBox } from "@/components/subcontractors/subcontractor-assignment";
import { BackLink } from "@/components/ui/back-link";
// shadcn/ui (pilot): yalnız hafif bileşenler; mevcut components/ui dosyalarına dokunulmaz.
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent, CardHeader as UiCardHeader, CardTitle } from "@/components/shadcn/card";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Textarea } from "@/components/shadcn/textarea";
import { cn } from "@/lib/utils";
import { BillingCard, BudgetCard, CostsCard, MemberChecklist, ProductionNumbersCard, RealProfitCard, SalePriceCard, TargetCostsCard } from "@/components/installation-projects/project-extras";
import { STATUS_LABEL, normalizeStatus } from "@/services/managerWorkOrders";
import {
  PROJECT_STATUS_LABEL, getChecklistTemplates, getLinkableWorkOrders, getProject, getProjectStageEvents,
  linkWorkOrderToProject, saveChecklistTemplates, saveProjectMaterials, saveProjectMembers, setChecklistItem, setPhaseDue, updateProject, updateStage,
  type ChecklistTemplateStage, type LinkableWorkOrder, type ProjectDetail, type ProjectMaterial, type ProjectStage, type StageEvent,
} from "@/services/installationProjects";

type UserRow = { id: string; full_name: string; email: string; is_active: boolean };
type CatalogItem = { id: string; sku: string; name: string; spec?: string | null; brand?: string | null; unit: string };
type MaterialRow = { key: string; materialId: string; quantity: string };

let rowSeed = 0;
const money = (value?: string | number | null) => Number(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const qty = (value: string | number) => formatQuantity(value);

type PhaseView = { code: string; name: string; order: number; steps: ProjectStage[]; status: "completed" | "in_progress" | "planned"; late: boolean };

// Termin yalnız Üretim ve Montaj ana aşamasındadır; diğer adımların bitişi "Adımı tamamla" anıdır.
const DUE_PHASE = "uretim_montaj";
const isLate = (stage: ProjectStage) =>
  stage.phase === DUE_PHASE && stage.status !== "completed"
  && Boolean(stage.planned_end && new Date(stage.planned_end) < new Date(new Date().toDateString()));
/** Üretim ve Montaj termini (aşamanın adımlarına aynı tarih yazılır). */
const phaseDue = (project: ProjectDetail) =>
  project.stages.find((s) => s.phase === DUE_PHASE && s.status !== "completed" && s.planned_end)?.planned_end
  ?? project.stages.find((s) => s.phase === DUE_PHASE && s.planned_end)?.planned_end ?? null;

/** Ana aşamalar ve adımları: ana aşama, bütün adımları bitince tamamlanmış sayılır. */
function phasesOf(project: ProjectDetail): PhaseView[] {
  return project.phases.map((phase, index) => {
    const steps = project.stages.filter((s) => s.phase === phase.code);
    const status = steps.length > 0 && steps.every((s) => s.status === "completed") ? "completed"
      : steps.some((s) => s.status !== "planned") ? "in_progress" : "planned";
    return { ...phase, order: index + 1, steps, status, late: steps.some(isLate) };
  });
}

const BALLOON = {
  completed: "bg-emerald-600 text-white", in_progress: "bg-blue-600 text-white", planned: "bg-slate-100 text-slate-500",
};

/** Üst şerit: ana aşamalar (Aşamalar sekmesi; seçilebilir). */
function PhaseStrip({ phases, selectedCode, onSelect }: { phases: PhaseView[]; selectedCode: string; onSelect: (phase: PhaseView) => void }) {
  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Ana aşamalar">
      {phases.map((phase) => {
        const done = phase.steps.filter((s) => s.status === "completed").length;
        const selected = phase.code === selectedCode;
        return (
          <li key={phase.code}>
            <button type="button" onClick={() => onSelect(phase)} aria-current={selected ? "step" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${selected ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200 hover:border-slate-300"} ${phase.status === "completed" ? "bg-emerald-50/60" : phase.status === "in_progress" ? "bg-blue-50/60" : "bg-white"}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${BALLOON[phase.status]}`}>
                {phase.status === "completed" ? <Check className="h-4 w-4" /> : phase.order}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{phase.name}</span>
                <span className={`block text-xs ${phase.late ? "font-medium text-red-700" : "text-slate-500"}`}>
                  {phase.steps.length > 1 ? `${done}/${phase.steps.length} adım` : phase.status === "completed" ? "Tamamlandı" : phase.status === "in_progress" ? "Devam ediyor" : "Başlamadı"}{phase.late ? " · gecikti" : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Seçili ana aşamanın adımları (birden çok adım varsa): her adım ayrı tamamlanır. */
function StepTabs({ steps, selectedId, onSelect }: { steps: ProjectStage[]; selectedId: string; onSelect: (id: string) => void }) {
  if (steps.length < 2) return null;
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Adımlar">
      {steps.map((step, index) => {
        const selected = step.id === selectedId;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && <span className="h-px w-6 bg-slate-300" aria-hidden="true" />}
            <button type="button" onClick={() => onSelect(step.id)} aria-current={selected ? "step" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${selected ? "border-blue-600 bg-white text-blue-800 ring-1 ring-blue-600" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${BALLOON[step.status]}`}>
                {step.status === "completed" ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {step.name}
              {isLate(step) && <span className="text-xs font-medium text-red-700">gecikti</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StagePanel({ stage, phase, projectId, due, users, editable, canManage, files, onChanged, onError }: {
  stage: ProjectStage; phase: PhaseView; projectId: string;
  /** Üretim ve Montaj termini (yalnız o ana aşamada gösterilir ve düzenlenir). */
  due: string | null;
  users: UserRow[]; editable: boolean;
  /** Yönetici: taşeron seçimi ve tamamlanan adımda taşeron puanı. */
  canManage: boolean;
  /** Aşamanın dosya yükleme alanı ve dosya listesi (sağ sütunda). */
  files?: ReactNode;
  onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const [note, setNote] = useState(stage.note ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(stage.note ?? ""); }, [stage.id, stage.note]);
  const locked = !editable || stage.status === "completed";
  const pending = Boolean(stage.approval_requested_at);
  const hasDue = phase.code === DUE_PHASE;
  const late = hasDue && isLate(stage);
  // Tarih alanı yazarken her tuşta kaydediyordu; "0002" gibi yarım yıllar kaydedilmesin.
  const validDate = (value: string) => !value || (Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true); onError("");
    try { await action(); await onChanged(); } catch (reason) { onError(getRequestErrorMessage(reason, fallback)); } finally { setBusy(false); }
  }

  return (
    <Card className="relative">
      {/* Kayıt sürerken panel kilitlenir: çift tıklama ve yarım işlem olmasın. */}
      {busy && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-white/60"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>}
      <UiCardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 px-5 py-4">
        <div>
          {/* Tek adımlı ana aşamada (Keşif) ad iki kez yazılmasın: üst satır yalnız çok adımlı aşamada. */}
          {phase.steps.length > 1 && (
            <p className="text-xs font-medium text-muted-foreground">
              {phase.name} · Adım {phase.steps.findIndex((s) => s.id === stage.id) + 1} / {phase.steps.length}
            </p>
          )}
          <CardTitle className={phase.steps.length > 1 ? "mt-1 text-lg" : "text-lg"}>{stage.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {stage.status === "completed" ? `Tamamlandı · ${formatServerDateTime(stage.completed_at)}` : stage.status === "in_progress" ? `Devam ediyor${stage.started_at ? ` · başladı ${formatServerDate(stage.started_at)}` : ""}` : "Henüz başlamadı (önceki adım tamamlanınca başlar)"}
          </p>
        </div>
        {stage.status !== "completed" && editable && (
          <Button disabled={busy} onClick={() => void run(() => updateStage(stage.id, { action: "complete" }), "Adım tamamlanamadı.")}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{pending ? "Onayla ve Projeyi Kapat" : stage.code === "kapanis" ? "Projeyi Kapat" : "Adımı Tamamla"}
          </Button>
        )}
      </UiCardHeader>
      <Separator />
      {pending && stage.status !== "completed" && (
        <Alert className="rounded-none border-x-0 border-t-0 border-amber-200 bg-amber-50 text-amber-900">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span><strong>{stage.approval_requested_by_name ?? "Aşama sorumlusu"}</strong> kapanışı {formatServerDateTime(stage.approval_requested_at)} tarihinde onaya gönderdi.</span>
            {editable && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => { const reason = window.prompt("Ret nedeni (sorumluya bildirilecek):"); if (reason === null) return; void run(() => updateStage(stage.id, { action: "reject_approval", note: reason.trim() || null }), "Onay reddedilemedi."); }}>Reddet</Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <CardContent className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`sorumlu-${stage.id}`} className="text-xs text-muted-foreground">Sorumlu</Label>
              <NativeSelect id={`sorumlu-${stage.id}`} disabled={locked || busy} value={stage.responsible_user_id ?? ""}
                onChange={(e) => void run(() => updateStage(stage.id, { responsible_user_id: e.target.value || null }), "Sorumlu kaydedilemedi.")}>
                <option value="">Atanmadı</option>
                {/* Kullanıcı listesini göremeyen (projeye atanmış saha kullanıcısı) için sorumlunun adı yine görünsün. */}
                {stage.responsible_user_id && !users.some((u) => u.id === stage.responsible_user_id) && <option value={stage.responsible_user_id}>{stage.responsible_name ?? "Sorumlu"}</option>}
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </NativeSelect>
            </div>
            {/* Termin yalnız Üretim ve Montaj'da: aşamanın iki adımına aynı tarih yazılır. Diğer adımlarda bitiş, "Adımı tamamla" anıdır. */}
            {hasDue && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`termin-${stage.id}`} className={cn("text-xs", late ? "text-red-700" : "text-muted-foreground")}>Termin (Üretim ve Montaj){late ? " · gecikti" : ""}</Label>
                <Input id={`termin-${stage.id}`} type="date" disabled={locked || busy} value={due?.slice(0, 10) ?? ""} min="2000-01-01" max="2100-12-31"
                  onChange={(e) => { const v = e.target.value; if (validDate(v)) void run(() => setPhaseDue(projectId, DUE_PHASE, v || null), "Termin kaydedilemedi."); }} />
              </div>
            )}
            {/* Taşeron: iş yükü ve puan taşeron kartında görünür; puan adım tamamlanınca verilir. */}
            {canManage && <SubcontractorAssignmentBox target={{ stage_id: stage.id }} editable={canManage} doneHint={stage.status} />}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Kontrol listesi</p>
            {stage.checklist.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">Bu adımda kontrol maddesi yok.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {stage.checklist.map((item) => (
                  <li key={item.id} className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${item.is_done ? "border-emerald-200 bg-emerald-50/60" : ""}`}>
                    <Checkbox id={`madde-${item.id}`} disabled={locked || busy} checked={item.is_done} className="mt-0.5"
                      onCheckedChange={(checked) => void run(() => setChecklistItem(item.id, checked === true), "Madde güncellenemedi.")} />
                    <Label htmlFor={`madde-${item.id}`} className={`font-normal leading-snug ${item.is_done ? "text-muted-foreground line-through" : ""} ${locked ? "" : "cursor-pointer"}`}>{item.label}</Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-md bg-muted/60 p-4">
            <p className="text-xs font-medium text-muted-foreground">Adım şartları (tamamlamayı engellemez)</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {stage.requirements.map((req) => (
                <li key={req.label} className={`flex items-start gap-2 text-sm ${req.ok ? "text-emerald-700" : "text-slate-600"}`}>
                  {req.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}{req.label}
                </li>
              ))}
            </ul>
          </div>
          {files}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`not-${stage.id}`} className="text-xs text-muted-foreground">Not</Label>
            <Textarea id={`not-${stage.id}`} disabled={locked} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Bu adımla ilgili not" className="resize-none"
              onBlur={() => { if ((stage.note ?? "") !== note) void run(() => updateStage(stage.id, { note }), "Not kaydedilemedi."); }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MaterialsCard({ project, catalog, editable, onChanged, onError }: {
  project: ProjectDetail; catalog: CatalogItem[]; editable: boolean;
  onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importNote, setImportNote] = useState<{ text: string; warn: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const planned = project.materials.filter((m) => Number(m.planned_quantity) > 0);
  const missingCount = planned.filter((m) => Number(m.missing) > 0).length;
  const skuById = new Map(catalog.map((m) => [m.id, m.sku]));

  const plannedRows = () => planned.map((m) => ({ key: `r${++rowSeed}`, materialId: m.material_id, quantity: qty(m.planned_quantity) }));

  function startEdit() {
    setRows(plannedRows());
    setImportNote(null);
    setEditing(true);
  }

  /** Excel'deki satırlar listeyle birleştirilir: aynı malzemenin adedi güncellenir, yeniler eklenir. Kayıt "Kaydet" ile. */
  async function importExcel(file: File) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { onError("Excel dosyası seçin (.xlsx, .xls veya .csv)."); return; }
    setImporting(true); onError(""); setImportNote(null);
    try {
      const result = await parseMaterialExcel(file, catalog);
      const base = (editing ? rows : plannedRows()).filter((r) => r.materialId);
      const merged = [...base];
      for (const line of result.lines) {
        const index = merged.findIndex((r) => r.materialId === line.materialId);
        if (index >= 0) merged[index] = { ...merged[index], quantity: line.quantity };
        else merged.push({ key: `r${++rowSeed}`, materialId: line.materialId, quantity: line.quantity });
      }
      setRows(merged); setEditing(true);
      const problems = [
        result.unknownCodes.length ? `Katalogda bulunamayan kodlar alınmadı: ${result.unknownCodes.join(", ")}.` : "",
        result.invalidRows.length ? `Adedi geçersiz satırlar alınmadı: ${result.invalidRows.join("; ")}.` : "",
      ].filter(Boolean);
      setImportNote({
        text: `${result.lines.length} malzeme aktarıldı; kaydetmek için "Kaydet"e basın.${problems.length ? " " + problems.join(" ") : ""}`,
        warn: problems.length > 0 || result.lines.length === 0,
      });
    } catch (reason) {
      onError(getRequestErrorMessage(reason, "Excel dosyası okunamadı."));
    } finally { setImporting(false); }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault(); setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importExcel(file);
  }

  async function save() {
    const lines = rows.filter((r) => r.materialId && r.quantity.trim());
    for (const r of lines) {
      if (!/^\d+([.,]\d{1,3})?$/.test(r.quantity.trim()) || Number(r.quantity.replace(",", ".")) <= 0) { onError("Miktarlar sıfırdan büyük sayı olmalı (örn. 5 veya 2,5)."); return; }
    }
    setSaving(true); onError("");
    try {
      await saveProjectMaterials(project.id, lines.map((r) => ({ material_id: r.materialId, planned_quantity: r.quantity.trim().replace(",", ".") })));
      setEditing(false); setImportNote(null); await onChanged();
    } catch (reason) { onError(getRequestErrorMessage(reason, "Malzeme listesi kaydedilemedi.")); } finally { setSaving(false); }
  }

  const chosen = new Set(rows.map((r) => r.materialId).filter(Boolean));
  const options = catalog.map((m) => ({ id: m.id, name: m.name, spec: m.spec, brand: m.brand, sku: m.sku, hint: m.unit }));

  return (
    <section className="erp-section-card relative"
      onDragOver={editable ? (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } } : undefined}
      onDragLeave={editable ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false); } : undefined}
      onDrop={editable ? onDrop : undefined}>
      {/* Excel dosyası kartın üstüne sürüklenince bırakma alanı gösterilir. */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-blue-500 bg-blue-50/90 text-sm font-semibold text-blue-800">
          Excel dosyasını buraya bırakın
        </div>
      )}
      {importing && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-white/60"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Malzeme listesi<InfoHint text={`Planlanan malzeme, proje deposundaki miktar ve montajda kullanılan.${missingCount > 0 ? ` ${missingCount} kalem eksik.` : ""}`} /></h2>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void downloadMaterialTemplate()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />Hazır şablon</button>
            <button type="button" disabled={importing} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileSpreadsheet className="h-3.5 w-3.5" />Excel&apos;den yükle</button>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Malzeme listesi Excel dosyası"
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void importExcel(file); }} />
            {!editing && <button type="button" onClick={startEdit} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Listeyi düzenle</button>}
          </div>
        )}
      </div>
      <div className="p-5">
        {importNote && (
          <p className={`mb-3 rounded-lg px-3 py-2 text-xs ${importNote.warn ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{importNote.text}</p>
        )}
        {editing ? (
          <div className="max-w-3xl space-y-2">
            <div className="flex items-center gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden="true">
              <span className="w-28 shrink-0">Kod</span><span className="min-w-0 flex-1">Malzeme</span><span className="w-20 shrink-0 text-right">Adet</span><span className="w-7 shrink-0" />
            </div>
            {rows.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs tabular-nums text-slate-500">{skuById.get(row.materialId) ?? "—"}</span>
                <div className="min-w-0 flex-1"><MaterialPicker compact value={row.materialId} options={options} disabledIds={chosen}
                  onChange={(id) => setRows((cur) => cur.map((r) => r.key === row.key ? { ...r, materialId: id } : r))} /></div>
                <input inputMode="decimal" value={row.quantity} placeholder="Adet" aria-label="Planlanan adet"
                  onChange={(e) => setRows((cur) => cur.map((r) => r.key === row.key ? { ...r, quantity: e.target.value } : r))}
                  className="w-20 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm" />
                <button type="button" aria-label="Satırı kaldır" onClick={() => setRows((cur) => cur.filter((r) => r.key !== row.key))} className="w-7 shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <button type="button" onClick={() => setRows((cur) => [...cur, { key: `r${++rowSeed}`, materialId: "", quantity: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"><Plus className="h-3.5 w-3.5" />Malzeme ekle</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditing(false); setImportNote(null); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">Vazgeç</button>
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
              </div>
            </div>
          </div>
        ) : project.materials.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Malzeme listesi henüz girilmedi. &quot;Listeyi düzenle&quot; ile katalogdan seçin ya da Excel dosyasını buraya sürükleyin.</p>
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

/**
 * "İş emri bağla": aynı mağazanın açık, projesiz iş emrini projeye bağlar ya da projeye bağlı yeni iş emri açar.
 * İşlem sürerken pencere kilitlenir; bağlanan işin malzemesi proje deposundan düşer.
 */
function LinkWorkOrderDialog({ project, onClose, onChanged }: {
  project: ProjectDetail; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<LinkableWorkOrder[] | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getLinkableWorkOrders(project.id)
      .then(setRows)
      .catch((reason) => { setRows([]); setError(getRequestErrorMessage(reason, "İş emirleri yüklenemedi.")); })
      .finally(() => setBusy(false));
  }, [project.id]);

  async function link() {
    setBusy(true); setError("");
    try { await linkWorkOrderToProject(choice, project.id); await onChanged(); onClose(); }
    catch (reason) { setError(getRequestErrorMessage(reason, "İş emri projeye bağlanamadı.")); setBusy(false); }
  }

  return (
    <ModalShell title="İş emri bağla" description="Yeni iş emri açın ya da bu mağazanın açık bir iş emrini projeye bağlayın." busy={busy} onClose={onClose}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Vazgeç</Button>
        <Button size="sm" onClick={() => void link()} disabled={busy || !choice}>Bağla</Button>
      </>}>
        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          <Button asChild variant="outline" className="justify-start">
            <Link href={`/manager/is-emirleri/yeni?proje=${project.id}`}><Plus />Yeni iş emri aç<span className="ml-auto text-xs font-normal text-muted-foreground">montaj, arıza, tadilat</span></Link>
          </Button>
          <p className="pt-1 text-xs font-semibold text-slate-600">Ya da bu mağazanın açık bir iş emrini seçin</p>
          {rows !== null && rows.length === 0 && !error && <p className="text-slate-500">Bağlanabilecek açık iş emri yok.</p>}
          {rows && rows.length > 0 && (
            <ul className="space-y-1.5">
              {rows.map((wo) => (
                <li key={wo.id}>
                  <label className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 ${choice === wo.id ? "border-primary bg-primary/5" : "hover:bg-accent"}`}>
                    <input type="radio" name="work-order" value={wo.id} checked={choice === wo.id} onChange={() => setChoice(wo.id)} className="mt-1 accent-[hsl(var(--primary))]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{wo.title}</span>
                      <span className="block text-[11px] text-slate-500">{wo.work_type_label} · {wo.assigned_to_name ?? "Atanmadı"} · {formatServerDate(wo.created_at)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {choice && <p className="text-[11px] text-slate-500">Bağlanınca işin malzemesi proje deposundan düşer; arıza/bakım işlerinin malzeme tutarı gerçekleşen maliyete otomatik eklenir.</p>}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-slate-600">Bu projeye bağlı iş emirleri ({project.work_orders.length})</p>
            {project.work_orders.length === 0 ? <p className="mt-1.5 text-slate-500">Henüz bağlı iş emri yok.</p> : (
              <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {project.work_orders.map((wo) => {
                  const status = normalizeStatus(wo.status);
                  return (
                    <li key={wo.id}>
                      <Link href={`/manager/is-emirleri/${wo.id}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50">
                        <Badge variant={wo.work_type === "project" ? "muted" : "warning"} className="shrink-0">{wo.work_type_label}</Badge>
                        <span className="min-w-0 flex-1 truncate text-slate-900">{wo.title}</span>
                        <Badge variant={WO_STATUS_BADGE[status] ?? "info"} className="shrink-0">{STATUS_LABEL[status]}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
    </ModalShell>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  // Aynı ekran yönetici panelinde (tam yetki) ve kullanıcı panelinde (projeye atananlar) açılır.
  const inUserPanel = usePathname().startsWith("/user");
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // Girişte Özet açılır; başka sayfadan dönülünce en son bakılan sekme hatırlanır.
  const [view, setView] = useState<"ozet" | "asamalar">("ozet");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await getProject(id);
    setProject(data);
    // Başka sayfadan dönülünce en son bakılan aşama açılır; yoksa yürüyen aşama.
    let remembered: string | null = null;
    try {
      remembered = sessionStorage.getItem(`proje-asama:${id}`);
      if (sessionStorage.getItem(`proje-sekme:${id}`) === "asamalar") setView("asamalar");
    } catch { /* yok say */ }
    setSelectedId((current) => current
      || (remembered && data.stages.some((s) => s.id === remembered) ? remembered : "")
      || (data.stages.find((s) => s.status !== "completed") ?? data.stages[data.stages.length - 1]).id);
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

  // Yüklenirken sayfanın iskeleti gösterilir (düzen kaymaz, kullanıcı yüklendiğini görür).
  if (loading) return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4" aria-busy="true" aria-label="Proje yükleniyor">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-10 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      <Skeleton className="h-48" />
      <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
    </div>
  );
  if (!project) return <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error || "Proje bulunamadı."}</div>;

  const active = project.status === "active";
  const editable = active && project.can_manage;
  const selected = project.stages.find((s) => s.id === selectedId) ?? project.stages[0];
  const phases = phasesOf(project);
  const selectedPhase = phases.find((p) => p.code === selected.phase) ?? phases[0];
  const phasesDone = phases.filter((p) => p.status === "completed").length;
  // Yürüyen adım (Özet'te gösterilir); kapanmış projede yoktur.
  const current = project.stages.find((s) => s.status !== "completed") ?? null;
  // Ana aşama seçilince o aşamanın ilk bitmemiş adımı (hepsi bittiyse sonuncusu) açılır.
  const selectPhase = (phase: PhaseView) =>
    selectStage((phase.steps.find((s) => s.status !== "completed") ?? phase.steps[phase.steps.length - 1]).id);
  // Termin yalnız Üretim ve Montaj'da; Özet'te de o gösterilir.
  const dueDate = phaseDue(project);
  const dueLate = project.stages.some(isLate);
  // Kapanmış projede yönetici yalnızca fatura yükleyebilir (Kapanış aşamasında).
  const invoiceOnly = project.can_manage && project.status === "completed";

  function selectStage(stageId: string) {
    setSelectedId(stageId);
    try { sessionStorage.setItem(`proje-asama:${id}`, stageId); } catch { /* yok say */ }
  }
  function switchView(next: "ozet" | "asamalar") {
    setView(next);
    try { sessionStorage.setItem(`proje-sekme:${id}`, next); } catch { /* yok say */ }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <BackLink fallbackHref={inUserPanel ? "/user/proje-gorevleri" : "/manager/projeler"} fallbackLabel={inUserPanel ? "Proje Görevlerim" : "Projeler"} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">{project.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${project.status === "active" ? "bg-blue-50 text-blue-700" : project.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{PROJECT_STATUS_LABEL[project.status]}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {project.store ? <Link href={`${inUserPanel ? "/user" : "/manager"}/magaza-karti/${project.store.id}`} className="hover:underline">{project.store.name}{project.store.no ? ` · ${project.store.no}` : ""}</Link> : "Yer bilgisi yok"}
            {project.manager_name ? ` · Sorumlu: ${project.manager_name}` : ""}
          </p>
          {project.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{project.description}</p>}
          {project.production_numbers.length > 0 && <p className="mt-2 text-xs text-slate-500">Üretim no: <span className="font-semibold tabular-nums text-slate-700">{project.production_numbers.map((n) => n.number).join(", ")}</span></p>}
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setLinkOpen(true)}><Link2 />İş emri bağla</Button>
            <Button size="sm" variant="outline" onClick={() => setTemplatesOpen(true)}><ListChecks />Kontrol listelerini düzenle</Button>
            <Button size="sm" variant="outline" onClick={() => void cancelProject()}><XCircle />Projeyi iptal et</Button>
          </div>
        )}
      </header>
      {linkOpen && <LinkWorkOrderDialog project={project} onClose={() => setLinkOpen(false)} onChanged={refresh} />}
      {docsOpen && <AllDocumentsDialog project={project} onClose={() => setDocsOpen(false)} />}
      {membersOpen && <MembersDialog project={project} users={users} onClose={() => setMembersOpen(false)} onChanged={refresh} />}
      {eventsOpen && <StageEventsDialog projectId={project.id} onClose={() => setEventsOpen(false)} />}
      {templatesOpen && <ChecklistTemplatesDialog initialCode={selected.code} onClose={() => setTemplatesOpen(false)} onSaved={refresh} />}

      <Tabs value={view} onValueChange={(value) => switchView(value as "ozet" | "asamalar")}>
        <TabsList aria-label="Proje görünümü">
          <TabsTrigger value="ozet">Özet</TabsTrigger>
          <TabsTrigger value="asamalar">Aşamalar</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Özet yalnızca gösterir: düzenleme ve aşama seçimi Aşamalar sekmesindedir. */}
      {view === "ozet" && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "İlerleme", value: `${phasesDone}/${phases.length} aşama` },
              { label: "Hedef bitiş", value: project.target_date ? formatServerDate(project.target_date) : "—" },
              { label: "Bütçe / teklif", value: project.budget ? `₺${money(project.budget)}` : "—" },
              { label: "Maliyet (hedef / gerçekleşen)", value: `₺${money(project.costs.target.total)} / ₺${money(project.costs.actual.total)}` },
              ...(project.planned_cost === null ? [] : [{ label: "Malzeme (plan / gerçek)", value: `₺${money(project.planned_cost)} / ₺${money(project.used_cost)}` }]),
            ].map((tile) => (
              <Card key={tile.label}>
                <CardContent className="px-4 py-3.5">
                  <p className={TXT.label}>{tile.label}</p>
                  <p className="mt-1 truncate text-base font-semibold tabular-nums text-slate-900">{tile.value}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <SectionHeader title="Proje durumu" right={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEventsOpen(true)}><History />Kayıtlar</Button>
                <Button variant="outline" size="sm" onClick={() => setDocsOpen(true)}><FileText />Belgeler ({project.documents.length})</Button>
              </div>
            } />
            <CardContent className="space-y-5 p-5">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Field label="Şu anki aşama" value={current ? `${current.phase_name}${current.phase_name !== current.name ? ` · ${current.name}` : ""}${current.approval_requested_at ? " · onay bekliyor" : ""}`
                  : project.status === "completed" ? `Tamamlandı · ${formatServerDate(project.completed_at)}` : "Tüm aşamalar tamamlandı"} />
                <Field label="Adım sorumlusu" value={current?.responsible_name ?? "—"} />
                <Field label="Termin (Üretim ve Montaj)" value={dueDate ? `${formatServerDate(dueDate)}${dueLate ? " · gecikti" : ""}` : "—"} tone={dueLate ? "danger" : undefined} />
                <Field label="Proje türü" value={project.project_type_label} />
              </dl>
              <StageTrack phases={phases} />
            </CardContent>
          </Card>

          {/* items-start: açılan kart yanındakini uzatmaz. */}
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <WorkOrdersCard project={project} inUserPanel={inUserPanel} />
            <MembersSummary project={project} onEdit={editable ? () => setMembersOpen(true) : undefined} />
          </div>
        </div>
      )}

      {view === "asamalar" && (<>
      <PhaseStrip phases={phases} selectedCode={selectedPhase.code} onSelect={selectPhase} />
      <StepTabs steps={selectedPhase.steps} selectedId={selected.id} onSelect={selectStage} />

      <StagePanel stage={selected} phase={selectedPhase} projectId={project.id} due={dueDate} users={users} editable={editable} canManage={project.can_manage} onChanged={refresh} onError={setError}
        files={
          <StageFiles project={project} stage={selected}
            canUpload={editable || (invoiceOnly && selected.code === "kapanis")}
            invoiceOnly={invoiceOnly && selected.code === "kapanis"}
            canDelete={editable && selected.status !== "completed"}
            onChanged={refresh} onError={setError} />
        } />

      {/* Teklif, hedeflenen maliyet ve tahmini kâr aynı aşamada: teklif maliyete bakılarak verilir. */}
      {selected.code === "teklif" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <TargetCostsCard projectId={project.id} costs={project.costs} canEnter={active} onChanged={refresh} onError={setError} />
          <BudgetCard projectId={project.id} budget={project.budget} targetTotal={project.costs.target.total} editable={editable} onChanged={refresh} onError={setError} />
        </div>
      )}

      {/* Müşterinin onayladığı satış fiyatı ve KDV; teklif tutarıyla dolu gelir, beklenen kâr gösterilir. */}
      {selected.code === "onay" && <SalePriceCard projectId={project.id} billing={project.billing} budget={project.budget}
        targetTotal={project.costs.target.total} editable={project.can_manage && project.status !== "cancelled"}
        locked={selected.status === "completed"} onChanged={refresh} onError={setError} />}

      {/* Üretim adımı: üretim no ve malzeme listesi (malzemenin proje deposunda hazır olması). */}
      {selected.code === "uretim" && <ProductionNumbersCard projectId={project.id} numbers={project.production_numbers} canEnter={active} onChanged={refresh} onError={setError} />}
      {selected.code === "uretim" && <MaterialsCard project={project} catalog={catalog} editable={editable} onChanged={refresh} onError={setError} />}

      {/* Kapanış maliyet ağırlıklıdır: önce hedef ↔ gerçekleşen maliyet, sonra gerçek kâr ve fatura. */}
      {selected.code === "kapanis" && <CostsCard projectId={project.id} costs={project.costs} canEnter={active} onChanged={refresh} onError={setError} />}

      {selected.code === "kapanis" && <RealProfitCard billing={project.billing} actualTotal={project.costs.actual.total} />}

      {selected.code === "kapanis" && <BillingCard projectId={project.id} billing={project.billing} store={project.store}
        storeHref={project.store ? `${inUserPanel ? "/user" : "/manager"}/magaza-karti/${project.store.id}` : null}
        editable={project.can_manage && project.status !== "cancelled"} onChanged={refresh} onError={setError} />}
      </>)}
    </div>
  );
}

// ── Özet sekmesinin tek yazı ölçeği ─────────────────────────────────────────
// Başlık 14 px kalın · etiket 12 px gri · değer 14 px yarı kalın · ikincil bilgi 12 px gri · etiket çipi 12 px.
const TXT = {
  title: "text-sm font-semibold text-slate-900",
  label: "text-xs font-medium text-slate-500",
  value: "text-sm font-semibold text-slate-900",
  meta: "text-xs text-slate-500",
  chip: "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
};

/**
 * Ortak pencere kabuğu (shadcn Dialog): başlık, açıklama, kaydırılabilir içerik, alt butonlar.
 * busy iken pencere kilitlenir; Esc / dışarı tıklama ile kapanmaz (yarım işlem olmasın).
 */
function ModalShell({ title, description, busy = false, onClose, footer, children, className }: {
  title: string; description?: string; busy?: boolean; onClose: () => void;
  footer?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className={cn("flex max-h-[85vh] flex-col gap-0 p-0", className)}
        onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
        {busy && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-white/70"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className={description ? "text-xs" : "sr-only"}>{description ?? title}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <DialogFooter className="gap-2 border-t px-5 py-3 sm:space-x-0">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Özet'in açılır kartı: başlık satırına tıklayınca liste altında açılır (varsayılan kapalı). Kartlar birbirinin
 * yüksekliğini etkilemez; açık liste en fazla ~8 satır yüksekliğindedir, fazlası içinde kayar.
 */
function CollapsibleCard({ title, meta, action, children }: { title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-14 items-center gap-2 pr-4">
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}
          className="flex min-h-14 flex-1 items-center gap-2.5 px-5 text-left hover:bg-muted/50">
          <ChevronRight aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className={TXT.title}>{title}</span>
          {meta && <span className={cn("ml-auto", TXT.meta)}>{meta}</span>}
        </button>
        {action}
      </div>
      {open && (
        <>
          <Separator />
          <div className="max-h-[26rem] overflow-y-auto">{children}</div>
        </>
      )}
    </Card>
  );
}

/** Ad soyadın baş harfleri (kişi satırındaki yuvarlak). */
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "").join("") || "?";
}

/** Kart başlığı (shadcn CardHeader + CardTitle): başlık solda, işlem sağda, altında ayraç. */
function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <>
      <UiCardHeader className="min-h-14 flex-row items-center justify-between gap-3 space-y-0 px-5 py-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {right}
      </UiCardHeader>
      <Separator />
    </>
  );
}

const WO_STATUS_BADGE: Record<string, "success" | "muted" | "warning" | "info"> = {
  completed: "success", cancelled: "muted", in_progress: "warning", planned: "info",
};

function Field({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="min-w-0">
      <dt className={TXT.label}>{label}</dt>
      <dd className={`mt-1 truncate ${TXT.value} ${tone === "danger" ? "!text-red-700" : ""}`}>{value}</dd>
    </div>
  );
}

/** Ana aşamaların salt görüntülenen sırası (Özet): tıklanmaz; adımlar ve seçim Aşamalar sekmesindedir. */
function StageTrack({ phases }: { phases: PhaseView[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Ana aşamalar">
      {phases.map((phase) => {
        const done = phase.steps.filter((s) => s.status === "completed").length;
        return (
          <li key={phase.code} aria-current={phase.status === "in_progress" ? "step" : undefined}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${phase.status === "completed" ? "border-emerald-200 bg-emerald-50/60" : phase.status === "in_progress" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${BALLOON[phase.status]}`}>
              {phase.status === "completed" ? <Check className="h-3.5 w-3.5" /> : phase.order}
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-sm font-medium ${phase.status === "in_progress" ? "text-blue-900" : "text-slate-800"}`}>{phase.name}</span>
              <span className={`block text-xs ${phase.late ? "font-medium text-red-700" : "text-slate-500"}`}>
                {phase.steps.length > 1 ? `${done}/${phase.steps.length} adım` : phase.status === "completed" ? "Tamamlandı" : phase.status === "in_progress" ? "Devam ediyor" : "Başlamadı"}{phase.late ? " · gecikti" : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type TemplateDraftItem = { key: number; id: string | null; label: string };
let templateKey = 0;

/**
 * "Kontrol listelerini düzenle" (yalnız yönetici): firmanın adım başına kontrol listesi şablonu.
 * Soldan adım seçilir, sağda maddeler yazılır / sıralanır / silinir / eklenir; tek "Kaydet" tüm adımları
 * firmaya kaydeder ve devam eden projelerin tamamlanmamış adımları da güncellenir.
 */
function ChecklistTemplatesDialog({ initialCode, onClose, onSaved }: { initialCode: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [stages, setStages] = useState<ChecklistTemplateStage[] | null>(null);
  const [draft, setDraft] = useState<Record<string, TemplateDraftItem[]>>({});
  const [active, setActive] = useState(initialCode);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getChecklistTemplates()
      .then(({ stages: rows }) => {
        setStages(rows);
        setDraft(Object.fromEntries(rows.map((s) => [s.code, s.items.map((i) => ({ key: ++templateKey, id: i.id, label: i.label }))])));
        if (!rows.some((s) => s.code === initialCode) && rows[0]) setActive(rows[0].code);
      })
      .catch((reason) => setError(getRequestErrorMessage(reason, "Kontrol listeleri yüklenemedi.")))
      .finally(() => setBusy(false));
  }, [initialCode]);

  const items = draft[active] ?? [];
  const update = (next: TemplateDraftItem[]) => setDraft((cur) => ({ ...cur, [active]: next }));
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    update(next);
  };

  async function save() {
    for (const stage of stages ?? []) {
      const rows = (draft[stage.code] ?? []).filter((row) => row.label.trim());
      if (rows.some((row) => row.label.trim().length < 2)) { setError(`${stage.name}: maddeler en az 2 karakter olmalı.`); setActive(stage.code); return; }
      const labels = rows.map((row) => row.label.trim().toLocaleLowerCase("tr-TR"));
      if (new Set(labels).size !== labels.length) { setError(`${stage.name}: aynı madde iki kez yazılmış.`); setActive(stage.code); return; }
    }
    setBusy(true); setError("");
    try {
      await saveChecklistTemplates(Object.fromEntries((stages ?? []).map((stage) => [
        stage.code, (draft[stage.code] ?? []).filter((row) => row.label.trim()).map((row) => ({ id: row.id, label: row.label.trim() })),
      ])));
      await onSaved();
      onClose();
    } catch (reason) { setError(getRequestErrorMessage(reason, "Kontrol listeleri kaydedilemedi.")); setBusy(false); }
  }

  return (
    <ModalShell title="Kontrol listeleri (firma şablonu)" description="Kaydedince tüm firmada geçerli olur; devam eden projelerin tamamlanmamış adımları da güncellenir."
      busy={busy} onClose={onClose} className="sm:max-w-3xl"
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Vazgeç</Button>
        <Button size="sm" onClick={() => void save()} disabled={busy || !stages}>Kaydet</Button>
      </>}>
      {error && <Alert variant="destructive" className="m-5 mb-0 w-auto"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid min-h-[22rem] sm:grid-cols-[13rem_1fr]">
        <nav aria-label="Adımlar" className="flex flex-col gap-0.5 border-b p-3 sm:border-b-0 sm:border-r">
          {(stages ?? []).map((stage) => (
            <button key={stage.code} type="button" onClick={() => setActive(stage.code)} aria-current={stage.code === active ? "true" : undefined}
              className={cn("flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm", stage.code === active ? "bg-primary/10 font-semibold text-primary" : "text-slate-700 hover:bg-muted")}>
              <span className="min-w-0 truncate">{stage.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{(draft[stage.code] ?? []).length}</span>
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-2 p-4">
          <p className="text-xs font-medium text-muted-foreground">{stages?.find((s) => s.code === active)?.phase_name} · {stages?.find((s) => s.code === active)?.name} — maddeler</p>
          {items.length === 0 && <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">Bu adımda madde yok.</p>}
          {items.map((row, index) => (
            <div key={row.key} className="flex items-center gap-1.5">
              <Input value={row.label} maxLength={255} aria-label={`${index + 1}. madde`} placeholder="Madde"
                onChange={(e) => update(items.map((item) => item.key === row.key ? { ...item, label: e.target.value } : item))} />
              <Button variant="ghost" size="icon" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
              <Button variant="ghost" size="icon" aria-label="Aşağı taşı" disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
              <Button variant="ghost" size="icon" aria-label="Maddeyi sil" className="text-muted-foreground hover:text-destructive"
                onClick={() => update(items.filter((item) => item.key !== row.key))}><Trash2 /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="self-start" onClick={() => update([...items, { key: ++templateKey, id: null, label: "" }])}><Plus />Madde ekle</Button>
        </div>
      </div>
    </ModalShell>
  );
}

/** Özet → "Kayıtlar": aşama kayıt listesi (tamamlama anı + sorumlu / tarih / onay değişiklikleri), en yeni önce. */
function StageEventsDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [rows, setRows] = useState<StageEvent[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getProjectStageEvents(projectId).then(setRows).catch((reason) => { setRows([]); setError(getRequestErrorMessage(reason, "Kayıtlar yüklenemedi.")); });
  }, [projectId]);
  return (
    <ModalShell title="Aşama kayıtları" description="Adım tamamlama anları ile sorumlu, tarih ve onay değişiklikleri. Kayıtlar sonradan değişmez."
      onClose={onClose} className="sm:max-w-3xl">
        <div>
          {rows === null ? (
            <div className="flex flex-col gap-3 p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : error ? (
            <Alert variant="destructive" className="m-5 w-auto"><AlertDescription>{error}</AlertDescription></Alert>
          ) : rows.length === 0 ? (
            <p className={`py-10 text-center ${TXT.meta}`}>Henüz kayıt yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      <Badge variant={row.event === "completed" ? "success" : row.event === "approval_rejected" ? "destructive" : "muted"} className="mr-2">{row.event_label}</Badge>
                      {row.phase_name && row.phase_name !== row.stage_name ? `${row.phase_name} · ` : ""}{row.stage_name}
                    </span>
                    <span className={TXT.meta}>{formatServerDateTime(row.created_at)}{row.actor_name ? ` · ${row.actor_name}` : ""}</span>
                  </div>
                  <p className={`mt-1 ${TXT.meta}`}>
                    {row.old_value || row.new_value ? `${row.old_value ?? "—"} → ${row.new_value ?? "—"}` : [
                      `Sorumlu: ${row.responsible_name ?? "—"}`,
                      `Planlanan bitiş: ${row.planned_end ? formatServerDate(row.planned_end) : "—"}`,
                      ...(row.event === "completed" ? [
                        row.delay_days === null ? "Gecikme: —" : row.delay_days > 0 ? `${row.delay_days} gün gecikti` : row.delay_days < 0 ? `${-row.delay_days} gün erken` : "Zamanında",
                        `Kontrol listesi: ${row.checklist_done ?? 0}/${row.checklist_total ?? 0}`,
                        `Belge: ${row.document_count ?? 0}`,
                      ] : []),
                    ].join(" · ")}
                  </p>
                  {row.note && <p className={`mt-0.5 ${TXT.meta}`}>Not: {row.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
    </ModalShell>
  );
}

/** Özet: projeye bağlı iş emirleri (yalnız görüntüleme; bağlama sağ üstteki butondan). Satıra tıklayınca iş emri açılır. */
function WorkOrdersCard({ project, inUserPanel }: { project: ProjectDetail; inUserPanel: boolean }) {
  const open = project.work_orders.filter((wo) => !["completed", "cancelled"].includes(normalizeStatus(wo.status))).length;
  return (
    <CollapsibleCard title={`Bağlı iş emirleri (${project.work_orders.length})`} meta={open ? `${open} açık` : undefined}>
      {project.work_orders.length === 0 ? (
        <p className={`px-5 py-6 text-center ${TXT.meta}`}>Projeye bağlı iş emri yok.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {project.work_orders.map((wo) => {
            const status = normalizeStatus(wo.status);
            return (
              <li key={wo.id}>
                <Link href={`${inUserPanel ? "/user/islerim" : "/manager/is-emirleri"}/${wo.id}`} className="block px-5 py-3 hover:bg-muted/50">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant={wo.work_type === "project" ? "muted" : "warning"} className="shrink-0">{wo.work_type_label}</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{wo.title}</span>
                    <Badge variant={WO_STATUS_BADGE[status] ?? "info"} className="shrink-0">{STATUS_LABEL[status]}</Badge>
                  </div>
                  <p className={cn("mt-1 truncate", TXT.meta)}>
                    {wo.assigned_to_name ?? "Atanmadı"} · Termin {wo.due_date ? formatServerDate(wo.due_date) : "—"}
                    {wo.linked_at ? ` · Bağlandı ${formatServerDate(wo.linked_at)}${wo.link_stage_name ? ` (${wo.link_stage_name})` : ""}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleCard>
  );
}

/** Projeye atananları düzenleme penceresi (proje sorumlusu her zaman atanmıştır). Kayıt sürerken kilitlenir. */
function MembersDialog({ project, users, onClose, onChanged }: {
  project: ProjectDetail; users: UserRow[]; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(project.members.map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = selected.size + (project.manager_user_id && !selected.has(project.manager_user_id) ? 1 : 0);

  async function save() {
    setBusy(true); setError("");
    try { await saveProjectMembers(project.id, Array.from(selected)); await onChanged(); onClose(); }
    catch (reason) { setError(getRequestErrorMessage(reason, "Atanan kişiler kaydedilemedi.")); setBusy(false); }
  }

  return (
    <ModalShell title="Projeye atananlar" description="Atanan herkes projenin tüm aşamalarını ve maliyetlerini görür." busy={busy} onClose={onClose} className="sm:max-w-xl"
      footer={<>
        <span className={`mr-auto self-center ${TXT.meta}`}>{count} kişi seçili</span>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Vazgeç</Button>
        <Button size="sm" onClick={() => void save()} disabled={busy}>Kaydet</Button>
      </>}>
        <div className="flex flex-col gap-3 px-5 py-4">
          <MemberChecklist users={users} selected={selected} lockedId={project.manager_user_id}
            onToggle={(id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        </div>
    </ModalShell>
  );
}

/** Özet: projeye atananlar; yönetici "Düzenle" ile kişi ekler/çıkarır. */
function MembersSummary({ project, onEdit }: { project: ProjectDetail; onEdit?: () => void }) {
  return (
    <CollapsibleCard title={`Projeye atananlar (${project.members.length})`}
      action={onEdit && <Button variant="outline" size="sm" onClick={onEdit}>Düzenle</Button>}>
      {project.members.length === 0 ? (
        <p className={`px-5 py-6 text-center ${TXT.meta}`}>Projeye atanan kişi yok.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...project.members]
            .sort((a, b) => Number(b.id === project.manager_user_id) - Number(a.id === project.manager_user_id))
            .map((member) => {
              const isManager = member.id === project.manager_user_id;
              const steps = project.stages.filter((s) => s.responsible_user_id === member.id);
              return (
                <li key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-slate-600">
                    {initials(member.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{member.name}</p>
                    <p className={cn("truncate", TXT.meta)}>{steps.length ? `Sorumlu: ${steps.map((s) => s.name).join(", ")}` : "Adım sorumluluğu yok"}</p>
                  </div>
                  <Badge variant={isManager ? "info" : "muted"} className="shrink-0">{isManager ? "Proje sorumlusu" : "Atanan"}</Badge>
                </li>
              );
            })}
        </ul>
      )}
    </CollapsibleCard>
  );
}

/** Özet → "Belgeler (N)": projenin tüm dosyaları aşamaya göre gruplu; yükleyen kişi ve zamanıyla. */
function AllDocumentsDialog({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const groups = [
    ...project.stages.map((stage) => ({ key: stage.id, title: `${stage.order}. ${stage.name}`, docs: project.documents.filter((doc) => doc.stage_id === stage.id) })),
    { key: "none", title: "Aşamasız", docs: project.documents.filter((doc) => !doc.stage_id || !project.stages.some((s) => s.id === doc.stage_id)) },
  ].filter((group) => group.docs.length > 0);
  return (
    <ModalShell title={`Belgeler (${project.documents.length})`} description="Projenin tüm dosyaları, aşamaya göre." onClose={onClose} className="sm:max-w-2xl">
        <div className="flex flex-col gap-4 px-5 py-4">
          {groups.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Henüz belge yüklenmedi. Dosyalar Aşamalar sekmesinde ilgili aşamaya yüklenir.</p> : groups.map((group) => (
            <section key={group.key}>
              <p className="text-xs font-semibold text-slate-600">{group.title} <span className="font-normal text-slate-400">({group.docs.length})</span></p>
              <ul className="divide-y divide-slate-100">{group.docs.map((doc) => <DocumentRow key={doc.id} doc={doc} />)}</ul>
            </section>
          ))}
        </div>
    </ModalShell>
  );
}
