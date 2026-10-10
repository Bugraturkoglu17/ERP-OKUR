# ──────────────────────────────────────────────────────────────────────────────
#  Sismik Mekanik ERP — Backend Dockerfile  (Oracle Cloud ARM uyumlu)
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS builder

WORKDIR /app

# System deps (PostgreSQL driver compilation helpers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Runtime Image ───────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm

WORKDIR /app

# Runtime deps + PostgreSQL client (pg_dump — yerel firma yedekleme sistemi
# için, madde 11). PGDG resmi deposundan EN GÜNCEL major sürüm kurulur —
# Debian bookworm'ün öntanımlı postgresql-client'ı (v15) Neon'un daha yeni
# major sürümlerini dump edemeyebilir; pg_dump sunucudan eşit/daha yeni
# olmalıdır (Neon production şu an PostgreSQL 18.6 — 17 istemcisi "server
# version mismatch" ile reddediyordu). gnupg/lsb-release yalnızca repo
# kurulumu için gerekli, sonra silinir.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    gnupg \
    lsb-release \
    ca-certificates \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
    && apt-get purge -y --auto-remove gnupg lsb-release \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app -d /home/app -m -s /usr/sbin/nologin app

# Copy installed deps from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

RUN mkdir -p /home/app/.postgresql && chown -R app:app /app /home/app

RUN chmod +x /app/entrypoint.sh

USER app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
