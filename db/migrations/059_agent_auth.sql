-- Add Authentication columns to delivery agents

ALTER TABLE coexistence.delivery_agents
ADD COLUMN IF NOT EXISTS pin_hash TEXT,
ADD COLUMN IF NOT EXISTS auth_token TEXT;
