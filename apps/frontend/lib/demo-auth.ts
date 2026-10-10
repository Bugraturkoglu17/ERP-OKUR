import axios from "axios";
import { buildApiUrl } from "@/lib/api";

// Demo credentials are a local-development convenience and must never be
// bundled into a production client, even if an environment is misconfigured.
export const DEMO_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEMO_LOGIN === "true";

export type LoginTarget = "admin" | "manager" | "user";

export const DEMO_ACCOUNTS: Record<
  LoginTarget,
  { label: string; description: string; email: string; password: string }
> = {
  admin: {
    label: "Admin",
    description: "Tüm firmaları ve kullanıcıları yönetir",
    email: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? "",
    password: process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD ?? "",
  },
  manager: {
    label: "Yönetici",
    description: "Sismik Mekanik şirketini yönetir",
    email: process.env.NEXT_PUBLIC_DEMO_MANAGER_EMAIL ?? "",
    password: process.env.NEXT_PUBLIC_DEMO_MANAGER_PASSWORD ?? "",
  },
  user: {
    label: "Kullanıcı",
    description: "Kendisine açık operasyon ekranlarını kullanır",
    email: process.env.NEXT_PUBLIC_DEMO_USER_EMAIL ?? "",
    password: process.env.NEXT_PUBLIC_DEMO_USER_PASSWORD ?? "",
  },
};

export async function demoLogin(target: LoginTarget): Promise<{ ok: boolean; error?: string }> {
  const creds = DEMO_ACCOUNTS[target];
  if (!creds.email || !creds.password) {
    return { ok: false, error: "Demo kimlik bilgileri tanımlanmamış." };
  }

  try {
    const params = new URLSearchParams();
    params.append("username", creds.email);
    params.append("password", creds.password);

    const res = await axios.post<{ access_token: string; refresh_token?: string; force_password_change?: boolean }>(
      buildApiUrl("/auth/login"),
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (typeof window !== "undefined") {
      localStorage.setItem("token", res.data.access_token);
      sessionStorage.removeItem("initial_login_id");
      sessionStorage.removeItem("initial_temporary_password");
      if (res.data.refresh_token) {
        localStorage.setItem("refresh_token", res.data.refresh_token);
      }
      if (res.data.force_password_change) {
        sessionStorage.setItem("initial_login_id", creds.email);
        sessionStorage.setItem("initial_temporary_password", creds.password);
      }
    }

    return { ok: true };
  } catch (err: any) {
    const detail = err.response?.data?.detail;
    const msg = typeof detail === "string" ? detail : "Giriş yapılamadı.";
    return { ok: false, error: msg };
  }
}
