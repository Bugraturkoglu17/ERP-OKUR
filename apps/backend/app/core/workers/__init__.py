# ─────────────────────────────────────────────────────────────────────────────
#  Sismik Mekanik ERP — Celery Application
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import os

from celery import Celery

REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6381/0")
CELERY_WORKER_POOL: str = os.getenv("CELERY_WORKER_POOL", "prefork")

celery_app = Celery(
    "okur_erp_local",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.core.workers.tasks",
    ],
)

celery_app.conf.update(
    task_serializer    = "json",
    accept_content     = ["json"],
    result_serializer  = "json",
    timezone           = "Europe/Istanbul",
    enable_utc         = True,
    task_track_started = True,
    task_time_limit    = 30 * 60,   # 30 dakika max çalışma süresi
    worker_pool        = CELERY_WORKER_POOL,
    worker_prefetch_multiplier = 1,
    broker_connection_retry_on_startup = True,
)
