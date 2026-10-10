import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SİSMİK Kurumsal Operasyon Sistemi",
    short_name: "SİSMİK",
    description: "İş emirleri, mağaza projeleri ve saha raporları için kurumsal operasyon sistemi.",
    start_url: "/",
    display: "standalone",
    background_color: "#09111b",
    theme_color: "#09111b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
