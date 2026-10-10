import { apiGet } from "@/lib/api";

export type TenantContext = {
  tenant_id: string;
  tenant_name: string;
  tenant_code: string;
  logo_url?: string | null;
  tax_no?: string | null;
  sector?: string | null;
  country?: string | null;
  theme_color?: string | null;
  domain?: string | null;
  subdomain?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  default_currency?: string;
  vat_rate?: number;
  low_stock_threshold?: number;
  auto_invoice_no?: boolean;
  require_approval_for_expenses?: boolean;
  default_payment_term_days?: number;
  locale?: string;
  timezone?: string;
  date_format?: string;
  session_timeout_minutes?: number;
  mfa_required_for_admins?: boolean;
  login_ip_whitelist?: string | null;
  email_notifications?: boolean;
  push_notifications?: boolean;
  daily_summary_hour?: string;
  backup_frequency?: string;
  retention_days?: number;
  email_mode?: "platform" | "tenant_domain" | null;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  email_domain_verified?: boolean;
  email_provider_identity_id?: string | null;
  email_branding?: Record<string, any> | null;
};

const CACHE_KEY = "tenant_context_v1";

export async function fetchTenantContext(force = false): Promise<TenantContext | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!localStorage.getItem("token")) {
    return null;
  }

  if (!force) {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as TenantContext;
      } catch {
        window.sessionStorage.removeItem(CACHE_KEY);
      }
    }
  }

  try {
    const context = await apiGet<TenantContext>("/auth/tenant-context");
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(context));
    return context;
  } catch {
    return null;
  }
}

export function saveTenantContext(context: TenantContext) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(context));
}
