"""Taşeron kartları.

Firma ünvanı ve cari bilgiler, yetkili kişi ve iletişim bilgileri ile yetkinlik göstergesi
(yeşil / sarı / kırmızı). Rengi yönetici atar; anlamı firmanın kendi içinde bilinir.
Kartları yalnızca yöneticiler görür ve yönetir. Kart silinmez, pasife alınır.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field as SchemaField
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.db.models import Subcontractor, Tenant, User, utc_now

router = APIRouter()

COMPETENCY = {"yesil": "Yeşil", "sari": "Sarı", "kirmizi": "Kırmızı"}
TEXT_FIELDS = (
    "company_name", "tax_office", "tax_number", "address", "city", "phone", "email", "iban",
    "contact_name", "contact_title", "contact_phone", "contact_email", "notes",
)


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


def _row(item: Subcontractor) -> dict:
    return {
        "id": item.id, **{field: getattr(item, field) for field in TEXT_FIELDS},
        "competency": item.competency, "competency_label": COMPETENCY.get(item.competency or ""),
        "is_active": item.is_active, "created_at": item.created_at.isoformat(), "updated_at": item.updated_at.isoformat(),
    }


def _apply(item: Subcontractor, updates: dict) -> None:
    for field in TEXT_FIELDS:
        if field in updates:
            value = (updates[field] or "").strip() or None
            if field == "company_name" and not value:
                raise HTTPException(422, "Firma ünvanını yazın.")
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
    query = select(Subcontractor).where(Subcontractor.tenant_id == await _tenant_id(db, user))
    if not include_inactive:
        query = query.where(Subcontractor.is_active == True)  # noqa: E712
    rows = (await db.execute(query.order_by(func.lower(Subcontractor.company_name)))).scalars().all()
    return [_row(item) for item in rows]


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
    return _row(item)
