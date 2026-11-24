"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { createStore, updateStore, type Store } from "@/services/stores";
import { TURKEY_CITIES, matchTurkeyCity } from "@/lib/turkey-cities";

// Mağaza ekleme/düzenleme penceresi. Mağaza Kartı listesinin yanında Yeni Proje ve
// Yeni İş Emri ekranlarında da kullanılır: kullanıcı formdan ayrılmadan mağaza açar,
// oluşturulan kayıt onDone ile geri verilir ve formda seçili gelir.

type Customer = { id: string; name: string; code?: string };
type Region   = { id: string; name: string; city: string; customer_id: string };

type DescExtra = { bolge?: string; sehir?: string; adres?: string; tel1?: string; [key: string]: unknown };

export type StoreFormState = {
  customer_id: string; region_id: string; branch_id: string;
  name: string; project_no: string; status: string;
  bolge: string; sehir: string; adres: string; tel1: string;
};

export function defaultStoreForm(): StoreFormState {
  return {
    customer_id: "", region_id: "", branch_id: "",
    name: "", project_no: "", status: "inquiry",
    bolge: "", sehir: "", adres: "", tel1: "",
  };
}

function parseDesc(desc?: string): DescExtra {
  if (!desc) return {};
  try { return JSON.parse(desc); } catch { return {}; }
}

export function storeFormFrom(p: {
  name: string; project_no?: string; status: string; description?: string;
  customer_id?: string; region_id?: string; branch_id?: string;
}): StoreFormState {
  const extra = parseDesc(p.description);
  return {
    customer_id: p.customer_id ?? "", region_id: p.region_id ?? "", branch_id: p.branch_id ?? "",
    name: p.name, project_no: p.project_no ?? "", status: p.status.toLowerCase(),
    bolge: extra.bolge ?? "", sehir: matchTurkeyCity(extra.sehir ?? ""), adres: extra.adres ?? "",
    tel1: extra.tel1 ?? "",
  };
}

function buildDescription(existing: string | undefined, form: StoreFormState): string {
  let base: DescExtra = {};
  try { base = JSON.parse(existing || "{}"); } catch {}
  if (form.bolge.trim())      base.bolge      = form.bolge.trim();      else delete base.bolge;
  if (form.sehir.trim())      base.sehir      = form.sehir.trim();      else delete base.sehir;
  if (form.adres.trim())      base.adres      = form.adres.trim();      else delete base.adres;
  if (form.tel1.trim())       base.tel1       = form.tel1.trim();       else delete base.tel1;
  return JSON.stringify(base);
}

export function StoreFormModal({ mode, initial, projectId, existingDescription, existingScopeCodes, customers: customersProp, onClose, onDone }: {
  mode: "create" | "edit"; initial: StoreFormState; projectId?: string;
  existingDescription?: string; existingScopeCodes?: string[];
  /** Verilmezse zincir listesi pencere açılınca yüklenir. */
  customers?: Customer[];
  onClose: () => void;
  /** Kaydedilen mağaza ile çağrılır. */
  onDone: (store: Store) => void;
}) {
  const [form,     setForm]     = useState<StoreFormState>(initial);
  const [loadedCustomers, setLoadedCustomers] = useState<Customer[]>([]);
  const [regions,  setRegions]  = useState<Region[]>([]);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");
  const customers = customersProp ?? loadedCustomers;

  useEffect(() => {
    if (customersProp) return;
    apiGet<Customer[]>("/projects/customers")
      .then(d => setLoadedCustomers(Array.isArray(d) ? d : []))
      .catch(() => setErr("Mağaza zincirleri yüklenemedi."));
  }, [customersProp]);
  useEffect(() => {
    if (initial.customer_id) {
      apiGet<Region[]>(`/projects/regions/${initial.customer_id}`)
        .then(d => setRegions(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [initial.customer_id]);
  const onCustomerChange = async (id: string) => {
    setForm(p => ({ ...p, customer_id: id, region_id: "", branch_id: "" }));
    setRegions([]);
    if (!id) return;
    const d = await apiGet<Region[]>(`/projects/regions/${id}`).catch(() => [] as Region[]);
    setRegions(Array.isArray(d) ? d : []);
  };

  // Bölge yukarıdaki listeden seçilir; açıklamadaki "bolge" alanı ayrıca sorulmaz, seçimden doldurulur.
  const onRegionChange = (id: string) => {
    const region = regions.find(r => r.id === id);
    setForm(p => ({ ...p, region_id: id, branch_id: "", bolge: region?.name ?? "" }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Bu pencere başka bir formun (Yeni Proje vb.) üstünde açıldığında gönderim dış forma taşmasın.
    e.stopPropagation();
    if (mode === "create" && (!form.customer_id || !form.region_id)) {
      setErr("Konum bilgisi zorunludur (Zincir, Bölge)."); return;
    }
    setBusy(true); setErr("");
    try {
      const desc = buildDescription(existingDescription, form);
      const payload = {
        name: form.name.trim(), project_no: form.project_no.trim() || null,
        description: desc, status: form.status, contract_value: null,
      };
      let saved: Store;
      if (mode === "create") {
        // Şube gönderilmez: API mağazaya özel yeni bir şube (konum) açar.
        saved = await createStore({ ...payload, customer_id: form.customer_id, region_id: form.region_id });
      } else {
        // scope_codes değiştirilmez — bakım/tadilat/yeni_yapım modüllerinden yönetilir
        saved = await updateStore(projectId!, { ...payload, scope_codes: existingScopeCodes ?? [] });
      }
      onDone(saved); onClose();
    } catch (ex: any) {
      const detail = ex?.response?.data?.detail;
      setErr(typeof detail === "string" ? detail : "İşlem başarısız.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="store-form-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="store-form-title" className="text-sm font-bold text-slate-900">
            {mode === "create" ? "Yeni Mağaza Ekle" : "Mağaza Bilgilerini Düzenle"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Kapat"><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[75vh] px-6 py-5 space-y-4">
          {mode === "create" && (
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Konum Bilgisi</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Zinciri *</label>
                <select required value={form.customer_id} onChange={e => onCustomerChange(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">Zincir seçin...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bölge *</label>
                <select required value={form.region_id} onChange={e => onRegionChange(e.target.value)}
                  disabled={!form.customer_id}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50">
                  <option value="">Bölge seçin...</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.city}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Adı *</label>
              <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Örn: Migros Ataşehir MMM" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mağaza Kodu</label>
              <input value={form.project_no} onChange={e => setForm(p => ({ ...p, project_no: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Örn: 3421" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Şehir</label>
              <select value={form.sehir} onChange={e => setForm(p => ({ ...p, sehir: e.target.value }))}
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">Şehir seçin...</option>
                {/* Listede olmayan eski bir değer silinmesin diye seçenek olarak korunur. */}
                {form.sehir && !TURKEY_CITIES.includes(form.sehir) && <option value={form.sehir}>{form.sehir}</option>}
                {TURKEY_CITIES.map(city => <option key={city} value={city}>{city}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telefon</label>
              <input value={form.tel1} onChange={e => setForm(p => ({ ...p, tel1: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="0XXX XXX XX XX" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Adres</label>
              <textarea rows={2} value={form.adres} onChange={e => setForm(p => ({ ...p, adres: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                placeholder="Tam adres..." />
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Vazgeç
            </button>
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? "Mağaza Oluştur" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
