DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cart_status') THEN
        CREATE TYPE coexistence.cart_status AS ENUM ('active', 'abandoned', 'converted');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_state') THEN
        CREATE TYPE coexistence.user_state AS ENUM ('BROWSING', 'ITEM_SELECTED', 'QUANTITY_PICKED', 'CART_REVIEW', 'CHECKOUT');
    END IF;
END$$;

ALTER TABLE coexistence.meenzy_carts
  ADD COLUMN IF NOT EXISTS status coexistence.cart_status DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS current_state coexistence.user_state DEFAULT 'BROWSING',
  ADD COLUMN IF NOT EXISTS state_context JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_meenzy_carts_status_updated 
ON coexistence.meenzy_carts (status, updated_at);
