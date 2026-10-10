"""Ensure the Okur local build refuses production and Sismik databases."""

from pathlib import Path
import sys

from pydantic import ValidationError


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "backend"))
from app.core.config import Settings  # noqa: E402


cases = (
    ("production", "postgresql+psycopg2://x:y@localhost:5432/okur_erp_local"),
    ("development", "postgresql+psycopg2://x:y@remote.example:5432/okur_erp_local"),
    ("development", "postgresql+psycopg2://x:y@localhost:5432/sismik_erp"),
)

for environment, database_url in cases:
    try:
        Settings(_env_file=None, ENV=environment, DATABASE_URL=database_url)
    except ValidationError:
        print("Unsafe configuration blocked")
    else:
        raise AssertionError("Unsafe configuration was accepted")
