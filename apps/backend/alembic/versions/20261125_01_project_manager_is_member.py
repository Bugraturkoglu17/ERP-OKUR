"""Proje sorumlusu projeye atanmış sayılır: var olan projelerde eksik atama satırları eklenir.

Revision ID: 20261125_01
Revises: 20261123_01
Create Date: 2026-11-25
"""

from alembic import op


revision = "20261125_01"
down_revision = "20261123_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO installation_project_members (id, project_id, user_id, added_by, added_at)
        SELECT gen_random_uuid(), p.id, p.manager_user_id, p.manager_user_id, now()
        FROM installation_projects p
        WHERE p.manager_user_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM installation_project_members m
              WHERE m.project_id = p.id AND m.user_id = p.manager_user_id
          )
        """
    )


def downgrade() -> None:
    # Eklenen satırlar diğer atamalardan ayırt edilemediği için geri alınmaz.
    pass
