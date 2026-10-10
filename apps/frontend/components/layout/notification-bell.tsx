"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BellOff, BellRing, CheckCheck, Loader2 } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { disablePush, enablePush, getPushState, sendTestPush, syncPushSubscription, type PushState } from "@/lib/push";

type Notification = {
  id: string;
  category: string;
  title: string;
  body: string | null;
  work_order_id: string | null;
  is_read: boolean;
  created_at: string;
};

function formatRelative(iso: string) {
  // Sunucu saatleri UTC'dir ama saat dilimi eki olmadan gelir; ek yoksa tarayıcı
  // yerel saat sanıp yeni bildirimi "3 sa önce" gösteriyordu.
  const utc = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  const diffMs = Date.now() - new Date(utc).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const day = Math.floor(hr / 24);
  return `${day} gün önce`;
}

/** Bildirim, iş emrinin hangi panel altında görüntüleneceğini path'ten çıkarır. */
function workOrderHref(pathname: string, workOrderId: string) {
  if (pathname.startsWith("/manager/")) return `/manager/is-emirleri/${workOrderId}`;
  if (pathname.startsWith("/user/")) return `/user/islerim/${workOrderId}`;
  return `/is-emirleri/${workOrderId}`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Telefon / tarayıcı bildirimi (Web Push) — bu CİHAZ için aç/kapat.
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState("");

  useEffect(() => {
    // İzin daha önce verildiyse aboneliği oturumdaki kullanıcıya bağla (pencere açmaz).
    void syncPushSubscription().then(() => getPushState().then(setPushState));
  }, []);

  const runPush = async (action: () => Promise<PushState>, okNote: string) => {
    setPushBusy(true);
    setPushNote("");
    try {
      const next = await action();
      setPushState(next);
      setPushNote(next === "denied" ? "" : okNote);
    } catch {
      setPushNote("İşlem tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin.");
    } finally {
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    setPushNote("");
    try {
      const sent = await sendTestPush();
      setPushNote(sent > 0 ? "Deneme bildirimi gönderildi." : "Bu hesaba bağlı cihaz bulunamadı; bildirimleri yeniden açın.");
    } catch {
      setPushNote("Deneme bildirimi gönderilemedi.");
    } finally {
      setPushBusy(false);
    }
  };

  const loadUnreadCount = useCallback(() => {
    apiGet<{ count: number }>("/notifications/unread-count")
      .then((d) => setUnread(d.count))
      .catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setLoading(true);
    apiGet<Notification[]>("/notifications")
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  // Bildirimler başka bir cihaz/oturum tarafından oluşturulabildiği için
  // görünür sekmede düşük sıklıkla sayacı yenile. Odak/sekme değişiminde de
  // anında kontrol ederek bildirim gecikmesini artırmadan gereksiz sorguyu azaltır.
  useEffect(() => {
    loadUnreadCount();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadUnreadCount();
    };
    const interval = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    if (!open) return;
    loadList();
    loadUnreadCount();
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, loadList, loadUnreadCount]);

  const markOneRead = async (notif: Notification) => {
    if (!notif.is_read) {
      setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
      setUnread((c) => Math.max(0, c - 1));
      apiPatch(`/notifications/${notif.id}/read`, {}).catch(() => {});
    }
    setOpen(false);
    if (notif.work_order_id) router.push(workOrderHref(pathname, notif.work_order_id));
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    apiPatch("/notifications/read-all", {}).catch(() => {});
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Bildirimler"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[70] w-[calc(100vw-2rem)] max-w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:w-80">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Bildirimler</p>
            {items.some((n) => !n.is_read) && (
              <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                <CheckCheck className="h-3.5 w-3.5" /> Tümünü okundu işaretle
              </button>
            )}
          </div>
          <div className="max-h-[min(24rem,calc(100dvh-7rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] overscroll-contain overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">Yükleniyor…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">Henüz bildirim yok.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((notif) => (
                  <li key={notif.id}>
                    <button
                      type="button"
                      onClick={() => markOneRead(notif)}
                      className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${!notif.is_read ? "bg-blue-50/40" : ""}`}
                    >
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${!notif.is_read ? "bg-blue-600" : "bg-transparent"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-800">{notif.title}</span>
                        {notif.body && <span className="mt-0.5 block truncate text-xs text-slate-500">{notif.body}</span>}
                        <span className="mt-0.5 block text-[10px] text-slate-400">{formatRelative(notif.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Bu cihazda telefon bildirimi. Desteklenmeyen tarayıcıda hiç gösterilmez. */}
          {pushState && pushState !== "unsupported" && (
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
              {pushState === "on" ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-700">
                    <BellRing className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="truncate">Bu cihazda bildirimler açık</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
                    <button type="button" disabled={pushBusy} onClick={testPush} className="text-blue-600 hover:text-blue-800 disabled:opacity-50">Dene</button>
                    <button type="button" disabled={pushBusy} onClick={() => runPush(disablePush, "Bu cihazda bildirimler kapatıldı.")} className="text-slate-500 hover:text-slate-800 disabled:opacity-50">Kapat</button>
                  </div>
                </div>
              ) : pushState === "off" ? (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => runPush(enablePush, "Bildirimler açıldı. Yeni iş emri ve güncellemeler bu cihaza gelecek.")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {pushBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                  Bu cihazda bildirimleri aç
                </button>
              ) : pushState === "denied" ? (
                <p className="flex items-start gap-1.5 text-xs text-slate-600">
                  <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>Bildirimler bu tarayıcıda engellenmiş. Site ayarlarından “Bildirimler”e izin verip sayfayı yenileyin.</span>
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-xs text-slate-600">
                  <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>iPhone’da bildirim almak için: Paylaş → <strong>Ana Ekrana Ekle</strong>, ardından uygulamayı ana ekrandan açın.</span>
                </p>
              )}
              {pushNote && <p role="status" className="mt-2 text-[11px] text-slate-500">{pushNote}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
