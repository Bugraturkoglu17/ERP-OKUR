# ─────────────────────────────────────────────────────────────────────────────
#  V1 API Router — tüm v1 route'ları burada birleştirilir.
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter

from app.api.v1.routes import (
    auth, projects, inventory, finance, documents, platform,
    procurement, field_reports, whatsapp,
    store_process, service_forms, progress_payments, approvals, invoice_records,
    work_orders, store_assignments, notifications, backup, push,
)

router = APIRouter()

router.include_router(auth.router,              prefix="/auth",              tags=["auth"])
router.include_router(projects.router,          prefix="/projects",          tags=["projects"])
router.include_router(inventory.router,         prefix="/inventory",         tags=["inventory"])
router.include_router(finance.router,           prefix="/finance",           tags=["finance"])
router.include_router(documents.router,         prefix="/documents",         tags=["documents"])
router.include_router(platform.router,          prefix="/platform",          tags=["platform"])
router.include_router(procurement.router,       prefix="/procurement",       tags=["procurement"])
router.include_router(field_reports.router,     prefix="/field-reports",     tags=["field-reports"])
router.include_router(whatsapp.router,          prefix="/whatsapp",          tags=["whatsapp"])
router.include_router(store_process.router,     prefix="/process",           tags=["store-process"])
router.include_router(service_forms.router,     prefix="/service-forms",     tags=["service-forms"])
router.include_router(progress_payments.router, prefix="/progress-payments", tags=["progress-payments"])
router.include_router(approvals.router,         prefix="/approvals",         tags=["approvals"])
router.include_router(invoice_records.router,   prefix="/invoice-records",   tags=["invoice-records"])
router.include_router(work_orders.router,         prefix="/work-orders",       tags=["work-orders"])
router.include_router(work_orders.public_router,  prefix="/public",           tags=["public"])
router.include_router(work_orders.webhook_router, prefix="/webhooks",         tags=["webhooks"])
router.include_router(store_assignments.router,   prefix="",                  tags=["store-assignments"])
router.include_router(notifications.router,       prefix="/notifications",    tags=["notifications"])
router.include_router(backup.router,              prefix="/backup",           tags=["backup"])
router.include_router(push.router,                prefix="/push",             tags=["push"])
