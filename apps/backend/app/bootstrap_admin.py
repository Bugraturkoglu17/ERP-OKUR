from __future__ import annotations

import os
import sys
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.db.models import Role, User, UserRole


def _env(name: str, fallback: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return fallback
    value = value.strip()
    return value or fallback


def _require_env() -> tuple[str, str, str]:
    email = _env("PLATFORM_ADMIN_EMAIL") or _env("ADMIN_EMAIL")
    password = _env("PLATFORM_ADMIN_PASSWORD") or _env("ADMIN_PASSWORD")
    full_name = _env("PLATFORM_ADMIN_FULL_NAME", "Geliştirici Admin")

    if not email or not password:
        raise ValueError(
            "Missing required env vars. Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD "
            "(or ADMIN_EMAIL and ADMIN_PASSWORD)."
        )
    if len(password) < 10:
        raise ValueError("Admin password must be at least 10 characters.")
    return email.lower(), password, full_name


async def _ensure_role(session, name: str, display_name: str, description: str) -> Role:
    role = (await session.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role:
        return role
    role = Role(name=name, display_name=display_name, description=description, is_active=True)
    session.add(role)
    await session.flush()
    return role


async def bootstrap_platform_admin() -> None:
    email, password, full_name = _require_env()

    async with AsyncSessionLocal() as session:
        platform_role = await _ensure_role(
            session,
            name="platform_admin",
            display_name="Geliştirici Admin",
            description="Platform-level full access",
        )
        admin_role = await _ensure_role(
            session,
            name="admin",
            display_name="Tenant Admin",
            description="Tenant-level admin access",
        )
        await _ensure_role(
            session,
            name="saha_muhendisi",
            display_name="Kullanıcı",
            description="Saha çalışanı / kullanıcı erişimi",
        )

        user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            user = User(
                email=email,
                hashed_password=hash_password(password),
                full_name=full_name,
                default_role="platform_admin",
                is_active=True,
                is_verified=True,
                tenant_id=None,
            )
            session.add(user)
            await session.flush()
            created = True
        else:
            user.default_role = "platform_admin"
            user.is_active = True
            user.is_verified = True
            user.tenant_id = None
            user.hashed_password = hash_password(password)
            session.add(user)
            created = False

        existing_roles = {
            row[0]
            for row in (await session.execute(
                select(Role.name)
                .join(UserRole, UserRole.role_id == Role.id)
                .where(UserRole.user_id == user.id)
            )).all()
        }

        if "platform_admin" not in existing_roles:
            session.add(UserRole(user_id=user.id, role_id=platform_role.id))
        if "admin" not in existing_roles:
            session.add(UserRole(user_id=user.id, role_id=admin_role.id))

        await session.commit()

    state = "created" if created else "updated"
    print(f"Geliştirici admin {state}: {email}")


def main() -> int:
    try:
        asyncio.run(bootstrap_platform_admin())
        return 0
    except Exception as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
