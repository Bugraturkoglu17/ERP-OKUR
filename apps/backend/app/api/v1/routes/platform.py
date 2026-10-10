from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.core.email_templates import (
    tenant_admin_password_reset_mail,
    tenant_admin_provisioned_mail,
    tenant_status_changed_mail,
)
from app.core.emailing import enqueue_tenant_email
from app.core.security import hash_password
from app.db.models import (
    PlatformAdminAction,
    PlatformPlan,
    PlatformSubscription,
    PlatformTenantSettings,
    Role,
    Tenant,
    TenantStatus,
    User,
    UserRole,
    UserSecurityPolicy,
)
from app.db.schemas import (
    PlatformAuditRead,
    PlatformPlanCreate,
    PlatformPlanRead,
    PlatformSubscriptionAssignRequest,
    PlatformSubscriptionRead,
    TenantAdminProvisionRequest,
    TenantAdminRead,
    TenantAdminResetRequest,
    TenantAdminUpdateRequest,
    TenantCreate,
    TenantRead,
    TenantSettingsRead,
    TenantSettingsUpsert,
    TenantUpdate,
    UserRead,
)

router = APIRouter()


def _parse_opt_out_templates(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except json.JSONDecodeError:
        return []
    return []


VALID_TENANT_STATUSES = {"trial", "active", "suspended", "archived"}


def _ensure_platform_admin(user: User) -> None:
    if not is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Sadece geliştirici admin erişebilir.")


def _normalize_tenant_status(value: str) -> TenantStatus:
    key = value.strip().lower()
    if key not in VALID_TENANT_STATUSES:
        raise HTTPException(status_code=400, detail="Geçersiz tenant durumu.")
    return TenantStatus(key)


async def _log_action(
    db: AsyncSession,
    actor: User,
    action: str,
    tenant_id: UUID | None = None,
    target_user_id: UUID | None = None,
    details: dict | None = None,
) -> None:
    event = PlatformAdminAction(
        actor_user_id=actor.id,
        action=action,
        tenant_id=tenant_id,
        target_user_id=target_user_id,
        details=json.dumps(details or {}, ensure_ascii=False),
    )
    db.add(event)


async def _get_or_create_user_policy(db: AsyncSession, user_id: UUID) -> UserSecurityPolicy:
    policy = await db.get(UserSecurityPolicy, user_id)
    if policy:
        return policy
    policy = UserSecurityPolicy(user_id=user_id, force_password_change=False)
    db.add(policy)
    await db.flush()
    return policy


@router.get("/tenants", response_model=list[TenantRead], tags=["platform"])
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Tenant]:
    _ensure_platform_admin(user)
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    return list(result.scalars())


@router.post("/tenants", response_model=TenantRead, status_code=status.HTTP_201_CREATED, tags=["platform"])
async def create_tenant(
    payload: TenantCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Tenant:
    _ensure_platform_admin(user)

    normalized_code = payload.code.lower().strip()
    existing = await db.execute(select(Tenant).where((Tenant.name == payload.name) | (Tenant.code == normalized_code)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tenant adı veya kodu zaten mevcut.")

    tenant = Tenant(
        name=payload.name.strip(),
        code=normalized_code,
        logo_url=payload.logo_url,
        status=TenantStatus.TRIAL,
        is_active=True,
    )
    db.add(tenant)
    await db.flush()
    await _log_action(db, user, "tenant.create", tenant_id=tenant.id, details={"name": tenant.name, "code": tenant.code})
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.patch("/tenants/{tenant_id}", response_model=TenantRead, tags=["platform"])
async def update_tenant(
    tenant_id: UUID,
    payload: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Tenant:
    _ensure_platform_admin(user)

    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı.")

    changed: dict[str, object] = {}

    if payload.name is not None:
        tenant.name = payload.name.strip()
        changed["name"] = tenant.name

    if payload.code is not None:
        normalized_code = payload.code.lower().strip()
        duplicate = await db.execute(select(Tenant).where(Tenant.code == normalized_code, Tenant.id != tenant_id))
        if duplicate.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Tenant kodu zaten kullanımda.")
        tenant.code = normalized_code
        changed["code"] = tenant.code

    if payload.logo_url is not None:
        tenant.logo_url = payload.logo_url
        changed["logo_url"] = payload.logo_url

    if payload.status is not None:
        tenant.status = _normalize_tenant_status(payload.status)
        changed["status"] = tenant.status.value

    if payload.is_active is not None:
        tenant.is_active = payload.is_active
        changed["is_active"] = payload.is_active

    db.add(tenant)
    await _log_action(db, user, "tenant.update", tenant_id=tenant.id, details=changed)

    should_notify_status_change = payload.status is not None or payload.is_active is not None
    if should_notify_status_change:
        admin_rows = await db.execute(
            select(User).where(User.tenant_id == tenant.id, User.default_role == "admin", User.is_active.is_(True))
        )
        recipients = [u.email for u in admin_rows.scalars().all() if u.email]
        if recipients:
            mail = tenant_status_changed_mail(
                tenant=tenant,
                status=tenant.status.value,
                is_active=tenant.is_active,
            )
            enqueue_tenant_email(
                tenant_id=tenant.id,
                template=mail.template,
                to=recipients,
                subject=mail.subject,
                text=mail.text,
                html=mail.html,
            )

    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.put("/tenants/{tenant_id}/settings", response_model=TenantSettingsRead, tags=["platform"])
async def upsert_tenant_settings(
    tenant_id: UUID,
    payload: TenantSettingsUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TenantSettingsRead:
    _ensure_platform_admin(user)

    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı.")

    settings = await db.get(PlatformTenantSettings, tenant_id)
    if not settings:
        settings = PlatformTenantSettings(tenant_id=tenant_id)

    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "email_branding":
            setattr(settings, key, json.dumps(value, ensure_ascii=False) if value is not None else None)
            continue
        if key == "email_opt_out_templates":
            setattr(settings, key, json.dumps(value or [], ensure_ascii=False))
            continue
        setattr(settings, key, value)

    db.add(settings)
    await _log_action(db, user, "tenant.settings.upsert", tenant_id=tenant_id, details=payload.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(settings)
    return TenantSettingsRead(
        tenant_id=settings.tenant_id,
        tax_no=settings.tax_no,
        sector=settings.sector,
        country=settings.country,
        theme_color=settings.theme_color,
        domain=settings.domain,
        subdomain=settings.subdomain,
        email_mode=settings.email_mode,
        from_name=settings.from_name,
        from_email=settings.from_email,
        reply_to=settings.reply_to,
        email_domain_verified=settings.email_domain_verified,
        email_provider_identity_id=settings.email_provider_identity_id,
        email_branding=json.loads(settings.email_branding) if settings.email_branding else None,
        email_notifications_enabled=settings.email_notifications_enabled,
        email_digest_mode=settings.email_digest_mode,
        email_opt_out_templates=_parse_opt_out_templates(settings.email_opt_out_templates),
        updated_at=settings.updated_at,
    )


@router.get("/tenants/{tenant_id}/settings", response_model=TenantSettingsRead, tags=["platform"])
async def get_tenant_settings(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TenantSettingsRead:
    _ensure_platform_admin(user)

    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı.")

    settings = await db.get(PlatformTenantSettings, tenant_id)
    if settings:
        return TenantSettingsRead(
            tenant_id=settings.tenant_id,
            tax_no=settings.tax_no,
            sector=settings.sector,
            country=settings.country,
            theme_color=settings.theme_color,
            domain=settings.domain,
            subdomain=settings.subdomain,
            email_mode=settings.email_mode,
            from_name=settings.from_name,
            from_email=settings.from_email,
            reply_to=settings.reply_to,
            email_domain_verified=settings.email_domain_verified,
            email_provider_identity_id=settings.email_provider_identity_id,
            email_branding=json.loads(settings.email_branding) if settings.email_branding else None,
            email_notifications_enabled=settings.email_notifications_enabled,
            email_digest_mode=settings.email_digest_mode,
            email_opt_out_templates=_parse_opt_out_templates(settings.email_opt_out_templates),
            updated_at=settings.updated_at,
        )

    settings = PlatformTenantSettings(tenant_id=tenant_id)
    db.add(settings)
    await db.commit()
    await db.refresh(settings)
    return TenantSettingsRead(
        tenant_id=settings.tenant_id,
        tax_no=settings.tax_no,
        sector=settings.sector,
        country=settings.country,
        theme_color=settings.theme_color,
        domain=settings.domain,
        subdomain=settings.subdomain,
        email_mode=settings.email_mode,
        from_name=settings.from_name,
        from_email=settings.from_email,
        reply_to=settings.reply_to,
        email_domain_verified=settings.email_domain_verified,
        email_provider_identity_id=settings.email_provider_identity_id,
        email_branding=json.loads(settings.email_branding) if settings.email_branding else None,
        email_notifications_enabled=settings.email_notifications_enabled,
        email_digest_mode=settings.email_digest_mode,
        email_opt_out_templates=_parse_opt_out_templates(settings.email_opt_out_templates),
        updated_at=settings.updated_at,
    )


@router.post("/tenants/provision-admin", response_model=UserRead, status_code=status.HTTP_201_CREATED, tags=["platform"])
async def provision_tenant_admin(
    payload: TenantAdminProvisionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    _ensure_platform_admin(user)

    tenant = await db.get(Tenant, payload.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı.")
    if not tenant.is_active or tenant.status in {TenantStatus.SUSPENDED, TenantStatus.ARCHIVED}:
        raise HTTPException(status_code=400, detail="Pasif tenant için admin provision işlemi yapılamaz.")

    normalized_email = payload.email.lower().strip()
    existing = await db.execute(select(User).where(User.email == normalized_email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kullanımda.")

    admin_user = User(
        tenant_id=tenant.id,
        email=normalized_email,
        hashed_password=hash_password(payload.temporary_password),
        full_name=payload.full_name,
        default_role="admin",
        is_active=True,
        is_verified=True,
    )
    db.add(admin_user)
    await db.flush()

    role = (await db.execute(select(Role).where(Role.name == "admin"))).scalar_one_or_none()
    if role:
        db.add(UserRole(user_id=admin_user.id, role_id=role.id))

    policy = await _get_or_create_user_policy(db, admin_user.id)
    policy.force_password_change = True
    db.add(policy)

    await _log_action(
        db,
        user,
        "tenant.admin.provision",
        tenant_id=tenant.id,
        target_user_id=admin_user.id,
        details={"email": normalized_email},
    )

    provision_mail = tenant_admin_provisioned_mail(
        tenant=tenant,
        full_name=admin_user.full_name,
        temporary_password=payload.temporary_password,
    )
    enqueue_tenant_email(
        tenant_id=tenant.id,
        template=provision_mail.template,
        to=[admin_user.email],
        subject=provision_mail.subject,
        text=provision_mail.text,
        html=provision_mail.html,
    )

    await db.commit()
    await db.refresh(admin_user)
    return admin_user


@router.get("/tenants/{tenant_id}/admins", response_model=list[TenantAdminRead], tags=["platform"])
async def list_tenant_admins(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TenantAdminRead]:
    _ensure_platform_admin(user)

    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı.")

    result = await db.execute(
        select(User).where(User.tenant_id == tenant_id, User.default_role == "admin").order_by(User.created_at.desc())
    )
    admins = list(result.scalars())

    payload: list[TenantAdminRead] = []
    for admin in admins:
        policy = await db.get(UserSecurityPolicy, admin.id)
        payload.append(TenantAdminRead(
            **UserRead.model_validate(admin).model_dump(exclude={"force_password_change"}),
            force_password_change=bool(policy and policy.force_password_change),
        ))
    return payload


@router.patch("/admin-users/{user_id}", response_model=TenantAdminRead, tags=["platform"])
async def update_tenant_admin_user(
    user_id: UUID,
    payload: TenantAdminUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TenantAdminRead:
    _ensure_platform_admin(user)

    admin_user = await db.get(User, user_id)
    if not admin_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if admin_user.default_role != "admin":
        raise HTTPException(status_code=400, detail="Yalnız tenant admin kullanıcıları güncellenebilir.")

    changes = payload.model_dump(exclude_unset=True)
    if payload.full_name is not None:
        full_name = payload.full_name.strip()
        if not full_name:
            raise HTTPException(status_code=400, detail="Ad soyad boş olamaz.")
        admin_user.full_name = full_name
        changes["full_name"] = full_name

    if payload.is_active is not None:
        admin_user.is_active = payload.is_active
        db.add(admin_user)

    policy = await _get_or_create_user_policy(db, admin_user.id)
    if payload.force_password_change is not None:
        policy.force_password_change = payload.force_password_change
        db.add(policy)

    await _log_action(
        db,
        user,
        "tenant.admin.update",
        tenant_id=admin_user.tenant_id,
        target_user_id=admin_user.id,
        details=changes,
    )
    await db.commit()
    await db.refresh(admin_user)

    return TenantAdminRead(
        **UserRead.model_validate(admin_user).model_dump(exclude={"force_password_change"}),
        force_password_change=policy.force_password_change,
    )


@router.post("/tenants/{tenant_id}/reset-admin-password", response_model=TenantAdminRead, tags=["platform"])
async def reset_tenant_admin_password(
    tenant_id: UUID,
    payload: TenantAdminResetRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TenantAdminRead:
    _ensure_platform_admin(user)

    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı.")
    if not tenant.is_active or tenant.status in {TenantStatus.SUSPENDED, TenantStatus.ARCHIVED}:
        raise HTTPException(status_code=400, detail="Pasif tenant için parola sıfırlanamaz.")

    admin_user: User | None = None
    if payload.admin_user_id is not None:
        candidate = await db.get(User, payload.admin_user_id)
        if not candidate:
            raise HTTPException(status_code=404, detail="Yönetici kullanıcı bulunamadı.")
        if candidate.tenant_id != tenant_id or candidate.default_role != "admin":
            raise HTTPException(status_code=400, detail="Seçilen kullanıcı bu firmanın yöneticisi değil.")
        admin_user = candidate
    else:
        result = await db.execute(
            select(User)
            .where(User.tenant_id == tenant_id)
            .where(User.default_role == "admin")
            .order_by(User.created_at.asc())
        )
        admin_user = result.scalars().first()

    if not admin_user:
        raise HTTPException(status_code=404, detail="Tenant admin kullanıcısı bulunamadı.")

    admin_user.hashed_password = hash_password(payload.temporary_password)
    admin_user.is_verified = True
    db.add(admin_user)

    policy = await _get_or_create_user_policy(db, admin_user.id)
    policy.force_password_change = payload.force_password_change
    db.add(policy)

    await _log_action(
        db,
        user,
        "tenant.admin.password.reset",
        tenant_id=tenant.id,
        target_user_id=admin_user.id,
        details={"force_password_change": payload.force_password_change},
    )

    reset_mail = tenant_admin_password_reset_mail(
        tenant=tenant,
        full_name=admin_user.full_name,
        temporary_password=payload.temporary_password,
    )
    enqueue_tenant_email(
        tenant_id=tenant.id,
        template=reset_mail.template,
        to=[admin_user.email],
        subject=reset_mail.subject,
        text=reset_mail.text,
        html=reset_mail.html,
    )

    await db.commit()
    await db.refresh(admin_user)
    return TenantAdminRead(
        **UserRead.model_validate(admin_user).model_dump(exclude={"force_password_change"}),
        force_password_change=policy.force_password_change,
    )


@router.post("/plans", response_model=PlatformPlanRead, status_code=201, tags=["platform"])
async def create_plan(
    payload: PlatformPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlatformPlanRead:
    _ensure_platform_admin(user)

    normalized_code = payload.code.lower().strip()
    duplicate = await db.execute(select(PlatformPlan).where(PlatformPlan.code == normalized_code))
    if duplicate.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Plan kodu zaten mevcut.")

    plan = PlatformPlan(
        code=normalized_code,
        name=payload.name.strip(),
        max_users=payload.max_users,
        storage_limit_gb=payload.storage_limit_gb,
        modules=json.dumps(payload.modules or []),
    )
    db.add(plan)
    await db.flush()
    await _log_action(db, user, "plan.create", details={"code": plan.code})
    await db.commit()
    await db.refresh(plan)

    return PlatformPlanRead(
        id=plan.id,
        code=plan.code,
        name=plan.name,
        max_users=plan.max_users,
        storage_limit_gb=plan.storage_limit_gb,
        modules=json.loads(plan.modules or "[]"),
        is_active=plan.is_active,
        created_at=plan.created_at,
    )


@router.get("/plans", response_model=list[PlatformPlanRead], tags=["platform"])
async def list_plans(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PlatformPlanRead]:
    _ensure_platform_admin(user)

    result = await db.execute(select(PlatformPlan).order_by(PlatformPlan.created_at.desc()))
    rows = list(result.scalars())
    return [
        PlatformPlanRead(
            id=row.id,
            code=row.code,
            name=row.name,
            max_users=row.max_users,
            storage_limit_gb=row.storage_limit_gb,
            modules=json.loads(row.modules or "[]"),
            is_active=row.is_active,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/subscriptions/assign", response_model=PlatformSubscriptionRead, status_code=201, tags=["platform"])
async def assign_subscription(
    payload: PlatformSubscriptionAssignRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PlatformSubscription:
    _ensure_platform_admin(user)

    tenant = await db.get(Tenant, payload.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant bulunamadı.")

    plan = await db.get(PlatformPlan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan bulunamadı.")

    sub = PlatformSubscription(
        tenant_id=tenant.id,
        plan_id=plan.id,
        status=payload.status,
        ends_at=payload.ends_at,
    )
    db.add(sub)
    await db.flush()
    await _log_action(db, user, "subscription.assign", tenant_id=tenant.id, details={"plan_id": str(plan.id), "status": payload.status})
    await db.commit()
    await db.refresh(sub)
    return sub


@router.get("/subscriptions", response_model=list[PlatformSubscriptionRead], tags=["platform"])
async def list_subscriptions(
    tenant_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PlatformSubscription]:
    _ensure_platform_admin(user)

    query = select(PlatformSubscription).order_by(PlatformSubscription.created_at.desc())
    if tenant_id:
        query = query.where(PlatformSubscription.tenant_id == tenant_id)
    result = await db.execute(query)
    return list(result.scalars())


@router.get("/audit", response_model=list[PlatformAuditRead], tags=["platform"])
async def list_audit_logs(
    tenant_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PlatformAdminAction]:
    _ensure_platform_admin(user)

    query = select(PlatformAdminAction).order_by(PlatformAdminAction.created_at.desc()).limit(limit)
    if tenant_id:
        query = query.where(PlatformAdminAction.tenant_id == tenant_id)

    result = await db.execute(query)
    return list(result.scalars())
