"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, Circle, Clock, FileText, Plus, Send, Upload } from "lucide-react";
import { getRequestErrorMessage } from "@/lib/api";
import { uploadFormData } from "@/lib/upload";
import { formatQuantity } from "@/lib/quantity";
import { cn, formatServerDate, formatServerDateTime } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Separator } from "@/components/shadcn/separator";
import { Spinner } from "@/components/shadcn/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Textarea } from "@/components/shadcn/textarea";
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


  if (loading) return <div className="flex justify-center py-24"><Spinner className="size-5" /></div>;
  if (!task) return <Alert variant="destructive" className="mx-auto max-w-xl"><AlertDescription>{error || "Görev bulunamadı."}</AlertDescription></Alert>;

  const { stage, project } = task;
  // "Adımı Tamamla" daima açık: sırası gelmemiş adım da tamamlanabilir.
  const open = project.status === "active" && stage.status !== "completed";
  const locked = project.status !== "active" || stage.status === "completed";
  const pending = Boolean(stage.approval_requested_at);
  const stageDocs = task.documents.filter((d) => d.stage_id === stage.id);
  const planned = task.materials.filter((m) => Number(m.planned_quantity) > 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <BackLink fallbackHref="/user/proje-gorevleri" fallbackLabel="Proje Görevlerim" />
      <header>
        <p className="text-xs font-semibold text-muted-foreground">{project.name} · {project.project_type_label}{project.store ? ` · ${project.store.name}` : ""}</p>
        {project.is_member && <Button variant="link" size="sm" asChild className="mt-1 h-auto p-0 text-xs"><Link href={`/user/projeler/${project.id}`}>Projenin tamamını aç</Link></Button>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{stage.order}. {stage.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stage.status === "completed" ? `Tamamlandı · ${formatServerDateTime(stage.completed_at)}` : stage.status === "in_progress" ? "Sıra sizde" : "Önceki aşama kapanınca başlar"}
          {stage.planned_end ? ` · Planlanan bitiş: ${formatServerDate(stage.planned_end)}` : ""}
        </p>
      </header>

      <ol className="flex flex-wrap gap-1.5" aria-label="Aşamalar">{task.stages.map((s) => (
        <li key={s.order}>
          <Badge variant={s.status === "completed" ? "success" : s.order === stage.order ? "default" : "muted"} className="gap-0.5 font-medium">
            {s.status === "completed" && <Check className="size-3" />}{s.order}. {s.name}
          </Badge>
        </li>
      ))}</ol>

      {pending && <Alert className="border-amber-200 bg-amber-50 text-amber-900"><Clock /><AlertDescription>Kapanış {formatServerDateTime(stage.approval_requested_at)} tarihinde yöneticiye onaya gönderildi. Yönetici onaylayınca proje tamamlanacak.</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800"><AlertDescription>{success}</AlertDescription></Alert>}

      {stage.code === "uretim" && (
        <ProductionNumbersCard projectId={project.id} numbers={task.production_numbers} canEnter={project.status === "active"}
          onChanged={load} onError={setError} />
      )}

      <Card>
        <CardHeader className="px-5 py-4"><CardTitle className="text-sm">Kontrol listesi</CardTitle></CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-1.5 p-5">
          {stage.checklist.map((item) => (
            <div key={item.id} className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm", item.is_done && "border-emerald-200 bg-emerald-50/60")}>
              <Checkbox id={`gorev-madde-${item.id}`} disabled={locked || busy} checked={item.is_done} className="mt-0.5"
                onCheckedChange={(checked) => void run(() => setChecklistItem(item.id, checked === true), "Madde güncellenemedi.")} />
              <Label htmlFor={`gorev-madde-${item.id}`} className={cn("font-normal leading-snug", item.is_done && "text-muted-foreground line-through", !locked && "cursor-pointer")}>{item.label}</Label>
            </div>
          ))}
          {!locked && (
            <form className="flex gap-2 pt-1" onSubmit={(e) => { e.preventDefault(); if (newItem.trim().length < 2) return; void run(() => addChecklistItem(stage.id, newItem.trim()), "Madde eklenemedi.").then(() => setNewItem("")); }}>
              <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Madde ekle" maxLength={255} aria-label="Yeni madde" className="min-w-0 flex-1" />
              <Button type="submit" variant="outline" size="icon" disabled={busy || newItem.trim().length < 2} aria-label="Madde ekle"><Plus /></Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-5 py-4"><CardTitle className="text-sm">Belgeler ve fotoğraflar</CardTitle></CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-3 p-5">
          {!locked && (
            <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted p-3">
              <Field className="w-auto">
                <FieldLabel htmlFor="gorev-belge-tur" className="text-xs">Tür</FieldLabel>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger id="gorev-belge-tur" className="w-44 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{Object.entries(task.doc_types).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
              <Field className="min-w-0 flex-1 basis-48">
                <FieldLabel htmlFor="gorev-belge-dosya" className="text-xs">Dosya</FieldLabel>
                <Input id="gorev-belge-dosya" type="file" accept="image/*,.pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="bg-background" />
              </Field>
              <Button disabled={!file || progress !== null} onClick={() => void upload()}>
                {progress !== null ? <><Spinner data-icon="inline-start" />%{progress}</> : <><Upload data-icon="inline-start" />Yükle</>}
              </Button>
            </div>
          )}
          {stageDocs.length === 0 ? <p className="text-sm text-muted-foreground">Bu aşamaya henüz belge yüklenmedi.</p> : (
            <ul className="divide-y">{stageDocs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-primary hover:underline">{doc.file_name}</a> : <p className="truncate text-sm">{doc.file_name}</p>}
                  <p className="text-[11px] text-muted-foreground">{doc.doc_type_label} · {formatServerDateTime(doc.uploaded_at)}</p>
                </div>
              </li>
            ))}</ul>
          )}
        </CardContent>
      </Card>

      {(stage.code === "uretim" || stage.code === "kapanis") && planned.length > 0 && (
        <Card>
          <CardHeader className="px-5 py-4"><CardTitle className="text-sm">Malzeme durumu<InfoHint text="Malzemeyi proje deposuna aktarma ve iade işlemlerini yönetici yapar." /></CardTitle></CardHeader>
          <Separator />
          <CardContent className="p-0">
            <Table className="min-w-[480px]">
              <TableHeader><TableRow>
                <TableHead className="pl-5">Malzeme</TableHead><TableHead className="text-right">Plan</TableHead><TableHead className="text-right">Depoda</TableHead><TableHead className="text-right">Kullanılan</TableHead><TableHead className="pr-5 text-right">Eksik</TableHead>
              </TableRow></TableHeader>
              <TableBody>{planned.map((m) => (
                <TableRow key={m.material_id}>
                  <TableCell className="pl-5"><MaterialTitle sku={m.sku} name={m.name} spec={m.spec} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(m.planned_quantity)} {m.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(m.in_depot)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(m.used)}</TableCell>
                  <TableCell className={cn("pr-5 text-right tabular-nums", Number(m.missing) > 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>{formatQuantity(m.missing)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {stage.code === "montaj_test" && task.work_orders.length > 0 && (
        <Card>
          <CardHeader className="px-5 py-4"><CardTitle className="text-sm">Montaj iş emirleri</CardTitle></CardHeader>
          <Separator />
          <ul className="divide-y">{task.work_orders.map((wo) => (
            <li key={wo.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="truncate">{wo.title}<span className="block text-[11px] text-muted-foreground">{wo.assigned_to_name ?? "Atanmadı"}</span></span>
              <Badge variant="muted" className="whitespace-nowrap">{STATUS_LABEL[normalizeStatus(wo.status)]}</Badge>
            </li>
          ))}</ul>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Aşama şartları (tamamlamayı engellemez)</p>
            <ul className="mt-2 flex flex-col gap-1.5">{stage.requirements.map((req) => (
              <li key={req.label} className={cn("flex items-start gap-2 text-sm", req.ok ? "text-emerald-700" : "text-muted-foreground")}>
                {req.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <Circle className="mt-0.5 size-4 shrink-0 opacity-40" />}{req.label}
              </li>
            ))}</ul>
          </div>
          <Field>
            <FieldLabel htmlFor="gorev-not">Not</FieldLabel>
            <Textarea id="gorev-not" disabled={locked} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if ((stage.note ?? "") !== note) void run(() => updateStage(stage.id, { note }), "Not kaydedilemedi."); }} rows={3} placeholder="Ölçüler, müşteri talebi, dikkat edilecekler" className="resize-none" />
          </Field>
          {open && !pending && (stage.needs_approval ? (
            <Button size="lg" disabled={busy} className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => void run(() => updateStage(stage.id, { action: "request_approval" }), "Onaya gönderilemedi.", "Kapanış yöneticiye onaya gönderildi.")}>
              {busy ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}Kapanışı Yöneticiye Onaya Gönder
            </Button>
          ) : (
            <Button size="lg" disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => void run(() => updateStage(stage.id, { action: "complete" }), "Aşama tamamlanamadı.", "Adım tamamlandı.")}>
              {busy ? <Spinner data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}Adımı Tamamla
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
