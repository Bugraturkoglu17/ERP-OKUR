FROM python:3.12-slim-bookworm
WORKDIR /app
COPY apps/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/backend/app ./app
COPY apps/backend/alembic ./alembic
COPY apps/backend/alembic.ini ./alembic.ini
COPY scripts/import_local_stores.py /bootstrap/scripts/import_local_stores.py
COPY scripts/production_smoke.py /bootstrap/scripts/production_smoke.py
COPY data/okur-stores.json.gz /bootstrap/data/okur-stores.json.gz
RUN useradd --system --create-home bootstrap
USER bootstrap
# Run each phase explicitly; importing again refuses a nonempty target.
CMD ["alembic", "upgrade", "head"]
