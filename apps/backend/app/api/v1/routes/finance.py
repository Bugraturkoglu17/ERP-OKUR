# ─────────────────────────────────────────────────────────────────────────────
#  V1 — Finance Routes  (Invoice / Expense / Payment / Profitability)
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.core.email_templates import invoice_created_mail, invoice_due_soon_mail
from app.core.emailing import enqueue_tenant_email
from app.core.exceptions import NotFoundError
from app.db.crud import CRUDBase
from app.db.models import Customer, Expense, ExpenseCategory, Invoice, Project, InvoiceItem, Payment, InvoiceStatus, User
from app.db.schemas import (
    InvoiceRead,
    InvoiceCreate,
    ExpenseCreate,
    ExpenseRead,
    PaymentCreate,
    PaymentRead,
)

router = APIRouter()

crud_invoice = CRUDBase(Invoice)
crud_expense = CRUDBase(Expense)


async def _tenant_admin_emails(db: AsyncSession, tenant_id: UUID) -> list[str]:
    result = await db.execute(
        select(User.email).where(
            User.tenant_id == tenant_id,
            User.default_role == "admin",
            User.is_active.is_(True),
        )
    )
    return [email for email in result.scalars().all() if email]


# ── Finance Dashboard — Karlılık Özeti ────────────────────────────────────────

@router.get("/dashboard/profitability/{project_id}")
async def get_project_profitability(
    project_id: UUID,
    db:         AsyncSession = Depends(get_db),
    user:       User = Depends(get_current_user),
) -> dict:
    """
    Tek bir proje için maliyet / gelir / net kâr döner.
    Maliyet → Expenses + gelen malzeme maliyetleri
    Gelir   → Kesilen faturaların toplamı
    """
    project = await db.get(Project, project_id)
    if not project:
        raise NotFoundError(detail="Proje bulunamadı.")
    if not is_platform_admin(user) and str(project.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=403, detail="Bu proje firma kapsamınız dışında.")

    # ── Gelir ──────────────────────────────────────────────────────────────
    revenue_row = (
        await db.execute(
            select(func.coalesce(func.sum(Invoice.grand_total), 0))
            .where(Invoice.project_id == project_id)
            .where(Invoice.status.in_(["paid", "approved", "sent"]))
        )
    ).scalar()

    # ── Maliyet ─────────────────────────────────────────────────────────────
    cost_row = (
        await db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0))
            .where(Expense.project_id == project_id)
        )
    ).scalar()

    revenue = float(revenue_row)
    cost    = float(cost_row)
    net     = revenue - cost
    margin  = (net / revenue * 100) if revenue else 0.0

    return {
        "project_id":    str(project_id),
        "revenue":       round(revenue, 2),
        "cost":          round(cost,    2),
        "net_profit":    round(net,     2),
        "margin_pct":    round(margin,  2),
        "currency":      "TRY",
    }


# ── İcmal Takvimi ────────────────────────────────────────────────────────────

@router.get("/invoices/calendar")
async def get_invoice_calendar(
    from_date:   datetime | None = None,
    to_date:     datetime | None = None,
    status:      str | None      = None,
    customer_id: UUID | None     = None,
    skip:        int             = 0,
    limit:       int             = 100,
    db:          AsyncSession    = Depends(get_db),
    user:        User            = Depends(get_current_user),
) -> dict:
    query = select(Invoice).join(Customer, Invoice.customer_id == Customer.id)

    if not is_platform_admin(user):
        query = query.where(Customer.tenant_id == user.tenant_id)

    if from_date:
        query = query.where(Invoice.issue_date >= from_date)
    if to_date:
        query = query.where(Invoice.issue_date <= to_date)
    if status:
        query = query.where(Invoice.status == status)
    if customer_id:
        query = query.where(Invoice.customer_id == customer_id)

    total_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_query)).scalar()

    result = await db.execute(query.offset(skip).limit(limit))
    invoices = list(result.scalars())

    return {"total": total, "skip": skip, "limit": limit, "items": invoices}


# ── Belge / Fatura CRUD ────────────────────────────────────────────────────────

@router.get("/invoices", response_model=list[InvoiceRead])
async def list_invoices(
    db:   AsyncSession = Depends(get_db),
    skip: int          = 0,
    limit: int         = 100,
    user: User         = Depends(get_current_user),
):
    query = select(Invoice).join(Customer, Invoice.customer_id == Customer.id)
    if not is_platform_admin(user):
        query = query.where(Customer.tenant_id == user.tenant_id)
    result = await db.execute(query.order_by(Invoice.issue_date.desc()).offset(skip).limit(limit))
    return list(result.scalars())


@router.get("/invoices/{invoice_id}", response_model=InvoiceRead)
async def get_invoice(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = await crud_invoice.get(db, invoice_id)
    if not inv:
        raise NotFoundError(detail="Fatura bulunamadı.")
    if not is_platform_admin(user):
        customer = await db.get(Customer, inv.customer_id)
        if not customer or str(customer.tenant_id) != str(user.tenant_id):
            raise HTTPException(status_code=403, detail="Bu fatura firma kapsamınız dışında.")
    return inv


# ── Invoice Creation ──────────────────────────────────────────────────────────

@router.post("/invoices", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    invoice_in: InvoiceCreate,
    db:         AsyncSession = Depends(get_db),
    user:       User = Depends(get_current_user),
) -> Invoice:
    customer = await db.get(Customer, invoice_in.customer_id)
    if not customer:
        raise NotFoundError(detail="Müşteri bulunamadı.")
    if not is_platform_admin(user) and str(customer.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=403, detail="Bu müşteri firma kapsamınız dışında.")

    if invoice_in.project_id:
        project = await db.get(Project, invoice_in.project_id)
        if not project:
            raise NotFoundError(detail="Proje bulunamadı.")
        if str(project.tenant_id) != str(customer.tenant_id):
            raise HTTPException(status_code=400, detail="Proje ve müşteri aynı firmaya ait olmalıdır.")
    issue_date = invoice_in.issue_date
    if issue_date and issue_date.tzinfo is not None:
        issue_date = issue_date.replace(tzinfo=None)

    due_date = invoice_in.due_date
    if due_date and due_date.tzinfo is not None:
        due_date = due_date.replace(tzinfo=None)

    inv = Invoice(
        customer_id=invoice_in.customer_id,
        project_id=invoice_in.project_id,
        invoice_no=invoice_in.invoice_no,
        title=invoice_in.title,
        issue_date=issue_date,
        due_date=due_date,
        subtotal=Decimal(str(invoice_in.subtotal)),
        tax_rate=Decimal(str(invoice_in.tax_rate)),
        tax_amount=Decimal(str(invoice_in.tax_amount)),
        grand_total=Decimal(str(invoice_in.grand_total)),
        status=InvoiceStatus(invoice_in.status),
    )
    db.add(inv)
    await db.flush()

    for item in invoice_in.items:
        db_item = InvoiceItem(
            invoice_id=inv.id,
            description=item.description,
            quantity=Decimal(str(item.quantity)),
            unit_price=Decimal(str(item.unit_price)),
            total_amount=Decimal(str(item.quantity * item.unit_price)),
        )
        db.add(db_item)

    await db.commit()
    await db.refresh(inv)

    tenant_id = customer.tenant_id
    recipients = await _tenant_admin_emails(db, tenant_id)
    if recipients:
        due_date_str = inv.due_date.date().isoformat() if inv.due_date else None
        amount_str = f"{float(inv.grand_total):.2f} TRY"
        created_mail = invoice_created_mail(
            tenant=customer,
            invoice_no=inv.invoice_no,
            title=inv.title,
            due_date=due_date_str,
            amount=amount_str,
        )
        enqueue_tenant_email(
            tenant_id=tenant_id,
            template=created_mail.template,
            to=recipients,
            subject=created_mail.subject,
            text=created_mail.text,
            html=created_mail.html,
        )

        if inv.due_date:
            now_date = datetime.now(timezone.utc).date()
            days_left = (inv.due_date.date() - now_date).days
            if 0 <= days_left <= 7:
                due_mail = invoice_due_soon_mail(
                    tenant=customer,
                    invoice_no=inv.invoice_no,
                    due_date=inv.due_date.date().isoformat(),
                    days_left=days_left,
                    amount=amount_str,
                )
                enqueue_tenant_email(
                    tenant_id=tenant_id,
                    template=due_mail.template,
                    to=recipients,
                    subject=due_mail.subject,
                    text=due_mail.text,
                    html=due_mail.html,
                )

    return inv


# ── Expense CRUD ─────────────────────────────────────────────────────────────

@router.get("/expenses", response_model=list[ExpenseRead])
async def list_expenses(
    project_id: UUID | None = None,
    db:         AsyncSession = Depends(get_db),
    user:       User = Depends(get_current_user),
) -> list[Expense]:
    query = select(Expense).join(Project, Expense.project_id == Project.id)
    if not is_platform_admin(user):
        query = query.where(Project.tenant_id == user.tenant_id)
    if project_id:
        query = query.where(Expense.project_id == project_id)
    query = query.order_by(Expense.expense_date.desc())
    result = await db.execute(query)
    return list(result.scalars())


@router.post("/expenses", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    expense_in: ExpenseCreate,
    db:         AsyncSession = Depends(get_db),
    user:       User = Depends(get_current_user),
) -> Expense:
    project = await db.get(Project, expense_in.project_id)
    if not project:
        raise NotFoundError(detail="Proje bulunamadı.")
    if not is_platform_admin(user) and str(project.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=403, detail="Bu proje firma kapsamınız dışında.")

    exp_date = expense_in.expense_date
    if exp_date and exp_date.tzinfo is not None:
        exp_date = exp_date.replace(tzinfo=None)

    exp = Expense(
        project_id=expense_in.project_id,
        category=ExpenseCategory(expense_in.category),
        description=expense_in.description,
        amount=Decimal(str(expense_in.amount)),
        quantity=Decimal(str(expense_in.quantity)) if expense_in.quantity else None,
        expense_date=exp_date,
        stock_movement_id=expense_in.stock_movement_id,
    )
    db.add(exp)
    await db.commit()
    await db.refresh(exp)
    return exp


# ── Payment CRUD ─────────────────────────────────────────────────────────────

@router.get("/payments", response_model=list[PaymentRead])
async def list_payments(
    invoice_id: UUID | None = None,
    db:         AsyncSession = Depends(get_db),
    user:       User = Depends(get_current_user),
) -> list[Payment]:
    query = select(Payment).outerjoin(Invoice, Payment.invoice_id == Invoice.id).outerjoin(Customer, Invoice.customer_id == Customer.id)
    if not is_platform_admin(user):
        query = query.where(Customer.tenant_id == user.tenant_id)
    if invoice_id:
        query = query.where(Payment.invoice_id == invoice_id)
    query = query.order_by(Payment.payment_date.desc())
    result = await db.execute(query)
    return list(result.scalars())


@router.post("/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
async def create_payment(
    payment_in: PaymentCreate,
    db:         AsyncSession = Depends(get_db),
    user:       User = Depends(get_current_user),
) -> Payment:
    pay_date = payment_in.payment_date
    if pay_date and pay_date.tzinfo is not None:
        pay_date = pay_date.replace(tzinfo=None)

    pay = Payment(
        invoice_id=payment_in.invoice_id,
        direction=payment_in.direction,
        amount=Decimal(str(payment_in.amount)),
        payment_method=payment_in.payment_method,
        reference_no=payment_in.reference_no,
        payment_date=pay_date,
        notes=payment_in.notes,
    )
    db.add(pay)

    if payment_in.invoice_id:
        inv = await db.get(Invoice, payment_in.invoice_id)
        if not inv:
            raise NotFoundError(detail="Fatura bulunamadı.")
        customer = await db.get(Customer, inv.customer_id)
        if not customer:
            raise NotFoundError(detail="Müşteri bulunamadı.")
        if not is_platform_admin(user) and str(customer.tenant_id) != str(user.tenant_id):
            raise HTTPException(status_code=403, detail="Bu fatura firma kapsamınız dışında.")
        inv.paid_amount = (inv.paid_amount or Decimal(0)) + Decimal(str(payment_in.amount))
        if inv.paid_amount >= inv.grand_total:
            inv.status = InvoiceStatus.PAID
            inv.paid_at = payment_in.payment_date
        else:
            inv.status = InvoiceStatus.APPROVED
        db.add(inv)

    await db.commit()
    await db.refresh(pay)
    return pay
