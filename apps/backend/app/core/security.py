# ─────────────────────────────────────────────────────────────────────────────
#  Sismik Mekanik ERP — Security: JWT + Password Hashing + RBAC
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.models import UserRole, Role, RolePermission, User, Permission

# ── Consts ────────────────────────────────────────────────────────────────────
ALGORITHM      = settings.ALGORITHM
ACCESS_EXPIRES = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
REFRESH_EXPIRES = timedelta(days=30)


# ═══════════════════════════════════════════════════════════════════════════════
# 1 · Parola İşlemleri (bcrypt)
# ═══════════════════════════════════════════════════════════════════════════════

def hash_password(plain_password: str) -> str:
    """Düz metin parolayı bcrypt ile hash'ler — veritabanında saklanır."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Giriş anında parolayı doğrular."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


# ═══════════════════════════════════════════════════════════════════════════════
# 2 · JWT Token İşlemleri
# ═══════════════════════════════════════════════════════════════════════════════

def _create_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire    = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(
    sub:         str,
    roles:       list[str],
    permissions: list[str],
    tenant_id:   str | None = None,
    discipline:  str | None  = None,
    force_password_change: bool = False,
    token_version: int = 0,
) -> str:
    payload: dict[str, Any] = {
        "sub":         sub,
        "roles":       roles,
        "permissions": permissions,
        "tenant_id":   tenant_id,
        "discipline":  discipline,
        "force_password_change": force_password_change,
        "tv":          token_version,
    }
    return _create_token(payload, ACCESS_EXPIRES)


def create_refresh_token(sub: str, token_version: int = 0) -> str:
    """Refresh token — uzun süreli, subject ve token_version içerir."""
    return _create_token({"sub": sub, "tv": token_version}, REFRESH_EXPIRES)


def decode_token(token: str) -> dict[str, Any]:
    """Token'ı çözer — imza doğrulaması yapar."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


# ═══════════════════════════════════════════════════════════════════════════════
# 3 · RBAC Yardımcıları
# ═══════════════════════════════════════════════════════════════════════════════

async def get_user_roles(db: AsyncSession, user_id: UUID) -> list[str]:
    """Kullanıcının tüm rol isimlerini getirir."""
    result = await db.execute(
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    return [r for r in result.scalars()]


async def get_user_permissions(db: AsyncSession, user_id: UUID) -> list[str]:
    """Kullanıcının tüm permission kodlarını getirir."""
    result = await db.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(UserRole.user_id == user_id)
    )
    return list(result.scalars())


async def has_role(db: AsyncSession, user_id: UUID, role_name: str) -> bool:
    """Kullanıcının belirli bir role sahip olup olmadığını kontrol et."""
    roles = await get_user_roles(db, user_id)
    return role_name in roles


async def require_any_role(
    db:         AsyncSession,
    user:       User,
    role_names: list[str],
) -> None:
    """Kullanıcının verilen rollerden en az birine sahip olup olmadığını doğrula — 403 döner."""
    user_roles = await get_user_roles(db, user.id)
    if not any(r in user_roles for r in role_names):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403,
            detail="Bu işlem için yetkiniz yok.",
        )
