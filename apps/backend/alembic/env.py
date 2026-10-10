# ──────────────────────────────────────────────────────────────────────────────
#  Alembic Migration Environment
#  Sismik Mekanik ERP
#
#  Bu dosya, veritabanı migration sürecini başlatır ve yapılandırır.
#  Alembic, bu env.py'ı okuyarak SQLModel modellerinden migration oluşturur.
# ──────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel

# ── Proje kök dizinini sys.path'e ekleyerek import'ları yapılandır ────────────
sys.path.insert(0, ".")          # apps/backend dizininden çalıştırılıyor

from app.core.config import settings  # noqa: E402  — DATABASE_URL
from app.db import models as _models  # noqa: E402,F401 - ensure model import side effects

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Veritabanı URL'sini Pydantic Settings'den al (INI dosyasındakini ezer)
db_url = str(settings.DATABASE_URL).replace("+asyncpg", "+psycopg2")
config.set_main_option("sqlalchemy.url", db_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for 'autogenerate' support
# SQLModel modellerinin tüm tablo tanımlamaları burada toplanır.
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Migration'ı SQL üretmek için offline (veritabanı bağlantısı olmadan) çalıştır."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,          # Sütun tipi değişiklikleri algıla
        compare_server_default=True,# Varsayılan değer değişikliklerini algıla
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Migration'ı canlı veritabanı üzerinde çalıştır."""
    connectable: Engine = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
