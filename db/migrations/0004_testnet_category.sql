-- 09b: classify imported testnet runs. "operations" = a treasury movement through the
-- vault (the Phase 04 retirement of the Phase 02 vault), excluded from payroll counts and
-- totals. Hand-written (ADD COLUMN, no table rebuild) to keep the immutability triggers and
-- child rows intact; the triggers are lifted only for this one data correction.
ALTER TABLE `testnet_runs` ADD `category` text DEFAULT 'payroll' NOT NULL CHECK (category IN ('payroll', 'operations'));
--> statement-breakpoint
DROP TRIGGER testnet_runs_immutable;
--> statement-breakpoint
UPDATE `testnet_runs` SET `category` = 'operations' WHERE `id` = 'p02-drain';
--> statement-breakpoint
CREATE TRIGGER testnet_runs_immutable BEFORE UPDATE ON testnet_runs BEGIN SELECT RAISE(ABORT, 'testnet_runs: imported chain history is immutable'); END;
