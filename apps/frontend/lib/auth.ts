export type JwtPayload = {
  sub?: string;
  roles?: string[];
  permissions?: string[];
  tenant_id?: string | null;
  discipline?: string | null;
  force_password_change?: boolean;
  exp?: number;
  iat?: number;
};

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  if (typeof window === "undefined") {
    return "";
  }
  return window.atob(padded);
}

export function parseJwt(token: string | null | undefined): JwtPayload | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const decoded = decodeBase64Url(parts[1]);
    if (!decoded) {
      return null;
    }
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

export function getTokenPayloadFromStorage(): JwtPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  const token = localStorage.getItem("token");
  return parseJwt(token);
}

export function hasRole(payload: JwtPayload | null, role: string): boolean {
  if (!payload?.roles || !Array.isArray(payload.roles)) {
    return false;
  }
  return payload.roles.includes(role);
}

export function isPlatformAdmin(payload: JwtPayload | null): boolean {
  return hasRole(payload, "platform_admin");
}

export function getRoles(payload: JwtPayload | null): string[] {
  if (!payload?.roles || !Array.isArray(payload.roles)) {
    return [];
  }
  return payload.roles;
}
