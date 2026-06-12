-- Phase 1: Database Architecture & State Machine

-- Enums
DO $$ BEGIN
    CREATE TYPE coexistence.ecosystem_order_status AS ENUM (
        'CREATED', 
        'PENDING_VERIFICATION', 
        'VERIFIED_READY', 
        'PACKED', 
        'DISPATCHED_TO_3PL', 
        'DELIVERY_FAILED_DISPUTED', 
        'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE coexistence.ecosystem_delivery_status AS ENUM (
        'PENDING', 
        'ASSIGNED', 
        'DISPATCHED', 
        'NEARBY', 
        'DELIVERED', 
        'FAILED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Core Tables
CREATE TABLE IF NOT EXISTS coexistence.ecosystem_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wix_order_id TEXT UNIQUE,
    user_phone TEXT NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    status coexistence.ecosystem_order_status DEFAULT 'CREATED',
    address_line TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coexistence.ecosystem_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES coexistence.ecosystem_orders(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS coexistence.ecosystem_stock_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    order_id UUID REFERENCES coexistence.ecosystem_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coexistence.ecosystem_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES coexistence.ecosystem_orders(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'SENT', -- SENT, EXPIRED, VERIFIED
    otp_code TEXT,
    otp_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coexistence.ecosystem_delivery_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES coexistence.ecosystem_orders(id) ON DELETE CASCADE,
    status coexistence.ecosystem_delivery_status DEFAULT 'PENDING',
    provider_job_id TEXT,
    rider_name TEXT,
    rider_phone TEXT,
    rider_lat NUMERIC(9,6),
    rider_lng NUMERIC(9,6),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS coexistence.ecosystem_order_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES coexistence.ecosystem_orders(id) ON DELETE CASCADE,
    from_status coexistence.ecosystem_order_status,
    to_status coexistence.ecosystem_order_status NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coexistence.ecosystem_delivery_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES coexistence.ecosystem_delivery_jobs(id) ON DELETE CASCADE,
    from_status coexistence.ecosystem_delivery_status,
    to_status coexistence.ecosystem_delivery_status NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coexistence.ecosystem_idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
