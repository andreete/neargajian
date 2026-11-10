CREATE TABLE `identity_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`at` integer NOT NULL,
	`source` text NOT NULL,
	`dry_run` integer DEFAULT false NOT NULL,
	`outcome` text NOT NULL,
	`nik_masked` text,
	`nik_hash` text,
	`face_score` real,
	`checks` text NOT NULL,
	`reader` text,
	`face_engine` text,
	`note` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_checks_outcome_ck" CHECK(outcome IN ('verified', 'needs_review', 'failed')),
	CONSTRAINT "identity_checks_source_ck" CHECK(source IN ('upload', 'specimen', 'seed', 'manual_review'))
);
--> statement-breakpoint
CREATE INDEX `identity_checks_recipient_ix` ON `identity_checks` (`recipient_id`,`at`);--> statement-breakpoint
CREATE INDEX `identity_checks_at_ix` ON `identity_checks` (`at`);--> statement-breakpoint
ALTER TABLE `recipients` ADD `identity_status` text DEFAULT 'unverified' NOT NULL CONSTRAINT "recipients_identity_status_ck" CHECK(identity_status IN ('unverified', 'verified', 'needs_review', 'failed'));--> statement-breakpoint
ALTER TABLE `recipients` ADD `identity_checked_at` integer;--> statement-breakpoint
ALTER TABLE `recipients` ADD `identity_check_id` text;--> statement-breakpoint
ALTER TABLE `recipients` ADD `nik_masked` text;--> statement-breakpoint
ALTER TABLE `recipients` ADD `nik_hash` text;--> statement-breakpoint
CREATE INDEX `recipients_nik_hash_ix` ON `recipients` (`nik_hash`);--> statement-breakpoint
-- Hand-written (Phase 21). Identity checks are append-only: results are never edited or removed.
CREATE TRIGGER identity_checks_no_update
BEFORE UPDATE ON identity_checks
BEGIN
  SELECT RAISE(ABORT, 'identity_checks: the identity check log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER identity_checks_no_delete
BEFORE DELETE ON identity_checks
BEGIN
  SELECT RAISE(ABORT, 'identity_checks: the identity check log is append-only');
END;
--> statement-breakpoint
-- A recipient's identity status may only point at a check of that same recipient.
CREATE TRIGGER recipients_identity_check_same_recipient
BEFORE UPDATE OF identity_check_id ON recipients
WHEN NEW.identity_check_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity_checks c WHERE c.id = NEW.identity_check_id AND c.recipient_id = NEW.id AND c.dry_run = 0)
BEGIN
  SELECT RAISE(ABORT, 'recipients: identity_check_id must be a non-dry-run check of this recipient');
END;
--> statement-breakpoint
-- Rebrand GAJIAN -> SentFund: the demo sign-ins move to the new domain.
UPDATE `users` SET `email` = replace(`email`, '@gajian.my.id', '@sentfund.my.id') WHERE `email` LIKE '%@gajian.my.id';
