-- Migration: Add predictive nudge tracking

ALTER TABLE coexistence.contacts
ADD COLUMN IF NOT EXISTS last_reorder_nudge_at TIMESTAMP WITH TIME ZONE;
