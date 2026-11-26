"""Firma kontrol listesi şablonu ve başlıklarda büyük harf.

1) installation_checklist_templates: her firmanın adım başına kontrol listesi şablonu (yönetici düzenler).
   Yeni projeler bu şablonla açılır; şablon kaydedilince devam eden projelerin tamamlanmamış adımları
   da güncellenir. Projedeki madde, şablondaki maddesine template_item_id ile bağlanır (ad değişince izlenir).
2) Adım adları büyük harfle: "Projelendirme ve Teklif", "Müşteri Onayı", "Montaj ve Test".

Revision ID: 20261126_03
Revises: 20261126_02
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision = "20261126_03"
down_revision = "20261126_02"
branch_labels = None
depends_on = None

RENAMES = [
    ("teklif", "Projelendirme ve teklif", "Projelendirme ve Teklif"),
    ("onay", "Müşteri onayı", "Müşteri Onayı"),
    ("montaj_test", "Montaj ve test", "Montaj ve Test"),
]


def upgrade() -> None:
    op.create_table(
        "installation_checklist_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("stage_code", sa.String(32), nullable=False, index=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.add_column("installation_project_checklist_items", sa.Column(
        "template_item_id", UUID(as_uuid=True), sa.ForeignKey("installation_checklist_templates.id", ondelete="SET NULL"),
        nullable=True))
    for code, old, new in RENAMES:
        op.execute(sa.text("UPDATE installation_project_stages SET name = :new WHERE code = :code AND name = :old")
                   .bindparams(new=new, code=code, old=old))


def downgrade() -> None:
    for code, old, new in RENAMES:
        op.execute(sa.text("UPDATE installation_project_stages SET name = :old WHERE code = :code AND name = :new")
                   .bindparams(new=new, code=code, old=old))
    op.drop_column("installation_project_checklist_items", "template_item_id")
    op.drop_table("installation_checklist_templates")
