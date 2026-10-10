export const CLIENT_SESSION_KEYS = [
  "auth_store",
  "token",
  "refresh_token",
] as const;

export const CLIENT_SESSION_CACHE_KEYS = [
  "tenant_context_v1",
  "initial_login_id",
  "initial_temporary_password",
  "manager_work_order_draft",
] as const;

export function resetLaunchIntro() {
  if (typeof window === "undefined") return;
  Object.keys(window.sessionStorage)
    .filter((key) => key.startsWith("sismik-intro:"))
    .forEach((key) => window.sessionStorage.removeItem(key));
}

/**
 * Yalnızca tarayıcıdaki oturum ve kullanıcıya özel geçici verileri temizler.
 * Mağaza, iş emri, dosya veya başka bir iş verisine dokunmaz.
 */
export function clearClientSession() {
  if (typeof window === "undefined") return;

  CLIENT_SESSION_KEYS.forEach((key) => window.localStorage.removeItem(key));
  CLIENT_SESSION_CACHE_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
  resetLaunchIntro();
}
