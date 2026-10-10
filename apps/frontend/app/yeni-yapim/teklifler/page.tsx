"use client";

import Link from "next/link";
import { Building2, FileText, FolderOpen } from "lucide-react";

export default function YeniYapimTekliflerPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
          <FileText className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Teklifler</h1>
          <p className="text-xs text-slate-500">Yeni yapım projelerine ait teklif dosyaları ve onay durumları.</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border border-dashed border-slate-200">
        <Building2 className="h-12 w-12 text-slate-200" />
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-500">Henüz teklif eklenmemiş.</p>
          <p className="text-xs text-slate-400 mt-1">Bu kayıtlar mağaza kartlarından oluşturulacak.</p>
        </div>
        <Link href="/projects"
          className="inline-flex items-center gap-2 text-xs text-blue-600 border border-blue-100 rounded-xl px-4 py-2 hover:bg-blue-50 transition-colors">
          <FolderOpen className="h-3.5 w-3.5" /> Mağaza Arşivine Git
        </Link>
      </div>
    </div>
  );
}
