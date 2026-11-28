"""Taşeron kartları.

Firma ünvanı ve cari bilgiler, yetkili kişi ve iletişim bilgileri ile yetkinlik göstergesi
(yeşil / sarı / kırmızı). Kartları yalnızca yöneticiler görür ve yönetir. Kart silinmez, pasife alınır.

İş yükü: iş emrine ve proje adımına taşeron atanır; kartta açık iş emri, devam eden proje ve en yakın termin görünür.
Puan: iş emri / proje adımı tamamlanınca yönetici 1–5 puan verir. Kartta ortalama görünür; puanı olan taşeronun
rengi ortalamadan hesaplanır (4 ve üstü yeşil, 3–4 sarı, 3 altı kırmızı), puanı yoksa elle seçilen renk geçerlidir.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field as SchemaField
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.core.text import upper_tr
from app.db.models import (
    InstallationProject, InstallationProjectStage, Subcontractor, SubcontractorRating, Tenant, User, WorkOrder, utc_now,
)

router = APIRouter()

COMPETENCY = {"yesil": "Yeşil", "sari": "Sarı", "kirmizi": "Kırmızı"}
CLOSED_WORK_ORDER = ("completed", "approved", "cancelled", "failed")
DONE_WORK_ORDER = ("completed", "approved")


def _color_from_score(avg: Optional[float]) -> Optional[str]:
    if avg is None:
        return None
    return "yesil" if avg >= 4 else "sari" if avg >= 3 else "kirmizi"
TEXT_FIELDS = (
    "company_name", "tax_office", "tax_number", "address", "city", "phone", "email", "iban",
    "contact_name", "contact_title", "contact_phone", "contact_email", "notes",
)
UPPER_FIELDS = {"company_name", "tax_office", "address", "city", "contact_name", "contact_title", "notes"}


def _require_manager(user: User) -> None:
    role = (user.default_role or "").lower()
    if not (is_platform_admin(user) or role in {"admin", "manager"}):
        raise HTTPException(403, "Taşeron kartlarını yalnızca yöneticiler kullanabilir.")


async def _tenant_id(db: AsyncSession, user: User) -> UUID:
    if user.tenant_id:
        return user.tenant_id
    tenants = (await db.execute(select(Tenant.id).where(Tenant.is_active == True).limit(2))).scalars().all()  # noqa: E712
    if len(tenants) != 1:
        raise HTTPException(409, "Admin için tek bir aktif firma seçili olmalıdır.")
    return tenants[0]


class SubcontractorBody(BaseModel):
    company_name: Optional[str] = SchemaField(default=None, min_length=2, max_length=255)
    tax_office: Optional[str] = SchemaField(default=None, max_length=120)
    tax_number: Optional[str] = SchemaField(default=None, max_length=32)
    address: Optional[str] = SchemaField(default=None, max_length=500)
    city: Optional[str] = SchemaField(default=None, max_length=80)
    phone: Optional[str] = SchemaField(default=None, max_length=40)
    email: Optional[str] = SchemaField(default=None, max_length=255)
    iban: Optional[str] = SchemaField(default=None, max_length=40)
    contact_name: Optional[str] = SchemaField(default=None, max_length=255)
    contact_title: Optional[str] = SchemaField(default=None, max_length=120)
    contact_phone: Optional[str] = SchemaField(default=None, max_length=40)
    contact_email: Optional[str] = SchemaField(default=None, max_length=255)
    competency: Optional[str] = None  # yesil | sari | kirmizi | "" (atanmadı)
    notes: Optional[str] = SchemaField(default=None, max_length=4000)
    is_active: Optional[bool] = None


def _row(item: Subcontractor, stats: Optional[dict] = None) -> dict:
    stats = stats or {}
    avg = stats.get("rating_avg")
    # Puanı olan taşeronda renk ortalamadan gelir; yoksa yöneticinin seçtiği renk.
    color = _color_from_score(avg) or item.competency
    return {
        "id": item.id, **{field: getattr(item, field) for field in TEXT_FIELDS},
        "competency": item.competency, "competency_label": COMPETENCY.get(item.competency or ""),
        "color": color, "color_from_rating": avg is not None,
        "rating_avg": round(avg, 1) if avg is not None else None, "rating_count": stats.get("rating_count", 0),
        "open_work_orders": stats.get("open_work_orders", 0), "active_projects": stats.get("active_projects", 0),
        "nearest_due": stats["nearest_due"].isoformat() if stats.get("nearest_due") else None,
        "is_active": item.is_active, "created_at": item.created_at.isoformat(), "updated_at": item.updated_at.isoformat(),
    }


async def _stats(db: AsyncSession, tenant_id: UUID) -> dict[UUID, dict]:
    """Taşeron başına iş yükü (açık iş emri, devam eden proje, en yakın termin) ve puan ortalaması."""
    out: dict[UUID, dict] = {}

    def entry(sub_id: UUID) -> dict:
        return out.setdefault(sub_id, {})

    def earlier(current: Optional[datetime], other: Optional[datetime]) -> Optional[datetime]:
        return min(d for d in (current, other) if d) if (current or other) else None

    for sub_id, count, due in (await db.execute(
        select(WorkOrder.subcontractor_id, func.count(WorkOrder.id), func.min(WorkOrder.due_date))
        .where(WorkOrder.tenant_id == tenant_id, WorkOrder.subcontractor_id.is_not(None),
               WorkOrder.status.not_in(CLOSED_WORK_ORDER))
        .group_by(WorkOrder.subcontractor_id))).all():
        e = entry(sub_id)
        e["open_work_orders"], e["nearest_due"] = count, earlier(e.get("nearest_due"), due)

    for sub_id, count, due in (await db.execute(
        select(InstallationProjectStage.subcontractor_id, func.count(func.distinct(InstallationProjectStage.project_id)),
               func.min(InstallationProjectStage.planned_end))
        .join(InstallationProject, InstallationProject.id == InstallationProjectStage.project_id)
        .where(InstallationProject.tenant_id == tenant_id, InstallationProject.status == "active",
               InstallationProjectStage.subcontractor_id.is_not(None), InstallationProjectStage.status != "completed")
        .group_by(InstallationProjectStage.subcontractor_id))).all():
        e = entry(sub_id)
        e["active_projects"], e["nearest_due"] = count, earlier(e.get("nearest_due"), due)

    for sub_id, avg, count in (await db.execute(
        select(SubcontractorRating.subcontractor_id, func.avg(SubcontractorRating.score), func.count(SubcontractorRating.id))
        .where(SubcontractorRating.tenant_id == tenant_id)
        .group_by(SubcontractorRating.subcontractor_id))).all():
        e = entry(sub_id)
        e["rating_avg"], e["rating_count"] = float(avg), count
    return out


def _apply(item: Subcontractor, updates: dict) -> None:
    for field in TEXT_FIELDS:
        if field in updates:
            value = (updates[field] or "").strip() or None
            if field == "company_name" and not value:
                raise HTTPException(422, "Firma ünvanını yazın.")
            if value and field in UPPER_FIELDS:
                value = upper_tr(value)
            elif value and field == "iban":
                value = value.upper()
            setattr(item, field, value)
    if "competency" in updates:
        value = updates["competency"] or None
        if value and value not in COMPETENCY:
            raise HTTPException(400, "Yetkinlik rengi yeşil, sarı veya kırmızı olmalıdır.")
        item.competency = value
    if updates.get("is_active") is not None:
        item.is_active = updates["is_active"]


async def _check_duplicate(db: AsyncSession, tenant_id: UUID, name: str, exclude: Optional[UUID] = None) -> None:
    query = select(Subcontractor.id).where(
        Subcontractor.tenant_id == tenant_id, func.lower(Subcontractor.company_name) == name.strip().lower())
    if exclude:
        query = query.where(Subcontractor.id != exclude)
    if (await db.execute(query.limit(1))).first():
        raise HTTPException(409, "Bu ünvanla bir taşeron kartı zaten var.")


@router.get("")
async def list_subcontractors(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
) -> list[dict]:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    query = select(Subcontractor).where(Subcontractor.tenant_id == tenant_id)
    if not include_inactive:
        query = query.where(Subcontractor.is_active == True)  # noqa: E712
    rows = (await db.execute(query.order_by(func.lower(Subcontractor.company_name)))).scalars().all()
    stats = await _stats(db, tenant_id)
    return [_row(item, stats.get(item.id)) for item in rows]


@router.post("", status_code=201)
async def create_subcontractor(body: SubcontractorBody, db: AsyncSession = Depends(get_db),
                               user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    if not (body.company_name or "").strip():
        raise HTTPException(422, "Firma ünvanını yazın.")
    await _check_duplicate(db, tenant_id, body.company_name)
    item = Subcontractor(tenant_id=tenant_id, company_name=body.company_name.strip(), created_by=user.id)
    _apply(item, body.model_dump(exclude_unset=True))
    db.add(item)
    await db.commit()
    return _row(item)


@router.patch("/{subcontractor_id}")
async def update_subcontractor(subcontractor_id: UUID, body: SubcontractorBody, db: AsyncSession = Depends(get_db),
                               user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    item = await db.get(Subcontractor, subcontractor_id)
    if not item or item.tenant_id != tenant_id:
        raise HTTPException(404, "Taşeron kartı bulunamadı.")
    updates = body.model_dump(exclude_unset=True)
    if (updates.get("company_name") or "").strip():
        await _check_duplicate(db, tenant_id, updates["company_name"], exclude=item.id)
    _apply(item, updates)
    item.updated_at = utc_now()
    await db.commit()
    return _row(item, (await _stats(db, tenant_id)).get(item.id))


# ── İş emri / proje adımı: taşeron ataması ve puan ──────────────────────────

class WorkTarget(BaseModel):
    work_order_id: Optional[UUID] = None
    stage_id: Optional[UUID] = None


class AssignmentBody(WorkTarget):
    subcontractor_id: Optional[UUID] = None  # None: taşeron kaldırılır


class RatingBody(WorkTarget):
    score: Optional[int] = SchemaField(default=None, ge=1, le=5)  # None: puan silinir
    note: Optional[str] = SchemaField(default=None, max_length=500)


async def _target(db: AsyncSession, tenant_id: UUID, body: WorkTarget) -> tuple[WorkOrder | InstallationProjectStage, bool]:
    """Hedef iş (iş emri ya da proje adımı) ve tamamlanmış olup olmadığı."""
    if (body.work_order_id is None) == (body.stage_id is None):
        raise HTTPException(400, "Bir iş emri ya da bir proje adımı belirtin.")
    if body.work_order_id:
        wo = await db.get(WorkOrder, body.work_order_id)
        if not wo or wo.tenant_id != tenant_id:
            raise HTTPException(404, "İş emri bulunamadı.")
        return wo, getattr(wo.status, "value", wo.status) in DONE_WORK_ORDER
    stage = await db.get(InstallationProjectStage, body.stage_id)
    project = await db.get(InstallationProject, stage.project_id) if stage else None
    if not stage or not project or project.tenant_id != tenant_id:
        raise HTTPException(404, "Proje adımı bulunamadı.")
    return stage, stage.status == "completed"


def _rating_filter(body: WorkTarget):
    return (SubcontractorRating.work_order_id == body.work_order_id if body.work_order_id
            else SubcontractorRating.stage_id == body.stage_id)


async def _assignment(db: AsyncSession, target, done: bool, body: WorkTarget) -> dict:
    sub = await db.get(Subcontractor, target.subcontractor_id) if target.subcontractor_id else None
    rating = (await db.execute(select(SubcontractorRating).where(_rating_filter(body)))).scalars().first()
    return {
        "subcontractor_id": sub.id if sub else None, "subcontractor_name": sub.company_name if sub else None,
        "done": done, "score": rating.score if rating else None, "note": rating.note if rating else None,
    }


@router.get("/assignment")
async def get_assignment(work_order_id: Optional[UUID] = Query(None), stage_id: Optional[UUID] = Query(None),
                         db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    body = WorkTarget(work_order_id=work_order_id, stage_id=stage_id)
    target, done = await _target(db, await _tenant_id(db, user), body)
    return await _assignment(db, target, done, body)


@router.put("/assignment")
async def set_assignment(body: AssignmentBody, db: AsyncSession = Depends(get_db),
                         user: User = Depends(get_current_user)) -> dict:
    """İşe taşeron atar ya da kaldırır. Taşeron değişirse önceki taşerona verilmiş puan silinir."""
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    target, done = await _target(db, tenant_id, body)
    if body.subcontractor_id:
        sub = await db.get(Subcontractor, body.subcontractor_id)
        if not sub or sub.tenant_id != tenant_id or not sub.is_active:
            raise HTTPException(400, "Taşeron bu firmada aktif bir kart olmalıdır.")
    if target.subcontractor_id != body.subcontractor_id:
        await db.execute(delete(SubcontractorRating).where(_rating_filter(body)))
        target.subcontractor_id = body.subcontractor_id
    await db.commit()
    return await _assignment(db, target, done, body)


@router.put("/rating")
async def set_rating(body: RatingBody, db: AsyncSession = Depends(get_db),
                     user: User = Depends(get_current_user)) -> dict:
    """Tamamlanan işte taşerona 1–5 puan verir (iş başına tek puan; tekrar verilirse güncellenir)."""
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    target, done = await _target(db, tenant_id, body)
    if not target.subcontractor_id:
        raise HTTPException(409, "Bu işe taşeron atanmamış.")
    if not done:
        raise HTTPException(409, "Puan iş tamamlandıktan sonra verilir.")
    rating = (await db.execute(select(SubcontractorRating).where(_rating_filter(body)))).scalars().first()
    if body.score is None:
        if rating:
            await db.delete(rating)
    else:
        note = (body.note or "").strip() or None
        if rating:
            rating.score, rating.note, rating.updated_at = body.score, note, utc_now()
        else:
            db.add(SubcontractorRating(tenant_id=tenant_id, subcontractor_id=target.subcontractor_id,
                                       work_order_id=body.work_order_id, stage_id=body.stage_id,
                                       score=body.score, note=note, created_by=user.id))
    await db.commit()
    return await _assignment(db, target, done, body)
