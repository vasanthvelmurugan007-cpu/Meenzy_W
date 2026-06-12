-- Fix missing delivery_agents table and ecosystem_orders columns

CREATE TABLE IF NOT EXISTS coexistence.delivery_agents (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    zone TEXT,
    vehicle_info TEXT,
    pin_hash TEXT,
    auth_token TEXT,
    last_lat NUMERIC(9,6),
    last_lng NUMERIC(9,6),
    last_location_update TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE coexistence.ecosystem_orders
ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6),
ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6);

DROP VIEW IF EXISTS coexistence.meenzy_delivery_agents;
CREATE OR REPLACE VIEW coexistence.meenzy_delivery_agents AS
SELECT *, last_lat AS driver_lat, last_lng AS driver_lng
FROM coexistence.delivery_agents;
