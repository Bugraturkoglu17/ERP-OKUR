"use client";

import { useEffect, useState } from "react";
import { getTokenPayloadFromStorage } from "@/lib/auth";

interface RoleGateProps {
  allowedRoles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ allowedRoles, children, fallback }: RoleGateProps) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    const payload = getTokenPayloadFromStorage();
    if (!payload) { setStatus("denied"); return; }
    const roles: string[] = payload.roles ?? [];
    setStatus(roles.some((r) => allowedRoles.includes(r)) ? "allowed" : "denied");
  }, [allowedRoles]);

  if (status === "loading") return null;
  if (status === "denied") return fallback ? <>{fallback}</> : null;
  return <>{children}</>;
}
