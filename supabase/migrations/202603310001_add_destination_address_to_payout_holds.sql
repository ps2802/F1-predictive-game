-- Add destination_address column to payout_holds for withdrawal requests
ALTER TABLE payout_holds
  ADD COLUMN IF NOT EXISTS destination_address TEXT;

-- Backfill: extract address from existing reason strings like 'withdrawal_review:Abc123...'
UPDATE payout_holds
SET destination_address = SUBSTRING(reason FROM 'withdrawal_review:(.+)$')
WHERE reason LIKE 'withdrawal_review:%'
  AND destination_address IS NULL;
