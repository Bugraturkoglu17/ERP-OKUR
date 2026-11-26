"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BellOff, BellRing, CheckCheck } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Separator } from "@/components/shadcn/separator";
import { Spinner } from "@/components/shadcn/spinner";
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

  // Popover dışarı tıklamayı ve Esc'i kendisi yönetir; açılınca liste ve sayaç tazelenir.
  useEffect(() => {
    if (!open) return;
    loadList();
    loadUnreadCount();
  }, [open, loadList, loadUnreadCount]);

  const markOneRead = async (notif: Notification) => {
    if (!notif.is_read) {
      setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
      setUnread((c) => Math.max(0, c - 1));
      apiPatch(`/notifications/${notif.id}/read`, {}).catch(() => {});
    }
    setOpen(false);
    if (notif.work_order_id) router.push(workOrderHref(pathname, notif.work_order_id));
    // Kritik stok uyarısı bir işe değil depoya aittir: stok listesi kritik filtreyle açılır.
    else if (notif.category === "stock_critical") router.push("/manager/depo-stok?filtre=kritik");
    // Proje bildirimleri: saha kullanıcısı görevlerine, yönetici projeler listesine gider.
    else if (notif.category.startsWith("project_")) router.push(pathname.startsWith("/user") ? "/user/proje-gorevleri" : "/manager/projeler");
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    apiPatch("/notifications/read-all", {}).catch(() => {});
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Bildirimler" className="relative size-9 shrink-0">
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[calc(100vw-2rem)] max-w-80 overflow-hidden p-0 sm:w-80">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Bildirimler</p>
          {items.some((n) => !n.is_read) && (
            <Button variant="link" size="sm" onClick={markAllRead} className="h-auto p-0 text-xs">
              <CheckCheck data-icon="inline-start" />Tümünü okundu işaretle
            </Button>
          )}
        </div>
        <Separator />
        <div className="max-h-[min(24rem,calc(100dvh-7rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex justify-center px-4 py-8"><Spinner /></div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Henüz bildirim yok.</p>
          ) : (
            <ul className="divide-y">
              {items.map((notif) => (
                <li key={notif.id}>
                  <button
                    type="button"
                    onClick={() => markOneRead(notif)}
                    className={cn("flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent", !notif.is_read && "bg-primary/5")}
                  >
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", !notif.is_read ? "bg-primary" : "bg-transparent")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{notif.title}</span>
                      {notif.body && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{notif.body}</span>}
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{formatRelative(notif.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bu cihazda telefon bildirimi. Desteklenmeyen tarayıcıda hiç gösterilmez. */}
        {pushState && pushState !== "unsupported" && (
          <>
            <Separator />
            <div className="bg-muted/50 px-4 py-3">
              {pushState === "on" ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                    <BellRing className="size-3.5 shrink-0 text-emerald-600" />
                    <span className="truncate">Bu cihazda bildirimler açık</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={pushBusy} onClick={testPush}>Dene</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" disabled={pushBusy} onClick={() => runPush(disablePush, "Bu cihazda bildirimler kapatıldı.")}>Kapat</Button>
                  </div>
                </div>
              ) : pushState === "off" ? (
                <Button size="sm" className="w-full" disabled={pushBusy}
                  onClick={() => runPush(enablePush, "Bildirimler açıldı. Yeni iş emri ve güncellemeler bu cihaza gelecek.")}>
                  {pushBusy ? <Spinner data-icon="inline-start" /> : <BellRing data-icon="inline-start" />}
                  Bu cihazda bildirimleri aç
                </Button>
              ) : pushState === "denied" ? (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <BellOff className="mt-0.5 size-3.5 shrink-0" />
                  <span>Bildirimler bu tarayıcıda engellenmiş. Site ayarlarından “Bildirimler”e izin verip sayfayı yenileyin.</span>
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <BellRing className="mt-0.5 size-3.5 shrink-0" />
                  <span>iPhone’da bildirim almak için: Paylaş → <strong>Ana Ekrana Ekle</strong>, ardından uygulamayı ana ekrandan açın.</span>
                </p>
              )}
              {pushNote && <p role="status" className="mt-2 text-[11px] text-muted-foreground">{pushNote}</p>}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
