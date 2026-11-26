// Geçici marka gizleme: .env.local içinde NEXT_PUBLIC_HIDE_BRAND=true yazılıysa
// OKUR adı, logosu ve sekme ikonu ekranda gösterilmez. Satır silinip arayüz yeniden
// derlenince (start_okur_web.bat) her şey eski hâline döner.
export const HIDE_BRAND = process.env.NEXT_PUBLIC_HIDE_BRAND === "true";

/** Marka açıkken ilk metni, gizliyken markasız karşılığını döndürür. */
export function brand(withBrand: string, neutral: string): string {
  return HIDE_BRAND ? neutral : withBrand;
}

/** Veritabanından gelen bir ad (ör. firma adı) içindeki "Okur" sözcüğünü, marka gizliyken çıkarır. */
export function stripBrand(text: string): string {
  if (!HIDE_BRAND) return text;
  return text.replace(/okur/gi, "").replace(/\s{2,}/g, " ").trim() || "Firma";
}

/** Marka gizliyken sekme / pencere ikonu olarak kullanılan nötr ikon. */
export const NEUTRAL_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
      "<rect width='32' height='32' rx='7' fill='#09111b'/>" +
      "<text x='16' y='20.5' font-family='Arial,sans-serif' font-weight='700' font-size='11' fill='#ffffff' text-anchor='middle'>ERP</text>" +
      "</svg>",
  );
