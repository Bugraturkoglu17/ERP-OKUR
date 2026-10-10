"use client";

import { useEffect } from "react";

const SERVICE_WORKER_PATH = "/sw.js";

async function removeLegacyCaches() {
  if (!("caches" in window)) return;
  const cacheNames = await window.caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => !name.startsWith("sismik-operations-"))
      .map((name) => window.caches.delete(name)),
  );
}

export function ServiceWorkerManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const install = async () => {
      try {
        await removeLegacyCaches();

        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((item) => {
              const scriptUrl = item.active?.scriptURL ?? item.installing?.scriptURL ?? item.waiting?.scriptURL;
              return !scriptUrl || !new URL(scriptUrl, window.location.origin).pathname.endsWith(SERVICE_WORKER_PATH);
            })
            .map((item) => item.unregister()),
        );

        if (disposed) return;
        const version = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev";
        registration = await navigator.serviceWorker.register(
          `${SERVICE_WORKER_PATH}?build=${encodeURIComponent(version)}`,
          { scope: "/", updateViaCache: "none" },
        );
        await registration.update();
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      } catch {
        // PWA desteği ana uygulamayı engellememeli.
      }
    };

    const refreshWorker = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };
    const handleOnline = () => void registration?.update();

    void install();
    document.addEventListener("visibilitychange", refreshWorker);
    window.addEventListener("online", handleOnline);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", refreshWorker);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return null;
}
