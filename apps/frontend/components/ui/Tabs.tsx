"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountBadge } from "./CountBadge";

export type TabItem<K extends string = string> = {
  key: K;
  label: string;
  shortLabel?: string;
  icon?: ReactNode;
  count?: number | null;
  tone?: "neutral" | "critical";
};

/** Ortak tab bar — mobilde kısa etiket + tek satır, sığmazsa YALNIZCA bu
 * şerit kendi içinde yatay kayar (sayfa değil). */
export function Tabs<K extends string>({
  items, active, onChange, className,
}: {
  items: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-0.5 overflow-x-auto border-b border-slate-200 pb-0",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {items.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-t-xl border-b-2 px-2 py-2.5 text-xs font-medium transition-colors sm:flex-none sm:gap-2 sm:px-4 sm:text-sm",
            active === tab.key
              ? "border-blue-600 bg-blue-50/50 text-blue-700"
              : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          )}
        >
          {tab.icon}
          <span className="sm:hidden">{tab.shortLabel ?? tab.label}</span>
          <span className="hidden sm:inline">{tab.label}</span>
          {tab.count != null && tab.count > 0 && (
            <CountBadge count={tab.count} tone={tab.tone === "critical" ? "critical" : "neutral"} />
          )}
        </button>
      ))}
    </div>
  );
}
