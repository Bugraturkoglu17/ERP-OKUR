import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

export type Competency = "yesil" | "sari" | "kirmizi";

// Puanı olan taşeronda renk ortalamadan hesaplanır (4+ yeşil, 3–4 sarı, 3 altı kırmızı); yoksa yöneticinin seçtiği renk.
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
  /** Gösterilen renk: puan varsa ortalamadan, yoksa elle seçilen. */
  color: Competency | null; color_from_rating: boolean;
  rating_avg: number | null; rating_count: number;
  open_work_orders: number; active_projects: number; nearest_due: string | null;
};

/** İş emri ya da proje adımı: atanmış taşeron ve (iş tamamlandıysa) verilen puan. */
export type SubcontractorAssignment = {
  subcontractor_id: string | null; subcontractor_name: string | null; done: boolean; score: number | null; note: string | null;
};
export type WorkTarget = { work_order_id: string } | { stage_id: string };

const BASE = "/subcontractors";

export const listSubcontractors = (includeInactive = false) =>
  apiGet<Subcontractor[]>(BASE, includeInactive ? { include_inactive: true } : undefined);
export const createSubcontractor = (payload: Partial<SubcontractorFields>) => apiPost<Subcontractor>(BASE, payload);
export const updateSubcontractor = (id: string, payload: Partial<SubcontractorFields> & { is_active?: boolean }) =>
  apiPatch<Subcontractor>(`${BASE}/${id}`, payload);

export const getSubcontractorAssignment = (target: WorkTarget) => apiGet<SubcontractorAssignment>(`${BASE}/assignment`, target);
export const setSubcontractorAssignment = (target: WorkTarget, subcontractorId: string | null) =>
  apiPut<SubcontractorAssignment>(`${BASE}/assignment`, { ...target, subcontractor_id: subcontractorId });
export const setSubcontractorRating = (target: WorkTarget, score: number | null, note?: string | null) =>
  apiPut<SubcontractorAssignment>(`${BASE}/rating`, { ...target, score, note: note ?? null });
