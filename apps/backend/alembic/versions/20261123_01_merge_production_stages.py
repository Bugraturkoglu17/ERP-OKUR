"""Üretim, Malzeme hazırlığı ve Montaj aşamaları tek "Üretim ve montaj" aşamasında birleşir (9 → 7 aşama).

Var olan projelerde "uretim" aşaması birleşik aşamaya dönüşür; "malzeme" ve "montaj" aşamalarının
kontrol listesi maddeleri ve belgeleri ona taşınır, bu iki aşama silinir ve sonraki aşamalar
(test, teslim, kapanış) 5-7'ye kaydırılır. Birleşik aşamanın durumu üçünden hesaplanır:
hepsi tamamlandıysa tamamlandı, biri başladıysa devam ediyor, yoksa planlandı.

Revision ID: 20261123_01
Revises: 20261116_02
Create Date: 2026-11-23
"""

from alembic import op


revision = "20261123_01"
down_revision = "20261116_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        WITH parts AS (
            SELECT project_id,
                   bool_and(status = 'completed') AS all_done,
                   bool_or(status <> 'planned') AS any_started,
                   min(started_at) AS started_at,
                   max(completed_at) AS completed_at,
                   max(planned_end) AS planned_end,
                   (array_agg(responsible_user_id ORDER BY stage_order) FILTER (WHERE responsible_user_id IS NOT NULL))[1] AS responsible,
                   (array_agg(completed_by ORDER BY stage_order DESC) FILTER (WHERE completed_by IS NOT NULL))[1] AS completed_by,
                   string_agg(note, E'\\n' ORDER BY stage_order) AS note,
                   max(approval_requested_at) AS approval_requested_at,
                   (array_agg(approval_requested_by ORDER BY stage_order DESC) FILTER (WHERE approval_requested_by IS NOT NULL))[1] AS approval_requested_by
            FROM installation_project_stages
            WHERE code IN ('uretim', 'malzeme', 'montaj')
            GROUP BY project_id
        )
        UPDATE installation_project_stages s SET
            code = 'uretim_montaj',
            name = 'Üretim ve montaj',
            status = CASE WHEN p.all_done THEN 'completed' WHEN p.any_started THEN 'in_progress' ELSE 'planned' END,
            started_at = p.started_at,
            completed_at = CASE WHEN p.all_done THEN p.completed_at END,
            completed_by = CASE WHEN p.all_done THEN p.completed_by END,
            planned_end = p.planned_end,
            responsible_user_id = p.responsible,
            note = p.note,
            approval_requested_at = CASE WHEN p.all_done THEN NULL ELSE p.approval_requested_at END,
            approval_requested_by = CASE WHEN p.all_done THEN NULL ELSE p.approval_requested_by END,
            overdue_notified_at = NULL
        FROM parts p
        WHERE s.project_id = p.project_id AND s.code = 'uretim'
    """)
    # Kontrol listesi ve belgeler birleşik aşamaya taşınır (madde sırası korunur).
    op.execute("""
        UPDATE installation_project_checklist_items c
        SET stage_id = m.id, sort_order = c.sort_order + (old.stage_order - 4) * 100
        FROM installation_project_stages old
        JOIN installation_project_stages m ON m.project_id = old.project_id AND m.code = 'uretim_montaj'
        WHERE c.stage_id = old.id AND old.code IN ('malzeme', 'montaj')
    """)
    op.execute("""
        UPDATE installation_project_documents d SET stage_id = m.id
        FROM installation_project_stages old
        JOIN installation_project_stages m ON m.project_id = old.project_id AND m.code = 'uretim_montaj'
        WHERE d.stage_id = old.id AND old.code IN ('malzeme', 'montaj')
    """)
    op.execute("DELETE FROM installation_project_stages WHERE code IN ('malzeme', 'montaj')")
    # 7-9 → 5-7; (project_id, stage_order) tekil olduğu için iki adımda.
    op.execute("UPDATE installation_project_stages SET stage_order = stage_order + 100 WHERE stage_order >= 7")
    op.execute("UPDATE installation_project_stages SET stage_order = stage_order - 102 WHERE stage_order >= 107")


def downgrade() -> None:
    # Ayrı aşamalar geri açılır; birleşik aşamanın maddeleri ve belgeleri "Üretim"de kalır.
    op.execute("UPDATE installation_project_stages SET stage_order = stage_order + 100 WHERE stage_order >= 5")
    op.execute("UPDATE installation_project_stages SET stage_order = stage_order - 98 WHERE stage_order >= 105")
    op.execute("""
        INSERT INTO installation_project_stages (id, project_id, stage_order, code, name, status, responsible_user_id,
                                                started_at, completed_at)
        SELECT gen_random_uuid(), s.project_id, v.ord, v.code, v.name, s.status, s.responsible_user_id,
               s.started_at, s.completed_at
        FROM installation_project_stages s
        CROSS JOIN (VALUES (5, 'malzeme', 'Malzeme hazırlığı'), (6, 'montaj', 'Montaj')) AS v(ord, code, name)
        WHERE s.code = 'uretim_montaj'
    """)
    op.execute("UPDATE installation_project_stages SET code = 'uretim', name = 'Üretim' WHERE code = 'uretim_montaj'")
