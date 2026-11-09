CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by_user_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assistant_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`request_text` text NOT NULL,
	`outcome` text NOT NULL,
	`structured` text,
	`message` text,
	`model` text,
	`run_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assistant_requests_outcome_ck" CHECK(outcome IN ('preview', 'question', 'refused', 'error', 'created'))
);
--> statement-breakpoint
CREATE INDEX `assistant_requests_user_ix` ON `assistant_requests` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_requests_run_uq` ON `assistant_requests` (`run_id`);--> statement-breakpoint
CREATE TABLE `recipient_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`source` text NOT NULL,
	`changes` text NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipient_events_action_ck" CHECK(action IN ('created', 'updated', 'deactivated', 'reactivated', 'readiness_checked'))
);
--> statement-breakpoint
CREATE INDEX `recipient_events_recipient_ix` ON `recipient_events` (`recipient_id`,`at`);--> statement-breakpoint
CREATE INDEX `recipient_events_at_ix` ON `recipient_events` (`at`);--> statement-breakpoint
CREATE TABLE `recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`near_account_id` text NOT NULL,
	`name` text NOT NULL,
	`division` text NOT NULL,
	`email` text NOT NULL,
	`mobile_phone` text NOT NULL,
	`max_amount` text NOT NULL,
	`active` integer NOT NULL,
	`sample` integer DEFAULT false NOT NULL,
	`readiness` text DEFAULT 'unchecked' NOT NULL,
	`readiness_checked_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipients_account_lower_ck" CHECK(near_account_id = lower(near_account_id)),
	CONSTRAINT "recipients_readiness_ck" CHECK(readiness IN ('unchecked', 'ready', 'no_account', 'not_registered', 'check_failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipients_account_uq` ON `recipients` (`near_account_id`);--> statement-breakpoint
CREATE INDEX `recipients_division_ix` ON `recipients` (`division`);--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD `assistant_request_id` text;--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD `assistant_request_text` text;--> statement-breakpoint
ALTER TABLE `run_versions` ADD `directory_check` text;--> statement-breakpoint
-- Recipients are deactivated, never deleted, so history stays readable.
CREATE TRIGGER recipients_no_delete
BEFORE DELETE ON recipients
BEGIN
  SELECT RAISE(ABORT, 'recipients: deactivate a recipient instead of deleting it');
END;
--> statement-breakpoint
CREATE TRIGGER recipients_account_fixed
BEFORE UPDATE OF near_account_id ON recipients
WHEN NEW.near_account_id <> OLD.near_account_id
BEGIN
  SELECT RAISE(ABORT, 'recipients: the NEAR account of a recipient never changes; add a new recipient');
END;
--> statement-breakpoint
-- The directory change log is append-only.
CREATE TRIGGER recipient_events_no_update
BEFORE UPDATE ON recipient_events
BEGIN
  SELECT RAISE(ABORT, 'recipient_events: the change log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER recipient_events_no_delete
BEFORE DELETE ON recipient_events
BEGIN
  SELECT RAISE(ABORT, 'recipient_events: the change log is append-only');
END;
--> statement-breakpoint
-- "Drafted by the payroll assistant from: …" is set at creation and never changes.
CREATE TRIGGER payroll_runs_assistant_fixed
BEFORE UPDATE OF assistant_request_id, assistant_request_text ON payroll_runs
WHEN OLD.assistant_request_id IS NOT NEW.assistant_request_id OR OLD.assistant_request_text IS NOT NEW.assistant_request_text
BEGIN
  SELECT RAISE(ABORT, 'payroll_runs: the assistant request of a run is fixed');
END;
--> statement-breakpoint
-- The directory check of a submitted version is part of its frozen snapshot.
CREATE TRIGGER run_versions_directory_check_fixed
BEFORE UPDATE OF directory_check ON run_versions
WHEN OLD.directory_check IS NOT NEW.directory_check
BEGIN
  SELECT RAISE(ABORT, 'run_versions: submitted version data is immutable');
END;
--> statement-breakpoint
-- A preview creates at most one draft, once.
CREATE TRIGGER assistant_requests_run_once
BEFORE UPDATE OF run_id ON assistant_requests
WHEN OLD.run_id IS NOT NULL AND OLD.run_id IS NOT NEW.run_id
BEGIN
  SELECT RAISE(ABORT, 'assistant_requests: a preview creates one draft only');
END;
