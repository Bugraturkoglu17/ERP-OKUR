# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) principles where applicable.

## [Unreleased]

### Added
- API startup now reads the price-list Excel itself (shared parser `app/services/material_catalog.py`, `openpyxl` added to requirements): edit the Excel, push, and a pulled machine picks up new/changed stock cards on restart; `data/okur-catalog.json` remains only as a fallback.
- `data/` seed files (Excel price list, 4,116 store cards, 247 stock cards, demo stock) and an idempotent startup bootstrap (`app/services/local_seed.py`, dev only, `AUTO_SEED_LOCAL_DATA`): after `git pull` and an API restart a fresh local DB is migrated and filled automatically. Refresh the files with `scripts/export_seed_data.py`.
- Depo & Stok: the direct "Mağazada kullan" action and its endpoints are removed (stock leaves only when a work order is completed). Load/return are replaced by one "Aktarım" dialog (`components/retail-stock/transfer-dialog.tsx`) backed by an atomic `POST /retail-stock/transfer`: choose from/to (main ↔ cep depo), tick products, type quantities or use "Tümü"/"Tümünü aktar"; field workers can only return from their own vehicle. Pickers and search show current stock beside each material.
- Stock list shows 4 items by default (stocked first) and the rest are found by searching; material codes appear as a red OKUR numerator ("110 – BAKIR BORU …") on stock, picker, movements and work-order screens. Demo data script `scripts/seed_demo_data.py` (2 field users, 2 cep depots, random sensible opening stock tagged `DENEME-STOK`); the smoke test now also proves field workers cannot add stock, catalog items or vehicles.
- Stock quantities are whole numbers or at most one decimal (5, 0,5; 0,05 / 0,005 are refused by the API and cannot be typed in the UI). Material pickers are now a searchable bottom sheet that wraps long names on phones (`components/retail-stock/material-picker.tsx`, `lib/quantity.ts`).
- Material catalog import from the price-list Excel (`scripts/import_material_catalog.py`, preview by default, idempotent by code): 247 stock cards with category, unit, brand, spec (tip) and the visible 2026 unit price; labour rows are skipped. New `retail_materials.brand/spec/unit_price` (migration `20261012_01`); price is shown to managers only.
- Work orders are tied to the assignee's cep depo (assignee + depot required on creation). The detail page gets a "Servis Formu" upload and a "Kullanılan Malzemeler" list above the final "Tamamlandı" stage; completing the order (service form required) deducts the listed materials from that depot atomically (409 and nothing committed on shortage), records one `use` movement per line, and notifies the creator and tenant managers (`work_order_stock_deducted`). Reassigning an open order moves it to the new person's depot; orders with stock movements cannot be deleted. New `work_order_materials` table and `/work-orders/{id}/materials` + `/service-forms` endpoints (migration `20261011_01`), verified by `scripts/smoke_work_order_stock.py`.
- Role-based panel architecture for frontend: Admin, Manager, and User panels each with isolated layouts, sidebars, and navigation (`apps/frontend/app/admin/`, `apps/frontend/app/manager/`, `apps/frontend/app/user/`).
- `AuthProvider` / `useAuth` context for centralized mock authentication with localStorage persistence (`apps/frontend/contexts/auth-context.tsx`).
- `RoleGuard` client component for route-level access control with automatic redirect to `/login` or `/403` (`apps/frontend/components/auth/role-guard.tsx`).
- `DevAccountSwitcher` sidebar widget for instant switching between ADMIN, MANAGER, and USER mock accounts without returning to the login page (`apps/frontend/components/dev/account-switcher.tsx`).
- `switchAccount()` helper in `AuthContext` that writes to localStorage without updating React state, preventing the current panel's RoleGuard from triggering a false `/403` redirect during panel switches.
- `/403` page for unauthorized access attempts (`apps/frontend/app/403/`).
- `adminUsers` service layer with full CRUD, mock seed data, and role-filtered access for Manager panel (`apps/frontend/services/adminUsers.ts`).
- `getManagerUsers()` service function returning only USER-role accounts for Manager panel user management.
- Manager panel user management page with create, edit, enable/disable, and delete flows (`apps/frontend/app/manager/kullanicilar/page.tsx`).
- `generateTempPassword()` utility and `resetUserPassword()` service function.
- Axios instance with base URL and 401 interceptor that skips redirect when mock auth is active (`apps/frontend/lib/api.ts`).
- Permission constants and `ROLE_LABEL` map (`apps/frontend/lib/permissions.ts`).

### Changed
- Login page now accepts phone number **or** e-mail address (input type changed from `email` to `text`).
- User data model simplified for small-team use: removed `username`, `department`, `company`, and `manager_id` / `manager_name` fields across all user management pages and the service layer.
- Admin panel user table headers and edit/create modals updated to reflect simplified field set.
- Admin user detail page (`/admin/users/[id]`) cleaned of removed fields.
- New user page (`/admin/users/new`) form reduced to: first name, last name, e-mail (optional), phone, role, active flag, and temporary password.
- All three panel sidebars (Admin/Manager/User) now render only `DevAccountSwitcher` at the bottom — duplicate user-info sections and standalone logout buttons removed.
- `DevAccountSwitcher` displays only the **other** two accounts (not the currently active one) with ArrowRight switch buttons; active account shown with a green-dot indicator.

### Fixed
- False `/403` redirect when switching panels: replaced `loginAs()` + `router.push()` with `switchAccount()` (localStorage-only write) + `window.location.href` full reload, eliminating the race between React state propagation and Next.js client-side navigation.
- TypeScript errors across `admin/users/[id]/page.tsx`, `admin/users/page.tsx`, `admin/users/new/page.tsx`, and `manager/kullanicilar/page.tsx` caused by stale references to removed model fields.
- `redirectByRole()` in login page referenced `isPlatformAdmin` which was removed in a prior refactor; call removed.

---

## [Unreleased — prior]

### Added
- Çok kiracılı sistem yönetimi backend route grubu (`/api/v1/platform/*`).
- Tenant baseline migration (`apps/backend/alembic/versions/20260518_01_tenant_baseline.py`).
- Platform bootstrap utility for admin setup (`apps/backend/app/bootstrap_admin.py`).
- Frontend tenant management page (`apps/frontend/app/platform/tenants/page.tsx`).
- Frontend auth helper additions for platform/admin workflows (`apps/frontend/lib/auth.ts`).
- Tenant-aware email notification rollout migration with outbound dead-letter support (`apps/backend/alembic/versions/20260519_02_notification_rollout.py`).
- Email template set for platform and module notifications (`apps/backend/app/core/email_templates.py`).

### Changed
- API surface updated for platform/project/auth integration and dependency handling:
  - `apps/backend/app/api/v1/routes/auth.py`
  - `apps/backend/app/api/v1/routes/projects.py`
  - `apps/backend/app/core/dependencies.py`
  - `apps/backend/app/core/security.py`
- Backend schema/model layer expanded to support tenant-aware structures:
  - `apps/backend/app/db/models.py`
  - `apps/backend/app/db/schemas.py`
- Tenant mail settings now support notification preferences (`email_notifications_enabled`, `email_digest_mode`, `email_opt_out_templates`) and tenant identity fallback rules.
- Mail dispatch moved to async Celery queue with audit-first flow (`queued/sent/failed/skipped`) and retry-aware dead-letter persistence.
- Module notifications wired to core flows:
  - Project assignment (`project_assignment`)
  - Invoice creation and near-due reminders (`invoice_created`, `invoice_due_soon`)
  - Inventory low stock alerts (`inventory_low_stock`)
- Geliştirici admin parola sıfırlama artık `admin_user_id` ile hedef admin seçimini destekliyor.
- Frontend navigasyonu ve yan menü geliştirici admin akışlarını gösterecek şekilde güncellendi:
  - `apps/frontend/components/layout/sidebar.tsx`
  - `apps/frontend/lib/navigation.ts`
- Frontend API and generated types updated for new endpoints:
  - `apps/frontend/lib/api.ts`
  - `apps/frontend/types/api.ts`
- Platform tenants UI reset form updated to select a specific tenant admin before password reset.

### Fixed
- Frontend production build type-safety fixes across finance, inventory, login, and projects pages.
- Documents download response typing fix for frontend build compatibility.
- Users admin type-safe reload state update fix.
- Hierarchy page type guard fix for customer list mapping.

---

## [0.1.0] - 2026-05-18

### Added
- Initial modular ERP foundation:
  - Auth & RBAC
  - Projects
  - Inventory
  - Finance
- Dockerized infrastructure with PostgreSQL, Redis, FastAPI, and Celery.
- Seed data flow for base roles, users, and domain entities.
