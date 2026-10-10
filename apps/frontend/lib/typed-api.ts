// ─────────────────────────────────────────────────────────────────────────────
//  Sismik Mekanik ERP — Type-Safe API Client (FastAPI OpenAPI Entegrasyonu)
// ─────────────────────────────────────────────────────────────────────────────

import { paths } from '@/types/api';
import { api } from './api';

/**
 * Next.js & FastAPI entegrasyonu için %100 tip güvenliği sağlayan API sarmalayıcısı.
 * Backend'de bir endpoint değiştiğinde derleme hatası alarak kod güvenliğini sağlar.
 */
export const typedApi = {
  /**
   * HTTP GET İsteği
   * URL, Query Parametreleri ve Geri Dönüş Tipi otomatik eşleştirilir.
   */
  get: async <Url extends keyof paths>(
    url: Url,
    config?: {
      params?: paths[Url] extends { get: { parameters: { query?: infer Q } } } ? Q : never;
    }
  ): Promise<
    paths[Url] extends {
      get: { responses: { 200: { content: { 'application/json': infer R } } } };
    }
      ? R
      : any
  > => {
    const response = await api.get(url as string, { params: config?.params });
    return response.data;
  },

  /**
   * HTTP POST İsteği
   * Request Body ve URL otomatik eşleştirilir.
   */
  post: async <Url extends keyof paths>(
    url: Url,
    config?: {
      body?: paths[Url] extends { post: { requestBody?: { content: { 'application/json': infer B } } } } ? B : never;
      params?: paths[Url] extends { post: { parameters: { query?: infer Q } } } ? Q : never;
    }
  ): Promise<
    paths[Url] extends {
      post: { responses: { 200: { content: { 'application/json': infer R } } } };
    }
      ? R
      : paths[Url] extends {
          post: { responses: { 201: { content: { 'application/json': infer R } } } };
        }
      ? R
      : any
  > => {
    const response = await api.post(url as string, config?.body, { params: config?.params });
    return response.data;
  },

  /**
   * HTTP PATCH İsteği
   * Güncelleme istekleri için tip koruması sağlar.
   */
  patch: async <Url extends keyof paths>(
    url: Url,
    config?: {
      body?: paths[Url] extends { patch: { requestBody?: { content: { 'application/json': infer B } } } } ? B : never;
      params?: paths[Url] extends { patch: { parameters: { query?: infer Q } } } ? Q : never;
    }
  ): Promise<
    paths[Url] extends {
      patch: { responses: { 200: { content: { 'application/json': infer R } } } };
    }
      ? R
      : any
  > => {
    const response = await api.patch(url as string, config?.body, { params: config?.params });
    return response.data;
  },

  /**
   * HTTP DELETE İsteği
   */
  delete: async <Url extends keyof paths>(
    url: Url,
    config?: {
      params?: paths[Url] extends { delete: { parameters: { query?: infer Q } } } ? Q : never;
    }
  ): Promise<
    paths[Url] extends {
      delete: { responses: { 200: { content: { 'application/json': infer R } } } };
    }
      ? R
      : any
  > => {
    const response = await api.delete(url as string, { params: config?.params });
    return response.data;
  },
};

// Kolay tip erişimi için kısayollar:
export type ApiSchemas = paths;
export type SchemaModel = Record<string, unknown>;
