ALTER TABLE coexistence.contacts 
ADD COLUMN IF NOT EXISTS cohort_tags JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS preferred_order_day VARCHAR(20),
ADD COLUMN IF NOT EXISTS avg_order_value NUMERIC(10,2) DEFAULT 0;
