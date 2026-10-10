# ─────────────────────────────────────────────────────────────────────────────
#  Sismik Mekanik ERP — FastAPI Dependencies (DB, Auth, RBAC)
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db as database_get_db
from app.core.security import decode_token, get_user_permissions, get_user_roles
from app.core.session_versions import get_session_version
from app.db.models import User, RolePermission


def is_platform_admin(user: User) -> bool:
    return "platform_admin" in (user.default_role or "")


def _reject_forced_password_change(payload: dict) -> None:
    if payload.get("force_password_change"):
        raise HTTPException(status_code=403, detail="Devam etmeden önce yeni şifrenizi oluşturun.")

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False,     # isteğe bağlı: optional auth endpoint'leri için
)


# ═══════════════════════════════════════════════════════════════════════════════
# Veritabanı Oturumu (Session)
# ═══════════════════════════════════════════════════════════════════════════════

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Her istek için yeni bir async veritabanı oturumu sağlar."""
    async for session in database_get_db():
        yield session


# ═══════════════════════════════════════════════════════════════════════════════
# Kimlik Doğrulama (Authentication)
# ═══════════════════════════════════════════════════════════════════════════════

async def _get_user_by_sub(db: AsyncSession, sub: str, token_version: int | None = None) -> User:
    """JWT subject alanından UUID'ye çevirip kullanıcıyı veritabanından getirir.

    ``token_version`` verilirse, kullanıcının güncel ``token_version``'ı ile
    karşılaştırılır — uyuşmuyorsa token, kullanıcı çıkış yaptıktan/oturumları
    sonlandırdıktan sonra kalan eski bir token demektir ve reddedilir.
    """
    user_result = await db.execute(select(User).where(User.id == uuid.UUID(sub)))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kullanıcı bulunamadı veya hesabı pasif durumda.",
        )
    if token_version is not None and token_version != await get_session_version(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum sona ermiş, lütfen tekrar giriş yapın.",
        )
    return user


async def get_current_user(
    token:        str          = Depends(oauth2_scheme),
    db:           AsyncSession = Depends(get_db),
) -> User:
    """Token içindeki sub (UUID) ile kullanıcıyı getirir — gerekli endpoint'lerde kullanılır."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kimlik doğrulama gerekli.",
        )
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Geçersiz token.")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token içeriği geçersiz.")

    user = await _get_user_by_sub(db, sub, token_version=payload.get("tv", 0))
    _reject_forced_password_change(payload)
    return user


async def get_current_tenant_id(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID | None:
    if not token:
        raise HTTPException(status_code=401, detail="Kimlik doğrulama gerekli.")
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Geçersiz token.")

    _reject_forced_password_change(payload)
    user = await _get_user_by_sub(db, payload["sub"], token_version=payload.get("tv", 0))
    if is_platform_admin(user):
        return None

    tenant_id = payload.get("tenant_id") or (str(user.tenant_id) if user.tenant_id else None)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Tenant bağlamı bulunamadı.")
    return uuid.UUID(str(tenant_id))


async def get_current_active_user(
    user: User = Depends(get_current_user),
) -> User:
    """Aktif kullanıcıyı döner — pasif hesapları reddeder."""
    return user


async def get_current_user_optional(
    token:        str | None   = Depends(oauth2_scheme),
    db:           AsyncSession = Depends(get_db),
) -> User | None:
    """Token varsa kullanıcı döner, yoksa None — public endpoint'ler için kullanılır."""
    if not token:
        return None
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        return None
    if payload.get("force_password_change"):
        return None
    return await _get_user_by_sub(db, payload["sub"], token_version=payload.get("tv", 0))


# ═══════════════════════════════════════════════════════════════════════════════
# Rol Bazlı Yetkilendirme (RBAC)
# ═══════════════════════════════════════════════════════════════════════════════

async def _get_user_role_names(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """Kullanıcının tüm rol isimlerini tek sorguda getirir."""
    from app.db.models import Role, RolePermission, UserRole
    result = await db.execute(
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    return [r for r in result.scalars()]


def require_role(*role_names: str):
    """
    Decorator-like dependency fabrikası.
    Kullanıcı verilen rollerden en az birine sahip olmalıdır, yoksa 403.

    Kullanımı:
        @router.post("")
        async def create_project(..., user=Depends(require_role("admin"))):
            ...
    """
    async def _checker(
        token: str          = Depends(oauth2_scheme),
        db:    AsyncSession = Depends(get_db),
    ) -> User:
        if not token:
            raise HTTPException(status_code=401, detail="Kimlik doğrulama gerekli.")
        try:
            payload = decode_token(token)
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Geçersiz token.")
        _reject_forced_password_change(payload)
        user = await _get_user_by_sub(db, payload["sub"], token_version=payload.get("tv", 0))
        # Token'daki değil, DB'deki güncel rollerle kontrol et — rol değişikliği
        # anında etkili olsun diye (token süresi dolana kadar eski yetki kalmasın).
        live_roles = await get_user_roles(db, user.id)
        if not any(r in live_roles for r in role_names):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu işlem için yetkiniz yok.",
            )
        return user
    return _checker


async def require_permission(
    token:        str          = Depends(oauth2_scheme),
    db:           AsyncSession = Depends(get_db),
    permission:   str          = "projects:read",
) -> User:
    """
    JWT içindeki permissions listesi ile kontrol eder.
    403 döner, kullanıcı nesnesi başarılıysa döner.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Kimlik doğrulama gerekli.")
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Geçersiz token.")
    _reject_forced_password_change(payload)
    user = await _get_user_by_sub(db, payload["sub"], token_version=payload.get("tv", 0))
    live_perms = await get_user_permissions(db, user.id)
    if permission not in live_perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için yetkiniz yok.",
        )
    return user
