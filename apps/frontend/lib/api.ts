import axios from 'axios';
import { clearClientSession } from '@/lib/client-session';

const API_PREFIX = '/api/v1';

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const createDefaultBaseUrl = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `http://localhost:8001${API_PREFIX}`;
    }
    throw new Error('Okur yerel kopyası yalnızca localhost üzerinde açılabilir.');
  }

  return `http://localhost:8001${API_PREFIX}`;
};

const createBaseUrl = () => {
  const rawBaseUrl = stripTrailingSlashes(process.env.NEXT_PUBLIC_API_URL || '');
  if (!rawBaseUrl) return createDefaultBaseUrl();
  const parsed = new URL(rawBaseUrl);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.port !== '8001') {
    throw new Error('Okur yerel kopyası yalnızca localhost:8001 API adresine bağlanabilir.');
  }
  return rawBaseUrl.endsWith(API_PREFIX) ? rawBaseUrl : `${rawBaseUrl}${API_PREFIX}`;
};

const normalizeRequestUrl = (url: string) => {
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return normalizedPath.startsWith(API_PREFIX)
    ? normalizedPath.slice(API_PREFIX.length) || '/'
    : normalizedPath;
};

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${createBaseUrl()}${normalizedPath}`;
};

export function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  const status = error.response?.status;
  if (status === 401) return 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.';
  if (status === 403) return 'Bu işlem için yetkiniz bulunmuyor.';
  if (status === 422) return 'Girilen bilgileri kontrol edin.';
  if (status && status >= 500) return 'Sunucu tarafında bir hata oluştu. Lütfen tekrar deneyin.';
  if (!error.response) return 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.';
  const detail = error.response.data?.detail;
  return typeof detail === 'string' && detail.length <= 180 ? detail : fallback;
}

export const api = axios.create({
  baseURL: createBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Neon cold-start: DB uykudan uyanırken ilk istek ağ hatası (yanıt yok) ya da
// 5xx alabilir. Yalnızca GET istekleri için 300ms sonra tek seferlik retry
// yapılır — POST/PATCH/DELETE'de yeniden deneme çift kayıt riski taşıyabileceği
// için buraya dahil edilmedi (backend'deki retry, route mantığı hiç çalışmadan
// önce devreye girdiği için güvenli; frontend'de aynı garanti yok).
const COLD_START_RETRY_DELAY_MS = 300;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as (typeof error.config & { __coldStartRetried?: boolean }) | undefined;
    const status = error.response?.status;
    const isNetworkOrServerError = status === undefined || status >= 500;
    const isRetryableMethod = (config?.method ?? 'get').toLowerCase() === 'get';

    if (config && isRetryableMethod && isNetworkOrServerError && !config.__coldStartRetried) {
      config.__coldStartRetried = true;
      await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_DELAY_MS));
      return api(config);
    }

    if (status === 401 && typeof window !== 'undefined') {
      clearClientSession();
      const pathname = window.location.pathname;
      if (pathname !== '/login' && pathname !== '/password-reset') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

export const apiGet = async <T>(url: string, params?: object) => {
  const response = await api.get<T>(normalizeRequestUrl(url), { params });
  if (response.data && !Array.isArray(response.data) && typeof response.data === 'object' && ('detail' in response.data || 'msg' in response.data)) {
    throw new Error("API returned an error object instead of data");
  }
  return response.data;
};

export const apiPost = async <T>(url: string, data?: any, isMultipart = false) => {
  const config = isMultipart 
    ? { headers: { 'Content-Type': 'multipart/form-data' } } 
    : undefined;
  const response = await api.post<T>(normalizeRequestUrl(url), data, config);
  return response.data;
};

export const apiPatch = async <T>(url: string, data?: object) => {
  const response = await api.patch<T>(normalizeRequestUrl(url), data);
  return response.data;
};

export const apiPut = async <T>(url: string, data?: object) => {
  const response = await api.put<T>(normalizeRequestUrl(url), data);
  return response.data;
};

export const apiDelete = async (url: string) => {
  const response = await api.delete(normalizeRequestUrl(url));
  return response.data;
};
