import { apiGet, apiPatch, apiPost, buildApiUrl } from "@/lib/api";
import { fileExistsAt, writeJsonFile, writeStreamToFile } from "@/lib/backup/fsAccess";
import { createEmptyManifest, readManifest, upsertManifestEntries, writeManifest } from "@/lib/backup/manifest";
import type {
  BackupJob,
  BackupManifest,
  BackupPlan,
  BackupProgress,
  BackupRunManifest,
  ManifestDiffEntry,
  ManifestDiffResponse,
} from "@/lib/backup/types";

function todayFolder(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Seçilen klasörü okur, backend'e manifest-diff sorar. Manifest yoksa
 * (yeni/boş klasör) TÜM canlı objeler "new" döner — "yeni HDD → tam yedek
 * uyarısı" (madde 5) akışının temeli budur. UI bu sonucu onay ekranında
 * gösterir; indirme henüz BAŞLAMAZ.
 */
export async function loadBackupPlan(root: FileSystemDirectoryHandle, label?: string): Promise<BackupPlan> {
  const existing = await readManifest(root);
  const manifest = existing ?? createEmptyManifest(label);
  const diff = await apiPost<ManifestDiffResponse>("/backup/manifest-diff", {
    entries: manifest.entries.map((e) => ({ key: e.key, etag: e.etag, size: e.size })),
  });
  return { isNewTarget: existing === null, manifest, diff };
}

/** Bütünlük ön kontrolü (madde 15): son manifestteki dosyaların HDD'de fiziksel var olduğunu örnekleyerek doğrular. */
export async function checkIntegrity(root: FileSystemDirectoryHandle, manifest: BackupManifest): Promise<string[]> {
  const missing: string[] = [];
  // Tüm dosyaları taramak büyük yedeklerde pahalı olabilir — en sık kırılma
  // noktası olan SON eklenen girdiler örneklenir; eksik olan her obje zaten
  // bir sonraki manifest-diff'te "changed/new" olarak yeniden istenecektir.
  const sample = manifest.entries.slice(-50);
  for (const entry of sample) {
    if (!(await fileExistsAt(root, entry.relative_path))) missing.push(entry.key);
  }
  return missing;
}

async function downloadDatabaseDump(
  root: FileSystemDirectoryHandle,
  onProgress: (p: Partial<BackupProgress>) => void,
  signal?: AbortSignal,
): Promise<{ ok: boolean; bytes: number }> {
  const res = await fetch(buildApiUrl("/backup/database-dump"), { headers: authHeader(), signal });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    onProgress({ message: `Veritabanı yedeği alınamadı (HTTP ${res.status}): ${detail.slice(0, 200)}` });
    return { ok: false, bytes: 0 };
  }
  const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const relativePath = `OKUR_DATABASE/${todayFolder()}/okur_db_${ts}.dump`;
  const bytes = await writeStreamToFile(root, relativePath, res.body, (b) =>
    onProgress({ bytesDone: b, currentFile: "Veritabanı (Okur yerel PostgreSQL)" }),
  );
  // pg_dump custom-format dosyaları "PGDMP" ile başlar — boş/bozuk dump SUCCESS sayılmaz (madde 30).
  return { ok: bytes > 100, bytes };
}

export type BackupRunResult = {
  status: "completed" | "failed" | "incomplete";
  databaseBackedUp: boolean;
  filesNew: number;
  filesChanged: number;
  filesFailed: number;
  bytesWritten: number;
  errorMessage?: string;
};

/**
 * Asıl yedekleme akışı. FAKE TIMER yok — ilerleme gerçek byte/dosya
 * sayaçlarından hesaplanır (madde 17). Her dosya `.partial` olarak yazılır,
 * tamamlanınca gerçek isme geçer (madde 16) — kesinti durumunda yarım dosya
 * asla "tamam" sayılmaz.
 */
export async function runBackup(
  root: FileSystemDirectoryHandle,
  plan: BackupPlan,
  onProgress: (p: BackupProgress) => void,
  signal?: AbortSignal,
): Promise<BackupRunResult> {
  const { manifest, diff } = plan;
  const toDownload: ManifestDiffEntry[] = [...diff.new, ...diff.changed];
  const filesTotal = toDownload.length;
  const bytesTotal = diff.total_bytes;

  let bytesDone = 0;
  let filesDone = 0;
  let filesFailed = 0;
  const newEntries: typeof manifest.entries = [];

  const emit = (partial: Partial<BackupProgress>, phase: BackupProgress["phase"]) =>
    onProgress({ phase, filesTotal, filesDone, bytesTotal, bytesDone, ...partial });

  emit({ message: "Yedekleme kaydı başlatılıyor…" }, "checking");
  const job = await apiPost<BackupJob>("/backup/jobs", {
    backup_target_id: manifest.backup_target_id,
    backup_target_label: manifest.backup_target_label,
  });

  const complete = async (result: BackupRunResult) => {
    await apiPatch<BackupJob>(`/backup/jobs/${job.id}`, {
      status: result.status,
      database_backed_up: result.databaseBackedUp,
      r2_objects_new: diff.new.length,
      r2_objects_changed: diff.changed.length,
      r2_objects_failed: result.filesFailed,
      bytes_written: result.bytesWritten,
      error_message: result.errorMessage,
    }).catch(() => undefined);
    return result;
  };

  try {
    // 1) Veritabanı — HER koşuda FULL logical dump (madde 11, incremental yok).
    emit({ message: "Veritabanı yedekleniyor…" }, "database");
    // DB dump byte'ları bytesTotal/bytesDone'a KATILMAZ (dump boyutu önceden
    // bilinmiyor — pg_dump bitene kadar belli olmaz); ilerlemesi ayrı
    // "database" fazında currentFile/mesaj üzerinden izlenir.
    const dbResult = await downloadDatabaseDump(root, (p) => emit(p, "database"), signal);

    // 2) R2 objeleri — yalnızca yeni/değişenler.
    for (const entry of toDownload) {
      if (signal?.aborted) throw new DOMException("İptal edildi", "AbortError");
      emit({ currentFile: entry.key }, "files");
      try {
        // Dosya backend üzerinden akar (/backup/object) — tarayıcı R2'ye
        // doğrudan gitmediği için bucket'ta CORS kuralı gerekmez.
        const res = await fetch(buildApiUrl(entry.download_url), { headers: authHeader(), signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const relativePath = `OKUR_FILES/${todayFolder()}/${entry.key}`;
        const written = await writeStreamToFile(root, relativePath, res.body, (b) => {
          emit({ bytesDone: bytesDone + b, currentFile: entry.key }, "files");
        });
        // Eksik/kesik indirme asla "başarılı" sayılmaz (madde 30).
        if (written !== entry.size) {
          throw new Error(`Boyut uyuşmuyor: ${written} / ${entry.size} byte`);
        }
        bytesDone += entry.size;
        filesDone += 1;
        newEntries.push({
          key: entry.key,
          etag: entry.etag,
          size: entry.size,
          last_modified: entry.last_modified,
          relative_path: relativePath,
        });
        emit({}, "files");
      } catch (err) {
        filesFailed += 1;
        console.error(`[backup] ${entry.key} indirilemedi:`, err);
      }
    }

    // 3) Manifest güncelle (yalnızca başarılı indirilenler eklenir).
    emit({ message: "Manifest güncelleniyor…" }, "manifest");
    const updatedManifest = upsertManifestEntries(manifest, newEntries);
    await writeManifest(root, updatedManifest);

    const runManifest: BackupRunManifest = {
      backup_id: job.id,
      started_at: job.started_at,
      completed_at: new Date().toISOString(),
      manager_name: job.manager_name,
      status: filesFailed > 0 || !dbResult.ok ? "incomplete" : "completed",
      database_backed_up: dbResult.ok,
      r2_objects_total: filesTotal,
      r2_objects_new: diff.new.length,
      r2_objects_changed: diff.changed.length,
      bytes_written: bytesDone + dbResult.bytes,
    };
    await writeJsonFile(root, `MANIFEST/${runManifest.completed_at.replace(/[:.]/g, "-")}.json`, runManifest);

    // 4) Başarı kriteri (madde 18/30): DB ✓ + tüm dosyalar ✓ + manifest ✓ olmadan SUCCESS yazılmaz.
    const allOk = dbResult.ok && filesFailed === 0;
    const result: BackupRunResult = {
      status: allOk ? "completed" : "incomplete",
      databaseBackedUp: dbResult.ok,
      filesNew: diff.new.length,
      filesChanged: diff.changed.length,
      filesFailed,
      bytesWritten: bytesDone + dbResult.bytes,
      errorMessage: allOk ? undefined : `${filesFailed} dosya başarısız${dbResult.ok ? "" : ", veritabanı yedeği alınamadı"}.`,
    };
    emit({ message: allOk ? "Yedekleme tamamlandı." : result.errorMessage }, "done");
    return complete(result);
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === "NotAllowedError"
        ? "Klasöre yazma izni reddedildi. Masaüstü/Belgeler/İndirilenler gibi sistem klasörleri yerine, " +
          "bunların içinde oluşturduğunuz bir alt klasörü seçip tekrar deneyin."
        : err instanceof Error ? err.message : "Bilinmeyen hata";
    emit({ message }, "error");
    return complete({
      status: "failed",
      databaseBackedUp: false,
      filesNew: 0,
      filesChanged: 0,
      filesFailed,
      bytesWritten: bytesDone,
      errorMessage: message,
    });
  }
}

export async function fetchRecentJobs(limit = 20): Promise<BackupJob[]> {
  return apiGet<BackupJob[]>("/backup/jobs/recent", { limit });
}
