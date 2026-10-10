"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import type { UserRole } from "@/lib/permissions";
import { getTokenPayloadFromStorage } from "@/lib/auth";
import type { BrandTone } from "@/components/brand/brand-mark";
import { LaunchScreen } from "@/components/brand/launch-screen";

// Açılış ekranı en az bu kadar görünür: logo dolumu (~0,7 sn) + logonun
// üzerinden geçen ışık hüzmesi (0,35 sn gecikme + 1,9 sn = 2,25 sn). Yani
// "animasyon tamamlanmadan içeriğe geçme" kuralı — yapay bir bekleme değil,
// açılış animasyonunun gerçek süresidir.
const INTRO_ANIMATION_MS = 2300;
// Ekranın opacity 0'a fade süresi (globals.css .erp-launch-screen transition ile eş).
const FADE_OUT_MS = 380;

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  brandTone?: BrandTone;
}

export function RoleGuard({
  allowedRoles,
  children,
  brandTone = "red",
}: RoleGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Hareket azaltma tercihi varsa animasyon zaten oynatılmıyor; bekletme.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timer = window.setTimeout(() => setIntroDone(true), reduced ? 350 : INTRO_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // ADMIN her panele erişebilir (superuser)
  const hasAccess = !!user && (user.role === "ADMIN" || allowedRoles.includes(user.role));
  const authResolved = !isLoading && isAuthenticated && !!user && hasAccess;

  // React Hook Kuralları: tüm hook'lar koşulsuz, hiçbir early return'ün
  // ARDINDAN değil önünde çağrılır.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }
    if (getTokenPayloadFromStorage()?.force_password_change) {
      window.location.href = "/password-reset";
      return;
    }
    if (!hasAccess) {
      window.location.href = "/403";
    }
  }, [isLoading, isAuthenticated, hasAccess]);

  // Oturum hazır VE açılış animasyonu tamamlandı → ekranı fade ile kaldır.
  const ready = mounted && authResolved && introDone;
  useEffect(() => {
    if (!ready || hidden) return;
    setLeaving(true);
    const timer = window.setTimeout(() => setHidden(true), FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [ready, hidden]);

  // Oturum yoksa (login'e yönleniyor) sessizce null — açılış ekranı gösterilmez.
  // (localStorage yalnızca `mounted` sonrası okunur; SSR'da bu dala girilmez.)
  if (mounted && !authResolved) {
    const hasToken = !!localStorage.getItem("token") || !!localStorage.getItem("auth_store");
    if (!hasToken) return null;
  }

  // TEK dönüş şekli — SSR ve istemcinin ilk render'ı AYNI ağacı üretir
  // (aksi halde BrandMark'ın useId'si kayıp SVG clip/gradient id'leri
  // hydrate'de uyuşmuyordu). authResolved olur olmaz içerik ARKA PLANDA
  // mount olup güncel verisini çeker; açılış ekranı (fixed, z-[60]) üstte
  // durur, animasyon + oturum hazır olunca fade ile kaybolup ağaçtan kalkar.
  return (
    <>
      {mounted && authResolved && children}
      {!hidden && <LaunchScreen tone={brandTone} leaving={leaving} />}
    </>
  );
}
