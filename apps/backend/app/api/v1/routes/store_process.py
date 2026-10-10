"""
Süreç Takibi API — Tadilat / Yeni Yapım İş Süreçleri
Routes: /api/v1/process/...
"""

from __future__ import annotations

import ast
import json
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.db.models import (
    Branch,
    Project,
    StoreActivity,
    StoreApprovalRequest,
    StoreInvoiceRecord,
    StoreProcess,
    StoreProcessNote,
    StoreProcessStage,
    StoreProgressPayment,
    User,
)
from app.db.schemas import (
    ActiveJobRead,
    CompletedJobRead,
    StoreBulkProcessCreate,
    StoreActivityRead,
    StoreProcessCreate,
    StoreProcessNoteCreate,
    StoreProcessNoteRead,
    StoreProcessRead,
    StoreProcessStageRead,
    StoreProcessStageUpdate,
    StoreProcessUpdate,
)

router = APIRouter()


async def _mark_project_existing(db: AsyncSession, project_id: UUID) -> None:
    """Yeni Yapım süreci tamamlandığında mağazayı 'existing_store' olarak işaretle."""
    result  = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        return
    # description.store_type → "existing_store"
    desc: dict = {}
    if project.description:
        try:
            desc = json.loads(project.description)
        except (json.JSONDecodeError, TypeError):
            try:
                desc = ast.literal_eval(project.description)
            except Exception:
                desc = {}
    desc["store_type"] = "existing_store"
    project.description = json.dumps(desc, ensure_ascii=False)
    # scope_codes'dan "yeni_yapim" kaldır
    raw = getattr(project, "scope_codes", []) or []
    if isinstance(raw, str):
        try:
            raw = ast.literal_eval(raw)
        except Exception:
            raw = []
    codes = [c for c in raw if c != "yeni_yapim"]
    project.scope_codes = json.dumps(codes, ensure_ascii=False)


# ── Scope'a özel aşama şablonları ─────────────────────────────────────────────

# Bakım ve genel işler için varsayılan aşamalar
DEFAULT_STAGES = [
    "Proje Başlatıldı",
    "Keşif / Ön Hazırlık",
    "Çizim Hazırlanıyor",
    "İç Kontrol",
    "Onay Aşamasında",
    "Uygulama Devam Ediyor",
    "Revizyon / Düzeltme",
    "Tamamlandı",
]

# Tüm tadilat türleri için ortak 7 aşama
TADILAT_DEFAULT_STAGES = [
    "Keşif",
    "Proje Onayı",
    "Fiyat Onayı",
    "Malzeme Hazırlığı",
    "Montaj / Uygulama",
    "Test ve Kontrol",
    "Hakediş / Fatura",
]

SCOPE_STAGES: dict[str, list[str]] = {
    "yangin_dolabi":   TADILAT_DEFAULT_STAGES,
    "sprinkler_hatti": TADILAT_DEFAULT_STAGES,
    "havalandirma":    TADILAT_DEFAULT_STAGES,
    "kanal_imalati":   TADILAT_DEFAULT_STAGES,
    "klima_sogutma":   TADILAT_DEFAULT_STAGES,
    "mekanik_tesisat": TADILAT_DEFAULT_STAGES,
    "diger":           TADILAT_DEFAULT_STAGES,
}

SCOPE_LABELS: dict[str, str] = {
    "yangin_dolabi":   "Yangın Dolabı",
    "sprinkler_hatti": "Sprinkler Hattı",
    "havalandirma":    "Havalandırma Projesi",
    "kanal_imalati":   "Kanal İmalatı",
    "klima_sogutma":   "Klima / Soğutma",
    "mekanik_tesisat": "Mekanik Tesisat",
    "diger":           "Diğer",
}


def get_scope_stages(scope_code: str, work_type: str = "tadilat") -> list[str]:
    if scope_code in SCOPE_STAGES:
        return SCOPE_STAGES[scope_code]
    # Tadilat için özel varsayılan, diğerleri için genel varsayılan
    return TADILAT_DEFAULT_STAGES if work_type == "tadilat" else DEFAULT_STAGES


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def calc_days_remaining(target: datetime | None) -> int | None:
    if not target:
        return None
    delta = (target.date() - datetime.now(timezone.utc).date())
    return delta.days


def _build_process_read(
    proc: StoreProcess,
    stages: list,
    project_name: str | None = None,
    project_no: str | None = None,
    store_address: str | None = None,
) -> StoreProcessRead:
    """SQLAlchemy lazy-loading'i tetiklemeden StoreProcessRead oluşturur."""
    return StoreProcessRead(
        id=proc.id,
        project_id=proc.project_id,
        tenant_id=proc.tenant_id,
        work_type=proc.work_type,
        title=proc.title,
        description=proc.description,
        status=proc.status,
        start_date=proc.start_date,
        target_end_date=proc.target_end_date,
        completed_at=proc.completed_at,
        responsible_name=proc.responsible_name,
        progress_percent=proc.progress_percent,
        created_by=proc.created_by,
        created_at=proc.created_at,
        updated_at=proc.updated_at,
        stages=[StoreProcessStageRead.model_validate(s) for s in stages],
        project_name=project_name,
        project_no=project_no,
        store_address=store_address,
    )


async def _get_project_or_404(db: AsyncSession, project_id: UUID, tenant_id: UUID) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.tenant_id == tenant_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Mağaza bulunamadı.")
    return project


async def _get_process_or_404(db: AsyncSession, process_id: UUID) -> StoreProcess:
    result = await db.execute(
        select(StoreProcess).where(StoreProcess.id == process_id)
    )
    proc = result.scalar_one_or_none()
    if not proc:
        raise HTTPException(status_code=404, detail="Süreç bulunamadı.")
    return proc


async def _log_activity(
    db: AsyncSession,
    project_id: UUID,
    tenant_id: UUID | None,
    user: User,
    activity_type: str,
    title: str,
    description: str | None = None,
    process_id: UUID | None = None,
    stage_id: UUID | None = None,
) -> None:
    activity = StoreActivity(
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=user.id,
        user_name=user.full_name or user.email,
        activity_type=activity_type,
        title=title,
        description=description,
        related_process_id=process_id,
        related_stage_id=stage_id,
        created_at=utc_now(),
    )
    db.add(activity)


# ── GET /process/projects/{project_id}/process ────────────────────────────────

@router.get("/projects/{project_id}/process", response_model=list[StoreProcessRead])
async def get_project_processes(
    project_id:       UUID,
    include_deleted:  bool = False,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Bir mağazanın tüm süreçlerini listeler. Silinen süreçler varsayılan olarak hariç tutulur."""
    # Mağaza adı, kodu ve adresini çek
    proj_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.tenant_id == user.tenant_id)
    )
    project = proj_result.scalar_one_or_none()
    project_name  = project.name       if project else None
    project_no    = project.project_no if project else None
    store_address = None
    if project:
        branch = await db.get(Branch, project.branch_id)
        store_address = branch.address if branch else None

    filters = [StoreProcess.project_id == project_id]
    if not include_deleted:
        filters.append(StoreProcess.status != "deleted")
    result = await db.execute(
        select(StoreProcess)
        .where(*filters)
        .order_by(desc(StoreProcess.created_at))
    )
    processes = result.scalars().all()

    out = []
    for proc in processes:
        stages_result = await db.execute(
            select(StoreProcessStage)
            .where(StoreProcessStage.process_id == proc.id)
            .order_by(StoreProcessStage.order_index)
        )
        stages = stages_result.scalars().all()
        out.append(_build_process_read(proc, stages, project_name=project_name, project_no=project_no, store_address=store_address))
    return out


# ── POST /process/projects/{project_id}/process ───────────────────────────────

@router.post("/projects/{project_id}/process", response_model=StoreProcessRead, status_code=201)
async def create_process(
    project_id: UUID,
    body: StoreProcessCreate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Yeni tadilat / yeni yapım süreci başlatır. Aşamalar otomatik oluşur."""
    project = await _get_project_or_404(db, project_id, user.tenant_id)

    proc = StoreProcess(
        tenant_id=user.tenant_id,
        project_id=project_id,
        work_type=body.work_type,
        title=body.title,
        description=body.description,
        status="in_progress",
        start_date=body.start_date or utc_now(),
        target_end_date=body.target_end_date,
        responsible_name=body.responsible_name,
        progress_percent=0,
        created_by=user.id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(proc)
    await db.flush()  # ID alabilmek için

    # Aşamalar oluştur (scope_code varsa scope'a özel şablon, yoksa iş tipine göre varsayılan)
    stage_names = get_scope_stages(body.scope_code, body.work_type) if body.scope_code else (
        TADILAT_DEFAULT_STAGES if body.work_type == "tadilat" else DEFAULT_STAGES
    )
    for i, stage_name in enumerate(stage_names):
        stage = StoreProcessStage(
            process_id=proc.id,
            name=stage_name,
            order_index=i,
            status="in_progress" if i == 0 else "waiting",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(stage)

    # Aktivite kaydı
    work_label = {"tadilat": "Tadilat", "yeni_yapim": "Yeni Yapım", "bakim": "Bakım"}.get(body.work_type, body.work_type)
    await _log_activity(
        db, project_id, user.tenant_id, user,
        activity_type="process_started",
        title=f"{work_label} süreci başlatıldı",
        description=body.title,
        process_id=proc.id,
    )

    await db.commit()

    stages_result = await db.execute(
        select(StoreProcessStage)
        .where(StoreProcessStage.process_id == proc.id)
        .order_by(StoreProcessStage.order_index)
    )
    stages = stages_result.scalars().all()
    return _build_process_read(proc, stages)


# ── POST /process/projects/{project_id}/process/bulk ─────────────────────────

@router.post("/projects/{project_id}/process/bulk", response_model=list[StoreProcessRead], status_code=201)
async def create_bulk_processes(
    project_id: UUID,
    body: StoreBulkProcessCreate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Wizard: seçilen her scope için ayrı süreç + scope'a özel aşamalar oluşturur."""
    await _get_project_or_404(db, project_id, user.tenant_id)

    scope_codes = body.scope_codes if body.scope_codes else ["diger"]
    created_procs: list[tuple[StoreProcess, list[StoreProcessStage]]] = []

    for scope_code in scope_codes:
        scope_label = SCOPE_LABELS.get(scope_code, scope_code)
        proc_title  = f"{body.title} — {scope_label}" if len(scope_codes) > 1 else body.title
        desc_json   = f'{{"scope":"{scope_code}","base_title":"{body.title}"}}'

        proc = StoreProcess(
            tenant_id=user.tenant_id,
            project_id=project_id,
            work_type=body.work_type,
            title=proc_title,
            description=desc_json,
            status="in_progress",
            start_date=body.start_date or utc_now(),
            target_end_date=body.target_end_date,
            responsible_name=body.responsible_name,
            progress_percent=0,
            created_by=user.id,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(proc)
        await db.flush()

        stage_names = get_scope_stages(scope_code)
        for i, stage_name in enumerate(stage_names):
            stage = StoreProcessStage(
                process_id=proc.id,
                name=stage_name,
                order_index=i,
                status="in_progress" if i == 0 else "waiting",
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            db.add(stage)

        await _log_activity(
            db, project_id, user.tenant_id, user,
            activity_type="process_started",
            title=f"Yeni Yapım süreci başlatıldı — {scope_label}",
            process_id=proc.id,
        )
        created_procs.append((proc, []))

    await db.commit()

    result_list: list[StoreProcessRead] = []
    for proc, _ in created_procs:
        stages_result = await db.execute(
            select(StoreProcessStage)
            .where(StoreProcessStage.process_id == proc.id)
            .order_by(StoreProcessStage.order_index)
        )
        stages = stages_result.scalars().all()
        result_list.append(_build_process_read(proc, stages))
    return result_list


# ── PATCH /process/projects/{project_id}/process/{process_id}/cancel ──────────

@router.patch(
    "/projects/{project_id}/process/{process_id}/cancel",
    response_model=StoreProcessRead,
)
async def cancel_process(
    project_id:  UUID,
    process_id:  UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Süreci iptal eder — kayıt sistemde kalır, durum 'cancelled' olur."""
    proc = await _get_process_or_404(db, process_id)
    if proc.project_id != project_id:
        raise HTTPException(status_code=404, detail="Süreç bulunamadı.")

    proc.status     = "cancelled"
    proc.updated_at = utc_now()

    await _log_activity(
        db, proc.project_id, proc.tenant_id, user,
        activity_type="process_cancelled",
        title="Süreç iptal edildi",
        process_id=proc.id,
    )
    await db.commit()

    stages_result = await db.execute(
        select(StoreProcessStage)
        .where(StoreProcessStage.process_id == proc.id)
        .order_by(StoreProcessStage.order_index)
    )
    stages = stages_result.scalars().all()
    return _build_process_read(proc, stages)


# ── DELETE /process/projects/{project_id}/process/{process_id} ────────────────

@router.delete(
    "/projects/{project_id}/process/{process_id}",
    status_code=204,
)
async def delete_process(
    project_id:  UUID,
    process_id:  UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Süreci siler (soft delete — status='deleted'). Mağaza kaydına dokunmaz.
    Bağlı hakkediş veya fatura varsa 409 döner. Bağlı onay talepleri iptal edilir."""
    proc = await _get_process_or_404(db, process_id)
    if proc.project_id != project_id:
        raise HTTPException(status_code=404, detail="Süreç bulunamadı.")

    # Bağlı hakkediş kontrolü
    pay_result = await db.execute(
        select(StoreProgressPayment).where(StoreProgressPayment.process_id == process_id).limit(1)
    )
    if pay_result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Bu tadilatın bağlı hakkediş/fatura kayıtları var. Önce bu kayıtları silin veya süreç iptal edilsin.",
        )

    # Bağlı fatura kontrolü
    inv_result = await db.execute(
        select(StoreInvoiceRecord).where(StoreInvoiceRecord.process_id == process_id).limit(1)
    )
    if inv_result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Bu tadilatın bağlı hakkediş/fatura kayıtları var. Önce bu kayıtları silin veya süreç iptal edilsin.",
        )

    # Bağlı bekleyen onayları iptal et
    approvals_result = await db.execute(
        select(StoreApprovalRequest).where(
            StoreApprovalRequest.process_id == process_id,
            StoreApprovalRequest.status == "bekliyor",
        )
    )
    for approval in approvals_result.scalars().all():
        approval.status = "iptal"

    proc.status     = "deleted"
    proc.updated_at = utc_now()

    await _log_activity(
        db, proc.project_id, proc.tenant_id, user,
        activity_type="process_deleted",
        title="Süreç silindi",
        process_id=proc.id,
    )
    await db.commit()


# ── PATCH /process/projects/{project_id}/process/{process_id} ─────────────────

@router.patch("/projects/{project_id}/process/{process_id}", response_model=StoreProcessRead)
async def update_process(
    project_id:  UUID,
    process_id:  UUID,
    body: StoreProcessUpdate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    proc = await _get_process_or_404(db, process_id)

    for field, value in body.model_dump(exclude_none=True).items():
        if isinstance(value, datetime) and value.tzinfo is not None:
            value = value.replace(tzinfo=None)
        setattr(proc, field, value)
    proc.updated_at = utc_now()

    if body.status == "completed" and getattr(proc, "work_type", None) == "yeni_yapim":
        other = await db.execute(
            select(StoreProcess).where(
                StoreProcess.project_id == proc.project_id,
                StoreProcess.work_type == "yeni_yapim",
                StoreProcess.status != "completed",
                StoreProcess.id != proc.id,
            )
        )
        if not other.scalars().first():
            await _mark_project_existing(db, proc.project_id)

    log_title = "Tadilat süreci tamamlandı" if body.status == "completed" else "Süreç güncellendi"
    await _log_activity(
        db, proc.project_id, proc.tenant_id, user,
        activity_type="process_updated",
        title=log_title,
        process_id=proc.id,
    )

    await db.commit()

    stages_result = await db.execute(
        select(StoreProcessStage)
        .where(StoreProcessStage.process_id == proc.id)
        .order_by(StoreProcessStage.order_index)
    )
    stages = stages_result.scalars().all()
    return _build_process_read(proc, stages)


# ── PATCH /process/projects/{project_id}/process/{process_id}/stages/{stage_id}

@router.patch(
    "/projects/{project_id}/process/{process_id}/stages/{stage_id}",
    response_model=StoreProcessStageRead,
)
async def update_stage(
    project_id: UUID,
    process_id: UUID,
    stage_id:   UUID,
    body: StoreProcessStageUpdate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(StoreProcessStage).where(
            StoreProcessStage.id == stage_id,
            StoreProcessStage.process_id == process_id,
        )
    )
    stage = result.scalar_one_or_none()
    if not stage:
        raise HTTPException(status_code=404, detail="Aşama bulunamadı.")

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        if isinstance(value, datetime) and value.tzinfo is not None:
            value = value.replace(tzinfo=None)
        setattr(stage, field, value)
    if body.status == "completed" and not stage.completed_at:
        stage.completed_at = utc_now()
    stage.updated_at = utc_now()

    # Süreci güncelle: tamamlanan aşama sayısına göre progress
    proc = await _get_process_or_404(db, process_id)
    stages_result = await db.execute(
        select(StoreProcessStage).where(StoreProcessStage.process_id == process_id)
    )
    all_stages = stages_result.scalars().all()
    completed = sum(1 for s in all_stages if s.id == stage_id and body.status == "completed") + \
                sum(1 for s in all_stages if s.id != stage_id and s.status == "completed")
    proc.progress_percent = round(completed / len(all_stages) * 100) if all_stages else 0
    # Tadilat süreçleri için otomatik tamamlama yapma — frontend onay modalı üzerinden kontrol eder
    if proc.progress_percent == 100 and proc.work_type != "tadilat":
        proc.status = "completed"
        proc.completed_at = utc_now()
        if getattr(proc, "work_type", None) == "yeni_yapim":
            other = await db.execute(
                select(StoreProcess).where(
                    StoreProcess.project_id == proc.project_id,
                    StoreProcess.work_type == "yeni_yapim",
                    StoreProcess.status != "completed",
                    StoreProcess.id != proc.id,
                )
            )
            if not other.scalars().first():
                await _mark_project_existing(db, proc.project_id)
    proc.updated_at = utc_now()

    # Aktivite
    status_labels = {
        "in_progress": "devam ediyor", "completed": "tamamlandı",
        "waiting": "beklemeye alındı", "delayed": "beklemeye alındı",
        "cancelled": "iptal edildi", "pending": "beklemeye alındı",
    }
    await _log_activity(
        db, proc.project_id, proc.tenant_id, user,
        activity_type="stage_updated",
        title=f'"{stage.name}" aşaması {status_labels.get(body.status or stage.status, "güncellendi")}',
        process_id=proc.id,
        stage_id=stage_id,
    )

    await db.commit()
    return StoreProcessStageRead.model_validate(stage)


# ── POST /process/projects/{project_id}/process/{process_id}/notes ────────────

@router.post(
    "/projects/{project_id}/process/{process_id}/notes",
    response_model=StoreProcessNoteRead,
    status_code=201,
)
async def add_note(
    project_id: UUID,
    process_id: UUID,
    body: StoreProcessNoteCreate,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    proc = await _get_process_or_404(db, process_id)

    note = StoreProcessNote(
        process_id=process_id,
        stage_id=body.stage_id,
        user_id=user.id,
        user_name=user.full_name or user.email,
        note_type=body.note_type,
        content=body.content,
        created_at=utc_now(),
    )
    db.add(note)

    await _log_activity(
        db, proc.project_id, proc.tenant_id, user,
        activity_type="note_added",
        title="Süreç notu eklendi",
        description=body.content[:100] if body.content else None,
        process_id=proc.id,
    )

    await db.commit()
    return StoreProcessNoteRead.model_validate(note)


# ── GET /process/projects/{project_id}/process/{process_id}/notes ─────────────

@router.get(
    "/projects/{project_id}/process/{process_id}/notes",
    response_model=list[StoreProcessNoteRead],
)
async def get_notes(
    project_id: UUID,
    process_id: UUID,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(StoreProcessNote)
        .where(StoreProcessNote.process_id == process_id)
        .order_by(desc(StoreProcessNote.created_at))
    )
    return [StoreProcessNoteRead.model_validate(n) for n in result.scalars().all()]


# ── GET /process/projects/{project_id}/activities ─────────────────────────────

@router.get("/projects/{project_id}/activities", response_model=list[StoreActivityRead])
async def get_activities(
    project_id: UUID,
    limit: int = 30,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(StoreActivity)
        .where(StoreActivity.project_id == project_id)
        .order_by(desc(StoreActivity.created_at))
        .limit(limit)
    )
    return [StoreActivityRead.model_validate(a) for a in result.scalars().all()]


# ── GET /process/active-jobs ──────────────────────────────────────────────────

@router.get("/active-jobs", response_model=list[ActiveJobRead])
async def get_active_jobs(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Ana sayfadaki 'Aktif İşler' paneli için — tadilat/yeni yapım aktif süreçler."""
    result = await db.execute(
        select(StoreProcess, Project)
        .join(Project, StoreProcess.project_id == Project.id)
        .where(
            StoreProcess.tenant_id == user.tenant_id,
            StoreProcess.status.in_(["in_progress", "pending"]),
            StoreProcess.work_type.in_(["tadilat", "yeni_yapim"]),
        )
        .order_by(StoreProcess.target_end_date.asc().nulls_last())
        .limit(50)
    )
    rows = result.all()

    out = []
    for proc, project in rows:
        # Aktif aşama
        stages_r = await db.execute(
            select(StoreProcessStage)
            .where(
                StoreProcessStage.process_id == proc.id,
                StoreProcessStage.status == "in_progress",
            )
            .order_by(StoreProcessStage.order_index)
            .limit(1)
        )
        current_stage_obj = stages_r.scalar_one_or_none()
        current_stage = current_stage_obj.name if current_stage_obj else None

        out.append(ActiveJobRead(
            project_id=project.id,
            project_name=project.name,
            project_no=project.project_no,
            work_type=proc.work_type,
            process_id=proc.id,
            process_title=proc.title,
            process_status=proc.status,
            current_stage=current_stage,
            target_end_date=proc.target_end_date,
            days_remaining=calc_days_remaining(proc.target_end_date),
        ))
    return out


# ── GET /process/completed-jobs ───────────────────────────────────────────────

@router.get("/completed-jobs", response_model=list[CompletedJobRead])
async def get_completed_jobs(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    """Tamamlanan süreçler — tadilat ve yeni_yapim."""
    result = await db.execute(
        select(StoreProcess, Project)
        .join(Project, StoreProcess.project_id == Project.id)
        .where(
            StoreProcess.tenant_id == user.tenant_id,
            StoreProcess.status == "completed",
            StoreProcess.work_type.in_(["tadilat", "yeni_yapim"]),
        )
        .order_by(StoreProcess.completed_at.desc().nulls_last())
    )
    rows = result.all()

    return [
        CompletedJobRead(
            project_id=project.id,
            project_name=project.name,
            project_no=project.project_no,
            work_type=proc.work_type,
            process_id=proc.id,
            process_title=proc.title,
            completed_at=proc.completed_at,
        )
        for proc, project in rows
    ]
