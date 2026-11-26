import { cn } from "@/lib/utils";

type CountBadgeProps = {
  count: number;
  tone?: "neutral" | "critical" | "info";
  className?: string;
};

const TONE_CLS: Record<NonNullable<CountBadgeProps["tone"]>, string> = {
  neutral:  "bg-muted text-muted-foreground",
  critical: "bg-destructive/10 text-destructive",
  info:     "bg-primary/10 text-primary",
};

/** Sayı gösterimi her yerde tek satırda, aynı hizada — "2" üstte "adet"
 * altta durmasın diye. */
export function CountBadge({ count, tone = "neutral", className }: CountBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none",
        TONE_CLS[tone],
        className
      )}
    >
      {count}
    </span>
  );
}

/** "Fotoğraflar 42 adet" gibi başlık + sayı + birim tek satırda, taşmadan. */
export function CountLabel({ label, count, unit = "adet", className }: { label?: string; count: number; unit?: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground", className)}>
      {label && <span className="font-semibold text-foreground">{label}</span>}
      <span>{count} {unit}</span>
    </p>
  );
}
