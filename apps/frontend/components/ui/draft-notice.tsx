"use client";

import { History } from "lucide-react";

/** Taslağı geri yüklenmiş formun üstündeki kısa not; "Temizle" formu sıfırlar. */
export function DraftNotice({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
      <span className="inline-flex items-center gap-2"><History className="h-4 w-4 shrink-0" />Kaldığınız yerden devam ediyorsunuz.</span>
      <button type="button" onClick={onClear} className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100">Temizle</button>
    </div>
  );
}
