"""Transactional stock primitives shared by the retail stock and work-order APIs.

Callers own the transaction: these helpers only flush, so a work order's
completion and its stock movements are committed (or rolled back) together.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notifications import notify
from app.db.models import (
    Project, RetailBalance, RetailDepot, RetailMaterial, RetailMovement,
    User, WorkOrder, WorkOrderMaterial, utc_now,
)


MANAGER_ROLES = {"admin", "manager"}


@dataclass
class IssuedLine:
    name: str
    unit: str
    quantity: Decimal


def format_quantity(value: Decimal) -> str:
    text = f"{value:f}"
    text = text.rstrip("0").rstrip(".") if "." in text else text
    return text.replace(".", ",")  # Türkçe ondalık gösterim


async def locked_balances(db: AsyncSession, material_id: UUID, depot_ids: list[UUID]) -> dict[UUID, RetailBalance]:
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


def decrease(balance: RetailBalance, quantity: Decimal, label: str | None = None) -> None:
    if balance.quantity < quantity:
        prefix = f"{label}: " if label else ""
        raise HTTPException(status_code=409, detail=f"{prefix}Yetersiz stok: mevcut {balance.quantity}, istenen {quantity}.")
    balance.quantity -= quantity
    balance.updated_at = utc_now()


async def validate_work_order_depot(
    db: AsyncSession, *, tenant_id: UUID | None, depot_id: UUID, assignee: User | None,
) -> RetailDepot:
    """A work order may only draw stock from the assignee's own active cep depo."""
    depot = await db.get(RetailDepot, depot_id)
    if not depot or not depot.is_active or depot.kind != "vehicle":
        raise HTTPException(status_code=400, detail="Seçilen cep depo bulunamadı veya pasif.")
    if tenant_id and depot.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Cep depo şirket kapsamınız dışında.")
    if assignee is None:
        raise HTTPException(status_code=400, detail="Cep depo için atanacak çalışan seçilmelidir.")
    if depot.assigned_user_id != assignee.id:
        raise HTTPException(status_code=400, detail="Seçilen cep depo, işin atandığı çalışana zimmetli değil.")
    return depot


async def save_planned_lines(
    db: AsyncSession, *, work_order: WorkOrder, depot: RetailDepot,
    lines: list[tuple[UUID, Decimal]],
) -> list[WorkOrderMaterial]:
    """Replace the not-yet-issued material list of an open work order."""
    merged: dict[UUID, Decimal] = defaultdict(Decimal)
    for material_id, quantity in lines:
        merged[material_id] += quantity
    for material_id in merged:
        material = await db.get(RetailMaterial, material_id)
        if not material or material.tenant_id != depot.tenant_id or not material.is_active:
            raise HTTPException(status_code=404, detail="Malzeme bulunamadı veya pasif.")
    await db.execute(delete(WorkOrderMaterial).where(
        WorkOrderMaterial.work_order_id == work_order.id, WorkOrderMaterial.movement_id.is_(None),
    ))
    issued_ids = set((await db.execute(
        select(WorkOrderMaterial.material_id).where(WorkOrderMaterial.work_order_id == work_order.id)
    )).scalars().all())
    if issued_ids & set(merged):
        raise HTTPException(status_code=409, detail="Bu malzeme için stok zaten düşülmüş.")
    created = []
    for material_id, quantity in merged.items():
        line = WorkOrderMaterial(
            tenant_id=depot.tenant_id, work_order_id=work_order.id,
            depot_id=depot.id, material_id=material_id, quantity=quantity,
        )
        db.add(line)
        created.append(line)
    await db.flush()
    return created


async def issue_planned_lines(db: AsyncSession, *, work_order: WorkOrder, performed_by: UUID) -> list[IssuedLine]:
    """Deduct every planned line from its cep depo and record a 'use' movement each.

    Raises 409 when the depot cannot cover a line; the caller must not commit.
    Lines that were already issued are skipped, so completing twice is harmless.
    """
    lines = (await db.execute(
        select(WorkOrderMaterial)
        .where(WorkOrderMaterial.work_order_id == work_order.id, WorkOrderMaterial.movement_id.is_(None))
        .order_by(WorkOrderMaterial.material_id)
        .with_for_update()
    )).scalars().all()
    if not lines:
        return []
    project = await db.get(Project, work_order.project_id)
    issued: list[IssuedLine] = []
    for line in lines:
        material = await db.get(RetailMaterial, line.material_id)
        if not material or not material.is_active:
            raise HTTPException(status_code=409, detail="Listedeki bir malzeme artık aktif değil; listeyi güncelleyin.")
        balances = await locked_balances(db, line.material_id, [line.depot_id])
        decrease(balances[line.depot_id], line.quantity, material.name)
        movement = RetailMovement(
            tenant_id=line.tenant_id, material_id=line.material_id,
            source_depot_id=line.depot_id, branch_id=project.branch_id if project else None,
            work_order_id=work_order.id, kind="use", quantity=line.quantity,
            note=f"İş emri tamamlandı: {work_order.title}"[:500], performed_by=performed_by,
        )
        db.add(movement)
        await db.flush()
        line.movement_id = movement.id
        line.issued_at = utc_now()
        line.updated_at = utc_now()
        issued.append(IssuedLine(material.name, material.unit, line.quantity))
    await db.flush()
    return issued


async def notify_managers_of_issue(
    db: AsyncSession, *, work_order: WorkOrder, actor: User, issued: list[IssuedLine],
) -> None:
    """Tell the order's creator and every tenant manager which materials left stock."""
    if not issued:
        return
    depot = await db.get(RetailDepot, work_order.stock_depot_id) if work_order.stock_depot_id else None
    recipients = {work_order.created_by} if work_order.created_by else set()
    if work_order.tenant_id:
        rows = await db.execute(select(User.id).where(
            User.tenant_id == work_order.tenant_id, User.is_active == True,
            User.default_role.in_(MANAGER_ROLES),
        ))
        recipients.update(rows.scalars().all())
    recipients.discard(actor.id)
    summary = ", ".join(f"{item.name} {format_quantity(item.quantity)} {item.unit}" for item in issued)
    where = f" ({depot.plate})" if depot and depot.plate else ""
    for user_id in recipients:
        await notify(
            db, user_id=user_id, tenant_id=work_order.tenant_id, work_order_id=work_order.id,
            category="work_order_stock_deducted",
            title="Stoktan malzeme düşüldü",
            body=f"{actor.full_name} — {work_order.title}: {summary} cep depodan{where} düşüldü.",
        )


async def has_stock_history(db: AsyncSession, work_order_id: UUID) -> bool:
    row = await db.execute(
        select(RetailMovement.id).where(RetailMovement.work_order_id == work_order_id).limit(1)
    )
    return row.first() is not None
