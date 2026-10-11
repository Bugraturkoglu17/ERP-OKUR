"""OKUR retail stock: main depot, plate-specific vehicle depots and store usage.

This API intentionally uses separate tables from the legacy project inventory.
Every quantity change is atomic and leaves an immutable movement record.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field as SchemaField, field_validator
from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.dependencies import get_current_user, is_platform_admin
from app.core.database import get_db
from app.db.models import (
    Branch, Project, RetailBalance, RetailDepot, RetailMaterial,
    RetailMovement, Tenant, User, WorkOrder, utc_now,
)


router = APIRouter()
Quantity = Annotated[Decimal, SchemaField(gt=0, max_digits=14, decimal_places=3)]
NonNegative = Annotated[Decimal, SchemaField(ge=0, max_digits=14, decimal_places=3)]


class DepotCreate(BaseModel):
    kind: Literal["main", "vehicle"]
    name: str = SchemaField(min_length=2, max_length=120)
    plate: str | None = None
    assigned_user_id: UUID | None = None

    @field_validator("plate")
    @classmethod
    def normalize_plate(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = re.sub(r"\s+", " ", value.strip().upper())
        if not re.fullmatch(r"[0-9A-ZÇĞİÖŞÜ -]{4,20}", normalized):
            raise ValueError("Plaka 4-20 karakter ve yalnızca harf/rakam içermelidir.")
        return normalized


class DepotUpdate(BaseModel):
    assigned_user_id: UUID | None = None
    is_active: bool | None = None


class MaterialCreate(BaseModel):
    sku: str = SchemaField(min_length=1, max_length=80)
    name: str = SchemaField(min_length=2, max_length=255)
    category: str | None = SchemaField(default=None, max_length=100)
    unit: str = SchemaField(default="adet", min_length=1, max_length=20)
    min_stock: NonNegative = Decimal("0")

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str) -> str:
        return value.strip().upper()


class StockEntry(BaseModel):
    depot_id: UUID
    material_id: UUID
    quantity: Quantity
    reference_no: str | None = SchemaField(default=None, max_length=80)
    note: str | None = SchemaField(default=None, max_length=500)


class StockTransfer(BaseModel):
    source_depot_id: UUID
    target_depot_id: UUID
    material_id: UUID
    quantity: Quantity
    reference_no: str | None = SchemaField(default=None, max_length=80)
    note: str | None = SchemaField(default=None, max_length=500)


class StoreUsage(BaseModel):
    vehicle_depot_id: UUID
    material_id: UUID
    branch_id: UUID
    quantity: Quantity
    work_order_id: UUID | None = None
    note: str | None = SchemaField(default=None, max_length=500)


def _manager(user: User) -> bool:
    role = (user.default_role or "").lower()
    return is_platform_admin(user) or role in {"admin", "manager"}


def _require_manager(user: User) -> None:
    if not _manager(user):
        raise HTTPException(status_code=403, detail="Depo ve katalog yönetimi yalnızca yöneticiye açıktır.")


async def _tenant_id(db: AsyncSession, user: User) -> UUID:
    if user.tenant_id:
        return user.tenant_id
    if not is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Firma bağlamı bulunamadı.")
    tenants = (await db.execute(select(Tenant.id).where(Tenant.is_active == True).limit(2))).scalars().all()
    if len(tenants) != 1:
        raise HTTPException(status_code=409, detail="Admin için tek bir aktif firma seçili olmalıdır.")
    return tenants[0]


async def _depot(db: AsyncSession, tenant_id: UUID, depot_id: UUID, *, active: bool = True) -> RetailDepot:
    depot = await db.get(RetailDepot, depot_id)
    if not depot or depot.tenant_id != tenant_id or (active and not depot.is_active):
        raise HTTPException(status_code=404, detail="Depo bulunamadı veya pasif.")
    return depot


async def _material(db: AsyncSession, tenant_id: UUID, material_id: UUID) -> RetailMaterial:
    material = await db.get(RetailMaterial, material_id)
    if not material or material.tenant_id != tenant_id or not material.is_active:
        raise HTTPException(status_code=404, detail="Malzeme bulunamadı veya pasif.")
    return material


async def _staff(db: AsyncSession, tenant_id: UUID, user_id: UUID) -> User:
    staff = await db.get(User, user_id)
    if not staff or staff.tenant_id != tenant_id or not staff.is_active or is_platform_admin(staff):
        raise HTTPException(status_code=400, detail="Bu firmada aktif çalışan bulunamadı.")
    return staff


def _can_use_vehicle(user: User, depot: RetailDepot) -> bool:
    return _manager(user) or (depot.kind == "vehicle" and depot.assigned_user_id == user.id)


def _depot_json(depot: RetailDepot) -> dict:
    return {
        "id": depot.id, "kind": depot.kind, "name": depot.name,
        "plate": depot.plate, "assigned_user_id": depot.assigned_user_id,
        "is_active": depot.is_active,
    }


async def _locked_balances(db: AsyncSession, material_id: UUID, depot_ids: list[UUID]) -> dict[UUID, RetailBalance]:
    # Insert-zero + deterministic lock order makes concurrent loads/use safe;
    # the unique PK prevents duplicate rows when two requests race.
    ordered = sorted(set(depot_ids), key=str)
    for depot_id in ordered:
        await db.execute(
            pg_insert(RetailBalance.__table__)
            .values(depot_id=depot_id, material_id=material_id, quantity=0, updated_at=utc_now())
            .on_conflict_do_nothing(index_elements=["depot_id", "material_id"])
        )
    rows = (await db.execute(
        select(RetailBalance)
        .where(RetailBalance.material_id == material_id, RetailBalance.depot_id.in_(ordered))
        .order_by(RetailBalance.depot_id)
        .with_for_update()
    )).scalars().all()
    return {row.depot_id: row for row in rows}


def _decrease(balance: RetailBalance, quantity: Decimal) -> None:
    if balance.quantity < quantity:
        raise HTTPException(status_code=409, detail=f"Yetersiz stok: mevcut {balance.quantity}, istenen {quantity}.")
    balance.quantity -= quantity
    balance.updated_at = utc_now()


async def _commit_movement(db: AsyncSession, movement: RetailMovement) -> dict:
    db.add(movement)
    await db.commit()
    await db.refresh(movement)
    return {"id": movement.id, "kind": movement.kind, "quantity": movement.quantity, "performed_at": movement.performed_at}


@router.get("/depots")
async def list_depots(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    tenant_id = await _tenant_id(db, user)
    query = select(RetailDepot).where(RetailDepot.tenant_id == tenant_id, RetailDepot.is_active == True)
    if not _manager(user):
        query = query.where(RetailDepot.kind == "vehicle", RetailDepot.assigned_user_id == user.id)
    rows = (await db.execute(query.order_by(RetailDepot.kind, RetailDepot.plate))).scalars().all()
    return [_depot_json(row) for row in rows]


@router.post("/depots", status_code=201)
async def create_depot(body: DepotCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    if body.kind == "main" and (body.plate or body.assigned_user_id):
        raise HTTPException(status_code=400, detail="Ana deponun plakası veya atanmış çalışanı olamaz.")
    if body.kind == "vehicle" and not body.plate:
        raise HTTPException(status_code=400, detail="Araç deposu için plaka zorunludur.")
    if body.assigned_user_id:
        await _staff(db, tenant_id, body.assigned_user_id)
    depot = RetailDepot(tenant_id=tenant_id, **body.model_dump())
    db.add(depot)
    try:
        await db.commit()
        await db.refresh(depot)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Ana depo veya bu plakalı araç zaten kayıtlı.")
    return _depot_json(depot)


@router.patch("/depots/{depot_id}")
async def update_depot(depot_id: UUID, body: DepotUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    depot = await _depot(db, tenant_id, depot_id, active=False)
    updates = body.model_dump(exclude_unset=True)
    if "assigned_user_id" in updates:
        if depot.kind != "vehicle":
            raise HTTPException(status_code=400, detail="Yalnızca araç deposuna çalışan atanabilir.")
        if updates["assigned_user_id"]:
            await _staff(db, tenant_id, updates["assigned_user_id"])
    if updates.get("is_active") is False:
        has_stock = (await db.execute(select(RetailBalance).where(RetailBalance.depot_id == depot.id, RetailBalance.quantity > 0).limit(1))).first()
        if has_stock:
            raise HTTPException(status_code=409, detail="Stok bakiyesi olan depo pasife alınamaz; önce iade veya transfer yapın.")
    for key, value in updates.items():
        setattr(depot, key, value)
    await db.commit()
    await db.refresh(depot)
    return _depot_json(depot)


@router.get("/staff")
async def list_staff(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    rows = (await db.execute(select(User).where(User.tenant_id == tenant_id, User.is_active == True).order_by(User.full_name))).scalars().all()
    return [{"id": row.id, "name": row.full_name} for row in rows if not is_platform_admin(row)]


@router.get("/materials")
async def list_materials(
    search: str = "", limit: int = Query(500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
) -> list[dict]:
    tenant_id = await _tenant_id(db, user)
    query = select(RetailMaterial).where(RetailMaterial.tenant_id == tenant_id, RetailMaterial.is_active == True)
    if search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(RetailMaterial.name.ilike(pattern), RetailMaterial.sku.ilike(pattern)))
    rows = (await db.execute(query.order_by(RetailMaterial.name).limit(limit))).scalars().all()
    return [{"id": row.id, "sku": row.sku, "name": row.name, "category": row.category,
             "unit": row.unit, "min_stock": row.min_stock} for row in rows]


@router.post("/materials", status_code=201)
async def create_material(body: MaterialCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    material = RetailMaterial(tenant_id=tenant_id, **body.model_dump())
    db.add(material)
    try:
        await db.commit()
        await db.refresh(material)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu malzeme kodu zaten kayıtlı.")
    return {"id": material.id, "sku": material.sku, "name": material.name}


@router.get("/stock")
async def list_stock(
    depot_id: UUID, search: str = "", db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    tenant_id = await _tenant_id(db, user)
    depot = await _depot(db, tenant_id, depot_id)
    if not _can_use_vehicle(user, depot):
        raise HTTPException(status_code=403, detail="Bu araç deposuna erişim yetkiniz yok.")
    query = select(RetailMaterial, RetailBalance.quantity).outerjoin(
        RetailBalance,
        and_(RetailBalance.material_id == RetailMaterial.id, RetailBalance.depot_id == depot_id),
    ).where(RetailMaterial.tenant_id == tenant_id, RetailMaterial.is_active == True)
    if search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(RetailMaterial.name.ilike(pattern), RetailMaterial.sku.ilike(pattern)))
    rows = (await db.execute(query.order_by(RetailMaterial.name).limit(2000))).all()
    return [{"material_id": material.id, "sku": material.sku, "name": material.name,
             "unit": material.unit, "category": material.category,
             "quantity": quantity or Decimal("0"), "min_stock": material.min_stock}
            for material, quantity in rows]


@router.get("/stores")
async def search_stores(
    search: str = Query(min_length=2, max_length=100),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
) -> list[dict]:
    tenant_id = await _tenant_id(db, user)
    pattern = f"%{search.strip()}%"
    rows = (await db.execute(select(Branch).where(
        Branch.tenant_id == tenant_id,
        or_(Branch.name.ilike(pattern), Branch.code.ilike(pattern)),
    ).order_by(Branch.name).limit(25))).scalars().all()
    return [{"id": row.id, "name": row.name, "code": row.code} for row in rows]


@router.post("/opening", status_code=201)
async def opening_stock(body: StockEntry, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    depot = await _depot(db, tenant_id, body.depot_id)
    if depot.kind != "main":
        raise HTTPException(status_code=400, detail="İlk stok girişi yalnızca ana depoya yapılır.")
    await _material(db, tenant_id, body.material_id)
    balances = await _locked_balances(db, body.material_id, [depot.id])
    balance = balances[depot.id]
    balance.quantity += body.quantity
    balance.updated_at = utc_now()
    return await _commit_movement(db, RetailMovement(
        tenant_id=tenant_id, material_id=body.material_id, target_depot_id=depot.id,
        kind="opening", quantity=body.quantity, reference_no=body.reference_no,
        note=body.note, performed_by=user.id,
    ))


@router.post("/load", status_code=201)
async def load_vehicle(body: StockTransfer, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    source = await _depot(db, tenant_id, body.source_depot_id)
    target = await _depot(db, tenant_id, body.target_depot_id)
    if source.kind != "main" or target.kind != "vehicle":
        raise HTTPException(status_code=400, detail="Yükleme yalnızca ana depodan araç deposuna yapılır.")
    await _material(db, tenant_id, body.material_id)
    balances = await _locked_balances(db, body.material_id, [source.id, target.id])
    _decrease(balances[source.id], body.quantity)
    balances[target.id].quantity += body.quantity
    balances[target.id].updated_at = utc_now()
    return await _commit_movement(db, RetailMovement(
        tenant_id=tenant_id, material_id=body.material_id,
        source_depot_id=source.id, target_depot_id=target.id,
        kind="load", quantity=body.quantity, reference_no=body.reference_no,
        note=body.note, performed_by=user.id,
    ))


@router.post("/use", status_code=201)
async def use_at_store(body: StoreUsage, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    tenant_id = await _tenant_id(db, user)
    vehicle = await _depot(db, tenant_id, body.vehicle_depot_id)
    if vehicle.kind != "vehicle" or not _can_use_vehicle(user, vehicle):
        raise HTTPException(status_code=403, detail="Bu araç deposundan malzeme kullanamazsınız.")
    await _material(db, tenant_id, body.material_id)
    branch = await db.get(Branch, body.branch_id)
    if not branch or branch.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Mağaza bulunamadı.")
    if body.work_order_id:
        order = await db.get(WorkOrder, body.work_order_id)
        project = await db.get(Project, order.project_id) if order else None
        if not order or order.tenant_id != tenant_id or not project or project.branch_id != branch.id:
            raise HTTPException(status_code=400, detail="İş emri seçilen mağazaya ait değil.")
        if not _manager(user) and order.assigned_to_user_id != user.id:
            raise HTTPException(status_code=403, detail="İş emri size atanmamış.")
    balances = await _locked_balances(db, body.material_id, [vehicle.id])
    _decrease(balances[vehicle.id], body.quantity)
    return await _commit_movement(db, RetailMovement(
        tenant_id=tenant_id, material_id=body.material_id,
        source_depot_id=vehicle.id, branch_id=branch.id,
        work_order_id=body.work_order_id, kind="use", quantity=body.quantity,
        note=body.note, performed_by=user.id,
    ))


@router.post("/return", status_code=201)
async def return_to_main(body: StockTransfer, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    tenant_id = await _tenant_id(db, user)
    source = await _depot(db, tenant_id, body.source_depot_id)
    target = await _depot(db, tenant_id, body.target_depot_id)
    if source.kind != "vehicle" or target.kind != "main" or not _can_use_vehicle(user, source):
        raise HTTPException(status_code=403, detail="İade yalnızca yetkili araçtan ana depoya yapılır.")
    await _material(db, tenant_id, body.material_id)
    balances = await _locked_balances(db, body.material_id, [source.id, target.id])
    _decrease(balances[source.id], body.quantity)
    balances[target.id].quantity += body.quantity
    balances[target.id].updated_at = utc_now()
    return await _commit_movement(db, RetailMovement(
        tenant_id=tenant_id, material_id=body.material_id,
        source_depot_id=source.id, target_depot_id=target.id,
        kind="return", quantity=body.quantity, reference_no=body.reference_no,
        note=body.note, performed_by=user.id,
    ))


@router.get("/movements")
async def list_movements(
    limit: int = Query(60, ge=1, le=200), db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    tenant_id = await _tenant_id(db, user)
    source = aliased(RetailDepot)
    target = aliased(RetailDepot)
    query = (
        select(RetailMovement, RetailMaterial.name, RetailMaterial.unit,
               source.name, target.name, Branch.name, User.full_name)
        .join(RetailMaterial, RetailMaterial.id == RetailMovement.material_id)
        .outerjoin(source, source.id == RetailMovement.source_depot_id)
        .outerjoin(target, target.id == RetailMovement.target_depot_id)
        .outerjoin(Branch, Branch.id == RetailMovement.branch_id)
        .join(User, User.id == RetailMovement.performed_by)
        .where(RetailMovement.tenant_id == tenant_id)
    )
    if not _manager(user):
        query = query.where(or_(source.assigned_user_id == user.id, target.assigned_user_id == user.id))
    rows = (await db.execute(query.order_by(RetailMovement.performed_at.desc()).limit(limit))).all()
    return [{"id": item.id, "kind": item.kind, "material_name": material_name,
             "unit": unit, "quantity": item.quantity,
             "source_name": source_name, "target_name": target_name,
             "store_name": store_name, "performed_by_name": actor_name,
             "performed_at": item.performed_at, "note": item.note,
             "reference_no": item.reference_no}
            for item, material_name, unit, source_name, target_name, store_name, actor_name in rows]
