"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, Clock, DatabaseBackup, FolderOpen,
  HardDrive, Loader2, ShieldAlert, X, XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { isFileSystemAccessSupported, pickBackupDirectory, verifyReadWritePermission } from "@/lib/backup/fsAccess";
import { checkIntegrity, fetchRecentJobs, loadBackupPlan, runBackup, type BackupRunResult } from "@/lib/backup/engine";
import type { BackupJob, BackupPlan, BackupProgress } from "@/lib/backup/types";

const REMINDER_HOUR_KEY = "okur-backup:reminder-hour";
const DEFAULT_REMINDER_HOUR = 18;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

// Backend saatleri UTC olarak, saat dilimi eki OLMADAN döner ("2026-09-29T19:02:00").
// Ek yoksa tarayıcı bunu yerel saat sanıp 3 saat geri gösterir — UTC olarak yorumla.
function parseServerDate(iso: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return parseServerDate(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function daysSince(iso: string): number {
  const diffMs = Date.now() - parseServerDate(iso).getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export default function SystemBackupPage() {
  const { user } = useAuth();
  const router = useRouter();

  // ── Yönetici (MANAGER) VE Geliştirici Admin (ADMIN) erişebilir; USER erişemez. ──
  // Admin, "Panel Görünümü"nden Yönetici Görünümü'nü seçtiğinde fiilen bir
  // Yönetici gibi çalışabilmeli — backend de require_role("admin","platform_admin")
  // ile ikisine birden izin verir (bkz. app/api/v1/routes/backup.py).
  const canUseBackup = user?.role === "MANAGER" || user?.role === "ADMIN";
  useEffect(() => {
    if (user && !canUseBackup) router.replace("/403");
  }, [user, canUseBackup, router]);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [reminderHour, setReminderHour] = useState(DEFAULT_REMINDER_HOUR);

  const [plan, setPlan] = useState<BackupPlan | null>(null);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [integrityWarning, setIntegrityWarning] = useState<string[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [result, setResult] = useState<BackupRunResult | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
    try {
      const saved = localStorage.getItem(REMINDER_HOUR_KEY);
      if (saved) setReminderHour(Number(saved));
    } catch {
      // localStorage kullanılamıyor — varsayılan saat kalır.
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchRecentJobs();
      setJobs(data);
    } catch {
      // Sessizce geç — geçmiş listesi olmadan da sayfa kullanılabilir olmalı.
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const lastSuccessful = useMemo(() => jobs.find((j) => j.status === "completed") ?? null, [jobs]);

  // Madde 2/20 — günlük yedek hatırlatması. Sunucu "son backup" durumunu
  // saklamaz/kullanmaz demek, incremental KARAR mekanizması için kullanmaz
  // demektir — bu hatırlatma banner'ı yalnızca UI/audit amaçlı BackupRun
  // geçmişini okur, incremental diff'i ETKİLEMEZ.
  const reminder = useMemo(() => {
    const now = new Date();
    const pastReminderHour = now.getHours() >= reminderHour;
    if (!lastSuccessful) {
      return pastReminderHour || jobs.length === 0 ? "Henüz hiç sistem yedeği alınmadı." : null;
    }
    const days = daysSince(lastSuccessful.completed_at ?? lastSuccessful.started_at);
    const backedUpToday = days === 0;
    if (backedUpToday) return null;
    if (!pastReminderHour && days === 0) return null;
    return days <= 1
      ? "Bugünkü sistem yedeği henüz alınmadı."
      : `${days} gündür sistem yedeği alınmadı.`;
  }, [jobs, lastSuccessful, reminderHour]);

  const resetFlow = () => {
    setPlan(null);
    setDirHandle(null);
    setIntegrityWarning(null);
    setProgress(null);
    setResult(null);
    setError("");
  };

  const handlePickFolder = async () => {
    setError("");
    setPreparing(true);
    try {
      const handle = await pickBackupDirectory();
      if (!handle) {
        // İptal ya da pencere hiç açılamadı (uygulama içi/gömülü tarayıcılar
        // klasör penceresini açıp hemen iptal eder) — sessiz kalma.
        setError(
          "Klasör seçilmedi. Klasör penceresi hiç açılmadıysa bu sayfayı Chrome veya Edge tarayıcısında açın " +
          "(uygulama içi tarayıcı klasör seçmeyi desteklemez).",
        );
        setPreparing(false);
        return;
      }
      if (!(await verifyReadWritePermission(handle))) {
        setError(
          "Seçilen klasöre yazma izni verilemedi. Tarayıcı; Masaüstü, Belgeler, İndirilenler, Resimler, " +
          "Müzik, Videolar veya kullanıcı ana klasörünün doğrudan seçilmesine güvenlik nedeniyle izin vermez. " +
          "Lütfen bu klasörlerin İÇİNDE yeni bir alt klasör oluşturup (örn. \"OkurYedek\") onu seçin.",
        );
        setPreparing(false);
        return;
      }
      const loadedPlan = await loadBackupPlan(handle);
      const missing = loadedPlan.isNewTarget ? [] : await checkIntegrity(handle, loadedPlan.manifest);
      setDirHandle(handle);
      setPlan(loadedPlan);
      setIntegrityWarning(missing.length > 0 ? missing : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klasör okunamadı.");
    } finally {
      setPreparing(false);
    }
  };

  const handleStartBackup = async () => {
    if (!dirHandle || !plan) return;
    setError("");
    setResult(null);
    if (!(await verifyReadWritePermission(dirHandle))) {
      setError("Klasöre yazma izni kayboldu. Lütfen klasörü tekrar seçin.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Planı klasördeki GÜNCEL manifest'ten yeniden hesapla: "Tekrar Dene"
      // önceki koşuda başarıyla inen dosyaları tekrar indirmez, yalnızca
      // eksik/başarısız olanları ister.
      const freshPlan = await loadBackupPlan(dirHandle, plan.manifest.backup_target_label);
      setPlan(freshPlan);
      const res = await runBackup(dirHandle, freshPlan, setProgress, controller.signal);
      setResult(res);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yedekleme başarısız oldu.");
    }
  };

  const handleCancel = () => abortRef.current?.abort();

  const changeReminderHour = (hour: number) => {
    setReminderHour(hour);
    try { localStorage.setItem(REMINDER_HOUR_KEY, String(hour)); } catch { /* yoksay */ }
  };

  if (user && !canUseBackup) return null;

  const isRunning = progress !== null && progress.phase !== "done" && progress.phase !== "error";
  const filesPct = progress && progress.bytesTotal > 0 ? Math.min(100, Math.round((progress.bytesDone / progress.bytesTotal) * 100)) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Sistem Yedeği" />

      {supported === false && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Tarayıcı desteklenmiyor</p>
              <p className="mt-1 text-sm text-amber-800">
                Yerel yedekleme, tarayıcının dosya sistemine yazma iznine ihtiyaç duyar. Bu özellik yalnızca
                <strong> masaüstü Chrome veya Edge</strong> tarayıcılarında kullanılabilir.
              </p>
            </div>
          </div>
        </Card>
      )}

      {reminder && supported && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">⚠ Sistem yedeği bekliyor</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Son başarılı yedek: {lastSuccessful ? formatDateTime(lastSuccessful.completed_at) : "Hiç alınmadı"}
                </p>
              </div>
            </div>
            <Button variant="primary" size="sm" icon={<DatabaseBackup className="h-4 w-4" />} onClick={handlePickFolder} disabled={!!plan}>
              Yedek Al
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Son Yedek"
          value={lastSuccessful ? formatDateTime(lastSuccessful.completed_at) : "—"}
          valueClassName="text-base sm:text-lg"
          icon={<Clock className="h-4 w-4 text-slate-300" />}
        />
        <StatCard
          label="Hedef"
          value={
            <span
              className="block truncate"
              title={lastSuccessful?.backup_target_label || lastSuccessful?.backup_target_id || undefined}
            >
              {lastSuccessful?.backup_target_label || lastSuccessful?.backup_target_id?.slice(-8) || "—"}
            </span>
          }
          valueClassName="text-base sm:text-lg"
          icon={<HardDrive className="h-4 w-4 text-slate-300" />}
        />
        <StatCard
          label="Son Koşu"
          value={lastSuccessful ? `${lastSuccessful.r2_objects_new + lastSuccessful.r2_objects_changed} dosya` : "—"}
          valueClassName="text-base sm:text-lg"
          description={lastSuccessful ? formatBytes(lastSuccessful.bytes_written) : undefined}
          icon={<DatabaseBackup className="h-4 w-4 text-slate-300" />}
        />
        <StatCard
          label="Durum"
          value={lastSuccessful ? "Tamamlandı" : "Yok"}
          valueClassName="text-base sm:text-lg"
          icon={lastSuccessful ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}
        />
      </div>

      {/* ── Ana akış: klasör seçilmeden önce ─────────────────────────────── */}
      {!plan && supported && (
        <Card>
          <CardTitle>Yedek Al</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Yedeğin yazılacağı klasörü seçin — bilgisayarınızdaki bir klasör, harici HDD veya USB disk olabilir.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={preparing ? undefined : <FolderOpen className="h-4 w-4" />} loading={preparing} onClick={handlePickFolder}>
              Klasör Seç
            </Button>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Günlük hatırlatma saati:
              <select
                value={reminderHour}
                onChange={(e) => changeReminderHour(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </Card>
      )}

      {/* ── Onay ekranı: yeni hedef UYARISI veya artımlı özet ───────────── */}
      {plan && !isRunning && !result && (
        <Card className={plan.isNewTarget ? "border-amber-300" : undefined}>
          {plan.isNewTarget ? (
            <>
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                <div>
                  <CardTitle>Bu klasörde daha önce OKUR yerel ERP yedeği bulunamadı</CardTitle>
                  <p className="mt-2 text-sm text-slate-600">
                    Bu klasöre devam edilirse yerel PostgreSQL veritabanı ve Okur yerel dosyalarının tamamı için
                    <strong> başlangıç TAM YEDEĞİ</strong> oluşturulacaktır.
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div><dt className="text-xs text-slate-400">Dosya sayısı</dt><dd className="font-semibold text-slate-900">{plan.diff.new.length}</dd></div>
                <div><dt className="text-xs text-slate-400">Toplam boyut</dt><dd className="font-semibold text-slate-900">{formatBytes(plan.diff.total_bytes)}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <CardTitle>Yedekleme özeti</CardTitle>
              <p className="mt-1 text-xs text-slate-400">
                Son yedek: {formatDateTime(plan.manifest.updated_at)} · Hedef: {plan.manifest.backup_target_label || plan.manifest.backup_target_id}
              </p>
              <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div><dt className="text-xs text-slate-400">Yeni dosya</dt><dd className="font-semibold text-slate-900">{plan.diff.new.length}</dd></div>
                <div><dt className="text-xs text-slate-400">Değişen dosya</dt><dd className="font-semibold text-slate-900">{plan.diff.changed.length}</dd></div>
                <div><dt className="text-xs text-slate-400">Toplam veri</dt><dd className="font-semibold text-slate-900">{formatBytes(plan.diff.total_bytes)}</dd></div>
              </dl>
              {integrityWarning && integrityWarning.length > 0 && (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <ShieldAlert className="h-4 w-4 shrink-0" /> Yedek bütünlüğü bozulmuş olabilir — {integrityWarning.length} dosya HDD&apos;de bulunamadı. Eksikler otomatik tamamlanacak.
                </p>
              )}
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={<DatabaseBackup className="h-4 w-4" />} onClick={handleStartBackup}>
              {plan.isNewTarget ? "Tam Yedeklemeyi Başlat" : "Yedeklemeyi Başlat"}
            </Button>
            <Button variant="ghost" onClick={resetFlow}>Vazgeç</Button>
          </div>
        </Card>
      )}

      {/* ── Gerçek ilerleme ───────────────────────────────────────────────── */}
      {isRunning && progress && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Sistem Yedeği Alınıyor</CardTitle>
            <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={handleCancel}>İptal</Button>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Veritabanı</span>
              {progress.phase === "database"
                ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Yerel dosyalar</span>
                <span>{filesPct}%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${filesPct}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                <span>Dosya: {progress.filesDone} / {progress.filesTotal}</span>
                <span>{formatBytes(progress.bytesDone)} / {formatBytes(progress.bytesTotal)}</span>
              </div>
            </div>
            {progress.currentFile && (
              <p className="truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">Şu anda: {progress.currentFile}</p>
            )}
          </div>
        </Card>
      )}

      {/* ── Sonuç ─────────────────────────────────────────────────────────── */}
      {result && (
        <Card className={result.status === "completed" ? "border-emerald-200" : "border-red-200"}>
          <div className="flex items-start gap-3">
            {result.status === "completed"
              ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
              : <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />}
            <div>
              <CardTitle>
                {result.status === "completed" ? "✓ Yedek başarıyla tamamlandı" : "❌ Yedek tamamlanamadı"}
              </CardTitle>
              <p className="mt-1 text-sm text-slate-600">
                Başarılı: {result.filesNew + result.filesChanged - result.filesFailed} · Başarısız: {result.filesFailed} · Toplam: {formatBytes(result.bytesWritten)}
              </p>
              {result.errorMessage && <p className="mt-1 text-xs text-red-600">{result.errorMessage}</p>}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {result.status !== "completed" && (
              <Button variant="primary" onClick={handleStartBackup}>Tekrar Dene</Button>
            )}
            <Button variant="secondary" onClick={resetFlow}>Kapat</Button>
          </div>
        </Card>
      )}

      {/* ── Yedek Geçmişi ─────────────────────────────────────────────────── */}
      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardTitle>Yedek Geçmişi</CardTitle></div>
        {loadingJobs ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Yükleniyor…</div>
        ) : jobs.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-400">Henüz bir yedekleme koşusu yok.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {job.status === "completed" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                    {job.status === "failed" && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    {job.status === "incomplete" && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                    {job.status === "running" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />}
                    <p className="truncate text-sm font-medium text-slate-800">{formatDateTime(job.started_at)}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {job.backup_target_label || job.backup_target_id} · {job.manager_name}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-400">
                  <p>{formatBytes(job.bytes_written)}</p>
                  <p>{job.r2_objects_new} yeni / {job.r2_objects_changed} değişen</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
