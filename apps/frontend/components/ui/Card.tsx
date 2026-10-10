import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Ortak kart kabuğu — tüm sayfalarda aynı radius/border/shadow/spacing.
 * fixed-height YOK, içerik ne kadarsa kart o kadar büyür. */
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white shadow-sm", padded && "p-4 sm:p-5", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-base font-semibold leading-tight text-slate-900", className)}>{children}</p>;
}

/** KPI kartı — başlık/açıklama üstte, değer altta hep aynı hizada dursun diye
 * value'yu mt-auto ile karta yapıştırıyoruz. */
export function StatCard({
  label, value, description, icon, className, valueClassName,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  className?: string;
  /** Değer sayı değil de tarih/metin ise varsayılan iri boyutu ezmek için (örn. "text-lg"). */
  valueClassName?: string;
}) {
  return (
    <Card className={cn("flex min-h-[6.5rem] min-w-0 flex-col justify-between", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {icon}
      </div>
      <div className="mt-auto min-w-0 pt-2">
        <p className={cn("text-2xl font-semibold leading-none text-slate-900 sm:text-3xl", valueClassName)}>{value}</p>
        {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
      </div>
    </Card>
  );
}
