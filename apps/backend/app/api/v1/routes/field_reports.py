# ─────────────────────────────────────────────────────────────────────────────
#  V1 — Field Reports Routes  (Saha Günlük Raporları)
# ─────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.core.exceptions import NotFoundError
from app.db.models import (
    FieldReport, FieldReportItem, FieldReportActivityType,
    Project, User,
)
from app.db.schemas import (
    FieldReportCreate, FieldReportRead,
    FieldReportItemCreate, FieldReportItemRead,
)

router = APIRouter()


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _enrich_report(report: FieldReport, db: AsyncSession) -> FieldReportRead:
    """Raporu proje adı, yazar adı ve aktivite satırlarıyla zenginleştir."""
    proj   = await db.get(Project, report.project_id)
    author = await db.get(User, report.author_id)

    items_result = await db.execute(
        select(FieldReportItem)
        .where(FieldReportItem.report_id == report.id)
        .order_by(FieldReportItem.sort_order)
    )
    items = list(items_result.scalars())

    data = FieldReportRead.model_validate(report)
    data.project_name = proj.name   if proj   else None
    data.author_name  = author.full_name if author else None
    data.items        = [FieldReportItemRead.model_validate(i) for i in items]
    return data


# ─────────────────────────────────────────────────────────────────────────────
#  Listeleme & Detay
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[FieldReportRead])
async def list_reports(
    db:          AsyncSession   = Depends(get_db),
    user:        User           = Depends(get_current_user),
    project_id:  UUID | None    = None,
    submitted:   bool | None    = None,
    approved:    bool | None    = None,
    skip:        int            = 0,
    limit:       int            = 100,
):
    query = select(FieldReport)

    # Geliştirici admin tüm raporları görür; diğerleri sadece kendi tenant'larını
    if not is_platform_admin(user):
        query = query.join(Project, FieldReport.project_id == Project.id)
        query = query.where(Project.tenant_id == user.tenant_id)
        # Mühendisler sadece kendi raporlarını listeler; adminler tümünü
        if user.default_role not in ("admin",):
            query = query.where(FieldReport.author_id == user.id)

    if project_id:
        query = query.where(FieldReport.project_id == project_id)
    if submitted is not None:
        query = query.where(FieldReport.submitted == submitted)
    if approved is not None:
        if approved:
            query = query.where(FieldReport.approved_by.isnot(None))
        else:
            query = query.where(FieldReport.approved_by.is_(None))

    query = query.order_by(FieldReport.report_date.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    rows   = list(result.scalars())

    return [await _enrich_report(r, db) for r in rows]


@router.get("/{report_id}", response_model=FieldReportRead)
async def get_report(
    report_id: UUID,
    db:        AsyncSession = Depends(get_db),
    user:      User         = Depends(get_current_user),
):
    report = await db.get(FieldReport, report_id)
    if not report:
        raise NotFoundError(detail="Rapor bulunamadı.")

    if not is_platform_admin(user):
        proj = await db.get(Project, report.project_id)
        if not proj or str(proj.tenant_id) != str(user.tenant_id):
            raise HTTPException(status_code=403, detail="Bu rapor firma kapsamınız dışında.")
        if user.default_role not in ("admin",) and str(report.author_id) != str(user.id):
            raise HTTPException(status_code=403, detail="Bu raporu görüntüleme yetkiniz yok.")

    return await _enrich_report(report, db)


# ─────────────────────────────────────────────────────────────────────────────
#  Rapor Oluşturma
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/", response_model=FieldReportRead, status_code=201)
async def create_report(
    payload: FieldReportCreate,
    db:      AsyncSession = Depends(get_db),
    user:    User         = Depends(get_current_user),
):
    proj = await db.get(Project, payload.project_id)
    if not proj:
        raise NotFoundError(detail="Proje bulunamadı.")
    if not is_platform_admin(user) and str(proj.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=403, detail="Bu proje firma kapsamınız dışında.")

    report_date = payload.report_date
    if report_date and report_date.tzinfo:
        report_date = report_date.replace(tzinfo=None)

    report = FieldReport(
        project_id   = payload.project_id,
        author_id    = user.id,
        report_date  = report_date,
        summary      = payload.summary,
        weather      = payload.weather,
        team_size    = payload.team_size,
        hours_worked = payload.hours_worked,
        submitted    = False,
    )
    db.add(report)
    await db.flush()

    for idx, item_in in enumerate(payload.items):
        item = FieldReportItem(
            report_id      = report.id,
            activity_type  = FieldReportActivityType(item_in.activity_type),
            description    = item_in.description,
            location       = item_in.location,
            hours_spent    = item_in.hours_spent,
            workers_count  = item_in.workers_count,
            sort_order     = item_in.sort_order or idx,
        )
        db.add(item)

    await db.commit()
    await db.refresh(report)
    return await _enrich_report(report, db)


# ─────────────────────────────────────────────────────────────────────────────
#  Aktivite Satırı Ekleme
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{report_id}/items", response_model=FieldReportItemRead, status_code=201)
async def add_report_item(
    report_id: UUID,
    payload:   FieldReportItemCreate,
    db:        AsyncSession = Depends(get_db),
    user:      User         = Depends(get_current_user),
):
    report = await db.get(FieldReport, report_id)
    if not report:
        raise NotFoundError(detail="Rapor bulunamadı.")
    if report.submitted:
        raise HTTPException(status_code=400, detail="Gönderilmiş rapora satır eklenemez.")
    if str(report.author_id) != str(user.id) and user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Bu rapora satır ekleme yetkiniz yok.")

    item = FieldReportItem(
        report_id     = report_id,
        activity_type = FieldReportActivityType(payload.activity_type),
        description   = payload.description,
        location      = payload.location,
        hours_spent   = payload.hours_spent,
        workers_count = payload.workers_count,
        sort_order    = payload.sort_order,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


# ─────────────────────────────────────────────────────────────────────────────
#  Rapor Gönderme (Submit) — Mühendis onaya sunar
# ─────────────────────────────────────────────────────────────────────────────

@router.patch("/{report_id}/submit", response_model=FieldReportRead)
async def submit_report(
    report_id: UUID,
    db:        AsyncSession = Depends(get_db),
    user:      User         = Depends(get_current_user),
):
    report = await db.get(FieldReport, report_id)
    if not report:
        raise NotFoundError(detail="Rapor bulunamadı.")
    if str(report.author_id) != str(user.id) and user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Bu raporu gönderme yetkiniz yok.")
    if report.submitted:
        raise HTTPException(status_code=400, detail="Rapor zaten gönderilmiş.")

    report.submitted = True
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return await _enrich_report(report, db)


# ─────────────────────────────────────────────────────────────────────────────
#  Rapor Onaylama (Approve) — Admin onaylar
# ─────────────────────────────────────────────────────────────────────────────

@router.patch("/{report_id}/approve", response_model=FieldReportRead)
async def approve_report(
    report_id: UUID,
    db:        AsyncSession = Depends(get_db),
    user:      User         = Depends(get_current_user),
):
    if user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Sadece yöneticiler raporu onaylayabilir.")

    report = await db.get(FieldReport, report_id)
    if not report:
        raise NotFoundError(detail="Rapor bulunamadı.")
    if not report.submitted:
        raise HTTPException(status_code=400, detail="Henüz gönderilmemiş rapor onaylanamaz.")
    if report.approved_by:
        raise HTTPException(status_code=400, detail="Rapor zaten onaylanmış.")

    report.approved_by = user.id
    report.approved_at = utc_now()
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return await _enrich_report(report, db)


# ─────────────────────────────────────────────────────────────────────────────
#  Rapor Silme (sadece taslak haldeyken)
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: UUID,
    db:        AsyncSession = Depends(get_db),
    user:      User         = Depends(get_current_user),
):
    report = await db.get(FieldReport, report_id)
    if not report:
        raise NotFoundError(detail="Rapor bulunamadı.")
    if report.submitted:
        raise HTTPException(status_code=400, detail="Gönderilmiş rapor silinemez.")
    if str(report.author_id) != str(user.id) and user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Bu raporu silme yetkiniz yok.")

    # Aktivite satırlarını sil
    items_result = await db.execute(
        select(FieldReportItem).where(FieldReportItem.report_id == report_id)
    )
    for item in items_result.scalars():
        await db.delete(item)

    await db.delete(report)
    await db.commit()
