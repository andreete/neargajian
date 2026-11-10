CREATE TABLE `advance_deductions` (
	`version_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`advance_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`month` text NOT NULL,
	`gross` text NOT NULL,
	`instalment` text NOT NULL,
	`net` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`version_id`, `row_index`),
	FOREIGN KEY (`version_id`) REFERENCES `run_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advance_id`) REFERENCES `payroll_advances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `advance_deductions_advance_ix` ON `advance_deductions` (`advance_id`);--> statement-breakpoint
CREATE TABLE `advance_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`advance_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` text NOT NULL,
	`version_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`tx_hash` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`advance_id`) REFERENCES `payroll_advances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `run_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "advance_ledger_kind_ck" CHECK(kind IN ('advance', 'instalment'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `advance_ledger_row_uq` ON `advance_ledger` (`version_id`,`row_index`,`kind`);--> statement-breakpoint
CREATE INDEX `advance_ledger_recipient_ix` ON `advance_ledger` (`recipient_id`,`id`);--> statement-breakpoint
CREATE TABLE `payroll_advances` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`employee_user_id` text NOT NULL,
	`amount` text NOT NULL,
	`fee` text NOT NULL,
	`net` text NOT NULL,
	`instalment_count` integer NOT NULL,
	`instalment` text NOT NULL,
	`last_instalment` text NOT NULL,
	`reason` text,
	`consent_text` text NOT NULL,
	`consented_at` integer NOT NULL,
	`expected_months` text NOT NULL,
	`policy_snapshot` text NOT NULL,
	`eligibility_at_request` text NOT NULL,
	`eligibility_at_submit` text,
	`status` text NOT NULL,
	`status_detail` text,
	`decided_by_user_id` text,
	`decided_at` integer,
	`run_id` text,
	`paid_at` integer,
	`repaid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payroll_advances_status_ck" CHECK(status IN ('requested', 'declined', 'submitted', 'approved', 'paid', 'repaid', 'rejected', 'cancelled', 'failed')),
	CONSTRAINT "payroll_advances_count_ck" CHECK(instalment_count BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE INDEX `payroll_advances_recipient_ix` ON `payroll_advances` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_advances_run_uq` ON `payroll_advances` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_advances_one_open_uq` ON `payroll_advances` (`recipient_id`) WHERE status IN ('requested', 'submitted', 'approved', 'paid');--> statement-breakpoint
-- Hand-written (Phase 23). drizzle-kit wanted to rebuild `users` and `payroll_runs`. The migrator
-- runs every pending migration in ONE transaction, where `PRAGMA foreign_keys=OFF` is a no-op, so:
--  * users: rebuilt (its role CHECK gains 'employee') with foreign-key checks DEFERRED to the commit
--    (copied aside, dropped, recreated and re-inserted with every id, which settles the deferred checks). DROP TABLE runs an implicit DELETE that cascades to
--    sessions (ON DELETE CASCADE), so the sessions are copied first and put back afterwards.
--  * payroll_runs: NOT rebuilt (draft_rows would cascade, and its triggers would be lost): the two
--    columns are added, and the kind/advance rule is enforced by triggers.
PRAGMA defer_foreign_keys = ON;--> statement-breakpoint
CREATE TABLE `__keep_users` AS SELECT * FROM `users`;--> statement-breakpoint
CREATE TABLE `__keep_sessions` AS SELECT * FROM `sessions`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`chain_account_id` text,
	`created_at` integer NOT NULL,
	`disabled_at` integer,
	`recipient_id` text REFERENCES `recipients`(`id`),
	CONSTRAINT "users_role_ck" CHECK(role IN ('maker', 'approver', 'admin', 'employee')),
	CONSTRAINT "users_email_lower_ck" CHECK(email = lower(email)),
	CONSTRAINT "users_employee_recipient_ck" CHECK((role = 'employee') = (recipient_id IS NOT NULL))
);
--> statement-breakpoint
-- Re-inserting the parent rows after the drop settles the deferred foreign-key checks.
INSERT INTO `users`("id", "email", "display_name", "role", "password_hash", "chain_account_id", "created_at", "disabled_at", "recipient_id") SELECT "id", "email", "display_name", "role", "password_hash", "chain_account_id", "created_at", "disabled_at", NULL FROM `__keep_users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_chain_account_uq` ON `users` (`chain_account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_recipient_uq` ON `users` (`recipient_id`);--> statement-breakpoint
INSERT INTO `sessions` SELECT * FROM `__keep_sessions` WHERE `id` NOT IN (SELECT `id` FROM `sessions`);--> statement-breakpoint
DROP TABLE `__keep_sessions`;--> statement-breakpoint
DROP TABLE `__keep_users`;--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD `kind` text DEFAULT 'payroll' NOT NULL CONSTRAINT "payroll_runs_kind_ck" CHECK(kind IN ('payroll', 'advance'));--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD `advance_id` text REFERENCES `payroll_advances`(`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_runs_advance_uq` ON `payroll_runs` (`advance_id`);--> statement-breakpoint
CREATE TRIGGER payroll_runs_kind_insert
BEFORE INSERT ON payroll_runs
WHEN NOT ((NEW.kind = 'payroll' AND NEW.advance_id IS NULL) OR (NEW.kind = 'advance' AND NEW.advance_id IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT, 'payroll_runs: an advance run needs its advance_id, a payroll run has none');
END;
--> statement-breakpoint
CREATE TRIGGER payroll_runs_kind_fixed
BEFORE UPDATE OF kind, advance_id ON payroll_runs
WHEN NEW.kind IS NOT OLD.kind OR NEW.advance_id IS NOT OLD.advance_id
BEGIN
  SELECT RAISE(ABORT, 'payroll_runs: the run kind and its advance are fixed');
END;
--> statement-breakpoint
ALTER TABLE `recipients` ADD `monthly_net_pay` text;--> statement-breakpoint
ALTER TABLE `recipients` ADD `start_date` text CONSTRAINT "recipients_start_date_ck" CHECK(start_date IS NULL OR start_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]');--> statement-breakpoint
-- Payroll Advance terms and consent are fixed once requested; requests are never deleted.
CREATE TRIGGER payroll_advances_terms_fixed
BEFORE UPDATE OF recipient_id, employee_user_id, amount, fee, net, instalment_count, instalment, last_instalment, reason, consent_text, consented_at, expected_months, policy_snapshot, eligibility_at_request, created_at ON payroll_advances
BEGIN
  SELECT RAISE(ABORT, 'payroll_advances: the terms and the consent of a request are fixed');
END;
--> statement-breakpoint
CREATE TRIGGER payroll_advances_run_set_once
BEFORE UPDATE OF run_id ON payroll_advances
WHEN OLD.run_id IS NOT NULL AND NEW.run_id IS NOT OLD.run_id
BEGIN
  SELECT RAISE(ABORT, 'payroll_advances: the run of an advance is set once');
END;
--> statement-breakpoint
CREATE TRIGGER payroll_advances_no_delete
BEFORE DELETE ON payroll_advances
BEGIN
  SELECT RAISE(ABORT, 'payroll_advances: requests are never deleted');
END;
--> statement-breakpoint
-- Instalments frozen with a version, and the ledger: append-only.
CREATE TRIGGER advance_deductions_no_update
BEFORE UPDATE ON advance_deductions
BEGIN
  SELECT RAISE(ABORT, 'advance_deductions: instalments are frozen with the version');
END;
--> statement-breakpoint
CREATE TRIGGER advance_deductions_no_delete
BEFORE DELETE ON advance_deductions
BEGIN
  SELECT RAISE(ABORT, 'advance_deductions: instalments are frozen with the version');
END;
--> statement-breakpoint
CREATE TRIGGER advance_ledger_no_update
BEFORE UPDATE ON advance_ledger
BEGIN
  SELECT RAISE(ABORT, 'advance_ledger: the ledger is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER advance_ledger_no_delete
BEFORE DELETE ON advance_ledger
BEGIN
  SELECT RAISE(ABORT, 'advance_ledger: the ledger is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER advance_deductions_insert_only_while_submitting
BEFORE INSERT ON advance_deductions
WHEN (SELECT status FROM run_versions WHERE id = NEW.version_id) IS NOT 'submitting'
BEGIN
  SELECT RAISE(ABORT, 'advance_deductions: instalments are added only while the version is frozen');
END;
