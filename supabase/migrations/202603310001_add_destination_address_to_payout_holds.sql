-- Add destination_address column to withdrawal_holds for manual withdrawal requests
ALTER TABLE withdrawal_holds
  ADD COLUMN IF NOT EXISTS destination_address TEXT;

-- Backfill: extract address from existing reason strings like 'withdrawal_review:Abc123...'
UPDATE withdrawal_holds
SET destination_address = SUBSTRING(reason FROM 'withdrawal_review:(.+)$')
WHERE reason LIKE 'withdrawal_review:%'
  AND destination_address IS NULL;
