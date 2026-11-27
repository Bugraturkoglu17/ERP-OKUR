"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { forgetCurrent } from "@/lib/nav-history";
import {
  AlertCircle, ArrowLeft, ArrowRight, Building2, CalendarDays,
  Check, CheckCircle2, FileUp, FolderKanban, Plus, Truck, UserRound, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/shadcn/alert";
import { Button, buttonVariants } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Progress } from "@/components/shadcn/progress";
import { Separator } from "@/components/shadcn/separator";
import { Spinner } from "@/components/shadcn/spinner";
import { Textarea } from "@/components/shadcn/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { StorePicker, parseAdres, parseBolge, type StoreOption } from "@/components/store/store-picker";
import { StoreFormModal, defaultStoreForm } from "@/components/store/store-form-modal";
import { getStoreById } from "@/services/stores";
import { getProject, type ProjectDetail } from "@/services/installationProjects";
import {
  CATEGORY_LABEL, CREATABLE_CATEGORIES, PRIORITY_LABEL, createWorkOrder, getCepDepots,
  getTeamUsers, getWorkOrderSummary, type CepDepot, type TeamUser,
  type WorkOrderCategory, type WorkOrderPriority,
} from "@/services/managerWorkOrders";
import { getRequestErrorMessage } from "@/lib/api";
import { uploadFormData } from "@/lib/upload";
import { useSessionDraft } from "@/lib/use-session-draft";
import { BackLink } from "@/components/ui/back-link";
import { DraftNotice } from "@/components/ui/draft-notice";

type FormState = {
  category: WorkOrderCategory | "";
  priority: WorkOrderPriority;
  store: StoreOption | null;
  title: string;
  description: string;
  dueDate: string;
  assigneeId: string;
  depotId: string;
};

const initialForm: FormState = {
  category: "", priority: "normal", store: null,
  title: "", description: "", dueDate: "", assigneeId: "", depotId: "",
};

const steps = ["İş & Mağaza", "İş Detayları", "Atama & Cep Depo"];

export default function NewWorkOrderPage() {
  const params = useSearchParams();
  const router = useRouter();
  // Başka sayfaya gidip dönünce form ve adım kaldığı yerden devam eder (kayıt olunca taslak silinir).
  const draft = useSessionDraft<{ form: FormState; step: number }>(
    `yeni-is-emri:${params.get("proje") ?? ""}:${params.get("storeId") ?? ""}`, { form: initialForm, step: 0 });
  const { form, step } = draft.value;
  const setDraft = draft.setValue;
  const setForm = useCallback((update: FormState | ((current: FormState) => FormState)) =>
    setDraft((current) => ({ ...current, form: typeof update === "function" ? update(current.form) : update })), [setDraft]);
  const setStep = useCallback((update: number | ((current: number) => number)) =>
    setDraft((current) => ({ ...current, step: typeof update === "function" ? update(current.step) : update })), [setDraft]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [depots, setDepots] = useState<CepDepot[]>([]);
  const [workloads, setWorkloads] = useState<Record<string, { planned: number; active: number }>>({});
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // ?proje=<id>: projenin içinden açılan montaj/test iş emri; mağaza ve depo projeden gelir.
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [storeFormOpen, setStoreFormOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Çalışan yükü sunucudaki özetten gelir (tüm iş emirleri çekilmez).
    Promise.all([getTeamUsers(), getWorkOrderSummary(), getCepDepots()])
      .then(([team, summary, cepDepots]) => {
        setUsers(team);
        setDepots(cepDepots);
        const next: Record<string, { planned: number; active: number }> = {};
        team.forEach((user) => {
          const mine = summary.by_user[user.id];
          next[user.id] = { planned: mine?.planned ?? 0, active: mine?.in_progress ?? 0 };
        });
        setWorkloads(next);
      })
      .catch(() => setError("Çalışan ve cep depo bilgileri yüklenemedi."));
  }, []);

  useEffect(() => {
    const projectId = params.get("proje");
    if (!projectId) return;
    getProject(projectId)
      .then(async (detail) => {
        setProject(detail);
        const store = detail.store ? await getStoreById(detail.store.id) : null;
        // Taslaktan gelen tip korunur; ilk açılışta varsayılan montaj (Proje) işidir.
        setForm((current) => ({ ...current, category: current.category || "proje", store }));
      })
      .catch(() => setError("Bağlanacak proje bulunamadı."));
  }, [params, setForm]);

  useEffect(() => {
    const storeId = params.get("storeId");
    if (!storeId) return;
    getStoreById(storeId).then((store) => setForm((current) => ({ ...current, store }))).catch(() => setError("Seçilen mağaza bulunamadı."));
  }, [params, setForm]);

  const depotsByUser = useMemo(() => {
    const map: Record<string, CepDepot[]> = {};
    depots.forEach((depot) => { if (depot.assigned_user_id) (map[depot.assigned_user_id] ??= []).push(depot); });
    return map;
  }, [depots]);

  const selectedUser = useMemo(() => users.find((user) => user.id === form.assigneeId), [users, form.assigneeId]);
  const selectedDepot = useMemo(() => depots.find((depot) => depot.id === form.depotId), [depots, form.depotId]);
  const userDepots = form.assigneeId ? depotsByUser[form.assigneeId] ?? [] : [];

  function selectAssignee(userId: string) {
    const owned = depotsByUser[userId] ?? [];
    // Çalışanın tek cep deposu varsa otomatik seçilir; birden fazlaysa kullanıcı seçer.
    setForm((current) => ({ ...current, assigneeId: userId, depotId: owned.length === 1 ? owned[0].id : "" }));
    setError("");
  }

  function selectDepot(depotId: string) {
    setForm((current) => ({ ...current, depotId }));
    setError("");
  }

  function validateCurrentStep() {
    if (step === 0 && !form.category) return "İş tipini seçin.";
    if (step === 0 && form.category === "proje" && !project) return "Proje iş emirleri projenin içinden açılır; önce projeyi oluşturun.";
    if (step === 0 && !form.store) return "Mağazayı seçin.";
    if (step === 1 && !form.title.trim()) return "İş başlığını yazın.";
    if (step === 1 && !form.description.trim()) return "İş açıklamasını yazın.";
    if (step === 2 && !form.assigneeId) return "Atanacak çalışanı seçin.";
    if (step === 2 && userDepots.length === 0) return "Seçilen çalışana zimmetli bir cep depo yok.";
    if (step === 2 && !form.depotId) return "Stoğun düşüleceği cep depoyu seçin.";
    return "";
  }

  function nextStep() {
    const message = validateCurrentStep();
    if (message) { setError(message); return; }
    setError("");
    setStep((current) => Math.min(2, current + 1));
  }

  async function uploadAttachment(workOrderId: string) {
    if (!attachment) return;
    const body = new FormData();
    body.append("photo_type", "before");
    body.append("file", attachment);
    setUploadProgress(0);
    await uploadFormData(`/work-orders/${workOrderId}/photos`, {
      formData: body,
      onProgress: setUploadProgress,
    });
  }

  async function submit() {
    const message = validateCurrentStep();
    if (message) { setError(message); return; }
    if (!form.category || !form.store || !form.depotId) return;
    setSaving(true); setError("");
    try {
      const created = await createWorkOrder({
        title: form.title.trim(), description: form.description.trim(),
        category: form.category, priority: form.priority,
        store_id: form.store.id, assigned_to: form.assigneeId,
        due_date: form.dueDate || null, stock_depot_id: form.depotId,
        installation_project_id: project?.id ?? null,
      });
      setCreatedId(created.id);
      draft.finish();
      try { await uploadAttachment(created.id); } catch {
        // İş emri ve stok çıkışı tamamlandı; yalnızca ek yüklenemedi.
        setError("İş emri oluşturuldu, ancak başlangıç eki yüklenemedi. Detay sayfasından tekrar ekleyebilirsiniz.");
      }
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "İş emri oluşturulamadı. Lütfen tekrar deneyin."));
    } finally { setSaving(false); }
  }


  if (createdId) {
    return (
      <Card className="mx-auto max-w-2xl border-emerald-200">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <h1 className="text-xl font-bold">İş emri oluşturuldu ve kullanıcıya atandı.</h1>
          <p className="text-sm text-muted-foreground">
            Yeni kayıt Planlanacak bölümüne eklendi. Kullanılan malzemeler iş tamamlanınca {selectedDepot?.plate ?? "cep depo"} deposundan otomatik düşülecek.
          </p>
          {error && <Alert className="border-amber-200 bg-amber-50 text-amber-900"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
            {/* Kaydedilmiş form geçmişte kalmasın: iş emri bu sayfanın yerine açılır, geri → proje / mağaza kartı. */}
            <Button onClick={() => { forgetCurrent(`${window.location.pathname}${window.location.search}`); router.replace(`/manager/is-emirleri/${createdId}`); }}>İş Emrini Gör</Button>
            {/* Geldiği yere döner: projeden açıldıysa proje, mağaza kartından açıldıysa mağaza kartı. */}
            <BackLink fallbackHref={project ? `/manager/projeler/${project.id}` : "/manager/is-emirleri"} fallbackLabel={project ? "Proje" : "İş Emirleri"}
              className={buttonVariants({ variant: "outline" })} />
            {(project || params.get("storeId")) && <Button variant="outline" asChild><Link href="/manager/is-emirleri">İş Emirleri Listesi</Link></Button>}
          </div>
        </CardContent>
      </Card>
    );
  }

  /** Seçim kartı (çalışan / cep depo): seçiliyken çerçeve ana renkte. */
  const choiceClass = (selected: boolean) => cn(
    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
  );
  const optionItemClass = "h-11 rounded-md border font-medium data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <BackLink fallbackHref="/manager/is-emirleri" fallbackLabel="İş Emirleri" />
      <h1 className="text-2xl font-bold tracking-tight">Yeni İş Emri<InfoHint text="Mağazayı seçin, işi tanımlayın, çalışanı ve stoğun düşüleceği cep deposunu belirleyin." /></h1>
      {draft.restored && <DraftNotice onClear={draft.clear} />}

      <ol className="grid grid-cols-3 overflow-hidden rounded-lg border bg-card" aria-label="Adımlar">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined}
            className={cn("flex items-center gap-2 border-r px-3 py-3 text-xs font-semibold last:border-r-0 sm:text-sm",
              index === step ? "bg-primary text-primary-foreground" : index < step ? "text-emerald-700" : "text-muted-foreground")}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]",
              index === step ? "bg-primary-foreground text-primary" : index < step ? "bg-emerald-100" : "bg-muted")}>
              {index < step ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className="min-w-0 text-center text-[10px] leading-tight sm:text-left sm:text-sm">{label}</span>
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="p-5 sm:p-7">
          {step === 0 && (
            <FieldGroup className="gap-6">
              <FieldSet>
                <FieldLegend variant="label">İş Tipi</FieldLegend>
                <ToggleGroup type="single" variant="outline" value={form.category} onValueChange={(value) => value && setForm((current) => ({ ...current, category: value as WorkOrderCategory }))}
                  className="grid grid-cols-3 gap-2" aria-label="İş tipi">
                  {CREATABLE_CATEGORIES.map((value) => (
                    <ToggleGroupItem key={value} value={value} className={optionItemClass}>{value === "proje" && project ? "Montaj (Proje)" : CATEGORY_LABEL[value]}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {project && (
                  <Alert className="border-teal-200 bg-teal-50 text-teal-900">
                    <FolderKanban />
                    <AlertDescription>Bu iş emri <b>{project.name}</b> projesine bağlanacak. Mağaza projeden alınır; malzeme çalışanın cep deposundan düşer ve tutarı projenin gerçekleşen maliyetine otomatik eklenir.</AlertDescription>
                  </Alert>
                )}
                {form.category === "proje" && !project && (
                  <Alert className="border-teal-200 bg-teal-50 text-teal-900">
                    <AlertTitle>Proje, çok aşamalı bir kurulum sürecidir.</AlertTitle>
                    <AlertDescription className="flex flex-col items-start gap-3">
                      <span>Önce proje açılır; keşif, teklif, onay, malzeme, montaj, test, teslim ve kapanış aşamaları projeden yönetilir. Montaj iş emirleri projenin içinden eklenir.</span>
                      <Button size="sm" asChild className="bg-teal-700 hover:bg-teal-800"><Link href="/manager/projeler/yeni"><Plus data-icon="inline-start" />Yeni Proje Oluştur</Link></Button>
                    </AlertDescription>
                  </Alert>
                )}
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Öncelik</FieldLegend>
                <ToggleGroup type="single" variant="outline" value={form.priority} onValueChange={(value) => value && setForm((current) => ({ ...current, priority: value as WorkOrderPriority }))}
                  className="grid grid-cols-3 gap-2" aria-label="Öncelik">
                  {Object.entries(PRIORITY_LABEL).map(([value, label]) => <ToggleGroupItem key={value} value={value} className={optionItemClass}>{label}</ToggleGroupItem>)}
                </ToggleGroup>
              </FieldSet>
              <Field>
                <FieldLabel>Mağaza</FieldLabel>
                <FieldDescription>Mağaza adı veya koduyla arayın.</FieldDescription>
                {!project && <StorePicker value={form.store} onChange={(store) => setForm((current) => ({ ...current, store }))} />}
                {form.store && (
                  <div className="grid gap-3 rounded-md bg-muted p-4 sm:grid-cols-[auto_1fr]">
                    <Building2 className="size-5 text-primary" />
                    <div>
                      <p className="font-semibold">{form.store.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Kod: {form.store.project_no ?? "Kayıtlı değil"}{parseBolge(form.store.description) ? ` | ${parseBolge(form.store.description)}` : ""}</p>
                      {parseAdres(form.store.description) && <p className="mt-1 text-xs text-muted-foreground">{parseAdres(form.store.description)}</p>}
                    </div>
                  </div>
                )}
                {!project && !form.store && <div><Button variant="link" className="h-auto p-0" onClick={() => setStoreFormOpen(true)}><Plus data-icon="inline-start" />Yeni Mağaza Kartı Oluştur</Button></div>}
              </Field>
            </FieldGroup>
          )}

          {step === 1 && (
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="wo-baslik">İş Başlığı</FieldLabel>
                <Input id="wo-baslik" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Örnek: Soğutma ünitesi arızası" />
              </Field>
              <Field>
                <FieldLabel htmlFor="wo-aciklama">İş Açıklaması</FieldLabel>
                <Textarea id="wo-aciklama" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={5} placeholder="Yapılacak işi ve beklenen sonucu açıklayın." className="resize-none" />
              </Field>
              <Field className="max-w-sm">
                <FieldLabel htmlFor="wo-termin">Termin Tarihi</FieldLabel>
                <InputGroup>
                  <InputGroupAddon><CalendarDays /></InputGroupAddon>
                  <InputGroupInput id="wo-termin" type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
                </InputGroup>
              </Field>
              <Field>
                <FieldLabel>Başlangıç Eki</FieldLabel>
                <FieldDescription>İsteğe bağlı JPG, PNG, PDF veya DWG dosyası.</FieldDescription>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={saving} onClick={() => fileRef.current?.click()} className="max-w-full"><FileUp data-icon="inline-start" /><span className="truncate">{attachment ? attachment.name : "Dosya Seç"}</span></Button>
                  {attachment && <Button variant="ghost" size="icon" disabled={saving} onClick={() => setAttachment(null)} aria-label="Eki kaldır" className="text-muted-foreground hover:text-destructive"><X /></Button>}
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf,.dwg" className="hidden" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />
                {uploadProgress !== null && (
                  <div className="max-w-sm">
                    <Progress value={uploadProgress} className="h-1.5" />
                    <p className="mt-1 text-right text-xs text-muted-foreground">Başlangıç eki %{uploadProgress}</p>
                  </div>
                )}
              </Field>
            </FieldGroup>
          )}

          {step === 2 && (
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <section>
                <h2 className="text-sm font-semibold">Atanacak Çalışan<InfoHint text="Malzeme, çalışanın zimmetindeki cep depodan düşülür." /></h2>
                <div className="mt-3 flex flex-col gap-2">
                  {users.length === 0 ? <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">Atama yapılabilecek aktif çalışan bulunamadı.</p> : users.map((user) => {
                    const load = workloads[user.id] ?? { planned: 0, active: 0 };
                    const owned = depotsByUser[user.id] ?? [];
                    const selected = form.assigneeId === user.id;
                    return (
                      <button key={user.id} type="button" disabled={owned.length === 0} onClick={() => selectAssignee(user.id)} aria-pressed={selected} className={choiceClass(selected)}>
                        <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground"><UserRound className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{user.full_name || user.email}</span>
                          <span className="block text-xs text-muted-foreground">{load.planned} Planlanacak, {load.active} Devam Eden</span>
                          <span className={cn("mt-0.5 flex items-center gap-1 text-xs font-medium", owned.length ? "text-emerald-700" : "text-amber-700")}>
                            <Truck className="size-3" />{owned.length ? owned.map((depot) => depot.plate).join(", ") : "Cep depo tanımlı değil"}
                          </span>
                        </span>
                        {selected && <CheckCircle2 className="size-5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
                {users.length > 0 && users.every((user) => (depotsByUser[user.id] ?? []).length === 0) && (
                  <Alert className="mt-3 border-amber-200 bg-amber-50 text-amber-900"><AlertDescription className="text-xs">Hiçbir çalışana cep depo zimmetlenmemiş. <Link href="/manager/depo-stok" className="font-semibold underline">Depo & Stok</Link> bölümünden araç deposu oluşturup çalışana atayın.</AlertDescription></Alert>
                )}
              </section>
              <section>
                <h2 className="text-sm font-semibold">Cep Depo<InfoHint text="Stok bu depodan düşülecek." /></h2>
                {!form.assigneeId ? (
                  <p className="mt-3 rounded-md bg-muted p-4 text-sm text-muted-foreground">Önce çalışanı seçin; zimmetli cep depoları burada görünür.</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {userDepots.map((depot) => (
                      <button key={depot.id} type="button" onClick={() => selectDepot(depot.id)} aria-pressed={form.depotId === depot.id} className={choiceClass(form.depotId === depot.id)}>
                        <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground"><Truck className="size-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{depot.plate}</span><span className="block truncate text-xs text-muted-foreground">{depot.name} · {selectedUser?.full_name || selectedUser?.email}</span></span>
                        {form.depotId === depot.id && <CheckCircle2 className="size-5 text-primary" />}
                      </button>
                    ))}
                    {userDepots.length === 0 && <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">Bu çalışana zimmetli cep depo yok.</p>}
                  </div>
                )}
              </section>
              <aside className="rounded-lg bg-sidebar p-5 text-sidebar-foreground lg:col-span-2">
                <h2 className="text-sm font-semibold text-white">İş Emri Özeti</h2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-sidebar-foreground/60">İş</dt><dd className="mt-0.5 font-medium">{form.title}</dd></div>
                  <div><dt className="text-xs text-sidebar-foreground/60">Mağaza</dt><dd className="mt-0.5">{form.store?.name}</dd></div>
                  <div><dt className="text-xs text-sidebar-foreground/60">İş Tipi / Öncelik</dt><dd className="mt-0.5">{form.category ? CATEGORY_LABEL[form.category] : "Seçilmedi"} · {PRIORITY_LABEL[form.priority]}</dd></div>
                  <div><dt className="text-xs text-sidebar-foreground/60">Termin</dt><dd className="mt-0.5">{form.dueDate ? new Date(form.dueDate).toLocaleDateString("tr-TR") : "Belirtilmedi"}</dd></div>
                  <div><dt className="text-xs text-sidebar-foreground/60">Atanan</dt><dd className="mt-0.5">{selectedUser?.full_name || selectedUser?.email || "Seçilmedi"}</dd></div>
                  <div><dt className="text-xs text-sidebar-foreground/60">Cep Depo</dt><dd className="mt-0.5">{selectedDepot ? `${selectedDepot.plate} · ${selectedDepot.name}` : "Seçilmedi"}</dd></div>
                </dl>
                <p className="mt-4 border-t border-sidebar-border pt-3 text-xs text-sidebar-foreground/70">Kullanılan malzemeler ve servis formu, çalışan işi tamamlarken girilir. Tamamlandı denince miktarlar seçili cep depodan otomatik düşer ve yöneticiye bildirilir.</p>
              </aside>
            </div>
          )}

          {error && <Alert variant="destructive" className="mt-5"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
          <Separator className="mt-7" />
          <footer className="flex items-center justify-between pt-5">
            <Button variant="outline" onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0 || saving}><ArrowLeft data-icon="inline-start" />Geri</Button>
            {step < 2
              ? <Button onClick={nextStep}>Devam Et<ArrowRight data-icon="inline-end" /></Button>
              : <Button onClick={() => void submit()} disabled={saving || users.length === 0}>{saving ? <Spinner data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}İş Emrini Oluştur</Button>}
          </footer>
        </CardContent>
      </Card>

      {storeFormOpen && (
        <StoreFormModal mode="create" initial={defaultStoreForm()}
          onClose={() => setStoreFormOpen(false)}
          onDone={(created) => { setForm((current) => ({ ...current, store: created })); setError(""); }} />
      )}
    </div>
  );
}
