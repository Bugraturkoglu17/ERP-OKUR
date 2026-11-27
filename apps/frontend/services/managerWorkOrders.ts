import { apiGet, apiPatch, apiPost } from "@/lib/api";

export type WorkOrderStatus = "planned" | "in_progress" | "completed" | "cancelled";
export type WorkOrderCategory = "ariza" | "tadilat" | "proje" | "yeni_yapim";
export type WorkOrderPriority = "normal" | "important" | "critical";

export const CATEGORY_LABEL: Record<WorkOrderCategory, string> = {
  ariza: "Arıza", tadilat: "Tadilat", proje: "Proje", yeni_yapim: "Yeni Yapım (eski)",
};
/** Yeni iş emrinde seçilebilen tipler; "Yeni Yapım" kaldırıldı, yerine "Proje" geldi. */
export const CREATABLE_CATEGORIES: WorkOrderCategory[] = ["ariza", "tadilat", "proje"];
export const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  normal: "Normal", important: "Önemli", critical: "Kritik",
};
export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  planned: "Planlanacak", in_progress: "Devam Ediyor",
  completed: "Tamamlandı", cancelled: "İptal Edildi",
};

type BackendWorkOrder = {
  id: string; project_id: string; project_name?: string; project_no?: string;
  project_region?: string; project_city?: string; project_address?: string;
  work_type: string; title: string; description?: string;
  assigned_to_name?: string; assigned_to_user_id?: string;
  priority: string; status: string; due_date?: string;
  created_at: string; updated_at: string; photo_count?: number; has_critical_report?: boolean;
  installation_project_id?: string | null; installation_project_name?: string | null;
};

export type WorkOrder = {
  id: string; title: string; description: string; category: WorkOrderCategory;
  priority: WorkOrderPriority; status: WorkOrderStatus; rawStatus: string;
  store_id: string; store_name: string; store_code: string;
  store_region: string; store_city: string; store_address: string;
  assigned_to: string; assigned_to_name: string; due_date: string | null;
  created_at: string; updated_at: string; photo_count: number;
  has_critical_report: boolean;
  installation_project_id: string | null; installation_project_name: string | null;
};

export type TeamUser = {
  id: string; full_name: string; email: string; phone?: string;
  is_active: boolean; default_role?: string;
};

const CATEGORY_FROM_API: Record<string, WorkOrderCategory> = {
  fault: "ariza", repair: "ariza", renovation: "tadilat",
  maintenance: "tadilat", manufacturing: "yeni_yapim", project: "proje",
};
const CATEGORY_TO_API: Record<WorkOrderCategory, string> = {
  ariza: "fault", tadilat: "renovation", proje: "project", yeni_yapim: "manufacturing",
};
const PRIORITY_FROM_API: Record<string, WorkOrderPriority> = {
  normal: "normal", urgent: "important", critical: "critical",
};
const PRIORITY_TO_API: Record<WorkOrderPriority, string> = {
  normal: "normal", important: "urgent", critical: "critical",
};

export function normalizeStatus(status: string): WorkOrderStatus {
  if (["started", "material_waiting", "revisit"].includes(status)) return "in_progress";
  if (["completed", "approved"].includes(status)) return "completed";
  if (["cancelled", "failed"].includes(status)) return "cancelled";
  return "planned";
}

function normalizeWorkOrder(item: BackendWorkOrder): WorkOrder {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    category: CATEGORY_FROM_API[item.work_type] ?? "ariza",
    priority: PRIORITY_FROM_API[item.priority] ?? "normal",
    status: normalizeStatus(item.status),
    rawStatus: item.status,
    store_id: item.project_id,
    store_name: item.project_name ?? "Mağaza bilgisi yok",
    store_code: item.project_no ?? "Kod yok",
    store_region: item.project_region ?? "",
    store_city: item.project_city ?? "",
    store_address: item.project_address ?? "",
    assigned_to: item.assigned_to_user_id ?? "",
    assigned_to_name: item.assigned_to_name ?? "Atanmadı",
    due_date: item.due_date ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    photo_count: item.photo_count ?? 0,
    has_critical_report: item.has_critical_report ?? false,
    installation_project_id: item.installation_project_id ?? null,
    installation_project_name: item.installation_project_name ?? null,
  };
}

const WORK_ORDER_PAGE = 500;

/** Tüm iş emirleri 500'lük sayfalarla çekilir (sunucudaki eski 500 kayıt sınırı kalktı). */
export async function getManagerWorkOrders(): Promise<WorkOrder[]> {
  const all: BackendWorkOrder[] = [];
  for (let offset = 0; ; offset += WORK_ORDER_PAGE) {
    const page = await apiGet<BackendWorkOrder[]>("/work-orders", { limit: WORK_ORDER_PAGE, offset });
    const rows = Array.isArray(page) ? page : [];
    all.push(...rows);
    if (rows.length < WORK_ORDER_PAGE) break;
  }
  return all.map(normalizeWorkOrder);
}

/** Ekran sayıları (sunucuda tek sorgu): durum grupları, geciken ve kişi başı iş yükü. */
export type WorkOrderCounts = Record<WorkOrderStatus | "overdue", number>;
export type WorkOrderSummary = { counts: WorkOrderCounts; by_user: Record<string, WorkOrderCounts> };
export const getWorkOrderSummary = () => apiGet<WorkOrderSummary>("/work-orders/summary");

/** Sunucu tarafı süzülmüş / sıralanmış tek sayfa (tüm liste çekilmez). */
export type WorkOrderQuery = {
  group?: WorkOrderStatus; overdue?: boolean; q?: string; category?: WorkOrderCategory | "";
  priority?: WorkOrderPriority | ""; assignee?: string; assigned_only?: boolean;
  sort?: "created" | "updated" | "priority_due"; limit: number; offset?: number;
};
export async function getWorkOrderPage(query: WorkOrderQuery): Promise<WorkOrder[]> {
  const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== "" && value !== false));
  const rows = await apiGet<BackendWorkOrder[]>("/work-orders", params);
  return (Array.isArray(rows) ? rows : []).map(normalizeWorkOrder);
}

export async function getManagerWorkOrderById(id: string): Promise<WorkOrder> {
  return normalizeWorkOrder(await apiGet<BackendWorkOrder>(`/work-orders/${id}`));
}

export async function getTeamUsers(): Promise<TeamUser[]> {
  const users = await apiGet<TeamUser[]>("/auth/users");
  return (Array.isArray(users) ? users : []).filter((user) => {
    const role = user.default_role ?? "";
    return user.is_active && !role.includes("admin") && !role.includes("manager");
  });
}

export type CepDepot = {
  id: string; kind: "main" | "vehicle"; name: string; plate: string | null;
  assigned_user_id: string | null; is_active: boolean;
};

/** Çalışanlara zimmetli araç/cep depoları (yalnızca aktif olanlar). */
export async function getCepDepots(): Promise<CepDepot[]> {
  const depots = await apiGet<CepDepot[]>("/retail-stock/depots");
  return (Array.isArray(depots) ? depots : []).filter((depot) => depot.kind === "vehicle" && depot.is_active);
}

export type CreateWorkOrderPayload = {
  title: string; description: string; category: WorkOrderCategory;
  priority: WorkOrderPriority; store_id: string; assigned_to: string;
  due_date: string | null; stock_depot_id: string;
  /** Projeye bağlı montaj iş emri: malzeme projenin deposundan düşer. */
  installation_project_id?: string | null;
};

export async function createWorkOrder(payload: CreateWorkOrderPayload): Promise<WorkOrder> {
  const created = await apiPost<BackendWorkOrder>("/work-orders", {
    project_id: payload.store_id,
    work_type: CATEGORY_TO_API[payload.category],
    title: payload.title,
    description: payload.description,
    assigned_to_user_id: payload.assigned_to,
    stock_depot_id: payload.stock_depot_id,
    priority: PRIORITY_TO_API[payload.priority],
    due_date: payload.due_date,
    installation_project_id: payload.installation_project_id ?? null,
  });
  return normalizeWorkOrder(created);
}

export async function updateWorkOrder(
  id: string,
  payload: Partial<Pick<CreateWorkOrderPayload, "title" | "description" | "priority" | "assigned_to" | "due_date">>,
): Promise<WorkOrder> {
  const body: Record<string, unknown> = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.priority !== undefined) body.priority = PRIORITY_TO_API[payload.priority];
  if (payload.assigned_to !== undefined) body.assigned_to_user_id = payload.assigned_to;
  if (payload.due_date !== undefined) body.due_date = payload.due_date;
  return normalizeWorkOrder(await apiPatch<BackendWorkOrder>(`/work-orders/${id}`, body));
}

export async function cancelWorkOrder(id: string): Promise<WorkOrder> {
  return normalizeWorkOrder(await apiPatch<BackendWorkOrder>(`/work-orders/${id}`, { status: "cancelled" }));
}
