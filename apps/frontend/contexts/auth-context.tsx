"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getTokenPayloadFromStorage } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api";
import { detachPushOnLogout } from "@/lib/push";
import { clearClientSession } from "@/lib/client-session";
import { type UserRole, ROLE_PERMISSIONS } from "@/lib/permissions";

export interface AuthUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  /** Gerçek güvenlik backend permission kontrolü ile sağlanacak. */
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export const AUTH_STORE_KEY = "auth_store";

function mapJwtToRole(roles: string[]): UserRole {
  if (roles.includes("platform_admin")) return "ADMIN";
  if (roles.includes("admin") || roles.includes("manager")) return "MANAGER";
  return "USER";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const payload = getTokenPayloadFromStorage();
      if (payload && payload.exp && payload.exp * 1000 > Date.now()) {
        const roles: string[] = payload.roles ?? [];
        const role = mapJwtToRole(roles);
        const jwtUser: AuthUser = {
          id: payload.sub ?? "",
          first_name: "Kullanıcı",
          last_name: "",
          email: "",
          role,
          permissions: [...ROLE_PERMISSIONS[role]],
        };
        setUser(jwtUser);
        // AUTH_STORE_KEY'e de kaydet — sayfa geçişlerinde tutarlı okuma sağlar
        localStorage.setItem(AUTH_STORE_KEY, JSON.stringify({ user: jwtUser, source: "jwt" }));
      } else {
        // Geçerli bir JWT yoksa oturum yok — eski/yarım kalmış auth_store girdisi
        // kullanıcıyı yanlışlıkla oturum açmış göstermesin.
        localStorage.removeItem(AUTH_STORE_KEY);
      }
    } catch {
      // ignore parse errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = async () => {
    const token = localStorage.getItem("token");
    setUser(null);
    try {
      if (token) {
        // Çıkış yapan kişinin bildirimleri bu telefona gitmeye devam etmesin.
        await detachPushOnLogout(token);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 1500);
        await fetch(buildApiUrl("/auth/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          keepalive: true,
        }).catch(() => undefined);
        window.clearTimeout(timeout);
      }
    } finally {
      clearClientSession();
      window.location.replace("/login");
    }
  };

  const hasRole = (role: UserRole | UserRole[]): boolean => {
    if (!user) return false;
    return Array.isArray(role) ? role.includes(user.role) : user.role === role;
  };

  const hasPermission = (permission: string): boolean => {
    // Gerçek güvenlik backend permission kontrolü ile sağlanacak.
    if (!user) return false;
    return user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
        hasRole,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
