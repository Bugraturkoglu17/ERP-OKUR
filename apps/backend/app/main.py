# ─────────────────────────────────────────────────────────────────────────────
#  OKUR ERP — FastAPI Main Entry Point
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import close_db, init_db
from app.core.exceptions import AppException

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="OKUR Kurumsal Operasyon Sistemi API",
    description="Teknik Soğutma / Saha Operasyon ve Stok ERP",
    version="0.1.0",
    docs_url=None if settings.is_production else "/api/docs",
    openapi_url=None if settings.is_production else "/api/v1/openapi.json",
    redoc_url=None if settings.is_production else "/api/redoc",
)

if settings.is_production and settings.SECRET_KEY.startswith("change-me"):
    raise RuntimeError("A strong SECRET_KEY is required in production.")


# ── Static Files Mount for Local Storage Fallback ──────────────────────────────
from fastapi.staticfiles import StaticFiles
from app.core.storage import get_local_upload_dir
import os

uploads_dir = get_local_upload_dir()
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=uploads_dir), name="uploads")


# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins    = settings.CORS_ORIGINS,
    allow_credentials = True,
    allow_methods    = ["*"],
    allow_headers    = ["*"],
    expose_headers   = ["X-Total-Count"],
)


# ── Exception Handler ─────────────────────────────────────────────────────────
@app.exception_handler(AppException)
async def app_exception_handler(
    request: Request, exc: AppException
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "type": type(exc).__name__},
    )


# ── Lifecycle Events ───────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup() -> None:
    # Yalnızca yerel geliştirme: git pull sonrası boş veritabanı data/ klasöründen dolar.
    if settings.ENV.lower() == "development" and settings.AUTO_SEED_LOCAL_DATA:
        from app.services.local_seed import run_local_bootstrap
        await asyncio.to_thread(run_local_bootstrap)
    await init_db()
    if settings.ENV.lower() == "development" and settings.AUTO_SEED_LOCAL_DATA:
        from app.services.local_test_data import start_local_test_data
        start_local_test_data()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await close_db()


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "env": settings.ENV}


# ── Routers ────────────────────────────────────────────────────────────────────
from app.api.v1.routes import router as v1_router
app.include_router(v1_router, prefix="/api/v1")
