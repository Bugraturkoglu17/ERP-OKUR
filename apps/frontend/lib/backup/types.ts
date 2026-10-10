// Firma kontrollü yerel yedekleme sistemi — paylaşılan tipler.
// Manifest, seçilen HDD/klasörün KENDİSİNDE tutulur (backup-index.json) —
// sunucu hiçbir "son backup" durumunu incremental karar için saklamaz/kullanmaz.

export type BackupManifestEntry = {
  key: string;
  etag: string;
  size: number;
  last_modified: string;
  /** Yerel diskte, backup klasörüne göre göreli yol (genelde `FILES/<key>`). */
  relative_path: string;
};

export type BackupManifest = {
  /** Bu hedefe (HDD/klasör) özgü, kalıcı kimlik — disk harfine ASLA güvenilmez. */
  backup_target_id: string;
  backup_target_label?: string;
  created_at: string;
  updated_at: string;
  entries: BackupManifestEntry[];
};

export type BackupRunManifest = {
  backup_id: string;
  started_at: string;
  completed_at: string;
  manager_name: string;
  status: "completed" | "failed" | "incomplete";
  database_backed_up: boolean;
  r2_objects_total: number;
  r2_objects_new: number;
  r2_objects_changed: number;
  bytes_written: number;
};

// ── Backend yanıt tipleri (app/api/v1/routes/backup.py ile birebir) ─────────

export type ManifestDiffEntry = {
  key: string;
  size: number;
  last_modified: string;
  etag: string;
  download_url: string;
};

export type ManifestDiffResponse = {
  new: ManifestDiffEntry[];
  changed: ManifestDiffEntry[];
  unchanged_count: number;
  total_bytes: number;
};

export type BackupJob = {
  id: string;
  backup_target_id: string;
  backup_target_label: string | null;
  status: "running" | "completed" | "failed" | "incomplete";
  manager_name: string;
  started_at: string;
  completed_at: string | null;
  database_backed_up: boolean;
  r2_objects_new: number;
  r2_objects_changed: number;
  r2_objects_failed: number;
  bytes_written: number;
  error_message: string | null;
};

// ── İlerleme / orkestrasyon ──────────────────────────────────────────────────

export type BackupProgress = {
  phase: "checking" | "database" | "files" | "manifest" | "done" | "error";
  currentFile?: string;
  filesTotal: number;
  filesDone: number;
  bytesTotal: number;
  bytesDone: number;
  message?: string;
};

export type BackupPlan = {
  isNewTarget: boolean;
  manifest: BackupManifest;
  diff: ManifestDiffResponse;
};
