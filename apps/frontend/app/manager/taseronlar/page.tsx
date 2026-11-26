"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, HardHat, Loader2, Mail, Pencil, Phone, Plus, Search, Star, X } from "lucide-react";
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

type SortKey = "name" | "rating" | "load";
const SORTS: { key: SortKey; label: string }[] = [{ key: "name", label: "Ad" }, { key: "rating", label: "Puan" }, { key: "load", label: "İş yükü" }];
const workload = (item: Subcontractor) => item.open_work_orders + item.active_projects;
const formatDay = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
const isPast = (iso: string) => new Date(iso) < new Date(new Date().toDateString());

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
            <p className="mt-0.5 text-xs text-slate-500">Puan verilmiş taşeronda renk puan ortalamasından hesaplanır; bu renk puan yokken görünür.</p>
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
  const [sort, setSort] = useState<SortKey>("name");
  const [dialog, setDialog] = useState<{ item: Subcontractor | null } | null>(null);

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

  async function toggleActive(item: Subcontractor) {
    if (item.is_active && !window.confirm(`${item.company_name} kartı pasife alınsın mı? Kart silinmez, istediğinizde yeniden etkinleştirebilirsiniz.`)) return;
    try { await updateSubcontractor(item.id, { is_active: !item.is_active }); await load(); }
    catch (reason) { setError(getRequestErrorMessage(reason, "Kart güncellenemedi.")); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Taşeron Kartları<InfoHint text="Puan: tamamlanan iş emri ve proje adımlarında verilen 1–5 puanın ortalaması. İş yükü: taşerona atanmış açık iş emirleri ve devam eden projeler." /></h1>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs" role="group" aria-label="Sıralama">
          <span className="mr-1 text-slate-500">Sırala</span>
          {SORTS.map((option) => (
            <button key={option.key} type="button" aria-pressed={sort === option.key} onClick={() => setSort(option.key)}
              className={`rounded-lg px-2.5 py-1.5 font-semibold ${sort === option.key ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900"}`}>{option.label}</button>
          ))}
        </div>
        {inactiveCount > 0 && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 accent-blue-600" />Pasif kartları da göster ({inactiveCount})
          </label>
        )}
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {loading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <HardHat className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">{items.length === 0 ? "Henüz taşeron kartı yok" : "Bu filtreyle eşleşen kart yok"}</p>
            {items.length === 0 && <p className="mt-1 text-sm text-slate-500">&quot;Yeni Taşeron&quot; ile ilk kartı oluşturun.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Firma</th>
                  <th className="px-3 py-3">Puan</th>
                  <th className="px-3 py-3 text-right">Açık iş emri</th>
                  <th className="px-3 py-3 text-right">Devam eden proje</th>
                  <th className="px-3 py-3">En yakın termin</th>
                  <th className="px-3 py-3">İletişim</th>
                  <th className="px-4 py-3"><span className="sr-only">İşlemler</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((item) => {
                  const phone = item.contact_phone ?? item.phone;
                  const email = item.contact_email ?? item.email;
                  return (
                    <tr key={item.id} className={item.is_active ? "" : "opacity-60"}>
                      <td className="max-w-[280px] px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-1.5" title={item.color ? `${COMPETENCY[item.color].label}${item.color_from_rating ? " (puandan)" : ""}` : "Renk yok"}>
                            <CompetencyDot value={item.color} size="h-3 w-3" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{item.company_name}</p>
                            <p className="truncate text-xs text-slate-500">{[item.city, item.contact_name].filter(Boolean).join(" · ") || "—"}{!item.is_active ? " · Pasif" : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {item.rating_avg !== null ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            <span className="font-semibold tabular-nums text-slate-900">{item.rating_avg.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                            <span className="text-xs text-slate-400">{item.rating_count} iş</span>
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums ${item.open_work_orders ? "font-semibold text-slate-900" : "text-slate-300"}`}>{item.open_work_orders}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${item.active_projects ? "font-semibold text-slate-900" : "text-slate-300"}`}>{item.active_projects}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                        {item.nearest_due ? <span className={isPast(item.nearest_due) ? "font-semibold text-red-700" : "text-slate-700"}>{formatDay(item.nearest_due)}{isPast(item.nearest_due) ? " · gecikti" : ""}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="max-w-[220px] px-3 py-3 text-xs">
                        {phone && <a href={`tel:${phone}`} className="flex items-center gap-1.5 font-medium text-blue-700 hover:underline"><Phone className="h-3.5 w-3.5 shrink-0" />{phone}</a>}
                        {email && <a href={`mailto:${email}`} className="mt-0.5 flex min-w-0 items-center gap-1.5 font-medium text-blue-700 hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{email}</span></a>}
                        {!phone && !email && <span className="text-slate-300">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button type="button" onClick={() => setDialog({ item })} aria-label={`${item.company_name} kartını düzenle`} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => void toggleActive(item)} className="ml-2 text-xs font-semibold text-slate-500 hover:text-slate-900">{item.is_active ? "Pasife al" : "Etkinleştir"}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {dialog && <SubcontractorDialog item={dialog.item} onClose={() => setDialog(null)} onSaved={load} />}
    </div>
  );
}
