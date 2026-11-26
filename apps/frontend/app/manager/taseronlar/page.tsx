"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, HardHat, Mail, Pencil, Phone, Plus, Search, Star } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { getRequestErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Label } from "@/components/shadcn/label";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Textarea } from "@/components/shadcn/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import {
  COMPETENCY, COMPETENCY_KEYS, createSubcontractor, listSubcontractors, updateSubcontractor,
  type Competency, type Subcontractor, type SubcontractorFields,
} from "@/services/subcontractors";

type Form = Record<Exclude<keyof SubcontractorFields, "competency">, string> & { competency: Competency | "" };

const EMPTY: Form = {
  company_name: "", tax_office: "", tax_number: "", address: "", city: "", phone: "", email: "", iban: "",
  contact_name: "", contact_title: "", contact_phone: "", contact_email: "", competency: "", notes: "",
};

function toForm(item: Subcontractor): Form {
  const form = { ...EMPTY };
  (Object.keys(EMPTY) as (keyof Form)[]).forEach((key) => { (form[key] as string) = (item[key] as string | null) ?? ""; });
  return form;
}

type SortKey = "name" | "rating" | "load";
type ColorFilter = Competency | "all" | "none";
const workload = (item: Subcontractor) => item.open_work_orders + item.active_projects;
const formatDay = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
const isPast = (iso: string) => new Date(iso) < new Date(new Date().toDateString());
const formatScore = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function CompetencyDot({ value, className }: { value: Competency | null; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", value ? COMPETENCY[value].dot : "border border-dashed border-border bg-background", className)} />;
}

function TextField({ id, label, value, onChange, placeholder, maxLength, inputMode }: {
  id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength: number;
  inputMode?: "tel" | "email" | "numeric";
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} inputMode={inputMode} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function SubcontractorDialog({ item, onClose, onSaved }: { item: Subcontractor | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form>(item ? toForm(item) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof Form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    if (form.company_name.trim().length < 2) { setError("Firma ünvanını yazın."); return; }
    setSaving(true); setError("");
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null])) as Partial<SubcontractorFields>;
    try {
      if (item) await updateSubcontractor(item.id, payload); else await createSubcontractor(payload);
      await onSaved(); onClose();
    } catch (reason) { setError(getRequestErrorMessage(reason, "Taşeron kartı kaydedilemedi.")); setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Taşeron Kartını Düzenle" : "Yeni Taşeron Kartı"}</DialogTitle>
          <DialogDescription className="sr-only">Taşeron firmanın cari bilgileri, yetkili kişisi ve renk göstergesi.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">Yetkinlik rengi</FieldLegend>
            <FieldDescription>Puan verilmiş taşeronda renk puan ortalamasından hesaplanır; bu renk puan yokken görünür.</FieldDescription>
            <ToggleGroup type="single" variant="outline" value={form.competency} onValueChange={(value) => set("competency")(value)} className="justify-start">
              {COMPETENCY_KEYS.map((key) => (
                <ToggleGroupItem key={key} value={key} aria-label={COMPETENCY[key].label} className="gap-2 px-3">
                  <CompetencyDot value={key} />{COMPETENCY[key].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Firma ve cari bilgiler</FieldLegend>
            <FieldGroup className="gap-4">
              <TextField id="t-unvan" label="Firma ünvanı" value={form.company_name} onChange={set("company_name")} maxLength={255} placeholder="Örn. Soğutma Montaj Ltd. Şti." />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="t-vd" label="Vergi dairesi" value={form.tax_office} onChange={set("tax_office")} maxLength={120} />
                <TextField id="t-vn" label="Vergi no / TCKN" value={form.tax_number} onChange={set("tax_number")} maxLength={32} inputMode="numeric" />
                <TextField id="t-tel" label="Telefon" value={form.phone} onChange={set("phone")} maxLength={40} inputMode="tel" />
                <TextField id="t-eposta" label="E-posta" value={form.email} onChange={set("email")} maxLength={255} inputMode="email" />
                <TextField id="t-il" label="İl / ilçe" value={form.city} onChange={set("city")} maxLength={80} />
                <TextField id="t-iban" label="IBAN" value={form.iban} onChange={set("iban")} maxLength={40} placeholder="TR.." />
              </div>
              <TextField id="t-adres" label="Adres" value={form.address} onChange={set("address")} maxLength={500} />
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Yetkili kişi</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="t-yetkili" label="Ad soyad" value={form.contact_name} onChange={set("contact_name")} maxLength={255} />
              <TextField id="t-gorev" label="Görevi" value={form.contact_title} onChange={set("contact_title")} maxLength={120} />
              <TextField id="t-ytel" label="Telefon" value={form.contact_phone} onChange={set("contact_phone")} maxLength={40} inputMode="tel" />
              <TextField id="t-yeposta" label="E-posta" value={form.contact_email} onChange={set("contact_email")} maxLength={255} inputMode="email" />
            </div>
          </FieldSet>

          <Field>
            <FieldLabel htmlFor="t-not">Not</FieldLabel>
            <Textarea id="t-not" value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} maxLength={4000} placeholder="Uzmanlık alanı, çalışma koşulları vb." className="resize-none" />
          </Field>

          {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={saving} onClick={() => void save()}>{saving && <Spinner data-icon="inline-start" />}{item ? "Kaydet" : "Kartı Oluştur"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SubcontractorsPage() {
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ColorFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [dialog, setDialog] = useState<{ item: Subcontractor | null } | null>(null);
  const [deactivate, setDeactivate] = useState<Subcontractor | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listSubcontractors(true)); setError(""); }
    catch (reason) { setError(getRequestErrorMessage(reason, "Taşeron kartları yüklenemedi.")); }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const rows = items.filter((item) => (showInactive || item.is_active)
      && (filter === "all" || (filter === "none" ? !item.color : item.color === filter))
      && (!q || `${item.company_name} ${item.contact_name ?? ""} ${item.city ?? ""} ${item.tax_number ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)));
    const byName = (a: Subcontractor, b: Subcontractor) => a.company_name.localeCompare(b.company_name, "tr");
    return [...rows].sort((a, b) =>
      sort === "rating" ? (b.rating_avg ?? -1) - (a.rating_avg ?? -1) || byName(a, b)
        : sort === "load" ? workload(b) - workload(a) || byName(a, b)
          : byName(a, b));
  }, [items, query, filter, showInactive, sort]);

  const inactiveCount = items.filter((item) => !item.is_active).length;

  async function setActive(item: Subcontractor, active: boolean) {
    try { await updateSubcontractor(item.id, { is_active: active }); await load(); }
    catch (reason) { setError(getRequestErrorMessage(reason, "Kart güncellenemedi.")); }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Taşeron Kartları<InfoHint text="Puan: tamamlanan iş emri ve proje adımlarında verilen 1–5 puanın ortalaması. İş yükü: taşerona atanmış açık iş emirleri ve devam eden projeler." />
        </h1>
        <Button onClick={() => setDialog({ item: null })}><Plus data-icon="inline-start" />Yeni Taşeron</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" size="sm" value={filter} onValueChange={(value) => value && setFilter(value as ColorFilter)} aria-label="Renge göre süz">
          <ToggleGroupItem value="all" className="px-3">Tümü</ToggleGroupItem>
          {COMPETENCY_KEYS.map((key) => (
            <ToggleGroupItem key={key} value={key} className="gap-2 px-3"><CompetencyDot value={key} />{COMPETENCY[key].label}</ToggleGroupItem>
          ))}
          <ToggleGroupItem value="none" className="px-3">Renk yok</ToggleGroupItem>
        </ToggleGroup>
        <InputGroup className="ml-auto w-full sm:w-72">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Firma, yetkili veya il ara" aria-label="Taşeron ara" />
        </InputGroup>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sırala</span>
          <ToggleGroup type="single" size="sm" value={sort} onValueChange={(value) => value && setSort(value as SortKey)} aria-label="Sıralama">
            <ToggleGroupItem value="name" className="px-3">Ad</ToggleGroupItem>
            <ToggleGroupItem value="rating" className="px-3">Puan</ToggleGroupItem>
            <ToggleGroupItem value="load" className="px-3">İş yükü</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {inactiveCount > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox id="pasifler" checked={showInactive} onCheckedChange={(checked) => setShowInactive(checked === true)} />
            <Label htmlFor="pasifler" className="font-normal">Pasif kartları da göster ({inactiveCount})</Label>
          </div>
        )}
      </div>

      {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}

      {loading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><HardHat /></EmptyMedia>
            <EmptyTitle>{items.length === 0 ? "Henüz taşeron kartı yok" : "Bu filtreyle eşleşen kart yok"}</EmptyTitle>
            {items.length === 0 && <EmptyDescription>&quot;Yeni Taşeron&quot; ile ilk kartı oluşturun.</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Firma</TableHead>
                <TableHead>Puan</TableHead>
                <TableHead className="text-right">Açık iş emri</TableHead>
                <TableHead className="text-right">Devam eden proje</TableHead>
                <TableHead>En yakın termin</TableHead>
                <TableHead>İletişim</TableHead>
                <TableHead className="pr-4"><span className="sr-only">İşlemler</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const phone = item.contact_phone ?? item.phone;
                const email = item.contact_email ?? item.email;
                return (
                  <TableRow key={item.id} className={cn(!item.is_active && "opacity-60")}>
                    <TableCell className="max-w-[280px] pl-4">
                      <div className="flex items-start gap-2.5">
                        <CompetencyDot value={item.color} className="mt-1.5" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.company_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{[item.city, item.contact_name].filter(Boolean).join(" · ") || "—"}</p>
                        </div>
                        {!item.is_active && <Badge variant="muted">Pasif</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.rating_avg !== null ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Star className="size-4 fill-amber-400 text-amber-400" />
                          <span className="font-semibold tabular-nums">{formatScore(item.rating_avg)}</span>
                          <span className="text-xs text-muted-foreground">{item.rating_count} iş</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", item.open_work_orders ? "font-semibold" : "text-muted-foreground")}>{item.open_work_orders}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", item.active_projects ? "font-semibold" : "text-muted-foreground")}>{item.active_projects}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {item.nearest_due
                        ? isPast(item.nearest_due)
                          ? <Badge variant="destructive">{formatDay(item.nearest_due)} · gecikti</Badge>
                          : formatDay(item.nearest_due)
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs">
                      <div className="flex flex-col gap-0.5">
                        {phone && <a href={`tel:${phone}`} className="flex items-center gap-1.5 font-medium text-primary hover:underline"><Phone className="size-3.5 shrink-0" />{phone}</a>}
                        {email && <a href={`mailto:${email}`} className="flex min-w-0 items-center gap-1.5 font-medium text-primary hover:underline"><Mail className="size-3.5 shrink-0" /><span className="truncate">{email}</span></a>}
                        {!phone && !email && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="icon" className="size-8" onClick={() => setDialog({ item })} aria-label={`${item.company_name} kartını düzenle`}><Pencil /></Button>
                        <Button variant="ghost" size="sm" onClick={() => item.is_active ? setDeactivate(item) : void setActive(item, true)}>{item.is_active ? "Pasife al" : "Etkinleştir"}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {dialog && <SubcontractorDialog item={dialog.item} onClose={() => setDialog(null)} onSaved={load} />}

      <AlertDialog open={deactivate !== null} onOpenChange={(open) => { if (!open) setDeactivate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kart pasife alınsın mı?</AlertDialogTitle>
            <AlertDialogDescription>{deactivate?.company_name} kartı silinmez; istediğinizde yeniden etkinleştirebilirsiniz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deactivate) void setActive(deactivate, false); setDeactivate(null); }}>Pasife Al</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
