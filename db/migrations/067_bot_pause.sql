-- Add bot_paused_until to contacts for Human Handoff feature
ALTER TABLE coexistence.contacts
ADD COLUMN IF NOT EXISTS bot_paused_until TIMESTAMPTZ;
