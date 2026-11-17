import { apiGet, apiPatch, apiPost } from "@/lib/api";

export type Competency = "yesil" | "sari" | "kirmizi";

// Renk yalnızca gösterge; anlamını firma kendi içinde bilir, rengi yönetici atar.
export const COMPETENCY: Record<Competency, { label: string; dot: string; chip: string }> = {
  yesil: { label: "Yeşil", dot: "bg-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  sari: { label: "Sarı", dot: "bg-amber-400", chip: "border-amber-200 bg-amber-50 text-amber-800" },
  kirmizi: { label: "Kırmızı", dot: "bg-red-500", chip: "border-red-200 bg-red-50 text-red-800" },
};
export const COMPETENCY_KEYS = Object.keys(COMPETENCY) as Competency[];

export type SubcontractorFields = {
  company_name: string; tax_office: string | null; tax_number: string | null; address: string | null;
  city: string | null; phone: string | null; email: string | null; iban: string | null;
  contact_name: string | null; contact_title: string | null; contact_phone: string | null; contact_email: string | null;
  competency: Competency | null; notes: string | null;
};

export type Subcontractor = SubcontractorFields & {
  id: string; competency_label: string | null; is_active: boolean; created_at: string; updated_at: string;
};

const BASE = "/subcontractors";

export const listSubcontractors = (includeInactive = false) =>
  apiGet<Subcontractor[]>(BASE, includeInactive ? { include_inactive: true } : undefined);
export const createSubcontractor = (payload: Partial<SubcontractorFields>) => apiPost<Subcontractor>(BASE, payload);
export const updateSubcontractor = (id: string, payload: Partial<SubcontractorFields> & { is_active?: boolean }) =>
  apiPatch<Subcontractor>(`${BASE}/${id}`, payload);
