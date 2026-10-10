import { getTokenPayloadFromStorage, isPlatformAdmin } from "@/lib/auth";

export type PanelType = "platform" | "admin" | "manager" | "user";

const PANEL_HOME: Record<PanelType, string> = {
  platform: "/platform",
  admin: "/admin/dashboard",
  manager: "/manager/dashboard",
  user: "/user/dashboard",
};

export function getPrimaryPanel(): PanelType | null {
  const payload = getTokenPayloadFromStorage();
  if (!payload) return null;
  if (isPlatformAdmin(payload)) return "platform";
  const roles: string[] = payload.roles ?? [];
  if (roles.includes("admin")) return "admin";
  if (roles.includes("manager")) return "manager";
  if (roles.length > 0) return "user";
  return null;
}

export function getPanelHome(panel?: PanelType | null): string {
  const p = panel ?? getPrimaryPanel();
  if (!p) return "/login";
  return PANEL_HOME[p];
}
