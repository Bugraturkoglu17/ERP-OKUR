"use client";

import Link from "next/link";
import { useRef, type PointerEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

const tones = {
  blue: "border-blue-100 bg-blue-50 text-blue-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  slate: "border-slate-200 bg-slate-100 text-slate-700",
  red: "border-red-100 bg-red-50 text-red-700",
} as const;

type MetricCardProps = {
  label: string;
  value: ReactNode;
  description?: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  href?: string;
};

export function MetricCard({ label, value, description, icon: Icon, tone = "blue", href }: MetricCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--spot-x", `${x * 100}%`);
    card.style.setProperty("--spot-y", `${y * 100}%`);
    card.style.setProperty("--tilt-x", `${(0.5 - y) * 3}deg`);
    card.style.setProperty("--tilt-y", `${(x - 0.5) * 3}deg`);
  };

  const onPointerLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--spot-x", "50%");
    card.style.setProperty("--spot-y", "50%");
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
  };

  const content = (
    <>
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-tight text-muted-foreground">{label}</p>
          {description && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>}
        </div>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="relative z-10 mt-auto pt-5 text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      {href && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-300 group-hover:scale-x-100" />}
    </>
  );

  const className = "erp-spotlight-card group flex h-full min-h-36 flex-col rounded-xl border bg-card p-4 text-card-foreground shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5";

  if (href) return <Link href={href} className="block h-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><article ref={cardRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className={className}>{content}</article></Link>;

  return <article ref={cardRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className={className}>{content}</article>;
}
