"""Kurulum projeleri ("Proje" iş tipi).

Yeni bir kurulum (tür: market / soğuk oda / soğutma) keşiften kapanışa kadar sabit 7 aşamadan
geçer. Her aşamanın bir kontrol listesi ve kapanma şartları vardır (gerekli belge, üretim no,
malzeme hazırlığı, montaj iş emirlerinin bitmesi vb.); aşamalar sırayla kapanır. Her projenin
kendi deposu (kind='project') vardır: malzeme ana depodan buraya aktarılır, projeye bağlı iş
emirleri buradan düşer.

Projeyi yöneticiler yönetir. Projeye atanan kişiler (members) projenin tüm aşamalarını ve
maliyetlerini görür, üretim no ve maliyet girebilir; aşama sorumlusu kendi aşamasını yürütür.
Teknisyenler projeye bağlı iş emirlerini normal iş emri ekranlarında görür.
"""

from __future__ import annotations

import json
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
from app.api.v1.routes.work_orders import WORK_TYPE_LABELS
from app.db.models import (
    Customer, InstallationChecklistTemplate, InstallationProject, InstallationProjectChecklistItem, InstallationProjectCost,
    InstallationProjectDocument, InstallationProjectMaterial, InstallationProjectMember,
    InstallationProjectProductionNumber, InstallationProjectStage, InstallationProjectStageEvent, Project, Region, RetailBalance,
    RetailDepot, RetailMaterial, RetailMovement, Tenant, User, WorkOrder, utc_now,
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
    "fatura": "Fatura",
    "diger": "Diğer",
}
INVOICE_DOC = "fatura"  # Proje kapandıktan sonra da yüklenebilen tek belge türü.
DEFAULT_VAT_RATE = Decimal("20")
INVOICE_PARTY_FIELDS = ("invoice_title", "invoice_tax_office", "invoice_tax_no", "invoice_address")

# Üretim no ve malzeme listesinin yönetildiği adım; montaj iş emirleri ve test "Montaj ve test" adımındadır.
PRODUCTION_STAGE = "uretim"
MONTAGE_STAGE = "montaj_test"

# Ana aşamalar: ekranda üst şerit. Her ana aşama bir veya birkaç adımdan oluşur; adımlar sırayla
# ve ayrı ayrı tamamlanır, ana aşamanın bütün adımları bitince sonraki ana aşamaya geçilir.
PHASES: list[tuple[str, str]] = [
    ("kesif", "Keşif"), ("teklif", "Teklif"), ("uretim_montaj", "Üretim ve Montaj"), ("kapanis", "Kapanış"),
]
PHASE_NAMES = dict(PHASES)

# Adımlar (veritabanında "aşama" kaydı): (sıra, kod, ad, gerekli belge türleri, ek kurallar, varsayılan kontrol listesi)
STAGE_TEMPLATE: list[tuple[int, str, str, list[str], tuple[str, ...], list[str]]] = [
    (1, "kesif", "Keşif", ["kesif_raporu", "fotograf"], (),
     ["Yer ölçüleri alındı", "Mevcut durum fotoğraflandı", "Müşteri ihtiyacı not edildi"]),
    # Malzeme listesi "Üretim" adımında girildiği için burada "malzeme listesi girilmiş olmalı" şartı aranmaz.
    (2, "teklif", "Projelendirme ve Teklif", ["teklif"], ("budget_set", "target_costs_set"),
     ["Soğutma ihtiyacı hesaplandı", "Çizim hazırlandı", "Malzeme listesi çıkarıldı", "Teklif hazırlandı"]),
    # Satış fiyatı (müşterinin onayladığı tutar) ve KDV bu adımda girilir.
    (3, "onay", "Müşteri Onayı", ["sozlesme"], ("sale_price_set",),
     ["Teklif müşteriye iletildi", "Müşteri onayı alındı", "Avans (varsa) alındı"]),
    (4, PRODUCTION_STAGE, "Üretim", [], ("production_number", "materials_ready"),
     ["Eksik malzemeler belirlendi", "Malzemeler proje deposuna aktarıldı"]),
    (5, MONTAGE_STAGE, "Montaj ve Test", ["test_formu"], ("work_orders_done",),
     ["Ekip ve tarihler planlandı", "Montaj tamamlandı"]),
    (6, "teslim", "Teslim", ["kabul_tutanagi"], (),
     ["Kullanıcı eğitimi verildi", "Son çizimler teslim edildi"]),
    # Kapanış maliyet ağırlıklıdır: açık iş kalmamalı, fatura ve gerçekleşen maliyet girilmiş olmalı.
    (7, "kapanis", "Kapanış", [], ("no_open_work_orders", "invoice_set", "actual_costs_set", "depot_empty"),
     ["Teklif ile gerçekleşen maliyet karşılaştırıldı", "Hakediş / fatura kesildi"]),
]
STAGE_BY_CODE = {code: (docs, rules) for _, code, _, docs, rules, _ in STAGE_TEMPLATE}
# Adım → ana aşama (eski kodlar da güvenli tarafta kalsın).
STAGE_PHASE = {
    "kesif": "kesif", "teklif": "teklif", "onay": "teklif",
    PRODUCTION_STAGE: "uretim_montaj", MONTAGE_STAGE: "uretim_montaj", "uretim_montaj": "uretim_montaj", "test": "uretim_montaj",
    "teslim": "kapanis", "kapanis": "kapanis",
}


def _phase_of(code: str) -> str:
    return STAGE_PHASE.get(code, "kapanis")

PROJECT_TYPES = {"market": "Mağaza", "soguk_oda": "Soğuk oda", "sogutma": "Soğutma"}
COST_KINDS = {"target": "Hedeflenen", "actual": "Gerçekleşen"}
COST_CATEGORIES = {
    "montaj_iscilik": "Montaj işçilik bedeli",
    "nakliye": "Nakliye bedeli",
    "urun": "Proje ürün maliyeti",
    "ek": "Ek maliyetler",
}
EXTRA_COST = "ek"  # Bu kalemde birden fazla satır girilebilir.
# Projeye sonradan bağlanan arıza/bakım vb. iş emirlerinin proje deposundan düşen malzeme tutarı.
# Elle girilmez; gerçekleşen maliyete ve gerçek kâra otomatik eklenir.
LINKED_WO_COST = "bagli_is_emirleri"
LINKED_WO_COST_LABEL = "Bağlı iş emirleri (malzeme)"
# Projenin kendi montaj/test iş emirlerinin tipi; aşama şartlarında yalnız bu tip sayılır.
PROJECT_WORK_TYPE = "project"

RULE_LABELS = {
    "production_number": "En az bir üretim no girilmiş olmalı",
    "materials_listed": "Malzeme listesi girilmiş olmalı",
    "materials_ready": "Listedeki tüm malzemeler proje deposunda hazır olmalı",
    "work_orders_done": "En az bir montaj (Proje tipi) iş emri tamamlanmış ve açık montaj iş emri kalmamış olmalı",
    "depot_empty": "Proje deposunda malzeme kalmamalı (kalan malzeme ana depoya iade edilmeli)",
    "no_open_work_orders": "Projeye bağlı açık iş emri kalmamalı (arıza/bakım dahil; tamamlanmalı veya iptal edilmeli)",
    "budget_set": "Teklif tutarı girilmiş olmalı",
    "target_costs_set": "Hedeflenen maliyet girilmiş olmalı",
    "sale_price_set": "Satış fiyatı girilmiş olmalı",
    "invoice_set": "Fatura no, fatura tarihi ve fatura tutarı girilmiş olmalı",
    "actual_costs_set": "Gerçekleşen maliyet girilmiş olmalı",
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


async def _is_member(db: AsyncSession, project_id: UUID, user_id: UUID) -> bool:
    return (await db.execute(select(InstallationProjectMember.id).where(
        InstallationProjectMember.project_id == project_id,
        InstallationProjectMember.user_id == user_id).limit(1))).first() is not None


async def _project_view(db: AsyncSession, user: User, project_id: UUID) -> tuple[InstallationProject, bool]:
    """Projeyi görme: yönetici her projeyi, saha kullanıcısı yalnızca atandığı projeyi görür."""
    manager = _is_manager(user)
    tenant_id = await _tenant_id(db, user) if manager else user.tenant_id
    project = await db.get(InstallationProject, project_id)
    if not project or project.tenant_id != tenant_id:
        raise HTTPException(404, "Proje bulunamadı.")
    if not manager and not await _is_member(db, project.id, user.id):
        raise HTTPException(403, "Bu projeye atanmadınız.")
    return project, manager


async def _members(db: AsyncSession, project_id: UUID) -> list[dict]:
    rows = (await db.execute(
        select(User.id, User.full_name, User.email)
        .join(InstallationProjectMember, InstallationProjectMember.user_id == User.id)
        .where(InstallationProjectMember.project_id == project_id)
        .order_by(User.full_name)
    )).all()
    return [{"id": uid, "name": name or email} for uid, name, email in rows]


async def _production_numbers(db: AsyncSession, project_id: UUID) -> list[dict]:
    rows = (await db.execute(select(InstallationProjectProductionNumber).where(
        InstallationProjectProductionNumber.project_id == project_id)
        .order_by(InstallationProjectProductionNumber.created_at))).scalars().all()
    return [{"id": r.id, "number": r.number, "note": r.note, "created_by_name": r.created_by_name,
             "created_at": _iso(r.created_at)} for r in rows]


async def _linked_wo_costs(db: AsyncSession, project_ids: list[UUID]) -> dict[UUID, Decimal]:
    """Projeye bağlı, Proje tipi OLMAYAN iş emirlerinin proje deposundan düşen malzeme tutarı
    (katalog birim fiyatıyla). Proje tipi iş emirlerinin malzemesi elle girilen "ürün" kalemindedir."""
    if not project_ids:
        return {}
    rows = (await db.execute(
        select(InstallationProject.id,
               func.sum(RetailMovement.quantity * func.coalesce(RetailMaterial.unit_price, 0)))
        .join(WorkOrder, WorkOrder.installation_project_id == InstallationProject.id)
        .join(RetailMovement, RetailMovement.work_order_id == WorkOrder.id)
        .join(RetailMaterial, RetailMaterial.id == RetailMovement.material_id)
        .where(InstallationProject.id.in_(project_ids), WorkOrder.work_type != PROJECT_WORK_TYPE,
               RetailMovement.kind == "use", RetailMovement.source_depot_id == InstallationProject.depot_id)
        .group_by(InstallationProject.id)
    )).all()
    return {pid: Decimal(total or 0).quantize(Decimal("0.01")) for pid, total in rows}


async def _costs(db: AsyncSession, project_id: UUID) -> dict:
    """Hedeflenen / gerçekleşen maliyet kalemleri ve toplamları (girilmemiş kalem None döner).

    Gerçekleşen toplama, bağlı arıza/bakım iş emirlerinin malzeme tutarı otomatik eklenir."""
    rows = (await db.execute(select(InstallationProjectCost).where(
        InstallationProjectCost.project_id == project_id))).scalars().all()
    out: dict = {"categories": COST_CATEGORIES}
    for kind in COST_KINDS:
        items = []
        for category, label in COST_CATEGORIES.items():
            # Her kalemde birden çok madde (açıklama + tutar) olabilir; kalem tutarı maddelerin toplamıdır.
            lines = sorted((r for r in rows if r.kind == kind and r.category == category),
                           key=lambda r: (r.sort_order, r.updated_at, str(r.id)))
            items.append({"category": category, "label": label,
                          "amount": sum((r.amount for r in lines), Decimal("0")) if lines else None,
                          "lines": [{"id": r.id, "amount": r.amount, "description": r.description} for r in lines]})
        out[kind] = {"items": items,
                     "total": sum((i["amount"] for i in items if i["amount"] is not None), Decimal("0"))}
    linked = (await _linked_wo_costs(db, [project_id])).get(project_id, Decimal("0"))
    out["actual"]["linked_work_orders"] = linked
    out["actual"]["linked_work_orders_label"] = LINKED_WO_COST_LABEL
    out["actual"]["total"] += linked
    return out


def _store_card(store: Optional[Project], region: Optional[Region] = None) -> Optional[dict]:
    """Mağaza kartındaki adres ve iletişim bilgileri (kartın açıklama alanında JSON olarak durur).

    Şehir ve bölge kartta yazmıyorsa mağazanın bağlı olduğu bölge kaydından alınır.
    """
    if not store:
        return None
    try:
        extra = json.loads(store.description) if store.description else {}
    except (TypeError, ValueError):
        extra = {}
    if not isinstance(extra, dict):
        extra = {}
    text = lambda key: str(extra.get(key) or "").strip() or None  # noqa: E731
    city = text("sehir") or (region.city if region else None)
    region_name = text("bolge") or (region.name if region else None)
    if city and region_name and city.casefold() == region_name.casefold():
        city = None  # Bölge kaydında şehir ile bölge adı aynıysa iki kez yazılmasın.
    return {"id": store.id, "name": store.name, "no": store.project_no,
            "address": text("adres"), "city": city, "region": region_name,
            "phones": [phone for phone in (text(f"tel{n}") for n in range(1, 5)) if phone]}


async def _billing(db: AsyncSession, project: InstallationProject, store: Optional[Project]) -> dict:
    """Fatura bilgileri. "defaults": fatura tarafı alanları boşken önerilecek değerler —
    önce aynı müşteri firmanın en son projesinde girilenler, yoksa müşteri firma kaydı."""
    defaults: dict[str, Optional[str]] = {field: None for field in INVOICE_PARTY_FIELDS}
    if store:
        previous = (await db.execute(
            select(InstallationProject).join(Project, Project.id == InstallationProject.store_id)
            .where(InstallationProject.tenant_id == project.tenant_id, InstallationProject.id != project.id,
                   Project.customer_id == store.customer_id, InstallationProject.invoice_title.is_not(None))
            .order_by(InstallationProject.updated_at.desc()).limit(5))).scalars().all()
        for other in previous:
            for field in INVOICE_PARTY_FIELDS:
                defaults[field] = defaults[field] or getattr(other, field)
        customer = await db.get(Customer, store.customer_id)
        if customer:
            defaults["invoice_title"] = defaults["invoice_title"] or customer.name
            defaults["invoice_tax_no"] = defaults["invoice_tax_no"] or customer.tax_no
            defaults["invoice_address"] = defaults["invoice_address"] or customer.address
    return {
        "sale_price": project.sale_price, "sale_price_includes_vat": project.sale_price_includes_vat,
        "vat_rate": project.vat_rate if project.vat_rate is not None else DEFAULT_VAT_RATE,
        "invoice_no": project.invoice_no, "invoice_date": _iso(project.invoice_date),
        "invoice_due_date": _iso(project.invoice_due_date), "invoice_amount": project.invoice_amount,
        **{field: getattr(project, field) for field in INVOICE_PARTY_FIELDS},
        "defaults": defaults,
    }


async def _can_enter_production(db: AsyncSession, user: User, project: InstallationProject) -> bool:
    """Üretim no girebilenler: yönetici, projeye atanan kişi veya "Üretim ve montaj" aşamasının sorumlusu."""
    if _is_manager(user) or await _is_member(db, project.id, user.id):
        return True
    return (await db.execute(select(InstallationProjectStage.id).where(
        InstallationProjectStage.project_id == project.id, InstallationProjectStage.code == PRODUCTION_STAGE,
        InstallationProjectStage.responsible_user_id == user.id).limit(1))).first() is not None


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


def _work_order_row(wo: WorkOrder, names: dict, stage_names: dict) -> dict:
    """Projeye bağlı iş emri satırı: tipi ve bağın ne zaman, kim tarafından, hangi aşamada kurulduğu."""
    work_type = _status_value(wo.work_type)
    return {
        "id": wo.id, "title": wo.title, "status": _status_value(wo.status),
        "work_type": work_type, "work_type_label": WORK_TYPE_LABELS.get(work_type, work_type),
        "assigned_to_name": wo.assigned_to_name, "due_date": _iso(wo.due_date), "created_at": _iso(wo.created_at),
        "completed_at": _iso(wo.completed_at),
        "linked_at": _iso(wo.project_linked_at), "linked_by_name": names.get(wo.project_linked_by),
        "link_stage_name": stage_names.get(wo.project_link_stage_id),
    }


async def _requirements(db: AsyncSession, project: InstallationProject, stage: InstallationProjectStage,
                        checklist: list[InstallationProjectChecklistItem], doc_types: set[str],
                        materials: list[dict], work_orders: list[WorkOrder]) -> list[dict]:
    """Aşamanın kapanma şartları ve her birinin karşılanıp karşılanmadığı."""
    docs, rules = STAGE_BY_CODE.get(stage.code, ([], ()))
    # Kontrol listesi boş olan aşamada (ör. Devreye alma ve test) bu şart gösterilmez.
    reqs = [{"label": "Kontrol listesi tamamlanmış olmalı", "ok": all(item.is_done for item in checklist)}] if checklist else []
    for doc in docs:
        reqs.append({"label": f"{DOC_TYPES[doc]} yüklenmiş olmalı", "ok": doc in doc_types})
    for rule in rules:
        if rule == "production_number":
            has_number = (await db.execute(select(InstallationProjectProductionNumber.id).where(
                InstallationProjectProductionNumber.project_id == project.id).limit(1))).first()
            reqs.append({"label": RULE_LABELS[rule], "ok": has_number is not None})
        elif rule == "materials_listed":
            reqs.append({"label": RULE_LABELS[rule], "ok": any(row["planned_quantity"] > 0 for row in materials)})
        elif rule == "materials_ready":
            planned = [row for row in materials if row["planned_quantity"] > 0]
            reqs.append({"label": RULE_LABELS[rule], "ok": bool(planned) and all(row["missing"] == 0 for row in planned)})
        elif rule == "work_orders_done":
            # Bağlı arıza/bakım iş emirleri ara aşamaları engellemez; yalnız Proje tipi sayılır.
            montage = [wo for wo in work_orders if _status_value(wo.work_type) == PROJECT_WORK_TYPE]
            done = [wo for wo in montage if _status_value(wo.status) in ("completed", "approved")]
            open_ = [wo for wo in montage if _status_value(wo.status) not in CLOSED_WORK_ORDER]
            reqs.append({"label": RULE_LABELS[rule], "ok": bool(done) and not open_})
        elif rule == "no_open_work_orders":
            open_ = [wo for wo in work_orders if _status_value(wo.status) not in CLOSED_WORK_ORDER]
            reqs.append({"label": RULE_LABELS[rule], "ok": not open_})
        elif rule == "sale_price_set":
            reqs.append({"label": RULE_LABELS[rule], "ok": project.sale_price is not None and project.sale_price > 0})
        elif rule == "invoice_set":
            reqs.append({"label": RULE_LABELS[rule], "ok": bool((project.invoice_no or "").strip()) and project.invoice_date is not None
                         and project.invoice_amount is not None and project.invoice_amount > 0})
        elif rule == "budget_set":
            reqs.append({"label": RULE_LABELS[rule], "ok": project.budget is not None and project.budget > 0})
        elif rule in ("actual_costs_set", "target_costs_set"):
            kind = "actual" if rule == "actual_costs_set" else "target"
            has_cost = (await db.execute(select(InstallationProjectCost.id).where(
                InstallationProjectCost.project_id == project.id, InstallationProjectCost.kind == kind,
                InstallationProjectCost.amount > 0).limit(1))).first()
            reqs.append({"label": RULE_LABELS[rule], "ok": has_cost is not None})
        elif rule == "depot_empty":
            left = (await db.execute(select(RetailBalance.material_id).where(
                RetailBalance.depot_id == project.depot_id, RetailBalance.quantity > 0).limit(1))).first()
            reqs.append({"label": RULE_LABELS[rule], "ok": left is None})
    return reqs


def _status_value(value) -> str:
    return getattr(value, "value", value)


# ── Firma kontrol listesi şablonu ────────────────────────────────────────────

async def _templates(db: AsyncSession, tenant_id: UUID) -> dict[str, list[InstallationChecklistTemplate]]:
    """Firmanın adım başına kontrol listesi şablonu; hiç yoksa varsayılan maddelerle bir kez oluşturulur."""
    rows = (await db.execute(select(InstallationChecklistTemplate).where(
        InstallationChecklistTemplate.tenant_id == tenant_id)
        .order_by(InstallationChecklistTemplate.stage_code, InstallationChecklistTemplate.sort_order))).scalars().all()
    if not rows:
        for _order, code, _name, _docs, _rules, checklist in STAGE_TEMPLATE:
            for index, label in enumerate(checklist):
                db.add(InstallationChecklistTemplate(tenant_id=tenant_id, stage_code=code, label=label, sort_order=index))
        await db.flush()
        return await _templates(db, tenant_id)
    out: dict[str, list[InstallationChecklistTemplate]] = {code: [] for _o, code, *_ in STAGE_TEMPLATE}
    for row in rows:
        out.setdefault(row.stage_code, []).append(row)
    return out


async def _sync_stage_checklist(db: AsyncSession, stage: InstallationProjectStage,
                                template: list[InstallationChecklistTemplate]) -> None:
    """Tamamlanmamış adımın kontrol listesini şablona eşitler: işaretli kalan maddeler korunur, yeni madde
    işaretsiz eklenir, şablondan çıkan madde kaldırılır. Şablona henüz bağlanmamış eski maddeler adıyla eşlenir."""
    items = (await db.execute(select(InstallationProjectChecklistItem).where(
        InstallationProjectChecklistItem.stage_id == stage.id))).scalars().all()
    by_template = {i.template_item_id: i for i in items if i.template_item_id}
    unlinked = {i.label.strip().casefold(): i for i in items if not i.template_item_id}
    kept: set[UUID] = set()
    for tpl in template:
        item = by_template.get(tpl.id) or unlinked.pop(tpl.label.strip().casefold(), None)
        if item:
            item.template_item_id, item.label, item.sort_order = tpl.id, tpl.label, tpl.sort_order
        else:
            item = InstallationProjectChecklistItem(stage_id=stage.id, label=tpl.label, sort_order=tpl.sort_order,
                                                    template_item_id=tpl.id)
            db.add(item)
            await db.flush()
        kept.add(item.id)
    for item in items:
        if item.id not in kept:
            await db.delete(item)


class TemplateItem(BaseModel):
    id: Optional[UUID] = None
    label: str = SchemaField(min_length=2, max_length=255)


class TemplatesSave(BaseModel):
    # adım kodu → maddeler (sırasıyla)
    stages: dict[str, list[TemplateItem]] = SchemaField(default_factory=dict)


class PhaseDue(BaseModel):
    phase: str
    due: Optional[str] = None  # YYYY-AA-GG; boş = termin kaldırılır


# ── Aşama kayıt listesi ──────────────────────────────────────────────────────

async def _user_name(db: AsyncSession, user_id: Optional[UUID]) -> Optional[str]:
    if not user_id:
        return None
    person = await db.get(User, user_id)
    return (person.full_name or person.email) if person else None


def _day(value: Optional[datetime]) -> Optional[str]:
    return value.strftime("%d.%m.%Y") if value else None


async def _stage_event(db: AsyncSession, project: InstallationProject, stage: InstallationProjectStage, event: str,
                       actor: Optional[User], *, old: Optional[str] = None, new: Optional[str] = None,
                       note: Optional[str] = None, snapshot: bool = False) -> None:
    """Kayıt listesine bir satır ekler (yalnız eklenir). snapshot: adım tamamlanınca o anın fotoğrafı."""
    row = InstallationProjectStageEvent(
        project_id=project.id, stage_id=stage.id, stage_order=stage.stage_order, stage_code=stage.code,
        stage_name=stage.name, phase_name=PHASE_NAMES[_phase_of(stage.code)], event=event,
        actor_id=actor.id if actor else None, actor_name=(actor.full_name or actor.email) if actor else None,
        responsible_user_id=stage.responsible_user_id, responsible_name=await _user_name(db, stage.responsible_user_id),
        planned_end=stage.planned_end, started_at=stage.started_at, completed_at=stage.completed_at,
        old_value=(old or None) and old[:255], new_value=(new or None) and new[:255], note=note,
    )
    if snapshot:
        if stage.completed_at and stage.planned_end:
            row.delay_days = (stage.completed_at.date() - stage.planned_end.date()).days
        done, total = (await db.execute(select(
            func.count().filter(InstallationProjectChecklistItem.is_done == True), func.count())  # noqa: E712
            .where(InstallationProjectChecklistItem.stage_id == stage.id))).one()
        row.checklist_done, row.checklist_total = done, total
        row.document_count = (await db.execute(select(func.count()).where(
            InstallationProjectDocument.stage_id == stage.id))).scalar_one()
        row.note = note if note is not None else stage.note
    db.add(row)


EVENT_LABELS = {
    "completed": "Adım tamamlandı", "started": "Adım başladı", "responsible_changed": "Sorumlu değişti",
    "planned_end_changed": "Planlanan bitiş değişti", "approval_requested": "Onaya gönderildi",
    "approval_rejected": "Onay reddedildi",
}


def _event_row(e: InstallationProjectStageEvent) -> dict:
    return {
        "id": e.id, "project_id": e.project_id, "stage_id": e.stage_id, "stage_order": e.stage_order,
        "stage_code": e.stage_code, "stage_name": e.stage_name, "phase_name": e.phase_name,
        "event": e.event, "event_label": EVENT_LABELS.get(e.event, e.event),
        "actor_name": e.actor_name, "responsible_name": e.responsible_name,
        "planned_end": _iso(e.planned_end), "started_at": _iso(e.started_at), "completed_at": _iso(e.completed_at),
        "delay_days": e.delay_days, "checklist_done": e.checklist_done, "checklist_total": e.checklist_total,
        "document_count": e.document_count, "old_value": e.old_value, "new_value": e.new_value,
        "note": e.note, "created_at": _iso(e.created_at),
    }


# ── Şemalar ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = SchemaField(min_length=2, max_length=200)
    store_id: UUID
    description: Optional[str] = SchemaField(default=None, max_length=4000)
    manager_user_id: Optional[UUID] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    budget: Optional[Decimal] = SchemaField(default=None, ge=0, max_digits=14, decimal_places=2)
    project_type: str = "sogutma"
    member_user_ids: list[UUID] = SchemaField(default_factory=list, max_length=100)


class MembersSave(BaseModel):
    user_ids: list[UUID] = SchemaField(default_factory=list, max_length=100)


class ProductionNumberCreate(BaseModel):
    number: str = SchemaField(min_length=1, max_length=80)
    note: Optional[str] = SchemaField(default=None, max_length=255)


class CostItem(BaseModel):
    category: str
    amount: Optional[Decimal] = SchemaField(default=None, ge=0, max_digits=14, decimal_places=2)
    description: Optional[str] = SchemaField(default=None, max_length=500)


class CostsSave(BaseModel):
    kind: str  # "target" (hedeflenen) | "actual" (gerçekleşen)
    items: list[CostItem] = SchemaField(default_factory=list, max_length=300)


class ProjectUpdate(BaseModel):
    project_type: Optional[str] = None
    name: Optional[str] = SchemaField(default=None, min_length=2, max_length=200)
    description: Optional[str] = SchemaField(default=None, max_length=4000)
    manager_user_id: Optional[UUID] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    budget: Optional[Decimal] = SchemaField(default=None, ge=0, max_digits=14, decimal_places=2)
    status: Optional[str] = None  # yalnızca "cancelled" (iptal)


class BillingSave(BaseModel):
    sale_price: Optional[Decimal] = SchemaField(default=None, ge=0, max_digits=14, decimal_places=2)
    sale_price_includes_vat: bool = False
    vat_rate: Optional[Decimal] = SchemaField(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    invoice_no: Optional[str] = SchemaField(default=None, max_length=40)
    invoice_date: Optional[str] = None
    invoice_due_date: Optional[str] = None
    invoice_amount: Optional[Decimal] = SchemaField(default=None, ge=0, max_digits=14, decimal_places=2)
    invoice_title: Optional[str] = SchemaField(default=None, max_length=200)
    invoice_tax_office: Optional[str] = SchemaField(default=None, max_length=100)
    invoice_tax_no: Optional[str] = SchemaField(default=None, max_length=30)
    invoice_address: Optional[str] = SchemaField(default=None, max_length=500)


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
    # Yönetici firmadaki tüm projeleri, saha kullanıcısı yalnızca atandığı projeleri görür.
    if _is_manager(user):
        tenant_id = await _tenant_id(db, user)
        query = select(InstallationProject).where(InstallationProject.tenant_id == tenant_id)
    else:
        query = select(InstallationProject).where(
            InstallationProject.tenant_id == user.tenant_id,
            InstallationProject.id.in_(select(InstallationProjectMember.project_id).where(
                InstallationProjectMember.user_id == user.id)))
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
    member_counts = dict((await db.execute(select(InstallationProjectMember.project_id, func.count()).where(
        InstallationProjectMember.project_id.in_(ids)).group_by(InstallationProjectMember.project_id))).all())
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
            "project_type": p.project_type, "project_type_label": PROJECT_TYPES.get(p.project_type, p.project_type),
            "member_count": member_counts.get(p.id, 0),
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


def _net_amount(amount: Optional[Decimal], vat_rate: Optional[Decimal], includes_vat: bool) -> Optional[float]:
    """Tutarın KDV hariç karşılığı (KDV dahil girildiyse KDV ayrılır)."""
    if amount is None or amount <= 0:
        return None
    rate = float(vat_rate if vat_rate is not None else DEFAULT_VAT_RATE)
    return float(amount) / (1 + rate / 100) if includes_vat else float(amount)


@router.get("/stats")
async def project_stats(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """İstatistik ekranı için proje ve maliyet özeti (yalnızca yönetici).

    Para toplamlarına iptal edilen projeler katılmaz. "Hedefe oran" yalnızca hem hedeflenen
    hem gerçekleşen maliyeti girilmiş projelerde hesaplanır. Satış tutarları KDV hariçtir.
    Gerçek kâr yalnızca tamamlanan projelerde hesaplanır: fatura tutarı (yoksa satış fiyatı) − gerçekleşen maliyet.
    """
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    projects = (await db.execute(select(InstallationProject).where(
        InstallationProject.tenant_id == tenant_id).order_by(InstallationProject.created_at.desc()))).scalars().all()
    ids = [p.id for p in projects]
    stages = (await db.execute(select(InstallationProjectStage).where(
        InstallationProjectStage.project_id.in_(ids)).order_by(InstallationProjectStage.stage_order))).scalars().all() if ids else []
    costs = (await db.execute(select(InstallationProjectCost).where(
        InstallationProjectCost.project_id.in_(ids)))).scalars().all() if ids else []

    by_project: dict[UUID, list[InstallationProjectStage]] = {}
    for stage in stages:
        by_project.setdefault(stage.project_id, []).append(stage)
    # proje -> tür (target/actual) -> toplam; girilmemişse anahtar hiç oluşmaz
    cost_totals: dict[UUID, dict[str, float]] = {}
    category_totals = {category: {"target": 0.0, "actual": 0.0} for category in COST_CATEGORIES}
    live_ids = {p.id for p in projects if p.status != "cancelled"}
    for cost in costs:
        if cost.amount is None:
            continue
        amount = float(cost.amount)
        entry = cost_totals.setdefault(cost.project_id, {})
        entry[cost.kind] = entry.get(cost.kind, 0.0) + amount
        if cost.project_id in live_ids and cost.category in category_totals and cost.kind in COST_KINDS:
            category_totals[cost.category][cost.kind] += amount
    # Bağlı arıza/bakım iş emirlerinin malzemesi gerçekleşen maliyete otomatik eklenir.
    category_totals[LINKED_WO_COST] = {"target": 0.0, "actual": 0.0}
    for project_id, linked in (await _linked_wo_costs(db, ids)).items():
        if not linked:
            continue
        entry = cost_totals.setdefault(project_id, {})
        entry["actual"] = entry.get("actual", 0.0) + float(linked)
        if project_id in live_ids:
            category_totals[LINKED_WO_COST]["actual"] += float(linked)

    today = utc_now().date()
    counts = {"total": len(projects), "active": 0, "completed": 0, "cancelled": 0, "overdue": 0, "closing_pending": 0}
    money = {"budget_total": 0.0, "target_total": 0.0, "actual_total": 0.0, "missing_target": 0, "over_target": 0,
             "sale_total": 0.0, "sale_count": 0, "realized_revenue": 0.0, "realized_cost": 0.0, "realized_profit": 0.0,
             "realized_count": 0}
    by_type = {key: {"type": key, "label": label, "count": 0, "active": 0, "budget": 0.0, "target": 0.0, "actual": 0.0}
               for key, label in PROJECT_TYPES.items()}
    by_stage = {order: {"order": order, "name": name, "count": 0} for order, _code, name, *_rest in STAGE_TEMPLATE}
    durations: list[float] = []
    rows = []
    for p in projects:
        counts[p.status] = counts.get(p.status, 0) + 1
        st = by_project.get(p.id, [])
        current = next((s for s in st if s.status != "completed"), None)
        totals = cost_totals.get(p.id, {})
        target, actual = totals.get("target"), totals.get("actual")
        budget = float(p.budget) if p.budget is not None else None
        sale = _net_amount(p.sale_price, p.vat_rate, p.sale_price_includes_vat)
        revenue = _net_amount(p.invoice_amount, p.vat_rate, True) or sale
        profit = revenue - actual if p.status == "completed" and revenue is not None and actual is not None else None
        overdue = bool(p.status == "active" and p.target_date and p.target_date.date() < today)
        type_row = by_type.get(p.project_type)
        if type_row:
            type_row["count"] += 1
        if p.status == "cancelled":
            continue
        if p.status == "active":
            counts["overdue"] += int(overdue)
            counts["closing_pending"] += int(any(s.approval_requested_at and s.status != "completed" for s in st))
            if current and current.stage_order in by_stage:
                by_stage[current.stage_order]["count"] += 1
            if target is None:
                money["missing_target"] += 1
            if type_row:
                type_row["active"] += 1
        if p.status == "completed" and p.completed_at and p.start_date:
            durations.append(max((p.completed_at - p.start_date).total_seconds() / 86400, 0))
        money["budget_total"] += budget or 0.0
        money["target_total"] += target or 0.0
        money["actual_total"] += actual or 0.0
        if sale is not None:
            money["sale_total"] += sale
            money["sale_count"] += 1
        if profit is not None:
            money["realized_revenue"] += revenue
            money["realized_cost"] += actual
            money["realized_profit"] += profit
            money["realized_count"] += 1
        if type_row:
            type_row["budget"] += budget or 0.0
            type_row["target"] += target or 0.0
            type_row["actual"] += actual or 0.0
        usage = round(actual / target * 100) if target and actual is not None else None
        if usage is not None and usage > 100:
            money["over_target"] += 1
        rows.append({
            "id": p.id, "name": p.name, "status": p.status,
            "project_type_label": PROJECT_TYPES.get(p.project_type, p.project_type),
            "stages_total": len(st), "stages_done": sum(1 for s in st if s.status == "completed"),
            "current_stage": current.name if current else None, "overdue": overdue,
            "budget": budget, "target": target, "actual": actual, "usage_pct": usage,
            "sale": sale, "profit": profit,
        })
    return {
        "counts": counts,
        "avg_completion_days": round(sum(durations) / len(durations), 1) if durations else None,
        "money": money,
        "by_type": list(by_type.values()),
        "by_stage": list(by_stage.values()),
        "by_category": [{"category": key, "label": label, **category_totals[key]}
                        for key, label in {**COST_CATEGORIES, LINKED_WO_COST: LINKED_WO_COST_LABEL}.items()],
        "projects": rows[:15],
    }


@router.get("/checklist-templates")
async def get_checklist_templates(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Firmanın kontrol listesi şablonu (adım sırasıyla)."""
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    templates = await _templates(db, tenant_id)
    await db.commit()
    return {"stages": [{
        "code": code, "name": name, "phase_name": PHASE_NAMES[_phase_of(code)],
        "items": [{"id": t.id, "label": t.label} for t in templates.get(code, [])],
    } for _order, code, name, *_rest in STAGE_TEMPLATE]}


@router.put("/checklist-templates")
async def save_checklist_templates(body: TemplatesSave, db: AsyncSession = Depends(get_db),
                                   user: User = Depends(get_current_user)) -> dict:
    """Şablonu kaydeder (yalnız yönetici) ve devam eden projelerin tamamlanmamış adımlarına uygular."""
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    current = await _templates(db, tenant_id)
    known = {code for _o, code, *_ in STAGE_TEMPLATE}
    if set(body.stages) - known:
        raise HTTPException(400, "Geçersiz adım.")
    now = utc_now()
    for code, items in body.stages.items():
        labels = [i.label.strip() for i in items]
        if len({label.casefold() for label in labels}) != len(labels):
            raise HTTPException(422, "Aynı adımda aynı madde iki kez yazılamaz.")
        existing = {t.id: t for t in current.get(code, [])}
        keep: set[UUID] = set()
        for index, item in enumerate(items):
            row = existing.get(item.id) if item.id else None
            if row:
                row.label, row.sort_order, row.updated_by, row.updated_at = item.label.strip(), index, user.id, now
            else:
                row = InstallationChecklistTemplate(tenant_id=tenant_id, stage_code=code, label=item.label.strip(),
                                                    sort_order=index, updated_by=user.id, updated_at=now)
                db.add(row)
                await db.flush()
            keep.add(row.id)
        for row_id, row in existing.items():
            if row_id not in keep:
                await db.delete(row)
    await db.flush()
    templates = await _templates(db, tenant_id)
    # Devam eden projelerin tamamlanmamış adımları şablona eşitlenir (tamamlanmış adımlara dokunulmaz).
    open_stages = (await db.execute(
        select(InstallationProjectStage).join(InstallationProject, InstallationProject.id == InstallationProjectStage.project_id)
        .where(InstallationProject.tenant_id == tenant_id, InstallationProject.status == "active",
               InstallationProjectStage.status != "completed", InstallationProjectStage.code.in_(list(body.stages)))
    )).scalars().all()
    for stage in open_stages:
        await _sync_stage_checklist(db, stage, templates.get(stage.code, []))
    await db.commit()
    return {"updated_stages": len(open_stages)}


@router.get("/stage-events")
async def all_stage_events(
    since: Optional[str] = Query(None, description="YYYY-AA-GG; bu tarihten sonraki kayıtlar"),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
) -> list[dict]:
    """Analiz için firmanın tüm aşama kayıtları (yalnız yönetici), en yeni önce; proje adıyla."""
    _require_manager(user)
    tenant_id = await _tenant_id(db, user)
    query = (select(InstallationProjectStageEvent, InstallationProject.name)
             .join(InstallationProject, InstallationProject.id == InstallationProjectStageEvent.project_id)
             .where(InstallationProject.tenant_id == tenant_id))
    if since:
        query = query.where(InstallationProjectStageEvent.created_at >= _parse_date(since))
    rows = (await db.execute(query.order_by(InstallationProjectStageEvent.created_at.desc()).limit(5000))).all()
    return [{**_event_row(event), "project_name": name} for event, name in rows]


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
                    "project_type": project.project_type,
                    "project_type_label": PROJECT_TYPES.get(project.project_type, project.project_type),
                    "is_member": _manager or await _is_member(db, project.id, user.id),
                    "store": {"name": store.name, "no": store.project_no} if store else None},
        "production_numbers": await _production_numbers(db, project.id),
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


async def _set_members(db: AsyncSession, project: InstallationProject, user_ids: list[UUID], actor: User) -> None:
    """Projeye atanan kişileri verilen listeyle eşitler; yeni atananlara bildirim gider.

    Proje sorumlusu her zaman projeye atanmış sayılır; listede olmasa da eklenir, çıkarılamaz.
    """
    wanted = set(user_ids) | ({project.manager_user_id} if project.manager_user_id else set())
    for user_id in wanted:
        person = await db.get(User, user_id)
        if not person or person.tenant_id != project.tenant_id or not person.is_active:
            raise HTTPException(400, "Projeye atanan kişiler bu firmada aktif kullanıcı olmalıdır.")
    existing = {row.user_id: row for row in (await db.execute(select(InstallationProjectMember).where(
        InstallationProjectMember.project_id == project.id))).scalars().all()}
    for user_id, row in existing.items():
        if user_id not in wanted:
            await db.delete(row)
    added = wanted - set(existing)
    for user_id in added:
        db.add(InstallationProjectMember(project_id=project.id, user_id=user_id, added_by=actor.id))
    await _notify_many(db, added - {actor.id}, tenant_id=project.tenant_id, category="project_member_added",
                       title="Projeye atandınız", body=f"{project.name} projesine atandınız.")


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
    if body.project_type not in PROJECT_TYPES:
        raise HTTPException(400, "Proje türü Mağaza, Soğuk oda veya Soğutma olmalıdır.")
    depot = RetailDepot(tenant_id=tenant_id, kind="project", name=f"Proje · {body.name}"[:120], is_active=True)
    db.add(depot)
    await db.flush()
    project = InstallationProject(
        tenant_id=tenant_id, store_id=store.id, depot_id=depot.id, name=body.name.strip(),
        description=body.description, manager_user_id=body.manager_user_id or user.id,
        start_date=_parse_date(body.start_date) or utc_now(), target_date=_parse_date(body.target_date),
        budget=body.budget, project_type=body.project_type, created_by=user.id,
    )
    db.add(project)
    await db.flush()
    await _set_members(db, project, body.member_user_ids, user)
    now = utc_now()
    templates = await _templates(db, tenant_id)
    for order, code, name, _docs, _rules, _default_checklist in STAGE_TEMPLATE:
        stage = InstallationProjectStage(
            project_id=project.id, stage_order=order, code=code, name=name,
            status="in_progress" if order == 1 else "planned", started_at=now if order == 1 else None,
            responsible_user_id=project.manager_user_id,
        )
        db.add(stage)
        await db.flush()
        # Kontrol listesi firmanın şablonundan gelir (yönetici "Kontrol listelerini düzenle" ile değiştirir).
        for tpl in templates.get(code, []):
            db.add(InstallationProjectChecklistItem(stage_id=stage.id, label=tpl.label, sort_order=tpl.sort_order,
                                                    template_item_id=tpl.id))
        if order == 1:
            await _stage_event(db, project, stage, "started", user)
    await db.commit()
    return {"id": project.id, "name": project.name, "depot_id": depot.id}


@router.get("/{project_id}")
async def get_project(project_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    project, manager = await _project_view(db, user, project_id)
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
                | {project.manager_user_id} | {wo.assigned_to_user_id for wo in work_orders}
                | {wo.project_linked_by for wo in work_orders})
    known_users = {u for u in user_ids if u}
    names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(known_users)))).all()) if known_users else {}
    doc_types = {d.doc_type for d in docs}
    stage_names = {s.id: s.name for s in stages}
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
            # Aşamanın kapanması için gereken belge türleri (yüklemede tür seçiminde üstte gösterilir).
            "required_docs": STAGE_BY_CODE.get(stage.code, ([], ()))[0],
            "phase": _phase_of(stage.code), "phase_name": PHASE_NAMES[_phase_of(stage.code)],
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
    if not manager:
        # Saha kullanıcısı katalog birim fiyatını görmez (maliyet kalemlerini görür).
        materials = [{**row, "unit_price": None} for row in materials]
        planned_cost = used_cost = None
    return {
        "id": project.id, "name": project.name, "description": project.description, "status": project.status,
        "project_type": project.project_type,
        "project_type_label": PROJECT_TYPES.get(project.project_type, project.project_type),
        "project_types": PROJECT_TYPES,
        "can_manage": manager,
        "members": await _members(db, project.id),
        "production_numbers": await _production_numbers(db, project.id),
        "costs": await _costs(db, project.id),
        "store": _store_card(store, await db.get(Region, store.region_id) if store else None),
        "billing": await _billing(db, project, store),
        "depot_id": project.depot_id, "manager_user_id": project.manager_user_id,
        "manager_name": names.get(project.manager_user_id),
        "start_date": _iso(project.start_date), "target_date": _iso(project.target_date),
        "budget": project.budget, "created_at": _iso(project.created_at), "completed_at": _iso(project.completed_at),
        "stages": stage_rows, "documents": documents, "doc_types": DOC_TYPES,
        "phases": [{"code": code, "name": name} for code, name in PHASES],
        "materials": materials, "planned_cost": planned_cost, "used_cost": used_cost,
        "work_orders": [_work_order_row(wo, names, stage_names) for wo in work_orders],
    }


@router.put("/{project_id}/phase-due")
async def set_phase_due(project_id: UUID, body: PhaseDue, db: AsyncSession = Depends(get_db),
                        user: User = Depends(get_current_user)) -> dict:
    """Ana aşamanın termini (şimdilik yalnız Üretim ve Montaj): aşamanın bitmemiş adımlarına planlanan bitiş
    olarak yazılır; gecikme uyarısı ve kayıt listesi bu tarihe göre çalışır."""
    project = await _project(db, user, project_id)
    _require_active(project)
    if body.phase != "uretim_montaj":
        raise HTTPException(400, "Termin yalnız Üretim ve Montaj aşamasına girilir.")
    due = _parse_date(body.due)
    stages = [s for s in await _stages(db, project.id) if _phase_of(s.code) == body.phase and s.status != "completed"]
    if not stages:
        raise HTTPException(409, "Üretim ve Montaj aşaması tamamlanmış; termin değiştirilemez.")
    for stage in stages:
        if stage.planned_end != due:
            old = stage.planned_end
            stage.planned_end, stage.overdue_notified_at = due, None
            await _stage_event(db, project, stage, "planned_end_changed", user, old=_day(old) or "—", new=_day(due) or "—",
                               note="Üretim ve Montaj termini")
    project.updated_at = utc_now()
    await db.commit()
    return {"phase": body.phase, "due": _iso(due)}


@router.get("/{project_id}/stage-events")
async def project_stage_events(project_id: UUID, db: AsyncSession = Depends(get_db),
                               user: User = Depends(get_current_user)) -> list[dict]:
    """Projenin aşama kayıt listesi (en yeni önce): tamamlamalar ve sorumlu / tarih / onay değişiklikleri."""
    project, _manager = await _project_view(db, user, project_id)
    rows = (await db.execute(select(InstallationProjectStageEvent).where(
        InstallationProjectStageEvent.project_id == project.id)
        .order_by(InstallationProjectStageEvent.created_at.desc(), InstallationProjectStageEvent.stage_order.desc()))).scalars().all()
    return [_event_row(e) for e in rows]


@router.get("/{project_id}/linkable-work-orders")
async def linkable_work_orders(project_id: UUID, db: AsyncSession = Depends(get_db),
                               user: User = Depends(get_current_user)) -> list[dict]:
    """Projeye bağlanabilecek iş emirleri: aynı mağazanın açık, projesiz ve malzemesi düşülmemiş iş emirleri."""
    project = await _project(db, user, project_id)
    _require_active(project)
    stock_used = select(RetailMovement.id).where(RetailMovement.work_order_id == WorkOrder.id).exists()
    rows = (await db.execute(
        select(WorkOrder).where(
            WorkOrder.tenant_id == project.tenant_id, WorkOrder.project_id == project.store_id,
            WorkOrder.installation_project_id.is_(None), WorkOrder.status.not_in(CLOSED_WORK_ORDER), ~stock_used,
        ).order_by(WorkOrder.created_at.desc()).limit(200)
    )).scalars().all()
    return [{
        "id": wo.id, "title": wo.title, "status": _status_value(wo.status),
        "work_type": _status_value(wo.work_type),
        "work_type_label": WORK_TYPE_LABELS.get(_status_value(wo.work_type), _status_value(wo.work_type)),
        "assigned_to_name": wo.assigned_to_name, "created_at": _iso(wo.created_at), "due_date": _iso(wo.due_date),
    } for wo in rows]


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
        # Yeni proje sorumlusu projeye otomatik atanır (önceki sorumlu atanmış olarak kalır).
        if not await _is_member(db, project.id, manager.id):
            db.add(InstallationProjectMember(project_id=project.id, user_id=manager.id, added_by=user.id))
            if manager.id != user.id:
                await _notify_many(db, {manager.id}, tenant_id=project.tenant_id, category="project_member_added",
                                   title="Projeye atandınız", body=f"{project.name} projesinin sorumlusu olarak atandınız.")
    if updates.get("project_type"):
        if updates["project_type"] not in PROJECT_TYPES:
            raise HTTPException(400, "Proje türü Mağaza, Soğuk oda veya Soğutma olmalıdır.")
        project.project_type = updates["project_type"]
    # Bütçe / teklif "Projelendirme ve teklif" aşamasında girilir; boş gönderilirse silinir.
    if "budget" in updates:
        project.budget = updates["budget"]
    for key in ("name", "description"):
        if key in updates and updates[key] is not None:
            setattr(project, key, updates[key].strip() if isinstance(updates[key], str) else updates[key])
    for key in ("start_date", "target_date"):
        if key in updates:
            setattr(project, key, _parse_date(updates[key]))
    project.updated_at = utc_now()
    await db.commit()
    return {"id": project.id, "status": project.status}


@router.put("/{project_id}/billing")
async def save_billing(project_id: UUID, body: BillingSave, db: AsyncSession = Depends(get_db),
                       user: User = Depends(get_current_user)) -> dict:
    """Satış fiyatı, KDV, fatura no / tarihi / vadesi / tutarı ve fatura tarafı. Yalnızca yönetici girer.

    Fatura çoğu zaman proje kapandıktan sonra kesildiği için kapanmış projede de güncellenebilir;
    yalnızca iptal edilmiş projede değiştirilemez.
    """
    project = await _project(db, user, project_id)
    if project.status == "cancelled":
        raise HTTPException(409, "İptal edilmiş projede değişiklik yapılamaz.")
    # Satış fiyatı ve KDV müşterinin onayladığı tutardır: Müşteri onayı tamamlanınca değiştirilemez.
    # Sonradan çıkan fark fatura tutarına yansıtılır.
    price_changed = (body.sale_price != project.sale_price or body.sale_price_includes_vat != project.sale_price_includes_vat
                     or (body.vat_rate if body.vat_rate is not None else DEFAULT_VAT_RATE)
                     != (project.vat_rate if project.vat_rate is not None else DEFAULT_VAT_RATE))
    if price_changed:
        approval = (await db.execute(select(InstallationProjectStage.status).where(
            InstallationProjectStage.project_id == project.id, InstallationProjectStage.code == "onay"))).scalar_one_or_none()
        if approval == "completed":
            raise HTTPException(409, "Müşteri onayı tamamlandı; satış fiyatı ve KDV artık değiştirilemez. Fark varsa fatura tutarına yansıtın.")
    invoice_date, due_date = _parse_date(body.invoice_date), _parse_date(body.invoice_due_date)
    if invoice_date and due_date and due_date < invoice_date:
        raise HTTPException(422, "Vade tarihi fatura tarihinden önce olamaz.")
    project.sale_price = body.sale_price
    project.sale_price_includes_vat = body.sale_price_includes_vat
    project.vat_rate = body.vat_rate
    project.invoice_no = (body.invoice_no or "").strip() or None
    project.invoice_date, project.invoice_due_date = invoice_date, due_date
    project.invoice_amount = body.invoice_amount
    for field in INVOICE_PARTY_FIELDS:
        setattr(project, field, (getattr(body, field) or "").strip() or None)
    project.updated_at = utc_now()
    await db.commit()
    return await _billing(db, project, await db.get(Project, project.store_id))


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
        if updates["responsible_user_id"] != stage.responsible_user_id:
            old_name = await _user_name(db, stage.responsible_user_id)
            stage.responsible_user_id = updates["responsible_user_id"]
            await _stage_event(db, project, stage, "responsible_changed", user,
                               old=old_name or "Atanmadı", new=await _user_name(db, stage.responsible_user_id) or "Atanmadı")
    if "planned_end" in updates:
        new_end = _parse_date(updates["planned_end"])
        if new_end != stage.planned_end:
            old_end = stage.planned_end
            stage.planned_end = new_end
            stage.overdue_notified_at = None
            await _stage_event(db, project, stage, "planned_end_changed", user,
                               old=_day(old_end) or "—", new=_day(new_end) or "—")
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
            await _stage_event(db, project, stage, "approval_requested", user)
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
            # Kayıt listesi: tamamlama anının fotoğrafı (sorumlu, planlanan bitiş, gecikme, madde ve belge sayısı).
            await _stage_event(db, project, stage, "completed", user, snapshot=True)
            next_stage = next((s for s in stages if s.stage_order == stage.stage_order + 1), None)
            if next_stage:
                next_stage.status, next_stage.started_at = "in_progress", next_stage.started_at or now
                await _stage_event(db, project, next_stage, "started", user)
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
        await _stage_event(db, project, stage, "approval_rejected", user, note=reason or None)
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


@router.put("/{project_id}/members")
async def save_members(project_id: UUID, body: MembersSave, db: AsyncSession = Depends(get_db),
                       user: User = Depends(get_current_user)) -> list[dict]:
    """Projeye atanan kişileri kaydeder (birden çok kişi). Yalnızca yönetici."""
    project = await _project(db, user, project_id)
    _require_active(project)
    await _set_members(db, project, body.user_ids, user)
    project.updated_at = utc_now()
    await db.commit()
    return await _members(db, project.id)


@router.post("/{project_id}/production-numbers", status_code=201)
async def add_production_number(project_id: UUID, body: ProductionNumberCreate, db: AsyncSession = Depends(get_db),
                                user: User = Depends(get_current_user)) -> list[dict]:
    project = await db.get(InstallationProject, project_id)
    tenant_id = await _tenant_id(db, user) if _is_manager(user) else user.tenant_id
    if not project or project.tenant_id != tenant_id:
        raise HTTPException(404, "Proje bulunamadı.")
    if not await _can_enter_production(db, user, project):
        raise HTTPException(403, "Üretim no girmek için projeye atanmış olmalısınız.")
    _require_active(project)
    number = body.number.strip()
    if not number:
        raise HTTPException(422, "Üretim no boş olamaz.")
    duplicate = (await db.execute(select(InstallationProjectProductionNumber.id).where(
        InstallationProjectProductionNumber.project_id == project.id,
        InstallationProjectProductionNumber.number == number).limit(1))).first()
    if duplicate:
        raise HTTPException(409, "Bu üretim no projede zaten kayıtlı.")
    db.add(InstallationProjectProductionNumber(
        project_id=project.id, number=number, note=(body.note or "").strip() or None,
        created_by=user.id, created_by_name=user.full_name))
    project.updated_at = utc_now()
    await db.commit()
    return await _production_numbers(db, project.id)


@router.delete("/production-numbers/{number_id}")
async def delete_production_number(number_id: UUID, db: AsyncSession = Depends(get_db),
                                   user: User = Depends(get_current_user)) -> list[dict]:
    row = await db.get(InstallationProjectProductionNumber, number_id)
    project = await db.get(InstallationProject, row.project_id) if row else None
    tenant_id = await _tenant_id(db, user) if _is_manager(user) else user.tenant_id
    if not row or not project or project.tenant_id != tenant_id:
        raise HTTPException(404, "Üretim no bulunamadı.")
    if not await _can_enter_production(db, user, project):
        raise HTTPException(403, "Üretim no silmek için projeye atanmış olmalısınız.")
    _require_active(project)
    remaining = (await db.execute(select(func.count()).where(
        InstallationProjectProductionNumber.project_id == project.id))).scalar_one()
    stage = (await db.execute(select(InstallationProjectStage).where(
        InstallationProjectStage.project_id == project.id, InstallationProjectStage.code == PRODUCTION_STAGE))).scalars().first()
    if remaining <= 1 and stage and stage.status == "completed":
        raise HTTPException(409, "Üretim adımı tamamlandı; projede en az bir üretim no kalmalıdır.")
    await db.delete(row)
    project.updated_at = utc_now()
    await db.commit()
    return await _production_numbers(db, project.id)


@router.put("/{project_id}/costs")
async def save_costs(project_id: UUID, body: CostsSave, db: AsyncSession = Depends(get_db),
                     user: User = Depends(get_current_user)) -> dict:
    """Hedeflenen veya gerçekleşen maliyet kalemlerini kaydeder. Yönetici ve projeye atananlar girebilir."""
    project, _manager = await _project_view(db, user, project_id)
    _require_active(project)
    if body.kind not in COST_KINDS:
        raise HTTPException(400, "Maliyet türü hedeflenen veya gerçekleşen olmalıdır.")
    now = utc_now()
    # Gönderilen liste o türün (hedeflenen / gerçekleşen) tüm maddeleridir: eskiler silinir, gelenler sırayla yazılır.
    lines = []
    for item in body.items:
        if item.category not in COST_CATEGORIES:
            raise HTTPException(400, "Geçersiz maliyet kalemi.")
        description = (item.description or "").strip() or None
        if item.amount is None and not description:
            continue  # boş satır
        if item.amount is None:
            raise HTTPException(422, f"{COST_CATEGORIES[item.category]}: \"{description}\" maddesinin tutarını girin.")
        lines.append((item.category, item.amount, description))
    current = (await db.execute(select(InstallationProjectCost).where(
        InstallationProjectCost.project_id == project.id, InstallationProjectCost.kind == body.kind))).scalars().all()
    for row in current:
        await db.delete(row)
    await db.flush()
    for order, (category, amount, description) in enumerate(lines):
        db.add(InstallationProjectCost(project_id=project.id, kind=body.kind, category=category, amount=amount,
                                       description=description, sort_order=order, updated_by=user.id, updated_at=now))
    project.updated_at = now
    await db.commit()
    return await _costs(db, project.id)


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
    # Fatura çoğu zaman proje kapandıktan sonra kesilir: yönetici fatura belgesini kapanmış projeye de yükleyebilir.
    if not (doc_type == INVOICE_DOC and _is_manager(user) and project.status == "completed"):
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
