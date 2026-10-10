import { ROLE_PANEL_HOME } from "@/lib/permissions";

export type RootRedirectConfig = {
  authStoreKey: string;
  platformHome: string;
  managerHome: string;
  userHome: string;
  loginPath: string;
};

export const ROOT_REDIRECT_CONFIG: RootRedirectConfig = {
  // contexts/auth-context.tsx: AUTH_STORE_KEY — o modül "use client" olduğu
  // için sunucu bileşeninden değeri okunamıyor, aynı sabit burada tekrarlanır.
  authStoreKey: "auth_store",
  platformHome: "/platform",
  managerHome: ROLE_PANEL_HOME.MANAGER,
  userHome: ROLE_PANEL_HOME.USER,
  loginPath: "/login",
};

/**
 * Kök (/) sayfanın gideceği hedefi localStorage'daki JWT'den hesaplar.
 * KENDİ KENDİNE YETERLİ olmalı (dış değişken/import referansı YOK): hem
 * istemci fallback'inde doğrudan çağrılır hem de toString() ile inline
 * <script> olarak HTML'e gömülür (bkz. buildRootRedirectScript).
 */
export function resolveRootTarget(cfg: RootRedirectConfig): string {
  let payload: { exp?: number; roles?: unknown } | null = null;
  try {
    const token = localStorage.getItem("token");
    const segment = token ? token.split(".")[1] : "";
    if (segment) {
      let b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      payload = JSON.parse(atob(b64));
    }
  } catch {
    payload = null;
  }
  if (payload && payload.exp && payload.exp * 1000 > Date.now()) {
    const roles: unknown[] = Array.isArray(payload.roles) ? payload.roles : [];
    if (roles.indexOf("platform_admin") >= 0) return cfg.platformHome;
    if (roles.indexOf("manager") >= 0 || roles.indexOf("admin") >= 0) return cfg.managerHome;
    return cfg.userHome;
  }
  // Geçersiz/süresi dolmuş oturum artıkları, eski verilerle panellere geçici
  // yönlendirme (flicker) olmasın diye temizlenir.
  try {
    localStorage.removeItem(cfg.authStoreKey);
    localStorage.removeItem("token");
  } catch {
    // güvenlik sandbox'ı — yoksay
  }
  return cfg.loginPath;
}

/** Bu bayrak set edilmişse inline script yönlendirmeyi üstlenmiştir; React fallback'i tekrar yönlendirmez. */
export const ROOT_REDIRECT_FLAG = "__sismikRootRedirect";

/**
 * HTML ayrıştırılırken (JS bundle'ları inmeden/React hydrate olmadan ÖNCE)
 * çalışan yönlendirme script'i. Önce koyu zeminin bir kez boyanmasını bekler
 * (rAF → setTimeout), sonra tam sayfa geçişi yapar — aynı origin geçişinde
 * tarayıcı bu koyu kareyi hedef sayfa boyanana kadar tutar, arada beyaz kare
 * oluşmaz. rAF arka plan sekmesinde çalışmazsa kısa bir zamanlayıcı yedektir.
 */
export function buildRootRedirectScript(cfg: RootRedirectConfig = ROOT_REDIRECT_CONFIG): string {
  return `(function(){window.${ROOT_REDIRECT_FLAG}=true;var done=false;function go(){if(done)return;done=true;location.replace((${resolveRootTarget.toString()})(${JSON.stringify(cfg)}));}requestAnimationFrame(function(){setTimeout(go,0)});setTimeout(go,150);})();`;
}
