# ─────────────────────────────────────────────────────────────────────────────
#  Bildirim oluşturma yardımcı fonksiyonu — iş emri yaşam döngüsü ve benzeri
#  olaylarda çağrılır. Kendi commit'ini yapmaz; çağıranın mevcut DB session'ına
#  ekler, aynı transaction'ın parçası olur (bildirim, asıl işlemle birlikte
#  ya hep ya hiç kaydedilir).
# ─────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.push import queue_push
from app.db.models import Notification


async def notify(
    db: AsyncSession,
    *,
    user_id: UUID,
    category: str,
    title: str,
    body: str | None = None,
    tenant_id: UUID | None = None,
    work_order_id: UUID | None = None,
) -> None:
    db.add(Notification(
        user_id=user_id,
        tenant_id=tenant_id,
        category=category,
        title=title,
        body=body,
        work_order_id=work_order_id,
    ))
    # Aynı bildirim telefona da gider — ama yalnızca bu işlem commit edilirse
    # (bkz. app/core/push.py). Uygulama içi zil ile telefon bildirimi hep aynı
    # olaylardan beslenir; ayrı bir "push listesi" tutulmaz.
    queue_push(db, user_id, {
        "title": title,
        "body": body or "",
        "category": category,
        "work_order_id": str(work_order_id) if work_order_id else None,
    })
