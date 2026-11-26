"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Spinner } from "@/components/shadcn/spinner";
import { Textarea } from "@/components/shadcn/textarea";
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Yeni Mağaza Ekle" : "Mağaza Bilgilerini Düzenle"}</DialogTitle>
          <DialogDescription className="sr-only">Mağaza kartı bilgileri</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="gap-4">
            {mode === "create" && (
              <FieldSet className="gap-3 rounded-lg border bg-muted/50 p-4">
                <FieldLegend variant="label" className="mb-0 text-[11px] uppercase tracking-wide text-muted-foreground">Konum Bilgisi</FieldLegend>
                <Field>
                  <FieldLabel htmlFor="mf-zincir">Mağaza Zinciri *</FieldLabel>
                  <Select value={form.customer_id || undefined} onValueChange={onCustomerChange}>
                    <SelectTrigger id="mf-zincir"><SelectValue placeholder="Zincir seçin..." /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field data-disabled={!form.customer_id || undefined}>
                  <FieldLabel htmlFor="mf-bolge">Bölge *</FieldLabel>
                  <Select value={form.region_id || undefined} onValueChange={onRegionChange} disabled={!form.customer_id}>
                    <SelectTrigger id="mf-bolge"><SelectValue placeholder="Bölge seçin..." /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>{regions.map(r => <SelectItem key={r.id} value={r.id}>{r.city}</SelectItem>)}</SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldSet>
            )}

            <Field>
              <FieldLabel htmlFor="mf-ad">Mağaza Adı *</FieldLabel>
              <Input id="mf-ad" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Örn: Migros Ataşehir MMM" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="mf-kod">Mağaza Kodu</FieldLabel>
                <Input id="mf-kod" value={form.project_no} onChange={e => setForm(p => ({ ...p, project_no: e.target.value }))} placeholder="Örn: 3421" />
              </Field>
              <Field>
                <FieldLabel htmlFor="mf-sehir">Şehir</FieldLabel>
                <Select value={form.sehir || undefined} onValueChange={(value) => setForm(p => ({ ...p, sehir: value }))}>
                  <SelectTrigger id="mf-sehir"><SelectValue placeholder="Şehir seçin..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectGroup>
                      {/* Listede olmayan eski bir değer silinmesin diye seçenek olarak korunur. */}
                      {form.sehir && !TURKEY_CITIES.includes(form.sehir) && <SelectItem value={form.sehir}>{form.sehir}</SelectItem>}
                      {TURKEY_CITIES.map(city => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="col-span-2 sm:col-span-1">
                <FieldLabel htmlFor="mf-tel">Telefon</FieldLabel>
                <Input id="mf-tel" inputMode="tel" value={form.tel1} onChange={e => setForm(p => ({ ...p, tel1: e.target.value }))} placeholder="0XXX XXX XX XX" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="mf-adres">Adres</FieldLabel>
              <Textarea id="mf-adres" rows={2} value={form.adres} onChange={e => setForm(p => ({ ...p, adres: e.target.value }))} placeholder="Tam adres..." className="resize-none" />
            </Field>

            {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>Vazgeç</Button>
            <Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{mode === "create" ? "Mağaza Oluştur" : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
