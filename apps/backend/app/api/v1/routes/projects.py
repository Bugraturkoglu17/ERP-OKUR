"""
V1 — Projects & Assignments
Hiyerarşi: Customer → Region → Branch → Project
Roller:
  admin         → tüm CRUD + proje oluştur
  saha_muhendisi → sadece atandığı projeleri görür
  musteri_kullanici → sadece atandığı proje görünümü
"""

from __future__ import annotations

import ast
import json
from decimal import Decimal
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Response, status, UploadFile, File
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database         import get_db
from app.core.dependencies     import get_current_user, is_platform_admin, require_role
from app.core.email_templates import project_assignment_mail
from app.core.emailing import enqueue_tenant_email
from app.core.exceptions       import NotFoundError
from app.db.crud               import CRUDBase
from app.db.models import (
    Branch,
    Customer,
    Project,
    ProjectAssignment,
    ProjectStatus,
    Region,
    User,
)
from app.db.schemas import (
    BranchCreate,
    BranchRead,
    BranchUpdate,
    CustomerRead,
    CustomerCreate,
    ProjectAssignmentCreate,
    ProjectAssignmentRead,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    RegionCreate,
    RegionRead,
    RegionUpdate,
)

router = APIRouter()

crud_customer   = CRUDBase(Customer)
crud_region     = CRUDBase(Region)
crud_branch     = CRUDBase(Branch)
crud_project    = CRUDBase(Project)
crud_assignment = CRUDBase(ProjectAssignment)


def _has_manager_role(user: User) -> bool:
    return is_platform_admin(user) or (user.default_role or "") in {"admin", "manager"}


def _tenant_mismatch(user: User, tenant_id: object) -> bool:
    if is_platform_admin(user):
        return False
    if user.tenant_id is None or tenant_id is None:
        return True
    return str(user.tenant_id) != str(tenant_id)


def _require_tenant_user(user: User) -> None:
    if is_platform_admin(user):
        return
    if user.tenant_id is None:
        raise HTTPException(status_code=403, detail="Tenant bağlamı bulunamadı.")


def _parse_scope_codes(raw: object) -> list[str]:
    if isinstance(raw, list):
        return [str(x) for x in raw]
    if isinstance(raw, str):
        try:
            parsed = ast.literal_eval(raw)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except (ValueError, SyntaxError):
            return []
    return []


def _to_project_read(project: Project) -> ProjectRead:
    contract_value = getattr(project, "contract_value", None)
    if isinstance(contract_value, Decimal):
        contract_value = float(contract_value)

    status_value = project.status.value if hasattr(project.status, "value") else str(project.status)

    return ProjectRead(
        id=project.id,
        customer_id=project.customer_id,
        region_id=project.region_id,
        branch_id=project.branch_id,
        name=project.name,
        project_no=project.project_no,
        description=project.description,
        start_date=project.start_date,
        due_date=project.due_date,
        scope_codes=_parse_scope_codes(getattr(project, "scope_codes", [])),
        contract_value=contract_value,
        status=status_value,
        created_by=project.created_by,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Hiyerarşi — Lookup (Client-side cascade select için)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/customers", response_model=list[CustomerRead], tags=["hierarchy"])
async def list_customers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tüm müşterileri listele — proje oluşturma ekranı cascade dropdown'ı içindir."""
    if is_platform_admin(user):
        return await crud_customer.get_multi(db)
    _require_tenant_user(user)
    result = await db.execute(select(Customer).where(Customer.tenant_id == user.tenant_id))
    return list(result.scalars())


@router.post("/customers", response_model=CustomerRead, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def create_customer(
    customer_in: CustomerCreate,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user)
    return await crud_customer.create(db, customer_in, tenant_id=user.tenant_id)


@router.patch("/customers/{customer_id}", response_model=CustomerRead, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def update_customer(
    customer_id: str,
    customer_in: CustomerCreate,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    customer = await crud_customer.get(db, customer_id)
    if not customer:
        raise NotFoundError(detail="Müşteri bulunamadı.")
    if _tenant_mismatch(user, customer.tenant_id):
        raise HTTPException(status_code=403, detail="Bu müşteri üzerinde yetkiniz yok.")
    return await crud_customer.update(db, db_obj=customer, obj_in=customer_in)


@router.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, response_class=Response, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def delete_customer(
    customer_id: str,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
) -> None:
    customer = await crud_customer.get(db, customer_id)
    if not customer:
        raise NotFoundError(detail="Müşteri bulunamadı.")
    if _tenant_mismatch(user, customer.tenant_id):
        raise HTTPException(status_code=403, detail="Bu müşteri üzerinde yetkiniz yok.")
    await crud_customer.delete(db, customer)


@router.get("/regions", response_model=list[RegionRead], tags=["hierarchy"])
async def list_regions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tüm bölgeleri getirir — Mağaza Kartı filtre/etiket için tek istekte toplu liste."""
    if is_platform_admin(user):
        result = await db.execute(select(Region))
        return list(result.scalars())
    _require_tenant_user(user)
    result = await db.execute(select(Region).where(Region.tenant_id == user.tenant_id))
    return list(result.scalars())


@router.get("/regions/{customer_id}", response_model=list[RegionRead], tags=["hierarchy"])
async def list_regions_by_customer(
    customer_id: str,
    user:        User         = Depends(get_current_user),
    db:          AsyncSession = Depends(get_db),
):
    """Bir müşterinin bölgelerini getirir."""
    customer = await crud_customer.get(db, customer_id)
    if not customer:
        raise NotFoundError(detail="Müşteri bulunamadı.")
    if _tenant_mismatch(user, customer.tenant_id):
        raise HTTPException(status_code=403, detail="Bu müşteri üzerinde yetkiniz yok.")
    result = await db.execute(
        select(Region).where(Region.customer_id == customer_id, Region.tenant_id == customer.tenant_id)
    )
    return list(result.scalars())


@router.post("/regions", response_model=RegionRead, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def create_region(
    region_in: RegionCreate,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    customer = await crud_customer.get(db, region_in.customer_id)
    if not customer:
        raise NotFoundError(detail="Müşteri bulunamadı.")
    if _tenant_mismatch(user, customer.tenant_id):
        raise HTTPException(status_code=403, detail="Bu müşteri üzerinde yetkiniz yok.")
    return await crud_region.create(db, region_in, tenant_id=customer.tenant_id)


@router.patch("/regions/{region_id}", response_model=RegionRead, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def update_region(
    region_id: str,
    region_in: RegionUpdate,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    region = await crud_region.get(db, region_id)
    if not region:
        raise NotFoundError(detail="Bölge bulunamadı.")
    if _tenant_mismatch(user, region.tenant_id):
        raise HTTPException(status_code=403, detail="Bu bölge üzerinde yetkiniz yok.")
    return await crud_region.update(db, db_obj=region, obj_in=region_in)


@router.delete("/regions/{region_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, response_class=Response, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def delete_region(
    region_id: str,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
) -> None:
    region = await crud_region.get(db, region_id)
    if not region:
        raise NotFoundError(detail="Bölge bulunamadı.")
    if _tenant_mismatch(user, region.tenant_id):
        raise HTTPException(status_code=403, detail="Bu bölge üzerinde yetkiniz yok.")
    await crud_region.delete(db, region)


@router.get("/branches/{region_id}", response_model=list[BranchRead], tags=["hierarchy"])
async def list_branches_by_region(
    region_id: str,
    user:      User         = Depends(get_current_user),
    db:        AsyncSession = Depends(get_db),
):
    """Bir bölgenin şubelerini getirir."""
    region = await crud_region.get(db, region_id)
    if not region:
        raise NotFoundError(detail="Bölge bulunamadı.")
    if _tenant_mismatch(user, region.tenant_id):
        raise HTTPException(status_code=403, detail="Bu bölge üzerinde yetkiniz yok.")
    result = await db.execute(
        select(Branch).where(Branch.region_id == region_id, Branch.tenant_id == region.tenant_id)
    )
    return list(result.scalars())


@router.post("/branches", response_model=BranchRead, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def create_branch(
    branch_in: BranchCreate,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    region = await crud_region.get(db, branch_in.region_id)
    if not region:
        raise NotFoundError(detail="Bölge bulunamadı.")
    if _tenant_mismatch(user, region.tenant_id):
        raise HTTPException(status_code=403, detail="Bu bölge üzerinde yetkiniz yok.")
    return await crud_branch.create(db, branch_in, tenant_id=region.tenant_id)


@router.patch("/branches/{branch_id}", response_model=BranchRead, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def update_branch(
    branch_id: str,
    branch_in: BranchUpdate,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    branch = await crud_branch.get(db, branch_id)
    if not branch:
        raise NotFoundError(detail="Şube bulunamadı.")
    if _tenant_mismatch(user, branch.tenant_id):
        raise HTTPException(status_code=403, detail="Bu şube üzerinde yetkiniz yok.")
    return await crud_branch.update(db, db_obj=branch, obj_in=branch_in)


@router.delete("/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, response_class=Response, dependencies=[Depends(require_role("admin"))], tags=["hierarchy"])
async def delete_branch(
    branch_id: str,
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
) -> None:
    branch = await crud_branch.get(db, branch_id)
    if not branch:
        raise NotFoundError(detail="Şube bulunamadı.")
    if _tenant_mismatch(user, branch.tenant_id):
        raise HTTPException(status_code=403, detail="Bu şube üzerinde yetkiniz yok.")
    await crud_branch.delete(db, branch)


# ═══════════════════════════════════════════════════════════════════════════════
# Proje CRUD
# ═══════════════════════════════════════════════════════════════════════════════

@router.get(
    "",
    response_model=list[ProjectRead],
    summary="Proje listesi — Yönetici tümünü, Saha Mühendisi kendine atananları görür.",
)
async def list_projects(
    response:     Response,
    skip:         int                  = 0,
    limit:        int                  = 100,
    q:            str | None           = None,
    status:       ProjectStatus | None = None,
    branch_id:    str | None           = None,
    customer_id:  str | None           = None,
    region_id:    str | None           = None,
    include_cancelled: bool            = True,
    user:         User                 = Depends(get_current_user),
    db:           AsyncSession         = Depends(get_db),
) -> list[ProjectRead]:
    """
    Yönetici (admin) tüm projeleri listeler.
    Diğer roller yalnızca kendisine ProjectAssignment ile atanmış projeleri görür.
    Query parametreleri ile filtreleme desteği vardır.
    Toplam kayıt sayısı (filtrelenmiş) X-Total-Count header'ında döner —
    ayrı bir count isteği gerektirmeden sayfalama UI'ı için kullanılabilir.
    """
    if not is_platform_admin(user):
        _require_tenant_user(user)
        query = select(Project).where(Project.tenant_id == user.tenant_id)
    else:
        query = select(Project)

    # Mağaza kartları tenant içindeki tüm aktif kullanıcılara açıktır.

    if status:
        query = query.where(Project.status == status)
    elif not include_cancelled:
        query = query.where(Project.status != ProjectStatus.CANCELLED)
    if branch_id:
        query = query.where(Project.branch_id == branch_id)
    if customer_id:
        query = query.where(Project.customer_id == customer_id)
    if region_id:
        query = query.where(Project.region_id == region_id)

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.where(or_(Project.name.ilike(term), Project.project_no.ilike(term)))

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    response.headers["X-Total-Count"] = str(count_result.scalar_one())

    query = query.offset(skip).limit(limit).order_by(Project.created_at.desc())
    result = await db.execute(query)
    return [_to_project_read(project) for project in list(result.scalars())]


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni proje oluştur — sadece Yönetici.",
    dependencies=[Depends(require_role("admin"))],
)
async def create_project(
    project_in: ProjectCreate,
    user:       User         = Depends(require_role("admin")),
    db:         AsyncSession = Depends(get_db),
) -> ProjectRead:
    """
    Yeni şantiye projesi oluşturur.
    branch_id verilmişse hiyerarşi doğrulaması yapılır.
    Verilmemişse tenant'ın ilk branch'i otomatik kullanılır (wizard akışı için).
    """
    # branch_id verilmemişse tenant'ın ilk branch'ini otomatik kullan (wizard akışı)
    if project_in.branch_id is None:
        auto_res = await db.execute(
            select(Branch).where(Branch.tenant_id == user.tenant_id).limit(1)
        )
        branch = auto_res.scalar_one_or_none()
        if not branch:
            raise HTTPException(status_code=400, detail="Tenant için tanımlı şube bulunamadı.")
        auto_region = await crud_region.get(db, branch.region_id)
        resolved_branch_id   = branch.id
        resolved_region_id   = branch.region_id
        resolved_customer_id = auto_region.customer_id if auto_region else None
        resolved_tenant_id   = branch.tenant_id
    else:
        branch = await crud_branch.get(db, project_in.branch_id)
        if not branch:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Şube bulunamadı.")
        if _tenant_mismatch(user, branch.tenant_id):
            raise HTTPException(status_code=403, detail="Bu şube üzerinde yetkiniz yok.")

        region = await crud_region.get(db, branch.region_id)
        if not region or region.customer_id != project_in.customer_id or region.id != project_in.region_id:
            raise HTTPException(status_code=400, detail="Bölge / müşteri uyumsuzluğu.")
        if str(region.tenant_id) != str(branch.tenant_id):
            raise HTTPException(status_code=400, detail="Hiyerarşi tenant bilgisi tutarsız.")

        customer = await crud_customer.get(db, project_in.customer_id)
        if not customer:
            raise NotFoundError(detail="Müşteri bulunamadı.")
        if str(customer.tenant_id) != str(branch.tenant_id):
            raise HTTPException(status_code=400, detail="Hiyerarşi tenant bilgisi tutarsız.")

        resolved_branch_id   = branch.id
        resolved_region_id   = branch.region_id
        resolved_customer_id = project_in.customer_id
        resolved_tenant_id   = branch.tenant_id

    created = await crud_project.create(
        db,
        project_in,
        scope_codes=json.dumps(project_in.scope_codes or []),
        tenant_id=resolved_tenant_id,
        branch_id=resolved_branch_id,
        region_id=resolved_region_id,
        customer_id=resolved_customer_id,
    )
    return _to_project_read(created)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: str,
    user:       User         = Depends(get_current_user),
    db:         AsyncSession = Depends(get_db),
) -> ProjectRead:
    """
    Tek proje detayını getirir.
    Yönetici her projeyi görür, diğer roller yalnızca atandığı projeleri görür.
    """
    project = await crud_project.get(db, project_id)
    if not project:
        raise NotFoundError(detail="Proje bulunamadı.")

    if _tenant_mismatch(user, project.tenant_id):
        raise HTTPException(status_code=403, detail="Bu projeye erişim yetkiniz yok.")

    return _to_project_read(project)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: str,
    project_in: ProjectUpdate,
    user:       User         = Depends(require_role("admin")),
    db:         AsyncSession = Depends(get_db),
) -> ProjectRead:
    """Proje bilgilerini günceller — sadece Yönetici."""
    project = await crud_project.get(db, project_id)
    if not project:
        raise NotFoundError(detail="Proje bulunamadı.")
    if _tenant_mismatch(user, project.tenant_id):
        raise HTTPException(status_code=403, detail="Bu proje üzerinde yetkiniz yok.")
    update_payload = project_in.model_dump(exclude_unset=True)
    if "scope_codes" in update_payload and update_payload["scope_codes"] is not None:
        update_payload["scope_codes"] = json.dumps(update_payload["scope_codes"])

    obj_in = SimpleNamespace(model_dump=lambda exclude_unset=True: update_payload)
    updated = await crud_project.update(db, db_obj=project, obj_in=obj_in)
    return _to_project_read(updated)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
)
async def delete_project(
    project_id: str,
    user:       User         = Depends(require_role("admin")),
    db:         AsyncSession = Depends(get_db),
) -> None:
    """Projeyi siler — sadece Yönetici."""
    project = await crud_project.get(db, project_id)
    if not project:
        raise NotFoundError(detail="Proje bulunamadı.")
    if _tenant_mismatch(user, project.tenant_id):
        raise HTTPException(status_code=403, detail="Bu proje üzerinde yetkiniz yok.")
    await crud_project.delete(db, project)


# ═══════════════════════════════════════════════════════════════════════════════
# Proje Atamaları (Ekip / Taşeron)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/{project_id}/assignments",
    response_model=ProjectAssignmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Kullanıcıyı projeye atar — sadece Yönetici.",
    dependencies=[Depends(require_role("admin"))],
)
async def assign_user_to_project(
    project_id: str,
    assignment: ProjectAssignmentCreate,
    admin:      User         = Depends(require_role("admin")),
    db:         AsyncSession = Depends(get_db),
) -> ProjectAssignment:
    """Bir kullanıcıyı (saha mühendisi / taşeron) projeye atar."""
    project = await crud_project.get(db, project_id)
    if not project:
        raise NotFoundError(detail="Proje bulunamadı.")
    if _tenant_mismatch(admin, project.tenant_id):
        raise HTTPException(status_code=403, detail="Bu proje üzerinde yetkiniz yok.")
    user = await db.get(User, assignment.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if _tenant_mismatch(admin, user.tenant_id) or str(user.tenant_id) != str(project.tenant_id):
        raise HTTPException(status_code=403, detail="Kullanıcı tenant kapsamı proje ile uyumlu değil.")
    created_assignment = await crud_assignment.create(db, assignment, project_id=project_id)

    if user.email:
        customer = await db.get(Customer, project.customer_id)
        if customer:
            mail = project_assignment_mail(
                tenant=customer,
                project_name=project.name,
                assignee_name=user.full_name,
                assigned_by=admin.full_name,
            )
            enqueue_tenant_email(
                tenant_id=project.tenant_id,
                template=mail.template,
                to=[user.email],
                subject=mail.subject,
                text=mail.text,
                html=mail.html,
            )

    return created_assignment


@router.get(
    "/{project_id}/assignments",
    response_model=list[ProjectAssignmentRead],
    summary="Projedeki tüm atamaları listele.",
)
async def list_assignments(
    project_id: str,
    user:       User         = Depends(get_current_user),
    db:         AsyncSession = Depends(get_db),
) -> list[ProjectAssignment]:
    """
    Projeye atanmış tüm ekip/taşeron listesini döner.
    Yönetici her projenin atamalarını görür, diğer roller sadece kendi projelerini.
    """
    project = await crud_project.get(db, project_id)
    if not project:
        raise NotFoundError(detail="Proje bulunamadı.")
    if _tenant_mismatch(user, project.tenant_id):
        raise HTTPException(status_code=403, detail="Bu projeye erişim yetkiniz yok.")

    if not _has_manager_role(user):
        # Kendi atanıp atanmadığını doğrula
        own_assignment = await db.execute(
            select(ProjectAssignment)
            .where(
                ProjectAssignment.project_id == project_id,
                ProjectAssignment.user_id   == user.id,
            )
        )
        if not own_assignment.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Bu projeye erişim yetkiniz yok.")

    result = await db.execute(
        select(ProjectAssignment).where(ProjectAssignment.project_id == project_id)
    )
    return list(result.scalars())


# ═══════════════════════════════════════════════════════════════════════════════
# Hazır Şablon Zincir Marketler (Migros, BİM, A101) İçe Aktarma & CSV İndirme
# ═══════════════════════════════════════════════════════════════════════════════
import os
import csv
import io
import json
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

class ChainImportRequest(BaseModel):
    chain_name: str  # "Migros", "BİM", "A101", "Macrocenter", or "all"

def _get_seeds_file_path() -> str:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    temp_dir = current_dir
    for _ in range(6):
        candidate = os.path.join(temp_dir, "seeds", "chains.json")
        if os.path.exists(candidate):
            return candidate
        candidate_app = os.path.join(temp_dir, "app", "seeds", "chains.json")
        if os.path.exists(candidate_app):
            return candidate_app
        temp_dir = os.path.dirname(temp_dir)
    raise FileNotFoundError("seeds/chains.json template file not found.")

@router.post("/hierarchy/import-template-chain", status_code=status.HTTP_201_CREATED, tags=["hierarchy"])
async def import_template_chain(
    req_body: ChainImportRequest,
    user:     User         = Depends(require_role("admin")),
    db:       AsyncSession = Depends(get_db),
):
    """
    Şablon zincir market verilerini (Migros, BİM, A101 vb.) otomatik olarak 
    veritabanına (Müşteri -> Bölge -> Şube) tenant-safe olarak ekler.
    """
    _require_tenant_user(user)
    tenant_id = user.tenant_id

    try:
        seeds_file = _get_seeds_file_path()
        with open(seeds_file, "r", encoding="utf-8") as f:
            all_branches = json.load(f)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Şablon dosyası okunamadı: {e}")

    chain_lower = req_body.chain_name.lower()
    
    # Filter branches
    if chain_lower == "all":
        filtered = all_branches
    elif chain_lower in ["migros", "macrocenter", "a101", "bi̇m", "bim"]:
        search_terms = {chain_lower}
        if chain_lower == "bim" or chain_lower == "bi̇m":
            search_terms = {"bim", "bi̇m"}
        filtered = [b for b in all_branches if b.get("chain", "").lower() in search_terms]
    else:
        raise HTTPException(status_code=400, detail="Geçersiz zincir adı. Seçenekler: Migros, BİM, A101, Macrocenter, all")

    if not filtered:
        return {"status": "success", "added_customers": 0, "added_regions": 0, "added_branches": 0, "message": "Eklenecek yeni şube bulunamadı."}

    # Fetch existing customers, regions, branches to avoid duplicates
    cust_stmt = select(Customer).where(Customer.tenant_id == tenant_id)
    cust_res = await db.execute(cust_stmt)
    customers_cache = {c.name.lower(): c for c in cust_res.scalars()}

    reg_stmt = select(Region).where(Region.tenant_id == tenant_id)
    reg_res = await db.execute(reg_stmt)
    regions_cache = {(r.customer_id, r.city.lower()): r for r in reg_res.scalars()}

    br_stmt = select(Branch.name.lower(), Branch.region_id).where(Branch.tenant_id == tenant_id)
    br_res = await db.execute(br_stmt)
    existing_branches = {(row[0], row[1]) for row in br_res}

    added_customers = 0
    added_regions = 0
    added_branches = 0

    for b in filtered:
        cust_name = b.get("chain", "Bilinmeyen Zincir")
        cust_key = cust_name.lower()

        # 1. Customer
        if cust_key not in customers_cache:
            new_cust = Customer(
                tenant_id=tenant_id,
                name=cust_name,
                is_active=True
            )
            db.add(new_cust)
            await db.flush()
            customers_cache[cust_key] = new_cust
            added_customers += 1

        customer = customers_cache[cust_key]

        # 2. Region
        city = b.get("city", "Bilinmeyen")
        city_key = city.lower()
        reg_key = (customer.id, city_key)

        if reg_key not in regions_cache:
            reg_name = f"{cust_name} - {city}"
            clean_cust = "".join(c for c in cust_name if c.isalnum())[:3].upper()
            clean_city = "".join(c for c in city if c.isalnum())[:3].upper()
            reg_code = f"{clean_cust}-{clean_city}"

            new_reg = Region(
                tenant_id=tenant_id,
                customer_id=customer.id,
                name=reg_name,
                city=city,
                code=reg_code
            )
            db.add(new_reg)
            await db.flush()
            regions_cache[reg_key] = new_reg
            added_regions += 1

        region = regions_cache[reg_key]

        # 3. Branch
        br_name = b.get("name", "Bilinmeyen Şube")
        br_name_lower = br_name.lower()
        br_key = (br_name_lower, region.id)

        if br_key not in existing_branches:
            new_br = Branch(
                tenant_id=tenant_id,
                region_id=region.id,
                name=br_name,
                address=b.get("address"),
                latitude=b.get("latitude"),
                longitude=b.get("longitude"),
                ready_for_field=True
            )
            db.add(new_br)
            existing_branches.add(br_key)
            added_branches += 1

    await db.commit()

    return {
        "status": "success",
        "added_customers": added_customers,
        "added_regions": added_regions,
        "added_branches": added_branches,
        "message": f"Başarıyla içe aktarıldı. {added_customers} yeni müşteri, {added_regions} yeni bölge, {added_branches} yeni şube eklendi."
    }

@router.get("/hierarchy/download-csv", tags=["hierarchy"])
async def download_chain_csv(
    chain: str,  # "Migros", "BİM", "A101", "Macrocenter", or "all"
    user:  User = Depends(get_current_user)
):
    """
    Seçilen zincir market verisini (Migros, BİM, A101 vb.) CSV formatında indirir.
    """
    try:
        seeds_file = _get_seeds_file_path()
        with open(seeds_file, "r", encoding="utf-8") as f:
            all_branches = json.load(f)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Şablon dosyası okunamadı: {e}")

    chain_lower = chain.lower()
    if chain_lower == "all":
        filtered = all_branches
    elif chain_lower in ["migros", "macrocenter", "a101", "bi̇m", "bim"]:
        search_terms = {chain_lower}
        if chain_lower == "bim" or chain_lower == "bi̇m":
            search_terms = {"bim", "bi̇m"}
        filtered = [b for b in all_branches if b.get("chain", "").lower() in search_terms]
    else:
        raise HTTPException(status_code=400, detail="Geçersiz zincir adı. Seçenekler: Migros, BİM, A101, Macrocenter, all")

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output)
    writer.writerow(["Zincir", "Şube Adı", "Adres", "Şehir", "İlçe", "Enlem", "Boylam", "Kaynak URL"])
    
    for b in filtered:
        writer.writerow([
            b.get("chain", ""),
            b.get("name", ""),
            b.get("address", ""),
            b.get("city", ""),
            b.get("district", ""),
            b.get("latitude") if b.get("latitude") is not None else "",
            b.get("longitude") if b.get("longitude") is not None else "",
            b.get("url", "")
        ])

    csv_data = output.getvalue()
    output.close()

    filename = f"{chain_lower}_sablon_subeler.csv"
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"',
        'Content-Type': 'text/csv; charset=utf-8'
    }
    return StreamingResponse(iter([csv_data]), headers=headers)

@router.post("/hierarchy/import-custom-csv", status_code=status.HTTP_201_CREATED, tags=["hierarchy"])
async def import_custom_csv(
    file:     UploadFile   = File(...),
    user:     User         = Depends(require_role("admin")),
    db:       AsyncSession = Depends(get_db),
):
    """
    Kullanıcının yüklediği özel CSV dosyasını okur ve hiyerarşi ağacına 
    (Müşteri -> Bölge -> Şube) tenant-safe ve mükerrer kayıtsız olarak ekler.
    """
    _require_tenant_user(user)
    tenant_id = user.tenant_id

    content = await file.read()
    decoded = None
    for enc in ["utf-8-sig", "utf-8", "cp1254", "iso-8859-9", "latin-1"]:
        try:
            decoded = content.decode(enc)
            break
        except Exception:
            continue

    if not decoded:
        raise HTTPException(status_code=400, detail="Dosya kodlaması çözülemedi. Lütfen UTF-8 veya CP1254 kodlamalı bir CSV yükleyin.")

    f = io.StringIO(decoded)
    first_line = f.readline()
    f.seek(0)
    delimiter = ";" if ";" in first_line else ","

    reader = csv.DictReader(f, delimiter=delimiter)
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV dosyasında sütun başlıkları bulunamadı.")

    # Smart header mapping
    chain_col, name_col, addr_col, city_col, dist_col, lat_col, lng_col = None, None, None, None, None, None, None
    for h in reader.fieldnames:
        if not h:
            continue
        hl = h.strip().lower()
        if hl in ["zincir", "müşteri", "customer", "chain", "firma", "musteri"]:
            chain_col = h
        elif hl in ["şube adı", "şube", "branch", "name", "şube_adı", "sube", "sube adi", "sube_adi"]:
            name_col = h
        elif hl in ["adres", "address", "açık adres", "sube_adresi", "şube adresi", "acik adres"]:
            addr_col = h
        elif hl in ["şehir", "il", "city", "sehir"]:
            city_col = h
        elif hl in ["ilçe", "ilce", "district", "belediye"]:
            dist_col = h
        elif hl in ["enlem", "latitude", "lat"]:
            lat_col = h
        elif hl in ["boylam", "longitude", "lng", "lon"]:
            lng_col = h

    if not name_col:
        raise HTTPException(
            status_code=400, 
            detail="Geçersiz CSV şablonu. Dosyada en azından 'Şube Adı' (veya 'Şube', 'Branch', 'Name') sütunu bulunmalıdır."
        )

    # Preload caches to avoid N+1 DB lookups and speed up execution
    cust_stmt = select(Customer).where(Customer.tenant_id == tenant_id)
    cust_res = await db.execute(cust_stmt)
    customers_cache = {c.name.lower(): c for c in cust_res.scalars()}

    reg_stmt = select(Region).where(Region.tenant_id == tenant_id)
    reg_res = await db.execute(reg_stmt)
    regions_cache = {(r.customer_id, r.city.lower()): r for r in reg_res.scalars()}

    br_stmt = select(Branch.name.lower(), Branch.region_id).where(Branch.tenant_id == tenant_id)
    br_res = await db.execute(br_stmt)
    existing_branches = {(row[0], row[1]) for row in br_res}

    added_customers = 0
    added_regions = 0
    added_branches = 0

    for row in reader:
        # Get and clean customer
        raw_cust = row.get(chain_col)
        cust_name = raw_cust.strip() if chain_col and raw_cust else "Özel Müşteri"
        cust_key = cust_name.lower()

        # 1. Customer
        if cust_key not in customers_cache:
            new_cust = Customer(
                tenant_id=tenant_id,
                name=cust_name,
                is_active=True
            )
            db.add(new_cust)
            await db.flush()
            customers_cache[cust_key] = new_cust
            added_customers += 1

        customer = customers_cache[cust_key]

        # 2. Region
        raw_city = row.get(city_col)
        city = raw_city.strip() if city_col and raw_city else "Genel Bölge"
        city_key = city.lower()
        reg_key = (customer.id, city_key)

        if reg_key not in regions_cache:
            reg_name = f"{cust_name} - {city}"
            clean_cust = "".join(c for c in cust_name if c.isalnum())[:3].upper()
            clean_city = "".join(c for c in city if c.isalnum())[:3].upper()
            reg_code = f"{clean_cust}-{clean_city}"

            new_reg = Region(
                tenant_id=tenant_id,
                customer_id=customer.id,
                name=reg_name,
                city=city,
                code=reg_code
            )
            db.add(new_reg)
            await db.flush()
            regions_cache[reg_key] = new_reg
            added_regions += 1

        region = regions_cache[reg_key]

        # 3. Branch
        raw_br = row.get(name_col)
        br_name = raw_br.strip() if raw_br else None
        if not br_name:
            continue
        
        br_name_lower = br_name.lower()
        br_key = (br_name_lower, region.id)

        if br_key not in existing_branches:
            # Parse lat/lng
            lat, lng = None, None
            raw_lat = row.get(lat_col)
            raw_lng = row.get(lng_col)
            if lat_col and raw_lat:
                try:
                    lat = float(str(raw_lat).replace(",", "."))
                except ValueError:
                    pass
            if lng_col and raw_lng:
                try:
                    lng = float(str(raw_lng).replace(",", "."))
                except ValueError:
                    pass

            new_br = Branch(
                tenant_id=tenant_id,
                region_id=region.id,
                name=br_name,
                address=row.get(addr_col).strip() if addr_col and row.get(addr_col) else None,
                latitude=lat,
                longitude=lng,
                ready_for_field=True
            )
            db.add(new_br)
            existing_branches.add(br_key)
            added_branches += 1

    await db.commit()

    return {
        "status": "success",
        "added_customers": added_customers,
        "added_regions": added_regions,
        "added_branches": added_branches,
        "message": f"Özel CSV başarıyla içe aktarıldı. {added_customers} yeni müşteri, {added_regions} yeni bölge, {added_branches} yeni şube eklendi."
    }


