# ─────────────────────────────────────────────────────────────────────────────
#  V1 — Procurement Routes  (Tedarikçi / Talep / Satın Alma Siparişi)
# ─────────────────────────────────────────────────────────────────────────────
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.core.exceptions import NotFoundError
from app.db.models import (
    Material, Project, Supplier, PurchaseRequest, PurchaseOrder,
    PurchaseOrderItem, ProcurementStatus, Warehouse,
    InventoryTransaction, InventoryTransactionType, Stock, User,
)
from app.db.schemas import (
    SupplierCreate, SupplierRead, SupplierUpdate,
    PurchaseRequestCreate, PurchaseRequestRead, PurchaseRequestReview,
    PurchaseOrderCreate, PurchaseOrderRead, POReceiveRequest,
)

router = APIRouter()


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─────────────────────────────────────────────────────────────────────────────
#  Tedarikçiler (Suppliers)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/suppliers", response_model=list[SupplierRead])
async def list_suppliers(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
    skip: int          = 0,
    limit: int         = 100,
    active_only: bool  = Query(True),
):
    query = select(Supplier)
    if not is_platform_admin(user):
        query = query.where(Supplier.tenant_id == user.tenant_id)
    if active_only:
        query = query.where(Supplier.is_active == True)
    query = query.order_by(Supplier.name).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars())


@router.post("/suppliers", response_model=SupplierRead, status_code=201)
async def create_supplier(
    payload: SupplierCreate,
    db:      AsyncSession = Depends(get_db),
    user:    User         = Depends(get_current_user),
):
    if user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Sadece yöneticiler tedarikçi ekleyebilir.")
    supplier = Supplier(
        tenant_id    = user.tenant_id,
        name         = payload.name,
        contact_name = payload.contact_name,
        phone        = payload.phone,
        email        = payload.email,
        tax_no       = payload.tax_no,
        address      = payload.address,
        notes        = payload.notes,
    )
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@router.patch("/suppliers/{supplier_id}", response_model=SupplierRead)
async def update_supplier(
    supplier_id: UUID,
    payload:     SupplierUpdate,
    db:          AsyncSession = Depends(get_db),
    user:        User         = Depends(get_current_user),
):
    if user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Sadece yöneticiler tedarikçi düzenleyebilir.")
    supplier = await db.get(Supplier, supplier_id)
    if not supplier:
        raise NotFoundError(detail="Tedarikçi bulunamadı.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@router.delete("/suppliers/{supplier_id}", status_code=204)
async def delete_supplier(
    supplier_id: UUID,
    db:          AsyncSession = Depends(get_db),
    user:        User         = Depends(get_current_user),
):
    if user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Sadece yöneticiler tedarikçi silebilir.")
    supplier = await db.get(Supplier, supplier_id)
    if not supplier:
        raise NotFoundError(detail="Tedarikçi bulunamadı.")
    supplier.is_active = False
    db.add(supplier)
    await db.commit()


# ─────────────────────────────────────────────────────────────────────────────
#  Malzeme Talepleri (Purchase Requests)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/requests", response_model=list[PurchaseRequestRead])
async def list_requests(
    db:         AsyncSession    = Depends(get_db),
    user:       User            = Depends(get_current_user),
    project_id: UUID | None     = None,
    status_filter: str | None   = None,
    skip:       int             = 0,
    limit:      int             = 100,
):
    query = select(PurchaseRequest)
    if not is_platform_admin(user):
        query = query.where(PurchaseRequest.tenant_id == user.tenant_id)
    if project_id:
        query = query.where(PurchaseRequest.project_id == project_id)
    if status_filter:
        query = query.where(PurchaseRequest.status == status_filter)
    query = query.order_by(PurchaseRequest.requested_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    rows = list(result.scalars())

    # Enrich with material and project names
    enriched = []
    for req in rows:
        mat = await db.get(Material, req.material_id)
        proj = await db.get(Project, req.project_id) if req.project_id else None
        data = PurchaseRequestRead.model_validate(req)
        data.material_name = mat.name if mat else None
        data.project_name  = proj.name if proj else None
        enriched.append(data)
    return enriched


@router.post("/requests", response_model=PurchaseRequestRead, status_code=201)
async def create_request(
    payload: PurchaseRequestCreate,
    db:      AsyncSession = Depends(get_db),
    user:    User         = Depends(get_current_user),
):
    mat = await db.get(Material, payload.material_id)
    if not mat:
        raise NotFoundError(detail="Malzeme bulunamadı.")

    req = PurchaseRequest(
        tenant_id    = user.tenant_id,
        project_id   = payload.project_id,
        material_id  = payload.material_id,
        quantity     = payload.quantity,
        priority     = payload.priority,
        notes        = payload.notes,
        status       = ProcurementStatus.PENDING_APPROVAL,
        requested_by = user.id,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    data = PurchaseRequestRead.model_validate(req)
    data.material_name = mat.name
    return data


@router.patch("/requests/{request_id}/review", response_model=PurchaseRequestRead)
async def review_request(
    request_id: UUID,
    payload:    PurchaseRequestReview,
    db:         AsyncSession = Depends(get_db),
    user:       User         = Depends(get_current_user),
):
    if user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Sadece yöneticiler talebi onaylayabilir.")
    req = await db.get(PurchaseRequest, request_id)
    if not req:
        raise NotFoundError(detail="Talep bulunamadı.")
    if req.status != ProcurementStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Bu talep zaten incelenmiş.")

    if payload.action == "approve":
        req.status = ProcurementStatus.APPROVED
    elif payload.action == "reject":
        req.status = ProcurementStatus.REJECTED
    else:
        raise HTTPException(status_code=400, detail="Geçersiz aksiyon. 'approve' veya 'reject' kullanın.")

    req.reviewed_by  = user.id
    req.reviewed_at  = utc_now()
    req.review_note  = payload.review_note
    db.add(req)
    await db.commit()
    await db.refresh(req)

    mat = await db.get(Material, req.material_id)
    proj = await db.get(Project, req.project_id) if req.project_id else None
    data = PurchaseRequestRead.model_validate(req)
    data.material_name = mat.name if mat else None
    data.project_name  = proj.name if proj else None
    return data


# ─────────────────────────────────────────────────────────────────────────────
#  Satın Alma Siparişleri (Purchase Orders)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/orders", response_model=list[PurchaseOrderRead])
async def list_orders(
    db:         AsyncSession  = Depends(get_db),
    user:       User          = Depends(get_current_user),
    project_id: UUID | None   = None,
    status_filter: str | None = None,
    skip:       int           = 0,
    limit:      int           = 100,
):
    query = select(PurchaseOrder)
    if not is_platform_admin(user):
        query = query.where(PurchaseOrder.tenant_id == user.tenant_id)
    if project_id:
        query = query.where(PurchaseOrder.project_id == project_id)
    if status_filter:
        query = query.where(PurchaseOrder.status == status_filter)
    query = query.order_by(PurchaseOrder.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    rows = list(result.scalars())

    enriched = []
    for po in rows:
        supplier = await db.get(Supplier, po.supplier_id) if po.supplier_id else None
        proj     = await db.get(Project, po.project_id)   if po.project_id   else None
        # Load items
        items_result = await db.execute(
            select(PurchaseOrderItem).where(PurchaseOrderItem.order_id == po.id)
        )
        items = list(items_result.scalars())
        data = PurchaseOrderRead.model_validate(po)
        data.supplier_name = supplier.name if supplier else None
        data.project_name  = proj.name     if proj     else None
        data.items = []
        for item in items:
            mat = await db.get(Material, item.material_id)
            from app.db.schemas import PurchaseOrderItemRead
            iread = PurchaseOrderItemRead.model_validate(item)
            iread.material_name = mat.name if mat else None
            data.items.append(iread)
        enriched.append(data)
    return enriched


@router.post("/orders", response_model=PurchaseOrderRead, status_code=201)
async def create_order(
    payload: PurchaseOrderCreate,
    db:      AsyncSession = Depends(get_db),
    user:    User         = Depends(get_current_user),
):
    if user.default_role not in ("admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Sadece yöneticiler PO oluşturabilir.")

    order_date    = payload.order_date
    expected_date = payload.expected_date
    if order_date and order_date.tzinfo:
        order_date = order_date.replace(tzinfo=None)
    if expected_date and expected_date.tzinfo:
        expected_date = expected_date.replace(tzinfo=None)

    po = PurchaseOrder(
        tenant_id     = user.tenant_id,
        po_no         = payload.po_no,
        supplier_id   = payload.supplier_id,
        project_id    = payload.project_id,
        warehouse_id  = payload.warehouse_id,
        status        = ProcurementStatus.ORDERED,
        order_date    = order_date or utc_now(),
        expected_date = expected_date,
        notes         = payload.notes,
        created_by    = user.id,
    )
    db.add(po)
    await db.flush()

    total = Decimal("0")
    for item_in in payload.items:
        mat = await db.get(Material, item_in.material_id)
        if not mat:
            raise NotFoundError(detail=f"Malzeme bulunamadı: {item_in.material_id}")
        unit_price  = Decimal(str(item_in.unit_price)) if item_in.unit_price else (mat.unit_cost or Decimal("0"))
        total_price = unit_price * item_in.quantity
        total      += total_price
        poi = PurchaseOrderItem(
            order_id    = po.id,
            material_id = item_in.material_id,
            quantity    = item_in.quantity,
            unit_price  = unit_price,
            total_price = total_price,
            notes       = item_in.notes,
        )
        db.add(poi)

    po.total_amount = total
    db.add(po)
    await db.commit()
    await db.refresh(po)

    data = PurchaseOrderRead.model_validate(po)
    data.items = []
    return data


@router.patch("/orders/{order_id}/receive", response_model=PurchaseOrderRead)
async def receive_order(
    order_id: UUID,
    payload:  POReceiveRequest,
    db:       AsyncSession = Depends(get_db),
    user:     User         = Depends(get_current_user),
):
    """
    PO teslim alma — her satır için otomatik Stok IN hareketi oluşturur.
    Hedef depo: PO'daki warehouse_id (yoksa proje deposu).
    """
    if user.default_role not in ("admin", "depo_sorumlusu", "platform_admin"):
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz bulunmuyor.")

    po = await db.get(PurchaseOrder, order_id)
    if not po:
        raise NotFoundError(detail="Sipariş bulunamadı.")
    if po.status == ProcurementStatus.RECEIVED:
        raise HTTPException(status_code=400, detail="Bu sipariş zaten teslim alınmış.")
    if po.status == ProcurementStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="İptal edilmiş sipariş teslim alınamaz.")

    # Hedef depoyu belirle
    warehouse_id = po.warehouse_id
    if not warehouse_id:
        raise HTTPException(status_code=400, detail="Siparişe bağlı hedef depo tanımlanmamış.")

    items_result = await db.execute(
        select(PurchaseOrderItem).where(PurchaseOrderItem.order_id == po.id)
    )
    items = list(items_result.scalars())

    for item in items:
        # Stok IN hareketi oluştur
        txn = InventoryTransaction(
            material_id      = item.material_id,
            from_warehouse_id = None,
            to_warehouse_id  = warehouse_id,
            related_project_id = po.project_id,
            quantity         = item.quantity,
            unit_cost        = item.unit_price,
            total_cost       = item.total_price,
            transaction_type = InventoryTransactionType.IN,
            reference_no     = po.po_no,
            notes            = f"PO teslim alındı: {po.po_no}",
            performed_by     = user.id,
        )
        db.add(txn)

        # Stock tablosunu güncelle (upsert benzeri)
        stock_result = await db.execute(
            select(Stock).where(
                Stock.warehouse_id == warehouse_id,
                Stock.material_id  == item.material_id,
            )
        )
        stock = stock_result.scalars().first()
        if stock:
            stock.quantity   += item.quantity
            stock.updated_by  = user.id
            db.add(stock)
        else:
            new_stock = Stock(
                warehouse_id = warehouse_id,
                material_id  = item.material_id,
                quantity     = item.quantity,
                updated_by   = user.id,
            )
            db.add(new_stock)

    # PO'yu güncelle
    po.status      = ProcurementStatus.RECEIVED
    po.received_at = utc_now()
    po.received_by = payload.received_by or user.id
    if payload.notes:
        po.notes = (po.notes or "") + f" | Teslim notu: {payload.notes}"
    db.add(po)
    await db.commit()
    await db.refresh(po)

    data = PurchaseOrderRead.model_validate(po)
    data.items = []
    return data
