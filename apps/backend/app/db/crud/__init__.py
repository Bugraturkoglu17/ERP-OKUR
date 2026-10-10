"""CRUD yardımcıları — tekrarlayan sorguları burada toplayacağız."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

ModelType = TypeVar("ModelType", bound=SQLModel)
CreateSchemaType = TypeVar("CreateSchemaType", bound=SQLModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=SQLModel)


class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    """Generic CRUD sınıfı — tüm tablolar için kullanılabilir."""

    def __init__(self, model: type[ModelType]) -> None:
        self.model = model

    # ── READ ──────────────────────────────────────────────────────────────
    async def get(self, db: AsyncSession, id: Any) -> ModelType | None:
        result = await db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def get_multi(
        self,
        db:   AsyncSession,
        skip: int          = 0,
        limit: int         = 100,
        **filters: Any,
    ) -> list[ModelType]:
        query = select(self.model)
        for field, value in filters.items():
            if value is not None:
                query = query.where(getattr(self.model, field) == value)
        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars())

    # ── CREATE ─────────────────────────────────────────────────────────────
    async def create(
        self, db: AsyncSession, obj_in: CreateSchemaType, **extra: Any
    ) -> ModelType:
        obj_data = obj_in.model_dump() | extra
        from datetime import datetime
        for k, v in obj_data.items():
            if isinstance(v, datetime) and v.tzinfo is not None:
                obj_data[k] = v.replace(tzinfo=None)
        instance = self.model(**obj_data)
        db.add(instance)
        await db.commit()
        await db.refresh(instance)
        return instance

    # ── UPDATE ─────────────────────────────────────────────────────────────
    async def update(
        self,
        db:    AsyncSession,
        db_obj: ModelType,
        obj_in: UpdateSchemaType,
    ) -> ModelType:
        obj_data = obj_in.model_dump(exclude_unset=True)
        from datetime import datetime
        for field, value in obj_data.items():
            if isinstance(value, datetime) and value.tzinfo is not None:
                value = value.replace(tzinfo=None)
            setattr(db_obj, field, value)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db: AsyncSession, db_obj: ModelType) -> None:
        await db.delete(db_obj)
        await db.commit()
