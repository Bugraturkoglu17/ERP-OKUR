"""Check development isolation and explicit production opt-in without DB access."""
from pathlib import Path
import sys
from pydantic import ValidationError
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/backend"))
from app.core.config import Settings

production = dict(ENV="production", DATABASE_URL="postgresql://test:test@ep-okur.eu-central-1.aws.neon.tech/okur_erp?sslmode=require",
    OKUR_PRODUCTION_DB_HOST="ep-okur.eu-central-1.aws.neon.tech", SECRET_KEY="test-only-key-that-is-longer-than-thirty-two-characters",
    AUTO_CREATE_SCHEMA=False, AUTO_SEED_LOCAL_DATA=False, FRONTEND_URL="https://okur.example.invalid")
Settings(_env_file=None, **production)
Settings(_env_file=None, ENV="development", DATABASE_URL="postgresql://test:test@localhost/okur_erp_local")
blocked = [
    dict(ENV="development", DATABASE_URL="postgresql://test:test@remote.example/okur_erp_local"),
    dict(ENV="development", DATABASE_URL="postgresql://test:test@localhost/other_erp"),
    {**production, "OKUR_PRODUCTION_DB_HOST": ""},
    {**production, "DATABASE_URL": "postgresql://test:test@ep-other.eu-central-1.aws.neon.tech/okur_erp?sslmode=require"},
    {**production, "DATABASE_URL": production["DATABASE_URL"].replace("/okur_erp?", "/other_erp?")},
    {**production, "DATABASE_URL": production["DATABASE_URL"].replace("?sslmode=require", "")},
    {**production, "SECRET_KEY": "weak"},
    {**production, "AUTO_CREATE_SCHEMA": True},
    {**production, "AUTO_SEED_LOCAL_DATA": True},
    {**production, "FRONTEND_URL": "http://localhost:3001"},
]
for config in blocked:
    try:
        Settings(_env_file=None, **config)
    except ValidationError:
        continue
    raise AssertionError("Unsafe configuration was accepted")
print(f"PASS: 2 valid configurations, {len(blocked)} unsafe configurations rejected")
