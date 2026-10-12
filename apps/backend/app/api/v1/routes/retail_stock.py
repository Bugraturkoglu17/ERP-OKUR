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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.dependencies import get_current_user, is_platform_admin
from app.core.database import get_db
from app.db.models import (
    Branch, RetailBalance, RetailDepot, RetailMaterial,
    RetailMovement, Tenant, User, WorkOrder, utc_now,
)
from app.services.retail_stock_service import decrease, locked_balances


router = APIRouter()
# Miktar kuralı: tam sayı veya en fazla bir ondalık (5, 0.5); 0.05 / 0.005 reddedilir.
Quantity = Annotated[Decimal, SchemaField(gt=0, max_digits=14, decimal_places=1)]
StockLevel = Annotated[Decimal, SchemaField(ge=0, max_digits=14, decimal_places=1)]
Price = Annotated[Decimal, SchemaField(ge=0, max_digits=14, decimal_places=4)]


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
    brand: str | None = SchemaField(default=None, max_length=200)
    spec: str | None = SchemaField(default=None, max_length=255)
    unit_price: Price | None = None
    min_stock: StockLevel = Decimal("0")

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


class TransferLine(BaseModel):
    material_id: UUID
    quantity: Quantity


class StockTransfer(BaseModel):
    """Ana depo ↔ araç deposu aktarımı; tüm kalemler tek işlemde uygulanır."""
    source_depot_id: UUID
    target_depot_id: UUID
    lines: list[TransferLine] = SchemaField(min_length=1, max_length=300)
    reference_no: str | None = SchemaField(default=None, max_length=80)
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


def _price_json(user: User, material: RetailMaterial) -> dict:
    # Fiyat yalnızca yöneticiye gösterilir; saha çalışanı listede fiyat görmez.
    return {"unit_price": material.unit_price} if _manager(user) else {}


def _depot_json(depot: RetailDepot) -> dict:
    return {
        "id": depot.id, "kind": depot.kind, "name": depot.name,
        "plate": depot.plate, "assigned_user_id": depot.assigned_user_id,
        "is_active": depot.is_active,
    }


_locked_balances = locked_balances
_decrease = decrease


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
        # Çalışan kendi araç depolarını görür; ana depo yalnızca iade hedefi olarak (stoğu görünmez).
        query = query.where(or_(RetailDepot.kind == "main",
                                and_(RetailDepot.kind == "vehicle", RetailDepot.assigned_user_id == user.id)))
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
             "unit": row.unit, "brand": row.brand, "spec": row.spec, "min_stock": row.min_stock,
             **_price_json(user, row)} for row in rows]


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
             "brand": material.brand, "spec": material.spec,
             "quantity": quantity or Decimal("0"), "min_stock": material.min_stock,
             **_price_json(user, material)}
            for material, quantity in rows]


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


@router.post("/transfer", status_code=201)
async def transfer_stock(body: StockTransfer, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Ana depodan araca yükleme (yönetici) veya araçtan ana depoya iade (yönetici ya da aracın çalışanı).

    Kalemlerin hepsi tek işlemde uygulanır: biri yetersizse hiçbiri uygulanmaz.
    """
    tenant_id = await _tenant_id(db, user)
    source = await _depot(db, tenant_id, body.source_depot_id)
    target = await _depot(db, tenant_id, body.target_depot_id)
    if source.kind == "main" and target.kind == "vehicle":
        _require_manager(user)
        kind = "load"
    elif source.kind == "vehicle" and target.kind == "main":
        if not _can_use_vehicle(user, source):
            raise HTTPException(status_code=403, detail="Bu araç deposundan iade yapamazsınız.")
        kind = "return"
    else:
        raise HTTPException(status_code=400, detail="Aktarım yalnızca ana depo ile araç deposu arasında yapılır.")

    merged: dict[UUID, Decimal] = {}
    for line in body.lines:
        merged[line.material_id] = merged.get(line.material_id, Decimal("0")) + line.quantity
    try:
        # Deterministik kilit sırası: eşzamanlı aktarımlar birbirini kilitlemez.
        for material_id in sorted(merged, key=str):
            material = await _material(db, tenant_id, material_id)
            balances = await _locked_balances(db, material_id, [source.id, target.id])
            _decrease(balances[source.id], merged[material_id], f"{material.sku} {material.name}")
            balances[target.id].quantity += merged[material_id]
            balances[target.id].updated_at = utc_now()
            db.add(RetailMovement(
                tenant_id=tenant_id, material_id=material_id,
                source_depot_id=source.id, target_depot_id=target.id,
                kind=kind, quantity=merged[material_id], reference_no=body.reference_no,
                note=body.note, performed_by=user.id,
            ))
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    return {"kind": kind, "count": len(merged)}


@router.get("/movements")
async def list_movements(
    limit: int = Query(60, ge=1, le=200), db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    tenant_id = await _tenant_id(db, user)
    source = aliased(RetailDepot)
    target = aliased(RetailDepot)
    query = (
        select(RetailMovement, RetailMaterial.name, RetailMaterial.unit, RetailMaterial.sku,
               source.name, target.name, Branch.name, User.full_name, WorkOrder.title)
        .join(RetailMaterial, RetailMaterial.id == RetailMovement.material_id)
        .outerjoin(source, source.id == RetailMovement.source_depot_id)
        .outerjoin(target, target.id == RetailMovement.target_depot_id)
        .outerjoin(Branch, Branch.id == RetailMovement.branch_id)
        .outerjoin(WorkOrder, WorkOrder.id == RetailMovement.work_order_id)
        .join(User, User.id == RetailMovement.performed_by)
        .where(RetailMovement.tenant_id == tenant_id)
    )
    if not _manager(user):
        query = query.where(or_(source.assigned_user_id == user.id, target.assigned_user_id == user.id))
    rows = (await db.execute(query.order_by(RetailMovement.performed_at.desc()).limit(limit))).all()
    return [{"id": item.id, "kind": item.kind, "material_name": material_name, "material_sku": material_sku,
             "unit": unit, "quantity": item.quantity,
             "source_name": source_name, "target_name": target_name,
             "store_name": store_name, "performed_by_name": actor_name,
             "performed_at": item.performed_at, "note": item.note,
             "reference_no": item.reference_no, "work_order_id": item.work_order_id,
             "work_order_title": work_order_title}
            for item, material_name, unit, material_sku, source_name, target_name, store_name, actor_name, work_order_title in rows]
