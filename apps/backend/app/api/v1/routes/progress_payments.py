"""
Hakkedişler (Progress Payments) API
Routes: /api/v1/progress-payments/...
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

import time

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.core.storage import storage, sanitize_filename
from app.db.models import (
    Document, StoreActivity, StoreApprovalRequest,
    StoreInvoiceRecord, StoreProgressPayment, User,
)
from app.db.schemas import (
    ProgressPaymentCreate, ProgressPaymentRead, ProgressPaymentUpdate,
    ApprovalRequestRead, InvoiceRecordRead,
)

router = APIRouter()


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _log_activity(db, project_id, tenant_id, user, title, description=None):
    act = StoreActivity(
        tenant_id=tenant_id, project_id=project_id,
        user_id=user.id, user_name=user.full_name or user.email,
        activity_type="progress_payment_created", title=title,
        description=description, created_at=utc_now(),
    )
    db.add(act)


PAYMENT_TYPE_LABELS = {
    "bakim":     "Bakım Hakkedişi",
    "tadilat":   "Tadilat Hakkedişi",
    "yeni_yapim": "Yeni Yapım Hakkedişi",
    "ara":       "Ara Hakkediş",
    "final":     "Final Hakkediş",
}


# ── GET /progress-payments (tenant genelinde tümü) ───────────────────────────

@router.get("", response_model=List[ProgressPaymentRead])
async def list_all_payments(
    payment_type: Optional[str] = None,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    filters = [StoreProgressPayment.tenant_id == user.tenant_id]
    if payment_type:
        filters.append(StoreProgressPayment.payment_type == payment_type)

    result = await db.execute(
        select(StoreProgressPayment)
        .where(*filters)
        .order_by(desc(StoreProgressPayment.created_at))
        .limit(5000)
    )
    return [ProgressPaymentRead.model_validate(p) for p in result.scalars().all()]


# ── GET /progress-payments/projects/{project_id} ──────────────────────────────

@router.get("/projects/{project_id}", response_model=List[ProgressPaymentRead])
async def list_payments(
    project_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(StoreProgressPayment)
        .where(StoreProgressPayment.project_id == project_id)
        .order_by(desc(StoreProgressPayment.created_at))
    )
    return [ProgressPaymentRead.model_validate(p) for p in result.scalars().all()]


# ── POST /progress-payments/projects/{project_id} ─────────────────────────────

@router.post("/projects/{project_id}", response_model=ProgressPaymentRead, status_code=201)
async def create_payment(
    project_id: UUID,
    body: ProgressPaymentCreate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    payment = StoreProgressPayment(
        tenant_id=user.tenant_id,
        project_id=project_id,
        process_id=body.process_id,
        payment_type=body.payment_type,
        period=body.period,
        amount=body.amount,
        currency=body.currency,
        file_url=body.file_url,
        file_name=body.file_name,
        description=body.description,
        approval_status="internal_pending" if body.submitted_for_approval else "draft",
        submitted_for_approval=body.submitted_for_approval,
        submitted_by=user.id,
        submitted_by_name=user.full_name or user.email,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(payment)
    await db.flush()

    label = PAYMENT_TYPE_LABELS.get(body.payment_type, body.payment_type)
    period_str = f" ({body.period})" if body.period else ""
    await _log_activity(
        db, project_id, user.tenant_id, user,
        title=f"{label}{period_str} yüklendi",
        description=f"Tutar: {body.amount} {body.currency}" if body.amount else None,
    )

    # Onaya gönderildiyse ApprovalRequest oluştur
    if body.submitted_for_approval:
        approval = StoreApprovalRequest(
            tenant_id=user.tenant_id,
            project_id=project_id,
            process_id=body.process_id,
            approval_type="hakkediş",
            related_payment_id=payment.id,
            title=f"{label}{period_str} — Onay Talebi",
            description=body.description,
            amount=body.amount,
            file_url=body.file_url,
            file_name=body.file_name,
            status="internal_pending",
            requested_by=user.id,
            requested_by_name=user.full_name or user.email,
            requested_at=utc_now(),
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(approval)

    await db.commit()
    await db.refresh(payment)
    return ProgressPaymentRead.model_validate(payment)


# ── DELETE /progress-payments/{payment_id} ───────────────────────────────────

@router.delete("/{payment_id}", status_code=204)
async def delete_payment(
    payment_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(StoreProgressPayment).where(StoreProgressPayment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Hakkediş bulunamadı.")

    # Bağlı onay taleplerini sil (FK kısıtı nedeniyle payment silinmeden önce)
    approval_result = await db.execute(
        select(StoreApprovalRequest).where(StoreApprovalRequest.related_payment_id == payment_id)
    )
    for approval in approval_result.scalars().all():
        await db.delete(approval)

    label = PAYMENT_TYPE_LABELS.get(payment.payment_type, payment.payment_type)
    await _log_activity(
        db, payment.project_id, payment.tenant_id, user,
        title=f"{label} silindi",
        description=f"Dönem: {payment.period}" if payment.period else None,
    )

    await db.delete(payment)
    await db.commit()


# ── PATCH /progress-payments/{payment_id} ────────────────────────────────────

@router.patch("/{payment_id}", response_model=ProgressPaymentRead)
async def update_payment(
    payment_id: UUID,
    body: ProgressPaymentUpdate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(select(StoreProgressPayment).where(StoreProgressPayment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Hakkediş bulunamadı.")

    was_submitted = payment.submitted_for_approval
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(payment, k, v)
    payment.updated_at = utc_now()

    # submitted_for_approval false→true geçişinde approval oluştur
    if not was_submitted and payment.submitted_for_approval:
        existing = await db.execute(
            select(StoreApprovalRequest).where(StoreApprovalRequest.related_payment_id == payment_id)
        )
        if not existing.scalar_one_or_none():
            label = PAYMENT_TYPE_LABELS.get(payment.payment_type, payment.payment_type)
            period_str = f" ({payment.period})" if payment.period else ""
            payment.approval_status = "pending"
            db.add(StoreApprovalRequest(
                tenant_id=payment.tenant_id,
                project_id=payment.project_id,
                process_id=payment.process_id,
                approval_type="hakkediş",
                related_payment_id=payment.id,
                title=f"{label}{period_str} — Onay Talebi",
                description=payment.description,
                amount=payment.amount,
                file_url=payment.file_url,
                file_name=payment.file_name,
                status="bekliyor",
                requested_by=user.id,
                requested_by_name=user.full_name or user.email,
                requested_at=utc_now(),
                created_at=utc_now(),
                updated_at=utc_now(),
            ))

    await db.commit()
    await db.refresh(payment)
    return ProgressPaymentRead.model_validate(payment)


# ── POST /progress-payments/sync-approvals (admin) ───────────────────────────

@router.post("/sync-approvals", status_code=200)
async def sync_payment_approvals(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """submitted_for_approval=True ama ilişkili StoreApprovalRequest olmayan
    hakkedişler için otomatik approval kaydı oluşturur. Duplicate oluşturmaz."""
    result = await db.execute(
        select(StoreProgressPayment).where(
            StoreProgressPayment.tenant_id == user.tenant_id,
            StoreProgressPayment.submitted_for_approval == True,  # noqa: E712
        )
    )
    payments = result.scalars().all()

    created = 0
    for payment in payments:
        existing = await db.execute(
            select(StoreApprovalRequest).where(
                StoreApprovalRequest.related_payment_id == payment.id
            )
        )
        if existing.scalar_one_or_none():
            continue  # Zaten var, atla

        label = PAYMENT_TYPE_LABELS.get(payment.payment_type, payment.payment_type)
        period_str = f" ({payment.period})" if payment.period else ""
        db.add(StoreApprovalRequest(
            tenant_id=payment.tenant_id,
            project_id=payment.project_id,
            process_id=payment.process_id,
            approval_type="hakkediş",
            related_payment_id=payment.id,
            title=f"{label}{period_str} — Onay Talebi",
            description=payment.description,
            amount=payment.amount,
            file_url=payment.file_url,
            file_name=payment.file_name,
            status="internal_pending",
            requested_by=user.id,
            requested_by_name=user.full_name or user.email,
            requested_at=utc_now(),
            created_at=utc_now(),
            updated_at=utc_now(),
        ))
        # approval_status'u da güncelle
        terminal = {"internal_approved", "migros_pending", "ready_for_invoice", "invoiced", "rejected"}
        if payment.approval_status not in terminal:
            payment.approval_status = "internal_pending"
            payment.updated_at = utc_now()
        created += 1

    await db.commit()
    return {"synced": created, "message": f"{created} eksik onay talebi oluşturuldu."}


# ── POST /progress-payments/{payment_id}/invoice ─────────────────────────────

PAYMENT_TYPE_TO_INVOICE_TYPE = {
    "bakim":     "bakim_faturasi",
    "tadilat":   "tadilat_faturasi",
    "yeni_yapim": "yeni_yapim_faturasi",
    "ara":       "ara_fatura",
    "final":     "final_fatura",
}

INVOICE_TYPE_LABELS = {
    "bakim_faturasi":      "Bakım - Fatura",
    "tadilat_faturasi":    "Tadilat - Fatura",
    "yeni_yapim_faturasi": "Yeni Yapım - Fatura",
    "ara_fatura":          "Ara Hakkediş Faturası",
    "final_fatura":        "Final Hakkediş Faturası",
}


@router.post("/{payment_id}/invoice", response_model=InvoiceRecordRead, status_code=201)
async def upload_payment_invoice(
    payment_id:   UUID,
    file:         UploadFile = File(...),
    amount:       Optional[float] = Form(None),
    invoice_no:   Optional[str]   = Form(None),
    invoice_date: Optional[str]   = Form(None),
    description:  Optional[str]   = Form(None),
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Hakkedişe bağlı fatura yükle. Sadece invoice_stage durumundaki hakkedişler için."""
    result = await db.execute(
        select(StoreProgressPayment).where(StoreProgressPayment.id == payment_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Hakkediş bulunamadı.")
    if payment.approval_status != "invoice_stage":
        raise HTTPException(
            status_code=400,
            detail="Bu hakkediş için Migros onayı alınmadan fatura yüklenemez.",
        )

    # Dosyayı OCI/S3'e yükle
    content = await file.read()
    safe_name = sanitize_filename(file.filename or "fatura")
    file_key = f"projects/{payment.project_id}/faturalar/{int(time.time())}_{safe_name}"
    try:
        uploaded_key = await storage.upload_file(
            file_content=content,
            file_key=file_key,
            content_type=file.content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dosya yükleme hatası: {e}")

    # Document kaydı oluştur (download endpoint'i için)
    doc = Document(
        project_id=payment.project_id,
        doc_type="fatura",
        original_name=file.filename,
        file_key=uploaded_key,
        bucket_name=storage.bucket_name,
        file_size_bytes=len(content),
        mime_type=file.content_type,
        version=1,
        uploaded_by=user.id,
    )
    db.add(doc)
    await db.flush()

    invoice_type = PAYMENT_TYPE_TO_INVOICE_TYPE.get(payment.payment_type, "hakkediş_faturasi")
    label = INVOICE_TYPE_LABELS.get(invoice_type, invoice_type)

    inv = StoreInvoiceRecord(
        tenant_id=payment.tenant_id,
        project_id=payment.project_id,
        process_id=payment.process_id,
        invoice_type=invoice_type,
        invoice_no=invoice_no,
        invoice_date=invoice_date,
        period=payment.period,
        amount=amount,
        currency=payment.currency,
        file_url=str(doc.id),
        file_name=file.filename,
        description=description,
        related_payment_id=payment.id,
        approval_status="uploaded",
        submitted_by=user.id,
        submitted_by_name=user.full_name or user.email,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(inv)

    # Hakkediş durumunu güncelle
    now = utc_now()
    payment.approval_status = "invoiced"
    payment.invoiced_at = now
    payment.updated_at = now

    # Bağlı onay taleplerini güncelle
    appr_result = await db.execute(
        select(StoreApprovalRequest).where(StoreApprovalRequest.related_payment_id == payment_id)
    )
    for appr in appr_result.scalars().all():
        appr.status = "invoiced"
        appr.updated_at = now

    act = StoreActivity(
        tenant_id=payment.tenant_id,
        project_id=payment.project_id,
        user_id=user.id,
        user_name=user.full_name or user.email,
        activity_type="invoice_uploaded",
        title=f"Hakkedişe bağlı fatura yüklendi: {label}",
        description=f"Tutar: {amount} {payment.currency}" if amount else None,
        created_at=now,
    )
    db.add(act)

    await db.commit()
    await db.refresh(inv)
    return InvoiceRecordRead.model_validate(inv)
