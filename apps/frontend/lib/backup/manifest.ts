import { readJsonFile, writeJsonFile } from "@/lib/backup/fsAccess";
import type { BackupManifest, BackupManifestEntry } from "@/lib/backup/types";

const MANIFEST_FILE = "okur-backup-index.json";

function generateTargetId(): string {
  const rand = (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(16).slice(2)
  ).slice(0, 7);
  return `OKUR-BKP-TARGET-${rand.toUpperCase()}`;
}

/**
 * Seçilen klasördeki Okur'a özel manifest'i okur. Sismik manifest'i
 * tanınmaz; iki uygulamanın yedekleri birbirine karışmaz.
 */
export async function readManifest(root: FileSystemDirectoryHandle): Promise<BackupManifest | null> {
  return readJsonFile<BackupManifest>(root, MANIFEST_FILE);
}

export function createEmptyManifest(label?: string): BackupManifest {
  const now = new Date().toISOString();
  return {
    backup_target_id: generateTargetId(),
    backup_target_label: label,
    created_at: now,
    updated_at: now,
    entries: [],
  };
}

export async function writeManifest(root: FileSystemDirectoryHandle, manifest: BackupManifest): Promise<void> {
  await writeJsonFile(root, MANIFEST_FILE, manifest);
}

/** Yeni/değişen objeleri manifest'e ekler/günceller (key'e göre upsert). */
export function upsertManifestEntries(manifest: BackupManifest, entries: BackupManifestEntry[]): BackupManifest {
  const byKey = new Map(manifest.entries.map((e) => [e.key, e]));
  for (const entry of entries) byKey.set(entry.key, entry);
  return {
    ...manifest,
    updated_at: new Date().toISOString(),
    entries: Array.from(byKey.values()),
  };
}
