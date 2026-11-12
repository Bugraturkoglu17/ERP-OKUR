import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Sunucu zamanları UTC'dir ama saat dilimi eki olmadan gelir; ek yoksa UTC kabul edilir. */
export function parseServerDate(value: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

/** Örn. "12 Eki 2026 23:10" — iş emrinin verildiği an gibi tarih + saat bilgisi için. */
export function formatServerDateTime(value?: string | null): string {
  if (!value) return "—";
  return parseServerDate(value).toLocaleString("tr-TR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Yalnızca tarih (örn. "12 Eki 2026") — termin, hedef tarih gibi gün bazlı alanlar için. */
export function formatServerDate(value?: string | null): string {
  if (!value) return "—";
  return parseServerDate(value).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Termin bir takvim günüdür (saat bilgisi yok): sunucudan "2026-11-12T00:00:00" gelir.
 * Gecikme, termin günü bittikten sonra başlar; termini bugün olan iş gecikmiş sayılmaz.
 */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localToday(now: Date = new Date()): string {
  return localDay(now);
}

export function isPastDue(due?: string | null, now: Date = new Date()): boolean {
  return Boolean(due) && (due as string).slice(0, 10) < localDay(now);
}

/** Termine kalan gün (bugün = 0, dün = -1); termin yoksa null. */
export function daysUntilDue(due?: string | null, now: Date = new Date()): number | null {
  if (!due) return null;
  const [y, m, d] = due.slice(0, 10).split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}
