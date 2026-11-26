import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Sayfa başlığı — tüm sayfalarda aynı tipografi skalası. Aksiyon butonları
 * mobilde sığmazsa alt satıra kayar (flex-wrap), sayfayı yatay taşırmaz. */
export function PageHeader({
  title, subtitle, actions, className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, subtitle, actions, className }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight md:text-xl">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
