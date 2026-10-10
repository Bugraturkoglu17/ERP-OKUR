"""
Servis Formları API — Aylık bakım formu yükleme/listeleme
Routes: /api/v1/service-forms/...
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.db.models import StoreActivity, StoreServiceForm, User
from app.db.schemas import ServiceFormCreate, ServiceFormRead

router = APIRouter()

MONTHS_TR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
             "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _log_activity(db, project_id, tenant_id, user, title, description=None):
    act = StoreActivity(
        tenant_id=tenant_id, project_id=project_id,
        user_id=user.id, user_name=user.full_name or user.email,
        activity_type="service_form_uploaded", title=title,
        description=description, created_at=utc_now(),
    )
    db.add(act)


# ── GET /service-forms (tenant genelinde bulk) ────────────────────────────────

@router.get("", response_model=List[ServiceFormRead])
async def list_all_service_forms(
    year:  Optional[int] = None,
    month: Optional[int] = None,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Tenant genelinde tüm servis formlarını döner (isteğe bağlı yıl/ay filtresi)."""
    filters = [StoreServiceForm.tenant_id == user.tenant_id]
    if year:
        filters.append(StoreServiceForm.year == year)
    if month:
        filters.append(StoreServiceForm.month == month)

    result = await db.execute(
        select(StoreServiceForm)
        .where(and_(*filters))
        .order_by(desc(StoreServiceForm.year), desc(StoreServiceForm.month))
        .limit(5000)
    )
    return [ServiceFormRead.model_validate(f) for f in result.scalars().all()]


# ── GET /service-forms/projects/{project_id} ──────────────────────────────────

@router.get("/projects/{project_id}", response_model=List[ServiceFormRead])
async def list_service_forms(
    project_id: UUID,
    year:  Optional[int] = None,
    month: Optional[int] = None,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Bir mağazanın servis formlarını listeler (isteğe bağlı yıl/ay filtresi)."""
    filters = [StoreServiceForm.project_id == project_id]
    if year:
        filters.append(StoreServiceForm.year == year)
    if month:
        filters.append(StoreServiceForm.month == month)

    result = await db.execute(
        select(StoreServiceForm)
        .where(and_(*filters))
        .order_by(desc(StoreServiceForm.year), desc(StoreServiceForm.month))
    )
    return [ServiceFormRead.model_validate(f) for f in result.scalars().all()]


# ── POST /service-forms/projects/{project_id} ─────────────────────────────────

@router.post("/projects/{project_id}", response_model=ServiceFormRead, status_code=201)
async def create_service_form(
    project_id: UUID,
    body: ServiceFormCreate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Aylık servis formu kaydı oluşturur."""
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Geçersiz ay değeri (1-12 olmalı).")

    form = StoreServiceForm(
        tenant_id=user.tenant_id,
        project_id=project_id,
        year=body.year,
        month=body.month,
        file_url=body.file_url,
        file_name=body.file_name,
        file_size_bytes=body.file_size_bytes,
        contractor_company=body.contractor_company,
        uploaded_by=user.id,
        uploaded_by_name=user.full_name or user.email,
        description=body.description,
        status=body.status,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(form)

    month_label = MONTHS_TR[body.month] if 1 <= body.month <= 12 else str(body.month)
    await _log_activity(
        db, project_id, user.tenant_id, user,
        title=f"{month_label} {body.year} servis formu yüklendi",
        description=body.contractor_company,
    )

    await db.commit()
    await db.refresh(form)
    return ServiceFormRead.model_validate(form)


# ── DELETE /service-forms/{form_id} ──────────────────────────────────────────

@router.delete("/{form_id}", status_code=204)
async def delete_service_form(
    form_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(select(StoreServiceForm).where(StoreServiceForm.id == form_id))
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Servis formu bulunamadı.")
    await db.delete(form)
    await db.commit()
