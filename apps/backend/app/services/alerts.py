"""Kendiliğinden giden uyarılar: geciken iş, yarın terminli iş, kritik stok, kritik saha raporu.

Hepsi mevcut bildirim altyapısını (zil + telefon bildirimi, ``app.core.notifications.notify``)
kullanır. Her olay için uyarı yalnızca bir kez gönderilir: geciken ve yarın terminli
işlerde aynı kategoride, aynı iş emrine ait bir bildirim zaten varsa yenisi oluşturulmaz.

Geciken / yarın terminli kontrolü API içinde 30 dakikada bir çalışan bir arka plan
döngüsüdür (``start_alert_loop``); program kapalıyken kontrol yapılmaz, açıldığında
birikenler ilk turda gönderilir.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.notifications import notify
from app.db.models import InstallationProject, InstallationProjectStage, Notification, User, WorkOrder, utc_now
from app.services.retail_stock_service import format_quantity

logger = logging.getLogger("okur.alerts")

MANAGER_ROLES = {"admin", "manager"}
CLOSED_STATUSES = {"completed", "approved", "cancelled", "failed"}
CHECK_INTERVAL_SECONDS = 30 * 60
FIRST_CHECK_DELAY_SECONDS = 60
# Türkiye 2016'dan beri yaz saati uygulamıyor; sabit UTC+3 (sunucuda saat dilimi verisi gerekmez).
LOCAL_TZ = timezone(timedelta(hours=3))

OVERDUE = "work_order_overdue"
DUE_TOMORROW = "work_order_due_tomorrow"
STOCK_CRITICAL = "stock_critical"
CRITICAL_REPORT = "work_order_critical_report"
STAGE_OVERDUE = "project_stage_overdue"


def _today() -> date:
    """Termin günleri Türkiye takvimine göre değerlendirilir."""
    return datetime.now(timezone.utc).astimezone(LOCAL_TZ).date()


async def manager_ids(db: AsyncSession, tenant_id: UUID | None) -> set[UUID]:
    if tenant_id is None:
        return set()
    rows = await db.execute(select(User.id).where(
        User.tenant_id == tenant_id, User.is_active == True, User.default_role.in_(MANAGER_ROLES),  # noqa: E712
    ))
    return set(rows.scalars().all())


async def _already_sent(db: AsyncSession, category: str, work_order_id: UUID) -> bool:
    row = await db.execute(select(Notification.id).where(
        Notification.category == category, Notification.work_order_id == work_order_id,
    ).limit(1))
    return row.first() is not None


async def check_due_dates(db: AsyncSession) -> tuple[int, int]:
    """Geciken işler için yöneticilere + açana + teknisyene, yarın terminli işler için teknisyene uyarı."""
    today = _today()
    rows = await db.execute(select(WorkOrder).where(
        WorkOrder.due_date.is_not(None), WorkOrder.status.not_in(CLOSED_STATUSES),
    ))
    overdue = due_tomorrow = 0
    managers_by_tenant: dict[UUID | None, set[UUID]] = {}
    for wo in rows.scalars().all():
        due = wo.due_date.date()
        if due < today and not await _already_sent(db, OVERDUE, wo.id):
            if wo.tenant_id not in managers_by_tenant:
                managers_by_tenant[wo.tenant_id] = await manager_ids(db, wo.tenant_id)
            recipients = managers_by_tenant[wo.tenant_id] | {wo.created_by, wo.assigned_to_user_id}
            days = (today - due).days
            for user_id in recipients - {None}:
                await notify(
                    db, user_id=user_id, tenant_id=wo.tenant_id, work_order_id=wo.id, category=OVERDUE,
                    title="İş emri gecikti",
                    body=f"{wo.title} — termin {due.strftime('%d.%m.%Y')}, {days} gün gecikti"
                         f"{f' ({wo.assigned_to_name})' if wo.assigned_to_name else ''}.",
                )
            overdue += 1
        elif due == today + timedelta(days=1) and wo.assigned_to_user_id and not await _already_sent(db, DUE_TOMORROW, wo.id):
            await notify(
                db, user_id=wo.assigned_to_user_id, tenant_id=wo.tenant_id, work_order_id=wo.id,
                category=DUE_TOMORROW, title="Yarın terminli iş",
                body=f"{wo.title} — termin yarın ({due.strftime('%d.%m.%Y')}).",
            )
            due_tomorrow += 1
    await db.commit()
    await check_project_stages(db, today, managers_by_tenant)
    return overdue, due_tomorrow


async def check_project_stages(db: AsyncSession, today: date, managers_by_tenant: dict) -> int:
    """Planlanan bitişi geçmiş, kapanmamış proje aşamaları için yöneticilere + aşama sorumlusuna bir kez uyarı."""
    rows = await db.execute(
        select(InstallationProjectStage, InstallationProject)
        .join(InstallationProject, InstallationProject.id == InstallationProjectStage.project_id)
        .where(InstallationProject.status == "active", InstallationProjectStage.status != "completed",
               InstallationProjectStage.planned_end.is_not(None), InstallationProjectStage.overdue_notified_at.is_(None))
    )
    sent = 0
    for stage, project in rows.all():
        due = stage.planned_end.date()
        if due >= today:
            continue
        if project.tenant_id not in managers_by_tenant:
            managers_by_tenant[project.tenant_id] = await manager_ids(db, project.tenant_id)
        for user_id in managers_by_tenant[project.tenant_id] | {stage.responsible_user_id} - {None}:
            await notify(
                db, user_id=user_id, tenant_id=project.tenant_id, category=STAGE_OVERDUE,
                title="Proje aşaması gecikti",
                body=f"{project.name} — {stage.name}: planlanan bitiş {due.strftime('%d.%m.%Y')}, {(today - due).days} gün gecikti.",
            )
        stage.overdue_notified_at = utc_now()
        sent += 1
    await db.commit()
    return sent


async def notify_stock_critical(
    db: AsyncSession, *, tenant_id: UUID | None, material_name: str, unit: str,
    before: Decimal, after: Decimal, min_stock: Decimal | None,
) -> None:
    """Ana depoda miktar kritik eşiğe ilk kez indiğinde yöneticilere uyarı (eşiğin üstünden altına geçiş)."""
    if not min_stock or min_stock <= 0 or not (before > min_stock >= after):
        return
    for user_id in await manager_ids(db, tenant_id):
        await notify(
            db, user_id=user_id, tenant_id=tenant_id, category=STOCK_CRITICAL,
            title="Kritik stok",
            body=f"{material_name}: ana depoda {format_quantity(after)} {unit} kaldı (kritik eşik {format_quantity(min_stock)} {unit}).",
        )


async def notify_critical_report(
    db: AsyncSession, *, work_order: WorkOrder, actor: User, report_title: str, already_notified: set[UUID],
) -> None:
    """Kritik saha raporu tüm yöneticilere gider (işi açan dışındakiler de haberdar olsun)."""
    recipients = await manager_ids(db, work_order.tenant_id) - already_notified - {actor.id}
    for user_id in recipients:
        await notify(
            db, user_id=user_id, tenant_id=work_order.tenant_id, work_order_id=work_order.id,
            category=CRITICAL_REPORT, title="Kritik saha raporu",
            body=f"{actor.full_name} — {work_order.title}: {report_title}",
        )


async def _loop() -> None:
    await asyncio.sleep(FIRST_CHECK_DELAY_SECONDS)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                overdue, due_tomorrow = await check_due_dates(db)
            if overdue or due_tomorrow:
                print(f"[uyarı] {overdue} geciken iş, {due_tomorrow} yarın terminli iş için bildirim gönderildi", flush=True)
        except Exception:  # noqa: BLE001 — uyarı kontrolü API'yi durdurmamalı
            logger.exception("Termin uyarı kontrolü başarısız")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


_task: asyncio.Task | None = None


def start_alert_loop() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop(), name="okur-due-date-alerts")
