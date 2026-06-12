-- 056_instagram_support.sql
-- Add Instagram Accounts and platform column to handle multi-platform messaging

CREATE TABLE IF NOT EXISTS coexistence.instagram_accounts (
  id                       BIGSERIAL PRIMARY KEY,
  page_name                TEXT NOT NULL,
  page_id                  TEXT NOT NULL UNIQUE,
  ig_account_id            TEXT NOT NULL UNIQUE,
  access_token_encrypted   TEXT NOT NULL,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alter chat_history
ALTER TABLE coexistence.chat_history
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'whatsapp';

-- Alter contacts
ALTER TABLE coexistence.contacts
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'whatsapp';

-- Drop the old unique constraint on (wa_number, contact_number)
ALTER TABLE coexistence.contacts
  DROP CONSTRAINT IF EXISTS contacts_wa_number_contact_number_key;

-- Add new unique constraint spanning platform
ALTER TABLE coexistence.contacts
  ADD CONSTRAINT contacts_platform_wa_number_contact_number_key UNIQUE (platform, wa_number, contact_number);

-- Update indexes for chat_history to include platform if necessary
-- For now, the existing indexes on wa_number + contact_number will still work well, 
-- but we could optionally create platform-specific indexes later.
