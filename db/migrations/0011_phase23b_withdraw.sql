-- Hand-written (Phase 23b): the employee may withdraw a request while it is still "requested", so the
-- status CHECK of payroll_advances gains 'withdrawn'. SQLite cannot change a CHECK in place, so the
-- table is rebuilt. As in 0010 (users), the migrator runs in ONE transaction where
-- `PRAGMA foreign_keys=OFF` is a no-op: the foreign-key checks are DEFERRED to the commit, the rows
-- are copied aside, the table is dropped (its implicit DELETE fires no trigger and cascades nowhere:
-- payroll_runs.advance_id, advance_deductions and advance_ledger reference it with NO ACTION) and
-- recreated, and re-inserting every row with its id settles the deferred checks. The indexes and the
-- three triggers (terms fixed, run set once, never deleted) are recreated unchanged.
PRAGMA defer_foreign_keys = ON;--> statement-breakpoint
CREATE TABLE `__keep_payroll_advances` AS SELECT * FROM `payroll_advances`;--> statement-breakpoint
DROP TABLE `payroll_advances`;--> statement-breakpoint
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
	CONSTRAINT "payroll_advances_status_ck" CHECK(status IN ('requested', 'declined', 'submitted', 'approved', 'paid', 'repaid', 'rejected', 'cancelled', 'failed', 'withdrawn')),
	CONSTRAINT "payroll_advances_count_ck" CHECK(instalment_count BETWEEN 1 AND 12)
);
--> statement-breakpoint
INSERT INTO `payroll_advances`("id", "recipient_id", "employee_user_id", "amount", "fee", "net", "instalment_count", "instalment", "last_instalment", "reason", "consent_text", "consented_at", "expected_months", "policy_snapshot", "eligibility_at_request", "eligibility_at_submit", "status", "status_detail", "decided_by_user_id", "decided_at", "run_id", "paid_at", "repaid_at", "created_at", "updated_at") SELECT "id", "recipient_id", "employee_user_id", "amount", "fee", "net", "instalment_count", "instalment", "last_instalment", "reason", "consent_text", "consented_at", "expected_months", "policy_snapshot", "eligibility_at_request", "eligibility_at_submit", "status", "status_detail", "decided_by_user_id", "decided_at", "run_id", "paid_at", "repaid_at", "created_at", "updated_at" FROM `__keep_payroll_advances`;--> statement-breakpoint
DROP TABLE `__keep_payroll_advances`;--> statement-breakpoint
CREATE INDEX `payroll_advances_recipient_ix` ON `payroll_advances` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_advances_run_uq` ON `payroll_advances` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_advances_one_open_uq` ON `payroll_advances` (`recipient_id`) WHERE status IN ('requested', 'submitted', 'approved', 'paid');--> statement-breakpoint
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
