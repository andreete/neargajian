CREATE TABLE `testnet_run_events` (
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`signer_account` text NOT NULL,
	`method` text NOT NULL,
	`row_index` integer,
	`success` integer NOT NULL,
	`error` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`run_id`, `seq`),
	FOREIGN KEY (`run_id`) REFERENCES `testnet_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `testnet_run_events_tx_uq` ON `testnet_run_events` (`tx_hash`);--> statement-breakpoint
CREATE INDEX `testnet_run_events_signer_ix` ON `testnet_run_events` (`signer_account`);--> statement-breakpoint
CREATE TABLE `testnet_run_rows` (
	`run_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`receiver_account` text NOT NULL,
	`amount` text NOT NULL,
	`paid_tx_hash` text,
	`paid_at` integer,
	PRIMARY KEY(`run_id`, `row_index`),
	FOREIGN KEY (`run_id`) REFERENCES `testnet_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `testnet_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`vault_account` text NOT NULL,
	`vault_generation` text NOT NULL,
	`title` text NOT NULL,
	`maker_user_id` text,
	`kind` text NOT NULL,
	`release_mode` text NOT NULL,
	`approver_accounts` text NOT NULL,
	`status` text NOT NULL,
	`rejection_reason` text,
	`row_count` integer NOT NULL,
	`total` text NOT NULL,
	`payout_root` text,
	`review_digest` text,
	`created_at` integer NOT NULL,
	`created_tx_hash` text NOT NULL,
	FOREIGN KEY (`maker_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "testnet_runs_status_ck" CHECK(status IN ('paid', 'rejected', 'incomplete'))
);
--> statement-breakpoint
CREATE INDEX `testnet_runs_maker_ix` ON `testnet_runs` (`maker_user_id`);--> statement-breakpoint
-- Imported chain history is evidence: never updated or deleted.
CREATE TRIGGER testnet_runs_immutable BEFORE UPDATE ON testnet_runs BEGIN SELECT RAISE(ABORT, 'testnet_runs: imported chain history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER testnet_runs_no_delete BEFORE DELETE ON testnet_runs BEGIN SELECT RAISE(ABORT, 'testnet_runs: imported chain history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER testnet_run_rows_immutable BEFORE UPDATE ON testnet_run_rows BEGIN SELECT RAISE(ABORT, 'testnet_run_rows: imported chain history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER testnet_run_rows_no_delete BEFORE DELETE ON testnet_run_rows BEGIN SELECT RAISE(ABORT, 'testnet_run_rows: imported chain history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER testnet_run_events_immutable BEFORE UPDATE ON testnet_run_events BEGIN SELECT RAISE(ABORT, 'testnet_run_events: imported chain history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER testnet_run_events_no_delete BEFORE DELETE ON testnet_run_events BEGIN SELECT RAISE(ABORT, 'testnet_run_events: imported chain history is immutable'); END;
