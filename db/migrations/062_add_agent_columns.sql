-- Add missing columns for agent assignments

ALTER TABLE coexistence.meenzy_preorders
ADD COLUMN IF NOT EXISTS driver_id BIGINT REFERENCES coexistence.delivery_agents(id) ON DELETE SET NULL;

ALTER TABLE coexistence.ecosystem_orders
ADD COLUMN IF NOT EXISTS assigned_agent_id BIGINT REFERENCES coexistence.delivery_agents(id) ON DELETE SET NULL;
