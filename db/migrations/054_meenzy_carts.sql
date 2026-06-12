CREATE TABLE IF NOT EXISTS coexistence.meenzy_carts (
    whatsapp_id VARCHAR(50) PRIMARY KEY,
    cart_items JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meenzy_carts_updated_at 
    ON coexistence.meenzy_carts (updated_at);
