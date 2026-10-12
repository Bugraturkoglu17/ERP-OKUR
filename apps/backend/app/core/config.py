# ─────────────────────────────────────────────────────────────────────────────
#  Sismik Mekanik ERP — Environment & Settings Yönetimi
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import os
from typing import Optional
from urllib.parse import urlsplit, unquote

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import PostgresDsn, AnyHttpUrl, model_validator


class Settings(BaseSettings):
    """Tüm uygulama ortam değişkenlerini merkezi olarak yönetir."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Core ────────────────────────────────────────────────────────────────
    ENV:                              str          = "development"
    SECRET_KEY:                       str          = "change-me-secret-key-min-32-chars"
    ACCESS_TOKEN_EXPIRE_MINUTES:      int          = 1440         # 24 saat
    ALGORITHM:                        str          = "HS256"

    # ── Database ────────────────────────────────────────────────────────────
    DATABASE_URL: PostgresDsn = "postgresql+psycopg2://okur_local:change_me@localhost:5432/okur_erp_local"

    # ── Redis / Celery ──────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6381/0"

    # ── CORS ────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    CORS_ORIGIN_REGEX: str = r"^$"

    # ── Object Storage (OCI S3-compatible) ───────────────────────────────────
    AWS_ACCESS_KEY_ID:     str          = ""
    AWS_SECRET_ACCESS_KEY: str          = ""
    OCI_BUCKET_NAME:       str          = "okur-local"
    OCI_NAMESPACE:         str          = ""
    OCI_REGION:            str          = "eu-frankfurt-1"
    OCI_ENDPOINT:          Optional[AnyHttpUrl] = None

    # ── Celery ──────────────────────────────────────────────────────────────
    CELERY_WORKERS: int = 4
    AUTO_CREATE_SCHEMA: bool = True
    # Yerel geliştirmede açılışta migrasyon + data/ klasöründen mağaza/katalog/deneme stoğu yükle.
    AUTO_SEED_LOCAL_DATA: bool = True

    # ── Firma kontrollü yerel yedekleme sistemi ─────────────────────────────
    # pg_dump binary yolu — üretimde (Dockerfile) PATH üzerinden "pg_dump"
    # olarak bulunur; yerel geliştirmede farklı bir kurulum yoluna işaret
    # etmek için .env'de override edilebilir.
    PG_DUMP_PATH: str = "pg_dump"
    # R2/depolama presigned indirme URL'lerinin ömrü — yedekleme akışında
    # kısa tutulur (madde 26: secret hiçbir şekilde frontend'e gitmez).
    BACKUP_PRESIGNED_URL_TTL_SECONDS: int = 600
    # Bir yedekleme kilidinin (Redis) azami ömrü — job kapanmadan süreç
    # çökerse kilit sonsuza kadar takılı kalmasın diye.
    BACKUP_LOCK_TTL_SECONDS: int = 7200

    # ── Web Push (telefon bildirimleri) ──────────────────────────────────────
    # Boş bırakılırsa anahtar çifti ilk kullanımda üretilir ve system_settings
    # tablosunda saklanır (ek kurulum gerekmez). Ortam değişkeni verilirse o
    # kullanılır; ikisi birlikte verilmelidir.
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    # Push servislerinin (Apple/Google) sorun olduğunda ulaşacağı adres.
    VAPID_SUBJECT: str = "mailto:dev@okur.local"
    # Cihaz çevrimdışıysa bildirimin push servisinde bekleyeceği azami süre.
    PUSH_TTL_SECONDS: int = 86400

    # ── Email (Resend) ───────────────────────────────────────────────────────
    RESEND_API_KEY: str = ""
    EMAIL_PROVIDER: str = "resend"
    EMAIL_FROM_DEFAULT: str = "noreply@okur.local"
    EMAIL_FROM_NAME_DEFAULT: str = "OKUR"
    EMAIL_REPLY_TO_DEFAULT: Optional[str] = None
    EMAIL_ASYNC_ENABLED: bool = True
    EMAIL_MAX_RETRIES: int = 3
    EMAIL_RETRY_DELAY_SECONDS: int = 60
    FRONTEND_URL: str = "http://localhost:3001"

    @model_validator(mode="after")
    def enforce_local_isolation(self) -> "Settings":
        """This branch must never connect to the Sismik production database."""
        parsed = urlsplit(str(self.DATABASE_URL))
        database_name = unquote(parsed.path.lstrip("/"))
        if (
            self.ENV != "development"
            or parsed.hostname not in {"localhost", "127.0.0.1", "db", "postgres"}
            or database_name != "okur_erp_local"
        ):
            raise ValueError(
                "Okur local copy requires ENV=development and a separate "
                "okur_erp_local database on localhost or its own Docker network"
            )
        return self

    # ── WhatsApp Cloud API ──────────────────────────────────────────────────
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_BUSINESS_ACCOUNT_ID: str = ""
    WHATSAPP_VERIFY_TOKEN: str = ""
    WHATSAPP_APP_SECRET: str = ""
    WHATSAPP_API_VERSION: str = "v23.0"

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.ENV == "development"


settings = Settings()
