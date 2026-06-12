-- Add loyalty and preference tracking columns to contacts table
ALTER TABLE coexistence.contacts 
ADD COLUMN IF NOT EXISTS meenzy_coins INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by TEXT,
ADD COLUMN IF NOT EXISTS preferences TEXT;

-- Generate random referral codes for existing users who don't have one
-- using substring of md5 hash of contact_number + salt
UPDATE coexistence.contacts
SET referral_code = 'MZ' || UPPER(SUBSTRING(md5(contact_number || 'meenzy_salt'), 1, 6))
WHERE referral_code IS NULL AND contact_number IS NOT NULL;
