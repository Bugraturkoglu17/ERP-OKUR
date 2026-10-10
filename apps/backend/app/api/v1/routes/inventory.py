# ─────────────────────────────────────────────────────────────────────────────
#  V1 — Inventory Routes
#  Warehouse / Material / Stock / Transfer / Low-Stock Alerts
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, exists, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.core.email_templates import low_stock_alert_mail
from app.core.emailing import enqueue_tenant_email
from app.core.exceptions import NotFoundError, ConflictError
from app.db.models import (
    InventoryTransaction,
    InventoryTransactionType,
    LowStockAlert,
    Material,
    Project,
    Stock,
    User,
    Warehouse,
    WarehouseType,
    Tenant,
    Expense,
    ExpenseCategory,
)
from app.db.schemas import (
    InventoryTransactionCreate,
    InventoryTransactionRead,
    LowStockAlertRead,
    MaterialCreate,
    MaterialCreateWithStock,
    MaterialRead,
    MaterialUpdate,
    StockRead,
    TransferRequest,
    WarehouseCreate,
    WarehouseRead,
    WarehouseStockItem,
    WarehouseUpdate,
)

router = APIRouter()
LOW_STOCK_ALERT_COOLDOWN_MINUTES = 180


async def _tenant_admin_emails(db: AsyncSession, tenant_id: uuid.UUID) -> list[str]:
    result = await db.execute(
        select(User.email).where(
            User.tenant_id == tenant_id,
            User.default_role == "admin",
            User.is_active.is_(True),
        )
    )
    return [email for email in result.scalars().all() if email]


async def _notify_low_stock_if_needed(
    db: AsyncSession,
    *,
    warehouse: Warehouse,
    material: Material,
    quantity: Decimal,
) -> None:
    if warehouse.project_id is None:
        return
    project = await db.get(Project, warehouse.project_id)
    if not project:
        return
    if quantity > material.min_stock_level:
        return

    recent_threshold = datetime.now(timezone.utc) - timedelta(minutes=LOW_STOCK_ALERT_COOLDOWN_MINUTES)
    recent_alert = await db.execute(
        select(LowStockAlert.id)
        .where(LowStockAlert.item_id == material.id)
        .where(LowStockAlert.created_at >= recent_threshold)
        .order_by(LowStockAlert.created_at.desc())
        .limit(1)
    )
    if recent_alert.scalar_one_or_none() is not None:
        return

    recipients = await _tenant_admin_emails(db, project.tenant_id)
    if not recipients:
        return

    tenant = await db.get(Tenant, project.tenant_id)
    if not tenant:
        return

    mail = low_stock_alert_mail(
        tenant=tenant,
        material_name=material.name,
        sku=material.sku,
        current_stock=float(quantity),
        min_level=float(material.min_stock_level),
    )
    enqueue_tenant_email(
        tenant_id=project.tenant_id,
        template=mail.template,
        to=recipients,
        subject=mail.subject,
        text=mail.text,
        html=mail.html,
    )


def _same_tenant(user: User, tenant_id: object) -> bool:
    return str(user.tenant_id) == str(tenant_id)


async def _warehouse_in_scope(db: AsyncSession, user: User, warehouse: Warehouse) -> bool:
    if is_platform_admin(user):
        return True
    if warehouse.project_id is None:
        return False
    project = await db.get(Project, warehouse.project_id)
    if not project:
        return False
    return _same_tenant(user, project.tenant_id)


# ═════════════════════════════════════════════════════════════════════════════
#  DEPOLAR (Warehouses)
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/warehouses",
    response_model=WarehouseRead,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni depo oluştur",
)
async def create_warehouse(
    body:      WarehouseCreate,
    db:        AsyncSession = Depends(get_db),
    user:      User = Depends(get_current_user),
) -> Warehouse:
    if not is_platform_admin(user):
        if body.project_id is None:
            raise HTTPException(status_code=403, detail="Firma kullanıcıları yalnızca projeye bağlı depo oluşturabilir.")
        project = await db.get(Project, body.project_id)
        if not project or not _same_tenant(user, project.tenant_id):
            raise HTTPException(status_code=403, detail="Bu proje firma kapsamınız dışında.")

    warehouse = Warehouse(**body.model_dump())
    db.add(warehouse)
    try:
        await db.commit()
        await db.refresh(warehouse)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(detail=f"Depo kaydedilemedi (muhtemelen kod zaten mevcut): {exc}")
    return warehouse


@router.get(
    "/warehouses",
    response_model=list[WarehouseRead],
    summary="Depo listesi",
)
async def list_warehouses(
    type:        WarehouseType | None     = None,
    project_id:  uuid.UUID | None        = None,
    is_active:   bool | None             = True,
    skip:        int                      = 0,
    limit:       int                      = 100,
    db:          AsyncSession             = Depends(get_db),
    user:        User                     = Depends(get_current_user),
) -> list[Warehouse]:
    query = select(Warehouse)
    if not is_platform_admin(user):
        query = query.join(Project, Warehouse.project_id == Project.id).where(Project.tenant_id == user.tenant_id)
    if type is not None:
        query = query.where(Warehouse.type == type)
    if project_id is not None:
        query = query.where(Warehouse.project_id == project_id)
    if is_active is not None:
        query = query.where(Warehouse.is_active == is_active)
    query = query.order_by(Warehouse.name).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars())


@router.get(
    "/warehouses/{warehouse_id}",
    response_model=WarehouseRead,
    summary="Depo detayı",
)
async def get_warehouse(
    warehouse_id: uuid.UUID,
    db:           AsyncSession = Depends(get_db),
    user:         User = Depends(get_current_user),
) -> Warehouse:
    warehouse = await db.get(Warehouse, warehouse_id)
    if not warehouse:
        raise NotFoundError(detail="Depo bulunamadı.")
    if not await _warehouse_in_scope(db, user, warehouse):
        raise HTTPException(status_code=403, detail="Bu depo firma kapsamınız dışında.")
    return warehouse


@router.patch(
    "/warehouses/{warehouse_id}",
    response_model=WarehouseRead,
    summary="Depo bilgilerini güncelle",
)
async def update_warehouse(
    warehouse_id: uuid.UUID,
    body:         WarehouseUpdate,
    db:           AsyncSession = Depends(get_db),
    user:         User = Depends(get_current_user),
) -> Warehouse:
    warehouse = await db.get(Warehouse, warehouse_id)
    if not warehouse:
        raise NotFoundError(detail="Depo bulunamadı.")
    if not await _warehouse_in_scope(db, user, warehouse):
        raise HTTPException(status_code=403, detail="Bu depo firma kapsamınız dışında.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(warehouse, key, value)
    try:
        await db.commit()
        await db.refresh(warehouse)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(detail=f"Güncelleme başarısız: {exc}")
    return warehouse


@router.delete(
    "/warehouses/{warehouse_id}",
    summary="Depoyu pasife al (sil)",
)
async def delete_warehouse(
    warehouse_id: str,
    db:           AsyncSession = Depends(get_db),
    user:         User = Depends(get_current_user),
) -> Warehouse:
    try:
        uid = uuid.UUID(warehouse_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz UUID formatı.")
    warehouse = await db.get(Warehouse, uid)
    if not warehouse:
        raise NotFoundError(detail="Depo bulunamadı.")
    if not await _warehouse_in_scope(db, user, warehouse):
        raise HTTPException(status_code=403, detail="Bu depo firma kapsamınız dışında.")
    warehouse.is_active = False
    await db.commit()
    await db.refresh(warehouse)
    return warehouse


# ═════════════════════════════════════════════════════════════════════════════
#  MALZEME KATALOGU (Materials)
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/materials",
    response_model=MaterialRead,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni malzeme ekle",
)
async def create_material(
    body: MaterialCreateWithStock,
    db:   AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Material:
    if not is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Malzeme kataloğu yönetimi yalnızca geliştirici admin tarafından yapılabilir.")

    # ── 1 · Malzemeyi Oluştur ────────────────────────────────────────────────────
    mat_data = body.model_dump(exclude={"warehouse_id", "initial_quantity"})
    mat = Material(**mat_data)
    db.add(mat)
    
    try:
        await db.commit()
        await db.refresh(mat)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(detail=f"Kayıt başarısız: {exc}")

    # ── 2 · Opsiyonel: İlk Stok Girişi ──────────────────────────────────────────
    if body.warehouse_id and body.initial_quantity and body.initial_quantity > 0:
        # Stok kaydını bul veya oluştur
        stock_row = await db.execute(
            select(Stock).where(
                Stock.warehouse_id == body.warehouse_id,
                Stock.material_id  == mat.id,
            )
        )
        stock = stock_row.scalar_one_or_none()
        if stock is None:
            stock = Stock(
                warehouse_id = body.warehouse_id,
                material_id  = mat.id,
                quantity     = 0,
            )
            db.add(stock)
        
        stock.quantity += body.initial_quantity

        # Hareket kaydı (IN)
        tx = InventoryTransaction(
            material_id        = mat.id,
            to_warehouse_id    = body.warehouse_id,
            quantity           = body.initial_quantity,
            transaction_type   = InventoryTransactionType.IN,
            notes              = "İlk stok girişi (Malzeme oluşturulurken)",
            unit_cost          = body.unit_cost,
            total_cost         = Decimal(str(body.unit_cost)) * Decimal(str(body.initial_quantity)) if body.unit_cost else None,
        )
        db.add(tx)
        
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            # Malzeme zaten oluşturuldu, stok giriş hatası için uyarı verebiliriz ama malzemeyi geri silmiyoruz
            # veya transaction ile sarmalayabiliriz. Burada basitlik için ayrı commit yapıyoruz.
            raise HTTPException(status_code=500, detail=f"Malzeme oluşturuldu ancak ilk stok girişi başarısız: {exc}")

    return mat


@router.get(
    "/materials",
    response_model=list[MaterialRead],
    summary="Malzeme listesi",
)
async def list_materials(
    search:       str | None       = None,
    active_only:  bool | None      = True,
    skip:         int              = 0,
    limit:        int              = 100,
    db:           AsyncSession     = Depends(get_db),
    user:         User             = Depends(get_current_user),
) -> list[Material]:
    query = select(Material)
    if not is_platform_admin(user):
        query = (
            query.join(Stock, Stock.material_id == Material.id)
            .join(Warehouse, Warehouse.id == Stock.warehouse_id)
            .join(Project, Project.id == Warehouse.project_id)
            .where(Project.tenant_id == user.tenant_id)
            .distinct()
        )
    if active_only:
        query = query.where(Material.is_active == True)
    if search:
        query = query.where(
            Material.name.ilike(f"%{search}%") |
            Material.sku.ilike(f"%{search}%")
        )
    query = query.order_by(Material.name).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars())


@router.get(
    "/materials/{material_id}",
    response_model=MaterialRead,
    summary="Malzeme detayı",
)
async def get_material(
    material_id: str,
    db:          AsyncSession = Depends(get_db),
    user:        User = Depends(get_current_user),
) -> Material:
    try:
        uid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz UUID formatı.")
    mat = await db.get(Material, uid)
    if not mat:
        raise NotFoundError(detail="Malzeme bulunamadı.")
    if not is_platform_admin(user):
        in_scope = await db.execute(
            select(Material.id)
            .join(Stock, Stock.material_id == Material.id)
            .join(Warehouse, Warehouse.id == Stock.warehouse_id)
            .join(Project, Project.id == Warehouse.project_id)
            .where(Material.id == uid, Project.tenant_id == user.tenant_id)
            .limit(1)
        )
        if not in_scope.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Bu malzeme firma kapsamınız dışında.")
    return mat


@router.patch(
    "/materials/{material_id}",
    response_model=MaterialRead,
    summary="Malzeme bilgilerini güncelle",
)
async def update_material(
    material_id: str,
    body:         MaterialUpdate,
    db:           AsyncSession = Depends(get_db),
    user:         User = Depends(get_current_user),
) -> Material:
    if not is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Malzeme kataloğu güncellemesi yalnızca geliştirici admin tarafından yapılabilir.")

    try:
        uid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz UUID formatı.")
    mat = await db.get(Material, uid)
    if not mat:
        raise NotFoundError(detail="Malzeme bulunamadı.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(mat, key, value)
    try:
        await db.commit()
        await db.refresh(mat)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(detail=f"Güncelleme başarısız: {exc}")
    return mat


@router.delete(
    "/materials/{material_id}",
    summary="Malzemeyi pasife al (sil)",
)
async def delete_material(
    material_id: str,
    db:          AsyncSession = Depends(get_db),
    user:        User = Depends(get_current_user),
) -> Material:
    if not is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Malzeme kataloğu silme yalnızca geliştirici admin tarafından yapılabilir.")

    try:
        uid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz UUID formatı.")
    
    mat = await db.get(Material, uid)
    if not mat:
        raise NotFoundError(detail="Malzeme bulunamadı.")
    mat.is_active = False
    await db.commit()
    await db.refresh(mat)
    return mat


# ═════════════════════════════════════════════════════════════════════════════
#  STOK DURUMU (Stock — per-depo anlık görünümü)
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/warehouses/{warehouse_id}/stock",
    response_model=list[WarehouseStockItem],
    summary="Deponun anlık stok durumu",
    description=(
        "Belirtilen depodaki tüm malzemeleri ve miktarlarını listeler. "
        "'Açık stok' = stok kaydı var ama miktarı 0 olanlar."
    ),
)
async def get_warehouse_stock(
    warehouse_id: uuid.UUID,
    db:           AsyncSession = Depends(get_db),
    user:         User = Depends(get_current_user),
    min_only:     bool          = Query(
        False, description="Sadece kritik stok altındaki malzemeleri göster"
    ),
) -> list[WarehouseStockItem]:
    warehouse = await db.get(Warehouse, warehouse_id)
    if not warehouse:
        raise NotFoundError(detail="Depo bulunamadı.")
    if not await _warehouse_in_scope(db, user, warehouse):
        raise HTTPException(status_code=403, detail="Bu depo firma kapsamınız dışında.")

    query = (
        select(
            Stock.warehouse_id,
            Stock.material_id,
            Stock.quantity,
            Stock.updated_at,
            Stock.updated_by,
            Material.sku,
            Material.name,
            Material.unit,
            Material.min_stock_level,
            Material.unit_cost,
        )
        .join(Material, Stock.material_id == Material.id)
        .where(Stock.warehouse_id == warehouse_id)
        .where(Material.is_active == True)
        .order_by(Material.name)
    )

    if min_only:
        query = query.where(Stock.quantity <= Material.min_stock_level)

    result = await db.execute(query)
    rows = result.all()

    return [
        WarehouseStockItem(
            material_id    = row.material_id,
            sku            = row.sku,
            name            = row.name,
            unit            = row.unit,
            quantity        = row.quantity,
            min_stock_level = row.min_stock_level,
            unit_cost       = float(row.unit_cost) if row.unit_cost is not None else None,
        )
        for row in rows
    ]


@router.get(
    "/stock",
    response_model=list[StockRead],
    summary="Genel stok özeti (tüm depolar)",
)
async def get_global_stock(
    material_id: uuid.UUID | None = None,
    db:          AsyncSession = Depends(get_db),
    user:        User = Depends(get_current_user),
) -> list[Stock]:
    query = select(Stock).join(Warehouse, Warehouse.id == Stock.warehouse_id)
    if not is_platform_admin(user):
        query = query.join(Project, Project.id == Warehouse.project_id).where(Project.tenant_id == user.tenant_id)
    if material_id is not None:
        query = query.where(Stock.material_id == material_id)
    result = await db.execute(query.order_by(Stock.warehouse_id, Stock.material_id))
    return list(result.scalars())


# ═════════════════════════════════════════════════════════════════════════════
#  TRANSFER — Malzeme transferi (merkez → proje vb.)
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/transfer",
    response_model=InventoryTransactionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Depo-transferi yap",
    description=(
        "Bir depodan diğerine malzeme transfer eder. "
        "from_warehouse stokunu düşürür, to_warehouse stokunu artırır. "
        "Tüm işlem tek bir transaction (commit/rollback) olarak çalışır."
    ),
)
async def transfer_stock(
    body: TransferRequest,
    db:   AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InventoryTransaction:
    material_id        = body.material_id
    from_warehouse_id  = body.from_warehouse_id
    to_warehouse_id    = body.to_warehouse_id
    quantity           = body.quantity

    # ── 1 · Validasyon ──────────────────────────────────────────────────────────
    if quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Miktar pozitif olmalıdır.",
        )

    if from_warehouse_id == to_warehouse_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kaynak ve hedef depo aynı olamaz.",
        )

    # ── 2 · Kayıtları çek ──────────────────────────────────────────────────────
    material = await db.get(Material, material_id)
    if not material or not material.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Malzeme bulunamadı veya pasif.",
        )

    from_wh = await db.get(Warehouse, from_warehouse_id)
    if not from_wh or not from_wh.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kaynak depo bulunamadı veya pasif.",
        )

    to_wh = await db.get(Warehouse, to_warehouse_id)
    if not to_wh or not to_wh.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hedef depo bulunamadı veya pasif.",
        )

    if not await _warehouse_in_scope(db, user, from_wh) or not await _warehouse_in_scope(db, user, to_wh):
        raise HTTPException(status_code=403, detail="Depo transferi firma kapsamınız dışında.")

    # ── 3 · Mevcut stok kayıtlarını bul /Bulunamadıysa oluştur ─────────────────
    # Kaynak stok
    from_stock_row = await db.execute(
        select(Stock).where(
            Stock.warehouse_id == from_warehouse_id,
            Stock.material_id  == material_id,
        )
    )
    from_stock = from_stock_row.scalar_one_or_none()
    if from_stock is None:
        from_stock = Stock(
            warehouse_id = from_warehouse_id,
            material_id  = material_id,
            quantity     = 0,
        )
        db.add(from_stock)

    # Hedef stok
    to_stock_row = await db.execute(
        select(Stock).where(
            Stock.warehouse_id == to_warehouse_id,
            Stock.material_id  == material_id,
        )
    )
    to_stock = to_stock_row.scalar_one_or_none()
    if to_stock is None:
        to_stock = Stock(
            warehouse_id = to_warehouse_id,
            material_id  = material_id,
            quantity     = 0,
        )
        db.add(to_stock)

    # ── 4 · Yetersiz stok kontrolü ─────────────────────────────────────────────
    if from_stock.quantity < quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Yetersiz stok: '{material.name}' için "
                f"{from_wh.name} deposunda sadece {from_stock.quantity} {material.unit} mevcut, "
                f"{quantity} {material.unit} talep edildi."
            ),
        )

    # ── 5 · Stokları güncelle ──────────────────────────────────────────────────
    from_stock.quantity -= quantity
    to_stock.quantity   += quantity

    # ── 6 · InventoryTransaction kaydı oluştur ────────────────────────────────
    unit_cost  = body.unit_cost
    total_cost = (
        Decimal(str(unit_cost)) * Decimal(str(quantity))
        if unit_cost is not None
        else None
    )

    tx = InventoryTransaction(
        material_id         = material_id,
        from_warehouse_id   = from_warehouse_id,
        to_warehouse_id     = to_warehouse_id,
        quantity            = quantity,
        transaction_type    = InventoryTransactionType.TRANSFER,
        reference_no        = body.reference_no,
        notes               = body.notes,
        related_project_id  = body.related_project_id,
        unit_cost           = unit_cost,
        total_cost          = total_cost,
        performed_by        = None,  # auth'dan doldurulabilir (sonraki iterasyon)
    )
    db.add(tx)

    # ── 7 · Commit — hata olursa tümü rollback ────────────────────────────────
    try:
        await db.commit()
        await db.refresh(tx)
        await db.refresh(from_stock)
        await db.refresh(to_stock)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transfer işlemi başarısız: {exc}",
        )

    await _notify_low_stock_if_needed(
        db,
        warehouse=from_wh,
        material=material,
        quantity=from_stock.quantity,
    )

    return tx


# ═════════════════════════════════════════════════════════════════════════════
#  STOK HAREKETLERİ / TRANSACTION LOG
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/transactions",
    response_model=InventoryTransactionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Elle stok hareketi kaydı oluştur",
    description=(
        "Transfer dışı HAIR (IN / OUT / RETURN / ADJUSTMENT) işlemleri için kullanılır. "
        "IN işlemini kullanarak aynı anda 'from_warehouse' stokunu artırabilirsiniz. "
        "OUT işlemini kullanarak stok konsinyasyonu yapabilirsiniz."
    ),
)
async def create_transaction(
    body: InventoryTransactionCreate,
    db:   AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InventoryTransaction:
    tx_type = body.transaction_type

    if tx_type == InventoryTransactionType.TRANSFER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transfer işlemi için /inventory/transfer endpoint'ini kullanın.",
        )

    # ── 0 · Malzeme Doğrulaması ──────────────────────────────────────────────
    material = await db.get(Material, body.material_id)
    if not material or not material.is_active:
        raise NotFoundError(detail="Malzeme bulunamadı veya pasif.")

    from_wh_id = body.from_warehouse_id
    to_wh_id   = body.to_warehouse_id

    # ── IN / RETURN → to_warehouse stokunu artır ──────────────────────────────
    if tx_type in (InventoryTransactionType.IN, InventoryTransactionType.RETURN):
        if not to_wh_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{tx_type.value} işlemi için to_warehouse_id gerekli.",
            )
        wh = await db.get(Warehouse, to_wh_id)
        if not wh or not wh.is_active:
            raise NotFoundError(detail="Hedef depo bulunamadı.")
        if not await _warehouse_in_scope(db, user, wh):
            raise HTTPException(status_code=403, detail="Hedef depo firma kapsamınız dışında.")

        stock_row = await db.execute(
            select(Stock).where(
                Stock.warehouse_id == to_wh_id,
                Stock.material_id  == body.material_id,
            )
        )
        stock = stock_row.scalar_one_or_none()
        if stock is None:
            stock = Stock(warehouse_id=to_wh_id, material_id=body.material_id, quantity=0)
            db.add(stock)
        stock.quantity += body.quantity

    # ── OUT / ADJUSTMENT → from_warehouse stokunu düşür ──────────────────────
    if tx_type in (InventoryTransactionType.OUT, InventoryTransactionType.ADJUSTMENT):
        if not from_wh_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{tx_type.value} işlemi için from_warehouse_id gerekli.",
            )
        wh = await db.get(Warehouse, from_wh_id)
        if not wh or not wh.is_active:
            raise NotFoundError(detail="Kaynak depo bulunamadı.")
        if not await _warehouse_in_scope(db, user, wh):
            raise HTTPException(status_code=403, detail="Kaynak depo firma kapsamınız dışında.")

        stock_row = await db.execute(
            select(Stock).where(
                Stock.warehouse_id == from_wh_id,
                Stock.material_id  == body.material_id,
            )
        )
        stock = stock_row.scalar_one_or_none()
        if stock is not None and stock.quantity < body.quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Yetersiz stok ({stock.quantity} < {body.quantity})."
                ),
            )
        if stock is None:
            stock = Stock(
                warehouse_id = from_wh_id,
                material_id  = body.material_id,
                quantity     = 0,
            )
            db.add(stock)
        stock.quantity -= body.quantity

    # ── Transaction kaydı ──────────────────────────────────────────────────────
    unit_cost  = body.unit_cost
    if unit_cost is None:
        unit_cost = material.unit_cost

    total_cost = (
        Decimal(str(unit_cost)) * Decimal(str(body.quantity))
        if unit_cost is not None
        else None
    )
    tx = InventoryTransaction(
        material_id        = body.material_id,
        from_warehouse_id  = body.from_warehouse_id,
        to_warehouse_id    = body.to_warehouse_id,
        quantity           = body.quantity,
        transaction_type   = tx_type,
        reference_no       = body.reference_no,
        notes              = body.notes,
        related_project_id = body.related_project_id,
        unit_cost          = unit_cost,
        total_cost         = total_cost,
        performed_by       = user.id,
        performed_at       = datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(tx)
    await db.flush()  # tx.id almak için flush yapıyoruz

    # ── Eğer projeye çıkış ise otomatik gider ekle ──────────────────────────────
    if tx_type in (InventoryTransactionType.OUT, InventoryTransactionType.ADJUSTMENT) and body.related_project_id:
        expense_amount = total_cost or Decimal("0")
        desc_notes = f" ({body.notes})" if body.notes else ""
        description = f"{material.name} Stok Çıkışı - Miktar: {body.quantity} {material.unit}{desc_notes}"
        if len(description) > 255:
            description = description[:252] + "..."

        expense = Expense(
            project_id=body.related_project_id,
            category=ExpenseCategory.MATERIAL,
            description=description,
            amount=expense_amount,
            quantity=float(body.quantity),
            stock_movement_id=tx.id,
            expense_date=datetime.now(timezone.utc).replace(tzinfo=None),
            created_by=user.id,
        )
        db.add(expense)

    try:
        await db.commit()
        await db.refresh(tx)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hareket kaydedilemedi: {exc}",
        )

    if tx_type in (InventoryTransactionType.OUT, InventoryTransactionType.ADJUSTMENT) and from_wh_id:
        from_wh = await db.get(Warehouse, from_wh_id)
        stock_row = await db.execute(
            select(Stock).where(
                Stock.warehouse_id == from_wh_id,
                Stock.material_id == body.material_id,
            )
        )
        latest_stock = stock_row.scalar_one_or_none()
        if from_wh and latest_stock and material:
            await _notify_low_stock_if_needed(
                db,
                warehouse=from_wh,
                material=material,
                quantity=latest_stock.quantity,
            )

    return tx


@router.get(
    "/transactions",
    response_model=list[InventoryTransactionRead],
    summary="Stok hareketi listesi",
)
async def list_transactions(
    material_id:        uuid.UUID | None = None,
    warehouse_id:       uuid.UUID | None = None,
    transaction_type:   str | None       = None,
    skip:               int              = 0,
    limit:              int              = 100,
    db:                 AsyncSession     = Depends(get_db),
    user:               User             = Depends(get_current_user),
) -> list[InventoryTransaction]:
    query = select(InventoryTransaction).order_by(
        InventoryTransaction.performed_at.desc()
    )
    if not is_platform_admin(user):
        tenant_scope = (
            select(1)
            .select_from(Warehouse)
            .join(Project, Project.id == Warehouse.project_id)
            .where(
                Project.tenant_id == user.tenant_id,
                or_(
                    Warehouse.id == InventoryTransaction.from_warehouse_id,
                    Warehouse.id == InventoryTransaction.to_warehouse_id,
                ),
            )
        )
        query = query.where(exists(tenant_scope))
    if material_id:
        query = query.where(InventoryTransaction.material_id == material_id)
    if warehouse_id:
        query = query.where(
            (InventoryTransaction.from_warehouse_id == warehouse_id) |
            (InventoryTransaction.to_warehouse_id   == warehouse_id),
        )
    if transaction_type:
        query = query.where(
            InventoryTransaction.transaction_type == transaction_type
        )
    result = await db.execute(query.offset(skip).limit(limit))
    return list(result.scalars())


@router.get(
    "/transactions/{transaction_id}",
    summary="Stok hareketi detayı",
)
async def get_transaction(
    transaction_id: uuid.UUID,
    db:             AsyncSession = Depends(get_db),
    user:           User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    stmt = (
        select(InventoryTransaction)
        .options(
            selectinload(InventoryTransaction.material),
            selectinload(InventoryTransaction.from_warehouse),
            selectinload(InventoryTransaction.to_warehouse),
        )
        .where(InventoryTransaction.id == transaction_id)
    )
    result = await db.execute(stmt)
    tx = result.scalar_one_or_none()
    if not tx:
        raise NotFoundError(detail="Stok hareketi bulunamadı.")

    return {
        "id":                  str(tx.id),
        "material_id":         str(tx.material_id),
        "material_name":       tx.material.name if tx.material else None,
        "material_sku":        tx.material.sku if tx.material else None,
        "material_unit":       tx.material.unit if tx.material else None,
        "from_warehouse_id":   str(tx.from_warehouse_id) if tx.from_warehouse_id else None,
        "from_warehouse_name": tx.from_warehouse.name if tx.from_warehouse else None,
        "to_warehouse_id":     str(tx.to_warehouse_id) if tx.to_warehouse_id else None,
        "to_warehouse_name":   tx.to_warehouse.name if tx.to_warehouse else None,
        "related_project_id":  str(tx.related_project_id) if tx.related_project_id else None,
        "quantity":            tx.quantity,
        "unit_cost":           float(tx.unit_cost) if tx.unit_cost is not None else None,
        "total_cost":          float(tx.total_cost) if tx.total_cost is not None else None,
        "transaction_type":    tx.transaction_type,
        "reference_no":        tx.reference_no,
        "notes":               tx.notes,
        "performed_by":        str(tx.performed_by) if tx.performed_by else None,
        "performed_at":        tx.performed_at.isoformat() if tx.performed_at else None,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  DÜŞÜK STOK UYARILARI
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/alerts/low-stock",
    response_model=list[LowStockAlertRead],
    summary="Kritik stok uyarıları",
)
async def list_low_stock_alerts(
    notified: bool | None  = None,
    db:       AsyncSession = Depends(get_db),
    user:     User = Depends(get_current_user),
) -> list[LowStockAlert]:
    query = select(LowStockAlert).order_by(LowStockAlert.created_at.desc())
    if not is_platform_admin(user):
        query = (
            query.join(Material, Material.id == LowStockAlert.item_id)
            .join(Stock, Stock.material_id == Material.id)
            .join(Warehouse, Warehouse.id == Stock.warehouse_id)
            .join(Project, Project.id == Warehouse.project_id)
            .where(Project.tenant_id == user.tenant_id)
            .distinct()
        )
    if notified is not None:
        query = query.where(LowStockAlert.notified == notified)
    result = await db.execute(query)
    return list(result.scalars())
