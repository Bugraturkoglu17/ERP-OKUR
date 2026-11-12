import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

export type ProjectStatus = "active" | "completed" | "cancelled";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Devam ediyor", completed: "Tamamlandı", cancelled: "İptal edildi",
};

export type ProjectSummary = {
  id: string; name: string; status: ProjectStatus;
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

export type ProjectWorkOrder = {
  id: string; title: string; status: string; assigned_to_name: string | null; due_date: string | null; created_at: string;
};

export type ProjectDetail = {
  id: string; name: string; description: string | null; status: ProjectStatus;
  store: { id: string; name: string; no: string | null } | null;
  depot_id: string; manager_user_id: string | null; manager_name: string | null;
  start_date: string | null; target_date: string | null; budget: string | null;
  created_at: string; completed_at: string | null;
  stages: ProjectStage[]; documents: ProjectDocument[]; doc_types: Record<string, string>;
  materials: ProjectMaterial[]; planned_cost: string; used_cost: string;
  work_orders: ProjectWorkOrder[];
};

export type ProjectCreatePayload = {
  name: string; store_id: string; description?: string | null; manager_user_id?: string | null;
  start_date?: string | null; target_date?: string | null; budget?: string | null;
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
export const deleteProjectDocument = (documentId: string) => apiDelete(`${BASE}/documents/${documentId}`);
export const projectDocumentUrl = (id: string) => `${BASE}/${id}/documents`;

// ── Aşama sorumlusu (saha kullanıcısı) için: "Proje Görevlerim" ──

export type MyStage = {
  stage_id: string; stage_order: number; stage_name: string; status: "planned" | "in_progress";
  planned_end: string | null; overdue: boolean; approval_pending: boolean;
  project_id: string; project_name: string; store_name: string | null; store_no: string | null;
};

export type StageTask = {
  project: { id: string; name: string; description: string | null; status: ProjectStatus; store: { name: string; no: string | null } | null };
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
