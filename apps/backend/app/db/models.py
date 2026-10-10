"""
Sismik Mekanik ERP — SQLModel Veritabanı Modelleri
Teknoloji: SQLModel (SQLAlchemy 2.0 + Pydantic v2)
"""

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import List, Optional, Literal
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    func,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import mapped_column, relationship, Mapped
from sqlmodel import SQLModel, Field, Relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ═══════════════════════════════════════════════════════════════════════════════
#  1 · ENUMS  (DB'de look-up tablosu, Python'da Enum olarak taşımlanır)
# ═══════════════════════════════════════════════════════════════════════════════

class ProjectStatus(str, Enum):
    INQUIRY      = "inquiry"        # Keşif Aşamasında
    OFFER_SENT   = "offer_sent"     # Teklif Verildi
    APPROVED     = "approved"       # Onaylandı
    IN_PROGRESS  = "in_progress"    # Sahada
    INVOICE_PEND = "invoice_pend"   # Hakediş Bekliyor
    COMPLETED    = "completed"      # Teslim Edildi
    CANCELLED    = "cancelled"      # İptal


class WorkScope(str, Enum):
    HVAC        = "hvac"         # İklimlendirme / Havalandırma
    FIRE        = "fire"         # Yangın Söndürme
    SEISMIC     = "seismic"      # Sismik Koruma
    MECHANICAL  = "mechanical"   # Mekanik Tesisat
    ELECTRICAL  = "electrical"   # Elektrik Tesisatı


class WarehouseType(str, Enum):
    """Depo türü."""
    MAIN      = "main"       # Merkez Depo
    SITE      = "site"       # Şantiye / Proje Deposu


class StockMovementType(str, Enum):
    IN         = "in"          # Alış / depo girişi
    OUT        = "out"         # Proje çıkışı / kullanım
    TRANSFER   = "transfer"    # Depo-transferi
    RETURN     = "return"      # İade
    ADJUSTMENT = "adjustment"  # Düzeltme kaydı


class InvoiceStatus(str, Enum):
    DRAFT       = "draft"
    SENT        = "sent"
    APPROVED    = "approved"
    PAID        = "paid"
    OVERDUE     = "overdue"
    CANCELLED   = "cancelled"


class ExpenseCategory(str, Enum):
    LABOUR          = "labour"        # Adam-saat / taşeron ücreti
    MATERIAL        = "material"      # Malzeme maliyeti
    TRANSPORT       = "transport"     # Nakliye
    EQUIPMENT       = "equipment"     # Kiralama
    MISCELLANEOUS   = "miscellaneous" # Diğer


class TenantStatus(str, Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class TenantEmailMode(str, Enum):
    PLATFORM = "platform"
    TENANT_DOMAIN = "tenant_domain"


# ═══════════════════════════════════════════════════════════════════════════════
#  2 · RBAC  —  Kullanıcılar, Roller, İzinler
# ═══════════════════════════════════════════════════════════════════════════════

class Role(SQLModel, table=True):
    """
    Sistem genelinde rol tanımları.
    Örnek: admin, saha_muhendisi, depo_sorumlusu, musteri_kullanici
    """

    __tablename__ = "roles"

    id:           UUID         = Field(default_factory=uuid4, primary_key=True)
    name:         str          = Field(max_length=80, unique=True, index=True)
    display_name: str          = Field(max_length=120)
    description:  Optional[str] = Field(default=None, max_length=255)
    is_active:    bool         = Field(default=True)
    created_at:   datetime     = Field(
        default_factory=utc_now, nullable=False
    )

    # Back-reference
    permissions: List["RolePermission"] = Relationship(back_populates="role")
    users:      List["UserRole"]        = Relationship(back_populates="role")


class Permission(SQLModel, table=True):
    """
    Tek tek izin kayıtları. Bir rol birden fazla izine sahip olabilir.
    resource  →  modül adı (projects / inventory / finance …)
    action    →  eylem     (create / read / update / delete / export …)
    """

    __tablename__ = "permissions"

    id:         UUID      = Field(default_factory=uuid4, primary_key=True)
    code:       str       = Field(max_length=100, unique=True, index=True)
    # Erişim maliyeti: yüksek = ciddi izin
    scope:      str       = Field(max_length=30, index=True)
    description: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime  = Field(
        default_factory=utc_now, nullable=False
    )

    roles: List["RolePermission"] = Relationship(back_populates="permission")


class RolePermission(SQLModel, table=True):
    """Rol ↔ İzin  many-to-many bağlantı tablosu."""

    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)

    role_id:       UUID = Field(foreign_key="roles.id", primary_key=True)
    permission_id: UUID = Field(foreign_key="permissions.id", primary_key=True)

    role:       Role       = Relationship(back_populates="permissions")
    permission: Permission = Relationship(back_populates="roles")


class UserRole(SQLModel, table=True):
    """Kullanıcı ↔ Rol  many-to-many (bir kullanıcı birden fazla rol alabilir)."""

    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id"),)

    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    role_id: UUID = Field(foreign_key="roles.id", primary_key=True)

    user: Mapped["User"] = Relationship(back_populates="user_roles")
    role: Mapped["Role"] = Relationship(back_populates="users")


class User(SQLModel, table=True):
    """Sistem kullanıcısı — Yetkilendirme merkezi."""

    __tablename__ = "users"

    id:                UUID          = Field(default_factory=uuid4, primary_key=True)
    tenant_id:         Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    email:             str           = Field(max_length=255, unique=True, index=True)
    hashed_password:   str
    full_name:         str           = Field(max_length=200)
    phone:             Optional[str] = Field(default=None, max_length=30)
    # Varsayılan rol — kişisel yetki için genişletilebilir
    default_role:      str           = Field(max_length=80, index=True)
    # Tek disiplin bağlantısı: HVAC / FIRE / SEISMIC / ELECTRICAL / MECHANICAL
    discipline:        Optional[str] = Field(default=None, max_length=50, index=True)
    # Disiplin içi özel yetki (sadece kendi branşın dökümanları mı görsün? 1 = Evet)
    discipline_only:   bool          = Field(default=False)
    is_active:         bool          = Field(default=True)
    is_verified:       bool          = Field(default=False)
    # Çıkış yapıldığında veya oturumlar zorla sonlandırılmak istendiğinde
    # artırılır; token'daki değer bununla eşleşmezse istek reddedilir.
    last_login_at:     Optional[datetime] = None
    created_at:        datetime      = Field(
        default_factory=utc_now, nullable=False
    )
    updated_at:        datetime      = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": utc_now},
    )

    user_roles:    List["UserRole"]       = Relationship(back_populates="user")
    assignments:   List["ProjectAssignment"] = Relationship(back_populates="user")
    authored_reports: List["FieldReport"] = Relationship(
        back_populates="author",
        sa_relationship_kwargs={"foreign_keys": "[FieldReport.author_id]"},
    )


class Tenant(SQLModel, table=True):
    """Platform tenant (firma) kaydı."""

    __tablename__ = "tenants"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=180, unique=True, index=True)
    code: str = Field(max_length=64, unique=True, index=True)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    status: TenantStatus = Field(default=TenantStatus.TRIAL, index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)

    users: List["User"] = Relationship()


# ═══════════════════════════════════════════════════════════════════════════════
#  3 · MÜŞTERİ / LOKASYON HİYERARŞİSİ
# ═══════════════════════════════════════════════════════════════════════════════

class Customer(SQLModel, table=True):
    """
    Zincir market / müşteri firma bilgisi.
    Örnek: X Süpermarket A.Ş.
    """

    __tablename__ = "customers"

    id:            UUID          = Field(default_factory=uuid4, primary_key=True)
    tenant_id:     Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    name:          str           = Field(max_length=200, index=True)
    tax_no:        Optional[str] = Field(default=None, max_length=30)  # Vergi no
    contact_email: Optional[str] = Field(default=None, max_length=255)
    contact_phone: Optional[str] = Field(default=None, max_length=30)
    address:       Optional[str] = Field(default=None, max_length=500)
    is_active:     bool          = Field(default=True)
    created_at:    datetime      = Field(
        default_factory=utc_now, nullable=False
    )

    regions:  List["Region"]          = Relationship(back_populates="customer")
    projects: List["Project"]         = Relationship(back_populates="customer")
    invoices: List["Invoice"]         = Relationship(back_populates="customer")


class Region(SQLModel, table=True):
    """Bölge (ör. İstanbul Bölgesi). Bir bölge birden fazla müşteriye ait OLMAMALI.
    → customer_id NULL KAHRAMAN olabilir, çünkü bölge müşteriye özel değildir.
    Burada tercihen her bölge bir müşteriye bağlı kabul edilir."""

    __tablename__ = "regions"

    id:          UUID          = Field(default_factory=uuid4, primary_key=True)
    tenant_id:   Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    customer_id: UUID          = Field(foreign_key="customers.id", index=True)
    name:        str           = Field(max_length=100, index=True)
    code:        Optional[str] = Field(default=None, max_length=20, index=True)
    city:        str           = Field(max_length=100)
    created_at:  datetime      = Field(
        default_factory=utc_now, nullable=False
    )

    customer:  Mapped["Customer"] = Relationship(back_populates="regions")
    branches:  List["Branch"]     = Relationship(back_populates="region")
    projects:  List["Project"]    = Relationship(back_populates="region")


class Branch(SQLModel, table=True):
    """Şube / lokasyon — proje açılacak en düşük hiyerarşi birimi.
    Örnek: X Süpermarket, Ankara Cankaya Şubesi"""

    __tablename__ = "branches"

    id:          UUID          = Field(default_factory=uuid4, primary_key=True)
    tenant_id:   Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    region_id:   UUID          = Field(foreign_key="regions.id", index=True)
    name:        str           = Field(max_length=200, index=True)
    code:        Optional[str] = Field(default=None, max_length=30, index=True)
    address:     Optional[str] = Field(default=None, max_length=500)
    latitude:    Optional[float] = Field(default=None)
    longitude:   Optional[float] = Field(default=None)
    # Saha çalışmasına hazır mı?
    ready_for_field: bool = Field(default=False)
    created_at:  datetime      = Field(
        default_factory=utc_now, nullable=False
    )

    region:  Mapped["Region"]      = Relationship(back_populates="branches")
    projects: List["Project"]      = Relationship(back_populates="branch")


# ═══════════════════════════════════════════════════════════════════════════════
#  4 · PROJE MODÜLÜ
# ═══════════════════════════════════════════════════════════════════════════════

class Project(SQLModel, table=True):
    """
    Tek bir şantiye projesi.
    Hiyerarşi: Customer → Region → Branch → Project
    """

    __tablename__ = "projects"

    id:          UUID        = Field(default_factory=uuid4, primary_key=True)
    tenant_id:   Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    # ── Hiyerarşi ──────────────────────────────────────────
    customer_id: UUID       = Field(foreign_key="customers.id", index=True)
    region_id:   UUID       = Field(foreign_key="regions.id", index=True)
    branch_id:   UUID       = Field(foreign_key="branches.id", index=True)
    # ── Temel bilgiler ─────────────────────────────────────
    name:        str        = Field(max_length=255, index=True)
    project_no:  Optional[str] = Field(default=None, max_length=80, index=True)
    description: Optional[str] = Field(default=None)
    # ── Zamanlama ──────────────────────────────────────────
    start_date:  Optional[datetime] = None
    due_date:    Optional[datetime] = None
    # ── İş Kapsamı ─────────────────────────────────────────
    scope_codes: str        = Field(
        default="[]",
        description="JSON array ['hvac','fire','seismic']",
    )
    # ── Statü ──────────────────────────────────────────────
    status:      ProjectStatus = Field(
        default=ProjectStatus.INQUIRY, index=True
    )
    # ── Finans ─────────────────────────────────────────────
    contract_value: Optional[Decimal] = Field(default=None, max_digits=18, decimal_places=2)
    # ── Audit ──────────────────────────────────────────────
    created_by:  Optional[UUID] = Field(foreign_key="users.id", default=None)
    created_at:  datetime       = Field(
        default_factory=utc_now, nullable=False
    )
    updated_at:  datetime       = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": utc_now},
    )

    customer:    Mapped["Customer"]           = Relationship(back_populates="projects")
    region:     Mapped["Region"]             = Relationship(back_populates="projects")
    branch:     Mapped["Branch"]             = Relationship(back_populates="projects")
    assignments: List["ProjectAssignment"]   = Relationship(back_populates="project")
    documents:   List["Document"]            = Relationship(back_populates="project")
    warehouse:   Optional["Warehouse"]       = Relationship(back_populates="project")
    reports:     List["FieldReport"]         = Relationship(back_populates="project")
    expenses:    List["Expense"]             = Relationship(back_populates="project")
    invoices:    List["Invoice"]             = Relationship(back_populates="project")


class ProjectAssignment(SQLModel, table=True):
    """Proje → Kullanıcı (saha mühendisi / taşeron) ataması."""

    __tablename__ = "project_assignments"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", "role_at_project"),
    )

    id:              UUID   = Field(default_factory=uuid4, primary_key=True)
    project_id:      UUID   = Field(foreign_key="projects.id", index=True)
    user_id:         UUID   = Field(foreign_key="users.id", index=True)
    # Roler: saha_muhendisi, taseron, musteri_temsilcisi …
    role_at_project: str   = Field(max_length=80)
    is_lead:         bool   = Field(default=False)   # Ekip başı mı?
    assigned_at:     datetime = Field(
        default_factory=utc_now, nullable=False
    )
    unassigned_at:   Optional[datetime] = None

    project: Mapped["Project"] = Relationship(back_populates="assignments")
    user:    Mapped["User"]    = Relationship(back_populates="assignments")


# ═══════════════════════════════════════════════════════════════════════════════
#  5 · DOKÜMAN / ÇİZİM YÖNETİMİ
# ═══════════════════════════════════════════════════════════════════════════════

DOC_TYPE_ENUM: list[str] = [
    "contract",      # Sözleşme
    "drawing_hvac",  # Havalandırma çizimi
    "drawing_fire",  # Yangın çizimi
    "drawing_seismic",# Sismik
    "drawing_mep",   # Genel MEP
    "invoice_doc",   # Hakediş dosyası
    "field_report",  # Saha raporu
    "photo",         # Saha fotoğrafı
    "revision",      # Revizyon
    "other",         # Diğer
]

class Document(SQLModel, table=True):
    """Bulut depolamadaki (OCI Object Storage) tüm dosya kayıtları."""

    __tablename__ = "documents"

    id:              UUID   = Field(default_factory=uuid4, primary_key=True)
    project_id:      Optional[UUID] = Field(default=None, foreign_key="projects.id", index=True)
    # Dosya türü — DOC_TYPE_ENUM
    doc_type:        str    = Field(max_length=50, index=True)
    original_name:   str    = Field(max_length=255)
    file_key:        str    = Field(max_length=512, unique=True)  # S3 / OCI path
    bucket_name:     str    = Field(max_length=128)
    file_size_bytes: Optional[int] = None
    mime_type:       Optional[str] = Field(default=None, max_length=128)
    # ── Versiyon kontrolü ──────────────────────────────────
    version:         int    = Field(default=1)
    parent_id:       Optional[UUID] = Field(default=None, foreign_key="documents.id", index=True)
    revision_note:   Optional[str] = Field(default=None, max_length=255)
    # ── Kalıcı eski versiyonlar ─────────────────────────────
    archived:        bool   = Field(default=False)
    # ── Yükleyen ───────────────────────────────────────────
    uploaded_by:     Optional[UUID] = Field(foreign_key="users.id", default=None)
    created_at:      datetime       = Field(
        default_factory=utc_now, nullable=False
    )

    # ── Gider İlişkisi ─────────────────────────────────────
    expense_id:      Optional[UUID] = Field(default=None, foreign_key="expenses.id", index=True)
    # ── Tadilat/Süreç İlişkisi ─────────────────────────────
    process_id:      Optional[UUID] = Field(default=None, foreign_key="store_processes.id", index=True, ondelete="SET NULL")
    # ── Görsel Envanter Metadata (JSON string) ──────────────
    vi_meta:         Optional[str] = Field(default=None, sa_column=mapped_column(Text, nullable=True))

    # ── Genel Arşiv ─────────────────────────────────────────
    is_archive:                bool             = Field(default=False, index=True)
    # "archive" | "transferred"
    archive_status:            str              = Field(default="archive", max_length=20)
    transferred_project_id:    Optional[UUID]   = Field(default=None)
    transferred_category:      Optional[str]    = Field(default=None, max_length=50)
    transferred_at:            Optional[datetime] = Field(default=None)

    project:   Mapped[Optional["Project"]] = Relationship(back_populates="documents")
    expense:   Optional["Expense"] = Relationship(back_populates="documents")


# ═══════════════════════════════════════════════════════════════════════════════
#  6 · ENVANTER VE DEPO
# ═══════════════════════════════════════════════════════════════════════════════

# ── 6-a · Depo ─────────────────────────────────────────────────────────────────

class Warehouse(SQLModel, table=True):
    """
    Depo kaydı.
    type == MAIN  → project_id NULL  (merkez depo, tüm şantiyelere malzeme çıkışı)
    type == SITE  → project_id dolu (ilgili projeye özel şantiye deposu)
    """

    __tablename__ = "warehouses"
    __table_args__ = (
        UniqueConstraint("code", name="uq_warehouse_code"),
    )

    id:           UUID              = Field(default_factory=uuid4, primary_key=True)
    type:         WarehouseType     = Field(index=True)
    name:         str               = Field(max_length=200, index=True)
    code:         Optional[str]     = Field(default=None, max_length=30, index=True)
    location:     Optional[str]     = Field(default=None, max_length=255)
    # İlgili proje (SITE tipindeyse dolu, MAIN ise NULL)
    project_id:   Optional[UUID]    = Field(foreign_key="projects.id", default=None, index=True)
    is_active:    bool              = Field(default=True)
    created_at:   datetime          = Field(
        default_factory=utc_now, nullable=False
    )

    # ── Back-references ───────────────────────────────────────────────────────
    project:          Mapped[Optional["Project"]]    = Relationship(back_populates="warehouse")
    stock_levels:     List["Stock"]                  = Relationship(back_populates="warehouse")
    transactions_out: List["InventoryTransaction"]   = Relationship(
        back_populates="from_warehouse",
        sa_relationship_kwargs={"foreign_keys": "[InventoryTransaction.from_warehouse_id]"},
    )
    transactions_in:  List["InventoryTransaction"]   = Relationship(
        back_populates="to_warehouse",
        sa_relationship_kwargs={"foreign_keys": "[InventoryTransaction.to_warehouse_id]"},
    )


# ── 6-b · Düşük Stok Uyarısı ───────────────────────────────────────────────────

class LowStockAlert(SQLModel, table=True):
    """Kritik stok altına düşen malzemeler için otomatik uyarı kaydı."""

    __tablename__ = "low_stock_alerts"

    id:            UUID         = Field(default_factory=uuid4, primary_key=True)
    item_id:       UUID         = Field(foreign_key="materials.id", index=True)
    current_stock: int          = Field(ge=0)
    min_level:     int          = Field(ge=0)
    notified:      bool         = Field(default=False)
    created_at:    datetime     = Field(
        default_factory=utc_now, nullable=False
    )


# ── 6-c · Malzeme Kataloğu ─────────────────────────────────────────────────────

class Material(SQLModel, table=True):
    """
    Şirketin kullandığı malzeme / ekipman ana kataloğu.
    Örnek: Sismik Askı Aparatı, Çelik Boru DN100, Yangın Vanası.
    """

    __tablename__ = "materials"

    id:              UUID            = Field(default_factory=uuid4, primary_key=True)
    # Üretici / tedarikçi stok kodu
    sku:             str             = Field(max_length=100, unique=True, index=True)
    name:            str             = Field(max_length=255, index=True)
    description:     Optional[str]   = Field(default=None, max_length=1000)
    # Birim: adet, kg, metre, litre, set …
    unit:            str             = Field(max_length=20, default="adet")
    # Barkod (opsiyonel)
    barcode:         Optional[str]   = Field(default=None, max_length=128)
    # Birim alış maliyeti (TL) — proje karlılık hesaplaması için
    unit_cost:       Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    # Kritik stok eşiği — bu miktarın altına düşünce otomatik uyarı tetiklenir
    min_stock_level: int             = Field(default=0, ge=0)
    is_active:       bool            = Field(default=True, index=True)
    created_at:      datetime        = Field(
        default_factory=utc_now, nullable=False, index=True
    )

    # ── Back-references ───────────────────────────────────────────────────────
    stock_levels:  List["Stock"]                  = Relationship(back_populates="material")
    transactions:  List["InventoryTransaction"]    = Relationship(back_populates="material")


# ── 6-b · Depo × Malzeme Stok Durumu ─────────────────────────────────────────

class Stock(SQLModel, table=True):
    """
    Junction (ara) tablo: her (depo, malzeme) çifti için BİR stok kaydı.
    Anlık stok durumu her zaman buradan okunur; doğrudan değiştirilmez —
    tüm güncellemeler InventoryTransaction üzerinden yapılır.

    Composite Primary Key: (warehouse_id, material_id)
    """

    __tablename__ = "stock"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "material_id", name="uq_stock_wh_mat"),
    )

    warehouse_id:  UUID        = Field(foreign_key="warehouses.id", primary_key=True)
    material_id:   UUID        = Field(foreign_key="materials.id", primary_key=True)
    # Anlık miktar (negatif olamaz)
    quantity:      int         = Field(default=0, ge=0)
    # Son güncelleyen (NULL = otomatik / seed)
    updated_by:    Optional[UUID] = Field(foreign_key="users.id", default=None)
    updated_at:    datetime    = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": utc_now},
        nullable=False,
    )

    # ── Back-references ───────────────────────────────────────────────────────
    warehouse: Mapped["Warehouse"] = Relationship(back_populates="stock_levels")
    material:  Mapped["Material"]  = Relationship(back_populates="stock_levels")


# ── 6-c · Stok Hareketi / Transfer Fişi ─────────────────────────────────────

class InventoryTransactionType(str, Enum):
    """Stok hareketi türü — DB'de TEXT olarak saklanır."""
    IN         = "in"          # Alış / depo girişi (tedarikçiden gelen mal)
    OUT        = "out"         # Çıkış / projeye gönderim / kullanım
    TRANSFER   = "transfer"    # Depo-transferi  (merkez → şantiye vb.)
    RETURN     = "return"      # İade (şantiyeden merkeze geri dönen mal)
    ADJUSTMENT = "adjustment"  # Sayım düzeltmesi (fire/missing kaydedildi)


class InventoryTransaction(SQLModel, table=True):
    """
    Tüm stok işlemlerinin kaydedildiği kalıcı hareket/denetim tablosu.
    Ir=saliye numarası, maliyet ve notlar ile muhasebeleştirilebilir.

    Hareket türüne göre FK alanları:
      IN         → from_warehouse_id NULL,  to_warehouse_id dolu
      OUT        → from_warehouse_id dolu,  to_warehouse_id NULL
      TRANSFER   → from_warehouse_id dolu,  to_warehouse_id dolu
    """

    __tablename__ = "inventory_transactions"

    id:               UUID                  = Field(default_factory=uuid4, primary_key=True)
    # Malzeme
    material_id:      UUID                  = Field(foreign_key="materials.id", index=True)
    # Kaynak depo (çıkış yapan)
    from_warehouse_id: Optional[UUID]       = Field(foreign_key="warehouses.id", default=None, index=True)
    # Hedef depo (giriş yapan)
    to_warehouse_id:   Optional[UUID]       = Field(foreign_key="warehouses.id", default=None, index=True)
    # İlgili proje (TRANSFER / OUT işlemlerinde)
    related_project_id: Optional[UUID]      = Field(foreign_key="projects.id", default=None, index=True)
    # Miktar
    quantity:         int                   = Field(gt=0)
    # Birim maliyet — tüketim maliyetini kaydetmek için
    unit_cost:        Optional[Decimal]     = Field(default=None, max_digits=12, decimal_places=2)
    # Toplam maliyet (quantity × unit_cost)
    total_cost:       Optional[Decimal]     = Field(default=None, max_digits=14, decimal_places=2)
    # Hareket türü (IN / OUT / TRANSFER / RETURN / ADJUSTMENT)
    transaction_type: InventoryTransactionType = Field(index=True)
    # İrsaliye / fiş no
    reference_no:     Optional[str]         = Field(default=None, max_length=100, index=True)
    # Notlar (fire, revizyon, neden vb.)
    notes:            Optional[str]         = Field(default=None, max_length=500)
    # İşlemi yapan kullanıcı
    performed_by:     Optional[UUID]        = Field(foreign_key="users.id", default=None)
    performed_at:     datetime              = Field(
        default_factory=utc_now, nullable=False, index=True
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    material:         Mapped["Material"]    = Relationship(back_populates="transactions")
    from_warehouse:   Mapped[Optional[Warehouse]] = Relationship(
        back_populates="transactions_out",
        sa_relationship_kwargs={"foreign_keys": "[InventoryTransaction.from_warehouse_id]"},
    )
    to_warehouse:     Mapped[Optional[Warehouse]] = Relationship(
        back_populates="transactions_in",
        sa_relationship_kwargs={"foreign_keys": "[InventoryTransaction.to_warehouse_id]"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  7 · SAHA RAPORU
# ═══════════════════════════════════════════════════════════════════════════════

class FieldReport(SQLModel, table=True):
    """Günlük / haftalık saha raporu."""

    __tablename__ = "field_reports"

    id:              UUID         = Field(default_factory=uuid4, primary_key=True)
    project_id:      UUID         = Field(foreign_key="projects.id", index=True)
    author_id:       UUID         = Field(foreign_key="users.id", index=True)
    report_date:     datetime     = Field(index=True)
    summary:         Optional[str] = Field(default=None, max_length=1000)
    weather:         Optional[str] = Field(default=None, max_length=50)
    # Çalışan ekip sayısı / saat
    team_size:       Optional[int] = None
    hours_worked:    Optional[float] = None
    # Görseller / ek dosyalar (JSON array of S3 keys)
    attachment_keys: str          = Field(default="[]")
    # Onay durumu
    submitted:       bool          = Field(default=False)
    approved_by:     Optional[UUID] = Field(foreign_key="users.id", default=None)
    approved_at:     Optional[datetime] = None
    created_at:      datetime      = Field(
        default_factory=utc_now, nullable=False
    )

    project: Mapped["Project"] = Relationship(back_populates="reports")
    author:  Mapped["User"]    = Relationship(
        back_populates="authored_reports",
        sa_relationship_kwargs={"foreign_keys": "[FieldReport.author_id]"},
    )
    items: List["FieldReportItem"] = Relationship(back_populates="report")


# ═══════════════════════════════════════════════════════════════════════════════
#  8 · FİNANS, İCMAL VE HAKEDİŞ
# ═══════════════════════════════════════════════════════════════════════════════

class Expense(SQLModel, table=True):
    """
    Projeye ait tüm harcamalar.
    - Labour  : adam-saat / taşeron ücreti
    - Material: depodan çıkış (stok hareketi idsi ile ilişkili)
    - Diğer   : nakliye, kiralama, dış hizmet
    """

    __tablename__ = "expenses"

    id:               UUID              = Field(default_factory=uuid4, primary_key=True)
    project_id:       UUID              = Field(foreign_key="projects.id", index=True)
    category:         ExpenseCategory   = Field(index=True)
    description:      str               = Field(max_length=255)
    amount:           Decimal           = Field(max_digits=14, decimal_places=2)
    quantity:         Optional[float]   = None
    # İlgili stok hareketi (malzeme harcamalarında)
    stock_movement_id:Optional[UUID]    = Field(foreign_key="inventory_transactions.id", default=None)
    # İlgili personel / taşeron
    user_id:          Optional[UUID]    = Field(foreign_key="users.id", default=None)
    # Harcama tarihi
    expense_date:     datetime          = Field(index=True)
    created_by:       Optional[UUID]    = Field(foreign_key="users.id", default=None)
    created_at:       datetime          = Field(
        default_factory=utc_now, nullable=False
    )

    project: Mapped["Project"] = Relationship(back_populates="expenses")
    documents: List["Document"] = Relationship(back_populates="expense", sa_relationship_kwargs={"lazy": "selectin"})


class InvoiceItem(SQLModel, table=True):
    """Hakediş / fatura kalemi — bir icmaldaki maddeler."""

    __tablename__ = "invoice_items"

    id:              UUID         = Field(default_factory=uuid4, primary_key=True)
    invoice_id:      UUID         = Field(foreign_key="invoices.id", index=True)
    description:     str          = Field(max_length=255)
    quantity:        Decimal      = Field(max_digits=10, decimal_places=2)
    unit_price:      Decimal      = Field(max_digits=12, decimal_places=2)
    total_amount:    Decimal      = Field(max_digits=14, decimal_places=2)
    sort_order:      int          = Field(default=0)

    invoice: Mapped["Invoice"] = Relationship(back_populates="items")


class Invoice(SQLModel, table=True):
    """
    Müşteriden kesilen fatura / hakediş belgesi.
    Tek bir fatura birden fazla projeden kalemler içerebilir;
    ya da tek proje → tek fatura (yukarıdada modellenir).
    """

    __tablename__ = "invoices"

    id:                UUID            = Field(default_factory=uuid4, primary_key=True)
    # Üçlü eşleştirme: hangi müşteri, hangi bölge / şubedeki projeler?
    customer_id:       UUID            = Field(foreign_key="customers.id", index=True)
    region_id:         Optional[UUID]  = Field(foreign_key="regions.id", default=None, index=True)
    branch_id:         Optional[UUID]  = Field(foreign_key="branches.id", default=None, index=True)
    # Not: proje seviyesinde fatura için project_id eklenir
    project_id:        Optional[UUID]  = Field(foreign_key="projects.id", default=None, index=True)
    # ── Fatura bilgileri ───────────────────────────────────
    invoice_no:        str             = Field(max_length=100, unique=True, index=True)
    title:             str             = Field(max_length=255)
    issue_date:        datetime        = Field(index=True)
    due_date:          Optional[datetime] = Field(default=None, index=True)
    # ── Tutarlar ───────────────────────────────────────────
    subtotal:          Decimal         = Field(max_digits=14, decimal_places=2)
    tax_rate:          Decimal         = Field(max_digits=5, decimal_places=2, default=0)
    tax_amount:        Decimal         = Field(max_digits=14, decimal_places=2, default=0)
    grand_total:       Decimal         = Field(max_digits=14, decimal_places=2)
    # ── Statü ──────────────────────────────────────────────
    status:            InvoiceStatus   = Field(default=InvoiceStatus.DRAFT, index=True)
    # ── Ödeme takibi ────────────────────────────────────────
    paid_amount:       Decimal         = Field(max_digits=14, decimal_places=2, default=0)
    paid_at:           Optional[datetime] = None
    # ── İçerik ─────────────────────────────────────────────
    items:             List["InvoiceItem"] = Relationship(back_populates="invoice")
    # ── Relations ──────────────────────────────────────────
    customer:          Mapped["Customer"] = Relationship(back_populates="invoices")
    project:           Mapped["Project"]  = Relationship(back_populates="invoices")


class Payment(SQLModel, table=True):
    """Tahsilat / tedarikçi ödemesi — fatura ile veya doğrudan."""

    __tablename__ = "payments"

    id:                UUID         = Field(default_factory=uuid4, primary_key=True)
    invoice_id:        Optional[UUID] = Field(foreign_key="invoices.id", default=None, index=True)
    # Ödeme yönü: alacak = müşteriden tahsilat, borç = tedarikçi ödemesi
    direction:         str          = Field(max_length=20, index=True)   # incoming / outgoing
    amount:            Decimal      = Field(max_digits=14, decimal_places=2)
    payment_method:    str          = Field(max_length=50)               # havale / eft / nakit …
    reference_no:      Optional[str] = Field(default=None, max_length=100)
    payment_date:      datetime     = Field(index=True)
    notes:             Optional[str] = Field(default=None, max_length=500)
    recorded_by:       Optional[UUID] = Field(foreign_key="users.id", default=None)
    created_at:        datetime     = Field(
        default_factory=utc_now, nullable=False
    )


class PlatformTenantSettings(SQLModel, table=True):
    __tablename__ = "platform_tenant_settings"

    tenant_id: UUID = Field(foreign_key="tenants.id", primary_key=True)
    tax_no: Optional[str] = Field(default=None, max_length=32)
    sector: Optional[str] = Field(default=None, max_length=120)
    country: Optional[str] = Field(default=None, max_length=80)
    theme_color: Optional[str] = Field(default=None, max_length=16)
    domain: Optional[str] = Field(default=None, max_length=255)
    subdomain: Optional[str] = Field(default=None, max_length=120)
    email_mode: TenantEmailMode = Field(default=TenantEmailMode.PLATFORM)
    from_name: Optional[str] = Field(default=None, max_length=180)
    from_email: Optional[str] = Field(default=None, max_length=255)
    reply_to: Optional[str] = Field(default=None, max_length=255)
    email_domain_verified: bool = Field(default=False)
    email_provider_identity_id: Optional[str] = Field(default=None, max_length=255)
    email_branding: Optional[str] = Field(default=None, description="JSON object")
    email_notifications_enabled: bool = Field(default=True)
    email_digest_mode: str = Field(default="immediate", max_length=20)
    email_opt_out_templates: Optional[str] = Field(default=None, description="JSON array")
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})


class OutboundEmailAudit(SQLModel, table=True):
    __tablename__ = "outbound_email_audits"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True)
    template: str = Field(max_length=120, index=True)
    recipient_count: int = Field(default=1, ge=1)
    provider: str = Field(default="resend", max_length=40)
    provider_message_id: Optional[str] = Field(default=None, max_length=255, index=True)
    status: str = Field(default="queued", max_length=40, index=True)
    error_message: Optional[str] = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)


class OutboundEmailDeadLetter(SQLModel, table=True):
    __tablename__ = "outbound_email_dead_letters"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True)
    template: str = Field(max_length=120, index=True)
    retry_count: int = Field(default=0, ge=0)
    payload: str = Field(description="JSON object")
    error_message: Optional[str] = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)


class OutboundWhatsAppAudit(SQLModel, table=True):
    __tablename__ = "outbound_whatsapp_audits"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True)
    phone_number: str = Field(max_length=50, index=True)
    template_name: str = Field(max_length=120, index=True)
    provider_message_id: Optional[str] = Field(default=None, max_length=255, index=True)
    conversation_id: Optional[str] = Field(default=None, max_length=255, index=True)
    pricing_category: Optional[str] = Field(default=None, max_length=100)
    status: str = Field(default="queued", max_length=40, index=True)
    error_message: Optional[str] = Field(default=None, max_length=2000)
    payload_json: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: Optional[datetime] = Field(default=None, sa_column_kwargs={"onupdate": utc_now})
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None



class PlatformPlan(SQLModel, table=True):
    __tablename__ = "platform_plans"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    code: str = Field(max_length=64, unique=True, index=True)
    name: str = Field(max_length=120)
    max_users: int = Field(default=10, ge=1)
    storage_limit_gb: int = Field(default=5, ge=1)
    modules: str = Field(default="[]", description="JSON array")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)


class PlatformSubscription(SQLModel, table=True):
    __tablename__ = "platform_subscriptions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True)
    plan_id: UUID = Field(foreign_key="platform_plans.id", index=True)
    status: str = Field(default="trial", max_length=32, index=True)
    starts_at: datetime = Field(default_factory=utc_now)
    ends_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now, nullable=False)


class PlatformAdminAction(SQLModel, table=True):
    __tablename__ = "platform_admin_actions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    actor_user_id: UUID = Field(foreign_key="users.id", index=True)
    action: str = Field(max_length=120, index=True)
    tenant_id: Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    target_user_id: Optional[UUID] = Field(foreign_key="users.id", default=None, index=True)
    details: Optional[str] = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)


class UserSecurityPolicy(SQLModel, table=True):
    __tablename__ = "user_security_policies"

    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    force_password_change: bool = Field(default=False)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})


# ═══════════════════════════════════════════════════════════════════════════════
#  9 · SATIN ALMA & TEDARİK (PROCUREMENT)
# ═══════════════════════════════════════════════════════════════════════════════

class ProcurementStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    ORDERED = "ordered"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class Supplier(SQLModel, table=True):
    __tablename__ = "suppliers"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    name: str = Field(max_length=200, index=True)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=255)
    tax_no: Optional[str] = Field(default=None, max_length=30)
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)

    orders: List["PurchaseOrder"] = Relationship(back_populates="supplier")


class PurchaseRequest(SQLModel, table=True):
    __tablename__ = "purchase_requests"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    project_id: Optional[UUID] = Field(foreign_key="projects.id", default=None, index=True)
    material_id: UUID = Field(foreign_key="materials.id", index=True)
    quantity: int = Field(gt=0)
    priority: str = Field(default="normal", max_length=20, index=True)
    notes: Optional[str] = Field(default=None, max_length=500)
    status: ProcurementStatus = Field(default=ProcurementStatus.PENDING_APPROVAL, index=True)
    requested_by: Optional[UUID] = Field(foreign_key="users.id", default=None)
    requested_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)
    reviewed_by: Optional[UUID] = Field(foreign_key="users.id", default=None)
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = Field(default=None, max_length=255)

    project: Mapped[Optional["Project"]] = Relationship()
    material: Mapped["Material"] = Relationship()


class PurchaseOrder(SQLModel, table=True):
    __tablename__ = "purchase_orders"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    po_no: str = Field(max_length=100, unique=True, index=True)
    supplier_id: Optional[UUID] = Field(foreign_key="suppliers.id", default=None, index=True)
    project_id: Optional[UUID] = Field(foreign_key="projects.id", default=None, index=True)
    warehouse_id: Optional[UUID] = Field(foreign_key="warehouses.id", default=None, index=True)
    status: ProcurementStatus = Field(default=ProcurementStatus.DRAFT, index=True)
    order_date: Optional[datetime] = None
    expected_date: Optional[datetime] = None
    received_at: Optional[datetime] = None
    total_amount: Optional[Decimal] = Field(default=None, max_digits=14, decimal_places=2)
    notes: Optional[str] = Field(default=None, max_length=500)
    created_by: Optional[UUID] = Field(foreign_key="users.id", default=None)
    received_by: Optional[UUID] = Field(foreign_key="users.id", default=None)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})

    supplier: Mapped[Optional["Supplier"]] = Relationship(back_populates="orders")
    items: List["PurchaseOrderItem"] = Relationship(back_populates="order")


class PurchaseOrderItem(SQLModel, table=True):
    __tablename__ = "purchase_order_items"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    order_id: UUID = Field(foreign_key="purchase_orders.id", index=True)
    material_id: UUID = Field(foreign_key="materials.id", index=True)
    quantity: int = Field(gt=0)
    unit_price: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    total_price: Optional[Decimal] = Field(default=None, max_digits=14, decimal_places=2)
    notes: Optional[str] = Field(default=None, max_length=255)

    order: Mapped["PurchaseOrder"] = Relationship(back_populates="items")
    material: Mapped["Material"] = Relationship()


# ═══════════════════════════════════════════════════════════════════════════════
#  10 · SAHA RAPORU AKTİVİTE SATIRLARI
# ═══════════════════════════════════════════════════════════════════════════════

class FieldReportActivityType(str, Enum):
    INSTALLATION = "installation"
    TESTING = "testing"
    INSPECTION = "inspection"
    PROCUREMENT = "procurement"
    DOCUMENTATION = "documentation"
    COORDINATION = "coordination"
    OTHER = "other"


class FieldReportItem(SQLModel, table=True):
    __tablename__ = "field_report_items"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    report_id: UUID = Field(foreign_key="field_reports.id", index=True)
    activity_type: FieldReportActivityType = Field(default=FieldReportActivityType.INSTALLATION, index=True)
    description: str = Field(max_length=500)
    location: Optional[str] = Field(default=None, max_length=200)
    hours_spent: Optional[float] = None
    workers_count: Optional[int] = None
    sort_order: int = Field(default=0)

    report: Mapped["FieldReport"] = Relationship(back_populates="items")


# ═══════════════════════════════════════════════════════════════════════════════
#  11 · SÜREÇ TAKİBİ (STORE PROCESS)
# ═══════════════════════════════════════════════════════════════════════════════

class StoreProcess(SQLModel, table=True):
    """Mağaza tadilat / yeni yapım süreç kaydı."""

    __tablename__ = "store_processes"

    id:                  UUID             = Field(default_factory=uuid4, primary_key=True)
    tenant_id:           Optional[UUID]   = Field(foreign_key="tenants.id", default=None, index=True)
    project_id:          UUID             = Field(foreign_key="projects.id", index=True)
    work_type:           str              = Field(max_length=20, index=True)   # bakim | tadilat | yeni_yapim
    title:               str              = Field(max_length=255)
    description:         Optional[str]    = Field(default=None)
    status:              str              = Field(default="in_progress", max_length=30, index=True)
    start_date:          Optional[datetime] = None
    target_end_date:     Optional[datetime] = None
    completed_at:        Optional[datetime] = None
    responsible_name:    Optional[str]    = Field(default=None, max_length=255)
    responsible_user_id: Optional[UUID]   = Field(foreign_key="users.id", default=None)
    progress_percent:    int              = Field(default=0)
    created_by:          Optional[UUID]   = Field(foreign_key="users.id", default=None)
    created_at:          datetime         = Field(default_factory=utc_now, nullable=False)
    updated_at:          datetime         = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})

    stages: List["StoreProcessStage"] = Relationship(back_populates="process")
    notes:  List["StoreProcessNote"]  = Relationship(back_populates="process")


class StoreProcessStage(SQLModel, table=True):
    """Süreç aşaması (timeline adımı)."""

    __tablename__ = "store_process_stages"

    id:               UUID           = Field(default_factory=uuid4, primary_key=True)
    process_id:       UUID           = Field(foreign_key="store_processes.id", index=True)
    name:             str            = Field(max_length=255)
    order_index:      int            = Field(default=0, index=True)
    status:           str            = Field(default="pending", max_length=30)  # pending | in_progress | completed | delayed | cancelled
    responsible_name: Optional[str]  = Field(default=None, max_length=255)
    start_date:       Optional[datetime] = None
    target_end_date:  Optional[datetime] = None
    completed_at:     Optional[datetime] = None
    note:             Optional[str]  = Field(default=None)
    created_at:       datetime       = Field(default_factory=utc_now, nullable=False)
    updated_at:       datetime       = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})

    process: Mapped["StoreProcess"] = Relationship(back_populates="stages")


class StoreProcessNote(SQLModel, table=True):
    """Süreç notu (firma / teknik / onay / revizyon)."""

    __tablename__ = "store_process_notes"

    id:          UUID         = Field(default_factory=uuid4, primary_key=True)
    process_id:  UUID         = Field(foreign_key="store_processes.id", index=True)
    stage_id:    Optional[UUID] = Field(foreign_key="store_process_stages.id", default=None)
    user_id:     Optional[UUID] = Field(foreign_key="users.id", default=None)
    user_name:   Optional[str] = Field(default=None, max_length=255)
    note_type:   str          = Field(default="general", max_length=30)  # general | firm | technical | approval | revision
    content:     str          = Field()
    created_at:  datetime     = Field(default_factory=utc_now, nullable=False)

    process: Mapped["StoreProcess"] = Relationship(back_populates="notes")


class StoreActivity(SQLModel, table=True):
    """Son İşlemler akışı — mağaza bazlı tüm değişiklikler."""

    __tablename__ = "store_activities"

    id:                  UUID         = Field(default_factory=uuid4, primary_key=True)
    tenant_id:           Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    project_id:          UUID         = Field(foreign_key="projects.id", index=True)
    user_id:             Optional[UUID] = Field(foreign_key="users.id", default=None)
    user_name:           Optional[str] = Field(default=None, max_length=255)
    activity_type:       str          = Field(max_length=50, index=True)
    title:               str          = Field(max_length=500)
    description:         Optional[str] = Field(default=None)
    related_process_id:  Optional[UUID] = Field(foreign_key="store_processes.id", default=None)
    related_stage_id:    Optional[UUID] = Field(foreign_key="store_process_stages.id", default=None)
    created_at:          datetime     = Field(default_factory=utc_now, nullable=False, index=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  Phase 6 — Servis Formları, Hakkedişler, Onay Süreçleri
# ═══════════════════════════════════════════════════════════════════════════════

class StoreServiceForm(SQLModel, table=True):
    """Aylık bakım servis formu — sahadan yüklenen form."""

    __tablename__ = "store_service_forms"

    id:                 UUID           = Field(default_factory=uuid4, primary_key=True)
    tenant_id:          Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    project_id:         UUID           = Field(foreign_key="projects.id", index=True)
    year:               int            = Field(index=True)
    month:              int            = Field(index=True)  # 1-12
    file_url:           Optional[str]  = Field(default=None)
    file_name:          Optional[str]  = Field(default=None, max_length=500)
    file_size_bytes:    Optional[int]  = Field(default=None)
    contractor_company: Optional[str]  = Field(default=None, max_length=255)
    uploaded_by:        Optional[UUID] = Field(foreign_key="users.id", default=None)
    uploaded_by_name:   Optional[str]  = Field(default=None, max_length=255)
    description:        Optional[str]  = Field(default=None)
    status:             str            = Field(default="uploaded", max_length=30, index=True)
    created_at:         datetime       = Field(default_factory=utc_now, nullable=False)
    updated_at:         datetime       = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})


class StoreProgressPayment(SQLModel, table=True):
    """Hakkediş — mağaza bazlı ödeme talebi."""

    __tablename__ = "store_progress_payments"

    id:                 UUID           = Field(default_factory=uuid4, primary_key=True)
    tenant_id:          Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    project_id:         UUID           = Field(foreign_key="projects.id", index=True)
    process_id:         Optional[UUID] = Field(foreign_key="store_processes.id", default=None, index=True)
    payment_type:       str            = Field(max_length=50, index=True)
    period:             Optional[str]  = Field(default=None, max_length=20)  # "2026-06"
    amount:             Optional[Decimal] = Field(default=None, max_digits=14, decimal_places=2)
    currency:           str            = Field(default="TRY", max_length=10)
    file_url:           Optional[str]  = Field(default=None)
    file_name:          Optional[str]  = Field(default=None, max_length=500)
    description:        Optional[str]  = Field(default=None)
    approval_status:    str            = Field(default="internal_pending", max_length=30, index=True)
    submitted_for_approval: bool       = Field(default=False)
    submitted_by:       Optional[UUID] = Field(foreign_key="users.id", default=None)
    submitted_by_name:  Optional[str]  = Field(default=None, max_length=255)
    internal_approved_by_name: Optional[str]      = Field(default=None, max_length=255)
    internal_approved_at:      Optional[datetime]  = Field(default=None)
    sent_to_migros_by_name:    Optional[str]      = Field(default=None, max_length=255)
    sent_to_migros_at:         Optional[datetime]  = Field(default=None)
    migros_approved_by_name:   Optional[str]      = Field(default=None, max_length=255)
    migros_approved_at:        Optional[datetime]  = Field(default=None)
    invoiced_at:               Optional[datetime]  = Field(default=None)
    created_at:         datetime       = Field(default_factory=utc_now, nullable=False)
    updated_at:         datetime       = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})


class StoreInvoiceRecord(SQLModel, table=True):
    """Mağaza bazlı fatura kaydı (servis/materyal/ara/final)."""

    __tablename__ = "store_invoice_records"

    id:                 UUID           = Field(default_factory=uuid4, primary_key=True)
    tenant_id:          Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    project_id:         UUID           = Field(foreign_key="projects.id", index=True)
    process_id:         Optional[UUID] = Field(foreign_key="store_processes.id", default=None)
    invoice_type:           str            = Field(max_length=50, index=True)
    invoice_no:             Optional[str]  = Field(default=None, max_length=100)
    invoice_date:           Optional[str]  = Field(default=None, max_length=20)
    period:                 Optional[str]  = Field(default=None, max_length=20)
    amount:                 Optional[Decimal] = Field(default=None, max_digits=14, decimal_places=2)
    currency:               str            = Field(default="TRY", max_length=10)
    file_url:               Optional[str]  = Field(default=None)
    file_name:              Optional[str]  = Field(default=None, max_length=500)
    description:            Optional[str]  = Field(default=None)
    related_payment_id:     Optional[UUID] = Field(foreign_key="store_progress_payments.id", default=None, index=True)
    approval_status:        str            = Field(default="pending", max_length=30, index=True)
    submitted_by:           Optional[UUID] = Field(foreign_key="users.id", default=None)
    submitted_by_name:      Optional[str]  = Field(default=None, max_length=255)
    created_at:             datetime       = Field(default_factory=utc_now, nullable=False)
    updated_at:             datetime       = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})


# ═══════════════════════════════════════════════════════════════════════════════
#  12 · İŞ EMİRLERİ (WORK ORDERS)
# ═══════════════════════════════════════════════════════════════════════════════

class WorkOrderType(str, Enum):
    MAINTENANCE   = "maintenance"    # Bakım
    FAULT         = "fault"          # Arıza
    REPAIR        = "repair"         # Onarım
    RENOVATION    = "renovation"     # Tadilat
    MANUFACTURING = "manufacturing"  # İmalat
    OTHER         = "other"          # Diğer


class WorkOrderStatus(str, Enum):
    PLANNED           = "planned"            # Planlanacak
    DRAFT             = "draft"              # Taslak
    SENT              = "sent"               # WhatsApp Gönderildi
    STARTED           = "started"            # İşe Başlandı
    COMPLETED         = "completed"          # Tamamlandı
    FAILED            = "failed"             # Tamamlanmadı
    CANCELLED         = "cancelled"          # İptal Edildi
    MATERIAL_WAITING  = "material_waiting"   # Malzeme Bekliyor
    REVISIT           = "revisit"            # Tekrar Gidilecek
    APPROVAL_PENDING  = "approval_pending"   # Onay Bekliyor
    APPROVED          = "approved"           # Onaylandı


class WorkOrderPriority(str, Enum):
    NORMAL   = "normal"    # Normal
    URGENT   = "urgent"    # Acil
    CRITICAL = "critical"  # Kritik


class WorkOrderPhotoType(str, Enum):
    BEFORE     = "before"      # Öncesi
    AFTER      = "after"       # Sonrası
    COMPLETION = "completion"  # Tamamlanma
    ISSUE      = "issue"       # Sorun


class WorkOrderWhatsappStatus(str, Enum):
    QUEUED    = "queued"
    SENT      = "sent"
    DELIVERED = "delivered"
    READ      = "read"
    FAILED    = "failed"


class WorkOrder(SQLModel, table=True):
    """İş emri — bakım, arıza, onarım, tadilat veya imalat."""

    __tablename__ = "work_orders"

    id:                   UUID                = Field(default_factory=uuid4, primary_key=True)
    tenant_id:            Optional[UUID]       = Field(foreign_key="tenants.id", default=None, index=True)
    project_id:           UUID                = Field(foreign_key="projects.id", index=True)
    # The canonical Alembic schema stores these workflow values as VARCHAR.
    # Keep the Python enums for validation, but make the SQL column type
    # explicit so SQLAlchemy never expects PostgreSQL enum types that do not
    # exist in production.
    work_type:            WorkOrderType       = Field(
        sa_column=Column(String(30), nullable=False, index=True)
    )
    title:                str                 = Field(max_length=255)
    description:          Optional[str]       = Field(default=None)
    assigned_to_name:     Optional[str]       = Field(default=None, max_length=255)
    assigned_to_phone:    Optional[str]       = Field(default=None, max_length=30)
    priority:             WorkOrderPriority   = Field(
        default=WorkOrderPriority.NORMAL,
        sa_column=Column(String(20), nullable=False, index=True),
    )
    status:               WorkOrderStatus     = Field(
        default=WorkOrderStatus.DRAFT,
        sa_column=Column(String(30), nullable=False, index=True),
    )
    location_url:         Optional[str]       = Field(default=None, max_length=1000)
    due_date:             Optional[datetime]  = Field(default=None)
    created_by:           Optional[UUID]      = Field(foreign_key="users.id", default=None)
    created_by_name:      Optional[str]       = Field(default=None, max_length=255)
    sent_at:              Optional[datetime]  = Field(default=None)
    started_at:           Optional[datetime]  = Field(default=None)
    completed_at:         Optional[datetime]  = Field(default=None)
    completion_notes:     Optional[str]       = Field(default=None)
    created_at:           datetime            = Field(default_factory=utc_now, nullable=False)
    updated_at:           datetime            = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})

    assigned_to_user_id:  Optional[UUID]      = Field(foreign_key="users.id", default=None, index=True)

    public_links:         List["WorkOrderPublicLink"]      = Relationship(back_populates="work_order")
    photos:               List["WorkOrderPhoto"]           = Relationship(back_populates="work_order")
    service_forms:        List["WorkOrderServiceForm"]     = Relationship(back_populates="work_order")
    whatsapp_messages:    List["WorkOrderWhatsappMessage"] = Relationship(back_populates="work_order")
    activities:           List["WorkOrderActivity"]        = Relationship(back_populates="work_order")
    reports:              List["WorkOrderReport"]          = Relationship(back_populates="work_order")
    stages:               List["WorkOrderStage"]           = Relationship(back_populates="work_order")


class WorkOrderPublicLink(SQLModel, table=True):
    """Public (token korumalı, login gerektirmeyen) iş emri erişim linki."""

    __tablename__ = "work_order_public_links"

    id:             UUID              = Field(default_factory=uuid4, primary_key=True)
    work_order_id:  UUID              = Field(foreign_key="work_orders.id", index=True)
    token:          str               = Field(max_length=128, unique=True, index=True)
    expires_at:     Optional[datetime] = Field(default=None)
    is_active:      bool              = Field(default=True)
    used_at:        Optional[datetime] = Field(default=None)
    created_at:     datetime          = Field(default_factory=utc_now, nullable=False)

    work_order: Mapped["WorkOrder"] = Relationship(back_populates="public_links")


class WorkOrderPhoto(SQLModel, table=True):
    """İş emrine bağlı fotoğraf."""

    __tablename__ = "work_order_photos"

    id:             UUID               = Field(default_factory=uuid4, primary_key=True)
    work_order_id:  UUID               = Field(foreign_key="work_orders.id", index=True)
    file_key:       str                = Field(max_length=512)
    file_url:       Optional[str]      = Field(default=None, max_length=1000)
    file_name:      Optional[str]      = Field(default=None, max_length=255)
    file_size_bytes: Optional[int]     = Field(default=None)
    mime_type:      Optional[str]      = Field(default=None, max_length=128)
    photo_type:     WorkOrderPhotoType = Field(
        default=WorkOrderPhotoType.COMPLETION,
        sa_column=Column(String(30), nullable=False, index=True),
    )
    uploaded_by_name: Optional[str]   = Field(default=None, max_length=255)
    uploaded_at:    datetime           = Field(default_factory=utc_now, nullable=False)
    # ── Görsel Envanter aktarım ─────────────────────────────
    work_order: Mapped["WorkOrder"] = Relationship(back_populates="photos")


class WorkOrderServiceForm(SQLModel, table=True):
    """İş emrine bağlı servis formu (bakım için zorunlu)."""

    __tablename__ = "work_order_service_forms"

    id:               UUID           = Field(default_factory=uuid4, primary_key=True)
    work_order_id:    UUID           = Field(foreign_key="work_orders.id", index=True)
    project_id:       UUID           = Field(foreign_key="projects.id", index=True)
    year:             int            = Field(index=True)
    month:            int            = Field(index=True)
    file_key:         str            = Field(max_length=512)
    file_url:         Optional[str]  = Field(default=None, max_length=1000)
    file_name:        Optional[str]  = Field(default=None, max_length=255)
    file_size_bytes:  Optional[int]  = Field(default=None)
    uploaded_by_name: Optional[str]  = Field(default=None, max_length=255)
    uploaded_at:      datetime       = Field(default_factory=utc_now, nullable=False)

    work_order: Mapped["WorkOrder"] = Relationship(back_populates="service_forms")


class WorkOrderWhatsappMessage(SQLModel, table=True):
    """WhatsApp mesaj gönderim kaydı."""

    __tablename__ = "work_order_whatsapp_messages"

    id:                   UUID                    = Field(default_factory=uuid4, primary_key=True)
    work_order_id:        UUID                    = Field(foreign_key="work_orders.id", index=True)
    to_phone:             str                     = Field(max_length=30)
    whatsapp_message_id:  Optional[str]           = Field(default=None, max_length=255, index=True)
    status:               WorkOrderWhatsappStatus = Field(
        default=WorkOrderWhatsappStatus.QUEUED,
        sa_column=Column(String(30), nullable=False, index=True),
    )
    error_message:        Optional[str]           = Field(default=None, max_length=1000)
    sent_at:              Optional[datetime]       = Field(default=None)
    updated_at:           datetime                = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})

    work_order: Mapped["WorkOrder"] = Relationship(back_populates="whatsapp_messages")


class WorkOrderActivity(SQLModel, table=True):
    """İş emri aktivite akışı (mağaza kartı son işlemler ile senkronize)."""

    __tablename__ = "work_order_activities"

    id:             UUID           = Field(default_factory=uuid4, primary_key=True)
    work_order_id:  UUID           = Field(foreign_key="work_orders.id", index=True)
    project_id:     UUID           = Field(foreign_key="projects.id", index=True)
    activity_type:  str            = Field(max_length=50, index=True)
    title:          str            = Field(max_length=500)
    description:    Optional[str]  = Field(default=None)
    created_at:     datetime       = Field(default_factory=utc_now, nullable=False, index=True)

    work_order: Mapped["WorkOrder"] = Relationship(back_populates="activities")


class WorkOrderReport(SQLModel, table=True):
    """İş emri sahadan rapor kaydı."""

    __tablename__ = "work_order_reports"

    id:              UUID           = Field(default_factory=uuid4, primary_key=True)
    work_order_id:   UUID           = Field(foreign_key="work_orders.id", index=True)
    title:           str            = Field(max_length=255)
    description:     Optional[str]  = Field(default=None)
    severity:        str            = Field(default="normal", max_length=20)  # normal | important | critical
    created_by_name: Optional[str]  = Field(default=None, max_length=255)
    created_by:      Optional[UUID] = Field(foreign_key="users.id", default=None)
    created_at:      datetime       = Field(default_factory=utc_now, nullable=False)

    work_order: Mapped["WorkOrder"]          = Relationship(back_populates="reports")
    photos:     List["WorkOrderReportPhoto"] = Relationship(back_populates="report")


class WorkOrderReportPhoto(SQLModel, table=True):
    """İş emri raporuna bağlı görsel/dosya."""

    __tablename__ = "work_order_report_photos"

    id:               UUID           = Field(default_factory=uuid4, primary_key=True)
    report_id:        UUID           = Field(foreign_key="work_order_reports.id", index=True)
    work_order_id:    UUID           = Field(foreign_key="work_orders.id", index=True)
    file_key:         str            = Field(max_length=512)
    file_url:         Optional[str]  = Field(default=None, max_length=1000)
    file_name:        Optional[str]  = Field(default=None, max_length=255)
    file_size_bytes:  Optional[int]  = Field(default=None)
    mime_type:        Optional[str]  = Field(default=None, max_length=128)
    uploaded_by_name: Optional[str]  = Field(default=None, max_length=255)
    uploaded_at:      datetime       = Field(default_factory=utc_now, nullable=False)
    report: Mapped["WorkOrderReport"] = Relationship(back_populates="photos")


class WorkOrderStage(SQLModel, table=True):
    """İş emri 4 aşamalı takip çizelgesi."""

    __tablename__ = "work_order_stages"

    id:               UUID           = Field(default_factory=uuid4, primary_key=True)
    work_order_id:    UUID           = Field(foreign_key="work_orders.id", index=True)
    stage_order:      int            = Field(index=True)  # 1-4
    stage_name:       str            = Field(max_length=100)
    status:           str            = Field(default="planned", max_length=20)  # planned | in_progress | completed | cancelled
    description:      Optional[str]  = Field(default=None)
    updated_at:       Optional[datetime] = Field(default=None)
    updated_by_name:  Optional[str]  = Field(default=None, max_length=255)
    created_at:       datetime       = Field(default_factory=utc_now, nullable=False)

    work_order: Mapped["WorkOrder"] = Relationship(back_populates="stages")


class StoreApprovalRequest(SQLModel, table=True):
    """Onay talebi — hakkediş, fatura, proje, teklif, mail."""

    __tablename__ = "store_approval_requests"

    id:                 UUID           = Field(default_factory=uuid4, primary_key=True)
    tenant_id:          Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    project_id:         UUID           = Field(foreign_key="projects.id", index=True)
    process_id:         Optional[UUID] = Field(foreign_key="store_processes.id", default=None)
    approval_type:      str            = Field(max_length=50, index=True)
    related_payment_id: Optional[UUID] = Field(foreign_key="store_progress_payments.id", default=None)
    related_invoice_id: Optional[UUID] = Field(foreign_key="store_invoice_records.id", default=None)
    title:              str            = Field(max_length=500)
    description:        Optional[str]  = Field(default=None)
    amount:             Optional[Decimal] = Field(default=None, max_digits=14, decimal_places=2)
    file_url:           Optional[str]  = Field(default=None)
    file_name:          Optional[str]  = Field(default=None, max_length=500)
    status:             str            = Field(default="bekliyor", max_length=30, index=True)
    requested_by:       Optional[UUID] = Field(foreign_key="users.id", default=None)
    requested_by_name:  Optional[str]  = Field(default=None, max_length=255)
    requested_at:       datetime       = Field(default_factory=utc_now, nullable=False)
    approved_by:        Optional[UUID] = Field(default=None)
    approved_by_name:   Optional[str]  = Field(default=None, max_length=255)
    approved_at:        Optional[datetime] = Field(default=None)
    note:               Optional[str]  = Field(default=None)
    created_at:         datetime       = Field(default_factory=utc_now, nullable=False)
    updated_at:         datetime       = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})


class Notification(SQLModel, table=True):
    """Kullanıcıya özel bildirim — iş emri yaşam döngüsü olayları vb."""

    __tablename__ = "notifications"

    id:               UUID           = Field(default_factory=uuid4, primary_key=True)
    tenant_id:        Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    user_id:          UUID           = Field(foreign_key="users.id", index=True)
    category:         str            = Field(max_length=40, index=True)  # work_order_assigned | work_order_started | work_order_completed | work_order_deleted
    title:            str            = Field(max_length=255)
    body:             Optional[str]  = Field(default=None)
    work_order_id:    Optional[UUID] = Field(foreign_key="work_orders.id", default=None, index=True)
    is_read:          bool           = Field(default=False, index=True)
    created_at:       datetime       = Field(default_factory=utc_now, nullable=False, index=True)


class BackupRun(SQLModel, table=True):
    """Firma kontrollü yerel yedekleme koşusu — yalnızca denetim/hatırlatma
    amaçlı özet kaydı. İncremental karar mantığının KAYNAĞI değildir; o,
    seçilen HDD/klasördeki backup-index.json manifestidir (sunucu hiçbir
    "son backup" durumunu incremental karar için kullanmaz — yalnızca
    Yönetici panelindeki hatırlatma/geçmiş ekranı bu tabloyu okur)."""

    __tablename__ = "backup_runs"

    id:                  UUID           = Field(default_factory=uuid4, primary_key=True)
    tenant_id:           Optional[UUID] = Field(foreign_key="tenants.id", default=None, index=True)
    manager_user_id:     UUID           = Field(foreign_key="users.id", index=True)
    manager_name:        str            = Field(max_length=255)
    # İstemcinin (tarayıcının) seçilen HDD/klasör için ürettiği kalıcı kimlik —
    # disk harfi değişebildiği için asla disk harfi/yol saklanmaz.
    backup_target_id:    str            = Field(max_length=64, index=True)
    backup_target_label: Optional[str]  = Field(default=None, max_length=255)
    status:              str            = Field(max_length=20, index=True)  # running | completed | failed | incomplete
    database_backed_up:  bool           = Field(default=False)
    r2_objects_new:       int           = Field(default=0)
    r2_objects_changed:   int           = Field(default=0)
    r2_objects_failed:    int           = Field(default=0)
    # BigInteger: bir yedekleme koşusu tek başına 2 GB'ın (INTEGER sınırı) çok
    # üzerinde veri yazabilir (madde: "1 TB backup").
    bytes_written:        int           = Field(default=0, sa_column=Column(BigInteger(), nullable=False, server_default="0"))
    error_message:        Optional[str] = Field(default=None, max_length=2000)
    started_at:           datetime      = Field(default_factory=utc_now, nullable=False, index=True)
    completed_at:         Optional[datetime] = Field(default=None)


class PushSubscription(SQLModel, table=True):
    """Bir kullanıcının telefon/tarayıcı bildirimi (Web Push) açtığı cihaz.

    Kullanıcı başına birden çok satır olabilir (telefon + bilgisayar). Push
    servisi "artık geçersiz" (404/410) dediğinde satır silinir."""

    __tablename__ = "push_subscriptions"

    id:              UUID           = Field(default_factory=uuid4, primary_key=True)
    user_id:         UUID           = Field(foreign_key="users.id", index=True)
    tenant_id:       Optional[UUID] = Field(foreign_key="tenants.id", default=None)
    # Push servisinin (FCM / Apple / Mozilla) bu cihaza özel adresi.
    endpoint:        str            = Field(max_length=1000, unique=True)
    p256dh:          str            = Field(max_length=255)
    auth:            str            = Field(max_length=255)
    # Cihazın kullandığı panel öneki ("/manager", "/user" ya da "") — bildirime
    # tıklanınca doğru panelde iş emrini açmak için.
    panel:           str            = Field(default="", max_length=20)
    user_agent:      Optional[str]  = Field(default=None, max_length=400)
    created_at:      datetime       = Field(default_factory=utc_now, nullable=False)
    last_success_at: Optional[datetime] = Field(default=None)


class SystemSetting(SQLModel, table=True):
    """Sunucunun kendi ürettiği kalıcı anahtar/değer ayarları (örn. VAPID anahtar çifti)."""

    __tablename__ = "system_settings"

    key:        str      = Field(primary_key=True, max_length=100)
    value:      str      = Field(sa_column=Column(Text(), nullable=False))
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)
