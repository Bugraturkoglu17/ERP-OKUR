-- ====================================================================
--  Sismik Mekanik ERP — PostgreSQL Initialisation Scripts
--  Bu dosya docker-entrypoint-initdb.d tarafından ilk kurulumda
--  otomatik olarak çalıştırılır.
-- ====================================================================

-- ── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";         -- UUID üretimi
CREATE EXTENSION IF NOT EXISTS "pgcrypto";           -- Şifre hash (bcrypt opsiyonu)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";            -- Metin benzerlik arama (ör. şube / proje arama)

-- ── Shared Lookup / Enum Tables ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_status (
    id          SMALLINT PRIMARY KEY,
    name_tr     TEXT    NOT NULL UNIQUE,
    name_en     TEXT    NOT NULL UNIQUE,
    color       TEXT,                  -- frontend kanban rengi (hex)
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    is_terminal BOOLEAN NOT NULL DEFAULT FALSE   -- teslim edildi / iptal
);

INSERT INTO project_status (id, name_tr, name_en, color, sort_order, is_terminal)
VALUES
    (1, 'Keşif Aşamasında',   'Inquiry Stage',      '#94a3b8', 1, FALSE),
    (2, 'Teklif Verildi',     'Offer Submitted',    '#3b82f6', 2, FALSE),
    (3, 'Onaylandı',          'Approved',           '#8b5cf6', 3, FALSE),
    (4, 'Saha Çalışması',    'Field Work Started',  '#f59e0b', 4, FALSE),
    (5, 'Hakediş Bekliyor',   'Awaiting Invoice',   '#f97316', 5, FALSE),
    (6, 'Teslim Edildi',      'Completed',          '#22c55e', 6, TRUE),
    (7, 'İptal',              'Cancelled',          '#ef4444', 7, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS work_scopes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        TEXT    NOT NULL UNIQUE,   -- HVAC, FIRE, SEISMIC …
    name_tr     TEXT    NOT NULL UNIQUE,
    name_en     TEXT    NOT NULL UNIQUE,
    description TEXT
);

INSERT INTO work_scopes (code, name_tr, name_en, description)
VALUES
    ('HVAC',        'İklimlendirme / Havalandırma',     'HVAC / Ventilation',         NULL),
    ('FIRE',        'Yangın Söndürme Sistemi',          'Fire Suppression System',    NULL),
    ('SEISMIC',     'Sismik Koruma',                     'Seismic Protection',         NULL),
    ('MECHANICAL',  'Mekanik Tesisat',                   'Mechanical Installation',    NULL),
    ('ELECTRICAL',  'Elektrik Tesisatı',                  'Electrical Works',           NULL)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS inventory_item_types (
    id          SMALLINT PRIMARY KEY,
    name_tr     TEXT    NOT NULL UNIQUE,
    name_en     TEXT    NOT NULL UNIQUE,
    requires_batch BOOLEAN NOT NULL DEFAULT FALSE   -- KDV gibi takip gerektirenler
);

INSERT INTO inventory_item_types (id, name_tr, name_en, requires_batch)
VALUES
    (1, 'Boru',                'Pipe',                FALSE),
    (2, 'Fitting',             'Fitting',             FALSE),
    (3, 'Aparat',              'Hardware / Bracket',  FALSE),
    (4, 'Ekipman',             'Equipment',           TRUE),
    (5, 'Sarf Malzemesi',      'Consumable',          FALSE)
ON CONFLICT (id) DO NOTHING;
