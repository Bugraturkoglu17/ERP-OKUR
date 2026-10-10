# Okur ERP — yerel çalışma kopyası

Bu depo, Sismik ERP'nin kodundan alınmış **ayrı, yalnız yerel geliştirme**
kopyasıdır. Marka ve iş akışları henüz Okur için özelleştirilmedi; aşağıdaki
eski Sismik açıklamaları bu geçiş döneminde kaynak referansıdır.
Yerel veritabanında yalnız yeni yönetici hesabı vardır; canlı Sismik verileri
aktarılmamıştır.

Okur arayüzü `localhost:3001`, API'si `localhost:8001` ve veritabanı
`okur_erp_local` kullanır. Canlı Sismik veritabanına ve dosya deposuna bu
uygulamadan bağlantı yasaktır. Kurulum için [OKUR_LOCAL_SETUP.md](OKUR_LOCAL_SETUP.md)
dosyasına bakın. Gerçek veri, kullanıcı şifreleri ve ortam anahtarları GitHub'a
yüklenmez.

# Sismik kaynak proje notları

Sismik Mekanik ERP is a modular construction ERP platform for managing multi-branch field operations across **projects, documents/drawings, inventory, finance, and role-based access**.

The product direction is built around a practical hierarchy for chain-store projects:

`Customer -> Region -> Branch -> Project`

This model reduces coordination friction between headquarters, field teams, warehouse, and finance operations.

## Tech Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend:** FastAPI, SQLModel/SQLAlchemy 2.0
- **Database:** PostgreSQL
- **Queue/Cache:** Redis + Celery
- **Object Storage:** OCI Object Storage (S3-compatible via boto3)
- **Infra:** Docker Compose

---

## Repository Structure

```text
apps/
  backend/        # FastAPI API, models, schemas, business logic
  frontend/       # Next.js UI
infrastructure/
  docker-compose.yml
  init-scripts/
README.md
CHANGELOG.md
```

---

## Core Modules

- **Auth & RBAC**
  - JWT auth, role-scoped navigation, and route protection.
  - Discipline-aware access boundaries for admin, field, and warehouse roles.
- **Projects & Site Management**
  - `Customer -> Region -> Branch -> Project` hierarchy.
  - Project cards with scope, schedule, and assignment context.
  - Status lifecycle support for discovery, proposal, execution, progress-payment, and delivery phases.
- **Documents & Drawing Management**
  - Project-based foldering and revision/version history.
  - Upload + signed URL download flows over OCI object storage.
  - Field-friendly access to the latest revision of drawing packages.
- **Inventory & Warehouse Management**
  - Multi-warehouse structure (central, return/scrap, and site-virtual warehouses).
  - Stock movements and transfer records between project and central warehouses.
  - Material/warehouse CRUD with history-preserving soft-delete patterns.
- **Finance, Progress Payment, and Profitability**
  - Invoice/expense endpoints and profitability data foundations.
  - Progress-payment oriented workflows to support period summaries and cashflow follow-up.
- **Platform Tenant Administration**
  - Multi-tenant administration routes and frontend tenant management view.
  - Baseline tenant migration and bootstrap support for platform-level setup.
  - Tenant-scoped mail identity, notification preferences, and audit/dead-letter visibility.

---

## Notification & Email Flow

- **Provider:** Resend
- **Dispatch model:** API actions enqueue mail payloads; Celery worker performs delivery.
- **Audit model:** Every attempt is recorded in `outbound_email_audits` with status lifecycle: `queued`, `sent`, `failed`, `skipped`.
- **Failure handling:** Worker retries failed sends; max-retry failures are persisted to `outbound_email_dead_letters`.

### Tenant mail policy

- Tenant identity mode supports:
  - `platform` (default/fallback sender)
  - `tenant_domain` (used only when tenant domain is verified and `from_email` is valid)
- Notification preferences are enforced before provider send:
  - `email_notifications_enabled`
  - `email_digest_mode` (`immediate` or `daily`)
  - `email_opt_out_templates`

When preferences block delivery, mail is marked as `skipped` (business flow still continues).

### Current notification triggers

- Geliştirici admin oluşturma ve admin parola sıfırlama
- Tenant status updates
- Project user assignment
- Invoice creation
- Invoice due-soon reminder (0-7 days)
- Inventory low-stock alerts

---

## Quick Start (Docker)

### 1) Prerequisites

- Docker + Docker Compose

### 2) Start services

From project root:

```bash
docker compose -f infrastructure/docker-compose.yml up -d --build
```

### 3) Service endpoints

- API: `http://localhost:8000`
- API docs: `http://localhost:8000/api/docs`
- Frontend (if started locally): `http://localhost:3000`
- pgAdmin (optional profile): `http://localhost:5050`

---

## Local Development

### Backend

```bash
cd apps/backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

Environment variable for frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## Important Integration Notes

### Documents versioning schema

If your DB was created before `parent_id` support, ensure:

```sql
ALTER TABLE documents ADD COLUMN parent_id UUID REFERENCES documents(id);
CREATE INDEX ix_documents_parent_id ON documents (parent_id);
```

### Multipart upload with Axios

`FormData` requests must not be forced into JSON headers. Use multipart-aware request config in frontend API helper.

---

## API Overview

Base URL: `/api/v1`

Key route groups:

- `/auth/*`
- `/platform/*`
- `/projects/*`
- `/inventory/*`
- `/documents/*`
- `/finance/*`

OpenAPI JSON:

```text
GET /api/v1/openapi.json
```

---

## Development Standards

- Keep route structure flat and predictable under `apps/frontend/app/*`.
- Avoid committing runtime artifacts (`__pycache__`, build outputs, local binaries).
- Prefer soft-delete where business history must be preserved.

---

## License

Internal / Proprietary (Sismik Mekanik).
