-- Add missing columns for Wix webhook integration
ALTER TABLE coexistence.ecosystem_orders
ADD COLUMN IF NOT EXISTS delivery_otp TEXT,
ADD COLUMN IF NOT EXISTS display_id TEXT;

ALTER TABLE coexistence.meenzy_preorders
ADD COLUMN IF NOT EXISTS otp TEXT,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS display_id TEXT;
