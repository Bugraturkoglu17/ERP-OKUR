"use client";

import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-busy="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-slate-200 before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent before:animate-[shimmer_1.4s_infinite]",
        className
      )}
      {...props}
    />
  );
}

// Stat kart skeleton — dashboard istatistik kartı geometrisine uygun
export function StatCardSkeleton() {
  return (
    <div aria-busy="true" className="rounded-xl border border-slate-100 bg-white p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
        <Skeleton className="h-3.5 w-28" />
      </div>
      <Skeleton className="h-7 w-12 mt-1" />
    </div>
  );
}

// Liste satırı skeleton — is emirleri listesi için
export function ListRowSkeleton() {
  return (
    <div aria-busy="true" className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-3.5 w-14 shrink-0" />
    </div>
  );
}

// Mağaza kartı skeleton — projects grid için
export function StoreCardSkeleton() {
  return (
    <div aria-busy="true" className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full shrink-0" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}
