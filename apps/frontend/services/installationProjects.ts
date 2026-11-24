import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

export type ProjectStatus = "active" | "completed" | "cancelled";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Devam ediyor", completed: "Tamamlandı", cancelled: "İptal edildi",
};

export type ProjectType = "market" | "soguk_oda" | "sogutma";

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  market: "Mağaza", soguk_oda: "Soğuk oda", sogutma: "Soğutma",
};
export const PROJECT_TYPES = Object.keys(PROJECT_TYPE_LABEL) as ProjectType[];

export type ProjectMember = { id: string; name: string };
export type ProductionNumber = { id: string; number: string; note: string | null; created_by_name: string | null; created_at: string };

export type CostKind = "target" | "actual";
export type CostCategory = "montaj_iscilik" | "nakliye" | "urun" | "ek";
export type CostExtra = { id: string; amount: string; description: string | null };
/** "ek" kaleminde tutar, extras içindeki satırların toplamıdır. */
export type CostItem = { category: CostCategory; label: string; amount: string | null; description: string | null; extras?: CostExtra[] };
export type ProjectCosts = {
  categories: Record<CostCategory, string>;
  target: { items: CostItem[]; total: string };
  actual: { items: CostItem[]; total: string };
};

export type ProjectSummary = {
  id: string; name: string; status: ProjectStatus;
  project_type: ProjectType; project_type_label: string; member_count: number;
  store_id: string; store_name: string | null; store_no: string | null;
  manager_name: string | null; target_date: string | null; created_at: string; completed_at: string | null;
  stages_total: number; stages_done: number; current_stage: string | null;
  current_stage_overdue: boolean; overdue: boolean; work_order_count: number; closing_pending: boolean;
};

export type StageRequirement = { label: string; ok: boolean };
export type ChecklistItem = { id: string; label: string; is_done: boolean; done_at: string | null };

export type ProjectStage = {
  id: string; order: number; code: string; name: string;
  status: "planned" | "in_progress" | "completed";
  responsible_user_id: string | null; responsible_name: string | null;
  planned_end: string | null; started_at: string | null; completed_at: string | null; note: string | null;
  approval_requested_at?: string | null; approval_requested_by_name?: string | null;
  checklist: ChecklistItem[]; requirements: StageRequirement[];
};

export type ProjectDocument = {
  id: string; doc_type: string; doc_type_label: string; stage_id: string | null;
  file_name: string; mime_type: string | null; file_size_bytes: number;
  uploaded_by_name: string | null; uploaded_at: string; url: string | null;
};

export type ProjectMaterial = {
  id: string | null; material_id: string; sku: string; name: string; spec: string | null; unit: string;
  unit_price: string | null; planned_quantity: string; in_depot: string; used: string; missing: string; note: string | null;
};

/** Kapanış aşamasındaki faturalandırma bilgileri. */
type InvoiceParty = { invoice_title: string | null; invoice_tax_office: string | null; invoice_tax_no: string | null; invoice_address: string | null };
export type ProjectBilling = InvoiceParty & {
  sale_price: string | null; sale_price_includes_vat: boolean; vat_rate: string;
  invoice_no: string | null; invoice_date: string | null; invoice_due_date: string | null;
  /** Kesilen faturanın KDV dahil tutarı. */
  invoice_amount: string | null;
  /** Fatura tarafı boşken önerilen değerler (müşteri firmanın önceki projesi ya da firma kaydı). */
  defaults: InvoiceParty;
};
export type ProjectBillingPayload = Omit<ProjectBilling, "defaults">;

export type ProjectWorkOrder = {
  id: string; title: string; status: string; assigned_to_name: string | null; due_date: string | null; created_at: string;
};

export type ProjectDetail = {
  id: string; name: string; description: string | null; status: ProjectStatus;
  project_type: ProjectType; project_type_label: string;
  can_manage: boolean; members: ProjectMember[]; production_numbers: ProductionNumber[]; costs: ProjectCosts;
  /** Adres ve iletişim bilgileri mağaza kartından gelir. */
  store: { id: string; name: string; no: string | null; address: string | null; city: string | null; region: string | null; phones: string[] } | null;
  billing: ProjectBilling;
  depot_id: string; manager_user_id: string | null; manager_name: string | null;
  start_date: string | null; target_date: string | null; budget: string | null;
  created_at: string; completed_at: string | null;
  stages: ProjectStage[]; documents: ProjectDocument[]; doc_types: Record<string, string>;
  materials: ProjectMaterial[]; planned_cost: string | null; used_cost: string | null;
  work_orders: ProjectWorkOrder[];
};

export type ProjectCreatePayload = {
  name: string; store_id: string; description?: string | null; manager_user_id?: string | null;
  start_date?: string | null; target_date?: string | null; budget?: string | null;
  project_type?: ProjectType; member_user_ids?: string[];
};

const BASE = "/installation-projects";

export const listProjects = (status?: ProjectStatus) =>
  apiGet<ProjectSummary[]>(BASE, status ? { status } : undefined);
export const getProject = (id: string) => apiGet<ProjectDetail>(`${BASE}/${id}`);
export const createProject = (payload: ProjectCreatePayload) =>
  apiPost<{ id: string; name: string; depot_id: string }>(BASE, payload);
export const updateProject = (id: string, payload: Partial<ProjectCreatePayload> & { status?: "cancelled" }) =>
  apiPatch(`${BASE}/${id}`, payload);
export const updateStage = (stageId: string, payload: { responsible_user_id?: string | null; planned_end?: string | null; note?: string | null; action?: "complete" | "request_approval" | "reject_approval" }) =>
  apiPatch(`${BASE}/stages/${stageId}`, payload);
export const addChecklistItem = (stageId: string, label: string) => apiPost(`${BASE}/stages/${stageId}/checklist`, { label });
export const setChecklistItem = (itemId: string, isDone: boolean) => apiPatch(`${BASE}/checklist/${itemId}`, { is_done: isDone });
export const saveProjectMaterials = (id: string, materials: { material_id: string; planned_quantity: string; note?: string | null }[]) =>
  apiPut<ProjectMaterial[]>(`${BASE}/${id}/materials`, { materials });
export const saveProjectBilling = (id: string, payload: ProjectBillingPayload) =>
  apiPut<ProjectBilling>(`${BASE}/${id}/billing`, payload);
export const saveProjectMembers = (id: string, userIds: string[]) =>
  apiPut<ProjectMember[]>(`${BASE}/${id}/members`, { user_ids: userIds });
export const addProductionNumber = (id: string, number: string, note?: string | null) =>
  apiPost<ProductionNumber[]>(`${BASE}/${id}/production-numbers`, { number, note: note ?? null });
export const deleteProductionNumber = (numberId: string) => apiDelete(`${BASE}/production-numbers/${numberId}`);
export const saveProjectCosts = (id: string, kind: CostKind, items: { category: CostCategory; amount: string | null; description?: string | null }[]) =>
  apiPut<ProjectCosts>(`${BASE}/${id}/costs`, { kind, items });
export const deleteProjectDocument = (documentId: string) => apiDelete(`${BASE}/documents/${documentId}`);
export const projectDocumentUrl = (id: string) => `${BASE}/${id}/documents`;

// ── Aşama sorumlusu (saha kullanıcısı) için: "Proje Görevlerim" ──

export type MyStage = {
  stage_id: string; stage_order: number; stage_name: string; status: "planned" | "in_progress";
  planned_end: string | null; overdue: boolean; approval_pending: boolean;
  project_id: string; project_name: string; store_name: string | null; store_no: string | null;
};

export type StageTask = {
  project: {
    id: string; name: string; description: string | null; status: ProjectStatus;
    project_type: ProjectType; project_type_label: string; is_member: boolean;
    store: { name: string; no: string | null } | null;
  };
  production_numbers: ProductionNumber[];
  stage: {
    id: string; order: number; code: string; name: string; status: "planned" | "in_progress" | "completed";
    planned_end: string | null; started_at: string | null; completed_at: string | null; note: string | null;
    approval_requested_at: string | null; needs_approval: boolean;
    checklist: ChecklistItem[]; requirements: StageRequirement[];
  };
  stages: { order: number; name: string; status: string }[];
  documents: { id: string; doc_type: string; doc_type_label: string; stage_id: string | null; file_name: string; uploaded_by_name: string | null; uploaded_at: string; url: string | null }[];
  doc_types: Record<string, string>;
  materials: Omit<ProjectMaterial, "unit_price">[];
  work_orders: { id: string; title: string; status: string; assigned_to_name: string | null }[];
};

export const getMyStages = () => apiGet<MyStage[]>(`${BASE}/my-stages`);
export const getStageTask = (stageId: string) => apiGet<StageTask>(`${BASE}/stages/${stageId}/task`);

/** İstatistik ekranı: proje ve maliyet özeti (yalnızca yönetici). Para toplamlarına iptal edilen projeler katılmaz. */
export type ProjectStats = {
  counts: { total: number; active: number; completed: number; cancelled: number; overdue: number; closing_pending: number };
  avg_completion_days: number | null;
  money: { budget_total: number; target_total: number; actual_total: number; missing_target: number; over_target: number };
  by_type: { type: ProjectType; label: string; count: number; active: number; budget: number; target: number; actual: number }[];
  by_stage: { order: number; name: string; count: number }[];
  by_category: { category: CostCategory; label: string; target: number; actual: number }[];
  projects: {
    id: string; name: string; status: ProjectStatus; project_type_label: string;
    stages_total: number; stages_done: number; current_stage: string | null; overdue: boolean;
    budget: number | null; target: number | null; actual: number | null; usage_pct: number | null;
  }[];
};

export const getProjectStats = () => apiGet<ProjectStats>(`${BASE}/stats`);
