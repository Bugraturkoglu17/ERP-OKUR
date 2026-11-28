"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

// "OKUR'u yükle" kartı (28.11.2026). Tarayıcılar kullanıcı tıklaması olmadan kurulum yapamaz;
// kart, tarayıcının kurulum penceresini tek tıkla açar. iPhone'da bu pencere olmadığı için
// "Paylaş → Ana Ekrana Ekle" yolu gösterilir. Kurulu uygulamanın içinde ve giriş ekranında görünmez.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "okur-install-dismissed-until";
const DISMISS_DAYS = 7;
const SHOW_DELAY_MS = 2500;

// Olay sayfa açılır açılmaz bir kez gelir; bileşen sonra bağlansa da kaçmasın diye modül düzeyinde tutulur.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

function dismissedNow() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<"prompt" | "ios" | null>(null);
  const [mobile, setMobile] = useState(false);

  const inApp = pathname.startsWith("/manager") || pathname.startsWith("/user");

  useEffect(() => {
    if (!inApp || isStandalone() || dismissedNow()) { setMode(null); return; }
    setMobile(isMobile());
    const decide = () => setMode(deferred ? "prompt" : isIos() ? "ios" : null);
    const timer = window.setTimeout(decide, SHOW_DELAY_MS);
    listeners.add(decide);
    return () => { window.clearTimeout(timer); listeners.delete(decide); };
  }, [inApp]);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000)); } catch { /* yok say */ }
    setMode(null);
  }

  async function install() {
    const event = deferred;
    if (!event) { setMode(null); return; }
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred = null;
    if (outcome === "dismissed") dismiss();
    else setMode(null);
  }

  if (!mode || !inApp) return null;
  const title = mode === "ios" || mobile ? "OKUR'u ana ekrana ekleyin" : "OKUR'u bilgisayarınıza yükleyin";
  const text = mode === "ios"
    ? "Alttaki Paylaş düğmesine dokunun, ardından “Ana Ekrana Ekle”yi seçin."
    : mobile ? "Ana ekrandan tek dokunuşla, tam ekran açılır." : "Kendi penceresinde, adres çubuğu olmadan açılır.";

  return (
    <div role="dialog" aria-label={title} className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[90] flex justify-center px-4">
      <div className="relative flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_55px_rgba(15,23,42,0.18)] sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-9 w-9" />
        </span>
        <div className="min-w-0 flex-1 pr-8 sm:pr-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={dismiss} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
            {mode === "ios" ? "Anladım" : "Şimdi değil"}
          </button>
          {mode === "prompt" && (
            <button type="button" onClick={() => void install()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-800 active:scale-[0.98]">
              Yükle
            </button>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label="Kapat" className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:hidden">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
