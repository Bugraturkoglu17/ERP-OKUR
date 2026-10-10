# ─────────────────────────────────────────────────────────────────────────────
#  Sismik Mekanik ERP — Object Storage Service
#  Implements S3-compatible interface for OCI Object Storage
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
import boto3
import re
import unicodedata
from datetime import datetime, timezone
from botocore.client import Config
from botocore.exceptions import ClientError
import os
from typing import AsyncIterator, Iterator, Optional, TypedDict
from urllib.parse import quote

from app.core.config import settings


class StorageObjectInfo(TypedDict):
    """Tek bir depolanan objenin (R2/yerel) kimliği — yedekleme sistemi bunu kullanır."""

    key: str
    size: int
    etag: str
    last_modified: str  # ISO 8601


def get_local_upload_dir() -> str:
    """Return a durable, user-writable directory for development uploads."""
    configured = os.getenv("OKUR_LOCAL_UPLOAD_DIR", "").strip()
    if configured:
        return os.path.abspath(os.path.expanduser(configured))
    if os.name == "nt" and os.getenv("LOCALAPPDATA"):
        return os.path.join(os.environ["LOCALAPPDATA"], "OkurERP", "uploads")
    data_home = os.getenv("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(data_home, "okur-erp", "uploads")


def sanitize_filename(name: str) -> str:
    """
    Dosya adını ve path bileşenlerini güvenli ASCII slug'a dönüştürür.
    Emoji, Türkçe özel karakter, boşluk temizlenir.
    Örnek: '📁 İZMİR ÇİĞLİ.pdf' → 'izmir-cigli.pdf'
    """
    # Emoji ve unicode symbol karakterlerini kaldır
    name = "".join(c for c in name if unicodedata.category(c) not in ("So", "Sm", "Sk", "Sc", "Cs", "Co", "Cn"))
    # Türkçe karakterleri ASCII karşılıklarıyla değiştir
    tr_map = str.maketrans("çğıiöşüÇĞIİÖŞÜ", "cgiisosCGIIOSU")
    name = name.translate(tr_map)
    # NFD normalize → ASCII olmayan karakterleri at
    name = unicodedata.normalize("NFD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    # Nokta öncesi ve sonrası kısmı ayır (extension koru)
    parts = name.rsplit(".", 1)
    stem = parts[0]
    ext = ("." + parts[1].lower()) if len(parts) == 2 else ""
    # Güvenli olmayan karakterleri tire yap, çoklu tireyi tek yap
    stem = re.sub(r"[^\w\-]", "-", stem)
    stem = re.sub(r"-{2,}", "-", stem).strip("-")
    stem = stem or "file"
    return stem + ext

class StorageService:
    """
    Sismik Mekanik ERP'nin döküman ve çizimlerini OCI Object Storage'da yönetir.
    Boto3 (S3 API) kullanılarak implement edilmiştir.
    Eğer bulut kimlik bilgileri eksikse, otomatik olarak yerel dosya sistemine (Local Storage Fallback) geçer.
    """

    def __init__(self):
        self.bucket_name = settings.OCI_BUCKET_NAME
        self.endpoint_url = str(settings.OCI_ENDPOINT) if settings.OCI_ENDPOINT else None
        
        # Development her zaman yerel depolama kullanir. Boylece gelistirme
        # makinesinde kalmis bulut anahtarlari test dosyalarini production
        # kovasina yonlendiremez. Production ise gecerli kimlik bilgileri ister.
        self.local_mode = settings.is_development or not settings.AWS_ACCESS_KEY_ID

        if self.local_mode and settings.is_production:
            raise RuntimeError("Object storage credentials are required in production.")
        
        if self.local_mode:
            print("[WARN] OCI Object Storage credentials missing! Running in LOCAL FALLBACK mode.")
            self.local_base_dir = get_local_upload_dir()
            os.makedirs(self.local_base_dir, exist_ok=True)
            # Okur uploads are isolated. Legacy Sismik files are never copied
            # at startup.
            self.s3_client = None
        else:
            try:
                self.s3_client = boto3.client(
                    "s3",
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    endpoint_url=self.endpoint_url,
                    region_name=settings.OCI_REGION,
                    config=Config(signature_version="s3v4"),
                )
            except Exception as e:
                if settings.is_production:
                    raise RuntimeError("Object storage could not be initialized in production.") from e
                print(f"[WARN] Failed to init boto3 client: {e}. Falling back to local storage.")
                self.local_mode = True
                self.local_base_dir = get_local_upload_dir()
                os.makedirs(self.local_base_dir, exist_ok=True)
                self.s3_client = None

    async def upload_file(self, file_content: bytes, file_key: str, content_type: str) -> str:
        """
        Dosyayı buluta veya yerel depolama alanına yükler.
        """
        if self.local_mode:
            try:
                target_path = os.path.join(self.local_base_dir, file_key)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with open(target_path, "wb") as f:
                    f.write(file_content)
                print(f"[INFO] Local file stored: {target_path}", flush=True)
                return file_key
            except Exception as e:
                print(f"Local Storage Write Error: {e}")
                raise IOError(f"Yerel depolama alanına yazılırken hata oluştu: {e}")
        else:
            try:
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=file_key,
                    Body=file_content,
                    ContentType=content_type,
                )
                return file_key
            except ClientError as e:
                print(f"S3 Upload Error: {e}")
                raise IOError(f"Dosya yüklenirken hata oluştu: {e}")

    async def generate_presigned_url(
        self,
        file_key: str,
        expires_in: int = 3600,
        download_name: Optional[str] = None,
    ) -> str:
        """
        Dosyaya erişim için imzalı URL veya yerel statik servis URL'si oluşturur.
        """
        if self.local_mode:
            # Yerel statik adresi dön (FastAPI StaticFiles Mount)
            return f"http://localhost:8001/static/uploads/{file_key}"
        else:
            try:
                params = {"Bucket": self.bucket_name, "Key": file_key}
                if download_name:
                    ascii_name = sanitize_filename(download_name)
                    encoded_name = quote(download_name, safe="")
                    params["ResponseContentDisposition"] = (
                        f'attachment; filename="{ascii_name}"; '
                        f"filename*=UTF-8''{encoded_name}"
                    )
                url = self.s3_client.generate_presigned_url(
                    "get_object",
                    Params=params,
                    ExpiresIn=expires_in,
                )
                return url
            except ClientError as e:
                print(f"S3 Presigned URL Error: {e}")
                raise IOError(f"Erişim URL'si oluşturulamadı: {e}")

    def _iter_local_objects(self, prefix: Optional[str]) -> Iterator[StorageObjectInfo]:
        base = self.local_base_dir
        walk_root = os.path.join(base, prefix) if prefix else base
        if not os.path.isdir(walk_root):
            return
        for dirpath, _dirnames, filenames in os.walk(walk_root):
            for name in filenames:
                full = os.path.join(dirpath, name)
                key = os.path.relpath(full, base).replace(os.sep, "/")
                try:
                    stat = os.stat(full)
                except OSError:
                    continue
                yield StorageObjectInfo(
                    key=key,
                    size=stat.st_size,
                    # Yerel modda gerçek S3 ETag'i yok — mtime+size'dan türetilmiş
                    # kararlı bir "değişti mi" imzası kullanılır (yedekleme diff'i
                    # için yeterli; R2'deki gerçek ETag/checksum'un yerini TUTMAZ).
                    etag=f"local-{int(stat.st_mtime)}-{stat.st_size}",
                    last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                )

    def _list_objects_sync(self, prefix: Optional[str]) -> list[StorageObjectInfo]:
        """Senkron (boto3) obje listeleme — asyncio.to_thread ile sarmalanır."""
        if self.local_mode:
            return list(self._iter_local_objects(prefix))
        results: list[StorageObjectInfo] = []
        paginator = self.s3_client.get_paginator("list_objects_v2")
        kwargs = {"Bucket": self.bucket_name}
        if prefix:
            kwargs["Prefix"] = prefix
        try:
            for page in paginator.paginate(**kwargs):
                for obj in page.get("Contents", []):
                    results.append(
                        StorageObjectInfo(
                            key=obj["Key"],
                            size=obj["Size"],
                            etag=obj["ETag"].strip('"'),
                            last_modified=obj["LastModified"].isoformat(),
                        )
                    )
        except ClientError as e:
            print(f"S3 List Objects Error: {e}")
            raise IOError(f"Depolama listesi alınamadı: {e}")
        return results

    async def list_objects(self, prefix: Optional[str] = None) -> list[StorageObjectInfo]:
        """
        Bucket'taki (veya yerel fallback dizinindeki) TÜM objeleri listeler.
        Yedekleme sisteminin canlı R2 durumunu öğrenmesi için birincil kaynak —
        hiçbir DB tablosuna güvenmez (bazı tablolar yalnızca presigned URL
        snapshot'ı tutuyor, gerçek object key değil).
        """
        return await asyncio.to_thread(self._list_objects_sync, prefix)

    async def open_object_stream(
        self, file_key: str, chunk_size: int = 256 * 1024
    ) -> Optional[tuple[int, AsyncIterator[bytes]]]:
        """
        Bir objeyi (boyut, chunk iteratörü) olarak açar — dosyanın tamamı asla
        RAM'e alınmaz. Obje yoksa None. Yedekleme sistemi dosyaları bu yolla
        backend üzerinden akıtır; böylece tarayıcının doğrudan R2'ye gitmesi
        (ve R2 bucket'ında CORS kuralı olması) gerekmez.
        """
        if self.local_mode:
            base = os.path.realpath(self.local_base_dir)
            target_path = os.path.realpath(os.path.join(base, file_key))
            # "../" ile yerel yükleme klasörünün dışına çıkılmasını engelle.
            if os.path.commonpath([base, target_path]) != base or not os.path.isfile(target_path):
                return None
            size = os.path.getsize(target_path)

            async def _iter_local() -> AsyncIterator[bytes]:
                fh = await asyncio.to_thread(open, target_path, "rb")
                try:
                    while True:
                        chunk = await asyncio.to_thread(fh.read, chunk_size)
                        if not chunk:
                            break
                        yield chunk
                finally:
                    await asyncio.to_thread(fh.close)

            return size, _iter_local()

        def _get():
            try:
                return self.s3_client.get_object(Bucket=self.bucket_name, Key=file_key)
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                    return None
                print(f"S3 Get Object Error: {e}")
                raise IOError(f"Obje okunamadı: {e}")

        resp = await asyncio.to_thread(_get)
        if resp is None:
            return None
        body = resp["Body"]

        async def _iter_s3() -> AsyncIterator[bytes]:
            try:
                while True:
                    chunk = await asyncio.to_thread(body.read, chunk_size)
                    if not chunk:
                        break
                    yield chunk
            finally:
                await asyncio.to_thread(body.close)

        return int(resp["ContentLength"]), _iter_s3()

    async def head_object(self, file_key: str) -> Optional[StorageObjectInfo]:
        """Tek bir objenin güncel boyut/ETag bilgisini döner (bütünlük doğrulama için). Yoksa None."""
        if self.local_mode:
            target_path = os.path.join(self.local_base_dir, file_key)
            try:
                stat = os.stat(target_path)
            except OSError:
                return None
            return StorageObjectInfo(
                key=file_key,
                size=stat.st_size,
                etag=f"local-{int(stat.st_mtime)}-{stat.st_size}",
                last_modified=__import__("datetime").datetime.fromtimestamp(
                    stat.st_mtime, tz=__import__("datetime").timezone.utc
                ).isoformat(),
            )

        def _head() -> Optional[StorageObjectInfo]:
            try:
                resp = self.s3_client.head_object(Bucket=self.bucket_name, Key=file_key)
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                    return None
                print(f"S3 Head Object Error: {e}")
                raise IOError(f"Obje bilgisi alınamadı: {e}")
            return StorageObjectInfo(
                key=file_key,
                size=resp["ContentLength"],
                etag=resp["ETag"].strip('"'),
                last_modified=resp["LastModified"].isoformat(),
            )

        return await asyncio.to_thread(_head)

    async def delete_file(self, file_key: str) -> bool:
        """
        Dosyayı fiziksel olarak siler.
        """
        if self.local_mode:
            try:
                target_path = os.path.join(self.local_base_dir, file_key)
                if os.path.exists(target_path):
                    os.remove(target_path)
                    print(f"[INFO] Local file deleted: {target_path}", flush=True)
                return True
            except Exception as e:
                print(f"Local Delete Error: {e}")
                return False
        else:
            try:
                self.s3_client.delete_object(Bucket=self.bucket_name, Key=file_key)
                return True
            except ClientError as e:
                print(f"S3 Delete Error: {e}")
                return False

# Singleton instance
storage = StorageService()
