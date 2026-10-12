/**
 * Stok miktarı kuralı: tam sayı veya en fazla bir ondalık (5, 0,5, 12,5).
 * 0,05 / 0,005 gibi ince miktarlar kabul edilmez. Giriş hem "," hem "." ile yapılabilir.
 */

/** Yazarken: sadece rakam ve tek ayraç; ondalık kısım en fazla 1 hane. */
export function sanitizeQuantityInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  const separator = cleaned.search(/[.,]/);
  if (separator === -1) return cleaned;
  const whole = cleaned.slice(0, separator);
  const fraction = cleaned.slice(separator + 1).replace(/[.,]/g, "").slice(0, 1);
  return `${whole}${cleaned[separator]}${fraction}`;
}

export function parseQuantity(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

/** Boş değilse geçerli bir miktar mı? Geçersizse kullanıcıya gösterilecek mesajı döner. */
export function quantityProblem(raw: string): string {
  if (!raw.trim()) return "Miktar yazın.";
  const value = parseQuantity(raw);
  if (!Number.isFinite(value) || value <= 0) return "Sıfırdan büyük bir miktar yazın.";
  if (Math.round(value * 10) / 10 !== value) return "En fazla bir ondalık yazın (örn. 5 veya 0,5).";
  return "";
}

/** API'ye giden değer: her zaman noktalı ve tek ondalıklı. */
export function quantityForApi(raw: string): string {
  return String(Math.round(parseQuantity(raw) * 10) / 10);
}

/** Gösterim: en fazla bir ondalık, Türkçe ayraçla. */
export function formatQuantity(value: string | number): string {
  return Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}
