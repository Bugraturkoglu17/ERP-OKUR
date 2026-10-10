"use client";

import { useCallback, useState } from "react";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import { apiDelete, apiGet } from "@/lib/api";
import { downloadFromUrl, openFileInNewTab } from "@/lib/download";
import { useAuth } from "@/contexts/auth-context";
import type { ToolbarDockAction } from "@/components/ui/toolbar-dock";

type DocRef = { id: string; original_name: string };

/**
 * Mağaza sayfasındaki tüm dosya listelerinin (Proje Dosyaları, Görsel Envanter,
 * Servis Formları, Diğer Dosyalar) ORTAK "≡" menüsü: Aç / İndir / Sil.
 *
 * - Aç ve İndir: tüm roller. Kullanıcı zaten görebildiği dosyayı kaydedebilir;
 *   erişimi sunucu mağaza kapsamına göre denetler.
 * - Sil: yalnızca yönetici/admin. Sunucu da kullanıcıya 403 döner; o yüzden
 *   kullanıcıya satırı hiç göstermiyoruz. Silme "arşive alma"dır (yumuşak silme).
 *
 * Başarısız işlem sessiz kalmaz: `error` ekranda gösterilmek üzere döner.
 */
export function useDocActions(onDeleted: (docId: string) => void) {
  const { user } = useAuth();
  const canDelete = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchUrl = useCallback(async (doc: DocRef, download: boolean) => {
    const res = await apiGet<{ url: string }>(`/documents/${doc.id}/download${download ? "?download=true" : ""}`);
    return res?.url;
  }, []);

  const open = useCallback(async (doc: DocRef) => {
    setError("");
    try {
      await openFileInNewTab(() => fetchUrl(doc, false));
    } catch {
      setError(`"${doc.original_name}" açılamadı. Bağlantıyı kontrol edip tekrar deneyin.`);
    }
  }, [fetchUrl]);

  const download = useCallback(async (doc: DocRef) => {
    setError("");
    try {
      await downloadFromUrl(() => fetchUrl(doc, true), doc.original_name);
    } catch {
      setError(`"${doc.original_name}" indirilemedi. Bağlantıyı kontrol edip tekrar deneyin.`);
    }
  }, [fetchUrl]);

  const remove = useCallback(async (doc: DocRef) => {
    if (!window.confirm(`"${doc.original_name}" dosyasını kaldırmak istediğinize emin misiniz?`)) return;
    setError("");
    setBusyId(doc.id);
    try {
      await apiDelete(`/documents/${doc.id}`);
      onDeleted(doc.id);
    } catch {
      setError("Dosya silinemedi. Yetkinizi kontrol edip tekrar deneyin.");
    } finally {
      setBusyId(null);
    }
  }, [onDeleted]);

  /** `extra`: satıra özel ek işlemler (örn. "Genel Arşivde Göster"), Sil'den önce eklenir. */
  const actionsFor = useCallback((doc: DocRef, extra: ToolbarDockAction[] = []): ToolbarDockAction[] => [
    { key: "open", label: "Aç", icon: ExternalLink, onClick: () => open(doc) },
    { key: "download", label: "İndir", icon: Download, onClick: () => download(doc) },
    ...extra,
    ...(canDelete
      ? [{ key: "delete", label: "Sil", icon: Trash2, variant: "danger", onClick: () => remove(doc) } as ToolbarDockAction]
      : []),
  ], [open, download, remove, canDelete]);

  return { actionsFor, busyId, error, clearError: () => setError("") };
}
