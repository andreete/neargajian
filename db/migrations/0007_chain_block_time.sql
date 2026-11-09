ALTER TABLE `payout_actions` ADD `chain_block_time` integer;--> statement-breakpoint
-- The chain block time of a confirmed action is set once and never changed.
CREATE TRIGGER payout_actions_block_time_final
BEFORE UPDATE OF chain_block_time ON payout_actions
WHEN OLD.chain_block_time IS NOT NULL AND (NEW.chain_block_time IS NULL OR NEW.chain_block_time <> OLD.chain_block_time)
BEGIN
  SELECT RAISE(ABORT, 'payout_actions: the chain block time is final');
END;
--> statement-breakpoint
-- Only a succeeded action with a transaction can carry a block time.
CREATE TRIGGER payout_actions_block_time_requires_success
BEFORE UPDATE OF chain_block_time ON payout_actions
WHEN NEW.chain_block_time IS NOT NULL AND (NEW.status <> 'succeeded' OR NEW.tx_hash IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'payout_actions: block time only for a succeeded transaction');
END;
