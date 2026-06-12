-- Migration 060: Patch delivery agents and bulk quotes tables/views

-- 0. Add DELIVERED value to ecosystem_order_status enum
ALTER TYPE coexistence.ecosystem_order_status ADD VALUE IF NOT EXISTS 'DELIVERED';

-- 1. Create meenzy_bulk_quotes table
CREATE TABLE IF NOT EXISTS coexistence.meenzy_bulk_quotes (
    id BIGSERIAL PRIMARY KEY,
    customer_phone TEXT NOT NULL,
    fish_name TEXT NOT NULL,
    quantity_kg NUMERIC(10,2) NOT NULL,
    delivery_date TEXT NOT NULL,
    occasion TEXT NOT NULL,
    status TEXT DEFAULT 'pending_review',
    quoted_price NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add missing columns to delivery_agents
ALTER TABLE coexistence.delivery_agents 
ADD COLUMN IF NOT EXISTS last_lat NUMERIC(9,6),
ADD COLUMN IF NOT EXISTS last_lng NUMERIC(9,6),
ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ;

-- 3. Recreate meenzy_delivery_agents view with lat/lng mappings
DROP VIEW IF EXISTS coexistence.meenzy_delivery_agents;
CREATE OR REPLACE VIEW coexistence.meenzy_delivery_agents AS
SELECT *, last_lat AS driver_lat, last_lng AS driver_lng
FROM coexistence.delivery_agents;

-- 4. Create delivery_agent_payouts table
CREATE TABLE IF NOT EXISTS coexistence.delivery_agent_payouts (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT REFERENCES coexistence.delivery_agents(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
