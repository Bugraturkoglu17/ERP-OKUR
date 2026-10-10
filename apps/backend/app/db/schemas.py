"""
Pydantic v2 Schemas — parsed DTO'lar, DB'ye direkt map edilmez.
Modellerin kendisi core/db/models.py'da tanımlanır; şemalar core/db/schemas.py'da.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr
from pydantic import Field

from app.db.models import (
    WarehouseType,
    InventoryTransactionType,
    TenantEmailMode,
)


# ── Auth ──────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    force_password_change: bool = False


class TokenRefresh(BaseModel):
    refresh_token: str


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class CompletePasswordResetRequest(BaseModel):
    email: str
    temporary_password: str
    new_password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    message: str


class NotificationRead(BaseModel):
    id:             UUID
    category:       str
    title:          str
    body:           str | None
    work_order_id:  UUID | None
    is_read:        bool
    created_at:     datetime


class NotificationUnreadCount(BaseModel):
    count: int


class TenantContextRead(BaseModel):
    tenant_id: UUID
    tenant_name: str
    tenant_code: str
    logo_url: str | None = None
    tax_no: str | None = None
    sector: str | None = None
    country: str | None = None
    theme_color: str | None = None
    domain: str | None = None
    subdomain: str | None = None
    email_mode: TenantEmailMode = TenantEmailMode.PLATFORM
    from_name: str | None = None
    from_email: str | None = None
    reply_to: str | None = None
    email_domain_verified: bool = False
    email_provider_identity_id: str | None = None
    email_branding: dict[str, Any] | None = None
    email_notifications_enabled: bool = True
    email_digest_mode: str = "immediate"
    email_opt_out_templates: list[str] = Field(default_factory=list)


class TenantProfileUpdate(BaseModel):
    tenant_name: str | None = None
    logo_url: str | None = None


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email:       EmailStr | None = None
    password:    str = Field(min_length=8)
    full_name:   str
    phone:       str
    roles:       list[str]
    discipline:  str | None         = None
    discipline_only: bool = False
    is_active:   bool = True
    tenant_id:   UUID | None = None


class UserRead(BaseModel):
    id:             UUID
    tenant_id:      UUID | None
    email:          str
    full_name:      str
    phone:          str  | None
    discipline:     str | None
    discipline_only:bool
    is_active:      bool
    default_role:   str | None
    force_password_change: bool = False
    onboarding_complete: bool = True
    model_config   = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    full_name:  str | None         = None
    phone:      str | None         = None
    discipline: str | None         = None
    is_active:  bool | None        = None
    roles:      list[str] | None   = None


class UserProfileUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None


class TemporaryPasswordResponse(BaseModel):
    temporary_password: str


class TenantCreate(BaseModel):
    name: str
    code: str
    logo_url: str | None = None


class TenantRead(BaseModel):
    id: UUID
    name: str
    code: str
    logo_url: str | None
    status: str
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TenantAdminProvisionRequest(BaseModel):
    tenant_id: UUID
    email: EmailStr
    full_name: str
    temporary_password: str


class TenantUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    logo_url: str | None = None
    status: str | None = None
    is_active: bool | None = None


class TenantSettingsUpsert(BaseModel):
    tax_no: str | None = None
    sector: str | None = None
    country: str | None = None
    theme_color: str | None = None
    domain: str | None = None
    subdomain: str | None = None
    email_mode: TenantEmailMode | None = None
    from_name: str | None = None
    from_email: str | None = None
    reply_to: str | None = None
    email_domain_verified: bool | None = None
    email_provider_identity_id: str | None = None
    email_branding: dict[str, Any] | None = None
    email_notifications_enabled: bool | None = None
    email_digest_mode: str | None = None
    email_opt_out_templates: list[str] | None = None


class TenantSettingsRead(TenantSettingsUpsert):
    tenant_id: UUID
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TenantAdminRead(UserRead):
    force_password_change: bool = False


class TenantAdminResetRequest(BaseModel):
    admin_user_id: UUID | None = None
    temporary_password: str
    force_password_change: bool = True


class TenantAdminUpdateRequest(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    force_password_change: bool | None = None


class PlatformPlanCreate(BaseModel):
    code: str
    name: str
    max_users: int = 10
    storage_limit_gb: int = 5
    modules: list[str] = []


class PlatformPlanRead(BaseModel):
    id: UUID
    code: str
    name: str
    max_users: int
    storage_limit_gb: int
    modules: list[str]
    is_active: bool
    created_at: datetime


class PlatformSubscriptionAssignRequest(BaseModel):
    tenant_id: UUID
    plan_id: UUID
    status: str = "active"
    ends_at: datetime | None = None


class PlatformSubscriptionRead(BaseModel):
    id: UUID
    tenant_id: UUID
    plan_id: UUID
    status: str
    starts_at: datetime
    ends_at: datetime | None
    created_at: datetime


class PlatformAuditRead(BaseModel):
    id: UUID
    actor_user_id: UUID
    action: str
    tenant_id: UUID | None
    target_user_id: UUID | None
    details: str | None
    created_at: datetime


# ── Role / Permission ─────────────────────────────────────────────────────────

class RoleRead(BaseModel):
    id:           UUID
    name:         str
    display_name: str
    description:  str  | None
    is_active:    bool
    model_config  = ConfigDict(from_attributes=True)


# ── Customer ──────────────────────────────────────────────────────────────────

class CustomerBase(BaseModel):
    name:          str
    tax_no:        str | None         = None
    contact_email: str | None         = None
    contact_phone: str | None         = None
    address:       str | None         = None


class CustomerCreate(CustomerBase):
    pass


class CustomerRead(CustomerBase):
    id:        UUID
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Hierarchy ─────────────────────────────────────────────────────────────────

class RegionRead(BaseModel):
    id:          UUID
    customer_id: UUID
    name:        str
    code:        str | None
    city:        str
    model_config = ConfigDict(from_attributes=True)


class RegionCreate(BaseModel):
    customer_id: UUID
    name: str
    code: str | None = None
    city: str


class RegionUpdate(BaseModel):
    customer_id: UUID | None = None
    name: str | None = None
    code: str | None = None
    city: str | None = None


class BranchRead(BaseModel):
    id:         UUID
    region_id:  UUID
    name:       str
    code:       str | None
    address:    str | None
    model_config = ConfigDict(from_attributes=True)


class BranchCreate(BaseModel):
    region_id: UUID
    name: str
    code: str | None = None
    address: str | None = None


class BranchUpdate(BaseModel):
    region_id: UUID | None = None
    name: str | None = None
    code: str | None = None
    address: str | None = None


# ── Projects ─────────────────────────────────────────────────────────────────

class ProjectScope(BaseModel):
    code: str
    name: str


class ProjectCreate(BaseModel):
    customer_id:    UUID | None        = None
    region_id:      UUID | None        = None
    branch_id:      UUID | None        = None
    name:           str
    project_no:     str | None         = None
    description:    str | None         = None
    start_date:     datetime | None    = None
    due_date:       datetime | None    = None
    scope_codes:    list[str]         = []
    contract_value: float | None       = None
    status:         str               = "inquiry"


class ProjectRead(ProjectCreate):
    id:          UUID
    created_by:  UUID | None
    created_at:  datetime
    updated_at:  datetime
    model_config = ConfigDict(from_attributes=True)


class ProjectUpdate(BaseModel):
    name:           str | None          = None
    project_no:     str | None          = None
    description:    str | None          = None
    start_date:     datetime | None     = None
    due_date:       datetime | None     = None
    scope_codes:    list[str] | None    = None
    status:         str | None          = None
    contract_value: float | None        = None


class ProjectAssignmentCreate(BaseModel):
    user_id:        UUID
    role_at_project: str
    is_lead:        bool = False


class ProjectAssignmentRead(ProjectAssignmentCreate):
    id:             UUID
    project_id:     UUID
    assigned_at:    datetime
    unassigned_at:  datetime | None
    model_config   = ConfigDict(from_attributes=True)


# ── Inventory ─────────────────────────────────────────────────────────────────

class WarehouseCreate(BaseModel):
    type:        WarehouseType
    name:        str
    code:        str | None = None
    location:    str | None = None
    project_id:  UUID | None = None
    is_active:   bool = True


class WarehouseUpdate(BaseModel):
    type:        WarehouseType | None = None
    name:        str | None = None
    code:        str | None = None
    location:    str | None = None
    project_id:  UUID | None = None
    is_active:   bool | None = None


class WarehouseRead(BaseModel):
    id:         UUID
    type:       str
    name:       str
    code:       str | None
    location:   str | None
    project_id: UUID | None
    is_active:  bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MaterialCreate(BaseModel):
    sku:             str
    name:            str
    description:     str | None = None
    unit:            str = "adet"
    barcode:         str | None = None
    unit_cost:       float | None = None
    min_stock_level: int = 0
    is_active:       bool = True


class MaterialCreateWithStock(MaterialCreate):
    warehouse_id:     UUID | None = None
    initial_quantity: int | None = None


class MaterialUpdate(BaseModel):
    sku:             str | None = None
    name:            str | None = None
    description:     str | None = None
    unit:            str | None = None
    barcode:         str | None = None
    unit_cost:       float | None = None
    min_stock_level: int | None = None
    is_active:       bool | None = None


class MaterialRead(BaseModel):
    id:               UUID
    sku:              str
    name:             str
    description:      str | None
    unit:             str
    barcode:          str | None
    unit_cost:        float | None
    min_stock_level:  int
    is_active:        bool
    created_at:       datetime
    model_config      = ConfigDict(from_attributes=True)


class StockRead(BaseModel):
    warehouse_id: UUID
    material_id:  UUID
    quantity:     int
    updated_at:   datetime
    updated_by:   UUID | None
    model_config = ConfigDict(from_attributes=True)


class WarehouseStockItem(BaseModel):
    """Material + quantity for a given warehouse's stock listing."""
    material_id:   UUID
    sku:           str
    name:           str
    unit:           str
    quantity:       int
    min_stock_level: int
    unit_cost:      float | None
    model_config   = ConfigDict(from_attributes=True)


class TransferRequest(BaseModel):
    material_id:       UUID
    from_warehouse_id: UUID
    to_warehouse_id:   UUID
    quantity:          int
    reference_no:      str | None = None
    notes:             str | None = None
    related_project_id: UUID | None = None
    unit_cost:         float | None = None


class InventoryTransactionCreate(BaseModel):
    material_id:        UUID
    from_warehouse_id:  UUID | None = None
    to_warehouse_id:    UUID | None = None
    quantity:           int
    transaction_type:   InventoryTransactionType
    reference_no:       str | None = None
    notes:              str | None = None
    related_project_id: UUID | None = None
    unit_cost:          float | None = None


class InventoryTransactionRead(BaseModel):
    id:                  UUID
    material_id:         UUID
    from_warehouse_id:   UUID | None
    to_warehouse_id:     UUID | None
    related_project_id:  UUID | None
    quantity:            int
    unit_cost:           float | None
    total_cost:          float | None
    transaction_type:    str
    reference_no:        str | None
    notes:               str | None
    performed_by:        UUID | None
    performed_at:        datetime
    model_config        = ConfigDict(from_attributes=True)


class LowStockAlertRead(BaseModel):
    id:            UUID
    item_id:       UUID
    current_stock: int
    min_level:     int
    notified:      bool
    created_at:    datetime
    model_config  = ConfigDict(from_attributes=True)


# ── Documents ────────────────────────────────────────────────────────────────────
 
class DocumentCreate(BaseModel):
    project_id:   UUID
    doc_type:     str
    original_name: str
    revision_note: str | None = None
    expense_id:   UUID | None = None
    process_id:   UUID | None = None
    vi_meta:      str | None = None

class DocumentUpdate(BaseModel):
    doc_type:     str | None = None
    original_name: str | None = None
    revision_note: str | None = None

class DocumentRead(BaseModel):
    id:              UUID
    project_id:      UUID | None
    doc_type:        str
    original_name:   str
    file_key:        str
    bucket_name:     str
    file_size_bytes: int | None
    mime_type:       str | None
    version:         int
    revision_note:   str | None
    archived:        bool
    uploaded_by:     UUID | None
    created_at:      datetime
    expense_id:           UUID | None = None
    process_id:           UUID | None = None
    vi_meta:              str | None = None
    uploaded_by_name:     str | None = None
    uploaded_by_email:    str | None = None
    # Genel Arşiv alanları
    is_archive:           bool = False
    archive_status:       str = "archive"
    transferred_project_id:   UUID | None = None
    transferred_category:     str | None = None
    transferred_at:           datetime | None = None
    # Taşındığı mağaza adı (API tarafından populate edilir)
    transferred_project_name: str | None = None
    transferred_project_no:   str | None = None
    model_config    = ConfigDict(from_attributes=True)


class ArchiveTransferRequest(BaseModel):
    project_id:   UUID
    doc_type:     str  # hedef category → mevcut doc_type değeri
 
class DocumentVersionCreate(BaseModel):
    doc_id:         UUID
    revision_note:  str | None = None
 
class DocumentDownloadResponse(BaseModel):
    url: str
    expires_in: int
 
# ── Finance ──────────────────────────────────────────────────────────────────────

class InvoiceRead(BaseModel):
    id:            UUID
    invoice_no:    str
    grand_total:   float
    status:        str
    issue_date:    datetime
    title:         str | None = None
    customer_id:   UUID | None = None
    project_id:    UUID | None = None
    subtotal:      float | None = None
    tax_rate:      float | None = None
    tax_amount:    float | None = None
    due_date:      datetime | None = None
    model_config  = ConfigDict(from_attributes=True)

class InvoiceItemCreate(BaseModel):
    description:     str
    quantity:        float
    unit_price:      float

class InvoiceItemRead(BaseModel):
    id:              UUID
    invoice_id:      UUID
    description:     str
    quantity:        float
    unit_price:      float
    total_amount:    float
    model_config  = ConfigDict(from_attributes=True)

class InvoiceCreate(BaseModel):
    customer_id:       UUID
    project_id:        UUID | None = None
    invoice_no:        str
    title:             str
    issue_date:        datetime
    due_date:          datetime | None = None
    subtotal:          float
    tax_rate:          float = 20.0
    tax_amount:        float
    grand_total:       float
    status:            str = "draft"
    items:             list[InvoiceItemCreate] = []

class ExpenseCreate(BaseModel):
    project_id:        UUID
    category:          str
    description:       str
    amount:            float
    quantity:          float | None = None
    expense_date:      datetime
    stock_movement_id: UUID | None = None

class ExpenseRead(BaseModel):
    id:                UUID
    project_id:        UUID
    category:          str
    description:       str
    amount:            float
    quantity:          float | None
    expense_date:      datetime
    created_at:        datetime
    stock_movement_id: UUID | None = None
    documents:         list[DocumentRead] = []
    model_config  = ConfigDict(from_attributes=True)

class PaymentCreate(BaseModel):
    invoice_id:        UUID | None = None
    direction:         str = "incoming"
    amount:            float
    payment_method:    str
    reference_no:      str | None = None
    payment_date:      datetime
    notes:             str | None = None

class PaymentRead(BaseModel):
    id:                UUID
    invoice_id:        UUID | None
    direction:         str
    amount:            float
    payment_method:    str
    reference_no:      str | None
    payment_date:      datetime
    created_at:        datetime
    model_config  = ConfigDict(from_attributes=True)


# ── Procurement / Satın Alma ──────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name:         str
    contact_name: str | None = None
    phone:        str | None = None
    email:        str | None = None
    tax_no:       str | None = None
    address:      str | None = None
    notes:        str | None = None


class SupplierRead(BaseModel):
    id:           UUID
    tenant_id:    UUID | None
    name:         str
    contact_name: str | None
    phone:        str | None
    email:        str | None
    tax_no:       str | None
    address:      str | None
    notes:        str | None
    is_active:    bool
    created_at:   datetime
    model_config = ConfigDict(from_attributes=True)


class SupplierUpdate(BaseModel):
    name:         str | None = None
    contact_name: str | None = None
    phone:        str | None = None
    email:        str | None = None
    tax_no:       str | None = None
    address:      str | None = None
    notes:        str | None = None
    is_active:    bool | None = None


class PurchaseRequestCreate(BaseModel):
    project_id:  UUID | None = None
    material_id: UUID
    quantity:    int
    priority:    str = "normal"
    notes:       str | None = None


class PurchaseRequestRead(BaseModel):
    id:           UUID
    tenant_id:    UUID | None
    project_id:   UUID | None
    material_id:  UUID
    quantity:     int
    priority:     str
    notes:        str | None
    status:       str
    requested_by: UUID | None
    requested_at: datetime
    reviewed_by:  UUID | None
    reviewed_at:  datetime | None
    review_note:  str | None
    # Joined fields
    material_name: str | None = None
    project_name:  str | None = None
    model_config = ConfigDict(from_attributes=True)


class PurchaseRequestReview(BaseModel):
    action:      str   # "approve" or "reject"
    review_note: str | None = None


class PurchaseOrderItemCreate(BaseModel):
    material_id: UUID
    quantity:    int
    unit_price:  float | None = None
    notes:       str | None = None


class PurchaseOrderItemRead(BaseModel):
    id:          UUID
    order_id:    UUID
    material_id: UUID
    quantity:    int
    unit_price:  float | None
    total_price: float | None
    notes:       str | None
    material_name: str | None = None
    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderCreate(BaseModel):
    supplier_id:   UUID | None = None
    project_id:    UUID | None = None
    warehouse_id:  UUID | None = None
    po_no:         str
    order_date:    datetime | None = None
    expected_date: datetime | None = None
    notes:         str | None = None
    items:         list[PurchaseOrderItemCreate] = []


class PurchaseOrderRead(BaseModel):
    id:            UUID
    tenant_id:     UUID | None
    po_no:         str
    supplier_id:   UUID | None
    project_id:    UUID | None
    warehouse_id:  UUID | None
    status:        str
    order_date:    datetime | None
    expected_date: datetime | None
    received_at:   datetime | None
    total_amount:  float | None
    notes:         str | None
    created_by:    UUID | None
    received_by:   UUID | None
    created_at:    datetime
    items:         list[PurchaseOrderItemRead] = []
    supplier_name: str | None = None
    project_name:  str | None = None
    model_config = ConfigDict(from_attributes=True)


class POReceiveRequest(BaseModel):
    received_by:   UUID | None = None
    notes:         str | None = None


# ── Field Reports / Saha Raporları ──────────────────────────────────────────

class FieldReportItemCreate(BaseModel):
    activity_type:  str = "installation"
    description:    str
    location:       str | None = None
    hours_spent:    float | None = None
    workers_count:  int | None = None
    sort_order:     int = 0


class FieldReportItemRead(BaseModel):
    id:             UUID
    report_id:      UUID
    activity_type:  str
    description:    str
    location:       str | None
    hours_spent:    float | None
    workers_count:  int | None
    sort_order:     int
    model_config = ConfigDict(from_attributes=True)


class FieldReportCreate(BaseModel):
    project_id:   UUID
    report_date:  datetime
    summary:      str | None = None
    weather:      str | None = None
    team_size:    int | None = None
    hours_worked: float | None = None
    items:        list[FieldReportItemCreate] = []


class FieldReportRead(BaseModel):
    id:             UUID
    project_id:     UUID
    author_id:      UUID
    report_date:    datetime
    summary:        str | None
    weather:        str | None
    team_size:      int | None
    hours_worked:   float | None
    submitted:      bool
    approved_by:    UUID | None
    approved_at:    datetime | None
    created_at:     datetime
    items:          list[FieldReportItemRead] = []
    project_name:   str | None = None
    author_name:    str | None = None
    model_config = ConfigDict(from_attributes=True)


# ── Süreç Takibi ──────────────────────────────────────────────────────────────

class StoreProcessStageCreate(BaseModel):
    name:             str
    order_index:      int              = 0
    status:           str              = "pending"
    responsible_name: str | None       = None
    start_date:       datetime | None  = None
    target_end_date:  datetime | None  = None
    note:             str | None       = None


class StoreProcessStageRead(StoreProcessStageCreate):
    id:           UUID
    process_id:   UUID
    completed_at: datetime | None = None
    created_at:   datetime
    updated_at:   datetime
    model_config = ConfigDict(from_attributes=True)


class StoreProcessStageUpdate(BaseModel):
    status:           str | None      = None
    responsible_name: str | None      = None
    start_date:       datetime | None = None
    target_end_date:  datetime | None = None
    completed_at:     datetime | None = None
    note:             str | None      = None


class StoreProcessCreate(BaseModel):
    work_type:        str
    title:            str
    description:      str | None      = None
    start_date:       datetime | None = None
    target_end_date:  datetime | None = None
    responsible_name: str | None      = None
    scope_code:       str | None      = None  # iş kalemi kodu (yangin_dolabi, sprinkler_hatti …)


class StoreBulkProcessCreate(BaseModel):
    """Wizard adım 3 — her seçili scope için ayrı süreç oluşturur."""
    work_type:        str
    title:            str              # ana süreç başlığı (mağaza adı vb.)
    scope_codes:      list[str]        # ["yangin_dolabi", "sprinkler_hatti"]
    start_date:       datetime | None = None
    target_end_date:  datetime | None = None
    responsible_name: str | None      = None


class StoreProcessRead(BaseModel):
    id:                  UUID
    project_id:          UUID
    tenant_id:           UUID | None
    work_type:           str
    title:               str
    description:         str | None
    status:              str
    start_date:          datetime | None
    target_end_date:     datetime | None
    completed_at:        datetime | None
    responsible_name:    str | None
    progress_percent:    int
    created_by:          UUID | None
    created_at:          datetime
    updated_at:          datetime
    stages:              list[StoreProcessStageRead] = []
    # Mağaza bilgileri (Project + Branch join)
    project_name:        str | None = None
    project_no:          str | None = None
    store_address:       str | None = None
    model_config = ConfigDict(from_attributes=True)


class StoreProcessUpdate(BaseModel):
    title:            str | None      = None
    description:      str | None      = None
    status:           str | None      = None
    target_end_date:  datetime | None = None
    responsible_name: str | None      = None
    progress_percent: int | None      = None
    completed_at:     datetime | None = None


class StoreProcessNoteCreate(BaseModel):
    content:   str
    note_type: str            = "general"
    stage_id:  UUID | None    = None


class StoreProcessNoteRead(BaseModel):
    id:         UUID
    process_id: UUID
    stage_id:   UUID | None
    user_id:    UUID | None
    user_name:  str | None
    note_type:  str
    content:    str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StoreActivityRead(BaseModel):
    id:                 UUID
    project_id:         UUID
    user_id:            UUID | None
    user_name:          str | None
    activity_type:      str
    title:              str
    description:        str | None
    related_process_id: UUID | None
    related_stage_id:   UUID | None
    created_at:         datetime
    model_config = ConfigDict(from_attributes=True)


class ActiveJobRead(BaseModel):
    project_id:    UUID
    project_name:  str
    project_no:    str | None
    work_type:     str
    process_id:    UUID
    process_title: str
    process_status: str
    current_stage:  str | None
    target_end_date: datetime | None
    days_remaining:  int | None
    model_config = ConfigDict(from_attributes=True)


class CompletedJobRead(BaseModel):
    project_id:    UUID
    project_name:  str
    project_no:    str | None = None
    work_type:     str
    process_id:    UUID
    process_title: str
    completed_at:  datetime | None = None
    model_config = ConfigDict(from_attributes=True)


# ── Phase 6: Servis Formları ──────────────────────────────────────────────────

class ServiceFormCreate(BaseModel):
    year:               int
    month:              int
    contractor_company: str | None = None
    description:        str | None = None
    file_url:           str | None = None
    file_name:          str | None = None
    file_size_bytes:    int | None = None
    status:             str = "uploaded"


class ServiceFormRead(BaseModel):
    id:                 UUID
    project_id:         UUID
    year:               int
    month:              int
    file_url:           str | None
    file_name:          str | None
    file_size_bytes:    int | None
    contractor_company: str | None
    uploaded_by:        UUID | None
    uploaded_by_name:   str | None
    description:        str | None
    status:             str
    created_at:         datetime
    model_config = ConfigDict(from_attributes=True)


# ── Phase 6: Hakkedişler ──────────────────────────────────────────────────────

class ProgressPaymentCreate(BaseModel):
    payment_type:            str
    period:                  str | None = None
    amount:                  float | None = None
    currency:                str = "TRY"
    file_url:                str | None = None
    file_name:               str | None = None
    description:             str | None = None
    submitted_for_approval:  bool = False
    process_id:              UUID | None = None


class ProgressPaymentRead(BaseModel):
    id:                      UUID
    project_id:              UUID
    process_id:              UUID | None
    payment_type:            str
    period:                  str | None
    amount:                  float | None
    currency:                str
    file_url:                str | None
    file_name:               str | None
    description:             str | None
    approval_status:           str
    submitted_for_approval:    bool
    submitted_by:              UUID | None
    submitted_by_name:         str | None
    internal_approved_by_name: str | None = None
    internal_approved_at:      datetime | None = None
    sent_to_migros_by_name:    str | None = None
    sent_to_migros_at:         datetime | None = None
    migros_approved_by_name:   str | None = None
    migros_approved_at:        datetime | None = None
    invoiced_at:               datetime | None = None
    created_at:                datetime
    model_config = ConfigDict(from_attributes=True)


class ProgressPaymentUpdate(BaseModel):
    approval_status:        str | None  = None
    amount:                 float | None = None
    description:            str | None  = None
    submitted_for_approval: bool | None = None


# ── Phase 6: Faturalar ────────────────────────────────────────────────────────

class InvoiceRecordCreate(BaseModel):
    invoice_type:       str
    invoice_no:         str | None = None
    invoice_date:       str | None = None
    period:             str | None = None
    amount:             float | None = None
    currency:           str = "TRY"
    file_url:           str | None = None
    file_name:          str | None = None
    description:        str | None = None
    process_id:         UUID | None = None
    related_payment_id: UUID | None = None


class InvoiceRecordRead(BaseModel):
    id:                 UUID
    project_id:         UUID
    process_id:         UUID | None
    invoice_type:       str
    invoice_no:         str | None
    invoice_date:       str | None = None
    period:             str | None
    amount:             float | None
    currency:           str
    file_url:           str | None
    file_name:          str | None
    description:        str | None
    related_payment_id: UUID | None = None
    approval_status:    str
    submitted_by:       UUID | None
    submitted_by_name:  str | None
    created_at:         datetime
    model_config = ConfigDict(from_attributes=True)


# ── Phase 6: Onay Talepleri ───────────────────────────────────────────────────

class ApprovalRequestCreate(BaseModel):
    approval_type:       str
    title:               str
    description:         str | None = None
    amount:              float | None = None
    file_url:            str | None = None
    file_name:           str | None = None
    related_payment_id:  UUID | None = None
    related_invoice_id:  UUID | None = None
    process_id:          UUID | None = None


class ApprovalRequestRead(BaseModel):
    id:                  UUID
    project_id:          UUID
    process_id:          UUID | None
    approval_type:       str
    related_payment_id:  UUID | None
    related_invoice_id:  UUID | None
    title:               str
    description:         str | None
    amount:              float | None
    file_url:            str | None
    file_name:           str | None
    status:              str
    requested_by:        UUID | None
    requested_by_name:   str | None
    requested_at:        datetime
    approved_by:         UUID | None
    approved_by_name:    str | None
    approved_at:         datetime | None
    note:                str | None
    created_at:          datetime
    # enriched fields (joined)
    project_name:        str | None = None
    project_no:          str | None = None
    payment_type:        str | None = None  # from related progress payment
    model_config = ConfigDict(from_attributes=True)


class ApprovalRequestUpdate(BaseModel):
    status: str
    note:   str | None = None

