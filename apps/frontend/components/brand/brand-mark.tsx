"use client";

import { OkurWordmark } from "@/components/brand/okur-wordmark";

type BrandTone = "red" | "amber";

export function BrandMark({ className = "h-8 w-20", animated = false }: {
  tone?: BrandTone;
  className?: string;
  animated?: boolean;
}) {
  return <OkurWordmark className={className} animated={animated} />;
}

export type { BrandTone };
