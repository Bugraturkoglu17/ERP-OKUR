"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Building2, Loader2, Plus } from "lucide-react";
import { StorePicker, parseAdres, type StoreOption } from "@/components/store/store-picker";
import { apiGet, getRequestErrorMessage } from "@/lib/api";
import { createProject } from "@/services/installationProjects";

type UserRow = { id: string; full_name: string; email: string; is_active: boolean; default_role?: string | null };

const STAGES = ["Keşif", "Projelendirme ve teklif", "Müşteri onayı", "Malzeme hazırlığı", "Montaj", "Devreye alma ve test", "Teslim", "Kapanış"];

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [store, setStore] = useState<StoreOption | null>(null);
  const [description, setDescription] = useState("");
  const [managerId, setManagerId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [budget, setBudget] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<UserRow[]>("/auth/users").then((rows) => setUsers((rows ?? []).filter((u) => u.is_active))).catch(() => undefined);
  }, []);

  async function submit() {
    if (name.trim().length < 2) { setError("Proje adını yazın."); return; }
    if (!store) { setError("Kurulumun yapılacağı mağazayı / yeri seçin."); return; }
    const amount = budget.trim().replace(/\./g, "").replace(",", ".");
    if (amount && !/^\d+(\.\d{1,2})?$/.test(amount)) { setError("Bütçe sayı olmalı (örn. 250000 veya 250.000,50)."); return; }
    setSaving(true); setError("");
    try {
      const created = await createProject({
        name: name.trim(), store_id: store.id, description: description.trim() || null,
        manager_user_id: managerId || null, target_date: targetDate || null, budget: amount || null,
      });
      router.push(`/manager/projeler/${created.id}`);
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "Proje oluşturulamadı."));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/manager/projeler" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Projeler</Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Yeni Proje</h1>
        <p className="mt-1 text-sm text-slate-500">Proje açılınca 8 aşama, kontrol listeleri ve projeye özel bir depo otomatik oluşturulur.</p>
      </header>

      <main className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <label className="block"><span className="text-sm font-semibold text-slate-800">Proje adı</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Örn. Kadıköy Migros soğuk oda kurulumu" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>

        <div>
          <span className="text-sm font-semibold text-slate-800">Mağaza / yer</span>
          <p className="mt-1 text-xs text-slate-500">Mağaza adı veya koduyla arayın. Listede yoksa önce Mağaza Kartı&apos;ndan yeni kayıt açın.</p>
          <div className="mt-2"><StorePicker value={store} onChange={setStore} /></div>
          {store && <div className="mt-3 flex gap-3 rounded-xl bg-slate-50 p-4"><Building2 className="h-5 w-5 shrink-0 text-blue-600" /><div><p className="font-semibold text-slate-900">{store.name}</p><p className="mt-1 text-xs text-slate-500">Kod: {store.project_no ?? "—"}{parseAdres(store.description) ? ` · ${parseAdres(store.description)}` : ""}</p></div></div>}
          {!store && <Link href="/manager/magaza-karti" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"><Plus className="h-4 w-4" />Yeni mağaza / yer kaydı oluştur</Link>}
        </div>

        <label className="block"><span className="text-sm font-semibold text-slate-800">Açıklama <span className="font-normal text-slate-400">(isteğe bağlı)</span></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Kurulumun kapsamı, müşteri beklentisi" className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><span className="text-sm font-semibold text-slate-800">Proje sorumlusu</span>
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              <option value="">Ben</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </select></label>
          <label className="block"><span className="text-sm font-semibold text-slate-800">Hedef bitiş</span>
            <input type="date" min="2000-01-01" max="2100-12-31" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
          <label className="block"><span className="text-sm font-semibold text-slate-800">Bütçe / teklif (₺)</span>
            <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="isteğe bağlı" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-600">Proje şu aşamalardan geçecek</p>
          <ol className="mt-2 flex flex-wrap gap-1.5">{STAGES.map((stage, i) => <li key={stage} className="rounded-lg bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">{i + 1}. {stage}</li>)}</ol>
        </div>

        {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        <div className="flex justify-end">
          <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Projeyi Oluştur
          </button>
        </div>
      </main>
    </div>
  );
}
