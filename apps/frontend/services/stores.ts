/**
 * Mağaza (store) veri erişim katmanı — role bağımsız, tek kaynak: backend /projects API.
 * Yetki kontrolü backend'de yapılır (bkz. app/api/v1/routes/projects.py: list_projects).
 *
 * Excel içe aktarma sihirbazı (kolon eşleştirme, önizleme, hata raporu) UI-ağırlıklı
 * olduğu için app/projects/import/page.tsx içinde kalır; o sihirbaz bu dosyadaki
 * createStore/updateStore fonksiyonlarını satır satır çağırır.
 */
import { api, apiGet, apiPost, apiPatch } from "@/lib/api";

export type Store = {
  id: string;
  name: string;
  project_no?: string;
  description?: string;
  status: string;
  scope_codes?: string[];
  region_id?: string;
  branch_id?: string;
  customer_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type StoreListParams = { limit?: number; skip?: number; q?: string };
export type StorePageResult = { items: Store[]; total: number };
export type Region = { id: string; name: string; city: string; customer_id: string };

const STORE_PAGE_CHUNK = 500;

/**
 * Mağaza Kartı listesi için sunucu-taraflı sayfalama — 4000+ mağazayı tek
 * seferde çekmek yerine yalnızca görüntülenecek sayfayı ister. Toplam kayıt
 * sayısı ayrı bir count isteği yerine aynı yanıtın X-Total-Count header'ından
 * okunur (bkz. backend app/api/v1/routes/projects.py: list_projects).
 */
export async function getStoresPage(params: {
  page: number;
  pageSize: number;
  q?: string;
  regionId?: string;
  includeCancelled?: boolean;
}): Promise<StorePageResult> {
  const skip = (params.page - 1) * params.pageSize;
  const query: Record<string, string> = { limit: String(params.pageSize), skip: String(skip) };
  if (params.q?.trim()) query.q = params.q.trim();
  if (params.regionId && params.regionId !== "all") query.region_id = params.regionId;
  if (params.includeCancelled === false) query.include_cancelled = "false";
  const res = await api.get<Store[]>("/projects", { params: query });
  const items = Array.isArray(res.data) ? res.data : [];
  const totalHeader = res.headers?.["x-total-count"];
  const total = totalHeader !== undefined ? Number(totalHeader) : items.length;
  return { items, total };
}

/** Tüm bölgeleri tek istekte getirir (filtre dropdown + mağaza kartı etiketi içindir). */
export async function getAllRegions(): Promise<Region[]> {
  const data = await apiGet<Region[]>("/projects/regions");
  return Array.isArray(data) ? data : [];
}

/** Pasifleştirilmiş (iptal) mağaza sayısını, satırları çekmeden yalnızca header'dan okur. */
export async function getCancelledStoreCount(): Promise<number> {
  const res = await api.get<Store[]>("/projects", { params: { status: "cancelled", limit: 1 } });
  const totalHeader = res.headers?.["x-total-count"];
  return totalHeader !== undefined ? Number(totalHeader) : 0;
}

async function fetchStorePage(skip: number, limit: number, q?: string): Promise<Store[]> {
  const query = new URLSearchParams({ limit: String(limit), skip: String(skip) });
  if (q?.trim()) query.set("q", q.trim());
  const data = await apiGet<Store[]>(`/projects?${query.toString()}`);
  return Array.isArray(data) ? data : [];
}

/**
 * Mağaza listesini getirir. `limit` verilmezse (varsayılan "tüm liste" kullanımı)
 * backend'den tek dev bir istekle değil, 500'lük parçalar halinde art arda çekilir —
 * aynı veri, aynı sıralama, ama tek seferde binlerce satırlık bir response üretilmez.
 */
export async function getStores(params: StoreListParams = {}): Promise<Store[]> {
  if (params.limit !== undefined) {
    return fetchStorePage(params.skip ?? 0, params.limit, params.q);
  }

  const results: Store[] = [];
  let skip = params.skip ?? 0;
  for (;;) {
    const page = await fetchStorePage(skip, STORE_PAGE_CHUNK, params.q);
    results.push(...page);
    if (page.length < STORE_PAGE_CHUNK) break;
    skip += STORE_PAGE_CHUNK;
  }
  return results;
}

/** Tek bir mağazayı ID ile getirir. */
export async function getStoreById(id: string): Promise<Store> {
  return apiGet<Store>(`/projects/${id}`);
}

/**
 * Halihazırda yüklenmiş bir mağaza listesinde ad/koda göre arar.
 * Backend'de henüz server-side arama endpoint'i olmadığı için client-side filtreler.
 */
export function searchStores(stores: Store[], query: string): Store[] {
  const q = query.trim().toLowerCase();
  if (!q) return stores;
  return stores.filter(
    (s) => s.name.toLowerCase().includes(q) || (s.project_no ?? "").toLowerCase().includes(q)
  );
}

/** Büyük mağaza dizininde sunucu tarafında ad/kod araması yapar. */
export async function searchStoresRemote(query: string, limit = 20): Promise<Store[]> {
  if (!query.trim()) return [];
  return getStores({ q: query, limit, skip: 0 });
}

export type StoreCreateInput = {
  name: string;
  project_no?: string | null;
  description?: string;
  status?: string;
  customer_id: string;
  region_id: string;
  branch_id: string;
  scope_codes?: string[];
  contract_value?: number | null;
  start_date?: string;
  due_date?: string;
};

export async function createStore(input: StoreCreateInput): Promise<Store> {
  return apiPost<Store>("/projects", input);
}

export async function updateStore(id: string, input: Partial<StoreCreateInput>): Promise<Store> {
  return apiPatch<Store>(`/projects/${id}`, input);
}
