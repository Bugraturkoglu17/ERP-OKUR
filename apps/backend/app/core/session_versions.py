from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_session_version(db: AsyncSession, user_id: UUID) -> int:
    result = await db.execute(
        text("SELECT version FROM user_session_versions WHERE user_id = :user_id"),
        {"user_id": user_id},
    )
    value = result.scalar_one_or_none()
    return int(value or 0)


async def bump_session_version(db: AsyncSession, user_id: UUID) -> int:
    result = await db.execute(
        text("""
            INSERT INTO user_session_versions (user_id, version, updated_at)
            VALUES (:user_id, 1, now())
            ON CONFLICT (user_id) DO UPDATE
            SET version = user_session_versions.version + 1,
                updated_at = now()
            RETURNING version
        """),
        {"user_id": user_id},
    )
    return int(result.scalar_one())
