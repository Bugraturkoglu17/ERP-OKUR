# ─────────────────────────────────────────────────────────────────────────────
#  V1 — Firma Kontrollü Yerel Yedekleme Sistemi
#
#  YÖNETİCİ (DB rolü "admin") VE Geliştirici Admin (platform_admin) erişebilir —
#  USER erişemez. Geliştirici Admin dahil edilmesi bilinçli bir üründe kararı:
#  Admin, Yönetici Görünümü'ne geçtiğinde fiilen bir Yönetici gibi çalışabilmeli
#  (bkz. Panel Görünümü anahtarı — frontend'de ayrı bir "mod" tutmuyor, aynı JWT
#  ile /manager/* rotalarını geziyor). `require_role("admin", "platform_admin")`
#  kullanılır; yalnızca USER (bu iki rolden hiçbiri) 403 alır.
#
#  Bu router:
#   - Neon PostgreSQL'e veya R2/OCI depolamaya hiçbir YIKICI işlem yapmaz
#     (yalnızca SELECT/list/head/dump — okuma).
#   - R2 secret'larını hiçbir zaman istemciye göndermez; dosyalar yetki
#     kontrollü /backup/object endpoint'i üzerinden backend'den akar
#     (tarayıcı R2'ye doğrudan gitmez → bucket'ta CORS kuralı gerekmez).
#   - "Son backup" durumunu incremental karar mekanizması için KULLANMAZ —
#     karşılaştırma tamamen istemcinin gönderdiği manifest'e göre yapılır
#     (her yedekleme hedefi kendi zincirini taşır). BackupRun tablosu yalnızca
#     Yönetici panelindeki hatırlatma/geçmiş ekranı için tutulur.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
import shutil
from datetime import datetime, timezone
from typing import AsyncIterator, Literal, Optional
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.backup_lock import acquire_lock, release_lock
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.storage import storage
from app.db.models import BackupRun, User

router = APIRouter()

# pg_dump için ayrı, senkron subprocess DSN'i — asyncpg pool'undan bağımsız
# (Neon scale-to-zero olduğundan, uzun süren dump işlemi paylaşılan pool'u
# tıkamamalı). Şema/DB adı değişmez, yalnızca driver'ı "postgresql" yapılır.
_PG_DUMP_DSN = make_url(str(settings.DATABASE_URL)).set(drivername="postgresql").render_as_string(hide_password=False)


# ═══════════════════════════════════════════════════════════════════════════════
# Şemalar
# ═══════════════════════════════════════════════════════════════════════════════

class ManifestEntryIn(BaseModel):
    key: str
    etag: str
    size: int


class ManifestDiffRequest(BaseModel):
    entries: list[ManifestEntryIn] = []


class ManifestDiffEntry(BaseModel):
    key: str
    size: int
    last_modified: str
    etag: str
    download_url: str


class ManifestDiffResponse(BaseModel):
    new: list[ManifestDiffEntry]
    changed: list[ManifestDiffEntry]
    unchanged_count: int
    total_bytes: int


class BackupJobStartRequest(BaseModel):
    backup_target_id: str
    backup_target_label: Optional[str] = None


class BackupJobRead(BaseModel):
    id: UUID
    backup_target_id: str
    backup_target_label: Optional[str]
    status: str
    manager_name: str
    started_at: datetime
    completed_at: Optional[datetime]
    database_backed_up: bool
    r2_objects_new: int
    r2_objects_changed: int
    r2_objects_failed: int
    bytes_written: int
    error_message: Optional[str]


class BackupJobCompleteRequest(BaseModel):
    status: Literal["completed", "failed", "incomplete"]
    database_backed_up: bool = False
    r2_objects_new: int = 0
    r2_objects_changed: int = 0
    r2_objects_failed: int = 0
    bytes_written: int = 0
    error_message: Optional[str] = None


def _lock_keys(backup_target_id: str, manager_id: UUID) -> tuple[str, str]:
    return f"backup:target:{backup_target_id}", f"backup:manager:{manager_id}:active"


# ═══════════════════════════════════════════════════════════════════════════════
# Manifest karşılaştırma — incremental kararın TEK kaynağı
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/manifest-diff", response_model=ManifestDiffResponse, tags=["backup"])
async def manifest_diff(
    payload: ManifestDiffRequest,
    manager: User = Depends(require_role("admin", "platform_admin")),
) -> ManifestDiffResponse:
    """
    İstemcinin seçtiği HDD/klasördeki backup-index.json'dan okuduğu obje
    listesini (key/etag/size) CANLI depolama (R2/yerel) durumuyla karşılaştırır.
    Boş bir liste gönderilirse (yeni/boş klasör) TÜM objeler "new" döner —
    bu, "yeni HDD → tam yedek" akışının (madde 5) temelidir.
    """
    known = {e.key: e for e in payload.entries}
    live_objects = await storage.list_objects()

    new: list[ManifestDiffEntry] = []
    changed: list[ManifestDiffEntry] = []
    unchanged_count = 0
    total_bytes = 0

    for obj in live_objects:
        prior = known.get(obj["key"])
        needs_download = prior is None or prior.etag != obj["etag"] or prior.size != obj["size"]
        if not needs_download:
            unchanged_count += 1
            continue
        entry = ManifestDiffEntry(
            key=obj["key"],
            size=obj["size"],
            last_modified=obj["last_modified"],
            etag=obj["etag"],
            # API'ye göreli yol (frontend buildApiUrl ile tamamlar). Tarayıcı
            # R2'ye doğrudan gitmez — dosya /backup/object üzerinden akar; R2
            # bucket'ında CORS kuralı gerekmez ve süresi dolan presigned URL
            # yüzünden "Tekrar Dene" bozulmaz.
            download_url=f"/backup/object?key={quote(obj['key'], safe='')}",
        )
        total_bytes += obj["size"]
        (new if prior is None else changed).append(entry)

    return ManifestDiffResponse(new=new, changed=changed, unchanged_count=unchanged_count, total_bytes=total_bytes)


@router.get("/object", tags=["backup"])
async def backup_object(
    key: str = Query(..., min_length=1),
    manager: User = Depends(require_role("admin", "platform_admin")),
) -> StreamingResponse:
    """
    Tek bir depolama objesini (R2/yerel) backend üzerinden chunk chunk stream
    eder — salt okunur. Content-Length gönderilir; istemci yazdığı byte
    sayısını manifest-diff'teki boyutla karşılaştırarak eksik indirmeyi yakalar.
    """
    try:
        opened = await storage.open_object_stream(key)
    except IOError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if opened is None:
        raise HTTPException(status_code=404, detail="Obje bulunamadı.")
    size, chunks = opened
    return StreamingResponse(
        chunks,
        media_type="application/octet-stream",
        headers={"Content-Length": str(size)},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Veritabanı — her koşuda FULL logical dump (madde 11, incremental YOK)
# ═══════════════════════════════════════════════════════════════════════════════

async def _stream_pg_dump(proc: "asyncio.subprocess.Process", first_chunk: bytes) -> AsyncIterator[bytes]:
    """proc ÖNCEDEN başlatılmış ve ilk chunk'ı okunmuş olmalı (bkz.
    database_dump) — böylece hem başlatma hatası hem de pg_dump'ın hiç veri
    üretmeden çıkması, stream istemciye açılmadan ÖNCE temiz bir HTTP
    hatasına dönüşebilir; başladıktan sonra Starlette'in body_iterator'ında
    oluşan bir istisna bağlantıyı sessizce/eksik kapatır (IncompleteRead)."""
    assert proc.stdout is not None
    try:
        yield first_chunk
        while True:
            chunk = await proc.stdout.read(256 * 1024)
            if not chunk:
                break
            yield chunk
    finally:
        return_code = await proc.wait()
        if return_code != 0:
            stderr = await proc.stderr.read() if proc.stderr else b""
            # Stream başladıktan sonra istemciye ayrı bir HTTP hata kodu
            # dönülemez — istemci dump boyutunu doğrulayarak (madde 30) eksik/
            # bozuk dosyayı kendi tarafında tespit eder. Sunucu logu için yazılır.
            # Konsol codepage'i (Windows) stderr içindeki bazı karakterleri
            # (örn. U+FFFD) basamayabilir — bir logging satırı asla bağlantı
            # kapanışını (finally) BOZMASIN diye tamamen ayrıştırılmış olarak yazılır.
            try:
                safe_stderr = stderr.decode("utf-8", errors="replace").encode("ascii", errors="replace").decode("ascii")
                print(f"[ERROR] pg_dump basarisiz (code={return_code}): {safe_stderr[:2000]}")
            except Exception:
                pass


@router.get("/database-dump", tags=["backup"])
async def database_dump(manager: User = Depends(require_role("admin", "platform_admin"))) -> StreamingResponse:
    """Neon PostgreSQL'in FULL logical dump'ını (pg_dump --format=custom) chunk chunk stream eder. Salt okunur — hiçbir DDL/DML çalıştırmaz."""
    if shutil.which(settings.PG_DUMP_PATH) is None:
        raise HTTPException(
            status_code=503,
            detail="Sunucuda pg_dump bulunamadı. Backend imajına PostgreSQL istemcisi kurulmalı.",
        )
    # Süreç, StreamingResponse başlamadan ÖNCE burada başlatılır — böylece
    # başlatma hatası (örn. Windows'ta yerel geliştirmede asyncio
    # SelectorEventLoop'un subprocess desteklememesi; Linux prod container'da
    # bu kısıt yoktur) yarım kalmış bir stream yerine temiz bir HTTP hatası olur.
    try:
        # DSN EN SONDA olmalı — bu pg_dump build'inin argüman ayrıştırıcısı,
        # bağlantı dizesi ilk pozisyonel argüman olunca sonraki --flag'leri
        # "fazladan pozisyonel argüman" sanıp hata veriyor (gerçek testte
        # bulundu: "çok fazla komut satırı argümanı (ilki '--format=custom')").
        proc = await asyncio.create_subprocess_exec(
            settings.PG_DUMP_PATH,
            "--format=custom",
            "--no-owner",
            "--no-privileges",
            _PG_DUMP_DSN,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except NotImplementedError:
        raise HTTPException(
            status_code=503,
            detail="Bu sunucu ortamı alt-süreç başlatmayı desteklemiyor (yalnızca yerel Windows geliştirmede görülür; production Linux ortamında bu kısıt yoktur).",
        )
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"pg_dump başlatılamadı: {exc}")

    # pg_dump bağlantı/sürüm hatalarında (örn. "server version mismatch")
    # stdout'a HİÇ yazmadan çıkar. İlk chunk'ı stream açılmadan önce okuyarak
    # bu durumu boş bir "200 OK" yerine gerçek hata mesajıyla dönüyoruz.
    assert proc.stdout is not None
    first_chunk = await proc.stdout.read(256 * 1024)
    if not first_chunk:
        return_code = await proc.wait()
        stderr = await proc.stderr.read() if proc.stderr else b""
        message = stderr.decode("utf-8", errors="replace").strip()
        # DSN'i (şifre içerir) asla istemciye sızdırma.
        message = message.replace(_PG_DUMP_DSN, "<DATABASE_URL>")[:500]
        try:
            safe = message.encode("ascii", errors="replace").decode("ascii")
            print(f"[ERROR] pg_dump basarisiz (code={return_code}): {safe}")
        except Exception:
            pass
        raise HTTPException(
            status_code=502,
            detail=f"Veritabanı yedeği alınamadı (pg_dump çıkış kodu {return_code}): {message or 'bilinmeyen hata'}",
        )

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
    filename = f"okur_db_{ts}.dump"
    return StreamingResponse(
        _stream_pg_dump(proc, first_chunk),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Yedekleme koşuları — yalnızca denetim/hatırlatma amaçlı (madde 8 ile çelişmez)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/jobs", response_model=BackupJobRead, status_code=201, tags=["backup"])
async def start_backup_job(
    payload: BackupJobStartRequest,
    db:      AsyncSession = Depends(get_db),
    manager: User         = Depends(require_role("admin", "platform_admin")),
) -> BackupRun:
    """
    Yeni bir yedekleme koşusu başlatır. Aynı hedef için ya da aynı yönetici
    için zaten devam eden bir koşu varsa 409 döner (madde 26/27).
    """
    target_lock, manager_lock = _lock_keys(payload.backup_target_id, manager.id)

    if not await acquire_lock(target_lock, settings.BACKUP_LOCK_TTL_SECONDS):
        raise HTTPException(status_code=409, detail="Bu hedef için bir yedekleme işlemi devam ediyor.")
    if not await acquire_lock(manager_lock, settings.BACKUP_LOCK_TTL_SECONDS):
        await release_lock(target_lock)
        raise HTTPException(status_code=409, detail="Zaten devam eden bir yedekleme işleminiz var.")

    run = BackupRun(
        id=uuid4(),
        tenant_id=manager.tenant_id,
        manager_user_id=manager.id,
        manager_name=manager.full_name,
        backup_target_id=payload.backup_target_id,
        backup_target_label=payload.backup_target_label,
        status="running",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


@router.patch("/jobs/{job_id}", response_model=BackupJobRead, tags=["backup"])
async def complete_backup_job(
    job_id:  UUID,
    payload: BackupJobCompleteRequest,
    db:      AsyncSession = Depends(get_db),
    manager: User         = Depends(require_role("admin", "platform_admin")),
) -> BackupRun:
    """
    Yedekleme koşusunu kapatır (frontend bildirir — asıl bütünlük doğrulaması
    istemci tarafında yapılmıştır, madde 30) ve kilitlerini serbest bırakır.
    """
    run = await db.get(BackupRun, job_id)
    if not run or run.manager_user_id != manager.id:
        raise HTTPException(status_code=404, detail="Yedekleme koşusu bulunamadı.")

    run.status = payload.status
    run.database_backed_up = payload.database_backed_up
    run.r2_objects_new = payload.r2_objects_new
    run.r2_objects_changed = payload.r2_objects_changed
    run.r2_objects_failed = payload.r2_objects_failed
    run.bytes_written = payload.bytes_written
    run.error_message = payload.error_message
    run.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(run)
    await db.commit()
    await db.refresh(run)

    target_lock, manager_lock = _lock_keys(run.backup_target_id, manager.id)
    await release_lock(target_lock)
    await release_lock(manager_lock)
    return run


@router.get("/jobs/recent", response_model=list[BackupJobRead], tags=["backup"])
async def recent_backup_jobs(
    limit:   int          = 20,
    db:      AsyncSession = Depends(get_db),
    manager: User         = Depends(require_role("admin", "platform_admin")),
) -> list[BackupRun]:
    """Yönetici panelindeki 'Yedek Geçmişi' + 'son başarılı yedek' hatırlatma banner'ı için."""
    query = select(BackupRun).order_by(BackupRun.started_at.desc()).limit(min(limit, 100))
    if manager.tenant_id is not None:
        query = query.where(BackupRun.tenant_id == manager.tenant_id)
    result = await db.execute(query)
    return list(result.scalars())
