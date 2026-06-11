CREATE TABLE IF NOT EXISTS coexistence.meenzy_refunds (
    id BIGSERIAL PRIMARY KEY,
    preorder_id BIGINT REFERENCES coexistence.meenzy_preorders(id) ON DELETE SET NULL,
    customer_phone TEXT NOT NULL,
    item_name TEXT NOT NULL,
    refund_amount INTEGER NOT NULL,
    refund_status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
