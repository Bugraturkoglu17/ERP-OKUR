import { buildApiUrl } from "@/lib/api";

type UploadOptions = {
  method?: "POST" | "PUT" | "PATCH";
  formData: FormData;
  onProgress?: (percent: number) => void;
};

function friendlyUploadError(status: number, detail?: unknown) {
  if (status === 401) return "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.";
  if (status === 403) return "Bu işlem için yetkiniz bulunmuyor.";
  if (status === 422) return "Dosya bilgilerini kontrol edin.";
  if (status >= 500) return "Sunucu tarafında bir hata oluştu. Lütfen tekrar deneyin.";
  return typeof detail === "string" && detail.length < 180
    ? detail
    : "Dosya yüklenemedi. Lütfen tekrar deneyin.";
}

/** XMLHttpRequest kullanır; progress değeri ağda gerçekten gönderilen byte'lardan gelir. */
export function uploadFormData<T>(path: string, options: UploadOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method ?? "POST", buildApiUrl(path));

    const token = localStorage.getItem("token");
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);

    options.onProgress?.(0);
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });

    request.addEventListener("load", () => {
      let body: unknown = null;
      try { body = request.responseText ? JSON.parse(request.responseText) : null; } catch { body = null; }
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(100);
        resolve(body as T);
        return;
      }
      const detail = body && typeof body === "object" && "detail" in body
        ? (body as { detail?: unknown }).detail
        : undefined;
      reject(new Error(friendlyUploadError(request.status, detail)));
    });
    request.addEventListener("error", () => reject(new Error("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.")));
    request.addEventListener("abort", () => reject(new Error("Dosya yükleme iptal edildi.")));
    request.send(options.formData);
  });
}
