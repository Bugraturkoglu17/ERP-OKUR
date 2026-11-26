"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Spinner } from "@/components/shadcn/spinner";
import { Textarea } from "@/components/shadcn/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { BackLink } from "@/components/ui/back-link";
import { DraftNotice } from "@/components/ui/draft-notice";
import { useSessionDraft } from "@/lib/use-session-draft";
import { forgetCurrent } from "@/lib/nav-history";
import { StorePicker, parseAdres, type StoreOption } from "@/components/store/store-picker";
import { StoreFormModal, defaultStoreForm } from "@/components/store/store-form-modal";
import { apiGet, getRequestErrorMessage } from "@/lib/api";
import { MemberChecklist } from "@/components/installation-projects/project-extras";
import { createProject, PROJECT_TYPE_LABEL, type ProjectType } from "@/services/installationProjects";

type UserRow = { id: string; full_name: string; email: string; is_active: boolean; default_role?: string | null };

/** Bugünün tarihi, yerel saat diliminde YYYY-AA-GG (date input değeri). */
function todayInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const ME = "me"; // "Proje sorumlusu: Ben" seçeneği (shadcn Select boş değer almaz)
const STAGES = ["Keşif", "Projelendirme ve teklif", "Müşteri onayı", "Üretim ve montaj", "Devreye alma ve test", "Teslim", "Kapanış"];

type ProjectDraft = {
  name: string; projectType: ProjectType | null; memberIds: string[]; store: StoreOption | null;
  description: string; managerId: string; startDate: string; targetDate: string;
};

export default function NewProjectPage() {
  const router = useRouter();
  // Başka sayfaya gidip dönünce form kaldığı yerden devam eder (kayıt olunca taslak silinir).
  const draft = useSessionDraft<ProjectDraft>("yeni-proje", {
    name: "", projectType: null, memberIds: [], store: null, description: "", managerId: "", startDate: todayInput(), targetDate: "",
  });
  const { name, projectType, store, description, managerId, startDate, targetDate } = draft.value;
  const memberIds = useMemo(() => new Set(draft.value.memberIds), [draft.value.memberIds]);
  const patch = (changes: Partial<ProjectDraft>) => draft.setValue((current) => ({ ...current, ...changes }));
  const setName = (value: string) => patch({ name: value });
  const setProjectType = (value: ProjectType) => patch({ projectType: value });
  const setStore = (value: StoreOption | null) => patch({ store: value });
  const setDescription = (value: string) => patch({ description: value });
  const setManagerId = (value: string) => patch({ managerId: value });
  const setStartDate = (value: string) => patch({ startDate: value });
  const setTargetDate = (value: string) => patch({ targetDate: value });
  const toggleMember = (id: string) => draft.setValue((current) => ({
    ...current, memberIds: current.memberIds.includes(id) ? current.memberIds.filter((x) => x !== id) : [...current.memberIds, id],
  }));
  const [storeFormOpen, setStoreFormOpen] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<UserRow[]>("/auth/users").then((rows) => setUsers((rows ?? []).filter((u) => u.is_active))).catch(() => undefined);
  }, []);

  async function submit() {
    if (!projectType) { setError("Proje türünü seçin: Mağaza, Soğuk oda veya Soğutma."); return; }
    if (name.trim().length < 2) { setError("Proje adını yazın."); return; }
    if (!store) { setError("Kurulumun yapılacağı mağazayı / yeri seçin."); return; }
    if (!startDate) { setError("Başlangıç tarihini seçin."); return; }
    if (targetDate && targetDate < startDate) { setError("Hedef bitiş, başlangıç tarihinden önce olamaz."); return; }
    setSaving(true); setError("");
    try {
      const created = await createProject({
        name: name.trim(), store_id: store.id, description: description.trim() || null,
        manager_user_id: managerId || null, start_date: startDate, target_date: targetDate || null,
        project_type: projectType, member_user_ids: Array.from(memberIds),
      });
      draft.finish();
      // Kaydedilmiş form geçmişte kalmasın: proje bu sayfanın yerine açılır (geri → projeler listesi).
      forgetCurrent(`${window.location.pathname}${window.location.search}`);
      router.replace(`/manager/projeler/${created.id}`);
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "Proje oluşturulamadı."));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <BackLink fallbackHref="/manager/projeler" fallbackLabel="Projeler" />
      <h1 className="text-2xl font-bold tracking-tight">Yeni Proje<InfoHint text="Proje açılınca aşamalar, kontrol listeleri ve projeye özel bir depo otomatik oluşturulur." /></h1>
      {draft.restored && <DraftNotice onClear={draft.clear} />}

      <Card>
        <CardContent className="p-5 sm:p-7">
          <FieldGroup className="gap-6">
            <FieldSet>
              <FieldLegend variant="label">Proje türü</FieldLegend>
              <FieldDescription>Aşamalar her türde aynıdır. Tür proje oluşturulduktan sonra değiştirilemez.</FieldDescription>
              <ToggleGroup type="single" variant="outline" value={projectType ?? ""} onValueChange={(value) => value && setProjectType(value as ProjectType)}
                className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Proje türü">
                {(["market", "soguk_oda", "sogutma"] as ProjectType[]).map((type) => (
                  <ToggleGroupItem key={type} value={type}
                    className="h-11 rounded-md border font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary data-[state=on]:ring-1 data-[state=on]:ring-primary">
                    {PROJECT_TYPE_LABEL[type]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>

            <Field>
              <FieldLabel htmlFor="p-ad">Proje adı</FieldLabel>
              <Input id="p-ad" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Örn. Kadıköy Migros soğuk oda kurulumu" />
            </Field>

            <Field>
              <FieldLabel>Mağaza / yer</FieldLabel>
              <FieldDescription>Mağaza adı veya koduyla arayın. Listede yoksa bu ekrandan ayrılmadan yeni mağaza ekleyebilirsiniz.</FieldDescription>
              <StorePicker value={store} onChange={setStore} />
              {store && (
                <div className="flex gap-3 rounded-md bg-muted p-4">
                  <Building2 className="size-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">{store.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Kod: {store.project_no ?? "—"}{parseAdres(store.description) ? ` · ${parseAdres(store.description)}` : ""}</p>
                  </div>
                </div>
              )}
              {!store && (
                <div>
                  <Button variant="link" className="h-auto p-0" onClick={() => setStoreFormOpen(true)}>
                    <Plus data-icon="inline-start" />Yeni mağaza / yer kaydı oluştur
                  </Button>
                </div>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="p-aciklama">Açıklama <span className="font-normal text-muted-foreground">(isteğe bağlı)</span></FieldLabel>
              <Textarea id="p-aciklama" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Kurulumun kapsamı, müşteri beklentisi" className="resize-none" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="p-sorumlu">Proje sorumlusu</FieldLabel>
                <Select value={managerId || ME} onValueChange={(value) => setManagerId(value === ME ? "" : value)}>
                  <SelectTrigger id="p-sorumlu"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={ME}>Ben</SelectItem>
                      {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="p-baslangic">Başlangıç tarihi</FieldLabel>
                <Input id="p-baslangic" type="date" required min="2000-01-01" max="2100-12-31" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="p-hedef">Hedef bitiş</FieldLabel>
                <Input id="p-hedef" type="date" min={startDate || "2000-01-01"} max="2100-12-31" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </Field>
            </div>

            <Field>
              <FieldLabel>Projeye atanacak kişiler <span className="font-normal text-muted-foreground">(isteğe bağlı, birden çok seçilebilir)</span></FieldLabel>
              <FieldDescription>Atanan herkes projenin tüm aşamalarını ve maliyetlerini görür. Proje sorumlusu otomatik olarak atanır. Sonradan değiştirilebilir.</FieldDescription>
              <MemberChecklist users={users} selected={memberIds} lockedId={managerId || null} onToggle={toggleMember} />
            </Field>

            <div className="rounded-md bg-muted p-4">
              <p className="text-xs font-semibold text-muted-foreground">Proje şu aşamalardan geçecek</p>
              <ol className="mt-2 flex flex-wrap gap-1.5">{STAGES.map((stage, i) => <li key={stage}><Badge variant="outline" className="bg-background font-normal">{i + 1}. {stage}</Badge></li>)}</ol>
            </div>

            {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex justify-end">
              <Button onClick={() => void submit()} disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Projeyi Oluştur</Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {storeFormOpen && (
        <StoreFormModal mode="create" initial={defaultStoreForm()}
          onClose={() => setStoreFormOpen(false)}
          onDone={(created) => { setStore(created); setError(""); }} />
      )}
    </div>
  );
}
