"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle, ArrowLeft, ArrowRight, Building2, CalendarDays,
  Check, CheckCircle2, FileUp, Loader2, Plus, Truck, UserRound, X,
} from "lucide-react";
import { StorePicker, parseAdres, parseBolge, type StoreOption } from "@/components/store/store-picker";
import { getStoreById } from "@/services/stores";
import {
  CATEGORY_LABEL, PRIORITY_LABEL, createWorkOrder, getCepDepots,
  getManagerWorkOrders, getTeamUsers, type CepDepot, type TeamUser,
  type WorkOrderCategory, type WorkOrderPriority,
} from "@/services/managerWorkOrders";
import { getRequestErrorMessage } from "@/lib/api";
import { uploadFormData } from "@/lib/upload";

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
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [depots, setDepots] = useState<CepDepot[]>([]);
  const [workloads, setWorkloads] = useState<Record<string, { planned: number; active: number }>>({});
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("manager_work_order_draft");
    if (stored) {
      try {
        // Çalışan/depo/malzeme seçimi taslağa alınmaz: stok durumu değişmiş olabilir.
        const { assigneeId: _a, depotId: _d, ...draft } = JSON.parse(stored);
        setForm((current) => ({ ...current, ...draft, store: null }));
      } catch { /* Geçersiz taslak yok sayılır. */ }
    }
    Promise.all([getTeamUsers(), getManagerWorkOrders(), getCepDepots()])
      .then(([team, orders, cepDepots]) => {
        setUsers(team);
        setDepots(cepDepots);
        const next: Record<string, { planned: number; active: number }> = {};
        team.forEach((user) => {
          next[user.id] = {
            planned: orders.filter((order) => order.assigned_to === user.id && order.status === "planned").length,
            active: orders.filter((order) => order.assigned_to === user.id && order.status === "in_progress").length,
          };
        });
        setWorkloads(next);
      })
      .catch(() => setError("Çalışan ve cep depo bilgileri yüklenemedi."));
  }, []);

  useEffect(() => {
    const storeId = params.get("storeId");
    if (!storeId) return;
    getStoreById(storeId).then((store) => setForm((current) => ({ ...current, store }))).catch(() => setError("Seçilen mağaza bulunamadı."));
  }, [params]);

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

  function openStoreCreation() {
    sessionStorage.setItem("manager_work_order_draft", JSON.stringify({
      category: form.category, priority: form.priority, title: form.title,
      description: form.description, dueDate: form.dueDate,
    }));
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
      });
      setCreatedId(created.id);
      sessionStorage.removeItem("manager_work_order_draft");
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
      <div className="mx-auto max-w-2xl rounded-xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-4 text-xl font-bold text-slate-950">İş emri oluşturuldu ve kullanıcıya atandı.</h1>
        <p className="mt-2 text-sm text-slate-500">
          Yeni kayıt Planlanacak bölümüne eklendi. Kullanılan malzemeler iş tamamlanınca {selectedDepot?.plate ?? "cep depo"} deposundan otomatik düşülecek.
        </p>
        {error && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">{error}</p>}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href={`/manager/is-emirleri/${createdId}`} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">İş Emrini Gör</Link>
          <Link href="/manager/is-emirleri" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Listeye Dön</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/manager/is-emirleri" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />İş Emirleri</Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Yeni İş Emri</h1>
        <p className="mt-1 text-sm text-slate-500">Mağazayı seçin, işi tanımlayın, çalışanı ve stoğun düşüleceği cep deposunu belirleyin.</p>
      </header>

      <ol className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {steps.map((label, index) => (
          <li key={label} className={`flex items-center gap-2 border-r border-slate-100 px-3 py-3 text-xs font-semibold last:border-r-0 sm:text-sm ${index === step ? "bg-slate-950 text-white" : index < step ? "text-emerald-700" : "text-slate-400"}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${index === step ? "bg-white text-slate-950" : index < step ? "bg-emerald-100" : "bg-slate-100"}`}>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
            <span className="min-w-0 text-center text-[10px] leading-tight sm:text-left sm:text-sm">{label}</span>
          </li>
        ))}
      </ol>

      <main className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <label className="text-sm font-semibold text-slate-800">İş Tipi</label>
              <div className="mt-2 grid grid-cols-3 gap-2">{Object.entries(CATEGORY_LABEL).map(([value, label]) => <button key={value} type="button" onClick={() => setForm((current) => ({ ...current, category: value as WorkOrderCategory }))} className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${form.category === value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Öncelik</label>
              <div className="mt-2 grid grid-cols-3 gap-2">{Object.entries(PRIORITY_LABEL).map(([value, label]) => <button key={value} type="button" onClick={() => setForm((current) => ({ ...current, priority: value as WorkOrderPriority }))} className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${form.priority === value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Mağaza</label>
              <p className="mt-1 text-xs text-slate-500">Mağaza adı veya koduyla arayın.</p>
              <div className="mt-2"><StorePicker value={form.store} onChange={(store) => setForm((current) => ({ ...current, store }))} /></div>
              {form.store && <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[auto_1fr]"><Building2 className="h-5 w-5 text-blue-600" /><div><p className="font-semibold text-slate-900">{form.store.name}</p><p className="mt-1 text-xs text-slate-500">Kod: {form.store.project_no ?? "Kayıtlı değil"}{parseBolge(form.store.description) ? ` | ${parseBolge(form.store.description)}` : ""}</p>{parseAdres(form.store.description) && <p className="mt-1 text-xs text-slate-500">{parseAdres(form.store.description)}</p>}</div></div>}
              {form.category === "yeni_yapim" && !form.store && <Link onClick={openStoreCreation} href="/manager/magaza-karti" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"><Plus className="h-4 w-4" />Yeni Mağaza Kartı Oluştur</Link>}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <label className="block"><span className="text-sm font-semibold text-slate-800">İş Başlığı</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Örnek: Soğutma ünitesi arızası" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>
            <label className="block"><span className="text-sm font-semibold text-slate-800">İş Açıklaması</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={5} placeholder="Yapılacak işi ve beklenen sonucu açıklayın." className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>
            <label className="block min-w-0"><span className="text-sm font-semibold text-slate-800">Termin Tarihi</span><div className="relative mt-2 w-full min-w-0 max-w-sm overflow-hidden"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} className="block w-full min-w-0 max-w-full appearance-none rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div></label>
            <div><span className="text-sm font-semibold text-slate-800">Başlangıç Eki</span><p className="mt-1 text-xs text-slate-500">İsteğe bağlı JPG, PNG, PDF veya DWG dosyası.</p><button type="button" disabled={saving} onClick={() => fileRef.current?.click()} className="mt-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileUp className="h-4 w-4 shrink-0" /><span className="truncate">{attachment ? attachment.name : "Dosya Seç"}</span></button>{attachment && <button type="button" disabled={saving} onClick={() => setAttachment(null)} className="ml-2 p-2 text-slate-400 hover:text-red-600 disabled:opacity-50"><X className="h-4 w-4" /></button>}<input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf,.dwg" className="hidden" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} />{uploadProgress !== null && <div className="mt-3 max-w-sm"><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600 transition-[width]" style={{ width: `${uploadProgress}%` }} /></div><p className="mt-1 text-right text-xs text-slate-500">Başlangıç eki %{uploadProgress}</p></div>}</div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section>
              <h2 className="text-sm font-semibold text-slate-800">Atanacak Çalışan</h2>
              <p className="mt-1 text-xs text-slate-500">Malzeme, çalışanın zimmetindeki cep depodan düşülür.</p>
              <div className="mt-3 space-y-2">
                {users.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Atama yapılabilecek aktif çalışan bulunamadı.</p> : users.map((user) => {
                  const load = workloads[user.id] ?? { planned: 0, active: 0 };
                  const owned = depotsByUser[user.id] ?? [];
                  const selected = form.assigneeId === user.id;
                  return (
                    <button key={user.id} type="button" disabled={owned.length === 0} onClick={() => selectAssignee(user.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><UserRound className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{user.full_name || user.email}</span>
                        <span className="block text-xs text-slate-500">{load.planned} Planlanacak, {load.active} Devam Eden</span>
                        <span className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${owned.length ? "text-emerald-700" : "text-amber-700"}`}>
                          <Truck className="h-3 w-3" />{owned.length ? owned.map((depot) => depot.plate).join(", ") : "Cep depo tanımlı değil"}
                        </span>
                      </span>
                      {selected && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
                    </button>
                  );
                })}
              </div>
              {users.length > 0 && users.every((user) => (depotsByUser[user.id] ?? []).length === 0) && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Hiçbir çalışana cep depo zimmetlenmemiş. <Link href="/manager/depo-stok" className="font-semibold underline">Depo & Stok</Link> bölümünden araç deposu oluşturup çalışana atayın.</p>
              )}
            </section>
            <section>
              <h2 className="text-sm font-semibold text-slate-800">Cep Depo</h2>
              <p className="mt-1 text-xs text-slate-500">Stok bu depodan düşülecek.</p>
              {!form.assigneeId ? (
                <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Önce çalışanı seçin; zimmetli cep depoları burada görünür.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {userDepots.map((depot) => (
                    <button key={depot.id} type="button" onClick={() => selectDepot(depot.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${form.depotId === depot.id ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Truck className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{depot.plate}</span><span className="block truncate text-xs text-slate-500">{depot.name} · {selectedUser?.full_name || selectedUser?.email}</span></span>
                      {form.depotId === depot.id && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
                    </button>
                  ))}
                  {userDepots.length === 0 && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Bu çalışana zimmetli cep depo yok.</p>}
                </div>
              )}
            </section>
            <aside className="rounded-xl bg-slate-950 p-5 text-white lg:col-span-2"><h2 className="text-sm font-semibold">İş Emri Özeti</h2><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-slate-400">İş</dt><dd className="mt-0.5 font-medium">{form.title}</dd></div>
              <div><dt className="text-xs text-slate-400">Mağaza</dt><dd className="mt-0.5">{form.store?.name}</dd></div>
              <div><dt className="text-xs text-slate-400">İş Tipi / Öncelik</dt><dd className="mt-0.5">{form.category ? CATEGORY_LABEL[form.category] : "Seçilmedi"} · {PRIORITY_LABEL[form.priority]}</dd></div>
              <div><dt className="text-xs text-slate-400">Termin</dt><dd className="mt-0.5">{form.dueDate ? new Date(form.dueDate).toLocaleDateString("tr-TR") : "Belirtilmedi"}</dd></div>
              <div><dt className="text-xs text-slate-400">Atanan</dt><dd className="mt-0.5">{selectedUser?.full_name || selectedUser?.email || "Seçilmedi"}</dd></div>
              <div><dt className="text-xs text-slate-400">Cep Depo</dt><dd className="mt-0.5">{selectedDepot ? `${selectedDepot.plate} · ${selectedDepot.name}` : "Seçilmedi"}</dd></div>
            </dl><p className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-300">Kullanılan malzemeler ve servis formu, çalışan işi tamamlarken girilir. Tamamlandı denince miktarlar seçili cep depodan otomatik düşer ve yöneticiye bildirilir.</p></aside>
          </div>
        )}

        {error && <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        <footer className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5">
          <button type="button" onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0 || saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Geri</button>
          {step < 2 ? <button type="button" onClick={nextStep} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Devam Et <ArrowRight className="h-4 w-4" /></button> : <button type="button" onClick={submit} disabled={saving || users.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}İş Emrini Oluştur</button>}
        </footer>
      </main>
    </div>
  );
}
