# ─────────────────────────────────────────────────────────────────────────────
#  V1 — Web Push (telefon bildirimi) cihaz abonelikleri
#
#  Bildirimin NE ZAMAN gittiği burada değil: app/core/notifications.notify()
#  her uygulama içi bildirimi aynı anda push'a da koyar. Bu router yalnızca
#  "bu cihaz bildirim alsın / almasın" kaydını tutar.
# ─────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.push import get_vapid_keys, send_push_to_user
from app.db.models import PushSubscription, User, utc_now
from app.db.schemas import MessageResponse

router = APIRouter()

_ALLOWED_PANELS = {"", "/manager", "/user"}


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=10, max_length=255)
    auth:   str = Field(min_length=10, max_length=255)


class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000)
    keys:     PushKeys
    panel:    str = ""


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000)


class PushPublicKey(BaseModel):
    public_key: str


class PushStatus(BaseModel):
    devices: int


class PushTestResult(BaseModel):
    sent:    int
    removed: int
    failed:  int


def _validate_endpoint(endpoint: str) -> None:
    # Sunucu bu adrese istek atacak — yalnızca gerçek push servislerinin
    # kullandığı https adresleri kabul edilir (iç ağ adreslerine istek
    # attırılmasını önler).
    parsed = urlparse(endpoint)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host or "." not in host or host == "localhost" or host.replace(".", "").isdigit():
        raise HTTPException(400, "Geçersiz bildirim adresi.")


@router.get("/public-key", response_model=PushPublicKey, tags=["push"])
async def public_key(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
) -> PushPublicKey:
    """Tarayıcının abonelik oluştururken kullanacağı VAPID açık anahtarı."""
    public, _private = await get_vapid_keys(db)
    return PushPublicKey(public_key=public)


@router.get("/status", response_model=PushStatus, tags=["push"])
async def status(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
) -> PushStatus:
    rows = await db.execute(select(PushSubscription.id).where(PushSubscription.user_id == user.id))
    return PushStatus(devices=len(rows.all()))


@router.post("/subscribe", response_model=MessageResponse, tags=["push"])
async def subscribe(
    payload: PushSubscribeRequest,
    request: Request,
    db:      AsyncSession = Depends(get_db),
    user:    User         = Depends(get_current_user),
) -> MessageResponse:
    """Bu cihazı oturumdaki kullanıcıya bağlar. Aynı cihazda başka bir hesap
    giriş yaparsa abonelik o hesaba geçer (cihaz başına tek sahip)."""
    _validate_endpoint(payload.endpoint)
    panel = payload.panel if payload.panel in _ALLOWED_PANELS else ""
    user_agent: Optional[str] = (request.headers.get("user-agent") or "")[:400] or None

    existing = (await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
    )).scalar_one_or_none()
    if existing:
        existing.user_id = user.id
        existing.tenant_id = user.tenant_id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        existing.panel = panel
        existing.user_agent = user_agent
    else:
        db.add(PushSubscription(
            user_id=user.id, tenant_id=user.tenant_id,
            endpoint=payload.endpoint, p256dh=payload.keys.p256dh, auth=payload.keys.auth,
            panel=panel, user_agent=user_agent, created_at=utc_now(),
        ))
    await db.commit()
    return MessageResponse(message="Bu cihazda bildirimler açıldı.")


@router.post("/unsubscribe", response_model=MessageResponse, tags=["push"])
async def unsubscribe(
    payload: PushUnsubscribeRequest,
    db:      AsyncSession = Depends(get_db),
    user:    User         = Depends(get_current_user),
) -> MessageResponse:
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    await db.commit()
    return MessageResponse(message="Bu cihazda bildirimler kapatıldı.")


@router.post("/test", response_model=PushTestResult, tags=["push"])
async def send_test(user: User = Depends(get_current_user)) -> PushTestResult:
    """Oturumdaki kullanıcının kendi cihazlarına deneme bildirimi gönderir."""
    result = await send_push_to_user(user.id, {
        "title": "SİSMİK bildirimleri açık",
        "body": "Bu cihaz iş emri bildirimlerini alacak.",
        "category": "test",
        "work_order_id": None,
    })
    return PushTestResult(**result)
