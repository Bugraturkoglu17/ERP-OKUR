"""Ana aşama + adım yapısı, maddeli maliyet ve aşama kayıt listesi.

1) Adımlar: "Üretim ve montaj" (uretim_montaj) adımı "Üretim" (uretim) olur; "Devreye alma ve test" (test)
   adımı "Montaj ve test" (montaj_test) olur ve montaj maddeleri ("Ekip ve tarihler planlandı",
   "Montaj tamamlandı") ona taşınır. Adım kayıtları ve sıraları (1-7) korunur; ana aşama (Keşif, Teklif,
   Üretim ve montaj, Kapanış) adım kodundan hesaplanır, veritabanında tutulmaz.
2) Maliyet: her kalemde (montaj, nakliye, ürün, ek) birden çok madde girilebilsin diye kalem başına tek
   satır kısıtı kaldırılır. Var olan tutarlar birer madde olarak kalır.
3) Kayıt listesi: installation_project_stage_events — yalnız eklenen, değiştirilmeyen olay tablosu
   (adım tamamlandı / başladı, sorumlu ve planlanan bitiş değişti, onaya gönderildi / reddedildi).
   Bugüne kadar tamamlanmış adımlar için geriye dönük "completed" kaydı yazılır.

Revision ID: 20261126_02
Revises: 20261126_01
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision = "20261126_02"
down_revision = "20261126_01"
branch_labels = None
depends_on = None

MONTAGE_ITEMS = ("Ekip ve tarihler planlandı", "Montaj tamamlandı")


def upgrade() -> None:
    # 1) Adımlar
    op.execute("UPDATE installation_project_stages SET code = 'uretim', name = 'Üretim' WHERE code = 'uretim_montaj'")
    op.execute("UPDATE installation_project_stages SET code = 'montaj_test', name = 'Montaj ve test' WHERE code = 'test'")
    op.execute(f"""
        UPDATE installation_project_checklist_items c
        SET stage_id = mt.id, sort_order = c.sort_order - 100
        FROM installation_project_stages u
        JOIN installation_project_stages mt ON mt.project_id = u.project_id AND mt.code = 'montaj_test'
        WHERE c.stage_id = u.id AND u.code = 'uretim' AND c.label IN {MONTAGE_ITEMS!r}
    """)

    # 2) Maddeli maliyet
    op.drop_index("uq_installation_project_cost_fixed", table_name="installation_project_costs")

    # 3) Kayıt listesi
    op.create_table(
        "installation_project_stage_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("installation_projects.id"), nullable=False, index=True),
        sa.Column("stage_id", UUID(as_uuid=True), sa.ForeignKey("installation_project_stages.id"), nullable=True, index=True),
        sa.Column("stage_order", sa.Integer(), nullable=False),
        sa.Column("stage_code", sa.String(32), nullable=False),
        sa.Column("stage_name", sa.String(120), nullable=False),
        sa.Column("phase_name", sa.String(120), nullable=True),
        sa.Column("event", sa.String(32), nullable=False, index=True),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("actor_name", sa.String(255), nullable=True),
        sa.Column("responsible_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("responsible_name", sa.String(255), nullable=True),
        sa.Column("planned_end", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("delay_days", sa.Integer(), nullable=True),
        sa.Column("checklist_done", sa.Integer(), nullable=True),
        sa.Column("checklist_total", sa.Integer(), nullable=True),
        sa.Column("document_count", sa.Integer(), nullable=True),
        sa.Column("old_value", sa.String(255), nullable=True),
        sa.Column("new_value", sa.String(255), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, index=True),
    )
    op.execute("""
        INSERT INTO installation_project_stage_events (
            id, project_id, stage_id, stage_order, stage_code, stage_name, phase_name, event,
            actor_id, actor_name, responsible_user_id, responsible_name, planned_end, started_at, completed_at,
            delay_days, checklist_done, checklist_total, document_count, note, created_at)
        SELECT gen_random_uuid(), s.project_id, s.id, s.stage_order, s.code, s.name,
               CASE s.code WHEN 'kesif' THEN 'Keşif' WHEN 'teklif' THEN 'Teklif' WHEN 'onay' THEN 'Teklif'
                           WHEN 'uretim' THEN 'Üretim ve montaj' WHEN 'montaj_test' THEN 'Üretim ve montaj'
                           ELSE 'Kapanış' END,
               'completed', s.completed_by, cb.full_name, s.responsible_user_id, ru.full_name,
               s.planned_end, s.started_at, s.completed_at,
               CASE WHEN s.planned_end IS NOT NULL THEN (s.completed_at::date - s.planned_end::date) END,
               (SELECT count(*) FILTER (WHERE c.is_done) FROM installation_project_checklist_items c WHERE c.stage_id = s.id),
               (SELECT count(*) FROM installation_project_checklist_items c WHERE c.stage_id = s.id),
               (SELECT count(*) FROM installation_project_documents d WHERE d.stage_id = s.id),
               'Geriye dönük kayıt (kayıt listesi açılmadan önce tamamlanmış adım)', s.completed_at
        FROM installation_project_stages s
        LEFT JOIN users cb ON cb.id = s.completed_by
        LEFT JOIN users ru ON ru.id = s.responsible_user_id
        WHERE s.status = 'completed' AND s.completed_at IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_table("installation_project_stage_events")
    op.create_index("uq_installation_project_cost_fixed", "installation_project_costs", ["project_id", "kind", "category"],
                    unique=True, postgresql_where=sa.text("category <> 'ek'"))
    op.execute(f"""
        UPDATE installation_project_checklist_items c
        SET stage_id = u.id, sort_order = c.sort_order + 100
        FROM installation_project_stages mt
        JOIN installation_project_stages u ON u.project_id = mt.project_id AND u.code = 'uretim'
        WHERE c.stage_id = mt.id AND mt.code = 'montaj_test' AND c.label IN {MONTAGE_ITEMS!r}
    """)
    op.execute("UPDATE installation_project_stages SET code = 'test', name = 'Devreye alma ve test' WHERE code = 'montaj_test'")
    op.execute("UPDATE installation_project_stages SET code = 'uretim_montaj', name = 'Üretim ve montaj' WHERE code = 'uretim'")
