# ─────────────────────────────────────────────────────────────────────────────
#  V1 — Bildirimler
# ─────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.db.models import Notification, User
from app.db.schemas import MessageResponse, NotificationRead, NotificationUnreadCount

router = APIRouter()


@router.get("", response_model=list[NotificationRead], tags=["notifications"])
async def list_notifications(
    limit: int = 30,
    db:    AsyncSession = Depends(get_db),
    user:  User         = Depends(get_current_user),
) -> list[Notification]:
    """Kullanıcının en son bildirimlerini getirir (en yeni önce)."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(min(limit, 100))
    )
    return list(result.scalars())


@router.get("/unread-count", response_model=NotificationUnreadCount, tags=["notifications"])
async def unread_count(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
) -> NotificationUnreadCount:
    result = await db.execute(
        select(func.count()).select_from(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
    )
    return NotificationUnreadCount(count=result.scalar_one())


@router.patch("/read-all", response_model=MessageResponse, tags=["notifications"])
async def mark_all_read(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
) -> MessageResponse:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()
    return MessageResponse(message="Tüm bildirimler okundu olarak işaretlendi.")


@router.patch("/{notification_id}/read", response_model=MessageResponse, tags=["notifications"])
async def mark_read(
    notification_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
) -> MessageResponse:
    notif = await db.get(Notification, notification_id)
    if not notif or notif.user_id != user.id:
        raise HTTPException(status_code=404, detail="Bildirim bulunamadı.")
    notif.is_read = True
    db.add(notif)
    await db.commit()
    return MessageResponse(message="Bildirim okundu olarak işaretlendi.")
