"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLS: Record<ButtonVariant, string> = {
  primary:   "bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ghost:     "text-slate-600 hover:bg-slate-100",
  danger:    "bg-red-600 text-white hover:bg-red-700",
};

// Aynı buton her yerde aynı yükseklik/padding/font-size kullansın diye
// tek bir boyut skalası — sayfalar kendi rastgele px değerlerini seçmesin.
const SIZE_CLS: Record<ButtonSize, string> = {
  sm: "min-h-[2.25rem] px-3 text-xs gap-1.5 rounded-lg",
  md: "min-h-[2.75rem] px-4 text-sm gap-2 rounded-xl",
  lg: "min-h-[3rem] px-5 text-sm gap-2 rounded-xl",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", fullWidth, loading, icon, disabled, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-w-0 items-center justify-center whitespace-nowrap font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLS[variant],
        SIZE_CLS[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : icon}
      {children != null && <span className="truncate">{children}</span>}
    </button>
  );
});

/** İki (veya daha fazla) butonun yan yana sığmadığı yerde mobilde otomatik
 * 2 kolona (veya tam genişlik alt alta) düşen aksiyon satırı. */
export function ButtonRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:flex sm:flex-wrap", className)}>
      {children}
    </div>
  );
}
