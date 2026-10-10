// Telefon / tarayıcı bildirimleri (Web Push) — cihaz aboneliği.
//
// Bildirimin NE ZAMAN gönderileceğine sunucu karar verir (iş emri atandı,
// süreç başladı, aşama/rapor güncellendi…). Buradaki kod yalnızca "bu cihaz
// bildirim alsın / almasın" kaydını yönetir.

import { apiGet, apiPost, buildApiUrl } from "@/lib/api";

export type PushState =
  | "unsupported"   // tarayıcı desteklemiyor
  | "needs-install" // iPhone/iPad: önce Ana Ekrana eklenmeli
  | "denied"        // kullanıcı tarayıcıdan engellemiş
  | "off"           // açılabilir, henüz açık değil
  | "on";           // bu cihaz bildirim alıyor

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function hasPushApis(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Bildirime tıklanınca iş emrinin açılacağı panel — sunucu adresi buna göre kurar. */
function currentPanel(): string {
  const path = window.location.pathname;
  if (path.startsWith("/manager")) return "/manager";
  if (path.startsWith("/user")) return "/user";
  return "";
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // ServiceWorkerManager kaydı zaten yapıyor; hazır olmasını bekle.
  return navigator.serviceWorker.ready;
}

async function saveOnServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await apiPost("/push/subscribe", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    panel: currentPanel(),
  });
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!hasPushApis()) {
    // iOS, Web Push'u yalnızca Ana Ekrana eklenmiş uygulamada açar.
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    const existing = await (await registration()).pushManager.getSubscription();
    return existing ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Kullanıcı düğmeye bastığında çağrılır (izin penceresi yalnızca tıklamayla açılabilir). */
export async function enablePush(): Promise<PushState> {
  if (!hasPushApis()) return getPushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const reg = await registration();
  const { public_key } = await apiGet<{ public_key: string }>("/push/public-key");
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(public_key),
    });
  }
  await saveOnServer(subscription);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  if (!hasPushApis()) return getPushState();
  const subscription = await (await registration()).pushManager.getSubscription();
  if (subscription) {
    await apiPost("/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  }
  return "off";
}

/**
 * Sayfa açılışında sessizce çalışır: izin zaten verilmişse bu cihazın
 * aboneliğini oturumdaki kullanıcıya (yeniden) bağlar. Aynı telefonda başka
 * bir hesapla giriş yapıldığında bildirimler doğru kişiye gitsin diye.
 * Asla izin penceresi AÇMAZ.
 */
export async function syncPushSubscription(): Promise<void> {
  try {
    if (!hasPushApis() || Notification.permission !== "granted") return;
    const subscription = await (await registration()).pushManager.getSubscription();
    if (subscription) await saveOnServer(subscription);
  } catch {
    // Bildirim altyapısı ana uygulamayı asla engellememeli.
  }
}

/**
 * Çıkışta çağrılır: bu cihazın aboneliğini sunucudan kaldırır ki çıkış yapan
 * kişinin bildirimleri ortak/başkasına verilen telefona gitmeye devam etmesin.
 * Token silinmeden ÖNCE çağrılmalı; kısa bir süre sınırı vardır.
 */
export async function detachPushOnLogout(token: string): Promise<void> {
  try {
    if (!hasPushApis()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = await reg?.pushManager.getSubscription();
    if (!subscription) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);
    await fetch(buildApiUrl("/push/unsubscribe"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => undefined);
    window.clearTimeout(timeout);
  } catch {
    // yoksay
  }
}

export async function sendTestPush(): Promise<number> {
  const result = await apiPost<{ sent: number }>("/push/test", {});
  return result?.sent ?? 0;
}
