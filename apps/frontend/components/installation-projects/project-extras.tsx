"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { Checkbox } from "@/components/shadcn/checkbox";
import { useState } from "react";
import Link from "next/link";
import { Factory, Loader2, Plus, ReceiptText, Trash2, Users, Wallet } from "lucide-react";
import { MoneyInput, moneyInputFromNumber, parseMoneyInput } from "@/components/form/money-input";
import { getRequestErrorMessage } from "@/lib/api";
import { formatServerDate, formatServerDateTime } from "@/lib/utils";
import {
  PROJECT_TYPE_LABEL, addProductionNumber, deleteProductionNumber, saveProjectBilling, saveProjectCosts, saveProjectMembers, updateProject,
  type CostCategory, type CostKind, type ProductionNumber, type ProjectBilling, type ProjectBillingPayload, type ProjectCosts, type ProjectDetail, type ProjectMember, type ProjectType,
} from "@/services/installationProjects";

type UserOption = { id: string; full_name: string; email: string };
type Handlers = { onChanged: () => Promise<void>; onError: (message: string) => void };

const money = (value?: string | number | null) => Number(value ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Proje türü: Mağaza / Soğuk oda / Soğutma. Proje oluşturulurken seçilir; proje içinde yalnızca bilgi olarak gösterilir. */
export function ProjectTypeBadge({ value }: { value: ProjectType }) {
  return (
    <span className="inline-flex items-center rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm font-semibold text-foreground">
      {PROJECT_TYPE_LABEL[value] ?? value}
    </span>
  );
}

/**
 * Kullanıcı listesinden çoklu seçim (yeni proje formu ve atama düzenleme için ortak).
 * lockedId: proje sorumlusu; her zaman atanmış sayılır, işareti kaldırılamaz.
 */
export function MemberChecklist({ users, selected, onToggle, lockedId }: { users: UserOption[]; selected: Set<string>; onToggle: (id: string) => void; lockedId?: string | null }) {
  if (users.length === 0) return <p className="text-sm text-muted-foreground">Kullanıcı bulunamadı.</p>;
  return (
    <ul className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
      {users.map((u) => {
        const locked = u.id === lockedId;
        const checked = locked || selected.has(u.id);
        return (
          <li key={u.id}>
            <label className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm ${locked ? "cursor-default" : "cursor-pointer hover:bg-accent"} ${checked ? "border-primary/40 bg-primary/5" : "bg-background"}`}>
              <Checkbox checked={checked} disabled={locked} onCheckedChange={() => onToggle(u.id)} />
              <span className="min-w-0 truncate">{u.full_name || u.email}</span>
              {locked && <span className="ml-auto shrink-0 text-xs font-medium text-primary">Proje sorumlusu</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function MembersCard({ projectId, members, users, managerId, editable, onChanged, onError }: {
  projectId: string; members: ProjectMember[]; users: UserOption[]; managerId: string | null; editable: boolean;
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div><h2 className="text-sm font-semibold text-foreground">Projeye atananlar<InfoHint text="Atanan herkes projenin tüm aşamalarını ve maliyetlerini görür. Proje sorumlusu otomatik olarak atanır." /></h2></div>
        </div>
        {editable && !editing && <button type="button" onClick={start} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">Kişileri düzenle</button>}
      </div>
      <div className="p-5">
        {editing ? (
          <div className="space-y-3">
            <MemberChecklist users={users} selected={selected} onToggle={toggle} lockedId={managerId} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{selected.size + (managerId && !selected.has(managerId) ? 1 : 0)} kişi seçili</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground">Vazgeç</button>
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
              </div>
            </div>
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz kimse atanmadı.{editable ? " \"Kişileri düzenle\" ile birden çok kişi atayabilirsiniz." : ""}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {members.map((m) => <li key={m.id} className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">{m.name}{m.id === managerId && <span className="ml-1.5 text-xs font-normal text-primary">· sorumlu</span>}</li>)}
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
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Factory className="h-4 w-4 text-muted-foreground" />
        <div><h2 className="text-sm font-semibold text-foreground">Üretim no<InfoHint text="Bir projede birden fazla üretim no olabilir." /></h2></div>
      </div>
      <div className="space-y-3 p-5">
        {numbers.length === 0 ? <p className="text-sm text-muted-foreground">Henüz üretim no girilmedi.</p> : (
          <ul className="divide-y divide-border">
            {numbers.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tabular-nums text-foreground">{item.number}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{item.note ? `${item.note} · ` : ""}{item.created_by_name ?? ""} · {formatServerDateTime(item.created_at)}</p>
                </div>
                {canEnter && <button type="button" disabled={busy} aria-label={`${item.number} üretim no sil`} onClick={() => { if (window.confirm(`${item.number} üretim no silinsin mi?`)) void run(() => deleteProductionNumber(item.id), "Üretim no silinemedi."); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        )}
        {canEnter && (
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!number.trim()) return; void run(() => addProductionNumber(projectId, number.trim(), note.trim() || null), "Üretim no eklenemedi.").then(() => { setNumber(""); setNote(""); }); }}>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Üretim no" aria-label="Üretim no" maxLength={80} className="min-w-0 flex-1 basis-40 rounded-lg border border-border px-3 py-2 text-sm" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" aria-label="Üretim no notu" maxLength={255} className="min-w-0 flex-[2] basis-48 rounded-lg border border-border px-3 py-2 text-sm" />
            <button type="submit" disabled={busy || !number.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Ekle</button>
          </form>
        )}
      </div>
    </section>
  );
}

/** Marjın bu oranın altında kalması "düşük marj" uyarısı verir. */
const LOW_MARGIN_PERCENT = 10;

/**
 * Bütçe / teklif tutarı ve tahmini kâr. Proje oluşturulurken sorulmaz; "Projelendirme ve teklif"
 * aşamasında girilir. Kâr = teklif − hedeflenen maliyet; marj = kâr / teklif. Yazarken anlık hesaplanır.
 */
export function BudgetCard({ projectId, budget, targetTotal, editable, onChanged, onError }: {
  projectId: string; budget: string | null; targetTotal: string; editable: boolean;
} & Handlers) {
  const [value, setValue] = useState(() => moneyInputFromNumber(budget));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = value !== moneyInputFromNumber(budget);
  const typed = parseMoneyInput(value);
  const quote = editable ? (typed ? Number(typed) : null) : (budget ? Number(budget) : null);
  const cost = Number(targetTotal || 0);

  async function save() {
    const amount = parseMoneyInput(value);
    if (amount === undefined) { onError("Bütçe sayı olmalı (örn. 250000 veya 250.000,50)."); return; }
    setBusy(true); setSaved(false); onError("");
    try {
      await updateProject(projectId, { budget: amount });
      await onChanged();
      setValue(moneyInputFromNumber(amount));
      setSaved(true);
    } catch (reason) {
      onError(getRequestErrorMessage(reason, "Bütçe kaydedilemedi."));
    } finally { setBusy(false); }
  }

  return (
    <section className="erp-section-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <div><h2 className="text-sm font-semibold text-foreground">Bütçe / teklif<InfoHint text="Müşteriye verilen teklif tutarı. Kâr hesabının doğru çıkması için teklif ve maliyetleri aynı şekilde (KDV hariç) girin." /></h2></div>
      </div>
      <div className="space-y-4 p-5">
        {editable ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="relative min-w-0 flex-1 basis-48">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₺</span>
              <MoneyInput value={value} onValueChange={(next) => { setValue(next); setSaved(false); }} placeholder="Teklif tutarı" aria-label="Bütçe / teklif tutarı" className="w-full rounded-lg border border-border py-2 pl-7 pr-3 text-sm" />
            </div>
            <button type="submit" disabled={busy || !dirty} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
            {saved && !dirty && <span className="text-xs font-medium text-emerald-700">Kaydedildi</span>}
          </form>
        ) : (
          <p className="text-sm font-semibold tabular-nums text-foreground">{budget ? `₺${money(budget)}` : "Henüz girilmedi."}</p>
        )}
        <MarginSummary quote={quote} cost={cost} />
      </div>
    </section>
  );
}

type MarginLabels = { price: string; cost: string; profit: string; empty: string; loss: string; low: string };
const QUOTE_LABELS: MarginLabels = {
  price: "Teklif", cost: "Hedeflenen maliyet", profit: "Tahmini kâr",
  empty: "Kâr ve marj, teklif tutarı ve hedeflenen maliyet girilince hesaplanır.",
  loss: "Teklif, hedeflenen maliyetin altında: bu fiyatla proje zarar eder.",
  low: "Teklifi veya maliyetleri gözden geçirin.",
};

function MarginSummary({ quote, cost, labels = QUOTE_LABELS }: { quote: number | null; cost: number; labels?: MarginLabels }) {
  if (!quote || quote <= 0 || cost <= 0) {
    return <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">{labels.empty}</p>;
  }
  const profit = quote - cost;
  const margin = (profit / quote) * 100;
  const tone = profit < 0 ? "loss" : margin < LOW_MARGIN_PERCENT ? "low" : "ok";
  const box = { loss: "border-red-200 bg-red-50", low: "border-amber-200 bg-amber-50", ok: "border-emerald-200 bg-emerald-50" }[tone];
  const text = { loss: "text-red-700", low: "text-amber-800", ok: "text-emerald-700" }[tone];
  // Zararda başlık zaten "Zarar" der; yüzde işaretsiz gösterilir.
  const percent = Math.abs(margin).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  return (
    <div className={`rounded-xl border p-4 ${box}`}>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-[11px] font-medium text-muted-foreground">{labels.price}</dt><dd className="mt-0.5 font-semibold tabular-nums text-foreground">₺{money(quote)}</dd></div>
        <div><dt className="text-[11px] font-medium text-muted-foreground">{labels.cost}</dt><dd className="mt-0.5 font-semibold tabular-nums text-foreground">₺{money(cost)}</dd></div>
        <div><dt className="text-[11px] font-medium text-muted-foreground">{profit < 0 ? "Zarar" : labels.profit}</dt><dd className={`mt-0.5 font-bold tabular-nums ${text}`}>₺{money(Math.abs(profit))} <span className="font-semibold">(%{percent})</span></dd></div>
      </dl>
      {tone !== "ok" && (
        <p className={`mt-3 text-xs font-medium ${text}`}>
          {tone === "loss" ? labels.loss : `Marj %${LOW_MARGIN_PERCENT}'un altında. ${labels.low}`}
        </p>
      )}
    </div>
  );
}

/** Fatura kaydının tamamı; yalnızca verilen alanlar değiştirilir (diğerleri korunur). */
function billingPayload(billing: ProjectBilling, changes: Partial<ProjectBillingPayload>): ProjectBillingPayload {
  const { defaults: _defaults, ...current } = billing;
  return { ...current, ...changes };
}

/**
 * Müşteri onayı aşamasında satış fiyatı: müşterinin onayladığı tutar, KDV dahil / hariç ve KDV oranı.
 * Fiyat henüz girilmediyse teklif tutarıyla dolu gelir. Tekliften farkı (indirim) ve hedeflenen
 * maliyete göre beklenen kâr anlık gösterilir.
 */
export function SalePriceCard({ projectId, billing, budget, targetTotal, editable: canEdit, locked, onChanged, onError }: {
  projectId: string; billing: ProjectBilling; budget: string | null; targetTotal: string; editable: boolean;
  /** Müşteri onayı tamamlandıysa fiyat ve KDV kilitlenir; fark fatura tutarına yansıtılır. */
  locked: boolean;
} & Handlers) {
  const editable = canEdit && !locked;
  const initial = () => ({
    price: moneyInputFromNumber(billing.sale_price ?? budget),
    includesVat: billing.sale_price_includes_vat,
    vatRate: String(Number(billing.vat_rate)).replace(".", ","),
  });
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const base = initial();
  const dirty = billing.sale_price === null || draft.price !== base.price || draft.includesVat !== base.includesVat || draft.vatRate !== base.vatRate;
  const patch = (changes: Partial<typeof draft>) => { setDraft((cur) => ({ ...cur, ...changes })); setSaved(false); };

  const typedRate = Number(draft.vatRate.trim().replace(",", "."));
  const rateValid = draft.vatRate.trim() !== "" && Number.isFinite(typedRate) && typedRate >= 0 && typedRate <= 100;
  const typed = editable ? parseMoneyInput(draft.price) : billing.sale_price;
  const price = typed ? Number(typed) : null;
  const rate = editable ? (rateValid ? typedRate : 0) : Number(billing.vat_rate);
  const includesVat = editable ? draft.includesVat : billing.sale_price_includes_vat;
  const totals = price === null ? null : vatBreakdown(price, rate, includesVat);
  const quote = budget ? Number(budget) : null;
  const diff = totals && quote ? totals.net - quote : null;

  async function save() {
    const amount = parseMoneyInput(draft.price);
    if (amount === undefined || amount === null) { onError("Satış fiyatını girin (örn. 250000 veya 250.000,50)."); return; }
    if (!rateValid) { onError("KDV oranı 0 ile 100 arasında bir sayı olmalı (örn. 20)."); return; }
    setBusy(true); setSaved(false); onError("");
    try {
      await saveProjectBilling(projectId, billingPayload(billing, { sale_price: amount, sale_price_includes_vat: draft.includesVat, vat_rate: typedRate.toFixed(2) }));
      await onChanged();
      setSaved(true);
    } catch (reason) {
      onError(getRequestErrorMessage(reason, "Satış fiyatı kaydedilemedi."));
    } finally { setBusy(false); }
  }

  const inputClass = "w-full rounded-lg border border-border px-2.5 py-1.5 text-sm";
  const empty = <span className="text-muted-foreground/60">—</span>;
  return (
    <section className="erp-section-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <ReceiptText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Satış fiyatı<InfoHint text="Müşterinin onayladığı tutar. Teklif tutarıyla dolu gelir; pazarlıkta değiştiyse düzeltin. Müşteri onayı tamamlanınca kilitlenir. Fatura ve gerçek kâr bu fiyat üzerinden hesaplanır." /></h2>
        {locked && <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Onaylandı · kilitli</span>}
      </div>
      <div className="space-y-4 p-5">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          <BillingField label="Satış fiyatı (₺)" className="sm:col-span-2">
            {editable ? (
              <div className="flex gap-2">
                <MoneyInput value={draft.price} placeholder="0,00" aria-label="Satış fiyatı (₺)" onValueChange={(next) => patch({ price: next })} className={`${inputClass} min-w-0 flex-1 text-right tabular-nums`} />
                <select value={draft.includesVat ? "dahil" : "haric"} aria-label="Satış fiyatı KDV dahil mi" onChange={(e) => patch({ includesVat: e.target.value === "dahil" })} className="shrink-0 rounded-lg border border-border bg-card px-2 py-1.5 text-sm">
                  <option value="haric">KDV hariç</option>
                  <option value="dahil">KDV dahil</option>
                </select>
              </div>
            ) : billing.sale_price === null ? empty : <span className="font-semibold tabular-nums">₺{money(billing.sale_price)} <span className="text-xs font-normal text-muted-foreground">{billing.sale_price_includes_vat ? "KDV dahil" : "KDV hariç"}</span></span>}
          </BillingField>
          <BillingField label="KDV oranı (%)">
            {editable ? <input value={draft.vatRate} inputMode="decimal" maxLength={6} placeholder="20" aria-label="KDV oranı (%)" onChange={(e) => patch({ vatRate: e.target.value })} className={`${inputClass} text-right tabular-nums`} />
              : <span className="font-semibold tabular-nums">%{rate.toLocaleString("tr-TR")}</span>}
          </BillingField>
          <BillingField label="KDV tutarı">{totals ? <span className="tabular-nums">₺{money(totals.vat)}</span> : empty}</BillingField>
          <BillingField label="KDV dahil toplam">{totals ? <span className="font-semibold tabular-nums">₺{money(totals.gross)}</span> : empty}</BillingField>
        </div>

        {editable && (
          <div className="flex items-center justify-end gap-3">
            {billing.sale_price === null && <span className="text-xs text-muted-foreground">Henüz kaydedilmedi.</span>}
            {saved && !dirty && <span className="text-xs font-medium text-emerald-700">Kaydedildi</span>}
            <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
          </div>
        )}

        {diff !== null && Math.abs(diff) >= 0.01 && quote && (
          <p className={`rounded-lg px-3 py-2.5 text-xs font-medium ${diff < 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
            {diff < 0
              ? `Teklife göre ₺${money(-diff)} indirim (%${(-diff / quote * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}). Teklif: ₺${money(quote)}, KDV hariç satış fiyatı: ₺${money(totals!.net)}.`
              : `Satış fiyatı tekliften ₺${money(diff)} fazla. Teklif: ₺${money(quote)}, KDV hariç satış fiyatı: ₺${money(totals!.net)}.`}
          </p>
        )}

        <MarginSummary quote={totals ? totals.net : null} cost={Number(targetTotal || 0)} labels={{
          price: "Satış fiyatı (KDV hariç)", cost: "Hedeflenen maliyet", profit: "Beklenen kâr",
          empty: "Beklenen kâr, satış fiyatı ve hedeflenen maliyet girilince hesaplanır.",
          loss: "Satış fiyatı hedeflenen maliyetin altında: bu fiyatla proje zarar eder.",
          low: "Fiyatı veya maliyetleri gözden geçirin.",
        }} />
      </div>
    </section>
  );
}

/**
 * Kapanış aşamasında gerçek kâr: KDV hariç gelir − gerçekleşen maliyet. Gelir, fatura tutarı
 * girildiyse faturadan (ek iş vb. dahil), girilmediyse onaylanan satış fiyatından alınır.
 */
export function RealProfitCard({ billing, actualTotal }: { billing: ProjectBilling; actualTotal: string }) {
  const rate = Number(billing.vat_rate || 0);
  const fromInvoice = billing.invoice_amount !== null && Number(billing.invoice_amount) > 0;
  const net = fromInvoice
    ? vatBreakdown(Number(billing.invoice_amount), rate, true).net
    : billing.sale_price ? vatBreakdown(Number(billing.sale_price), rate, billing.sale_price_includes_vat).net : null;
  return (
    <section className="erp-section-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <div><h2 className="text-sm font-semibold text-foreground">Gerçek kâr<InfoHint text="KDV hariç gelirden gerçekleşen maliyet düşülür. Gelir, fatura tutarı girildiyse faturadan, girilmediyse Müşteri onayı aşamasındaki satış fiyatından alınır." /></h2></div>
      </div>
      <div className="p-5">
        <MarginSummary quote={net} cost={Number(actualTotal || 0)} labels={{
          price: fromInvoice ? "Fatura tutarı (KDV hariç)" : "Satış fiyatı (KDV hariç)", cost: "Gerçekleşen maliyet", profit: "Gerçek kâr",
          empty: "Gerçek kâr, satış fiyatı ve gerçekleşen maliyet girilince hesaplanır.",
          loss: "Gerçekleşen maliyet satış fiyatını aşmış: proje zarar etti.",
          low: "Gerçek kâr düşük kaldı.",
        }} />
      </div>
    </section>
  );
}

const KIND_LABEL: Record<CostKind, string> = { target: "Hedeflenen maliyet", actual: "Gerçekleşen maliyet" };
type LineDraft = { key: number; amount: string; description: string };
type CostDraft = Record<string, LineDraft[]>;
let lineKey = 0;
const blankLine = (): LineDraft => ({ key: ++lineKey, amount: "", description: "" });
const toDraft = (items: ProjectCosts["target"]["items"]): CostDraft => Object.fromEntries(items.map((item) => [
  item.category,
  item.lines.map((line) => ({ key: ++lineKey, amount: moneyInputFromNumber(line.amount), description: line.description ?? "" })),
]));

/**
 * Maddeli maliyet sütunu: her kalemin (montaj, nakliye, ürün, ek) altında açıklama + tutar maddeleri;
 * kalem ara toplamı ve genel toplam kendiliğinden hesaplanır. Gerçekleşen tarafta hedef maddeleri
 * tek tıkla kopyalanabilir. Kayıt sürerken sütun kilitlenir.
 */
function CostColumn({ projectId, kind, costs, canEnter, onChanged, onError }: {
  projectId: string; kind: CostKind; costs: ProjectCosts; canEnter: boolean;
} & Handlers) {
  const data = costs[kind];
  const [draft, setDraft] = useState<CostDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;
  const linked = kind === "actual" ? Number(costs.actual.linked_work_orders ?? 0) : 0;

  function start() { setDraft(toDraft(data.items)); }
  function update(category: string, key: number, patch: Partial<LineDraft>) {
    setDraft((cur) => cur && ({ ...cur, [category]: cur[category].map((line) => line.key === key ? { ...line, ...patch } : line) }));
  }
  const draftSum = (lines: LineDraft[]) => lines.reduce((sum, line) => sum + Number(parseMoneyInput(line.amount) ?? 0), 0);

  async function save() {
    if (!draft) return;
    const items: { category: CostCategory; amount: string | null; description: string | null }[] = [];
    for (const item of data.items) {
      const lines = draft[item.category] ?? [];
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const amount = parseMoneyInput(line.amount);
        const description = line.description.trim() || null;
        if (amount === undefined) { onError(`${item.label} ${index + 1}. madde: tutar sayı olmalı (örn. 15000 veya 15.000,50).`); return; }
        if (amount === null && !description) continue;
        if (amount === null) { onError(`${item.label}: "${description}" maddesinin tutarını girin.`); return; }
        items.push({ category: item.category, amount, description });
      }
    }
    setSaving(true); onError("");
    try { await saveProjectCosts(projectId, kind, items); setDraft(null); await onChanged(); }
    catch (reason) { onError(getRequestErrorMessage(reason, "Maliyet kaydedilemedi.")); } finally { setSaving(false); }
  }

  const total = editing ? data.items.reduce((sum, item) => sum + draftSum(draft[item.category] ?? []), 0) + linked : Number(data.total);

  return (
    <div className="relative flex flex-col rounded-xl border border-border">
      {saving && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      <div className="flex min-h-[3rem] items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">{KIND_LABEL[kind]}</h3>
        <div className="flex items-center gap-2">
          {editing && kind === "actual" && (
            <button type="button" onClick={() => setDraft(toDraft(costs.target.items))} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/5">Hedeften kopyala</button>
          )}
          {canEnter && !editing && <button type="button" onClick={start} className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-accent">Düzenle</button>}
        </div>
      </div>
      <ul className="divide-y divide-border px-4">
        {data.items.map((item) => {
          const lines = editing ? draft[item.category] ?? [] : item.lines;
          const subtotal = editing ? draftSum(draft[item.category] ?? []) : Number(item.amount ?? 0);
          return (
            <li key={item.category} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <span className={`whitespace-nowrap text-sm tabular-nums ${!editing && item.amount === null ? "text-muted-foreground/60" : "font-semibold text-foreground"}`}>
                  {!editing && item.amount === null ? "—" : `₺${money(subtotal)}`}
                </span>
              </div>
              {editing ? (
                <div className="mt-2 space-y-2">
                  {(draft[item.category] ?? []).map((line, index) => (
                    <div key={line.key} className="flex items-center gap-2">
                      <input value={line.description} maxLength={500} placeholder="Açıklama" aria-label={`${item.label} ${index + 1}. madde açıklaması`}
                        onChange={(e) => update(item.category, line.key, { description: e.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm" />
                      <MoneyInput value={line.amount} placeholder="0,00" aria-label={`${item.label} ${index + 1}. madde tutarı (₺)`}
                        onValueChange={(amount) => update(item.category, line.key, { amount })}
                        className="w-32 shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-right text-sm tabular-nums" />
                      <button type="button" aria-label={`${item.label} ${index + 1}. maddeyi sil`}
                        onClick={() => setDraft((cur) => cur && ({ ...cur, [item.category]: cur[item.category].filter((row) => row.key !== line.key) }))}
                        className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setDraft((cur) => cur && ({ ...cur, [item.category]: [...(cur[item.category] ?? []), blankLine()] }))}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:border-slate-400 hover:bg-accent"><Plus className="h-3.5 w-3.5" />Madde ekle</button>
                </div>
              ) : lines.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {item.lines.map((line) => (
                    <li key={line.id} className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                      <span className="min-w-0 break-words">{line.description || "Açıklama yok"}</span>
                      <span className="whitespace-nowrap tabular-nums">₺{money(line.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {linked > 0 && (
          <li className="py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{costs.actual.linked_work_orders_label ?? "Kullanılan malzeme"}
                <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">otomatik</span>
                <InfoHint text="İş emirlerinde proje deposundan kullanılan malzeme (katalog fiyatıyla). Ürün maliyetine yalnız katalog dışı ürünleri girin; bu tutarı tekrar eklemeyin." />
              </span>
              <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">₺{money(linked)}</span>
            </div>
          </li>
        )}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border bg-muted/50 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">Toplam</span>
        <span className="text-base font-bold tabular-nums text-foreground">₺{money(total)}</span>
      </div>
      {editing && (
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={() => setDraft(null)} disabled={saving} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground">Vazgeç</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Kaydet</button>
        </div>
      )}
    </div>
  );
}

/** "Projelendirme ve teklif" aşamasında hedeflenen maliyet girişi. */
export function TargetCostsCard({ projectId, costs, canEnter, onChanged, onError }: {
  projectId: string; costs: ProjectCosts; canEnter: boolean;
} & Handlers) {
  return (
    <section className="erp-section-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <div><h2 className="text-sm font-semibold text-foreground">Maliyet hesabı<InfoHint text="Teklif bu maliyetlere göre verilir. Kapanışta gerçekleşen maliyet aynı kalemlerle girilip bununla karşılaştırılır." /></h2></div>
      </div>
      <div className="p-5">
        <CostColumn projectId={projectId} kind="target" costs={costs} canEnter={canEnter} onChanged={onChanged} onError={onError} />
      </div>
    </section>
  );
}

/** Kapanış aşamasında maliyet karşılaştırması: hedeflenen yalnızca gösterilir, gerçekleşen girilir. */
export function CostsCard({ projectId, costs, canEnter, onChanged, onError }: {
  projectId: string; costs: ProjectCosts; canEnter: boolean;
} & Handlers) {
  return (
    <section className="erp-section-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <div><h2 className="text-sm font-semibold text-foreground">Maliyet<InfoHint text="Hedeflenen maliyet Projelendirme ve teklif aşamasında girilir; burada gerçekleşen maliyet aynı kalemlerle girilip karşılaştırılır." /></h2></div>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <CostColumn projectId={projectId} kind="target" costs={costs} canEnter={false} onChanged={onChanged} onError={onError} />
        <CostColumn projectId={projectId} kind="actual" costs={costs} canEnter={canEnter} onChanged={onChanged} onError={onError} />
      </div>
    </section>
  );
}

function BillingField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

type PartyField = keyof ProjectBilling["defaults"];
type BillingDraft = { no: string; date: string; dueDate: string; amount: string } & Record<PartyField, string>;
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
 * Kapanış aşamasındaki fatura bilgileri. Fatura no / tarihi / vadesi / tutarı ve fatura tarafını
 * yönetici girer. Satış fiyatı ve KDV Müşteri onayı aşamasında girilir; burada yalnızca gösterilir.
 * Fatura tutarı boşsa onaylanan fiyatın KDV dahil toplamıyla dolu gelir; farklıysa fark gösterilir. Fatura tarafı boşken müşteri firmadan gelen öneri gösterilir.
 * Mağaza adresi ve iletişim bilgileri mağaza kartından okunur, burada değiştirilmez.
 */
export function BillingCard({ projectId, billing, store, storeHref, editable, onChanged, onError }: {
  projectId: string; billing: ProjectBilling; store: ProjectDetail["store"]; storeHref: string | null; editable: boolean;
} & Handlers) {
  const [draft, setDraft] = useState<BillingDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const inputClass = "w-full rounded-lg border border-border px-2.5 py-1.5 text-sm";
  const patch = (changes: Partial<BillingDraft>) => setDraft((cur) => cur && ({ ...cur, ...changes }));

  function start() {
    setDraft({
      no: billing.invoice_no ?? "", date: billing.invoice_date?.slice(0, 10) ?? "", dueDate: billing.invoice_due_date?.slice(0, 10) ?? "",
      amount: moneyInputFromNumber(billing.invoice_amount ?? (totals ? totals.gross.toFixed(2) : null)),
      // Fatura tarafı boşsa müşteri firmadan gelen öneriyle doldurulur; kaydedilince projeye yazılır.
      ...Object.fromEntries(PARTY_FIELDS.map(({ field }) => [field, billing[field] ?? billing.defaults[field] ?? ""])) as Record<PartyField, string>,
    });
  }

  async function save() {
    if (!draft) return;
    const amount = parseMoneyInput(draft.amount);
    if (amount === undefined) { onError("Fatura tutarı sayı olmalı (örn. 15000 veya 15.000,50)."); return; }
    if (draft.date && draft.dueDate && draft.dueDate < draft.date) { onError("Vade tarihi fatura tarihinden önce olamaz."); return; }
    setSaving(true); onError("");
    try {
      await saveProjectBilling(projectId, billingPayload(billing, {
        invoice_no: draft.no.trim() || null, invoice_date: draft.date || null, invoice_due_date: draft.dueDate || null, invoice_amount: amount,
        invoice_title: draft.invoice_title.trim() || null, invoice_tax_office: draft.invoice_tax_office.trim() || null,
        invoice_tax_no: draft.invoice_tax_no.trim() || null, invoice_address: draft.invoice_address.trim() || null,
      }));
      setDraft(null); await onChanged();
    } catch (reason) { onError(getRequestErrorMessage(reason, "Fatura bilgileri kaydedilemedi.")); } finally { setSaving(false); }
  }

  const location = [store?.address, [store?.city, store?.region].filter(Boolean).join(" · ")].filter(Boolean);
  const empty = <span className="text-muted-foreground/60">—</span>;
  const rate = Number(billing.vat_rate);
  const totals = billing.sale_price === null ? null : vatBreakdown(Number(billing.sale_price), rate, billing.sale_price_includes_vat);
  const invoiceDiff = totals && billing.invoice_amount !== null ? Number(billing.invoice_amount) - totals.gross : null;
  const dateInput = (key: "date" | "dueDate", label: string) => draft && (
    <input type="date" value={draft[key]} min="2000-01-01" max="2100-12-31" aria-label={label} onChange={(e) => patch({ [key]: e.target.value })} className={inputClass} />
  );
  return (
    <section className="erp-section-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Fatura bilgileri<InfoHint text="Fatura no, tarih, vade, tutar ve fatura tarafı burada girilir. Satış fiyatı ve KDV Müşteri onayı aşamasında girilir; ek iş yapıldıysa fatura tutarını farklı girin, gerçek kâr fatura tutarından hesaplanır. Mağaza adresi ve iletişim bilgileri mağaza kartından gelir. Fatura belgesini aşağıdaki Belgeler bölümünden 'Fatura' türüyle yükleyin." /></h2>
        </div>
        {editable && !draft && <button type="button" onClick={start} className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-accent">Düzenle</button>}
      </div>

      <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <BillingField label="Onaylanan satış fiyatı">
          {billing.sale_price === null ? <span className="text-muted-foreground">Müşteri onayı aşamasında girilir.</span>
            : <span className="font-semibold tabular-nums">₺{money(billing.sale_price)} <span className="text-xs font-normal text-muted-foreground">{billing.sale_price_includes_vat ? "KDV dahil" : "KDV hariç"}</span></span>}
        </BillingField>
        <BillingField label="KDV oranı"><span className="font-semibold tabular-nums">%{rate.toLocaleString("tr-TR")}</span></BillingField>
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

      {!draft && invoiceDiff !== null && Math.abs(invoiceDiff) >= 0.01 && (
        <p className={`mx-5 mb-5 rounded-lg px-3 py-2.5 text-xs font-medium ${invoiceDiff < 0 ? "bg-amber-50 text-amber-800" : "bg-primary/5 text-primary"}`}>
          Fatura tutarı onaylanan satış fiyatından (KDV dahil ₺{money(totals!.gross)}) ₺{money(Math.abs(invoiceDiff))} {invoiceDiff < 0 ? "düşük" : "fazla"}{invoiceDiff > 0 ? " (ek iş vb.)" : ""}. Gerçek kâr fatura tutarından hesaplanır.
        </p>
      )}

      <div className="grid gap-x-6 gap-y-4 border-t border-border p-5 sm:grid-cols-2 lg:grid-cols-4">
        {PARTY_FIELDS.map(({ field, label, max, wide }) => {
          const saved = billing[field];
          const suggestion = billing.defaults[field];
          return (
            <BillingField key={field} label={label} className={wide ? "sm:col-span-2 lg:col-span-4" : ""}>
              {draft ? <input value={draft[field]} maxLength={max} aria-label={label} onChange={(e) => patch({ [field]: e.target.value })} className={inputClass} />
                : saved ? <span className="break-words font-semibold">{saved}</span>
                : suggestion ? <span className="break-words text-muted-foreground">{suggestion} <span className="text-xs text-muted-foreground">(öneri, kaydedilmedi)</span></span>
                : empty}
            </BillingField>
          );
        })}
      </div>

      {draft && (
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground">Vazgeç</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Kaydet</button>
        </div>
      )}

      <div className="grid gap-x-6 gap-y-4 border-t border-border bg-slate-50/60 p-5 sm:grid-cols-3">
        <BillingField label="Mağaza">
          {store ? (storeHref ? <Link href={storeHref} className="font-semibold text-primary hover:underline">{store.name}{store.no ? ` · ${store.no}` : ""}</Link> : <span className="font-semibold">{store.name}</span>) : empty}
        </BillingField>
        <BillingField label="Adres (mağaza kartından)">
          {location.length ? location.map((line) => <p key={line} className="break-words">{line}</p>) : <span className="text-muted-foreground">Mağaza kartında adres yok.</span>}
        </BillingField>
        <BillingField label="Mağaza iletişim bilgileri">
          {store?.phones.length ? store.phones.map((phone) => <p key={phone}><a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="tabular-nums hover:underline">{phone}</a></p>) : <span className="text-muted-foreground">Mağaza kartında telefon yok.</span>}
        </BillingField>
      </div>
    </section>
  );
}
