"""Kurulum projeleri ("Proje" iş tipi).

Yeni bir soğutma kurulumu keşiften kapanışa kadar sabit 8 aşamadan geçer. Her aşamanın bir
kontrol listesi ve kapanma şartları vardır (gerekli belge, malzeme hazırlığı, montaj iş
emirlerinin bitmesi vb.); aşamalar sırayla kapanır. Her projenin kendi deposu (kind='project')
vardır: malzeme ana depodan buraya aktarılır, projeye bağlı iş emirleri buradan düşer.

Yalnızca yöneticiler kullanır; teknisyenler projeye bağlı iş emirlerini normal iş emri
ekranlarında görür.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field as SchemaField
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.core.storage import sanitize_filename, storage
from app.services.alerts import manager_ids
from app.core.notifications import notify
from app.db.models import (
    InstallationProject, InstallationProjectChecklistItem, InstallationProjectDocument,
    InstallationProjectMaterial, InstallationProjectStage, Project, RetailBalance, RetailDepot,
    RetailMaterial, RetailMovement, Tenant, User, WorkOrder, utc_now,
)

router = APIRouter()

CLOSED_WORK_ORDER = {"completed", "approved", "cancelled", "failed"}
MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".dwg", ".dxf",
    ".doc", ".docx", ".xls", ".xlsx",
}

DOC_TYPES = {
    "kesif_raporu": "Keşif raporu",
    "fotograf": "Fotoğraf",
    "cizim": "Çizim",
    "teklif": "Teklif",
    "sozlesme": "Onay / sözleşme",
    "test_formu": "Test formu",
    "kabul_tutanagi": "Kabul tutanağı",
    "diger": "Diğer",
}

# (sıra, kod, ad, gerekli belge türleri, ek kural, varsayılan kontrol listesi)
STAGE_TEMPLATE: list[tuple[int, str, str, list[str], Optional[str], list[str]]] = [
    (1, "kesif", "Keşif", ["kesif_raporu", "fotograf"], None,
     ["Yer ölçüleri alındı", "Mevcut durum fotoğraflandı", "Müşteri ihtiyacı not edildi"]),
    (2, "teklif", "Projelendirme ve teklif", ["teklif"], "materials_listed",
     ["Soğutma ihtiyacı hesaplandı", "Çizim hazırlandı", "Malzeme listesi çıkarıldı", "Teklif hazırlandı"]),
    (3, "onay", "Müşteri onayı", ["sozlesme"], None,
     ["Teklif müşteriye iletildi", "Müşteri onayı alındı", "Avans (varsa) alındı"]),
    (4, "malzeme", "Malzeme hazırlığı", [], "materials_ready",
     ["Eksik malzemeler belirlendi", "Malzemeler proje deposuna aktarıldı"]),
    (5, "montaj", "Montaj", [], "work_orders_done",
     ["Ekip ve tarihler planlandı", "Montaj tamamlandı"]),
    (6, "test", "Devreye alma ve test", ["test_formu"], None, []),
    (7, "teslim", "Teslim", ["kabul_tutanagi"], None,
     ["Kullanıcı eğitimi verildi", "Son çizimler teslim edildi"]),
    (8, "kapanis", "Kapanış", [], "depot_empty",
     ["Teklif ile gerçekleşen maliyet karşılaştırıldı", "Hakediş / fatura kesildi"]),
]
STAGE_BY_CODE = {code: (docs, rule) for _, code, _, docs, rule, _ in STAGE_TEMPLATE}
RULE_LABELS = {
    "materials_listed": "Malzeme listesi girilmiş olmalı",
    "materials_ready": "Listedeki tüm malzemeler proje deposunda hazır olmalı",
    "work_orders_done": "En az bir montaj iş emri tamamlanmış ve açık iş emri kalmamış olmalı",
    "depot_empty": "Proje deposunda malzeme kalmamalı (kalan malzeme ana depoya iade edilmeli)",
}


# ── Yardımcılar ──────────────────────────────────────────────────────────────

def _is_manager(user: User) -> bool:
    role = (user.default_role or "").lower()
    return is_platform_admin(user) or role in {"admin", "manager"}


def _require_manager(user: User) -> None:
    if not _is_manager(user):
        raise HTTPException(403, "Projeleri yalnızca yöneticiler yönetebilir.")


async def _tenant_id(db: AsyncSession, user: User) -> UUID:
    if user.tenant_id:
        return user.tenant_id
    tenants = (await db.execute(select(Tenant.id).where(Tenant.is_active == True).limit(2))).scalars().all()  # noqa: E712
    if len(tenants) != 1:
        raise HTTPException(409, "Admin için tek bir aktif firma seçili olmalıdır.")
    return tenants[0]


async def _project(db: AsyncSession, user: User, project_id: UUID) -> InstallationProject:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    project = await db.get(InstallationProject, project_id)
    if not project or project.tenant_id != tenant_id:
        raise HTTPException(404, "Proje bulunamadı.")
    return project


async def _stage_context(db: AsyncSession, user: User, stage_id: UUID) -> tuple[InstallationProjectStage, InstallationProject, bool]:
    """Aşamaya erişim: yönetici her aşamaya, saha kullanıcısı yalnızca sorumlusu olduğu aşamaya erişir."""
    stage = await db.get(InstallationProjectStage, stage_id)
    if not stage:
        raise HTTPException(404, "Aşama bulunamadı.")
    project = await db.get(InstallationProject, stage.project_id)
    manager = _is_manager(user)
    tenant_id = await _tenant_id(db, user) if manager else user.tenant_id
    if not project or project.tenant_id != tenant_id:
        raise HTTPException(404, "Aşama bulunamadı.")
    if not manager and stage.responsible_user_id != user.id:
        raise HTTPException(403, "Bu proje aşamasının sorumlusu değilsiniz.")
    return stage, project, manager


async def _notify_many(db: AsyncSession, recipients: set, *, tenant_id, category: str, title: str, body: str) -> None:
    for user_id in recipients - {None}:
        await notify(db, user_id=user_id, tenant_id=tenant_id, category=category, title=title, body=body)


def _require_active(project: InstallationProject) -> None:
    if project.status != "active":
        raise HTTPException(409, "Kapanmış veya iptal edilmiş projede değişiklik yapılamaz.")


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value[:10])
    except ValueError as error:
        raise HTTPException(422, "Tarih YYYY-AA-GG biçiminde olmalıdır.") from error
    if not 2000 <= parsed.year <= 2100:
        raise HTTPException(422, "Geçerli bir tarih girin (yıl 2000 ile 2100 arasında olmalı).")
    return parsed


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


async def _stages(db: AsyncSession, project_id: UUID) -> list[InstallationProjectStage]:
    rows = await db.execute(select(InstallationProjectStage).where(
        InstallationProjectStage.project_id == project_id).order_by(InstallationProjectStage.stage_order))
    return list(rows.scalars().all())


async def _material_status(db: AsyncSession, project: InstallationProject) -> list[dict]:
    """Planlanan malzeme, proje deposundaki miktar ve bu depodan kullanılan miktar."""
    planned = (await db.execute(
        select(InstallationProjectMaterial, RetailMaterial)
        .join(RetailMaterial, RetailMaterial.id == InstallationProjectMaterial.material_id)
        .where(InstallationProjectMaterial.project_id == project.id)
        .order_by(RetailMaterial.sku)
    )).all()
    balances = dict((await db.execute(
        select(RetailBalance.material_id, RetailBalance.quantity).where(RetailBalance.depot_id == project.depot_id)
    )).all())
    used = dict((await db.execute(
        select(RetailMovement.material_id, func.sum(RetailMovement.quantity))
        .where(RetailMovement.source_depot_id == project.depot_id, RetailMovement.kind == "use")
        .group_by(RetailMovement.material_id)
    )).all())
    rows = []
    for line, material in planned:
        in_depot = balances.get(material.id, Decimal("0"))
        used_qty = used.get(material.id, Decimal("0"))
        rows.append({
            "id": line.id, "material_id": material.id, "sku": material.sku, "name": material.name,
            "spec": material.spec, "unit": material.unit, "unit_price": material.unit_price,
            "planned_quantity": line.planned_quantity, "in_depot": in_depot, "used": used_qty,
            "missing": max(Decimal("0"), line.planned_quantity - in_depot - used_qty),
            "note": line.note,
        })
    # Planda olmayan ama depoda bulunan ya da kullanılan malzemeler de görünsün.
    known = {row["material_id"] for row in rows}
    extra_ids = [mid for mid in set(balances) | set(used) if mid not in known and (balances.get(mid) or used.get(mid))]
    for material in (await db.execute(select(RetailMaterial).where(RetailMaterial.id.in_(extra_ids)))).scalars().all() if extra_ids else []:
        rows.append({
            "id": None, "material_id": material.id, "sku": material.sku, "name": material.name,
            "spec": material.spec, "unit": material.unit, "unit_price": material.unit_price,
            "planned_quantity": Decimal("0"), "in_depot": balances.get(material.id, Decimal("0")),
            "used": used.get(material.id, Decimal("0")), "missing": Decimal("0"), "note": "Planda yok",
        })
    return rows


async def _work_orders(db: AsyncSession, project_id: UUID) -> list[WorkOrder]:
    rows = await db.execute(select(WorkOrder).where(
        WorkOrder.installation_project_id == project_id).order_by(WorkOrder.created_at))
    return list(rows.scalars().all())


async def _requirements(db: AsyncSession, project: InstallationProject, stage: InstallationProjectStage,
                        checklist: list[InstallationProjectChecklistItem], doc_types: set[str],
                        materials: list[dict], work_orders: list[WorkOrder]) -> list[dict]:
    """Aşamanın kapanma şartları ve her birinin karşılanıp karşılanmadığı."""
    docs, rule = STAGE_BY_CODE.get(stage.code, ([], None))
    # Kontrol listesi boş olan aşamada (ör. Devreye alma ve test) bu şart gösterilmez.
    reqs = [{"label": "Kontrol listesi tamamlanmış olmalı", "ok": all(item.is_done for item in checklist)}] if checklist else []
    for doc in docs:
        reqs.append({"label": f"{DOC_TYPES[doc]} yüklenmiş olmalı", "ok": doc in doc_types})
    if rule == "materials_listed":
        reqs.append({"label": RULE_LABELS[rule], "ok": any(row["planned_quantity"] > 0 for row in materials)})
    elif rule == "materials_ready":
        planned = [row for row in materials if row["planned_quantity"] > 0]
        reqs.append({"label": RULE_LABELS[rule], "ok": bool(planned) and all(row["missing"] == 0 for row in planned)})
    elif rule == "work_orders_done":
        done = [wo for wo in work_orders if _status_value(wo.status) in ("completed", "approved")]
        open_ = [wo for wo in work_orders if _status_value(wo.status) not in CLOSED_WORK_ORDER]
        reqs.append({"label": RULE_LABELS[rule], "ok": bool(done) and not open_})
    elif rule == "depot_empty":
        left = (await db.execute(select(RetailBalance.material_id).where(
            RetailBalance.depot_id == project.depot_id, RetailBalance.quantity > 0).limit(1))).first()
        reqs.append({"label": RULE_LABELS[rule], "ok": left is None})
    return reqs


def _status_value(value) -> str:
    return getattr(value, "value", value)


# ── Şemalar ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = SchemaField(min_length=2, max_length=200)
    store_id: UUID
    description: Optional[str] = SchemaField(default=None, max_length=4000)
    manager_user_id: Optional[UUID] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    budget: Optional[Decimal] = SchemaField(default=None, ge=0, max_digits=14, decimal_places=2)


class ProjectUpdate(BaseModel):
    name: Optional[str] = SchemaField(default=None, min_length=2, max_length=200)
    description: Optional[str] = SchemaField(default=None, max_length=4000)
    manager_user_id: Optional[UUID] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    budget: Optional[Decimal] = SchemaField(default=None, ge=0, max_digits=14, decimal_places=2)
    status: Optional[str] = None  # yalnızca "cancelled" (iptal)


class StageUpdate(BaseModel):
    responsible_user_id: Optional[UUID] = None
    planned_end: Optional[str] = None
    note: Optional[str] = SchemaField(default=None, max_length=4000)
    action: Optional[str] = None  # "complete"


class ChecklistCreate(BaseModel):
    label: str = SchemaField(min_length=2, max_length=255)


class ChecklistUpdate(BaseModel):
    is_done: bool


class MaterialLine(BaseModel):
    material_id: UUID
    planned_quantity: Decimal = SchemaField(gt=0, max_digits=14, decimal_places=3)
    note: Optional[str] = SchemaField(default=None, max_length=255)


class MaterialsSave(BaseModel):
    materials: list[MaterialLine] = SchemaField(default_factory=list, max_length=500)


# ── Uç noktalar ──────────────────────────────────────────────────────────────

@router.get("")
async def list_projects(
    status: Optional[str] = Query(None, description="active | completed | cancelled"),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
) -> list[dict]:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    query = select(InstallationProject).where(InstallationProject.tenant_id == tenant_id)
    if status:
        query = query.where(InstallationProject.status == status)
    projects = (await db.execute(query.order_by(InstallationProject.created_at.desc()))).scalars().all()
    if not projects:
        return []
    ids = [p.id for p in projects]
    stages = (await db.execute(select(InstallationProjectStage).where(
        InstallationProjectStage.project_id.in_(ids)).order_by(InstallationProjectStage.stage_order))).scalars().all()
    stores = {s.id: s for s in (await db.execute(select(Project).where(
        Project.id.in_({p.store_id for p in projects})))).scalars().all()}
    managers = dict((await db.execute(select(User.id, User.full_name).where(
        User.id.in_({p.manager_user_id for p in projects if p.manager_user_id})))).all()) if any(p.manager_user_id for p in projects) else {}
    wo_counts = dict((await db.execute(select(WorkOrder.installation_project_id, func.count()).where(
        WorkOrder.installation_project_id.in_(ids)).group_by(WorkOrder.installation_project_id))).all())
    by_project: dict[UUID, list[InstallationProjectStage]] = {}
    for stage in stages:
        by_project.setdefault(stage.project_id, []).append(stage)
    today = utc_now().date()
    out = []
    for p in projects:
        st = by_project.get(p.id, [])
        current = next((s for s in st if s.status != "completed"), None)
        store = stores.get(p.store_id)
        out.append({
            "id": p.id, "name": p.name, "status": p.status,
            "store_id": p.store_id, "store_name": store.name if store else None, "store_no": store.project_no if store else None,
            "manager_name": managers.get(p.manager_user_id), "target_date": _iso(p.target_date),
            "created_at": _iso(p.created_at), "completed_at": _iso(p.completed_at),
            "stages_total": len(st), "stages_done": sum(1 for s in st if s.status == "completed"),
            "current_stage": current.name if current else None,
            "current_stage_overdue": bool(current and current.planned_end and current.planned_end.date() < today),
            "overdue": bool(p.status == "active" and p.target_date and p.target_date.date() < today),
            "work_order_count": wo_counts.get(p.id, 0),
            "closing_pending": any(s.approval_requested_at and s.status != "completed" for s in st),
        })
    return out


@router.get("/my-stages")
async def my_stages(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    """Kullanıcının sorumlusu olduğu, kapanmamış proje aşamaları ("Proje Görevlerim")."""
    rows = (await db.execute(
        select(InstallationProjectStage, InstallationProject)
        .join(InstallationProject, InstallationProject.id == InstallationProjectStage.project_id)
        .where(InstallationProjectStage.responsible_user_id == user.id,
               InstallationProject.status == "active", InstallationProjectStage.status != "completed")
        .order_by(InstallationProject.created_at, InstallationProjectStage.stage_order)
    )).all()
    stores = {}
    store_ids = {project.store_id for _, project in rows}
    if store_ids:
        stores = {s.id: s for s in (await db.execute(select(Project).where(Project.id.in_(store_ids)))).scalars().all()}
    today = utc_now().date()
    return [{
        "stage_id": stage.id, "stage_order": stage.stage_order, "stage_name": stage.name, "status": stage.status,
        "planned_end": _iso(stage.planned_end),
        "overdue": bool(stage.planned_end and stage.planned_end.date() < today),
        "approval_pending": bool(stage.approval_requested_at),
        "project_id": project.id, "project_name": project.name,
        "store_name": stores[project.store_id].name if project.store_id in stores else None,
        "store_no": stores[project.store_id].project_no if project.store_id in stores else None,
    } for stage, project in rows]


@router.get("/stages/{stage_id}/task")
async def stage_task(stage_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Aşama sorumlusunun görev ekranı: projenin bütçe ve maliyet bilgileri olmadan."""
    stage, project, _manager = await _stage_context(db, user, stage_id)
    store = await db.get(Project, project.store_id)
    stages = await _stages(db, project.id)
    checklist = (await db.execute(select(InstallationProjectChecklistItem).where(
        InstallationProjectChecklistItem.stage_id == stage.id).order_by(InstallationProjectChecklistItem.sort_order))).scalars().all()
    docs = (await db.execute(select(InstallationProjectDocument).where(
        InstallationProjectDocument.project_id == project.id).order_by(InstallationProjectDocument.uploaded_at.desc()))).scalars().all()
    materials = await _material_status(db, project)
    work_orders = await _work_orders(db, project.id)
    documents = []
    for d in docs:
        try:
            url = await storage.generate_presigned_url(d.file_key, download_name=d.file_name)
        except IOError:
            url = None
        documents.append({"id": d.id, "doc_type": d.doc_type, "doc_type_label": DOC_TYPES.get(d.doc_type, d.doc_type),
                          "stage_id": d.stage_id, "file_name": d.file_name, "uploaded_by_name": d.uploaded_by_name,
                          "uploaded_at": _iso(d.uploaded_at), "url": url})
    return {
        "project": {"id": project.id, "name": project.name, "description": project.description, "status": project.status,
                    "store": {"name": store.name, "no": store.project_no} if store else None},
        "stage": {
            "id": stage.id, "order": stage.stage_order, "code": stage.code, "name": stage.name, "status": stage.status,
            "planned_end": _iso(stage.planned_end), "started_at": _iso(stage.started_at), "completed_at": _iso(stage.completed_at),
            "note": stage.note, "approval_requested_at": _iso(stage.approval_requested_at),
            "needs_approval": stage.code == "kapanis",
            "checklist": [{"id": i.id, "label": i.label, "is_done": i.is_done, "done_at": _iso(i.done_at)} for i in checklist],
            "requirements": await _requirements(db, project, stage, list(checklist), {d.doc_type for d in docs}, materials, work_orders),
        },
        "stages": [{"order": s.stage_order, "name": s.name, "status": s.status} for s in stages],
        "documents": documents, "doc_types": DOC_TYPES,
        # Saha kullanıcısı fiyat görmez: malzeme listesi birim fiyatsız döner.
        "materials": [{k: v for k, v in row.items() if k != "unit_price"} for row in materials],
        "work_orders": [{"id": wo.id, "title": wo.title, "status": _status_value(wo.status),
                         "assigned_to_name": wo.assigned_to_name} for wo in work_orders],
    }


@router.post("", status_code=201)
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    store = await db.get(Project, body.store_id)
    if not store or store.tenant_id != tenant_id:
        raise HTTPException(404, "Mağaza / yer bulunamadı.")
    if body.manager_user_id:
        manager = await db.get(User, body.manager_user_id)
        if not manager or manager.tenant_id != tenant_id or not manager.is_active:
            raise HTTPException(400, "Proje sorumlusu bu firmada aktif bir kullanıcı olmalıdır.")
    depot = RetailDepot(tenant_id=tenant_id, kind="project", name=f"Proje · {body.name}"[:120], is_active=True)
    db.add(depot)
    await db.flush()
    project = InstallationProject(
        tenant_id=tenant_id, store_id=store.id, depot_id=depot.id, name=body.name.strip(),
        description=body.description, manager_user_id=body.manager_user_id or user.id,
        start_date=_parse_date(body.start_date) or utc_now(), target_date=_parse_date(body.target_date),
        budget=body.budget, created_by=user.id,
    )
    db.add(project)
    await db.flush()
    now = utc_now()
    for order, code, name, _docs, _rule, checklist in STAGE_TEMPLATE:
        stage = InstallationProjectStage(
            project_id=project.id, stage_order=order, code=code, name=name,
            status="in_progress" if order == 1 else "planned", started_at=now if order == 1 else None,
            responsible_user_id=project.manager_user_id,
        )
        db.add(stage)
        await db.flush()
        for index, label in enumerate(checklist):
            db.add(InstallationProjectChecklistItem(stage_id=stage.id, label=label, sort_order=index))
    await db.commit()
    return {"id": project.id, "name": project.name, "depot_id": depot.id}


@router.get("/{project_id}")
async def get_project(project_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    project = await _project(db, user, project_id)
    store = await db.get(Project, project.store_id)
    stages = await _stages(db, project.id)
    items = (await db.execute(select(InstallationProjectChecklistItem).where(
        InstallationProjectChecklistItem.stage_id.in_([s.id for s in stages]))
        .order_by(InstallationProjectChecklistItem.sort_order))).scalars().all()
    docs = (await db.execute(select(InstallationProjectDocument).where(
        InstallationProjectDocument.project_id == project.id)
        .order_by(InstallationProjectDocument.uploaded_at.desc()))).scalars().all()
    materials = await _material_status(db, project)
    work_orders = await _work_orders(db, project.id)
    user_ids = ({s.responsible_user_id for s in stages} | {s.approval_requested_by for s in stages}
                | {project.manager_user_id} | {wo.assigned_to_user_id for wo in work_orders})
    known_users = {u for u in user_ids if u}
    names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(known_users)))).all()) if known_users else {}
    doc_types = {d.doc_type for d in docs}
    stage_rows = []
    for stage in stages:
        checklist = [i for i in items if i.stage_id == stage.id]
        stage_rows.append({
            "id": stage.id, "order": stage.stage_order, "code": stage.code, "name": stage.name,
            "status": stage.status, "responsible_user_id": stage.responsible_user_id,
            "responsible_name": names.get(stage.responsible_user_id),
            "planned_end": _iso(stage.planned_end), "started_at": _iso(stage.started_at),
            "completed_at": _iso(stage.completed_at), "note": stage.note,
            "approval_requested_at": _iso(stage.approval_requested_at),
            "approval_requested_by_name": names.get(stage.approval_requested_by),
            "checklist": [{"id": i.id, "label": i.label, "is_done": i.is_done, "done_at": _iso(i.done_at)} for i in checklist],
            "requirements": await _requirements(db, project, stage, checklist, doc_types, materials, work_orders),
        })
    documents = []
    for d in docs:
        try:
            url = await storage.generate_presigned_url(d.file_key, download_name=d.file_name)
        except IOError:
            url = None
        documents.append({
            "id": d.id, "doc_type": d.doc_type, "doc_type_label": DOC_TYPES.get(d.doc_type, d.doc_type),
            "stage_id": d.stage_id, "file_name": d.file_name, "mime_type": d.mime_type,
            "file_size_bytes": d.file_size_bytes, "uploaded_by_name": d.uploaded_by_name,
            "uploaded_at": _iso(d.uploaded_at), "url": url,
        })
    planned_cost = sum((row["planned_quantity"] * (row["unit_price"] or 0) for row in materials), Decimal("0"))
    used_cost = sum((row["used"] * (row["unit_price"] or 0) for row in materials), Decimal("0"))
    return {
        "id": project.id, "name": project.name, "description": project.description, "status": project.status,
        "store": {"id": store.id, "name": store.name, "no": store.project_no} if store else None,
        "depot_id": project.depot_id, "manager_user_id": project.manager_user_id,
        "manager_name": names.get(project.manager_user_id),
        "start_date": _iso(project.start_date), "target_date": _iso(project.target_date),
        "budget": project.budget, "created_at": _iso(project.created_at), "completed_at": _iso(project.completed_at),
        "stages": stage_rows, "documents": documents, "doc_types": DOC_TYPES,
        "materials": materials, "planned_cost": planned_cost, "used_cost": used_cost,
        "work_orders": [{
            "id": wo.id, "title": wo.title, "status": _status_value(wo.status),
            "assigned_to_name": wo.assigned_to_name, "due_date": _iso(wo.due_date), "created_at": _iso(wo.created_at),
        } for wo in work_orders],
    }


@router.patch("/{project_id}")
async def update_project(project_id: UUID, body: ProjectUpdate, db: AsyncSession = Depends(get_db),
                         user: User = Depends(get_current_user)) -> dict:
    project = await _project(db, user, project_id)
    _require_active(project)
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates:
        if updates["status"] != "cancelled":
            raise HTTPException(400, "Proje yalnızca iptal edilebilir; kapanış son aşamanın tamamlanmasıyla olur.")
        open_wo = [wo for wo in await _work_orders(db, project.id) if _status_value(wo.status) not in CLOSED_WORK_ORDER]
        if open_wo:
            raise HTTPException(409, "Projede açık iş emri var; önce iş emirlerini tamamlayın veya iptal edin.")
        left = (await db.execute(select(RetailBalance.material_id).where(
            RetailBalance.depot_id == project.depot_id, RetailBalance.quantity > 0).limit(1))).first()
        if left:
            raise HTTPException(409, "Proje deposunda malzeme var; önce ana depoya iade edin.")
        project.status = "cancelled"
        depot = await db.get(RetailDepot, project.depot_id)
        depot.is_active = False
    if "manager_user_id" in updates and updates["manager_user_id"]:
        manager = await db.get(User, updates["manager_user_id"])
        if not manager or manager.tenant_id != project.tenant_id or not manager.is_active:
            raise HTTPException(400, "Proje sorumlusu bu firmada aktif bir kullanıcı olmalıdır.")
        project.manager_user_id = manager.id
    for key in ("name", "description", "budget"):
        if key in updates and updates[key] is not None:
            setattr(project, key, updates[key].strip() if isinstance(updates[key], str) else updates[key])
    for key in ("start_date", "target_date"):
        if key in updates:
            setattr(project, key, _parse_date(updates[key]))
    project.updated_at = utc_now()
    await db.commit()
    return {"id": project.id, "status": project.status}


@router.patch("/stages/{stage_id}")
async def update_stage(stage_id: UUID, body: StageUpdate, db: AsyncSession = Depends(get_db),
                       user: User = Depends(get_current_user)) -> dict:
    stage, project, manager = await _stage_context(db, user, stage_id)
    _require_active(project)
    updates = body.model_dump(exclude_unset=True)
    if not manager and set(updates) - {"note", "action"}:
        raise HTTPException(403, "Aşamanın sorumlusu ve planlanan tarihi yalnızca yönetici tarafından değiştirilir.")
    if "responsible_user_id" in updates:
        if updates["responsible_user_id"]:
            person = await db.get(User, updates["responsible_user_id"])
            if not person or person.tenant_id != project.tenant_id or not person.is_active:
                raise HTTPException(400, "Sorumlu bu firmada aktif bir kullanıcı olmalıdır.")
        stage.responsible_user_id = updates["responsible_user_id"]
    if "planned_end" in updates:
        stage.planned_end = _parse_date(updates["planned_end"])
        stage.overdue_notified_at = None
    if "note" in updates and updates.get("action") != "reject_approval":
        stage.note = updates["note"]
    action = updates.get("action")
    if action in ("complete", "request_approval"):
        if stage.status == "completed":
            raise HTTPException(409, "Bu aşama zaten tamamlanmış.")
        stages = await _stages(db, project.id)
        if any(s.status != "completed" for s in stages if s.stage_order < stage.stage_order):
            raise HTTPException(409, "Aşamalar sırayla kapanır; önce önceki aşamaları tamamlayın.")
        checklist = (await db.execute(select(InstallationProjectChecklistItem).where(
            InstallationProjectChecklistItem.stage_id == stage.id))).scalars().all()
        doc_types = set((await db.execute(select(InstallationProjectDocument.doc_type).where(
            InstallationProjectDocument.project_id == project.id))).scalars().all())
        reqs = await _requirements(db, project, stage, list(checklist), doc_types,
                                   await _material_status(db, project), await _work_orders(db, project.id))
        missing = [r["label"] for r in reqs if not r["ok"]]
        if missing:
            raise HTTPException(409, "Aşama kapatılamadı: " + "; ".join(missing) + ".")
        managers = await manager_ids(db, project.tenant_id)
        if action == "request_approval":
            if stage.code != "kapanis":
                raise HTTPException(400, "Yalnızca kapanış aşaması onaya gönderilir.")
            if stage.approval_requested_at:
                raise HTTPException(409, "Kapanış zaten yönetici onayı bekliyor.")
            stage.approval_requested_at, stage.approval_requested_by = utc_now(), user.id
            await _notify_many(db, (managers | {project.manager_user_id}) - {user.id}, tenant_id=project.tenant_id,
                               category="project_closing_approval", title="Proje kapanış onayı bekliyor",
                               body=f"{project.name} — {user.full_name} kapanışı onaya gönderdi.")
        else:
            if stage.code == "kapanis" and not manager:
                raise HTTPException(403, "Projenin kapanışı yönetici onayıyla yapılır; \"Onaya gönder\" ile gönderin.")
            requester = stage.approval_requested_by
            now = utc_now()
            stage.status, stage.completed_at, stage.completed_by = "completed", now, user.id
            stage.approval_requested_at = stage.approval_requested_by = None
            next_stage = next((s for s in stages if s.stage_order == stage.stage_order + 1), None)
            if next_stage:
                next_stage.status, next_stage.started_at = "in_progress", next_stage.started_at or now
                await _notify_many(db, (managers | {project.manager_user_id}) - {user.id}, tenant_id=project.tenant_id,
                                   category="project_stage_completed", title="Proje aşaması tamamlandı",
                                   body=f"{project.name} — {stage.name} aşamasını {user.full_name} tamamladı.")
                if next_stage.responsible_user_id and next_stage.responsible_user_id != user.id:
                    await _notify_many(db, {next_stage.responsible_user_id}, tenant_id=project.tenant_id,
                                       category="project_stage_started", title="Proje görevi başladı",
                                       body=f"{project.name} — {next_stage.name} aşaması sizde.")
            else:
                # Son aşama (kapanış) bitti: proje tamamlanır, boşalmış proje deposu kapatılır.
                project.status, project.completed_at = "completed", now
                depot = await db.get(RetailDepot, project.depot_id)
                depot.is_active = False
                if requester and requester != user.id:
                    await _notify_many(db, {requester}, tenant_id=project.tenant_id, category="project_closing_approved",
                                       title="Proje kapanışı onaylandı", body=f"{project.name} tamamlandı.")
    elif action == "reject_approval":
        if not manager:
            raise HTTPException(403, "Kapanış onayını yalnızca yönetici reddedebilir.")
        if not stage.approval_requested_at:
            raise HTTPException(409, "Bu aşama onay beklemiyor.")
        requester = stage.approval_requested_by
        stage.approval_requested_at = stage.approval_requested_by = None
        reason = (updates.get("note") or "").strip()
        if requester and requester != user.id:
            await _notify_many(db, {requester}, tenant_id=project.tenant_id, category="project_closing_rejected",
                               title="Proje kapanışı onaylanmadı",
                               body=f"{project.name}{f' — {reason}' if reason else ''}")
    elif action is not None:
        raise HTTPException(400, "Geçersiz işlem.")
    project.updated_at = utc_now()
    await db.commit()
    return {"id": stage.id, "status": stage.status, "project_status": project.status,
            "approval_pending": bool(stage.approval_requested_at)}


@router.post("/stages/{stage_id}/checklist", status_code=201)
async def add_checklist_item(stage_id: UUID, body: ChecklistCreate, db: AsyncSession = Depends(get_db),
                             user: User = Depends(get_current_user)) -> dict:
    stage, project, _manager = await _stage_context(db, user, stage_id)
    _require_active(project)
    if stage.status == "completed":
        raise HTTPException(409, "Tamamlanmış aşamaya madde eklenemez.")
    count = (await db.execute(select(func.count()).where(InstallationProjectChecklistItem.stage_id == stage.id))).scalar_one()
    item = InstallationProjectChecklistItem(stage_id=stage.id, label=body.label.strip(), sort_order=count)
    db.add(item)
    await db.commit()
    return {"id": item.id, "label": item.label, "is_done": item.is_done}


@router.patch("/checklist/{item_id}")
async def update_checklist_item(item_id: UUID, body: ChecklistUpdate, db: AsyncSession = Depends(get_db),
                                user: User = Depends(get_current_user)) -> dict:
    item = await db.get(InstallationProjectChecklistItem, item_id)
    if not item:
        raise HTTPException(404, "Madde bulunamadı.")
    stage, project, _manager = await _stage_context(db, user, item.stage_id)
    _require_active(project)
    if stage.status == "completed":
        raise HTTPException(409, "Tamamlanmış aşamanın kontrol listesi değiştirilemez.")
    item.is_done = body.is_done
    item.done_by, item.done_at = (user.id, utc_now()) if body.is_done else (None, None)
    await db.commit()
    return {"id": item.id, "is_done": item.is_done}


@router.put("/{project_id}/materials")
async def save_materials(project_id: UUID, body: MaterialsSave, db: AsyncSession = Depends(get_db),
                         user: User = Depends(get_current_user)) -> list[dict]:
    project = await _project(db, user, project_id)
    _require_active(project)
    merged: dict[UUID, MaterialLine] = {}
    for line in body.materials:
        if line.material_id in merged:
            raise HTTPException(400, "Aynı malzeme listede iki kez yer alamaz.")
        material = await db.get(RetailMaterial, line.material_id)
        if not material or material.tenant_id != project.tenant_id or not material.is_active:
            raise HTTPException(404, "Malzeme bulunamadı veya pasif.")
        merged[line.material_id] = line
    existing = {row.material_id: row for row in (await db.execute(select(InstallationProjectMaterial).where(
        InstallationProjectMaterial.project_id == project.id))).scalars().all()}
    for material_id, row in existing.items():
        if material_id not in merged:
            await db.delete(row)
    for material_id, line in merged.items():
        row = existing.get(material_id)
        if row:
            row.planned_quantity, row.note = line.planned_quantity, line.note
        else:
            db.add(InstallationProjectMaterial(project_id=project.id, material_id=material_id,
                                               planned_quantity=line.planned_quantity, note=line.note))
    project.updated_at = utc_now()
    await db.commit()
    return await _material_status(db, project)


@router.post("/{project_id}/documents", status_code=201)
async def upload_document(
    project_id: UUID, doc_type: str = Form(...), stage_id: Optional[UUID] = Form(None),
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
) -> dict:
    if _is_manager(user):
        project = await _project(db, user, project_id)
    else:
        if not stage_id:
            raise HTTPException(403, "Belgeyi sorumlusu olduğunuz aşamaya yükleyin.")
        _stage, project, _m = await _stage_context(db, user, stage_id)
        if project.id != project_id:
            raise HTTPException(400, "Aşama bu projeye ait değil.")
    _require_active(project)
    if doc_type not in DOC_TYPES:
        raise HTTPException(400, "Geçersiz belge türü.")
    name = file.filename or "dosya"
    extension = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Bu dosya türü yüklenemez (PDF, görsel, DWG/DXF, Word veya Excel olmalı).")
    content = await file.read()
    if not content:
        raise HTTPException(400, "Dosya boş.")
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "Dosya 25 MB'tan büyük olamaz.")
    if stage_id:
        stage = await db.get(InstallationProjectStage, stage_id)
        if not stage or stage.project_id != project.id:
            raise HTTPException(400, "Aşama bu projeye ait değil.")
    key = f"installation-projects/{project.id}/{uuid4().hex}_{sanitize_filename(name)}"
    await storage.upload_file(content, key, file.content_type or "application/octet-stream")
    doc = InstallationProjectDocument(
        project_id=project.id, stage_id=stage_id, doc_type=doc_type, file_key=key, file_name=name,
        mime_type=file.content_type, file_size_bytes=len(content), uploaded_by=user.id,
        uploaded_by_name=user.full_name,
    )
    db.add(doc)
    project.updated_at = utc_now()
    await db.commit()
    return {"id": doc.id, "file_name": doc.file_name, "doc_type": doc.doc_type}


@router.delete("/documents/{document_id}", status_code=204, response_model=None, response_class=Response)
async def delete_document(document_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    doc = await db.get(InstallationProjectDocument, document_id)
    if not doc:
        raise HTTPException(404, "Belge bulunamadı.")
    project = await _project(db, user, doc.project_id)
    _require_active(project)
    if doc.stage_id:
        stage = await db.get(InstallationProjectStage, doc.stage_id)
        if stage and stage.status == "completed":
            raise HTTPException(409, "Tamamlanmış aşamanın belgesi silinemez.")
    # Kayıt silinir; dosya depoda kalır (yanlışlıkla silmeye karşı geri getirilebilir).
    await db.delete(doc)
    await db.commit()
    return Response(status_code=204)
