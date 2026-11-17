"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, HardHat, Loader2, Mail, Pencil, Phone, Plus, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getRequestErrorMessage } from "@/lib/api";
import {
  COMPETENCY, COMPETENCY_KEYS, createSubcontractor, listSubcontractors, updateSubcontractor,
  type Competency, type Subcontractor, type SubcontractorFields,
} from "@/services/subcontractors";

type Form = Record<Exclude<keyof SubcontractorFields, "competency">, string> & { competency: Competency | "" };

const EMPTY: Form = {
  company_name: "", tax_office: "", tax_number: "", address: "", city: "", phone: "", email: "", iban: "",
  contact_name: "", contact_title: "", contact_phone: "", contact_email: "", competency: "", notes: "",
};

const inputClass = "mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500";

function toForm(item: Subcontractor): Form {
  const form = { ...EMPTY };
  (Object.keys(EMPTY) as (keyof Form)[]).forEach((key) => { (form[key] as string) = (item[key] as string | null) ?? ""; });
  return form;
}

function CompetencyDot({ value, size = "h-3 w-3" }: { value: Competency | null; size?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${size} ${value ? COMPETENCY[value].dot : "border border-dashed border-slate-300 bg-white"}`} />;
}

function Field({ label, value, onChange, placeholder, maxLength, type = "text", inputMode }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength: number;
  type?: string; inputMode?: "tel" | "email" | "numeric";
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">{label}
      <input type={type} inputMode={inputMode} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}

function SubcontractorDialog({ item, onClose, onSaved }: { item: Subcontractor | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form>(item ? toForm(item) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof Form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 sm:py-10" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="taseron-baslik" className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="taseron-baslik" className="text-base font-bold text-slate-950">{item ? "Taşeron kartını düzenle" : "Yeni taşeron kartı"}</h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-6 p-5">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Yetkinlik rengi</legend>
            <p className="mt-0.5 text-xs text-slate-500">Rengin anlamını siz belirlersiniz; yalnızca gösterge olarak kullanılır.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COMPETENCY_KEYS.map((key) => (
                <button key={key} type="button" aria-pressed={form.competency === key} onClick={() => setForm((current) => ({ ...current, competency: current.competency === key ? "" : key }))}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${form.competency === key ? `${COMPETENCY[key].chip} ring-1 ring-current` : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  <CompetencyDot value={key} />{COMPETENCY[key].label}
                </button>
              ))}
              {form.competency && <button type="button" onClick={() => set("competency")("")} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">Rengi kaldır</button>}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">Firma ve cari bilgiler</legend>
            <Field label="Firma ünvanı" value={form.company_name} onChange={set("company_name")} maxLength={255} placeholder="Örn. Soğutma Montaj Ltd. Şti." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vergi dairesi" value={form.tax_office} onChange={set("tax_office")} maxLength={120} />
              <Field label="Vergi no / TCKN" value={form.tax_number} onChange={set("tax_number")} maxLength={32} inputMode="numeric" />
              <Field label="Telefon" value={form.phone} onChange={set("phone")} maxLength={40} inputMode="tel" />
              <Field label="E-posta" value={form.email} onChange={set("email")} maxLength={255} inputMode="email" />
              <Field label="İl / ilçe" value={form.city} onChange={set("city")} maxLength={80} />
              <Field label="IBAN" value={form.iban} onChange={set("iban")} maxLength={40} placeholder="TR.." />
            </div>
            <Field label="Adres" value={form.address} onChange={set("address")} maxLength={500} />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">Yetkili kişi</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ad soyad" value={form.contact_name} onChange={set("contact_name")} maxLength={255} />
              <Field label="Görevi" value={form.contact_title} onChange={set("contact_title")} maxLength={120} />
              <Field label="Telefon" value={form.contact_phone} onChange={set("contact_phone")} maxLength={40} inputMode="tel" />
              <Field label="E-posta" value={form.contact_email} onChange={set("contact_email")} maxLength={255} inputMode="email" />
            </div>
          </fieldset>

          <label className="block text-xs font-semibold text-slate-600">Not
            <textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} maxLength={4000} placeholder="Uzmanlık alanı, çalışma koşulları vb." className={`${inputClass} resize-none`} />
          </label>

          {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Vazgeç</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{item ? "Kaydet" : "Kartı oluştur"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SubcontractorsPage() {
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Competency | "all" | "none">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<{ item: Subcontractor | null } | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listSubcontractors(true)); setError(""); }
    catch (reason) { setError(getRequestErrorMessage(reason, "Taşeron kartları yüklenemedi.")); }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return items.filter((item) => (showInactive || item.is_active)
      && (filter === "all" || (filter === "none" ? !item.competency : item.competency === filter))
      && (!q || `${item.company_name} ${item.contact_name ?? ""} ${item.city ?? ""} ${item.tax_number ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)));
  }, [items, query, filter, showInactive]);

  const inactiveCount = items.filter((item) => !item.is_active).length;

  async function toggleActive(item: Subcontractor) {
    if (item.is_active && !window.confirm(`${item.company_name} kartı pasife alınsın mı? Kart silinmez, istediğinizde yeniden etkinleştirebilirsiniz.`)) return;
    try { await updateSubcontractor(item.id, { is_active: !item.is_active }); await load(); }
    catch (reason) { setError(getRequestErrorMessage(reason, "Kart güncellenemedi.")); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Taşeron Kartları<InfoHint text="Taşeron firmaların cari bilgileri, yetkili kişileri ve yetkinlik rengi." /></h1>
        </div>
        <button type="button" onClick={() => setDialog({ item: null })} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Yeni Taşeron</button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFilter("all")} className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${filter === "all" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>Tümü</button>
        {COMPETENCY_KEYS.map((key) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold ${filter === key ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            <CompetencyDot value={key} size="h-2.5 w-2.5" />{COMPETENCY[key].label}
          </button>
        ))}
        <button type="button" onClick={() => setFilter("none")} className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${filter === "none" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>Renk atanmamış</button>
        <div className="relative ml-auto min-w-0 flex-1 basis-60 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Firma, yetkili veya il ara" aria-label="Taşeron ara" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
      </div>
      {inactiveCount > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 accent-blue-600" />Pasif kartları da göster ({inactiveCount})
        </label>
      )}

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {loading ? <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
        : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <HardHat className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">{items.length === 0 ? "Henüz taşeron kartı yok" : "Bu filtreyle eşleşen kart yok"}</p>
            {items.length === 0 && <p className="mt-1 text-sm text-slate-500">&quot;Yeni Taşeron&quot; ile ilk kartı oluşturun.</p>}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {visible.map((item) => (
              <li key={item.id} className={`rounded-2xl border bg-white p-4 sm:p-5 ${item.is_active ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-1.5"><CompetencyDot value={item.competency} size="h-3.5 w-3.5" /></span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{item.company_name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {item.competency ? `Yetkinlik: ${COMPETENCY[item.competency].label}` : "Renk atanmamış"}{item.city ? ` · ${item.city}` : ""}{!item.is_active ? " · Pasif" : ""}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setDialog({ item })} aria-label={`${item.company_name} kartını düzenle`} className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                  <div className="min-w-0"><dt className="text-slate-400">Yetkili</dt><dd className="truncate font-medium text-slate-800">{item.contact_name ?? "—"}{item.contact_title ? ` · ${item.contact_title}` : ""}</dd></div>
                  <div className="min-w-0"><dt className="text-slate-400">Vergi dairesi / no</dt><dd className="truncate font-medium tabular-nums text-slate-800">{[item.tax_office, item.tax_number].filter(Boolean).join(" / ") || "—"}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-xs">
                  {(item.contact_phone ?? item.phone) && <a href={`tel:${item.contact_phone ?? item.phone}`} className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline"><Phone className="h-3.5 w-3.5" />{item.contact_phone ?? item.phone}</a>}
                  {(item.contact_email ?? item.email) && <a href={`mailto:${item.contact_email ?? item.email}`} className="inline-flex min-w-0 items-center gap-1.5 font-medium text-blue-700 hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.contact_email ?? item.email}</span></a>}
                  <button type="button" onClick={() => void toggleActive(item)} className="ml-auto font-semibold text-slate-500 hover:text-slate-900">{item.is_active ? "Pasife al" : "Etkinleştir"}</button>
                </div>
              </li>
            ))}
          </ul>
        )}

      {dialog && <SubcontractorDialog item={dialog.item} onClose={() => setDialog(null)} onSaved={load} />}
    </div>
  );
}
