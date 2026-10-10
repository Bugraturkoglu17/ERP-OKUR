# ─────────────────────────────────────────────────────────────────────────────
#  V1 Auth Router — Login / Refresh / Me
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
import json
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from app.core.database import get_db
from app.core.dependencies import get_current_user, is_platform_admin
from app.core.security import create_access_token, create_refresh_token, get_user_permissions, get_user_roles, hash_password, verify_password
from app.core.session_versions import bump_session_version, get_session_version
from app.db.models import PlatformTenantSettings, Role, Tenant, TenantEmailMode, User, UserRole, UserSecurityPolicy
from app.db.schemas import CompletePasswordResetRequest, MessageResponse, TemporaryPasswordResponse, TenantContextRead, TenantProfileUpdate, TenantSettingsUpsert, Token, TokenRefresh, UserProfileUpdate, UserRead

router = APIRouter()

MANAGER_ROLES = {"admin", "manager"}
CREATABLE_ROLE_MAP = {
    "user": "saha_muhendisi",
    "saha_muhendisi": "saha_muhendisi",
    "manager": "admin",
}


def _is_manager(user: User) -> bool:
    return is_platform_admin(user) or (user.default_role or "") in MANAGER_ROLES


def _is_manager_tier_role(role_name: str) -> bool:
    """'admin' default_role'ü — frontend'de 'Yönetici' (Manager) olarak gösterilir."""
    return role_name == "admin"


async def _ensure_login_available(db: AsyncSession, user_id, *, email: str | None = None, phone: str | None = None) -> None:
    conditions = []
    if email is not None:
        conditions.append(func.lower(User.email) == email.lower())
    if phone is not None:
        conditions.append(User.phone == phone)
    if conditions:
        existing = await db.execute(select(User.id).where(User.id != user_id, or_(*conditions)).limit(1))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Bu e-posta veya telefon numarası başka bir hesapta kullanılıyor.")


# ── Login rate limiting ──────────────────────────────────────────────────────
# Basit bellek-içi sabit pencereli sınırlayıcı: /auth/login brute-force'a karşı
# hiç korunmuyordu. Tek process içinde çalışır — çok-instance'lı bir dağıtımda
# Redis tabanlı bir çözüme taşınması önerilir, ama hiç koruma olmamasından iyidir.
_login_attempts: dict[str, list[float]] = defaultdict(list)
_login_rate_lock = asyncio.Lock()
_LOGIN_RATE_WINDOW_SECONDS = 60.0
_LOGIN_RATE_MAX_ATTEMPTS = 10


async def _enforce_login_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    cutoff = now - _LOGIN_RATE_WINDOW_SECONDS
    async with _login_rate_lock:
        attempts = _login_attempts[client_ip]
        while attempts and attempts[0] < cutoff:
            attempts.pop(0)
        if len(attempts) >= _LOGIN_RATE_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Çok fazla giriş denemesi yapıldı. Lütfen bir dakika sonra tekrar deneyin.",
            )
        attempts.append(now)


async def _password_change_required(db: AsyncSession, user_id) -> bool:
    policy = await db.get(UserSecurityPolicy, user_id)
    return bool(policy and policy.force_password_change)


async def _user_read(db: AsyncSession, user: User) -> UserRead:
    force_change = await _password_change_required(db, user.id)
    return UserRead(
        **UserRead.model_validate(user).model_dump(exclude={"force_password_change", "onboarding_complete"}),
        force_password_change=force_change,
        # Eski hesaplarda is_verified alanı doldurulmamış olabilir; zorunlu
        # parola politikası yoksa hesap kurulumunu tamamlanmış kabul ederiz.
        onboarding_complete=not force_change,
    )


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


@router.post("/login", response_model=Token, tags=["auth"])
async def login(
    request:     Request,
    db:          AsyncSession = Depends(get_db),
    form_data:   OAuth2PasswordRequestForm = Depends(),
) -> Token:
    """E-posta ve parola ile güvenli kullanıcı girişi."""
    client_ip = request.client.host if request.client else "unknown"
    await _enforce_login_rate_limit(client_ip)

    login_id = form_data.username.strip()
    normalized_email = login_id.lower()
    result  = await db.execute(
        select(User).where(or_(func.lower(User.email) == normalized_email, User.phone == login_id))
    )
    user    = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz e-posta veya şifre.",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Hesabınız pasif durumda.")

    roles       = await get_user_roles(db, user.id)
    permissions = await get_user_permissions(db, user.id)
    force_change = await _password_change_required(db, user.id)

    token_version = await get_session_version(db, user.id)
    access_token  = create_access_token(
        sub=str(user.id), roles=roles, permissions=permissions,
        tenant_id=str(user.tenant_id) if user.tenant_id else None,
        force_password_change=force_change,
        token_version=token_version,
    )
    refresh_token = create_refresh_token(sub=str(user.id), token_version=token_version)

    return Token(
        access_token  = access_token,
        refresh_token = refresh_token,
        token_type    = "bearer",
        force_password_change=force_change,
    )


@router.post("/refresh", response_model=Token, tags=["auth"])
async def refresh_token(
    body:  TokenRefresh,
    db:    AsyncSession = Depends(get_db),
) -> Token:
    try:
        from app.core.security import decode_token
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Geçersiz refresh token.")

    user_result = await db.execute(
        select(User).where(User.id == payload["sub"])
    )
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı.")
    token_version = await get_session_version(db, user.id)
    if payload.get("tv", 0) != token_version:
        raise HTTPException(status_code=401, detail="Oturum sona ermiş, lütfen tekrar giriş yapın.")

    roles       = await get_user_roles(db, user.id)
    permissions = await get_user_permissions(db, user.id)
    force_change = await _password_change_required(db, user.id)

    access_token  = create_access_token(
        sub=str(user.id),
        roles=roles,
        permissions=permissions,
        tenant_id=str(user.tenant_id) if user.tenant_id else None,
        force_password_change=force_change,
        token_version=token_version,
    )
    refresh_token = create_refresh_token(sub=str(user.id), token_version=token_version)

    return Token(
        access_token  = access_token,
        refresh_token = refresh_token,
        token_type    = "bearer",
        force_password_change=force_change,
    )


@router.post("/logout", response_model=MessageResponse, tags=["auth"])
async def logout(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
) -> MessageResponse:
    """Tüm cihazlardaki mevcut token'ları geçersiz kılar (token_version artırılır)."""
    # user, get_current_user'ın kendi (farklı) DB session'ına bağlı — ORM
    # nesnesini burada başka bir session'a (db) eklemek yerine doğrudan UPDATE
    # çalıştırıyoruz (iki session'a aynı anda attach olma hatasını önler).
    await bump_session_version(db, user.id)
    await db.commit()
    return MessageResponse(message="Çıkış yapıldı, tüm oturumlar sonlandırıldı.")


@router.post("/complete-password-reset", response_model=MessageResponse, tags=["auth"])
async def complete_password_reset(
    payload: CompletePasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    login_id = payload.email.strip()
    result = await db.execute(select(User).where(or_(func.lower(User.email) == login_id.lower(), User.phone == login_id)))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.temporary_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Geçersiz e-posta veya geçici parola.")

    policy = await db.get(UserSecurityPolicy, user.id)
    if not policy or not policy.force_password_change:
        raise HTTPException(status_code=400, detail="Bu kullanıcı için parola yenileme gerekli değil.")
    if payload.new_password == payload.temporary_password:
        raise HTTPException(status_code=422, detail="Yeni şifre geçici şifreden farklı olmalıdır.")

    user.hashed_password = hash_password(payload.new_password)
    user.is_verified = True
    policy.force_password_change = False
    await bump_session_version(db, user.id)
    db.add(user)
    db.add(policy)
    await db.commit()

    return MessageResponse(message="Parolanız güncellendi. Giriş yapabilirsiniz.")


@router.get("/me", response_model=UserRead, tags=["auth"])
async def get_me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserRead:
    """Token'ındaki kullanıcı profilini döner."""
    return await _user_read(db, user)


@router.patch("/me", response_model=UserRead, tags=["auth"])
async def update_me(
    payload: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    user = await db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    full_name = payload.full_name.strip() if payload.full_name is not None else None
    phone = payload.phone.strip() if payload.phone is not None else None
    email = str(payload.email).strip().lower() if payload.email is not None else None
    if full_name is not None and not full_name:
        raise HTTPException(status_code=422, detail="Ad soyad boş olamaz.")
    if phone is not None and not phone:
        raise HTTPException(status_code=422, detail="Telefon numarası boş olamaz.")
    await _ensure_login_available(db, user.id, email=email, phone=phone)
    if full_name is not None:
        user.full_name = full_name
    if phone is not None:
        user.phone = phone
    if email is not None:
        user.email = email
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu e-posta veya telefon numarası başka bir hesapta kullanılıyor.")
    await db.refresh(user)
    return await _user_read(db, user)


@router.get("/tenant-context", response_model=TenantContextRead, tags=["auth"])
async def get_tenant_context(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TenantContextRead:
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Bu kullanıcı bir firmaya bağlı değil.")

    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Firma bulunamadı.")

    settings = await db.get(PlatformTenantSettings, tenant.id)
    return TenantContextRead(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        tenant_code=tenant.code,
        logo_url=tenant.logo_url,
        tax_no=settings.tax_no if settings else None,
        sector=settings.sector if settings else None,
        country=settings.country if settings else None,
        theme_color=settings.theme_color if settings else None,
        domain=settings.domain if settings else None,
        subdomain=settings.subdomain if settings else None,
        email_mode=settings.email_mode if settings else TenantEmailMode.PLATFORM,
        from_name=settings.from_name if settings else None,
        from_email=settings.from_email if settings else None,
        reply_to=settings.reply_to if settings else None,
        email_domain_verified=settings.email_domain_verified if settings else False,
        email_provider_identity_id=settings.email_provider_identity_id if settings else None,
        email_branding=json.loads(settings.email_branding) if settings and settings.email_branding else None,
        email_notifications_enabled=settings.email_notifications_enabled if settings else True,
        email_digest_mode=settings.email_digest_mode if settings else "immediate",
        email_opt_out_templates=_parse_opt_out_templates(settings.email_opt_out_templates if settings else None),
    )


@router.put("/tenant-context/settings", response_model=TenantContextRead, tags=["auth"])
async def update_tenant_context_settings(
    payload: TenantSettingsUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TenantContextRead:
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Bu kullanıcı bir firmaya bağlı değil.")

    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Firma bulunamadı.")

    settings = await db.get(PlatformTenantSettings, tenant.id)
    if not settings:
        settings = PlatformTenantSettings(tenant_id=tenant.id)

    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "email_branding":
            setattr(settings, key, json.dumps(value, ensure_ascii=False) if value is not None else None)
            continue
        if key == "email_opt_out_templates":
            setattr(settings, key, json.dumps(value or [], ensure_ascii=False))
            continue
        setattr(settings, key, value)

    db.add(settings)
    await db.commit()
    await db.refresh(settings)

    return TenantContextRead(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        tenant_code=tenant.code,
        logo_url=tenant.logo_url,
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
    )


@router.put("/tenant-context/profile", response_model=TenantContextRead, tags=["auth"])
async def update_tenant_context_profile(
    payload: TenantProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TenantContextRead:
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Bu kullanıcı bir firmaya bağlı değil.")

    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Firma bulunamadı.")

    if payload.tenant_name is not None:
        normalized_name = payload.tenant_name.strip()
        if not normalized_name:
            raise HTTPException(status_code=400, detail="Firma adı boş olamaz.")
        tenant.name = normalized_name
    if payload.logo_url is not None:
        tenant.logo_url = payload.logo_url.strip() or None

    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)

    settings = await db.get(PlatformTenantSettings, tenant.id)
    return TenantContextRead(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        tenant_code=tenant.code,
        logo_url=tenant.logo_url,
        tax_no=settings.tax_no if settings else None,
        sector=settings.sector if settings else None,
        country=settings.country if settings else None,
        theme_color=settings.theme_color if settings else None,
        domain=settings.domain if settings else None,
        subdomain=settings.subdomain if settings else None,
        email_mode=settings.email_mode if settings else TenantEmailMode.PLATFORM,
        from_name=settings.from_name if settings else None,
        from_email=settings.from_email if settings else None,
        reply_to=settings.reply_to if settings else None,
        email_domain_verified=settings.email_domain_verified if settings else False,
        email_provider_identity_id=settings.email_provider_identity_id if settings else None,
        email_branding=json.loads(settings.email_branding) if settings and settings.email_branding else None,
        email_notifications_enabled=settings.email_notifications_enabled if settings else True,
        email_digest_mode=settings.email_digest_mode if settings else "immediate",
        email_opt_out_templates=_parse_opt_out_templates(settings.email_opt_out_templates if settings else None),
    )


# ── User CRUD for Admin & RBAC ───────────────────────────────────────────────

from app.db.schemas import UserCreate, UserUpdate

@router.get("/users", response_model=list[UserRead], tags=["auth"])
async def list_users(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
) -> list[UserRead]:
    """Tüm kullanıcıları listele."""
    if not _is_manager(user):
        raise HTTPException(status_code=403, detail="Kullanıcıları listeleme yetkiniz yok.")
        
    query = select(User).order_by(User.created_at.desc())
    if not is_platform_admin(user):
        query = query.where(User.tenant_id == user.tenant_id)

    result = await db.execute(query)
    return [await _user_read(db, item) for item in result.scalars()]


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED, tags=["auth"])
async def create_user(
    user_in: UserCreate,
    db:      AsyncSession = Depends(get_db),
    admin:   User         = Depends(get_current_user),
) -> UserRead:
    """Yeni kullanıcı oluştur."""
    if not _is_manager(admin):
        raise HTTPException(status_code=403, detail="Kullanıcı oluşturma yetkiniz yok.")

    raw_role = (user_in.roles or ["saha_muhendisi"])[0].strip().lower()
    if raw_role not in CREATABLE_ROLE_MAP:
        raise HTTPException(status_code=403, detail="Yalnızca Kullanıcı veya Yönetici rolü atanabilir. Admin yetkisi verilemez.")
    requested_role = CREATABLE_ROLE_MAP[raw_role]
    if _is_manager_tier_role(requested_role) and not is_platform_admin(admin):
        raise HTTPException(status_code=403, detail="Yönetici hesabı oluşturma yetkiniz yok. Bu işlem yalnızca geliştirici admin tarafından yapılabilir.")

    target_tenant_id = admin.tenant_id
    if is_platform_admin(admin):
        target_tenant_id = user_in.tenant_id
        if target_tenant_id is None:
            tenant_result = await db.execute(select(Tenant.id).where(Tenant.is_active.is_(True)).limit(2))
            tenant_ids = list(tenant_result.scalars())
            if len(tenant_ids) != 1:
                raise HTTPException(status_code=400, detail="Admin kullanıcı oluştururken firma seçmelidir.")
            target_tenant_id = tenant_ids[0]
    if target_tenant_id is None:
        raise HTTPException(status_code=400, detail="Kullanıcı için firma bağlamı bulunamadı.")

    normalized_phone = user_in.phone.strip()
    normalized_email = str(user_in.email).lower() if user_in.email else f"hesap-{''.join(c for c in normalized_phone if c.isdigit())}-{str(target_tenant_id)[:8]}@sismik.local"
    existing = await db.execute(select(User).where(or_(func.lower(User.email) == normalized_email, User.phone == normalized_phone)))
    existing_user = existing.scalar_one_or_none()
    if existing_user is not None:
        if not existing_user.is_active:
            raise HTTPException(
                status_code=400,
                detail="Bu e-posta veya telefon, pasif bir hesaba ait. Yeni kayıt yerine o hesabı 'Aktif yap' ile yeniden etkinleştirebilirsiniz.",
            )
        raise HTTPException(status_code=400, detail="Bu e-posta veya telefonla kayıtlı bir kullanıcı zaten var.")

    role_result = await db.execute(select(Role).where(Role.name == requested_role))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=500, detail=f"{requested_role} rolü sistemde tanımlı değil.")

    db_user = User(
        email=normalized_email,
        tenant_id=target_tenant_id,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name,
        phone=normalized_phone,
        default_role=requested_role,
        discipline=user_in.discipline,
        discipline_only=user_in.discipline_only,
        is_active=user_in.is_active,
        is_verified=False,
    )
    db.add(db_user)
    await db.flush()
    db.add(UserRole(user_id=db_user.id, role_id=role.id))
    db.add(UserSecurityPolicy(user_id=db_user.id, force_password_change=True))

    await db.commit()
    await db.refresh(db_user)
    return await _user_read(db, db_user)


@router.patch("/users/{user_id}", response_model=UserRead, tags=["auth"])
async def update_user_details(
    user_id: str,
    user_in: UserUpdate,
    db:      AsyncSession = Depends(get_db),
    admin:   User         = Depends(get_current_user),
) -> UserRead:
    """Kullanıcı bilgilerini ve yetkilerini güncelle."""
    if not _is_manager(admin):
        raise HTTPException(status_code=403, detail="Kullanıcı güncelleme yetkiniz yok.")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if not is_platform_admin(admin) and user.tenant_id != admin.tenant_id:
        raise HTTPException(status_code=403, detail="Bu kullanıcı tenant kapsamınız dışında.")
    if is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Geliştirici admin hesabı bu ekrandan değiştirilemez.")
    if _is_manager_tier_role(user.default_role or "") and not is_platform_admin(admin):
        raise HTTPException(status_code=403, detail="Yönetici hesaplarını yalnızca geliştirici admin düzenleyebilir.")
    if user_in.roles is not None and not is_platform_admin(admin):
        raise HTTPException(status_code=403, detail="Rol değişikliği yalnızca geliştirici admin tarafından yapılabilir.")
    if user.id == admin.id and user_in.is_active is False:
        raise HTTPException(status_code=403, detail="Kendi hesabınızı pasif hale getiremezsiniz.")

    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.phone is not None:
        normalized_phone = user_in.phone.strip()
        if not normalized_phone:
            raise HTTPException(status_code=422, detail="Telefon numarası boş olamaz.")
        await _ensure_login_available(db, user.id, phone=normalized_phone)
        user.phone = normalized_phone
    if user_in.discipline is not None:
        user.discipline = user_in.discipline
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
    if user_in.roles is not None:
        raw_role = user_in.roles[0].strip().lower() if user_in.roles else ""
        if raw_role not in CREATABLE_ROLE_MAP:
            raise HTTPException(status_code=403, detail="Admin yetkisi atanamaz.")
        role_name = CREATABLE_ROLE_MAP[raw_role]
        role_result = await db.execute(select(Role).where(Role.name == role_name))
        role = role_result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=500, detail=f"{role_name} rolü sistemde tanımlı değil.")
        await db.execute(UserRole.__table__.delete().where(UserRole.user_id == user.id))
        db.add(UserRole(user_id=user.id, role_id=role.id))
        user.default_role = role_name
        # Rol değişikliği sonrası eldeki eski token'lar geçersiz kılınır —
        # kullanıcı yeni yetkileriyle tekrar giriş yapmak zorunda kalır.
        await bump_session_version(db, user.id)
    if user_in.is_active is False:
        # Pasif yapılan hesabın eldeki token'ları da anında geçersiz kılınır.
        await bump_session_version(db, user.id)

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return await _user_read(db, user)


@router.post("/users/{user_id}/temporary-password", response_model=TemporaryPasswordResponse, tags=["auth"])
async def issue_temporary_password(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_user),
) -> TemporaryPasswordResponse:
    if not _is_manager(admin):
        raise HTTPException(status_code=403, detail="Şifre yenileme yetkiniz yok.")
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if target.id == admin.id or is_platform_admin(target):
        raise HTTPException(status_code=403, detail="Bu hesabın şifresi buradan yenilenemez.")
    if not is_platform_admin(admin) and (target.tenant_id != admin.tenant_id or _is_manager_tier_role(target.default_role or "")):
        raise HTTPException(status_code=403, detail="Bu hesabın şifresini yenileme yetkiniz yok.")
    temporary_password = secrets.token_urlsafe(12)
    target.hashed_password = hash_password(temporary_password)
    policy = await db.get(UserSecurityPolicy, target.id)
    if policy is None:
        policy = UserSecurityPolicy(user_id=target.id)
    policy.force_password_change = True
    db.add(target)
    db.add(policy)
    await bump_session_version(db, target.id)
    await db.commit()
    return TemporaryPasswordResponse(temporary_password=temporary_password)


# users.id'ye NULL EDİLEMEYEN bir sütunla bağlı olup satırları kullanıcıya
# AİT olan (yani kullanıcı silinince beraberinde silinmesi mantıklı) tablolar.
# Sıra önemli: child'ı olanlar önce.
_USER_OWNED_DELETE_ORDER: tuple[str, ...] = (
    # field_report_items -> field_reports (author_id NOT NULL)
    "DELETE FROM field_report_items WHERE report_id IN "
    "(SELECT id FROM field_reports WHERE author_id = :uid)",
    "DELETE FROM field_reports WHERE author_id = :uid",
    "DELETE FROM project_assignments WHERE user_id = :uid",
    "DELETE FROM notifications WHERE user_id = :uid",
    "DELETE FROM user_security_policies WHERE user_id = :uid",
    "DELETE FROM user_session_versions WHERE user_id = :uid",
    "DELETE FROM user_roles WHERE user_id = :uid",
    "DELETE FROM platform_admin_actions WHERE actor_user_id = :uid",
)


async def _hard_delete_user(db: AsyncSession, user_id) -> None:
    """Kullanıcıyı KALICI siler.

    1) users.id'ye bağlı NULL edilebilir tüm referanslar (created_by,
       uploaded_by, approved_by, assigned_to_user_id …) NULL'a çekilir —
       iş emri / rapor / doküman gibi içerikler korunur, yalnızca "yapan
       kişi" bağı kopar.
    2) Kullanıcıya ait, NULL edilemeyen satırlar (rol atamaları, bildirimleri,
       güvenlik politikası, proje atamaları, saha raporları) silinir.
    3) users satırı silinir.
    """
    params = {"uid": user_id}

    # 1) NULL edilebilir tüm FK referansları — metadata üzerinden gez, hiçbirini kaçırma.
    for tbl in SQLModel.metadata.sorted_tables:
        if tbl.name == "users":
            continue
        for fk in tbl.foreign_keys:
            tgt = fk.column
            if tgt.table.name == "users" and tgt.name == "id" and fk.parent.nullable:
                await db.execute(
                    text(f'UPDATE "{tbl.name}" SET "{fk.parent.name}" = NULL '
                         f'WHERE "{fk.parent.name}" = :uid'),
                    params,
                )

    # 2) Kullanıcıya ait satırlar
    for stmt in _USER_OWNED_DELETE_ORDER:
        await db.execute(text(stmt), params)

    # 3) Kullanıcı
    await db.execute(text('DELETE FROM users WHERE id = :uid'), params)


@router.delete("/users/{user_id}", tags=["auth"])
async def delete_user_account(
    user_id: str,
    db:      AsyncSession = Depends(get_db),
    admin:   User         = Depends(get_current_user),
) -> dict:
    """Kullanıcı hesabını KALICI olarak sil.

    Beklenmeyen bir bağımlılık nedeniyle kalıcı silme başarısız olursa hesap
    pasifleştirilerek (soft-delete) güvenli tarafta kalınır ve durum mesajla
    bildirilir — istek asla 500 dönmez.
    """
    if not _is_manager(admin):
        raise HTTPException(status_code=403, detail="Kullanıcı silme yetkiniz yok.")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if not is_platform_admin(admin) and user.tenant_id != admin.tenant_id:
        raise HTTPException(status_code=403, detail="Bu kullanıcı tenant kapsamınız dışında.")
    if user.id == admin.id:
        raise HTTPException(status_code=403, detail="Kendi hesabınızı silemezsiniz.")
    if is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Geliştirici admin hesabı silinemez.")
    if _is_manager_tier_role(user.default_role or "") and not is_platform_admin(admin):
        raise HTTPException(status_code=403, detail="Yönetici hesaplarını yalnızca geliştirici admin silebilir.")

    full_name = user.full_name
    try:
        await _hard_delete_user(db, user.id)
        await db.commit()
        return {"message": f"{full_name} hesabı kalıcı olarak silindi.", "hard_deleted": True}
    except (IntegrityError, SQLAlchemyError):
        await db.rollback()

    # Fallback: kalıcı silme başarısız → pasifleştir.
    fallback_user = await db.get(User, user_id)
    if fallback_user is None:
        return {"message": f"{full_name} hesabı silindi.", "hard_deleted": True}
    fallback_user.is_active = False
    db.add(fallback_user)
    await bump_session_version(db, fallback_user.id)
    await db.commit()
    return {
        "message": (
            f"{full_name} hesabının bağlı kayıtları olduğu için kalıcı silinemedi; "
            "hesap pasif hale getirildi ve giriş yapamaz."
        ),
        "hard_deleted": False,
    }
