"""
Onay Süreçleri API
Routes: /api/v1/approvals/...
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.db.models import Project, StoreApprovalRequest, StoreActivity, StoreProgressPayment, User
from app.db.schemas import ApprovalRequestCreate, ApprovalRequestRead, ApprovalRequestUpdate
from sqlalchemy import outerjoin

router = APIRouter()


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── GET /approvals (tenant genelinde tüm onaylar) ────────────────────────────

@router.get("", response_model=List[ApprovalRequestRead])
async def list_approvals(
    approval_type: Optional[str] = None,
    status:        Optional[str] = None,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    filters = [StoreApprovalRequest.tenant_id == user.tenant_id]
    if approval_type:
        filters.append(StoreApprovalRequest.approval_type == approval_type)
    if status:
        filters.append(StoreApprovalRequest.status == status)

    result = await db.execute(
        select(StoreApprovalRequest, Project.name, Project.project_no, StoreProgressPayment.payment_type)
        .join(Project, StoreApprovalRequest.project_id == Project.id)
        .outerjoin(StoreProgressPayment, StoreApprovalRequest.related_payment_id == StoreProgressPayment.id)
        .where(*filters)
        .order_by(desc(StoreApprovalRequest.created_at))
        .limit(200)
    )
    rows = result.all()
    out = []
    for approval, proj_name, proj_no, payment_type in rows:
        data = ApprovalRequestRead.model_validate(approval)
        data.project_name = proj_name
        data.project_no = proj_no
        data.payment_type = payment_type
        out.append(data)
    return out


# ── GET /approvals/projects/{project_id} ─────────────────────────────────────

@router.get("/projects/{project_id}", response_model=List[ApprovalRequestRead])
async def list_project_approvals(
    project_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(StoreApprovalRequest)
        .where(StoreApprovalRequest.project_id == project_id)
        .order_by(desc(StoreApprovalRequest.created_at))
    )
    return [ApprovalRequestRead.model_validate(a) for a in result.scalars().all()]


# ── POST /approvals/projects/{project_id} ────────────────────────────────────

@router.post("/projects/{project_id}", response_model=ApprovalRequestRead, status_code=201)
async def create_approval(
    project_id: UUID,
    body: ApprovalRequestCreate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    approval = StoreApprovalRequest(
        tenant_id=user.tenant_id,
        project_id=project_id,
        process_id=body.process_id,
        approval_type=body.approval_type,
        related_payment_id=body.related_payment_id,
        related_invoice_id=body.related_invoice_id,
        title=body.title,
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

    act = StoreActivity(
        tenant_id=user.tenant_id, project_id=project_id,
        user_id=user.id, user_name=user.full_name or user.email,
        activity_type="approval_requested", title=f"Onay talebi oluşturuldu: {body.title}",
        created_at=utc_now(),
    )
    db.add(act)

    await db.commit()
    await db.refresh(approval)
    return ApprovalRequestRead.model_validate(approval)


# ── PATCH /approvals/{approval_id} ───────────────────────────────────────────

@router.patch("/{approval_id}", response_model=ApprovalRequestRead)
async def update_approval(
    approval_id: UUID,
    body: ApprovalRequestUpdate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(select(StoreApprovalRequest).where(StoreApprovalRequest.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="Onay talebi bulunamadı.")

    approval.status = body.status
    if body.note:
        approval.note = body.note

    now = utc_now()
    payment = None

    # İç onay → approved_by alanlarını da doldur
    if body.status == "internal_approved":
        approval.approved_by = user.id
        approval.approved_by_name = user.full_name or user.email
        approval.approved_at = now
    approval.updated_at = now

    # Bağlı hakkediş kaydının approval_status'unu ve zaman damgalarını güncelle
    if approval.related_payment_id:
        pay_result = await db.execute(
            select(StoreProgressPayment).where(StoreProgressPayment.id == approval.related_payment_id)
        )
        payment = pay_result.scalar_one_or_none()
        if payment:
            status_map = {
                "internal_approved":  "internal_approved",
                "revision_requested": "revision_requested",
                "rejected":           "rejected",
                "migros_pending":     "migros_pending",
                "invoice_stage":      "invoice_stage",
                "invoiced":           "invoiced",
                "iptal":              "draft",
                # eski / uyumluluk değerleri
                "ready_for_invoice":  "invoice_stage",
                "onaylandi":          "internal_approved",
                "reddedildi":         "rejected",
                "revizyon":           "revision_requested",
            }
            payment.approval_status = status_map.get(body.status, payment.approval_status)
            if body.status == "internal_approved":
                payment.internal_approved_by_name = user.full_name or user.email
                payment.internal_approved_at = now
            elif body.status == "migros_pending":
                payment.sent_to_migros_by_name = user.full_name or user.email
                payment.sent_to_migros_at = now
            elif body.status in ("invoice_stage", "ready_for_invoice"):
                payment.migros_approved_by_name = user.full_name or user.email
                payment.migros_approved_at = now
            elif body.status == "invoiced":
                payment.invoiced_at = now
            payment.updated_at = now

    status_labels = {
        "internal_approved":  "iç onay verildi",
        "revision_requested": "revizyon istendi",
        "rejected":           "reddedildi",
        "migros_pending":     "Migros'a gönderildi",
        "invoice_stage":      "Migros onayı alındı, faturalandırma aşamasına geçildi",
        "invoiced":           "faturalandırıldı",
        "onaylandi":          "onaylandı",
        "reddedildi":         "reddedildi",
        "revizyon":           "revizyon istendi",
        "tamamlandi":         "tamamlandı",
    }
    act = StoreActivity(
        tenant_id=approval.tenant_id, project_id=approval.project_id,
        user_id=user.id, user_name=user.full_name or user.email,
        activity_type=f"approval_{body.status}",
        title=f"Onay talebi {status_labels.get(body.status, body.status)}: {approval.title}",
        created_at=now,
    )
    db.add(act)

    await db.commit()
    await db.refresh(approval)
    return ApprovalRequestRead.model_validate(approval)
