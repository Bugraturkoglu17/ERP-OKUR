"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useState } from "react";
import Link from "next/link";
import { Factory, Loader2, Plus, ReceiptText, Trash2, Users, Wallet } from "lucide-react";
import { MoneyInput, moneyInputFromNumber, parseMoneyInput } from "@/components/form/money-input";
import { getRequestErrorMessage } from "@/lib/api";
import { formatServerDate, formatServerDateTime } from "@/lib/utils";
import {
  PROJECT_TYPES, PROJECT_TYPE_LABEL, addProductionNumber, deleteProductionNumber, saveProjectBilling, saveProjectCosts, saveProjectMembers,
  type CostCategory, type CostKind, type ProductionNumber, type ProjectBilling, type ProjectCosts, type ProjectDetail, type ProjectMember, type ProjectType,
} from "@/services/installationProjects";

type UserOption = { id: string; full_name: string; email: string };
type Handlers = { onChanged: () => Promise<void>; onError: (message: string) => void };

const money = (value?: string | number | null) => Number(value ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Proje türü: Market / Soğuk oda / Soğutma. Yönetici değiştirebilir; diğerleri yalnızca görür. */
export function ProjectTypeSwitch({ value, editable, busy = false, onChange }: {
  value: ProjectType; editable: boolean; busy?: boolean; onChange?: (next: ProjectType) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Proje türü" className="inline-grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {PROJECT_TYPES.map((type) => {
        const active = type === value;
        return (
          <button key={type} type="button" role="radio" aria-checked={active} disabled={busy || (!editable && !active)}
            onClick={() => { if (editable && !active) onChange?.(type); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? "bg-slate-950 text-white shadow-sm" : editable ? "text-slate-600 hover:bg-white" : "text-slate-300"} ${!editable ? "cursor-default" : ""}`}>
            {PROJECT_TYPE_LABEL[type]}
          </button>
        );
      })}
    </div>
  );
}

/** Kullanıcı listesinden çoklu seçim (yeni proje formu ve atama düzenleme için ortak). */
export function MemberChecklist({ users, selected, onToggle }: { users: UserOption[]; selected: Set<string>; onToggle: (id: string) => void }) {
  if (users.length === 0) return <p className="text-sm text-slate-500">Kullanıcı bulunamadı.</p>;
  return (
    <ul className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
      {users.map((u) => (
        <li key={u.id}>
          <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${selected.has(u.id) ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
            <input type="checkbox" checked={selected.has(u.id)} onChange={() => onToggle(u.id)} className="h-4 w-4 accent-blue-600" />
            <span className="min-w-0 truncate text-slate-800">{u.full_name || u.email}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function MembersCard({ projectId, members, users, editable, onChanged, onError }: {
  projectId: string; members: ProjectMember[]; users: UserOption[]; editable: boolean;
} & Handlers) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function start() { setSelected(new Set(members.map((m) => m.id))); setEditing(true); }
  function toggle(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function save() {
    setSaving(true); onError("");
    try { await saveProjectMembers(projectId, Array.from(selected)); setEditing(false); await onChanged(); }
    catch (reason) { onError(getRequestErrorMessage(reason, "Atanan kişiler kaydedilemedi.")); } finally { setSaving(false); }
  }

  return (
    <section className="erp-section-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Users className="h-4 w-4 text-slate-400" />
          <div><h2 className="text-sm font-semibold text-slate-900">Projeye atananlar<InfoHint text="Atanan herkes projenin tüm aşamalarını ve maliyetlerini görür." /></h2></div>
        </div>
        {editable && !editing && <button type="button" onClick={start} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Kişileri düzenle</button>}
      </div>
      <div className="p-5">
        {editing ? (
          <div className="space-y-3">
            <MemberChecklist users={users} selected={selected} onToggle={toggle} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{selected.size} kişi seçili</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">Vazgeç</button>
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
              </div>
            </div>
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz kimse atanmadı.{editable ? " \"Kişileri düzenle\" ile birden çok kişi atayabilirsiniz." : ""}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {members.map((m) => <li key={m.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{m.name}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ProductionNumbersCard({ projectId, numbers, canEnter, onChanged, onError }: {
  projectId: string; numbers: ProductionNumber[]; canEnter: boolean;
} & Handlers) {
  const [number, setNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true); onError("");
    try { await action(); await onChanged(); } catch (reason) { onError(getRequestErrorMessage(reason, fallback)); } finally { setBusy(false); }
  }

  return (
    <section className="erp-section-card">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <Factory className="h-4 w-4 text-slate-400" />
        <div><h2 className="text-sm font-semibold text-slate-900">Üretim no<InfoHint text="Bir projede birden fazla üretim no olabilir." /></h2></div>
      </div>
      <div className="space-y-3 p-5">
        {numbers.length === 0 ? <p className="text-sm text-slate-500">Henüz üretim no girilmedi.</p> : (
          <ul className="divide-y divide-slate-100">
            {numbers.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tabular-nums text-slate-900">{item.number}</p>
                  <p className="truncate text-[11px] text-slate-400">{item.note ? `${item.note} · ` : ""}{item.created_by_name ?? ""} · {formatServerDateTime(item.created_at)}</p>
                </div>
                {canEnter && <button type="button" disabled={busy} aria-label={`${item.number} üretim no sil`} onClick={() => { if (window.confirm(`${item.number} üretim no silinsin mi?`)) void run(() => deleteProductionNumber(item.id), "Üretim no silinemedi."); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        )}
        {canEnter && (
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!number.trim()) return; void run(() => addProductionNumber(projectId, number.trim(), note.trim() || null), "Üretim no eklenemedi.").then(() => { setNumber(""); setNote(""); }); }}>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Üretim no" aria-label="Üretim no" maxLength={80} className="min-w-0 flex-1 basis-40 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" aria-label="Üretim no notu" maxLength={255} className="min-w-0 flex-[2] basis-48 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <button type="submit" disabled={busy || !number.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Ekle</button>
          </form>
        )}
      </div>
    </section>
  );
}

const KIND_LABEL: Record<CostKind, string> = { target: "Hedeflenen maliyet", actual: "Gerçekleşen maliyet" };
type ExtraDraft = { key: number; amount: string; description: string };
type CostDraft = { fixed: Record<string, string>; extras: ExtraDraft[] };
let extraKey = 0;
const blankExtra = (): ExtraDraft => ({ key: ++extraKey, amount: "", description: "" });

function CostColumn({ projectId, kind, costs, canEnter, onChanged, onError }: {
  projectId: string; kind: CostKind; costs: ProjectCosts; canEnter: boolean;
} & Handlers) {
  const data = costs[kind];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CostDraft | null>(null);
  const [saving, setSaving] = useState(false);

  function start() {
    const extras = (data.items.find((item) => item.category === "ek")?.extras ?? [])
      .map((extra) => ({ key: ++extraKey, amount: moneyInputFromNumber(extra.amount), description: extra.description ?? "" }));
    setDraft({
      fixed: Object.fromEntries(data.items.filter((item) => item.category !== "ek").map((item) => [item.category, moneyInputFromNumber(item.amount)])),
      extras: extras.length ? extras : [blankExtra()],
    });
    setEditing(true);
  }

  async function save() {
    if (!draft) return;
    const items: { category: CostCategory; amount: string | null; description: string | null }[] = [];
    for (const item of data.items) {
      if (item.category === "ek") continue;
      const amount = parseMoneyInput(draft.fixed[item.category] ?? "");
      if (amount === undefined) { onError(`${item.label}: tutar sayı olmalı (örn. 15000 veya 15.000,50).`); return; }
      items.push({ category: item.category, amount, description: null });
    }
    for (let index = 0; index < draft.extras.length; index++) {
      const extra = draft.extras[index];
      const amount = parseMoneyInput(extra.amount);
      if (amount === undefined) { onError(`Ek maliyet ${index + 1}: tutar sayı olmalı (örn. 15000 veya 15.000,50).`); return; }
      const description = extra.description.trim() || null;
      if (amount !== null || description) items.push({ category: "ek", amount, description });
    }
    // Hiç ek maliyet kalmadıysa boş bir satır gönderilir; sunucu eski ek maliyetleri böylece siler.
    if (!items.some((item) => item.category === "ek")) items.push({ category: "ek", amount: null, description: null });
    setSaving(true); onError("");
    try { await saveProjectCosts(projectId, kind, items); setEditing(false); await onChanged(); }
    catch (reason) { onError(getRequestErrorMessage(reason, "Maliyet kaydedilemedi.")); } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{KIND_LABEL[kind]}</h3>
        {canEnter && !editing && <button type="button" onClick={start} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Düzenle</button>}
      </div>
      <ul className="divide-y divide-slate-100 px-4">
        {data.items.map((item) => (
          <li key={item.category} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">{item.label}</span>
              {editing && draft && item.category === "ek" ? (
                <button type="button" onClick={() => setDraft((cur) => cur && ({ ...cur, extras: [...cur.extras, blankExtra()] }))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />Ek maliyet ekle</button>
              ) : editing && draft ? (
                <MoneyInput value={draft.fixed[item.category] ?? ""} placeholder="0,00" aria-label={`${KIND_LABEL[kind]} — ${item.label} (₺)`}
                  onValueChange={(amount) => setDraft((cur) => cur && ({ ...cur, fixed: { ...cur.fixed, [item.category]: amount } }))}
                  className="w-36 shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm tabular-nums" />
              ) : <span className={`whitespace-nowrap text-sm tabular-nums ${item.amount === null ? "text-slate-300" : "font-semibold text-slate-900"}`}>{item.amount === null ? "—" : `₺${money(item.amount)}`}</span>}
            </div>
            {item.category === "ek" && (editing && draft ? (
              <ul className="mt-2 space-y-2">
                {draft.extras.map((extra, index) => (
                  <li key={extra.key} className="flex items-center gap-2">
                    <input value={extra.description} maxLength={500} placeholder="Ek maliyet açıklaması" aria-label={`${KIND_LABEL[kind]} — ek maliyet ${index + 1} açıklaması`}
                      onChange={(e) => setDraft((cur) => cur && ({ ...cur, extras: cur.extras.map((row) => row.key === extra.key ? { ...row, description: e.target.value } : row) }))}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
                    <MoneyInput value={extra.amount} placeholder="0,00" aria-label={`${KIND_LABEL[kind]} — ek maliyet ${index + 1} tutarı (₺)`}
                      onValueChange={(amount) => setDraft((cur) => cur && ({ ...cur, extras: cur.extras.map((row) => row.key === extra.key ? { ...row, amount } : row) }))}
                      className="w-28 shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm tabular-nums" />
                    <button type="button" aria-label={`Ek maliyet ${index + 1} satırını sil`}
                      onClick={() => setDraft((cur) => cur && ({ ...cur, extras: cur.extras.filter((row) => row.key !== extra.key) }))}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            ) : item.extras && item.extras.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {item.extras.map((extra) => (
                  <li key={extra.id} className="flex items-baseline justify-between gap-3 text-xs text-slate-500">
                    <span className="min-w-0 break-words">{extra.description || "Açıklama yok"}</span>
                    <span className="whitespace-nowrap tabular-nums">₺{money(extra.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null)}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">Toplam</span>
        <span className="text-base font-bold tabular-nums text-slate-950">₺{money(data.total)}</span>
      </div>
      {editing && (
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">Vazgeç</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
        </div>
      )}
    </div>
  );
}

export function CostsCard({ projectId, costs, canEnter, onChanged, onError }: {
  projectId: string; costs: ProjectCosts; canEnter: boolean;
} & Handlers) {
  return (
    <section className="erp-section-card">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <Wallet className="h-4 w-4 text-slate-400" />
        <div><h2 className="text-sm font-semibold text-slate-900">Maliyet<InfoHint text="Hedeflenen ve gerçekleşen maliyet aynı kalemlerle girilir; karşılaştırmayı siz yaparsınız." /></h2></div>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <CostColumn projectId={projectId} kind="target" costs={costs} canEnter={canEnter} onChanged={onChanged} onError={onError} />
        <CostColumn projectId={projectId} kind="actual" costs={costs} canEnter={canEnter} onChanged={onChanged} onError={onError} />
      </div>
    </section>
  );
}

function BillingField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <div className="mt-1 text-sm text-slate-900">{children}</div>
    </div>
  );
}

type PartyField = keyof ProjectBilling["defaults"];
type BillingDraft = { price: string; includesVat: boolean; vatRate: string; no: string; date: string; dueDate: string; amount: string } & Record<PartyField, string>;
const PARTY_FIELDS: { field: PartyField; label: string; max: number; wide?: boolean }[] = [
  { field: "invoice_title", label: "Fatura unvanı", max: 200 },
  { field: "invoice_tax_office", label: "Vergi dairesi", max: 100 },
  { field: "invoice_tax_no", label: "Vergi no / TCKN", max: 30 },
  { field: "invoice_address", label: "Fatura adresi", max: 500, wide: true },
];

/** Satış fiyatından KDV hariç tutar, KDV ve KDV dahil toplam. */
function vatBreakdown(price: number, rate: number, includesVat: boolean) {
  const net = includesVat ? price / (1 + rate / 100) : price;
  const vat = net * rate / 100;
  return { net, vat, gross: net + vat };
}

/**
 * Kapanış aşamasındaki fatura bilgileri. Satış fiyatı, KDV, fatura no / tarihi / vadesi / tutarı ve
 * fatura tarafını yönetici girer. Fatura tarafı boşken müşteri firmadan gelen öneri gösterilir.
 * Mağaza adresi ve iletişim bilgileri mağaza kartından okunur, burada değiştirilmez.
 */
export function BillingCard({ projectId, billing, store, storeHref, editable, onChanged, onError }: {
  projectId: string; billing: ProjectBilling; store: ProjectDetail["store"]; storeHref: string | null; editable: boolean;
} & Handlers) {
  const [draft, setDraft] = useState<BillingDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const inputClass = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm";
  const patch = (changes: Partial<BillingDraft>) => setDraft((cur) => cur && ({ ...cur, ...changes }));

  function start() {
    setDraft({
      price: moneyInputFromNumber(billing.sale_price), includesVat: billing.sale_price_includes_vat,
      vatRate: String(Number(billing.vat_rate)).replace(".", ","),
      no: billing.invoice_no ?? "", date: billing.invoice_date?.slice(0, 10) ?? "", dueDate: billing.invoice_due_date?.slice(0, 10) ?? "",
      amount: moneyInputFromNumber(billing.invoice_amount),
      // Fatura tarafı boşsa müşteri firmadan gelen öneriyle doldurulur; kaydedilince projeye yazılır.
      ...Object.fromEntries(PARTY_FIELDS.map(({ field }) => [field, billing[field] ?? billing.defaults[field] ?? ""])) as Record<PartyField, string>,
    });
  }

  async function save() {
    if (!draft) return;
    const price = parseMoneyInput(draft.price);
    if (price === undefined) { onError("Proje satış fiyatı sayı olmalı (örn. 15000 veya 15.000,50)."); return; }
    const amount = parseMoneyInput(draft.amount);
    if (amount === undefined) { onError("Fatura tutarı sayı olmalı (örn. 15000 veya 15.000,50)."); return; }
    const rate = Number(draft.vatRate.trim().replace(",", "."));
    if (draft.vatRate.trim() === "" || !Number.isFinite(rate) || rate < 0 || rate > 100) { onError("KDV oranı 0 ile 100 arasında bir sayı olmalı (örn. 20)."); return; }
    if (draft.date && draft.dueDate && draft.dueDate < draft.date) { onError("Vade tarihi fatura tarihinden önce olamaz."); return; }
    setSaving(true); onError("");
    try {
      await saveProjectBilling(projectId, {
        sale_price: price, sale_price_includes_vat: draft.includesVat, vat_rate: rate.toFixed(2),
        invoice_no: draft.no.trim() || null, invoice_date: draft.date || null, invoice_due_date: draft.dueDate || null, invoice_amount: amount,
        invoice_title: draft.invoice_title.trim() || null, invoice_tax_office: draft.invoice_tax_office.trim() || null,
        invoice_tax_no: draft.invoice_tax_no.trim() || null, invoice_address: draft.invoice_address.trim() || null,
      });
      setDraft(null); await onChanged();
    } catch (reason) { onError(getRequestErrorMessage(reason, "Fatura bilgileri kaydedilemedi.")); } finally { setSaving(false); }
  }

  const location = [store?.address, [store?.city, store?.region].filter(Boolean).join(" · ")].filter(Boolean);
  const empty = <span className="text-slate-300">—</span>;
  const rate = Number(billing.vat_rate);
  const totals = billing.sale_price === null ? null : vatBreakdown(Number(billing.sale_price), rate, billing.sale_price_includes_vat);
  const dateInput = (key: "date" | "dueDate", label: string) => draft && (
    <input type="date" value={draft[key]} min="2000-01-01" max="2100-12-31" aria-label={label} onChange={(e) => patch({ [key]: e.target.value })} className={inputClass} />
  );
  return (
    <section className="erp-section-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <ReceiptText className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Fatura bilgileri<InfoHint text="Satış fiyatı, KDV, fatura no, tarih, vade, tutar ve fatura tarafı burada girilir. Mağaza adresi ve iletişim bilgileri mağaza kartından gelir. Fatura belgesini aşağıdaki Belgeler bölümünden 'Fatura' türüyle yükleyin." /></h2>
        </div>
        {editable && !draft && <button type="button" onClick={start} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Düzenle</button>}
      </div>

      <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <BillingField label="Proje satış fiyatı (₺)">
          {draft ? (
            <div className="flex gap-2">
              <MoneyInput value={draft.price} placeholder="0,00" aria-label="Proje satış fiyatı (₺)" onValueChange={(price) => patch({ price })} className={`${inputClass} min-w-0 flex-1 text-right tabular-nums`} />
              <select value={draft.includesVat ? "dahil" : "haric"} aria-label="Satış fiyatı KDV dahil mi" onChange={(e) => patch({ includesVat: e.target.value === "dahil" })} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                <option value="haric">KDV hariç</option>
                <option value="dahil">KDV dahil</option>
              </select>
            </div>
          ) : billing.sale_price === null ? empty : <span className="font-semibold tabular-nums">₺{money(billing.sale_price)} <span className="text-xs font-normal text-slate-500">{billing.sale_price_includes_vat ? "KDV dahil" : "KDV hariç"}</span></span>}
        </BillingField>
        <BillingField label="KDV oranı (%)">
          {draft ? <input value={draft.vatRate} inputMode="decimal" maxLength={6} placeholder="20" aria-label="KDV oranı (%)" onChange={(e) => patch({ vatRate: e.target.value })} className={`${inputClass} text-right tabular-nums`} />
            : <span className="font-semibold tabular-nums">%{rate.toLocaleString("tr-TR")}</span>}
        </BillingField>
        <BillingField label="KDV tutarı">{totals ? <span className="tabular-nums">₺{money(totals.vat)}</span> : empty}</BillingField>
        <BillingField label="KDV dahil toplam">{totals ? <span className="font-semibold tabular-nums">₺{money(totals.gross)}</span> : empty}</BillingField>

        <BillingField label="Fatura no">
          {draft ? <input value={draft.no} maxLength={40} placeholder="Örn. ABC2026000000123" aria-label="Fatura no" onChange={(e) => patch({ no: e.target.value })} className={inputClass} />
            : billing.invoice_no ? <span className="font-semibold">{billing.invoice_no}</span> : empty}
        </BillingField>
        <BillingField label="Fatura tarihi">
          {draft ? dateInput("date", "Fatura tarihi") : billing.invoice_date ? <span className="font-semibold">{formatServerDate(billing.invoice_date)}</span> : empty}
        </BillingField>
        <BillingField label="Vade tarihi">
          {draft ? dateInput("dueDate", "Vade tarihi") : billing.invoice_due_date ? <span className="font-semibold">{formatServerDate(billing.invoice_due_date)}</span> : empty}
        </BillingField>
        <BillingField label="Fatura tutarı (KDV dahil, ₺)">
          {draft ? <MoneyInput value={draft.amount} placeholder="0,00" aria-label="Fatura tutarı (KDV dahil, ₺)" onValueChange={(amount) => patch({ amount })} className={`${inputClass} text-right tabular-nums`} />
            : billing.invoice_amount === null ? empty : <span className="font-semibold tabular-nums">₺{money(billing.invoice_amount)}</span>}
        </BillingField>
      </div>

      <div className="grid gap-x-6 gap-y-4 border-t border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {PARTY_FIELDS.map(({ field, label, max, wide }) => {
          const saved = billing[field];
          const suggestion = billing.defaults[field];
          return (
            <BillingField key={field} label={label} className={wide ? "sm:col-span-2 lg:col-span-4" : ""}>
              {draft ? <input value={draft[field]} maxLength={max} aria-label={label} onChange={(e) => patch({ [field]: e.target.value })} className={inputClass} />
                : saved ? <span className="break-words font-semibold">{saved}</span>
                : suggestion ? <span className="break-words text-slate-500">{suggestion} <span className="text-xs text-slate-400">(öneri, kaydedilmedi)</span></span>
                : empty}
            </BillingField>
          );
        })}
      </div>

      {draft && (
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">Vazgeç</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
        </div>
      )}

      <div className="grid gap-x-6 gap-y-4 border-t border-slate-100 bg-slate-50/60 p-5 sm:grid-cols-3">
        <BillingField label="Mağaza">
          {store ? (storeHref ? <Link href={storeHref} className="font-semibold text-blue-700 hover:underline">{store.name}{store.no ? ` · ${store.no}` : ""}</Link> : <span className="font-semibold">{store.name}</span>) : empty}
        </BillingField>
        <BillingField label="Adres (mağaza kartından)">
          {location.length ? location.map((line) => <p key={line} className="break-words">{line}</p>) : <span className="text-slate-400">Mağaza kartında adres yok.</span>}
        </BillingField>
        <BillingField label="Mağaza iletişim bilgileri">
          {store?.phones.length ? store.phones.map((phone) => <p key={phone}><a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="tabular-nums hover:underline">{phone}</a></p>) : <span className="text-slate-400">Mağaza kartında telefon yok.</span>}
        </BillingField>
      </div>
    </section>
  );
}
