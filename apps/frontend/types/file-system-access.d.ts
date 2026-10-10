// TypeScript'in lib.dom.d.ts'i FileSystemDirectoryHandle/FileSystemFileHandle/
// FileSystemWritableFileStream arayüzlerini zaten içeriyor — eksik olan tek
// şey giriş noktası: window.showDirectoryPicker(). Yalnızca Chrome/Edge
// masaüstünde mevcuttur (File System Access API); yerel yedekleme sistemi
// bunu feature-detect ederek kullanır (bkz. lib/backup/fsAccess.ts).

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?:
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos"
    | FileSystemHandle;
}

interface Window {
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}

// lib.dom.d.ts, FileSystemHandle üzerinde queryPermission/requestPermission'ı
// henüz tanımlamıyor (bunlar da WICG File System Access uzantısı) — izin
// doğrulaması (fsAccess.ts: verifyReadWritePermission) için gerekli.
interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
