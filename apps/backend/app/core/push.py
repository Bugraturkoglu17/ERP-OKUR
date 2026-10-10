# ─────────────────────────────────────────────────────────────────────────────
#  Web Push — telefona/tarayıcıya anlık bildirim.
#
#  Akış:
#   1. notify() bir Notification satırı eklerken queue_push() ile aynı içeriği
#      oturumun "bekleyen push" listesine koyar.
#   2. İşlem veritabanına YAZILDIKTAN SONRA (after_commit) push gönderimi arka
#      planda başlar. İşlem geri alınırsa (rollback) hiçbir şey gönderilmez —
#      kullanıcı, var olmayan bir iş emri için bildirim almaz.
#   3. Gönderim isteği asla asıl isteği bekletmez/bozmaz: hatalar yalnızca loglanır.
#
#  VAPID anahtar çifti: ortam değişkeni verilmişse o kullanılır; verilmemişse
#  ilk kullanımda üretilip system_settings tablosunda saklanır (deploy'lar
#  arasında sabit kalmalı — değişirse tüm cihaz abonelikleri geçersiz olur).
# ─────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

import asyncio
import base64
import json
from typing import Any
from uuid import UUID

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import delete, event, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import PushSubscription, SystemSetting, utc_now

_VAPID_SETTING_KEY = "vapid_keypair"
_PENDING_KEY = "pending_push"
_LISTENERS_KEY = "push_listeners_attached"

_vapid_cache: tuple[str, str] | None = None
# create_task ile başlatılan görevler, referansı tutulmazsa GC tarafından
# yarıda toplanabilir — bitene kadar burada tutulur.
_background_tasks: set[asyncio.Task] = set()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _generate_vapid_keypair() -> tuple[str, str]:
    """(public, private) — ikisi de base64url. Public: sıkıştırılmamış P-256
    noktası (tarayıcının applicationServerKey'i); private: 32 baytlık skaler."""
    key = ec.generate_private_key(ec.SECP256R1())
    private_raw = key.private_numbers().private_value.to_bytes(32, "big")
    public_raw = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return _b64url(public_raw), _b64url(private_raw)


async def get_vapid_keys(db: AsyncSession) -> tuple[str, str]:
    """(public, private). Süreç ömrü boyunca bellekte tutulur."""
    global _vapid_cache
    if _vapid_cache:
        return _vapid_cache

    if settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY:
        _vapid_cache = (settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY)
        return _vapid_cache

    row = await db.get(SystemSetting, _VAPID_SETTING_KEY)
    if row is None:
        public, private = _generate_vapid_keypair()
        # İki süreç aynı anda üretirse yalnızca ilki yazılır; ikisi de aynı
        # satırı yeniden okur → herkes TEK bir anahtar çiftinde buluşur.
        await db.execute(
            pg_insert(SystemSetting)
            .values(key=_VAPID_SETTING_KEY, value=json.dumps({"public": public, "private": private}), updated_at=utc_now())
            .on_conflict_do_nothing(index_elements=["key"])
        )
        await db.commit()
        row = await db.get(SystemSetting, _VAPID_SETTING_KEY, populate_existing=True)

    data = json.loads(row.value)
    _vapid_cache = (data["public"], data["private"])
    return _vapid_cache


def _target_url(panel: str, work_order_id: str | None) -> str:
    """Bildirime tıklanınca açılacak sayfa. Frontend'deki zil bileşeninin
    (notification-bell.tsx › workOrderHref) kullandığı adreslerle AYNI olmalı:
    kullanıcı panelinde iş emri detayı /user/islerim/<id> altındadır."""
    if work_order_id:
        if panel == "/user":
            return f"/user/islerim/{work_order_id}"
        return f"{panel}/is-emirleri/{work_order_id}"
    return f"{panel}/dashboard" if panel else "/"


def _send_one(subscription_info: dict[str, Any], data: str, private_key: str) -> int | None:
    """Tek bir cihaza gönderir (bloklayan çağrı — thread'de çalıştırılır).
    Dönüş: None = başarılı; int = push servisinin HTTP hata kodu; -1 = ağ/diğer hata."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info=subscription_info,
            data=data,
            vapid_private_key=private_key,
            # pywebpush bu sözlüğe aud/exp ekler → her çağrıda YENİ sözlük.
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=settings.PUSH_TTL_SECONDS,
            timeout=10,
        )
        return None
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        return int(status) if status else -1
    except Exception:
        return -1


async def send_push_to_user(user_id: UUID, payload: dict[str, Any]) -> dict[str, int]:
    """Kullanıcının kayıtlı tüm cihazlarına gönderir. Kendi DB oturumunu açar
    (isteğin oturumu bu noktada kapanmış olabilir)."""
    result = {"sent": 0, "removed": 0, "failed": 0}
    # This local Okur copy must not notify devices registered in live Sismik.
    if settings.is_development:
        return result

    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        _public, private = await get_vapid_keys(db)
        subs = list((await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        )).scalars().all())
        if not subs:
            return result

        work_order_id = payload.get("work_order_id")

        async def deliver(sub: PushSubscription) -> tuple[PushSubscription, int | None]:
            body = json.dumps({**payload, "url": _target_url(sub.panel or "", work_order_id)}, ensure_ascii=False)
            info = {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}}
            return sub, await asyncio.to_thread(_send_one, info, body, private)

        ok_ids: list[UUID] = []
        dead_ids: list[UUID] = []
        for sub, status in await asyncio.gather(*(deliver(s) for s in subs)):
            if status is None:
                ok_ids.append(sub.id)
            elif status in (404, 410):
                # Cihaz aboneliği iptal etmiş / uygulama kaldırılmış.
                dead_ids.append(sub.id)
            else:
                result["failed"] += 1
                print(f"[WARN] push gonderilemedi (status={status}) user={user_id}", flush=True)

        if ok_ids:
            await db.execute(update(PushSubscription).where(PushSubscription.id.in_(ok_ids)).values(last_success_at=utc_now()))
        if dead_ids:
            await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead_ids)))
        if ok_ids or dead_ids:
            await db.commit()
        result["sent"], result["removed"] = len(ok_ids), len(dead_ids)
    return result


async def _send_safely(user_id: UUID, payload: dict[str, Any]) -> None:
    try:
        await send_push_to_user(user_id, payload)
    except Exception as exc:  # push asla asıl işlemi etkilemez
        print(f"[WARN] push hatasi user={user_id}: {type(exc).__name__}: {exc}", flush=True)


def _flush_after_commit(session) -> None:
    pending = session.info.pop(_PENDING_KEY, [])
    if not pending:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # event loop yok (örn. senkron betik) → push atlanır
    for user_id, payload in pending:
        task = loop.create_task(_send_safely(user_id, payload))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)


def _discard_after_rollback(session) -> None:
    session.info.pop(_PENDING_KEY, None)


def queue_push(db: AsyncSession, user_id: UUID, payload: dict[str, Any]) -> None:
    """Push'u, bu oturumun işlemi commit edildiğinde gönderilmek üzere sıraya koyar."""
    sync_session = db.sync_session
    if not sync_session.info.get(_LISTENERS_KEY):
        event.listen(sync_session, "after_commit", _flush_after_commit)
        event.listen(sync_session, "after_rollback", _discard_after_rollback)
        sync_session.info[_LISTENERS_KEY] = True
    sync_session.info.setdefault(_PENDING_KEY, []).append((user_id, payload))
