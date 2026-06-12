-- Add missing payment_status column to ecosystem_orders

ALTER TABLE coexistence.ecosystem_orders
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING';
