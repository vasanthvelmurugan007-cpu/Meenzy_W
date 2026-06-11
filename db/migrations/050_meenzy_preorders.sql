-- Create the core preorders table for storing incoming customer requests
CREATE TABLE IF NOT EXISTS coexistence.meenzy_preorders (
    id BIGSERIAL PRIMARY KEY,
    customer_phone TEXT NOT NULL,
    ordered_item TEXT NOT NULL,
    quantity NUMERIC(5,2) NOT NULL,
    order_status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create and seed the fixed item catalog with standard pricing definitions
CREATE TABLE IF NOT EXISTS coexistence.meenzy_catalog (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    item_name TEXT NOT NULL,
    price_in_inr INTEGER NOT NULL
);

INSERT INTO coexistence.meenzy_catalog (category, item_name, price_in_inr) VALUES 
('Premium Sea Fish', 'Seer Fish / Vanjaram', 950),
('Premium Sea Fish', 'Pomfret', 850),
('Prawns & Shellfish', 'White Prawns / Iral', 650),
('Fresh Water', 'Rohu', 300)
ON CONFLICT DO NOTHING;
