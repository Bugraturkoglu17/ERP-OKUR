"""
Mağaza Fatura Kayıtları API
Routes: /api/v1/invoice-records/...
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.dependencies import get_current_user, get_db
from app.db.models import StoreActivity, StoreInvoiceRecord, User
from app.db.schemas import InvoiceRecordCreate, InvoiceRecordRead

router = APIRouter()


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


INVOICE_TYPE_LABELS = {
    "ara_fatura":      "Ara Fatura",
    "final_fatura":    "Final Fatura",
    "malzeme_faturasi": "Malzeme Faturası",
    "hizmet_faturasi": "Hizmet Faturası",
}


@router.get("", response_model=List[InvoiceRecordRead])
async def list_all_invoices(
    invoice_type: Optional[str] = None,
    period: Optional[str] = None,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Tenant genelinde tüm fatura kayıtlarını döner (isteğe bağlı tür/dönem filtresi)."""
    filters = [StoreInvoiceRecord.tenant_id == user.tenant_id]
    if invoice_type:
        filters.append(StoreInvoiceRecord.invoice_type == invoice_type)
    if period:
        filters.append(StoreInvoiceRecord.period == period)
    result = await db.execute(
        select(StoreInvoiceRecord)
        .where(and_(*filters))
        .order_by(desc(StoreInvoiceRecord.created_at))
        .limit(5000)
    )
    return [InvoiceRecordRead.model_validate(i) for i in result.scalars().all()]


@router.delete("/{invoice_id}", status_code=204)
async def delete_invoice(
    invoice_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(select(StoreInvoiceRecord).where(StoreInvoiceRecord.id == invoice_id))
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Fatura kaydı bulunamadı.")
    await db.delete(inv)
    await db.commit()


@router.get("/projects/{project_id}", response_model=List[InvoiceRecordRead])
async def list_invoices(
    project_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(StoreInvoiceRecord)
        .where(StoreInvoiceRecord.project_id == project_id)
        .order_by(desc(StoreInvoiceRecord.created_at))
    )
    return [InvoiceRecordRead.model_validate(i) for i in result.scalars().all()]


@router.post("/projects/{project_id}", response_model=InvoiceRecordRead, status_code=201)
async def create_invoice(
    project_id: UUID,
    body: InvoiceRecordCreate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    inv = StoreInvoiceRecord(
        tenant_id=user.tenant_id,
        project_id=project_id,
        process_id=body.process_id,
        invoice_type=body.invoice_type,
        invoice_no=body.invoice_no,
        period=body.period,
        amount=body.amount,
        currency=body.currency,
        file_url=body.file_url,
        file_name=body.file_name,
        description=body.description,
        approval_status="pending",
        submitted_by=user.id,
        submitted_by_name=user.full_name or user.email,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(inv)

    label = INVOICE_TYPE_LABELS.get(body.invoice_type, body.invoice_type)
    act = StoreActivity(
        tenant_id=user.tenant_id, project_id=project_id,
        user_id=user.id, user_name=user.full_name or user.email,
        activity_type="invoice_uploaded", title=f"{label} yüklendi",
        description=f"No: {body.invoice_no}" if body.invoice_no else None,
        created_at=utc_now(),
    )
    db.add(act)

    await db.commit()
    await db.refresh(inv)
    return InvoiceRecordRead.model_validate(inv)
