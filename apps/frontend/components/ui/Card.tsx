import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card as ShadcnCard } from "@/components/shadcn/card";

/** Eski ortak kart kabuğu — arayüzü korunur, görünüm shadcn Card'dan gelir.
 * fixed-height YOK, içerik ne kadarsa kart o kadar büyür. Yeni kodda `@/components/shadcn/card` kullanın. */
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <ShadcnCard className={cn(padded && "p-4 sm:p-5", className)}>{children}</ShadcnCard>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-base font-semibold leading-tight", className)}>{children}</p>;
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
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon}
      </div>
      <div className="mt-auto min-w-0 pt-2">
        <p className={cn("text-2xl font-semibold leading-none sm:text-3xl", valueClassName)}>{value}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
    </Card>
  );
}
