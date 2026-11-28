"""Mağaza silme, bağlı operasyon verisini kaybettirmemeli."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.routes import projects
from app.api.v1.routes.subcontractors import _apply
from app.core.text import upper_tr


@pytest.mark.asyncio
async def test_store_without_references_is_hard_deleted(monkeypatch):
    tenant_id = uuid4()
    store = SimpleNamespace(id=uuid4(), tenant_id=tenant_id)
    monkeypatch.setattr(projects.crud_project, "get", AsyncMock(return_value=store))
    db = AsyncMock()
    result = MagicMock()
    result.first.return_value = None
    db.execute.return_value = result

    await projects.delete_project(str(store.id), SimpleNamespace(tenant_id=tenant_id, default_role="admin"), db)

    db.delete.assert_awaited_once_with(store)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_store_with_references_is_not_deleted(monkeypatch):
    tenant_id = uuid4()
    store = SimpleNamespace(id=uuid4(), tenant_id=tenant_id)
    monkeypatch.setattr(projects.crud_project, "get", AsyncMock(return_value=store))
    db = AsyncMock()
    result = MagicMock()
    result.first.return_value = (1,)
    db.execute.return_value = result

    with pytest.raises(HTTPException) as exc:
        await projects.delete_project(str(store.id), SimpleNamespace(tenant_id=tenant_id, default_role="admin"), db)

    assert exc.value.status_code == 409
    db.delete.assert_not_awaited()
    db.commit.assert_not_awaited()


def test_turkish_uppercase_preserves_dotted_i():
    assert upper_tr("istanbul, ızmir çiğli") == "İSTANBUL, IZMİR ÇİĞLİ"


def test_subcontractor_text_is_uppercased_without_changing_contact_data():
    item = SimpleNamespace()
    _apply(item, {
        "company_name": "izmir soğutma", "city": "istanbul",
        "contact_name": "ışıl ince", "email": "test@example.com", "iban": "tr12abc",
    })
    assert item.company_name == "İZMİR SOĞUTMA"
    assert item.city == "İSTANBUL"
    assert item.contact_name == "IŞIL İNCE"
    assert item.email == "test@example.com"
    assert item.iban == "TR12ABC"
