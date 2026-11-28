"""Allow reusing a retired vehicle plate or main depot slot."""
from alembic import op
import sqlalchemy as sa

revision = "20261128_01"
down_revision = "20261127_03"
branch_labels = depends_on = None


def upgrade():
    op.drop_constraint("uq_retail_depot_tenant_plate", "retail_depots", type_="unique")
    op.drop_index("uq_retail_depots_main_per_tenant", table_name="retail_depots")
    op.create_index("uq_retail_depot_tenant_plate", "retail_depots", ["tenant_id", "plate"],
                    unique=True, postgresql_where=sa.text("is_active"))
    op.create_index("uq_retail_depots_main_per_tenant", "retail_depots", ["tenant_id"],
                    unique=True, postgresql_where=sa.text("kind = 'main' AND is_active"))


def downgrade():
    op.drop_index("uq_retail_depot_tenant_plate", table_name="retail_depots")
    op.drop_index("uq_retail_depots_main_per_tenant", table_name="retail_depots")
    op.create_unique_constraint("uq_retail_depot_tenant_plate", "retail_depots", ["tenant_id", "plate"])
    op.create_index("uq_retail_depots_main_per_tenant", "retail_depots", ["tenant_id"],
                    unique=True, postgresql_where=sa.text("kind = 'main'"))
