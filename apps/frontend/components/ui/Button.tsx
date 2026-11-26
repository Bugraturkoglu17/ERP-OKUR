"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button as ShadcnButton } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";

/**
 * Eski ortak düğme — arayüzü (variant/size/loading/icon) korunur, görünüm shadcn Button'dan gelir.
 * Yeni kodda doğrudan `@/components/shadcn/button` kullanın.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, "default" | "outline" | "ghost" | "destructive"> = {
  primary: "default", secondary: "outline", ghost: "ghost", danger: "destructive",
};
const SIZE: Record<ButtonSize, "sm" | "default" | "lg"> = { sm: "sm", md: "default", lg: "lg" };

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
    <ShadcnButton
      ref={ref}
      type={rest.type ?? "button"}
      variant={VARIANT[variant]}
      size={SIZE[size]}
      disabled={disabled || loading}
      className={cn("min-w-0", fullWidth && "w-full", className)}
      {...rest}
    >
      {loading ? <Spinner data-icon="inline-start" /> : icon}
      {children != null && <span className="truncate">{children}</span>}
    </ShadcnButton>
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
