"""
İş Emirleri (Work Orders) API
Routes: /api/v1/work-orders/...
        /api/v1/public/work-orders/...
        /api/v1/webhooks/whatsapp
"""
from __future__ import annotations

import json
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, is_platform_admin
from app.core.notifications import notify
from app.core.storage import storage, sanitize_filename
from app.db.models import (
    Notification,
    Document, Project, User, WorkOrder, WorkOrderActivity, WorkOrderPhoto,
    WorkOrderPublicLink, WorkOrderReport, WorkOrderReportPhoto, WorkOrderServiceForm,
    WorkOrderStage, WorkOrderStatus, WorkOrderType, WorkOrderWhatsappMessage,
    WorkOrderWhatsappStatus, StoreActivity, StoreApprovalRequest, StoreServiceForm,
)
from app.services.whatsapp_service import WorkOrderNotification, whatsapp_service

router = APIRouter()


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _workflow_value(value) -> str:
    """Return the stable lowercase API value for legacy enum/string rows."""
    raw = getattr(value, "value", value)
    return str(raw).lower()


def _can_view_all_work_orders(user: User) -> bool:
    """Admin ve yönetici tüm tenant'ın iş emirlerini görür; diğerleri sadece kendine atananları."""
    role = user.default_role or ""
    return is_platform_admin(user) or "admin" in role or "manager" in role


WORK_TYPE_LABELS = {
    "maintenance":   "Bakım",
    "fault":         "Arıza",
    "repair":        "Onarım",
    "renovation":    "Tadilat",
    "manufacturing": "Yeni Yapım",
    "other":         "Diğer",
}

DEFAULT_STAGES = [
    (1, "Hazırlık"),
    (2, "Uygulama / İmalat"),
    (3, "Kontrol / Test"),
    (4, "Tamamlandı"),
]

SEVERITY_LABELS = {
    "normal":    "Normal",
    "important": "Önemli",
    "critical":  "Kritik",
}

STATUS_LABELS = {
    "planned":          "Planlanacak",
    "draft":            "Planlanacak",
    "sent":             "Planlanacak",
    "started":          "Devam Ediyor",
    "completed":        "Tamamlandı",
    "failed":           "Tamamlanmadı",
    "cancelled":        "İptal Edildi",
    "material_waiting": "Malzeme Bekliyor",
    "revisit":          "Tekrar Gidilecek",
    "approval_pending": "Onay Bekliyor",
    "approved":         "Onaylandı",
}

# DWG için saklanan tür (bkz. upload_admin_photo).
DWG_MIME_TYPE = "application/acad"

STAGE_STATUS_LABELS = {
    "planned": "Planlandı",
    "in_progress": "Devam Ediyor",
    "completed": "Tamamlandı",
    "cancelled": "İptal Edildi",
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class WorkOrderCreate(BaseModel):
    project_id:           UUID
    work_type:            str
    title:                str
    description:          Optional[str]  = None
    assigned_to_name:     Optional[str]  = None
    assigned_to_phone:    Optional[str]  = None
    assigned_to_user_id:  Optional[UUID] = None
    priority:             str = "normal"
    location_url:         Optional[str]  = None
    due_date:             Optional[str]  = None


class WorkOrderRead(BaseModel):
    id:                    UUID
    project_id:            UUID
    project_name:          Optional[str] = None
    project_no:            Optional[str] = None
    project_region:        Optional[str] = None
    project_city:          Optional[str] = None
    project_address:       Optional[str] = None
    work_type:             str
    work_type_label:       str
    title:                 str
    description:           Optional[str] = None
    assigned_to_name:      Optional[str] = None
    assigned_to_phone:     Optional[str] = None
    assigned_to_user_id:   Optional[UUID] = None
    priority:              str
    status:                str
    status_label:          str
    location_url:          Optional[str] = None
    due_date:              Optional[datetime] = None
    created_by_name:       Optional[str] = None
    sent_at:               Optional[datetime] = None
    started_at:            Optional[datetime] = None
    completed_at:          Optional[datetime] = None
    completion_notes:      Optional[str] = None
    created_at:            datetime
    updated_at:            datetime
    photo_count:           int = 0
    has_service_form:      bool = False
    has_critical_report:   bool = False
    public_token:          Optional[str] = None

    class Config:
        from_attributes = True


class WorkOrderReportPhotoRead(BaseModel):
    id:               UUID
    report_id:        UUID
    file_name:        Optional[str]
    file_size_bytes:  Optional[int]
    mime_type:        Optional[str]
    uploaded_by_name: Optional[str]
    uploaded_at:      datetime
    fresh_url:        Optional[str] = None
    is_added_to_inventory: bool = False


class WorkOrderReportRead(BaseModel):
    id:              UUID
    work_order_id:   UUID
    title:           str
    description:     Optional[str]
    severity:        str
    created_by_name: Optional[str]
    created_at:      datetime
    photo_count:     int = 0
    photos:          List[WorkOrderReportPhotoRead] = []


class WorkOrderStageRead(BaseModel):
    id:              UUID
    work_order_id:   UUID
    stage_order:     int
    stage_name:      str
    status:          str
    description:     Optional[str]
    updated_at:      Optional[datetime]
    updated_by_name: Optional[str]
    created_at:      datetime


class WorkOrderStageUpdate(BaseModel):
    status:      Optional[str] = None
    description: Optional[str] = None


class WorkOrderUpdate(BaseModel):
    title:             Optional[str] = None
    description:       Optional[str] = None
    assigned_to_name:  Optional[str] = None
    assigned_to_phone: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    priority:          Optional[str] = None
    due_date:          Optional[str] = None
    status:            Optional[str] = None


class WorkOrderPhotoRead(BaseModel):
    id:                    UUID
    work_order_id:         UUID
    file_key:              str
    file_name:             Optional[str]
    file_size_bytes:       Optional[int]
    mime_type:             Optional[str]
    photo_type:            str
    uploaded_by_name:      Optional[str]
    uploaded_at:           datetime
    is_added_to_inventory: bool
    vi_doc_id:             Optional[UUID]
    fresh_url:             Optional[str] = None


class AddPhotosToInventoryPayload(BaseModel):
    photo_ids: List[UUID]
    report_photo_ids: List[UUID] = Field(default_factory=list)
    category:  Optional[str] = "saha_gorseli"
    title:     Optional[str] = None


class PublicWorkOrderRead(BaseModel):
    id:                UUID
    project_id:        UUID
    project_name:      str
    project_no:        Optional[str] = None
    project_address:   Optional[str] = None
    project_phone:     Optional[str] = None
    work_type:         str
    work_type_label:   str
    title:             str
    description:       Optional[str] = None
    priority:          str
    status:            str
    location_url:      Optional[str] = None
    due_date:          Optional[datetime] = None
    photos:            List[dict] = []
    has_service_form:  bool = False


class PublicSubmit(BaseModel):
    status:            str   # started | completed | failed | cancelled | material_waiting | revisit
    completion_notes:  Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def _parse_project_address(proj: Project) -> Optional[str]:
    if not proj or not proj.description:
        return None
    try:
        d = json.loads(proj.description)
        return d.get("adres") or None
    except Exception:
        return None


def _parse_project_phone(proj: Project) -> Optional[str]:
    if not proj or not proj.description:
        return None
    try:
        d = json.loads(proj.description)
        return d.get("tel1") or None
    except Exception:
        return None


def _parse_project_meta(proj: Project) -> dict:
    if not proj or not proj.description:
        return {}
    try:
        value = json.loads(proj.description)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


async def _photo_inventory_refs(project_id: UUID, db: AsyncSession) -> tuple[dict[str, UUID], dict[str, UUID]]:
    """Görsel envanterdeki iş emri ve rapor fotoğrafı referanslarını döndürür."""
    # Eski/stamp edilmiş veritabanlarında görsel envanter kolonları bulunmayabilir.
    # Fotoğraf görüntüleme bu isteğe bağlı envanter kontrolü yüzünden tamamen bozulmasın.
    schema_check = await db.execute(text("""
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'documents'
          AND column_name IN (
            'process_id', 'vi_meta', 'is_archive', 'archive_status',
            'transferred_project_id', 'transferred_category', 'transferred_at'
          )
    """))
    if schema_check.scalar_one() < 7:
        return {}, {}

    result = await db.execute(
        select(Document).where(
            Document.project_id == project_id,
            Document.doc_type == "visual_inventory",
        )
    )
    work_refs: dict[str, UUID] = {}
    report_refs: dict[str, UUID] = {}
    for document in result.scalars().all():
        try:
            meta = json.loads(document.vi_meta or "{}")
            if meta.get("source") == "work_order":
                work_refs[document.file_key] = document.id
            if meta.get("source") == "work_order_report":
                report_refs[document.file_key] = document.id
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    return work_refs, report_refs


def _other_parties(wo: WorkOrder, actor: User) -> list[UUID]:
    """İşlemi yapan DIŞINDAKİ taraflar: iş emrini açan yönetici ve atanan
    kullanıcı. Kişi kendi yaptığı işlem için bildirim almaz."""
    parties = {wo.created_by, wo.assigned_to_user_id} - {None, actor.id}
    return list(parties)


def _ensure_work_order_access(wo: WorkOrder, user: User) -> None:
    if user.tenant_id and wo.tenant_id != user.tenant_id:
        raise HTTPException(403, "Bu iş emri şirket kapsamınız dışında.")
    if not _can_view_all_work_orders(user) and wo.assigned_to_user_id != user.id:
        raise HTTPException(403, "Bu iş emrine erişim yetkiniz yok.")


def _parse_date(d: Optional[str]) -> Optional[datetime]:
    if not d:
        return None
    try:
        return datetime.fromisoformat(d.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


async def _get_active_link(work_order_id: UUID, db: AsyncSession) -> Optional[WorkOrderPublicLink]:
    result = await db.execute(
        select(WorkOrderPublicLink)
        .where(WorkOrderPublicLink.work_order_id == work_order_id, WorkOrderPublicLink.is_active == True)
        .order_by(desc(WorkOrderPublicLink.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _log_activity(
    db: AsyncSession,
    work_order_id: UUID,
    project_id: UUID,
    activity_type: str,
    title: str,
    description: Optional[str] = None,
) -> None:
    """İş emri + mağaza kartı aktivite kaydı oluştur."""
    now = utc_now()
    db.add(WorkOrderActivity(
        id=uuid4(), work_order_id=work_order_id, project_id=project_id,
        activity_type=activity_type, title=title, description=description, created_at=now,
    ))
    db.add(StoreActivity(
        id=uuid4(), project_id=project_id,
        activity_type=f"work_order_{activity_type}",
        title=title, description=description, created_at=now,
    ))


def _enrich(
    wo: WorkOrder,
    project: Project,
    photos: list,
    service_forms: list,
    link: Optional[WorkOrderPublicLink],
    reports: Optional[list] = None,
) -> WorkOrderRead:
    project_meta = _parse_project_meta(project)
    work_type = _workflow_value(wo.work_type)
    priority = _workflow_value(wo.priority)
    status = _workflow_value(wo.status)
    return WorkOrderRead(
        id=wo.id,
        project_id=wo.project_id,
        project_name=project.name if project else None,
        project_no=project.project_no if project else None,
        project_region=project_meta.get("bolge") or project_meta.get("region"),
        project_city=project_meta.get("sehir") or project_meta.get("city"),
        project_address=project_meta.get("adres") or project_meta.get("address"),
        work_type=work_type,
        work_type_label=WORK_TYPE_LABELS.get(work_type, work_type),
        title=wo.title,
        description=wo.description,
        assigned_to_name=wo.assigned_to_name,
        assigned_to_phone=wo.assigned_to_phone,
        assigned_to_user_id=getattr(wo, "assigned_to_user_id", None),
        priority=priority,
        status=status,
        status_label=STATUS_LABELS.get(status, status),
        location_url=wo.location_url,
        due_date=wo.due_date,
        created_by_name=wo.created_by_name,
        sent_at=wo.sent_at,
        started_at=wo.started_at,
        completed_at=wo.completed_at,
        completion_notes=wo.completion_notes,
        created_at=wo.created_at,
        updated_at=wo.updated_at,
        photo_count=len(photos),
        has_service_form=len(service_forms) > 0,
        has_critical_report=any(report.severity == "critical" for report in (reports or [])),
        public_token=link.token if link else None,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  ADMIN ROUTES (JWT gerekli)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("", response_model=WorkOrderRead, status_code=201)
async def create_work_order(
    payload: WorkOrderCreate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    proj = await db.get(Project, payload.project_id)
    if not proj:
        raise HTTPException(404, "Mağaza bulunamadı.")
    if not _can_view_all_work_orders(user):
        raise HTTPException(403, "İş emri oluşturma yetkiniz yok.")
    if user.tenant_id and proj.tenant_id != user.tenant_id:
        raise HTTPException(403, "Bu mağaza şirket kapsamınız dışında.")

    # Kullanıcı ID'sinden isim çek (eğer user_id verilmişse)
    assigned_name  = payload.assigned_to_name
    assigned_phone = payload.assigned_to_phone
    if payload.assigned_to_user_id:
        assigned_user = await db.get(User, payload.assigned_to_user_id)
        if not assigned_user or not assigned_user.is_active:
            raise HTTPException(400, "Atanacak aktif kullanıcı bulunamadı.")
        if user.tenant_id and assigned_user.tenant_id != user.tenant_id:
            raise HTTPException(403, "Kullanıcı şirket kapsamınız dışında.")
        assigned_name  = assigned_user.full_name or assigned_user.email
        assigned_phone = assigned_user.phone or assigned_phone

    wo = WorkOrder(
        id=uuid4(),
        tenant_id=proj.tenant_id,
        project_id=payload.project_id,
        work_type=payload.work_type,
        title=payload.title,
        description=payload.description,
        assigned_to_name=assigned_name,
        assigned_to_phone=assigned_phone,
        assigned_to_user_id=payload.assigned_to_user_id,
        priority=payload.priority or "normal",
        status=WorkOrderStatus.PLANNED.value,
        location_url=payload.location_url,
        due_date=_parse_date(payload.due_date),
        created_by=user.id,
        created_by_name=user.full_name,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(wo)

    # Public link oluştur
    token = _generate_token()
    link = WorkOrderPublicLink(
        id=uuid4(), work_order_id=wo.id, token=token,
        is_active=True, created_at=utc_now(),
    )
    db.add(link)

    await db.flush()  # wo.id kesinleşsin

    # 4 aşama otomatik oluştur
    for order, name in DEFAULT_STAGES:
        db.add(WorkOrderStage(
            id=uuid4(), work_order_id=wo.id,
            stage_order=order, stage_name=name,
            status="planned", created_at=utc_now(),
        ))

    if wo.assigned_to_user_id:
        await notify(
            db, user_id=wo.assigned_to_user_id, tenant_id=wo.tenant_id, work_order_id=wo.id,
            category="work_order_assigned",
            title="Yeni iş emri atandı",
            body=f"{proj.name} — {wo.title}",
        )

    await db.commit()
    await db.refresh(wo)

    await _log_activity(db, wo.id, wo.project_id, "created", f"İş emri oluşturuldu: {wo.title}")
    await db.commit()

    return _enrich(wo, proj, [], [], link)


@router.get("", response_model=List[WorkOrderRead])
async def list_work_orders(
    project_id: Optional[UUID] = None,
    status:     Optional[str]  = None,
    work_type:  Optional[str]  = None,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    filters = []
    if user.tenant_id:
        filters.append(WorkOrder.tenant_id == user.tenant_id)
    if not _can_view_all_work_orders(user):
        filters.append(WorkOrder.assigned_to_user_id == user.id)
    if project_id:
        filters.append(WorkOrder.project_id == project_id)
    if status:
        filters.append(WorkOrder.status == status)
    if work_type:
        filters.append(WorkOrder.work_type == work_type)

    result = await db.execute(
        select(WorkOrder).where(*filters).order_by(desc(WorkOrder.created_at)).limit(500)
    )
    wos = result.scalars().all()
    if not wos:
        return []

    wo_ids = [wo.id for wo in wos]
    project_ids = {wo.project_id for wo in wos if wo.project_id}

    projects_r = await db.execute(select(Project).where(Project.id.in_(project_ids)))
    projects_by_id = {p.id: p for p in projects_r.scalars().all()}

    photos_by_wo: dict = defaultdict(list)
    photos_r = await db.execute(select(WorkOrderPhoto).where(WorkOrderPhoto.work_order_id.in_(wo_ids)))
    for photo in photos_r.scalars().all():
        photos_by_wo[photo.work_order_id].append(photo)

    forms_by_wo: dict = defaultdict(list)
    forms_r = await db.execute(select(WorkOrderServiceForm).where(WorkOrderServiceForm.work_order_id.in_(wo_ids)))
    for form in forms_r.scalars().all():
        forms_by_wo[form.work_order_id].append(form)

    reports_by_wo: dict = defaultdict(list)
    reports_r = await db.execute(select(WorkOrderReport).where(WorkOrderReport.work_order_id.in_(wo_ids)))
    for report in reports_r.scalars().all():
        reports_by_wo[report.work_order_id].append(report)

    # Aktif linkler: en yeni önce sıralanır, work_order başına ilkini alırız.
    links_by_wo: dict = {}
    links_r = await db.execute(
        select(WorkOrderPublicLink)
        .where(WorkOrderPublicLink.work_order_id.in_(wo_ids), WorkOrderPublicLink.is_active == True)
        .order_by(desc(WorkOrderPublicLink.created_at))
    )
    for link in links_r.scalars().all():
        links_by_wo.setdefault(link.work_order_id, link)

    out = []
    for wo in wos:
        out.append(_enrich(
            wo,
            projects_by_id.get(wo.project_id),
            photos_by_wo.get(wo.id, []),
            forms_by_wo.get(wo.id, []),
            links_by_wo.get(wo.id),
            reports_by_wo.get(wo.id, []),
        ))
    return out


@router.get("/{work_order_id}", response_model=WorkOrderRead)
async def get_work_order(
    work_order_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)
    proj = await db.get(Project, wo.project_id)
    photos_r = await db.execute(select(WorkOrderPhoto).where(WorkOrderPhoto.work_order_id == wo.id))
    forms_r  = await db.execute(select(WorkOrderServiceForm).where(WorkOrderServiceForm.work_order_id == wo.id))
    reports_r = await db.execute(select(WorkOrderReport).where(WorkOrderReport.work_order_id == wo.id))
    link = await _get_active_link(wo.id, db)
    return _enrich(wo, proj, photos_r.scalars().all(), forms_r.scalars().all(), link, reports_r.scalars().all())


@router.patch("/{work_order_id}", response_model=WorkOrderRead)
async def update_work_order(
    work_order_id: UUID,
    payload: WorkOrderUpdate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)
    if not _can_view_all_work_orders(user):
        if not payload.model_fields_set.issubset({"status"}):
            raise HTTPException(403, "Bu iş emrinde yalnızca süreç durumu güncellenebilir.")
        if payload.status not in {"started", "completed"}:
            raise HTTPException(400, "Geçersiz süreç durumu.")

    if payload.title is not None:           wo.title = payload.title
    if payload.description is not None:     wo.description = payload.description
    if payload.assigned_to_name is not None: wo.assigned_to_name = payload.assigned_to_name
    if payload.assigned_to_phone is not None: wo.assigned_to_phone = payload.assigned_to_phone
    if payload.assigned_to_user_id is not None:
        assigned_user = await db.get(User, payload.assigned_to_user_id)
        if not assigned_user or not assigned_user.is_active:
            raise HTTPException(400, "Atanacak aktif kullanıcı bulunamadı.")
        if user.tenant_id and assigned_user.tenant_id != user.tenant_id:
            raise HTTPException(403, "Kullanıcı şirket kapsamınız dışında.")
        previous_assignee_id = wo.assigned_to_user_id
        wo.assigned_to_user_id = assigned_user.id
        wo.assigned_to_name = assigned_user.full_name or assigned_user.email
        wo.assigned_to_phone = assigned_user.phone
        # İş emri başka birine devredildiyse yeni atanan kişiye haber ver.
        if assigned_user.id != previous_assignee_id and assigned_user.id != user.id:
            await notify(
                db, user_id=assigned_user.id, tenant_id=wo.tenant_id, work_order_id=wo.id,
                category="work_order_assigned",
                title="Yeni iş emri atandı",
                body=wo.title,
            )
    if payload.priority is not None:        wo.priority = payload.priority
    if payload.due_date is not None:        wo.due_date = _parse_date(payload.due_date)
    if payload.status is not None:
        stages_r = await db.execute(
            select(WorkOrderStage)
            .where(WorkOrderStage.work_order_id == wo.id)
            .order_by(WorkOrderStage.stage_order)
        )
        order_stages = list(stages_r.scalars().all())
        if payload.status == "completed":
            completion_photos = await db.execute(
                select(WorkOrderPhoto).where(
                    WorkOrderPhoto.work_order_id == wo.id,
                    WorkOrderPhoto.photo_type == "completion",
                )
            )
            if not completion_photos.scalars().first():
                raise HTTPException(400, "İşi tamamlamak için en az bir nihai fotoğraf yükleyin.")
            completed_at = utc_now()
            wo.completed_at = completed_at
            for item in order_stages:
                item.status = "completed"
                item.updated_at = completed_at
                item.updated_by_name = user.full_name
        if payload.status == "started" and not wo.started_at:
            wo.started_at = utc_now()
        if payload.status == "started" and order_stages and all(item.status == "planned" for item in order_stages):
            order_stages[0].status = "in_progress"
            order_stages[0].updated_at = utc_now()
            order_stages[0].updated_by_name = user.full_name
        wo.status = payload.status
        await _log_activity(
            db, wo.id, wo.project_id, "status_updated",
            f"İş emri durumu güncellendi: {STATUS_LABELS.get(payload.status, payload.status)}",
        )
        # Süreci başlatan/tamamlayan kullanıcı, iş emrini oluşturan yöneticinin
        # kendisi değilse yöneticiye bildirim gönder.
        if wo.created_by and wo.created_by != user.id:
            if payload.status == "started":
                await notify(
                    db, user_id=wo.created_by, tenant_id=wo.tenant_id, work_order_id=wo.id,
                    category="work_order_started",
                    title="Süreç başlatıldı",
                    body=f"{user.full_name} — {wo.title}",
                )
            elif payload.status == "completed":
                await notify(
                    db, user_id=wo.created_by, tenant_id=wo.tenant_id, work_order_id=wo.id,
                    category="work_order_completed",
                    title="İş emri tamamlandı",
                    body=f"{user.full_name} — {wo.title}",
                )
    wo.updated_at = utc_now()

    await db.commit()
    await db.refresh(wo)

    proj = await db.get(Project, wo.project_id)
    photos_r = await db.execute(select(WorkOrderPhoto).where(WorkOrderPhoto.work_order_id == wo.id))
    forms_r  = await db.execute(select(WorkOrderServiceForm).where(WorkOrderServiceForm.work_order_id == wo.id))
    reports_r = await db.execute(select(WorkOrderReport).where(WorkOrderReport.work_order_id == wo.id))
    link = await _get_active_link(wo.id, db)
    return _enrich(wo, proj, photos_r.scalars().all(), forms_r.scalars().all(), link, reports_r.scalars().all())


@router.delete("/{work_order_id}", status_code=204)
async def delete_work_order(
    work_order_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)
    if not _can_view_all_work_orders(user):
        raise HTTPException(403, "İş emri silme yetkiniz yok.")

    # İş emri kalıcı olarak silindiği için bildirimde work_order_id
    # referansı tutmuyoruz (tıklanınca zaten 404 verir) — sadece başlığı kaydediyoruz.
    if wo.assigned_to_user_id and wo.assigned_to_user_id != user.id:
        await notify(
            db, user_id=wo.assigned_to_user_id, tenant_id=wo.tenant_id,
            category="work_order_deleted",
            title="İş emri silindi",
            body=wo.title,
        )

    # Mağaza kartına silme kaydı düş (iş emri silindikten sonra project_id kaybolur)
    db.add(StoreActivity(
        id=uuid4(), project_id=wo.project_id,
        activity_type="work_order_deleted",
        title=f"İş emri silindi: {wo.title}",
        created_at=utc_now(),
    ))

    # Child tabloları FK kısıtı oluşturmadan önce sil.
    # R2/OCI objeleri FİZİKSEL olarak silinmez (yalnızca DB kayıtları) — dosya
    # depolamada kalır; yedekleme sistemi ve bucket-retention politikasıyla
    # uyum için mağaza kartı envanter referansına bakılmaksızın korunur.
    # Report photos önce silinmeli (report'lara FK var)
    reports_r = await db.execute(select(WorkOrderReport).where(WorkOrderReport.work_order_id == work_order_id))
    for rep in reports_r.scalars().all():
        rp_r = await db.execute(select(WorkOrderReportPhoto).where(WorkOrderReportPhoto.report_id == rep.id))
        for rp in rp_r.scalars().all():
            await db.delete(rp)
        await db.flush()
        await db.delete(rep)
    await db.flush()

    photos_r = await db.execute(select(WorkOrderPhoto).where(WorkOrderPhoto.work_order_id == work_order_id))
    for photo in photos_r.scalars().all():
        await db.delete(photo)
    await db.flush()

    for child_model in [
        WorkOrderActivity, WorkOrderServiceForm,
        WorkOrderWhatsappMessage, WorkOrderPublicLink, WorkOrderStage,
    ]:
        rows = await db.execute(
            select(child_model).where(child_model.work_order_id == work_order_id)
        )
        for row in rows.scalars().all():
            await db.delete(row)

    # Bu iş emrine bağlı eski bildirimler (atandı / başlatıldı / aşama) silinmez,
    # yalnızca bağlantıları boşaltılır. Veritabanındaki FK kuralına (ON DELETE
    # SET NULL) güvenmiyoruz: tablo migration yerine create_all ile oluşmuşsa
    # o kural yoktur ve silme FK ihlaliyle 500 verir.
    await db.execute(
        update(Notification).where(Notification.work_order_id == work_order_id).values(work_order_id=None)
    )

    await db.flush()
    await db.delete(wo)
    await db.commit()


# ── Raporlar ─────────────────────────────────────────────────────────────────

@router.post("/{work_order_id}/reports", response_model=WorkOrderReportRead, status_code=201)
async def create_report(
    work_order_id: UUID,
    title:        str         = Form(...),
    description:  str         = Form(""),
    severity:     str         = Form("normal"),
    files:        List[UploadFile] = File(default=[]),
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)

    report = WorkOrderReport(
        id=uuid4(), work_order_id=wo.id,
        title=title.strip(),
        description=description.strip() or None,
        severity=severity,
        created_by_name=user.full_name,
        created_by=user.id,
        created_at=utc_now(),
    )
    db.add(report)
    await db.flush()

    report_photos: list[WorkOrderReportPhotoRead] = []
    for upload in (files or []):
        if not upload.filename:
            continue
        content = await upload.read()
        if not content:
            continue
        safe_name = sanitize_filename(upload.filename)
        file_key  = f"work-orders/{work_order_id}/reports/{report.id}/{int(time.time())}_{safe_name}"
        uploaded_key = await storage.upload_file(
            file_content=content, file_key=file_key, content_type=upload.content_type,
        )
        file_url = await storage.generate_presigned_url(uploaded_key)
        rp = WorkOrderReportPhoto(
            id=uuid4(), report_id=report.id, work_order_id=wo.id,
            file_key=uploaded_key, file_url=file_url,
            file_name=upload.filename, file_size_bytes=len(content),
            mime_type=upload.content_type,
            uploaded_by_name=user.full_name, uploaded_at=utc_now(),
        )
        db.add(rp)
        report_photos.append(WorkOrderReportPhotoRead(
            id=rp.id, report_id=rp.report_id,
            file_name=rp.file_name, file_size_bytes=rp.file_size_bytes,
            mime_type=rp.mime_type, uploaded_by_name=rp.uploaded_by_name,
            uploaded_at=rp.uploaded_at, fresh_url=file_url,
            is_added_to_inventory=False,
        ))

    await _log_activity(db, wo.id, wo.project_id, "report_created", f"Rapor eklendi: {title}")
    for recipient_id in _other_parties(wo, user):
        await notify(
            db, user_id=recipient_id, tenant_id=wo.tenant_id, work_order_id=wo.id,
            category="work_order_report_added",
            title="Yeni saha raporu",
            body=f"{user.full_name} — {wo.title}: {report.title}",
        )
    await db.commit()

    return WorkOrderReportRead(
        id=report.id, work_order_id=report.work_order_id,
        title=report.title, description=report.description,
        severity=report.severity, created_by_name=report.created_by_name,
        created_at=report.created_at,
        photo_count=len(report_photos), photos=report_photos,
    )


@router.get("/{work_order_id}/reports", response_model=List[WorkOrderReportRead])
async def list_reports(
    work_order_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)

    reports_r = await db.execute(
        select(WorkOrderReport)
        .where(WorkOrderReport.work_order_id == work_order_id)
        .order_by(desc(WorkOrderReport.created_at))
    )
    reports = reports_r.scalars().all()
    _, inventory_refs = await _photo_inventory_refs(wo.project_id, db)

    out = []
    for rep in reports:
        photos_r = await db.execute(
            select(WorkOrderReportPhoto).where(WorkOrderReportPhoto.report_id == rep.id)
        )
        photos = photos_r.scalars().all()
        photo_reads = []
        for p in photos:
            try:
                url = await storage.generate_presigned_url(p.file_key)
            except Exception:
                url = p.file_url
            photo_reads.append(WorkOrderReportPhotoRead(
                id=p.id, report_id=p.report_id,
                file_name=p.file_name, file_size_bytes=p.file_size_bytes,
                mime_type=p.mime_type, uploaded_by_name=p.uploaded_by_name,
                uploaded_at=p.uploaded_at, fresh_url=url,
                is_added_to_inventory=p.file_key in inventory_refs,
            ))
        out.append(WorkOrderReportRead(
            id=rep.id, work_order_id=rep.work_order_id,
            title=rep.title, description=rep.description,
            severity=rep.severity, created_by_name=rep.created_by_name,
            created_at=rep.created_at,
            photo_count=len(photo_reads), photos=photo_reads,
        ))
    return out


@router.delete("/{work_order_id}/reports/{report_id}", status_code=204)
async def delete_report(
    work_order_id: UUID,
    report_id:     UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    rep = await db.get(WorkOrderReport, report_id)
    if not rep or rep.work_order_id != work_order_id:
        raise HTTPException(404, "Rapor bulunamadı.")
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)
    # R2/OCI objesi fiziksel olarak silinmez — yalnızca DB kaydı kaldırılır
    # (bkz. delete_work_order_photo üzerindeki aynı kural açıklaması).
    photos_r = await db.execute(
        select(WorkOrderReportPhoto).where(WorkOrderReportPhoto.report_id == report_id)
    )
    for p in photos_r.scalars().all():
        await db.delete(p)
    await db.flush()
    await db.delete(rep)
    await db.commit()


# ── Aşamalar ──────────────────────────────────────────────────────────────────

@router.get("/{work_order_id}/stages", response_model=List[WorkOrderStageRead])
async def list_stages(
    work_order_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)

    stages_r = await db.execute(
        select(WorkOrderStage)
        .where(WorkOrderStage.work_order_id == work_order_id)
        .order_by(WorkOrderStage.stage_order)
    )
    stages = stages_r.scalars().all()
    renamed = False
    for item in stages:
        if item.stage_name == "Tamamlama":
            item.stage_name = "Tamamlandı"
            renamed = True
    if renamed:
        await db.commit()

    # Eski iş emirleri için aşama yoksa otomatik oluştur
    if not stages:
        for order, name in DEFAULT_STAGES:
            s = WorkOrderStage(
                id=uuid4(), work_order_id=wo.id,
                stage_order=order, stage_name=name,
                status="planned", created_at=utc_now(),
            )
            db.add(s)
        await db.commit()
        stages_r2 = await db.execute(
            select(WorkOrderStage)
            .where(WorkOrderStage.work_order_id == work_order_id)
            .order_by(WorkOrderStage.stage_order)
        )
        stages = stages_r2.scalars().all()

    return [WorkOrderStageRead(
        id=s.id, work_order_id=s.work_order_id,
        stage_order=s.stage_order, stage_name=s.stage_name,
        status=s.status, description=s.description,
        updated_at=s.updated_at, updated_by_name=s.updated_by_name,
        created_at=s.created_at,
    ) for s in stages]


@router.patch("/{work_order_id}/stages/{stage_id}", response_model=WorkOrderStageRead)
async def update_stage(
    work_order_id: UUID,
    stage_id:      UUID,
    payload: WorkOrderStageUpdate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    stage = await db.get(WorkOrderStage, stage_id)
    if not stage or stage.work_order_id != work_order_id:
        raise HTTPException(404, "Aşama bulunamadı.")

    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)

    if payload.status is not None:
        if _workflow_value(wo.status) in {"planned", "draft", "sent", "approval_pending"}:
            raise HTTPException(409, "Aşamaları güncellemeden önce süreci başlatmalısınız.")
        if payload.status not in {"planned", "in_progress", "completed", "cancelled"}:
            raise HTTPException(400, "Geçersiz aşama durumu.")
        if stage.stage_order == 4 and payload.status == "completed":
            completion_photos = await db.execute(
                select(WorkOrderPhoto).where(
                    WorkOrderPhoto.work_order_id == work_order_id,
                    WorkOrderPhoto.photo_type == "completion",
                )
            )
            if not completion_photos.scalars().first():
                raise HTTPException(400, "Tamamlandı aşaması için en az bir nihai fotoğraf yükleyin.")
        stage.status = payload.status
    if payload.description is not None:
        stage.description = payload.description or None
    stage.updated_at       = utc_now()
    stage.updated_by_name  = user.full_name

    stages_r = await db.execute(
        select(WorkOrderStage)
        .where(WorkOrderStage.work_order_id == work_order_id)
        .order_by(WorkOrderStage.stage_order)
    )
    all_stages = list(stages_r.scalars().all())
    if stage.stage_order == 4 and stage.status == "completed":
        completed_at = utc_now()
        for item in all_stages:
            item.status = "completed"
            item.updated_at = completed_at
            item.updated_by_name = user.full_name
        wo.status = WorkOrderStatus.COMPLETED.value
        wo.completed_at = completed_at
    elif all_stages and all(item.status == "cancelled" for item in all_stages):
        wo.status = WorkOrderStatus.CANCELLED.value
        wo.completed_at = None
    elif all_stages and all(item.status == "planned" for item in all_stages):
        wo.status = WorkOrderStatus.DRAFT.value
        wo.completed_at = None
    elif any(item.status in {"in_progress", "completed"} for item in all_stages):
        wo.status = WorkOrderStatus.STARTED.value
        wo.started_at = wo.started_at or utc_now()
        wo.completed_at = None
    wo.updated_at = utc_now()

    await _log_activity(
        db, wo.id, wo.project_id, "stage_updated",
        f"{stage.stage_name} aşaması: {STAGE_STATUS_LABELS.get(stage.status, stage.status)}",
        payload.description,
    )

    # Karşı tarafa haber ver: son aşama tamamlandıysa "iş emri tamamlandı",
    # aksi halde hangi aşamanın ne olduğunu söyleyen bir güncelleme.
    finished = stage.stage_order == 4 and stage.status == "completed"
    for recipient_id in _other_parties(wo, user):
        await notify(
            db, user_id=recipient_id, tenant_id=wo.tenant_id, work_order_id=wo.id,
            category="work_order_completed" if finished else "work_order_stage_updated",
            title="İş emri tamamlandı" if finished else "Aşama güncellendi",
            body=(
                f"{user.full_name} — {wo.title}" if finished
                else f"{user.full_name} — {wo.title}: {stage.stage_name} → {STAGE_STATUS_LABELS.get(stage.status, stage.status)}"
            ),
        )

    await db.commit()
    await db.refresh(stage)

    return WorkOrderStageRead(
        id=stage.id, work_order_id=stage.work_order_id,
        stage_order=stage.stage_order, stage_name=stage.stage_name,
        status=stage.status, description=stage.description,
        updated_at=stage.updated_at, updated_by_name=stage.updated_by_name,
        created_at=stage.created_at,
    )


# ── WhatsApp Gönder ───────────────────────────────────────────────────────────

@router.post("/{work_order_id}/send-whatsapp", response_model=WorkOrderRead)
async def send_whatsapp(
    work_order_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    if not wo.assigned_to_phone:
        raise HTTPException(400, "Atanacak kişinin telefon numarası girilmemiş.")

    proj = await db.get(Project, wo.project_id)

    link = await _get_active_link(wo.id, db)
    if not link:
        token = _generate_token()
        link = WorkOrderPublicLink(
            id=uuid4(), work_order_id=wo.id, token=token,
            is_active=True, created_at=utc_now(),
        )
        db.add(link)
        await db.flush()

    # Admin fotoğrafı varsa ilkini WhatsApp mesajına ekle
    admin_photos_r = await db.execute(
        select(WorkOrderPhoto)
        .where(WorkOrderPhoto.work_order_id == wo.id)
        .limit(1)
    )
    first_photo = admin_photos_r.scalar_one_or_none()
    attachment_url = first_photo.file_url if first_photo and first_photo.file_url else None

    public_url = whatsapp_service.build_public_url(link.token)

    proj_desc: dict = {}
    if proj and proj.description:
        try:
            import json as _json
            proj_desc = _json.loads(proj.description)
        except Exception:
            pass

    notif = WorkOrderNotification(
        store_name=proj.name if proj else "—",
        store_code=proj.project_no if proj else None,
        work_type_label=WORK_TYPE_LABELS.get(_workflow_value(wo.work_type), _workflow_value(wo.work_type)),
        title=wo.title,
        description=wo.description,
        store_address=proj_desc.get("adres") or None,
        store_phone=proj_desc.get("tel1") or None,
        public_url=public_url,
        to_phone=wo.assigned_to_phone,
        assigned_name=wo.assigned_to_name,
        attachment_url=attachment_url,
    )

    result = await whatsapp_service.send_work_order(notif)

    # WhatsApp mesaj kaydı
    wa_msg = WorkOrderWhatsappMessage(
        id=uuid4(),
        work_order_id=wo.id,
        to_phone=wo.assigned_to_phone,
        whatsapp_message_id=result.get("message_id"),
        status=WorkOrderWhatsappStatus.SENT if result["success"] else WorkOrderWhatsappStatus.FAILED,
        error_message=result.get("error"),
        sent_at=utc_now() if result["success"] else None,
        updated_at=utc_now(),
    )
    db.add(wa_msg)

    if result["success"]:
        wo.status = WorkOrderStatus.SENT.value
        wo.sent_at = utc_now()
        await _log_activity(db, wo.id, wo.project_id, "sent", f"İş emri WhatsApp ile gönderildi: {wo.assigned_to_name or wo.assigned_to_phone}")

    await db.commit()
    await db.refresh(wo)

    photos_r = await db.execute(select(WorkOrderPhoto).where(WorkOrderPhoto.work_order_id == wo.id))
    forms_r  = await db.execute(select(WorkOrderServiceForm).where(WorkOrderServiceForm.work_order_id == wo.id))
    return _enrich(wo, proj, photos_r.scalars().all(), forms_r.scalars().all(), link)


# ── Admin: fotoğraf yükle ─────────────────────────────────────────────────────

@router.post("/{work_order_id}/photos", status_code=201)
async def upload_admin_photo(
    work_order_id: UUID,
    photo_type: str = Form("completion"),
    file: UploadFile = File(...),
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)
    if photo_type not in {"before", "after", "issue", "completion"}:
        raise HTTPException(400, "Geçersiz fotoğraf kaynağı.")
    # DWG (AutoCAD çizimi) uzantıya göre tanınır: tarayıcılar DWG için tür
    # bilgisini boş, "application/octet-stream" ya da "image/vnd.dwg" gönderir.
    # Saklanan tür her zaman "application/acad" yapılır — "image/…" kalırsa
    # arayüz çizimi fotoğraf sanıp bozuk resim gösterir ve görsel envantere
    # eklenebilir sayar.
    is_dwg = (file.filename or "").lower().endswith(".dwg")
    content_type = DWG_MIME_TYPE if is_dwg else file.content_type
    if is_dwg:
        allowed_file = photo_type == "before"
    else:
        allowed_file = bool(content_type and (
            content_type.startswith("image/")
            or (photo_type == "before" and content_type == "application/pdf")
        ))
    if not allowed_file:
        raise HTTPException(400, "Yalnızca JPG, JPEG, PNG veya başlangıç eki olarak PDF ya da DWG yükleyebilirsiniz.")

    content = await file.read()
    safe_name = sanitize_filename(file.filename or "photo.jpg")
    file_key = f"work-orders/{work_order_id}/photos/{int(time.time())}_{safe_name}"

    uploaded_key = await storage.upload_file(
        file_content=content, file_key=file_key, content_type=content_type
    )
    file_url = await storage.generate_presigned_url(uploaded_key)

    photo = WorkOrderPhoto(
        id=uuid4(), work_order_id=wo.id,
        file_key=uploaded_key, file_url=file_url,
        file_name=file.filename, file_size_bytes=len(content),
        mime_type=content_type, photo_type=photo_type,
        uploaded_by_name=user.full_name, uploaded_at=utc_now(),
    )
    db.add(photo)
    await db.commit()
    return {"id": str(photo.id), "file_url": file_url, "photo_type": photo_type}


# ── İş emri fotoğraflarını listele ───────────────────────────────────────────

@router.get("/{work_order_id}/photos", response_model=List[WorkOrderPhotoRead])
async def list_work_order_photos(
    work_order_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)

    photos_r = await db.execute(
        select(WorkOrderPhoto)
        .where(WorkOrderPhoto.work_order_id == work_order_id)
        .order_by(WorkOrderPhoto.uploaded_at)
    )
    photos = photos_r.scalars().all()
    inventory_refs, _ = await _photo_inventory_refs(wo.project_id, db)

    result = []
    for p in photos:
        try:
            url = await storage.generate_presigned_url(p.file_key)
        except Exception:
            url = p.file_url
        result.append(WorkOrderPhotoRead(
            id=p.id,
            work_order_id=p.work_order_id,
            file_key=p.file_key,
            file_name=p.file_name,
            file_size_bytes=p.file_size_bytes,
            mime_type=p.mime_type,
            photo_type=p.photo_type,
            uploaded_by_name=p.uploaded_by_name,
            uploaded_at=p.uploaded_at,
            is_added_to_inventory=p.file_key in inventory_refs,
            vi_doc_id=inventory_refs.get(p.file_key),
            fresh_url=url,
        ))
    return result


@router.delete("/{work_order_id}/photos/{photo_id}", status_code=204)
async def delete_work_order_photo(
    work_order_id: UUID,
    photo_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)

    photo = await db.get(WorkOrderPhoto, photo_id)
    if not photo or photo.work_order_id != work_order_id:
        raise HTTPException(404, "Saha görseli bulunamadı.")

    inventory_refs, _ = await _photo_inventory_refs(wo.project_id, db)
    if photo.file_key in inventory_refs:
        raise HTTPException(409, "Mağaza kartına eklenmiş saha görseli silinemez.")

    # R2/OCI objesi FİZİKSEL olarak silinmez — yalnızca ERP kaydı (DB satırı)
    # kaldırılır. Depolamadaki dosya, yedekleme sisteminin görebilmesi ve
    # bucket-retention (Cloudflare R2 Lock) politikasıyla uyum için korunur.
    await db.delete(photo)
    await _log_activity(
        db,
        wo.id,
        wo.project_id,
        "photo_deleted",
        f"Saha görseli silindi: {photo.file_name or 'Dosya'}",
    )
    await db.commit()


# ── Fotoğrafları Görsel Envanter'e aktar ─────────────────────────────────────

@router.post("/{work_order_id}/add-photos-to-inventory")
async def add_photos_to_inventory(
    work_order_id: UUID,
    payload: AddPhotosToInventoryPayload,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    wo = await db.get(WorkOrder, work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")
    _ensure_work_order_access(wo, user)
    if not _can_view_all_work_orders(user):
        raise HTTPException(403, "Fotoğrafları mağaza kartına ekleme yetkiniz yok.")

    added: list[str] = []
    skipped: list[str] = []
    work_inventory_refs, report_inventory_refs = await _photo_inventory_refs(wo.project_id, db)

    for photo_id in payload.photo_ids:
        photo_r = await db.execute(
            select(WorkOrderPhoto).where(
                WorkOrderPhoto.id == photo_id,
                WorkOrderPhoto.work_order_id == work_order_id,
            )
        )
        photo = photo_r.scalar_one_or_none()
        if not photo:
            continue
        # Görsel Envanter yalnızca resim alır; başlangıç eki olarak yüklenen
        # PDF/DWG oraya aktarılmaz.
        if not (photo.mime_type or "").startswith("image/"):
            skipped.append(str(photo_id))
            continue
        if photo.file_key in work_inventory_refs:
            skipped.append(str(photo_id))
            continue

        vi_meta = {
            "c":        payload.category or "saha_gorseli",
            "t":        payload.title or photo.file_name or "Saha Görseli",
            "source":   "work_order",
            "work_order_photo_id": str(photo.id),
            "wo_id":    str(wo.id),
            "wo_title": wo.title,
            "reporter": photo.uploaded_by_name,
            "wo_date":  photo.uploaded_at.strftime("%Y-%m-%d"),
        }

        doc = Document(
            id=uuid4(),
            project_id=wo.project_id,
            doc_type="visual_inventory",
            original_name=photo.file_name or "saha-fotografi.jpg",
            file_key=photo.file_key,
            bucket_name=storage.bucket_name,
            file_size_bytes=photo.file_size_bytes,
            mime_type=photo.mime_type,
            revision_note=None,
            vi_meta=json.dumps(vi_meta, ensure_ascii=False),
            version=1,
            uploaded_by=user.id,
            created_at=utc_now(),
        )
        db.add(doc)
        await db.flush()

        work_inventory_refs[photo.file_key] = doc.id
        added.append(str(photo_id))

    for photo_id in payload.report_photo_ids:
        photo_r = await db.execute(
            select(WorkOrderReportPhoto).where(
                WorkOrderReportPhoto.id == photo_id,
                WorkOrderReportPhoto.work_order_id == work_order_id,
            )
        )
        photo = photo_r.scalar_one_or_none()
        if not photo:
            continue
        if photo.file_key in report_inventory_refs:
            skipped.append(str(photo_id))
            continue

        doc = Document(
            id=uuid4(),
            project_id=wo.project_id,
            doc_type="visual_inventory",
            original_name=photo.file_name or "rapor-gorseli.jpg",
            file_key=photo.file_key,
            bucket_name=storage.bucket_name,
            file_size_bytes=photo.file_size_bytes,
            mime_type=photo.mime_type,
            revision_note=None,
            vi_meta=json.dumps({
                "c": payload.category or "saha_gorseli",
                "t": payload.title or photo.file_name or "Rapor Görseli",
                "source": "work_order_report",
                "report_photo_id": str(photo.id),
                "wo_id": str(wo.id),
                "wo_title": wo.title,
                "reporter": photo.uploaded_by_name,
                "wo_date": photo.uploaded_at.strftime("%Y-%m-%d"),
            }, ensure_ascii=False),
            version=1,
            uploaded_by=user.id,
            created_at=utc_now(),
        )
        db.add(doc)
        await db.flush()
        report_inventory_refs[photo.file_key] = doc.id
        added.append(str(photo_id))

    if added:
        await _log_activity(
            db, wo.id, wo.project_id,
            "photos_added_to_inventory",
            f"İş emrinden {len(added)} saha görseli Görsel Envanter'e eklendi",
            f"İş emri: {wo.title}",
        )

    await db.commit()
    return {"added": added, "skipped": skipped, "total_added": len(added)}


# ═══════════════════════════════════════════════════════════════════════════════
#  PUBLIC ROUTES (token korumalı, login gerektirmez)
# ═══════════════════════════════════════════════════════════════════════════════

public_router = APIRouter()


async def _resolve_token(token: str, db: AsyncSession) -> tuple[WorkOrderPublicLink, WorkOrder, Project]:
    link_r = await db.execute(
        select(WorkOrderPublicLink).where(
            WorkOrderPublicLink.token == token,
            WorkOrderPublicLink.is_active == True,
        )
    )
    link = link_r.scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Geçersiz veya süresi dolmuş iş emri linki.")

    wo = await db.get(WorkOrder, link.work_order_id)
    if not wo:
        raise HTTPException(404, "İş emri bulunamadı.")

    proj = await db.get(Project, wo.project_id)
    return link, wo, proj


@public_router.get("/work-orders/{token}", response_model=PublicWorkOrderRead)
async def public_get_work_order(token: str, db: AsyncSession = Depends(get_db)):
    link, wo, proj = await _resolve_token(token, db)
    work_type = _workflow_value(wo.work_type)

    photos_r = await db.execute(select(WorkOrderPhoto).where(WorkOrderPhoto.work_order_id == wo.id))
    photos = [
        {"id": str(p.id), "file_url": p.file_url, "photo_type": p.photo_type, "file_name": p.file_name}
        for p in photos_r.scalars().all()
    ]
    forms_r = await db.execute(select(WorkOrderServiceForm).where(WorkOrderServiceForm.work_order_id == wo.id))
    has_form = forms_r.scalars().first() is not None

    return PublicWorkOrderRead(
        id=wo.id,
        project_id=wo.project_id,
        project_name=proj.name if proj else "—",
        project_no=proj.project_no if proj else None,
        project_address=_parse_project_address(proj),
        project_phone=_parse_project_phone(proj),
        work_type=work_type,
        work_type_label=WORK_TYPE_LABELS.get(work_type, work_type),
        title=wo.title,
        description=wo.description,
        priority=_workflow_value(wo.priority),
        status=_workflow_value(wo.status),
        location_url=wo.location_url,
        due_date=wo.due_date,
        photos=photos,
        has_service_form=has_form,
    )


@public_router.post("/work-orders/{token}/submit")
async def public_submit_work_order(
    token: str,
    payload: PublicSubmit,
    db: AsyncSession = Depends(get_db),
):
    link, wo, proj = await _resolve_token(token, db)

    new_status = payload.status

    # Zorunluluk kontrolleri
    if new_status == "completed":
        photos_r = await db.execute(select(WorkOrderPhoto).where(WorkOrderPhoto.work_order_id == wo.id))
        photos = photos_r.scalars().all()
        if len(photos) == 0:
            raise HTTPException(400, "İşi tamamlandı olarak kapatmak için en az bir fotoğraf yüklemelisiniz.")

        if _workflow_value(wo.work_type) == "maintenance":
            forms_r = await db.execute(select(WorkOrderServiceForm).where(WorkOrderServiceForm.work_order_id == wo.id))
            if not forms_r.scalars().first():
                raise HTTPException(400, "Bakım işini tamamlamak için servis formu yüklemelisiniz.")

    wo.status = new_status
    if payload.completion_notes:
        wo.completion_notes = payload.completion_notes
    if new_status == "started" and not wo.started_at:
        wo.started_at = utc_now()
    if new_status in ("completed", "failed"):
        wo.completed_at = utc_now()

    status_labels = {
        "started":          "İşe başlandı",
        "completed":        "İş tamamlandı",
        "failed":           "İş tamamlanamadı olarak bildirildi",
        "cancelled":        "İş iptal edildi",
        "material_waiting": "Malzeme bekleniyor",
        "revisit":          "Tekrar gidilecek olarak işaretlendi",
    }
    activity_title = status_labels.get(new_status, f"Durum güncellendi: {new_status}")

    await _log_activity(db, wo.id, wo.project_id, new_status, activity_title, payload.completion_notes)

    # "İş Tamamlandı" ise Onay Süreçleri'ne kayıt düş (is_tamamlandi onayı)
    if new_status == "completed":
        existing_approval = await db.execute(
            select(StoreApprovalRequest).where(
                StoreApprovalRequest.approval_type == "is_tamamlandi",
                StoreApprovalRequest.description == str(wo.id),  # work_order_id referansı
            )
        )
        if not existing_approval.scalar_one_or_none():
            db.add(StoreApprovalRequest(
                id=uuid4(),
                tenant_id=wo.tenant_id,
                project_id=wo.project_id,
                approval_type="is_tamamlandi",
                title=f"İş Tamamlandı: {wo.title}",
                description=str(wo.id),   # work_order_id sakla, duplicate kontrolü için
                amount=None,
                status="bekliyor",
                requested_by_name=wo.assigned_to_name or "Saha",
                requested_at=utc_now(),
                created_at=utc_now(),
                updated_at=utc_now(),
            ))

    await db.commit()

    return {"success": True, "status": new_status}


@public_router.post("/work-orders/{token}/photos", status_code=201)
async def public_upload_photo(
    token: str,
    photo_type: str = Form("completion"),
    uploaded_by_name: str = Form(""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    link, wo, proj = await _resolve_token(token, db)

    content = await file.read()
    safe_name = sanitize_filename(file.filename or "photo.jpg")
    file_key = f"work-orders/{wo.id}/photos/{int(time.time())}_{safe_name}"

    uploaded_key = await storage.upload_file(
        file_content=content, file_key=file_key, content_type=file.content_type
    )
    file_url = await storage.generate_presigned_url(uploaded_key)

    photo = WorkOrderPhoto(
        id=uuid4(), work_order_id=wo.id,
        file_key=uploaded_key, file_url=file_url,
        file_name=file.filename, file_size_bytes=len(content),
        mime_type=file.content_type, photo_type=photo_type,
        uploaded_by_name=uploaded_by_name or None, uploaded_at=utc_now(),
    )
    db.add(photo)

    await _log_activity(db, wo.id, wo.project_id, "photo_uploaded", "Fotoğraf yüklendi")
    await db.commit()

    return {"id": str(photo.id), "file_url": file_url}


@public_router.post("/work-orders/{token}/service-form", status_code=201)
async def public_upload_service_form(
    token: str,
    uploaded_by_name: str = Form(""),
    year:  int = Form(...),
    month: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    link, wo, proj = await _resolve_token(token, db)

    content = await file.read()
    safe_name = sanitize_filename(file.filename or "servis-formu.pdf")
    file_key = f"work-orders/{wo.id}/service-forms/{int(time.time())}_{safe_name}"

    uploaded_key = await storage.upload_file(
        file_content=content, file_key=file_key, content_type=file.content_type
    )
    file_url = await storage.generate_presigned_url(uploaded_key)

    form = WorkOrderServiceForm(
        id=uuid4(), work_order_id=wo.id, project_id=wo.project_id,
        year=year, month=month,
        file_key=uploaded_key, file_url=file_url,
        file_name=file.filename, file_size_bytes=len(content),
        uploaded_by_name=uploaded_by_name or None, uploaded_at=utc_now(),
    )
    db.add(form)

    # Bakım & Onarım > Servis Formları ekranına da düş
    # (StoreServiceForm tablosuna da yaz, böylece bakim/servis-formlari sayfası görebilir)
    existing_store_form = await db.execute(
        select(StoreServiceForm).where(
            StoreServiceForm.project_id == wo.project_id,
            StoreServiceForm.year == year,
            StoreServiceForm.month == month,
        )
    )
    if not existing_store_form.scalar_one_or_none():
        db.add(StoreServiceForm(
            id=uuid4(),
            tenant_id=wo.tenant_id,
            project_id=wo.project_id,
            year=year, month=month,
            file_url=file_url,
            file_name=file.filename,
            file_size_bytes=len(content),
            uploaded_by_name=uploaded_by_name or "Saha (İş Emri)",
            description=f"İş emri #{wo.id} üzerinden yüklendi",
            status="uploaded",
            created_at=utc_now(),
            updated_at=utc_now(),
        ))

    await _log_activity(db, wo.id, wo.project_id, "service_form_uploaded", "Servis formu yüklendi")
    await db.commit()

    return {"id": str(form.id), "file_url": file_url}


# ═══════════════════════════════════════════════════════════════════════════════
#  WEBHOOK — WhatsApp durum güncellemeleri
# ═══════════════════════════════════════════════════════════════════════════════

webhook_router = APIRouter()


@webhook_router.get("/whatsapp")
async def whatsapp_webhook_verify(
    request: Request,
    hub_mode: Optional[str] = None,
    hub_verify_token: Optional[str] = None,
    hub_challenge: Optional[str] = None,
):
    from fastapi.responses import PlainTextResponse
    verify_token = whatsapp_service.verify_token
    params = dict(request.query_params)
    mode      = params.get("hub.mode")
    token     = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == verify_token:
        return PlainTextResponse(challenge or "")
    raise HTTPException(403, "Doğrulama başarısız.")


@webhook_router.post("/whatsapp")
async def whatsapp_webhook_receive(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        data = await request.json()
        for entry in data.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for status_update in value.get("statuses", []):
                    msg_id     = status_update.get("id")
                    new_status = status_update.get("status")  # sent | delivered | read | failed

                    if not msg_id or not new_status:
                        continue

                    status_map = {
                        "sent":      WorkOrderWhatsappStatus.SENT,
                        "delivered": WorkOrderWhatsappStatus.DELIVERED,
                        "read":      WorkOrderWhatsappStatus.READ,
                        "failed":    WorkOrderWhatsappStatus.FAILED,
                    }
                    mapped = status_map.get(new_status)
                    if not mapped:
                        continue

                    result = await db.execute(
                        select(WorkOrderWhatsappMessage).where(
                            WorkOrderWhatsappMessage.whatsapp_message_id == msg_id
                        )
                    )
                    wa_msg = result.scalar_one_or_none()
                    if wa_msg:
                        wa_msg.status = mapped
                        await db.commit()
    except Exception:
        pass
    return {"status": "ok"}
