"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, Loader2, X } from "lucide-react";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const UPDATE_PREPARATION_TIMEOUT_MS = 1500;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function prepareUpdate() {
  const cacheCleanup = async () => {
    if (!("caches" in window)) return;
    const names = await window.caches.keys();
    await Promise.all(names.map((name) => window.caches.delete(name)));
  };

  const workerUpdate = async () => {
    if (!("serviceWorker" in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        await registration.update().catch(() => undefined);
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      }),
    );
  };

  await Promise.allSettled([cacheCleanup(), workerUpdate()]);
}

async function hardReload(targetVersion: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("_build", targetVersion || Date.now().toString());

  // Service worker güncellemesi bazı mobil tarayıcılarda süresiz bekleyebilir.
  // Hazırlık tamamlanmasa bile yeni dokümanı ağdan almak için yenilemeyi zorla.
  await Promise.race([prepareUpdate(), wait(UPDATE_PREPARATION_TIMEOUT_MS)]);
  window.location.replace(url.toString());
}

export function UpdateAvailableBanner() {
  const [available, setAvailable] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [targetVersion, setTargetVersion] = useState("");

  const check = useCallback(async () => {
    const current = process.env.NEXT_PUBLIC_BUILD_VERSION;
    if (!current) return;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      const data = (await res.json()) as { version?: string };
      if (data.version && data.version !== current) {
        const dismissedVersion = sessionStorage.getItem("sismik-update-dismissed");
        setTargetVersion(data.version);
        if (dismissedVersion !== data.version) setAvailable(true);
      }
    } catch {
      // sessizce yut — versiyon kontrolü kritik değil
    }
  }, []);

  useEffect(() => {
    check();

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [check]);

  if (!available) return null;

  const dismiss = () => {
    if (targetVersion) sessionStorage.setItem("sismik-update-dismissed", targetVersion);
    setAvailable(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] flex justify-center px-4">
      <div className="relative flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_55px_rgba(15,23,42,0.18)] sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <ArrowUpCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 pr-8 sm:pr-0">
          <p className="text-sm font-semibold text-slate-900">Yeni sürüm hazır</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">Son iyileştirmeleri kullanmak için uygulamayı güncelleyin.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={dismiss} disabled={reloading} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50">
            Daha sonra
          </button>
          <button
            type="button"
            disabled={reloading}
            onClick={() => {
              setReloading(true);
              void hardReload(targetVersion);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-800 active:scale-[0.98] disabled:opacity-60"
          >
            {reloading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {reloading ? "Güncelleniyor" : "Şimdi güncelle"}
          </button>
        </div>
        <button type="button" onClick={dismiss} disabled={reloading} aria-label="Güncelleme bildirimini kapat" className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:hidden">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
