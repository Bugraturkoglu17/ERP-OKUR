import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { AppShell } from "@/components/layout/app-shell";
import { UpdateAvailableBanner } from "@/components/pwa/UpdateAvailableBanner";
import { ServiceWorkerManager } from "@/components/pwa/ServiceWorkerManager";
import { EdgeSwipeGuard } from "@/components/pwa/EdgeSwipeGuard";

// Next.js'in kendi otomatik viewport meta enjeksiyonunu devre dışı bırakıp
// buradan tek, kesin bir viewport tanımlar — iki çakışan <meta viewport>
// etiketi (biri kısıtlayıcı, biri Next'in varsayılanı) tarayıcıların zoom
// davranışını tutarsız uygulamasına neden oluyordu.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Tarayıcı çubuğu / PWA soğuk açılış çerçevesi de koyu açılış zeminiyle
  // aynı olsun — açılışta görülen kısa açık/beyaz kareyi azaltır.
  themeColor: "#09111b",
};

// iOS, manifest tabanlı otomatik splash üretimini (iOS 15.4+) tutarsız/
// gecikmeli uyguluyor — bu yüzden JS/CSS hiç yüklenmeden ÖNCE gösterilen
// native launch image'ı, cihaz çözünürlüğüne birebir eşleşen
// apple-touch-startup-image PNG'leri ile açıkça veriyoruz (koyu arka plan +
// marka ikonu). Görseller: scripts/generate-apple-splash.mjs ile üretilir.
const APPLE_STARTUP_IMAGES: { url: string; media: string }[] = [
  { url: "/splash/iphone-se1.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { url: "/splash/iphone-8.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { url: "/splash/iphone-8-plus.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { url: "/splash/iphone-x-11pro-12mini-13mini.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { url: "/splash/iphone-11-xr.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { url: "/splash/iphone-11pro-max-xsmax.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { url: "/splash/iphone-12-13-14-15-16.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { url: "/splash/iphone-12-13-14-pro-max.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { url: "/splash/iphone-14-15-16-pro.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { url: "/splash/iphone-14-15-16-plus.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { url: "/splash/iphone-15-16-pro.png", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { url: "/splash/iphone-16-pro-max.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
];

export const metadata: Metadata = {
  title: "SİSMİK · Kurumsal Operasyon Sistemi",
  description: "İş emirleri, mağaza projeleri ve saha raporları için kurumsal operasyon sistemi.",
  applicationName: "SİSMİK",
  appleWebApp: {
    title: "SİSMİK",
    capable: true,
    statusBarStyle: "black-translucent",
    startupImage: APPLE_STARTUP_IMAGES,
  },
  manifest: "/manifest.webmanifest",
};

// PWA soğuk açılışta (iOS/Android standalone) ve tarayıcı yenilemesinde,
// React hiç mount olmadan ÖNCE — sunucudan gelen ham HTML'in ilk boyama
// karesi bile açık/beyaz olmasın diye <html>/<body> arka planı burada,
// derlenmiş CSS bundle'ının yüklenmesini beklemeden inline set edilir.
// Bu renk .erp-launch-screen / BootScreen ile birebir aynıdır — splash
// gelene kadar (ve splash'in kendisi de aynı rengi kullandığı için splash
// sırasında da) görünür arka plan hep bu koyu ton olur, beyaz kare hiç
// oluşmaz.
const BOOT_BACKGROUND = "#09111b";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" data-scroll-behavior="smooth" suppressHydrationWarning style={{ backgroundColor: BOOT_BACKGROUND }}>
      <body
        className="min-h-screen bg-slate-50 text-slate-900"
        style={{ backgroundColor: BOOT_BACKGROUND }}
      >
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <ServiceWorkerManager />
        <EdgeSwipeGuard />
        <UpdateAvailableBanner />
      </body>
    </html>
  );
}
