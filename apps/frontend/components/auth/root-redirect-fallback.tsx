"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROOT_REDIRECT_CONFIG, ROOT_REDIRECT_FLAG, resolveRootTarget } from "@/lib/root-redirect";

/**
 * "/" sayfasına istemci tarafı gezinmeyle (ör. <Link href="/">) gelindiğinde
 * HTML'e gömülü inline script ÇALIŞMAZ — o durumda yönlendirmeyi bu bileşen
 * aynı mantıkla (resolveRootTarget) yapar. Tam sayfa açılışta inline script
 * bayrağı zaten set ettiği için burada ikinci bir yönlendirme yapılmaz.
 */
export function RootRedirectFallback() {
  const router = useRouter();

  useEffect(() => {
    if ((window as unknown as Record<string, unknown>)[ROOT_REDIRECT_FLAG]) return;
    router.replace(resolveRootTarget(ROOT_REDIRECT_CONFIG));
  }, [router]);

  return null;
}
