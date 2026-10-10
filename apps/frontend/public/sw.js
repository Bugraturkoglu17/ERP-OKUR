const OFFLINE_CACHE = "sismik-operations-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== OFFLINE_CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }),
  );
});

// ── Web Push: telefon / tarayıcı bildirimleri ────────────────────────────────
// Sunucu (app/core/push.py) şifreli bir JSON gönderir:
//   { title, body, category, work_order_id, url }
// Uygulama kapalıyken bile bu olay çalışır ve bildirimi gösterir.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "SİSMİK", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "SİSMİK";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "tr",
      // Aynı iş emrinin art arda gelen bildirimleri üst üste yığılmasın;
      // yenisi eskisinin yerini alır ama telefon yine de uyarır.
      tag: data.work_order_id ? `wo-${data.work_order_id}` : data.category || "sismik",
      renotify: true,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  // Yalnızca kendi sitemizin adresleri açılır.
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Uygulama zaten açıksa yeni sekme açma: o pencereyi öne getir ve iş emrine götür.
      for (const client of windows) {
        try {
          await client.focus();
          if ("navigate" in client) await client.navigate(target.href);
          return;
        } catch {
          // Bu pencere yönlendirilemedi; sıradakini dene.
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
