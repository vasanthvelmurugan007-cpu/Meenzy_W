CREATE TABLE IF NOT EXISTS coexistence.meenzy_temporary_carts (
    whatsapp_id VARCHAR(50) PRIMARY KEY,
    cart_json JSONB DEFAULT '{}'::jsonb,
    current_step VARCHAR(50) DEFAULT 'browsing',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temp_carts_updated ON coexistence.meenzy_temporary_carts(updated_at) 
WHERE current_step != 'completed';
