from app.core.database import engine
from sqlalchemy import text, inspect

with engine.connect() as conn:
    r = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"))
    all_tables = [row[0] for row in r.fetchall()]
    work_tables = [t for t in all_tables if 'work' in t]
    print("Work tables:", work_tables)
    print("Total tables:", len(all_tables))
