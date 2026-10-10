"use client";

import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" };

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <div role="status" aria-label="Yükleniyor" className={cn("inline-flex", className)}>
      <svg
        className={cn("animate-spin text-slate-400", sizes[size])}
        viewBox="0 0 24 24"
        fill="none"
      >
        {/* track */}
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
        {/* arc */}
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-80"
        />
      </svg>
      <span className="sr-only">Yükleniyor</span>
    </div>
  );
}
